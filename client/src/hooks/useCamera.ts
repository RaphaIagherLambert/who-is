import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_CONSTRAINTS: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      // Higher FPS helps catch a sharp frame while the on-screen face moves.
      frameRate: { ideal: 30, min: 15 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  },
  { video: true, audio: false },
];

/** Higher JPEG quality helps AWS on phone→screen photos. */
const JPEG_QUALITY = 0.97;

/** In-app digital zoom (sofa → TV). Preview and capture share this crop. */
export const DIGITAL_ZOOM_MIN = 1;
export const DIGITAL_ZOOM_MAX = 4;
export const DIGITAL_ZOOM_STEP = 0.25;

function clampZoom(value: number): number {
  return Math.min(DIGITAL_ZOOM_MAX, Math.max(DIGITAL_ZOOM_MIN, value));
}

function snapZoom(value: number): number {
  return clampZoom(
    Math.round(value / DIGITAL_ZOOM_STEP) * DIGITAL_ZOOM_STEP
  );
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zoomRef = useRef(DIGITAL_ZOOM_MIN);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);
  const [zoom, setZoomState] = useState(DIGITAL_ZOOM_MIN);

  const setZoom = useCallback((value: number) => {
    const next = clampZoom(value);
    zoomRef.current = next;
    setZoomState(next);
  }, []);

  const zoomIn = useCallback(() => {
    setZoom(snapZoom(zoomRef.current + DIGITAL_ZOOM_STEP));
  }, [setZoom]);

  const zoomOut = useCallback(() => {
    setZoom(snapZoom(zoomRef.current - DIGITAL_ZOOM_STEP));
  }, [setZoom]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    zoomRef.current = DIGITAL_ZOOM_MIN;
    setZoomState(DIGITAL_ZOOM_MIN);
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

      // User digital zoom (what they see in the viewfinder). Alternate frames
      // add a little extra crop for multi-scale matching.
      const userZoom = Math.max(DIGITAL_ZOOM_MIN, zoomRef.current);
      const factor = mode === "zoom" ? userZoom * 1.25 : userZoom;
      const sw = vw / factor;
      const sh = vh / factor;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      ctx.filter =
        mode === "zoom"
          ? "contrast(1.06) saturate(1.05)"
          : "contrast(1.04)";
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";

      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    },
    []
  );

  const captureFrame = useCallback((): string | null => {
    return encodeFrame("full");
  }, [encodeFrame]);

  /** Wait for the next camera frame when the browser supports it. */
  const waitNextFrame = useCallback(async (fallbackMs: number) => {
    const video = videoRef.current as
      | (HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        })
      | null;
    if (video?.requestVideoFrameCallback) {
      await new Promise<void>((resolve) => {
        video.requestVideoFrameCallback!(() => resolve());
      });
      if (fallbackMs > 0) await wait(fallbackMs);
      return;
    }
    await wait(Math.max(fallbackMs, 16));
  }, []);

  /**
   * Dense burst: alternate full / zoom crops, synced to camera frames when possible.
   * Caller should pick the sharpest subset before calling AWS.
   */
  const captureBurst = useCallback(
    async (count = 10, intervalMs = 70): Promise<string[]> => {
      const frames: string[] = [];
      for (let i = 0; i < count; i++) {
        const mode = i % 2 === 0 ? "full" : "zoom";
        const frame = encodeFrame(mode);
        if (frame) frames.push(frame);
        if (i < count - 1) await waitNextFrame(intervalMs);
      }
      return frames;
    },
    [encodeFrame, waitNextFrame]
  );

  return {
    videoRef,
    canvasRef,
    error,
    ready,
    starting,
    active,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    startCamera,
    stopCamera,
    captureFrame,
    captureBurst,
  };
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
