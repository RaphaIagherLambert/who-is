import { Router } from "express";
import { createRecognitionProvider } from "../services/providerFactory.js";
import { findWikipediaPage } from "../services/wikipedia.js";
import { parseImagePayload } from "../utils/imagePayload.js";

export const identifyRouter = Router();

let provider: ReturnType<typeof createRecognitionProvider> | null = null;

function getProvider() {
  if (!provider) {
    provider = createRecognitionProvider();
  }
  return provider;
}

/**
 * Single call: recognize celebrities in an image and resolve Wikipedia pages.
 */
identifyRouter.post("/", async (req, res) => {
  try {
    const parsed = parseImagePayload(req.body?.image);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const lang = typeof req.body?.lang === "string" ? req.body.lang : "en";
    const minConfidence = Number(process.env.MIN_CONFIDENCE) || 85;

    const matches = await getProvider().recognize(parsed.base64);
    const confident = matches.filter((m) => m.confidence >= minConfidence);

    const results = await Promise.all(
      confident.map(async (match) => {
        const wiki = await findWikipediaPage(match.name, lang);
        return { ...match, wikipedia: wiki };
      })
    );

    res.json({
      results,
      allMatches: matches,
      minConfidence,
      lang,
      provider: process.env.RECOGNITION_PROVIDER ?? "mock",
    });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Identification failed",
    });
  }
});
