import { createRequire } from "node:module";
import {
  DetectFacesCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";

const require = createRequire(import.meta.url);

let client: RekognitionClient | null = null;

function getClient(): RekognitionClient {
  if (!client) {
    client = new RekognitionClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return client;
}

export function isFaceCropEnabled(): boolean {
  if (
    process.env.FACE_CROP_ENABLED === "false" ||
    process.env.FACE_CROP_ENABLED === "0"
  ) {
    return false;
  }
  return (
    (process.env.RECOGNITION_PROVIDER ?? "mock") === "aws" &&
    Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  );
}

export function getFaceCropStatus() {
  return { enabled: isFaceCropEnabled() };
}

interface PixelImage {
  width: number;
  height: number;
  data: Uint8Array;
}

function decodeJpeg(bytes: Buffer): PixelImage | null {
  try {
    const jpeg = require("jpeg-js") as {
      decode: (
        data: Buffer,
        opts?: { useTArray?: boolean; maxMemoryUsageInMB?: number }
      ) => PixelImage;
    };
    return jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 48 });
  } catch {
    return null;
  }
}

function encodeJpeg(image: PixelImage, quality = 90): string | null {
  try {
    const jpeg = require("jpeg-js") as {
      encode: (
        img: { data: Uint8Array; width: number; height: number },
        quality: number
      ) => { data: Buffer };
    };
    const encoded = jpeg.encode(
      { data: image.data, width: image.width, height: image.height },
      quality
    );
    return encoded.data.toString("base64");
  } catch {
    return null;
  }
}

function cropRgba(
  image: PixelImage,
  left: number,
  top: number,
  size: number
): PixelImage {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(left)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(top)));
  const side = Math.max(
    16,
    Math.min(size, image.width - x0, image.height - y0)
  );
  const data = new Uint8Array(side * side * 4);

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const src = ((y0 + y) * image.width + (x0 + x)) * 4;
      const dst = (y * side + x) * 4;
      data[dst] = image.data[src];
      data[dst + 1] = image.data[src + 1];
      data[dst + 2] = image.data[src + 2];
      data[dst + 3] = image.data[src + 3] ?? 255;
    }
  }

  return { width: side, height: side, data };
}

function paddedSquare(
  box: { left: number; top: number; width: number; height: number },
  imgW: number,
  imgH: number,
  pad = 0.55
): { left: number; top: number; size: number } {
  const cx = (box.left + box.width / 2) * imgW;
  const cy = (box.top + box.height / 2) * imgH;
  const face = Math.max(box.width * imgW, box.height * imgH);
  let size = face * (1 + pad * 2);
  size = Math.min(size, imgW, imgH);
  let left = cx - size / 2;
  let top = cy - size / 2;
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + size > imgW) left = imgW - size;
  if (top + size > imgH) top = imgH - size;
  return { left, top, size };
}

export interface FaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PreparedFaceImage {
  imageBase64: string;
  facesFound: number;
  cropped: boolean;
}

/**
 * Detect faces (normalized 0–1 boxes), largest first.
 * Uses AWS when credentials are present (even if FACE_CROP_ENABLED is false).
 */
export async function detectFaces(imageBase64: string): Promise<FaceBox[]> {
  const canDetect =
    (process.env.RECOGNITION_PROVIDER ?? "mock") === "aws" &&
    Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  if (!canDetect) return [];

  const imageBytes = Buffer.from(imageBase64, "base64");

  try {
    const response = await getClient().send(
      new DetectFacesCommand({
        Image: { Bytes: imageBytes },
        Attributes: ["DEFAULT"],
      })
    );

    return (response.FaceDetails ?? [])
      .filter((face) => (face.Confidence ?? 0) >= 80 && face.BoundingBox)
      .map((face) => ({
        left: face.BoundingBox!.Left ?? 0,
        top: face.BoundingBox!.Top ?? 0,
        width: face.BoundingBox!.Width ?? 0,
        height: face.BoundingBox!.Height ?? 0,
      }))
      .filter((box) => box.width * box.height >= 0.004)
      .sort((a, b) => b.width * b.height - a.width * a.height);
  } catch (err) {
    console.warn(
      "Face detect skipped:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Detect faces and auto-crop around one of them before celebrity/collection search.
 * `faceIndex` selects which detected face (0 = largest). Fail-open to original.
 */
export async function prepareFaceImage(
  imageBase64: string,
  faceIndex = 0
): Promise<PreparedFaceImage> {
  const original: PreparedFaceImage = {
    imageBase64,
    facesFound: -1,
    cropped: false,
  };

  if (!isFaceCropEnabled()) return original;

  try {
    const faces = await detectFaces(imageBase64);

    if (faces.length === 0) {
      return { imageBase64, facesFound: 0, cropped: false };
    }

    const index = Math.max(0, Math.min(faceIndex, faces.length - 1));
    const imageBytes = Buffer.from(imageBase64, "base64");
    const decoded = decodeJpeg(imageBytes);
    if (!decoded) {
      return { imageBase64, facesFound: faces.length, cropped: false };
    }

    const crop = paddedSquare(faces[index], decoded.width, decoded.height);
    const cropped = cropRgba(decoded, crop.left, crop.top, crop.size);
    const encoded = encodeJpeg(cropped);
    if (!encoded) {
      return { imageBase64, facesFound: faces.length, cropped: false };
    }

    return { imageBase64: encoded, facesFound: faces.length, cropped: true };
  } catch (err) {
    console.warn(
      "Face detect/crop skipped:",
      err instanceof Error ? err.message : err
    );
    return original;
  }
}
