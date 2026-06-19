import { Router } from "express";
import {
  loadMatchFilterConfig,
  pickConfidentMatch,
  type RejectReason,
} from "../services/matchFilter.js";
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
 * Returns at most one result — prefers no answer over a wrong guess.
 */
identifyRouter.post("/", async (req, res) => {
  try {
    const parsed = parseImagePayload(req.body?.image);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const lang = typeof req.body?.lang === "string" ? req.body.lang : "en";
    const filterConfig = loadMatchFilterConfig();

    const matches = await getProvider().recognize(parsed.base64);
    const { match, reason } = pickConfidentMatch(matches, filterConfig);

    if (!match) {
      res.json({
        results: [],
        rejectReason: reason,
        allMatches: matches,
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: process.env.RECOGNITION_PROVIDER ?? "mock",
      });
      return;
    }

    const wiki = await findWikipediaPage(match.name, lang);
    if (!wiki) {
      res.json({
        results: [],
        rejectReason: "no_wiki",
        allMatches: matches,
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: process.env.RECOGNITION_PROVIDER ?? "mock",
      });
      return;
    }

    res.json({
      results: [{ ...match, wikipedia: wiki }],
      rejectReason: null,
      allMatches: matches,
      minConfidence: filterConfig.minConfidence,
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
