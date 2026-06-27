import { Router } from "express";
import { searchFaceCollection } from "../services/faceCollection.js";
import {
  loadMatchFilterConfig,
  pickConfidentMatch,
} from "../services/matchFilter.js";
import { createRecognitionProvider } from "../services/providerFactory.js";
import { fetchWikidataEntityMetadata } from "../services/wikidataImport.js";
import { getWikidataPersonById } from "../services/wikidataStore.js";
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

async function resolveCollectionMatch(externalId: string, lang: string) {
  const wikidata = await getWikidataPersonById(externalId);
  if (wikidata) {
    return {
      name: wikidata.name,
      wikipedia: wikidata.wikipedia,
      source: "wikidata" as const,
    };
  }

  if (/^Q\d+$/.test(externalId)) {
    const live = await fetchWikidataEntityMetadata(externalId);
    if (live) {
      const localized =
        lang.startsWith("pt") && live.wikipedia.lang === "en"
          ? (await findWikipediaPage(live.name, "pt")) ?? live.wikipedia
          : live.wikipedia;
      return {
        name: live.name,
        wikipedia: localized,
        source: "wikidata" as const,
      };
    }
  }

  const teaching = await getTeachingById(externalId);
  if (teaching) {
    return {
      name: teaching.name,
      wikipedia: teaching.wikipedia,
      source: "learned" as const,
    };
  }

  return null;
}

/**
 * Search indexed faces (Wikidata + admin teach), then AWS celebrities.
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

    const collectionMatch = await searchFaceCollection(parsed.base64);
    if (collectionMatch) {
      const person = await resolveCollectionMatch(
        collectionMatch.externalId,
        lang
      );
      if (person) {
        res.json({
          results: [
            {
              name: person.name,
              confidence: collectionMatch.similarity,
              wikipedia: person.wikipedia,
              source: person.source,
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
