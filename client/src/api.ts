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
  source?: "celebrity" | "learned";
}

export interface IdentifyResponse {
  results: IdentifyResult[];
  rejectReason:
    | "no_faces"
    | "low_confidence"
    | "ambiguous"
    | "poor_quality"
    | "no_wiki"
    | null;
  allMatches: CelebrityMatch[];
  minConfidence: number;
  lang: string;
  provider: string;
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
