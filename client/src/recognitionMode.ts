export type RecognitionMode = "strict" | "curious";

const STORAGE_KEY = "whois-recognition-mode";

export function getRecognitionMode(): RecognitionMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "curious" ? "curious" : "strict";
  } catch {
    return "strict";
  }
}

export function saveRecognitionMode(mode: RecognitionMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
