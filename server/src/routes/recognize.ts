import { Router } from "express";
import { createRecognitionProvider } from "../services/providerFactory.js";
import { parseImagePayload } from "../utils/imagePayload.js";

export const recognizeRouter = Router();

let provider: ReturnType<typeof createRecognitionProvider> | null = null;

function getProvider() {
  if (!provider) {
    provider = createRecognitionProvider();
  }
  return provider;
}

recognizeRouter.get("/status", (_req, res) => {
  const configured = process.env.RECOGNITION_PROVIDER ?? "mock";
  res.json({
    provider: configured,
    minConfidence: Number(process.env.MIN_CONFIDENCE) || 85,
    ready: true,
  });
});

recognizeRouter.post("/", async (req, res) => {
  try {
    const parsed = parseImagePayload(req.body?.image);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const matches = await getProvider().recognize(parsed.base64);
    const minConfidence = Number(process.env.MIN_CONFIDENCE) || 85;
    const filtered = matches.filter((m) => m.confidence >= minConfidence);

    res.json({
      matches: filtered,
      allMatches: matches,
      minConfidence,
      provider: process.env.RECOGNITION_PROVIDER ?? "mock",
    });
  } catch (err) {
    console.error("Recognition error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Recognition failed",
    });
  }
});
