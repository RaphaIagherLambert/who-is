/** Relative crop: zoom + pan of the image behind a centered square viewport. */
export interface CropTransform {
  /** Zoom factor (≥ 1). */
  scale: number;
  /** Pan as fraction of image size (-0.5 … 0.5). */
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_CROP: CropTransform = {
  scale: 1.15,
  offsetX: 0,
  offsetY: 0,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/**
 * Crop a centered square from the image using pan/zoom, return JPEG data URL.
 */
export async function applyCropToDataUrl(
  sourceDataUrl: string,
  transform: CropTransform,
  outputSize = 720
): Promise<string> {
  const img = await loadImage(sourceDataUrl);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w < 8 || h < 8) return sourceDataUrl;

  const scale = Math.max(1, transform.scale);
  const baseSide = Math.min(w, h) / scale;
  const cx = w / 2 + transform.offsetX * w;
  const cy = h / 2 + transform.offsetY * h;

  let left = cx - baseSide / 2;
  let top = cy - baseSide / 2;
  left = Math.max(0, Math.min(left, w - baseSide));
  top = Math.max(0, Math.min(top, h - baseSide));

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;

  ctx.drawImage(img, left, top, baseSide, baseSide, 0, 0, outputSize, outputSize);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function applyCropToFrames(
  frames: string[],
  transform: CropTransform
): Promise<string[]> {
  const out: string[] = [];
  for (const frame of frames) {
    out.push(await applyCropToDataUrl(frame, transform));
  }
  return out;
}
