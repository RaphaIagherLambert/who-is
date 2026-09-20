/**
 * Identify: ensemble (collection + celebrity on crop/full), top-3 when <50%.
 */
import { Router } from "express";
import { detectFaces, prepareFaceImage } from "../services/faceCrop.js";
import { scoreImageQuality } from "../services/imageQuality.js";
import {
  decideEnsemblePresentation,
  runEnsembleRecognition,
  type EnsembleCandidate,
} from "../services/ensemble.js";
import { loadMatchFilterConfig } from "../services/matchFilter.js";
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

type ResolvedResult = {
  name: string;
  confidence: number;
  wikipedia: WikipediaPage | null;
  wikipediaAlternatives?: WikipediaPage[];
  wikipediaAmbiguous?: boolean;
  source: "wikidata" | "learned" | "celebrity" | "ensemble";
  niche?: string;
  urls?: string[];
};

async function resolveEnsembleCandidate(
  c: EnsembleCandidate,
  lang: string
): Promise<ResolvedResult | null> {
  if (c.externalId) {
    const person = await resolveCollectionMatch(c.externalId, lang);
    if (person) {
      const wiki = wikiPayload(person);
      return {
        name: person.name,
        confidence: c.confidence,
        ...wiki,
        source: person.source === "learned" ? "learned" : "ensemble",
        niche: person.niche,
        urls: c.urls,
      };
    }
  }

  // Never drop a named hit — Wikipedia can fail; still show the candidate.
  const displayName =
    c.name && !/^Q\d+$/i.test(c.name.trim()) ? c.name.trim() : null;
  if (!displayName) return null;

  const resolved = await resolvePersonWikipedia(displayName, lang);

  return {
    name: displayName,
    confidence: c.confidence,
    wikipedia: resolved.ambiguous ? null : resolved.primary,
    wikipediaAlternatives: resolved.alternatives,
    wikipediaAmbiguous: resolved.ambiguous,
    source: c.sources.includes("collection") ? "ensemble" : "celebrity",
    urls: c.urls,
  };
}

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
    const acceptMin = Number(process.env.ENSEMBLE_ACCEPT_MIN) || 50;

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

    const { candidates, celebrityRaw, usedFullFrame } =
      await runEnsembleRecognition({
        croppedBase64: prepared.imageBase64,
        fullBase64: originalBase64,
        cropped: prepared.cropped,
        provider: getProvider(),
      });

    const resolvedList: ResolvedResult[] = [];
    const seenNames = new Set<string>();

    for (const c of candidates) {
      if (resolvedList.length >= 8) break;
      const resolved = await resolveEnsembleCandidate(c, lang);
      if (!resolved) continue;
      const key = resolved.name.trim().toLowerCase();
      if (seenNames.has(key)) {
        const idx = resolvedList.findIndex(
          (r) => r.name.trim().toLowerCase() === key
        );
        if (idx >= 0) {
          const prev = resolvedList[idx];
          // Collection + celebrity agreement → boost (same person, two sources).
          const boosted = Math.min(
            100,
            Math.max(prev.confidence, resolved.confidence) + 8
          );
          resolvedList[idx] = {
            ...prev,
            confidence: boosted,
            source: "ensemble",
            wikipedia: prev.wikipedia ?? resolved.wikipedia,
            wikipediaAlternatives:
              prev.wikipediaAlternatives?.length
                ? prev.wikipediaAlternatives
                : resolved.wikipediaAlternatives,
            niche: prev.niche ?? resolved.niche,
            urls: prev.urls ?? resolved.urls,
          };
        }
        continue;
      }
      seenNames.add(key);
      resolvedList.push(resolved);
    }

    // Also attach pure celebrity names not already present (ensemble may key by id).
    for (const celeb of celebrityRaw) {
      if (resolvedList.length >= 8) break;
      const key = celeb.name.trim().toLowerCase();
      if (seenNames.has(key)) {
        const idx = resolvedList.findIndex(
          (r) => r.name.trim().toLowerCase() === key
        );
        if (idx >= 0) {
          const prev = resolvedList[idx];
          resolvedList[idx] = {
            ...prev,
            confidence: Math.min(
              100,
              Math.max(prev.confidence, celeb.confidence) + 8
            ),
            source: "ensemble",
            urls: prev.urls ?? celeb.urls,
          };
        }
        continue;
      }
      const resolved = await resolvePersonWikipedia(celeb.name, lang);
      seenNames.add(key);
      resolvedList.push({
        name: celeb.name,
        confidence: celeb.confidence,
        wikipedia: resolved.ambiguous ? null : resolved.primary,
        wikipediaAlternatives: resolved.alternatives,
        wikipediaAmbiguous: resolved.ambiguous,
        source: "celebrity",
        urls: celeb.urls,
      });
    }

    resolvedList.sort((a, b) => b.confidence - a.confidence);

    const celebrityNames = new Set(
      celebrityRaw.map((c) => c.name.trim().toLowerCase())
    );
    const collectionAccept =
      Number(process.env.MIN_FACE_SIMILARITY) || 85;

    const decision = decideEnsemblePresentation(
      resolvedList.map((r) => ({
        name: r.name,
        confidence: r.confidence,
        sources: [
          r.source === "celebrity"
            ? ("celebrity" as const)
            : ("collection" as const),
        ],
        source: r.source === "celebrity" ? "celebrity" : "ensemble",
      })),
      {
        acceptMin,
        // Collection-only: keep the strict bar; celebrity / dual-source: soft 50%.
        acceptMinFor: (c) => {
          const key = c.name.trim().toLowerCase();
          if (c.sources.includes("celebrity") || celebrityNames.has(key)) {
            return acceptMin;
          }
          return collectionAccept;
        },
        margin: filterConfig.minMargin,
        topN: 3,
      }
    );

    const results = decision.results
      .map((d) => resolvedList.find((r) => r.name === d.name))
      .filter((r): r is ResolvedResult => Boolean(r));

    if (results.length === 0) {
      const rejectReason = prepared.smallFaceOnly
        ? "small_face"
        : celebrityRaw.length === 0
          ? "no_faces"
          : "low_confidence";

      res.json({
        results: [],
        rejectReason,
        allMatches: celebrityRaw,
        minConfidence: filterConfig.minConfidence,
        lang,
        provider: `${providerName}+ensemble`,
        diagnostics: {
          facesFound: prepared.facesFound,
          cropped: prepared.cropped,
          smallFaceOnly: prepared.smallFaceOnly ?? false,
          fullFrameRetry: usedFullFrame,
          stage: "ensemble_empty",
          topConfidence: celebrityRaw[0]?.confidence ?? null,
          topName: celebrityRaw[0]?.name ?? null,
        },
      });
      return;
    }

    res.json({
      results,
      rejectReason: null,
      allMatches: celebrityRaw,
      minConfidence: filterConfig.minConfidence,
      lang,
      provider: `${providerName}+ensemble`,
      needsPick: decision.needsPick,
      diagnostics: {
        facesFound: prepared.facesFound,
        cropped: prepared.cropped,
        smallFaceOnly: prepared.smallFaceOnly ?? false,
        fullFrameRetry: usedFullFrame,
        stage: decision.acceptSingle ? "ensemble_accept" : "ensemble_pick",
        topConfidence: results[0]?.confidence ?? null,
        topName: results[0]?.name ?? null,
        acceptMin,
      },
    });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Identification failed",
    });
  }
});
