import { Router } from "express";
import { searchTeachingFace } from "../services/customCollection.js";
import {
  loadMatchFilterConfig,
  pickConfidentMatch,
} from "../services/matchFilter.js";
import { createRecognitionProvider } from "../services/providerFactory.js";
import { getTeachingById } from "../services/teachingsStore.js";
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
 * Single call: search learned faces, then celebrities, then Wikipedia.
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
    const providerName = process.env.RECOGNITION_PROVIDER ?? "mock";

    const customMatch = await searchTeachingFace(parsed.base64);
    if (customMatch) {
      const teaching = await getTeachingById(customMatch.externalId);
      if (teaching) {
        res.json({
          results: [
            {
              name: teaching.name,
              confidence: customMatch.similarity,
              wikipedia: teaching.wikipedia,
              source: "learned",
            },
          ],
          rejectReason: null,
          allMatches: [],
          minConfidence: filterConfig.minConfidence,
          lang,
          provider: providerName,
        });
        return;
      }
    }

    const matches = await getProvider().recognize(parsed.base64);
    const { match, reason } = pickConfidentMatch(matches, filterConfig);

    if (!match) {
      res.json({
        results: [],
        rejectReason: reason,
        allMatches: matches,
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: providerName,
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
        provider: providerName,
      });
      return;
    }

    res.json({
      results: [{ ...match, wikipedia: wiki, source: "celebrity" }],
      rejectReason: null,
      allMatches: matches,
      minConfidence: filterConfig.minConfidence,
      lang,
      provider: providerName,
    });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Identification failed",
    });
  }
});
