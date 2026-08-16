import { createRequire } from "node:module";
import type { RejectReason } from "./matchFilter.js";

export interface PreAwsQualityConfig {
  enabled: boolean;
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
}

export interface ImageQualityScore {
  ok: boolean;
  reason: RejectReason | null;
  sharpness: number;
  brightness: number;
}

const require = createRequire(import.meta.url);
const TARGET_WIDTH = 160;

export function loadPreAwsQualityConfig(): PreAwsQualityConfig {
  const disabled =
    process.env.PRE_AWS_QUALITY_ENABLED === "false" ||
    process.env.PRE_AWS_QUALITY_ENABLED === "0";

  return {
    enabled: !disabled,
    // Laplacian variance on a ~160px grayscale. Conservative for TV/video frames.
    minSharpness: Number(process.env.PRE_AWS_MIN_SHARPNESS) || 12,
    minBrightness: Number(process.env.PRE_AWS_MIN_BRIGHTNESS) || 10,
    maxBrightness: Number(process.env.PRE_AWS_MAX_BRIGHTNESS) || 250,
  };
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function decodeJpeg(
  bytes: Buffer
): { width: number; height: number; data: Uint8Array } | null {
  try {
    const jpeg = require("jpeg-js") as {
      decode: (
        data: Buffer,
        opts?: { useTArray?: boolean; maxMemoryUsageInMB?: number }
      ) => { width: number; height: number; data: Uint8Array };
    };
    return jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 32 });
  } catch {
    return null;
  }
}

function downscaleGray(
  width: number,
  height: number,
  rgba: Uint8Array
): { gray: Uint8Array; width: number; height: number } {
  const scale = Math.max(1, Math.round(width / TARGET_WIDTH));
  const w = Math.max(1, Math.floor(width / scale));
  const h = Math.max(1, Math.floor(height / scale));
  const gray = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, x * scale);
      const sy = Math.min(height - 1, y * scale);
      const i = (sy * width + sx) * 4;
      gray[y * w + x] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    }
  }

  return { gray, width: w, height: h };
}

function mean(values: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length === 0 ? 0 : sum / values.length;
}

/** Variance of a 4-neighbor Laplacian — higher = sharper. */
function laplacianVariance(
  gray: Uint8Array,
  width: number,
  height: number
): number {
  if (width < 3 || height < 3) return 0;

  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v =
        gray[i - width] +
        gray[i - 1] +
        gray[i + 1] +
        gray[i + width] -
        4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }

  if (n === 0) return 0;
  const avg = sum / n;
  return sumSq / n - avg * avg;
}

/**
 * Cheap local quality gate before AWS. Fail-open if the image cannot be
 * decoded (PNG/WebP uploads, or jpeg-js not installed yet).
 */
export function scoreImageQuality(
  imageBase64: string,
  config: PreAwsQualityConfig = loadPreAwsQualityConfig()
): ImageQualityScore {
  const pass: ImageQualityScore = {
    ok: true,
    reason: null,
    sharpness: 0,
    brightness: 0,
  };

  if (!config.enabled) return pass;

  try {
    const bytes = Buffer.from(imageBase64, "base64");
    if (!isJpeg(bytes)) return pass;

    const decoded = decodeJpeg(bytes);
    if (!decoded) return pass;

    if (decoded.width < 16 || decoded.height < 16) {
      return { ok: false, reason: "poor_quality", sharpness: 0, brightness: 0 };
    }

    const { gray, width, height } = downscaleGray(
      decoded.width,
      decoded.height,
      decoded.data
    );
    const brightness = mean(gray);
    const sharpness = laplacianVariance(gray, width, height);

    if (brightness < config.minBrightness || brightness > config.maxBrightness) {
      return { ok: false, reason: "poor_quality", sharpness, brightness };
    }

    if (sharpness < config.minSharpness) {
      return { ok: false, reason: "poor_quality", sharpness, brightness };
    }

    return { ok: true, reason: null, sharpness, brightness };
  } catch {
    return pass;
  }
}
