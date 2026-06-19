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
