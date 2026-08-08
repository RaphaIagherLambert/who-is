export interface CelebrityMatch {
  name: string;
  confidence: number;
  boundingBox?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  urls?: string[];
}

export interface WikipediaPage {
  title: string;
  url: string;
  lang: string;
  description?: string;
  thumbnail?: string;
}

export interface IdentifyResult extends CelebrityMatch {
  wikipedia: WikipediaPage | null;
  wikipediaAlternatives?: WikipediaPage[];
  wikipediaAmbiguous?: boolean;
  source?: "celebrity" | "learned" | "wikidata";
  niche?: "us-actor" | "us-musician" | "us-influencer" | "eu-actor" | "eu-musician" | "eu-influencer" | "br-actor" | "br-musician" | "br-influencer" | "latam-actor" | "latam-musician" | "asia-actor" | "asia-musician";
}

export interface IdentifyResponse {
  results: IdentifyResult[];
  rejectReason:
    | "no_faces"
    | "low_confidence"
    | "ambiguous"
    | "poor_quality"
    | "bad_pose"
    | "no_wiki"
    | null;
  allMatches: CelebrityMatch[];
  minConfidence: number;
  lang: string;
  provider: string;
}

export type RejectReason = IdentifyResponse["rejectReason"];

/**
 * Try all frames and keep the strongest successful match (helps paused / moving video).
 */
export async function identifyBestFromFrames(
  frames: string[],
  lang: string,
  onAttempt?: (index: number, total: number) => void
): Promise<{
  result: IdentifyResult | null;
  rejectReason: RejectReason;
  framesTried: number;
}> {
  let lastReject: RejectReason = null;
  let best: IdentifyResult | null = null;

  for (let i = 0; i < frames.length; i++) {
    onAttempt?.(i + 1, frames.length);
    const res = await identifyImage(frames[i], lang);
    const candidate = res.results[0];
    if (candidate) {
      // Success if we have a primary page OR alternative person pages to pick from.
      const hasWiki =
        Boolean(candidate.wikipedia) ||
        (candidate.wikipediaAlternatives?.length ?? 0) > 0;
      if (hasWiki && (!best || candidate.confidence > best.confidence)) {
        best = candidate;
      }
    } else {
      lastReject = res.rejectReason;
    }
  }

  if (best) {
    return { result: best, rejectReason: null, framesTried: frames.length };
  }

  return { result: null, rejectReason: lastReject, framesTried: frames.length };
}

export async function identifyImage(
  imageBase64: string,
  lang: string
): Promise<IdentifyResponse> {
  const res = await fetch("/api/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64, lang }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Identification failed");
  }

  return res.json();
}

export function pickBestResult(results: IdentifyResult[]): IdentifyResult | null {
  if (results.length === 0) return null;
  return results.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
}

export interface WikipediaSuggestion {
  title: string;
  snippet: string;
  url: string;
  lang: string;
}

export async function lookupWikipedia(
  name: string,
  lang: string
): Promise<WikipediaPage> {
  const res = await fetch(
    `/api/wikipedia/${encodeURIComponent(name)}?lang=${encodeURIComponent(lang)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Wikipedia lookup failed");
  }
  return res.json();
}

export async function searchWikipediaSuggestions(
  query: string,
  lang: string
): Promise<WikipediaSuggestion[]> {
  const res = await fetch(
    `/api/wikipedia/search/suggestions?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}`
  );
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { suggestions: WikipediaSuggestion[] };
  return data.suggestions ?? [];
}

export async function teachPerson(
  imageBase64: string,
  name: string,
  lang: string,
  adminSecret: string,
  wikipediaUrl?: string
): Promise<{ ok: boolean; teaching: { name: string; wikipedia: WikipediaPage } }> {
  const res = await fetch("/api/teach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": adminSecret,
    },
    body: JSON.stringify({
      image: imageBase64,
      name,
      lang,
      wikipediaUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to teach person");
  }

  return res.json();
}
