import { searchFaceCollectionMatches } from "./faceCollection.js";
import type { CelebrityMatch, RecognitionProvider } from "./types.js";

export interface EnsembleCandidate {
  name: string;
  confidence: number;
  sources: Array<"collection" | "celebrity">;
  externalId?: string;
  niche?: string;
  source: "wikidata" | "learned" | "celebrity" | "ensemble";
  urls?: string[];
}

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeScore(
  existing: number | undefined,
  incoming: number,
  sameSourceBoost: boolean
): number {
  const base = Math.max(existing ?? 0, incoming);
  if (sameSourceBoost) return Math.min(100, base + 8);
  return base;
}

/**
 * Run collection + celebrity on cropped and full frames, merge into one ranked list.
 * Collection is preferred when strong; celebrity fills gaps (ensemble).
 */
export async function runEnsembleRecognition(options: {
  croppedBase64: string;
  fullBase64: string;
  cropped: boolean;
  provider: RecognitionProvider;
  collectionLimit?: number;
}): Promise<{
  candidates: EnsembleCandidate[];
  celebrityRaw: CelebrityMatch[];
  usedFullFrame: boolean;
}> {
  const { croppedBase64, fullBase64, cropped, provider } = options;
  const limit = options.collectionLimit ?? 5;

  const variants = cropped
    ? [
        { label: "crop" as const, image: croppedBase64 },
        { label: "full" as const, image: fullBase64 },
      ]
    : [{ label: "full" as const, image: fullBase64 }];

  const collectionLists = await Promise.all(
    variants.map((v) => searchFaceCollectionMatches(v.image, limit, 65))
  );
  const celebrityLists = await Promise.all(
    variants.map((v) => provider.recognize(v.image))
  );

  const byKey = new Map<string, EnsembleCandidate>();
  const celebrityRaw: CelebrityMatch[] = [];

  for (const list of collectionLists) {
    for (const hit of list) {
      const key = `id:${hit.externalId}`;
      const prev = byKey.get(key);
      const agreed = Boolean(prev?.sources.includes("collection"));
      byKey.set(key, {
        name: hit.externalId,
        confidence: mergeScore(prev?.confidence, hit.similarity, agreed),
        sources: agreed
          ? prev!.sources
          : [...(prev?.sources ?? []), "collection"],
        externalId: hit.externalId,
        source: "ensemble",
      });
    }
  }

  for (const list of celebrityLists) {
    for (const face of list) {
      celebrityRaw.push(face);
      const key = `name:${normName(face.name)}`;
      const prev = byKey.get(key);
      const agreed =
        Boolean(prev?.sources.includes("celebrity")) ||
        Boolean(prev?.sources.includes("collection"));
      byKey.set(key, {
        name: face.name,
        confidence: mergeScore(prev?.confidence, face.confidence, agreed),
        sources: [
          ...new Set([...(prev?.sources ?? []), "celebrity" as const]),
        ],
        source: prev?.externalId ? "ensemble" : "celebrity",
        externalId: prev?.externalId,
        urls: face.urls ?? prev?.urls,
      });
    }
  }

  const candidates = [...byKey.values()].sort(
    (a, b) => b.confidence - a.confidence
  );

  return {
    candidates,
    celebrityRaw: celebrityRaw
      .sort((a, b) => b.confidence - a.confidence)
      .filter(
        (c, i, arr) =>
          arr.findIndex((x) => normName(x.name) === normName(c.name)) === i
      ),
    usedFullFrame: cropped,
  };
}

/**
 * Confidence bands:
 * - > soleMin with clear lead → single answer
 * - > soleMin but close race → top-N picker (scores may be above soleMin)
 * - pickMin..soleMin → top-N picker (only candidates in that band)
 * - < pickMin → empty (caller explains why)
 */
export function decideEnsemblePresentation(
  ranked: EnsembleCandidate[],
  opts?: {
    /** Sole answer requires confidence strictly above this (default 70). */
    soleMin?: number;
    /** Soft picker floor inclusive (default 50). */
    pickMin?: number;
    margin?: number;
    topN?: number;
  }
): {
  results: EnsembleCandidate[];
  needsPick: boolean;
  acceptSingle: boolean;
} {
  const soleMin = opts?.soleMin ?? 70;
  const pickMin = opts?.pickMin ?? 50;
  const margin = opts?.margin ?? 8;
  const topN = opts?.topN ?? 3;

  const eligible = ranked.filter((c) => c.confidence >= pickMin);
  if (eligible.length === 0) {
    return { results: [], needsPick: false, acceptSingle: false };
  }

  const best = eligible[0];
  const second = eligible[1];

  if (best.confidence > soleMin) {
    const clearLead =
      !second || best.confidence - second.confidence >= margin;
    if (clearLead) {
      return { results: [best], needsPick: false, acceptSingle: true };
    }
    // Close race above sole bar — still offer alternatives.
    return {
      results: eligible.slice(0, topN),
      needsPick: true,
      acceptSingle: false,
    };
  }

  // Soft band [pickMin, soleMin]: picker only, never sole lock.
  const soft = eligible
    .filter((c) => c.confidence <= soleMin)
    .slice(0, topN);

  return {
    results: soft,
    needsPick: soft.length > 0,
    acceptSingle: false,
  };
}
