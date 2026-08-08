import { Router } from "express";
import { searchFaceCollection } from "../services/faceCollection.js";
import {
  loadMatchFilterConfig,
  pickConfidentMatch,
} from "../services/matchFilter.js";
import { createRecognitionProvider } from "../services/providerFactory.js";
import { getWikidataPersonById } from "../services/wikidataStore.js";
import { getTeachingById } from "../services/teachingsStore.js";
import {
  resolvePersonWikipedia,
  wikipediaForWikidataId,
  type WikipediaPage,
} from "../services/wikipedia.js";
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
    const preferred = await wikipediaForWikidataId(wikidata.id, lang);
    const page = preferred?.page ?? wikidata.wikipedia;
    return {
      name: preferred?.name ?? wikidata.name,
      wikipedia: page,
      wikipediaAlternatives: [page],
      wikipediaAmbiguous: false,
      source: "wikidata" as const,
      niche: wikidata.niche,
    };
  }

  if (/^Q\d+$/.test(externalId)) {
    const preferred = await wikipediaForWikidataId(externalId, lang);
    if (preferred) {
      return {
        name: preferred.name,
        wikipedia: preferred.page,
        wikipediaAlternatives: [preferred.page],
        wikipediaAmbiguous: false,
        source: "wikidata" as const,
      };
    }
  }

  const teaching = await getTeachingById(externalId);
  if (teaching) {
    return {
      name: teaching.name,
      wikipedia: teaching.wikipedia,
      wikipediaAlternatives: [teaching.wikipedia],
      wikipediaAmbiguous: false,
      source: "learned" as const,
    };
  }

  return null;
}

function wikiPayload(wiki: {
  wikipedia: WikipediaPage | null;
  wikipediaAlternatives?: WikipediaPage[];
  wikipediaAmbiguous?: boolean;
}) {
  const alternatives = wiki.wikipediaAlternatives ?? [];
  const ambiguous = Boolean(wiki.wikipediaAmbiguous);
  return {
    wikipedia: ambiguous ? null : wiki.wikipedia,
    wikipediaAlternatives: alternatives,
    wikipediaAmbiguous: ambiguous,
  };
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
        const wiki = wikiPayload(person);
        res.json({
          results: [
            {
              name: person.name,
              confidence: collectionMatch.similarity,
              ...wiki,
              source: person.source,
              niche: person.niche,
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

    const resolved = await resolvePersonWikipedia(match.name, lang);

    if (resolved.alternatives.length === 0 && !resolved.primary) {
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
      results: [
        {
          ...match,
          wikipedia: resolved.ambiguous ? null : resolved.primary,
          wikipediaAlternatives: resolved.alternatives,
          wikipediaAmbiguous: resolved.ambiguous,
          source: "celebrity",
        },
      ],
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
