import { Router } from "express";
import { detectFaces, prepareFaceImage } from "../services/faceCrop.js";
import { searchFaceCollection } from "../services/faceCollection.js";
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

    const collectionMatch = await searchFaceCollection(imageForAws);
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
          diagnostics: {
            facesFound: prepared.facesFound,
            cropped: prepared.cropped,
            stage: "collection",
          },
        });
        return;
      }
    }

    let matches = await getProvider().recognize(imageForAws);
    let { match, reason } = pickConfidentMatch(matches, filterConfig);
    let usedFullFrameRetry = false;

    // Crop helps collection search but often hurts CelebrityFaces on screen photos.
    // If the cropped pass fails, retry the original full frame once.
    if (
      !match &&
      prepared.cropped &&
      imageForAws !== originalBase64
    ) {
      const fullMatches = await getProvider().recognize(originalBase64);
      const fullPick = pickConfidentMatch(fullMatches, filterConfig);
      usedFullFrameRetry = true;
      if (fullPick.match || (fullMatches[0]?.confidence ?? 0) > (matches[0]?.confidence ?? 0)) {
        matches = fullMatches;
        match = fullPick.match;
        reason = fullPick.reason;
      }
    }

    if (!match) {
      res.json({
        results: [],
        rejectReason: reason,
        allMatches: matches,
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: providerName,
        diagnostics: {
          facesFound: prepared.facesFound,
          cropped: prepared.cropped,
          fullFrameRetry: usedFullFrameRetry,
          stage: "celebrity",
          topConfidence: matches[0]?.confidence ?? null,
          topName: matches[0]?.name ?? null,
        },
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
