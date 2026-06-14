const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

type ParseResult =
  | { ok: true; base64: string }
  | { ok: false; error: string };

export function parseImagePayload(image: unknown): ParseResult {
  if (typeof image !== "string" || image.trim().length === 0) {
    return { ok: false, error: "Missing image (base64 data URL or raw base64)" };
  }

  const base64 = image.replace(/^data:image\/[\w+.-]+;base64,/, "").trim();

  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    return { ok: false, error: "Invalid base64 image data" };
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) {
    return { ok: false, error: "Empty image payload" };
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Image too large (${Math.round(bytes.length / 1024)} KB). Max is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    };
  }

  return { ok: true, base64 };
}
