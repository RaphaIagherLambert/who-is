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
      // Collection hits are resolved to names later; keep externalId as key until then.
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

  // If celebrity name matches a collection id entry we can't merge by name yet —
  // resolution happens in the route. Sort by confidence.
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

/** Auto-accept when best is clearly good; otherwise show top candidates. */
export function decideEnsemblePresentation(
  ranked: EnsembleCandidate[],
  opts?: {
    acceptMin?: number;
    /** Per-candidate accept floor (e.g. stricter for collection-only). */
    acceptMinFor?: (c: EnsembleCandidate) => number;
    margin?: number;
    topN?: number;
  }
): {
  results: EnsembleCandidate[];
  needsPick: boolean;
  acceptSingle: boolean;
} {
  const acceptMin = opts?.acceptMin ?? 50;
  const margin = opts?.margin ?? 4;
  const topN = opts?.topN ?? 3;

  if (ranked.length === 0) {
    return { results: [], needsPick: false, acceptSingle: false };
  }

  const top = ranked.slice(0, topN);
  const best = top[0];
  const second = top[1];
  const bestFloor = opts?.acceptMinFor?.(best) ?? acceptMin;
  const clear =
    best.confidence >= bestFloor &&
    (!second || best.confidence - second.confidence >= margin);

  if (clear) {
    return { results: [best], needsPick: false, acceptSingle: true };
  }

  // Below accept floor (or close race): never go silent — offer top 3.
  return {
    results: top,
    needsPick: top.length > 1,
    acceptSingle: false,
  };
}
