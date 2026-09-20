import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_CONSTRAINTS: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  { video: true, audio: false },
];

/** Higher JPEG quality helps AWS on phone→screen photos. */
const JPEG_QUALITY = 0.97;

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    setReady(false);
    setActive(false);
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (starting || ready) return ready;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser.");
      return false;
    }

    setStarting(true);
    setError(null);

    try {
      let stream: MediaStream | null = null;
      let lastError: unknown;

      for (const constraints of VIDEO_CONSTRAINTS) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!stream) {
        throw lastError ?? new Error("Camera unavailable");
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();
        setActive(true);
        setReady(true);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera unavailable");
      stopCamera();
      return false;
    } finally {
      setStarting(false);
    }
  }, [ready, starting, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const encodeFrame = useCallback(
    (mode: "full" | "zoom" = "full"): string | null => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return null;
      if (!video.videoWidth || !video.videoHeight) return null;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      if (mode === "zoom") {
        // ~1.35× center crop — helps small faces on TV without losing too much.
        const zoom = 1.35;
        const sw = vw / zoom;
        const sh = vh / zoom;
        const sx = (vw - sw) / 2;
        const sy = (vh - sh) / 2;
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        ctx.filter = "contrast(1.06) saturate(1.05)";
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
      } else {
        canvas.width = vw;
        canvas.height = vh;
        ctx.filter = "contrast(1.04)";
        ctx.drawImage(video, 0, 0);
        ctx.filter = "none";
      }

      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    },
    []
  );

  const captureFrame = useCallback((): string | null => {
    return encodeFrame("full");
  }, [encodeFrame]);

  /**
   * Burst alternates full-frame and zoomed center crops for multi-scale ensemble.
   */
  const captureBurst = useCallback(
    async (count = 6, intervalMs = 220): Promise<string[]> => {
      const frames: string[] = [];
      for (let i = 0; i < count; i++) {
        const mode = i % 2 === 0 ? "full" : "zoom";
        const frame = encodeFrame(mode);
        if (frame) frames.push(frame);
        if (i < count - 1) await wait(intervalMs);
      }
      return frames;
    },
    [encodeFrame]
  );

  return {
    videoRef,
    canvasRef,
    error,
    ready,
    starting,
    active,
    startCamera,
    stopCamera,
    captureFrame,
    captureBurst,
  };
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
