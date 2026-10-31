/**
 * Rank captured frames by Laplacian variance so motion-blurred TV frames
 * are dropped before we spend AWS calls on them.
 */

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

function scoreDataUrl(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 160;
      const scale = Math.max(1, Math.round(img.width / maxW));
      const w = Math.max(1, Math.floor(img.width / scale));
      const h = Math.max(1, Math.floor(img.height / scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(0);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const gray = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      }
      resolve(laplacianVariance(gray, w, h));
    };
    img.onerror = () => resolve(0);
    img.src = dataUrl;
  });
}

/** Keep the sharpest frames (order: sharpest first). Fail-open to original order. */
export async function pickSharpestFrames(
  frames: string[],
  keep: number
): Promise<string[]> {
  if (frames.length <= keep) return frames;
  const scored = await Promise.all(
    frames.map(async (frame, index) => ({
      frame,
      index,
      score: await scoreDataUrl(frame),
    }))
  );
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, keep).map((s) => s.frame);
}
