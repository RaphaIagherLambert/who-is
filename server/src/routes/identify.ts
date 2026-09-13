import { Router } from "express";
import { detectFaces, prepareFaceImage } from "../services/faceCrop.js";
import {
  searchFaceCollectionMatches,
} from "../services/faceCollection.js";
import { scoreImageQuality } from "../services/imageQuality.js";
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
import type { CelebrityMatch } from "../services/types.js";

export const identifyRouter = Router();

/** Detect faces so the client can ask the user which person to identify. */
identifyRouter.post("/faces", async (req, res) => {
  try {
    const parsed = parseImagePayload(req.body?.image);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const faces = await detectFaces(parsed.base64);
    res.json({ faces, count: faces.length });
  } catch (err) {
    console.error("Detect faces error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Face detection failed",
    });
  }
});

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
    const faceIndex =
      typeof req.body?.faceIndex === "number" && Number.isFinite(req.body.faceIndex)
        ? Math.max(0, Math.floor(req.body.faceIndex))
        : 0;
    const filterConfig = loadMatchFilterConfig();
    const providerName = process.env.RECOGNITION_PROVIDER ?? "mock";

    const quality = scoreImageQuality(parsed.base64);
    if (!quality.ok) {
      res.json({
        results: [],
        rejectReason: quality.reason ?? "poor_quality",
        allMatches: [],
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: providerName,
        diagnostics: {
          stage: "pre_aws_quality",
          sharpness: quality.sharpness,
          brightness: quality.brightness,
        },
      });
      return;
    }

    const originalBase64 = parsed.base64;
    const prepared = await prepareFaceImage(originalBase64, faceIndex);
    // Fail-open: if DetectFaces finds nothing (common on soft TV/phone frames),
    // still try collection + celebrity on the original full frame.
    // Only hard-fail when the client explicitly picked a face index that doesn't exist.
    if (prepared.facesFound === 0 && faceIndex > 0) {
      res.json({
        results: [],
        rejectReason: "no_faces",
        allMatches: [],
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: providerName,
        diagnostics: {
          facesFound: 0,
          cropped: false,
          stage: "face_detect",
        },
      });
      return;
    }

    const imageForAws = prepared.imageBase64;
    const STRONG_COLLECTION =
      Number(process.env.STRONG_COLLECTION_SIMILARITY) || 92;
    const SOFT_CELEBRITY_MIN = Number(process.env.SOFT_CELEBRITY_MIN) || 55;

    // Primary path: custom face index (scales with Wikidata imports).
    const collectionHits = await searchFaceCollectionMatches(imageForAws, 3);
    const collectionResults: Array<{
      name: string;
      confidence: number;
      wikipedia: WikipediaPage | null;
      wikipediaAlternatives?: WikipediaPage[];
      wikipediaAmbiguous?: boolean;
      source: "wikidata" | "learned";
      niche?: string;
    }> = [];

    for (const hit of collectionHits) {
      const person = await resolveCollectionMatch(hit.externalId, lang);
      if (!person) continue;
      const wiki = wikiPayload(person);
      collectionResults.push({
        name: person.name,
        confidence: hit.similarity,
        ...wiki,
        source: person.source,
        niche: person.niche,
      });
    }

    if (collectionResults.length > 0) {
      const best = collectionResults[0];
      const runnerUp = collectionResults[1];
      const clearWinner =
        best.confidence >= STRONG_COLLECTION ||
        !runnerUp ||
        best.confidence - runnerUp.confidence >= 4;

      res.json({
        results: clearWinner ? [best] : collectionResults,
        rejectReason: null,
        allMatches: collectionResults.map((r) => ({
          name: r.name,
          confidence: r.confidence,
        })),
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: providerName,
        needsPick: !clearWinner && collectionResults.length > 1,
        diagnostics: {
          facesFound: prepared.facesFound,
          cropped: prepared.cropped,
          stage: "collection",
          collectionHits: collectionResults.length,
        },
      });
      return;
    }

    let matches = await getProvider().recognize(imageForAws);
    let { match, reason } = pickConfidentMatch(matches, filterConfig);
    let usedFullFrameRetry = false;

    if (!match && prepared.cropped && imageForAws !== originalBase64) {
      const fullMatches = await getProvider().recognize(originalBase64);
      const fullPick = pickConfidentMatch(fullMatches, filterConfig);
      usedFullFrameRetry = true;
      if (
        fullPick.match ||
        (fullMatches[0]?.confidence ?? 0) > (matches[0]?.confidence ?? 0)
      ) {
        matches = fullMatches;
        match = fullPick.match;
        reason = fullPick.reason;
      }
    }

    async function buildCelebrityResults(celebs: CelebrityMatch[], limit: number) {
      const out: Array<{
        name: string;
        confidence: number;
        wikipedia: WikipediaPage | null;
        wikipediaAlternatives?: WikipediaPage[];
        wikipediaAmbiguous?: boolean;
        source: "celebrity";
        urls?: string[];
      }> = [];

      for (const celeb of celebs.slice(0, Math.max(limit, celebs.length))) {
        if (out.length >= limit) break;
        if (out.some((r) => r.name === celeb.name)) continue;
        const resolved = await resolvePersonWikipedia(celeb.name, lang);
        if (!resolved.primary && resolved.alternatives.length === 0) continue;
        out.push({
          ...celeb,
          wikipedia: resolved.ambiguous ? null : resolved.primary,
          wikipediaAlternatives: resolved.alternatives,
          wikipediaAmbiguous: resolved.ambiguous,
          source: "celebrity",
        });
      }
      return out;
    }

    if (!match) {
      const softPool = matches.filter((m) => m.confidence >= SOFT_CELEBRITY_MIN);
      if (softPool.length > 0) {
        const softResults = await buildCelebrityResults(softPool, 3);
        if (softResults.length > 0) {
          res.json({
            results: softResults,
            rejectReason: null,
            allMatches: matches,
            minConfidence: filterConfig.minConfidence,
            lang,
            provider: providerName,
            needsPick: softResults.length > 1,
            diagnostics: {
              facesFound: prepared.facesFound,
              cropped: prepared.cropped,
              smallFaceOnly: prepared.smallFaceOnly ?? false,
              fullFrameRetry: usedFullFrameRetry,
              stage: "celebrity_soft",
              topConfidence: softResults[0]?.confidence ?? null,
              topName: softResults[0]?.name ?? null,
            },
          });
          return;
        }
      }

      const rejectReason =
        prepared.smallFaceOnly &&
        (reason === "no_faces" || reason === "low_confidence")
          ? "small_face"
          : reason;
      res.json({
        results: [],
        rejectReason,
        allMatches: matches,
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: providerName,
        diagnostics: {
          facesFound: prepared.facesFound,
          cropped: prepared.cropped,
          smallFaceOnly: prepared.smallFaceOnly ?? false,
          fullFrameRetry: usedFullFrameRetry,
          stage: "celebrity",
          topConfidence: matches[0]?.confidence ?? null,
          topName: matches[0]?.name ?? null,
        },
      });
      return;
    }

    const primaryResults = await buildCelebrityResults(
      [match, ...matches.filter((m) => m.name !== match.name)],
      3
    );

    if (primaryResults.length === 0) {
      res.json({
        results: [],
        rejectReason: "no_wiki",
        allMatches: matches,
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: providerName,
        diagnostics: {
          facesFound: prepared.facesFound,
          cropped: prepared.cropped,
          fullFrameRetry: usedFullFrameRetry,
          stage: "wikipedia",
          topConfidence: match.confidence,
          topName: match.name,
        },
      });
      return;
    }

    const needsPick =
      primaryResults.length > 1 &&
      primaryResults[0].confidence - (primaryResults[1]?.confidence ?? 0) <
        filterConfig.minMargin;

    res.json({
      results: needsPick ? primaryResults : [primaryResults[0]],
      rejectReason: null,
      allMatches: matches,
      minConfidence: filterConfig.minConfidence,
      lang,
      provider: providerName,
      needsPick,
      diagnostics: {
        facesFound: prepared.facesFound,
        cropped: prepared.cropped,
        fullFrameRetry: usedFullFrameRetry,
        stage: "celebrity",
      },
    });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Identification failed",
    });
  }
});
