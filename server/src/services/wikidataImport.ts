export interface WikidataImportRow {
  id: string;
  name: string;
  imageUrl: string;
  /** Up to a few Commons images (P18) for multi-face indexing. */
  imageUrls: string[];
  articleUrl?: string;
}

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "WhoIsApp/1.0 (public-figure-spotter; educational face index)";
const SPARQL_TIMEOUT_MS = 90_000;
const SPARQL_MAX_RETRIES = 6;

interface SparqlBinding {
  person?: { value: string };
  personLabel?: { value: string };
  image?: { value: string };
}

function extractQid(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? uri;
}

function qidToNumber(id: string): number {
  const n = Number(id.replace(/^Q/, ""));
  return Number.isFinite(n) ? n : 0;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEuropeanCitizenshipClause(): string {
  return `
  ?person wdt:P27 ?country .
  ?country wdt:P30 wd:Q46 .
  FILTER(?country != wd:Q30)`;
}

function buildEuActorsQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P106 wd:Q33999 ;
          wdt:P18 ?image .${buildEuropeanCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`;
}

function buildEuMusiciansQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  VALUES ?occupation { wd:Q177220 wd:Q639669 wd:Q753110 }
  ?person wdt:P106 ?occupation ;
          wdt:P18 ?image .${buildEuropeanCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`;
}

function buildBrCitizenshipClause(): string {
  return `
  ?person wdt:P27 wd:Q155 .`;
}

function buildBrActorsQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P106 wd:Q33999 ;
          wdt:P18 ?image .${buildBrCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pt". }
}
LIMIT ${limit}
`;
}

function buildBrMusiciansQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  VALUES ?occupation { wd:Q177220 wd:Q639669 wd:Q753110 }
  ?person wdt:P106 ?occupation ;
          wdt:P18 ?image .${buildBrCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pt". }
}
LIMIT ${limit}
`;
}

function buildLatamCitizenshipClause(): string {
  return `
  VALUES ?country {
    wd:Q414 wd:Q298 wd:Q739 wd:Q419 wd:Q717 wd:Q77 wd:Q733 wd:Q750 wd:Q736 wd:Q96
  }
  ?person wdt:P27 ?country .`;
}

function buildLatamActorsQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P106 wd:Q33999 ;
          wdt:P18 ?image .${buildLatamCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,pt". }
}
LIMIT ${limit}
`;
}

function buildLatamMusiciansQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  VALUES ?occupation { wd:Q177220 wd:Q639669 wd:Q753110 }
  ?person wdt:P106 ?occupation ;
          wdt:P18 ?image .${buildLatamCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,pt". }
}
LIMIT ${limit}
`;
}

function buildAsiaCitizenshipClause(): string {
  return `
  ?person wdt:P27 ?country .
  ?country wdt:P30 wd:Q48 .
  FILTER(?country != wd:Q30)`;
}

function buildAsiaActorsQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P106 wd:Q33999 ;
          wdt:P18 ?image .${buildAsiaCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja,zh,ko,hi". }
}
LIMIT ${limit}
`;
}

function buildAsiaMusiciansQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  VALUES ?occupation { wd:Q177220 wd:Q639669 wd:Q753110 }
  ?person wdt:P106 ?occupation ;
          wdt:P18 ?image .${buildAsiaCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja,zh,ko,hi". }
}
LIMIT ${limit}
`;
}

function buildInfluencerOccupationClause(): string {
  return `
  VALUES ?occupation { wd:Q2906862 wd:Q512030 wd:Q2066131 }
  ?person wdt:P106 ?occupation .`;
}

function buildUsInfluencersQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P27 wd:Q30 ;
          wdt:P18 ?image .${buildInfluencerOccupationClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`;
}

function buildEuInfluencersQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P18 ?image .${buildInfluencerOccupationClause()}${buildEuropeanCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`;
}

function buildBrInfluencersQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P18 ?image .${buildInfluencerOccupationClause()}${buildBrCitizenshipClause()}${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pt". }
}
LIMIT ${limit}
`;
}

function buildUsActorsQuery(afterQid: string | null, limit: number): string {
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P27 wd:Q30 ;
          wdt:P106 wd:Q33999 ;
          wdt:P18 ?image .${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`;
}

function parseSparqlBindings(bindings: SparqlBinding[]): WikidataImportRow[] {
  const seen = new Set<string>();
  const rows: WikidataImportRow[] = [];

  for (const binding of bindings) {
    const personUri = binding.person?.value;
    const imageUrl = binding.image?.value;
    if (!personUri || !imageUrl) continue;

    const id = extractQid(personUri);
    if (seen.has(id)) continue;
    seen.add(id);

    const label = binding.personLabel?.value ?? id;
    if (label === id || label.endsWith(` (${id})`)) continue;

    rows.push({
      id,
      name: label,
      imageUrl: normalizeCommonsImageUrl(imageUrl),
      imageUrls: [normalizeCommonsImageUrl(imageUrl)],
    });
  }

  rows.sort((a, b) => qidToNumber(a.id) - qidToNumber(b.id));
  return rows;
}

async function fetchSparqlJson(query: string): Promise<SparqlBinding[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < SPARQL_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = 3000 * 2 ** (attempt - 1);
      console.warn(`Wikidata busy — retry ${attempt}/${SPARQL_MAX_RETRIES - 1} in ${waitMs}ms…`);
      await sleep(waitMs);
    }

    try {
      const res = await fetch(SPARQL_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(SPARQL_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < SPARQL_MAX_RETRIES - 1) {
          lastError = new Error(`Wikidata SPARQL failed: ${res.status} ${res.statusText}`);
          continue;
        }
        throw new Error(`Wikidata SPARQL failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as {
        results?: { bindings?: SparqlBinding[] };
      };
      return data.results?.bindings ?? [];
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= SPARQL_MAX_RETRIES - 1) break;
    }
  }

  throw lastError ?? new Error("Wikidata SPARQL failed");
}

export async function fetchUsInfluencersBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildUsInfluencersQuery(afterQid, safeLimit))
  );
}

export async function fetchEuInfluencersBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildEuInfluencersQuery(afterQid, safeLimit))
  );
}

export async function fetchBrInfluencersBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildBrInfluencersQuery(afterQid, safeLimit))
  );
}

export async function fetchUsMusiciansBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  const cursor = afterQid
    ? `\n  FILTER(STR(?person) > "http://www.wikidata.org/entity/${afterQid}")`
    : "";

  const query = `
SELECT ?person ?personLabel ?image WHERE {
  VALUES ?occupation { wd:Q177220 wd:Q639669 wd:Q753110 }
  ?person wdt:P27 wd:Q30 ;
          wdt:P106 ?occupation ;
          wdt:P18 ?image .${cursor}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${safeLimit}
`;

  return parseSparqlBindings(await fetchSparqlJson(query));
}

export async function fetchUsActorsBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildUsActorsQuery(afterQid, safeLimit))
  );
}

export async function fetchAsiaMusiciansBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildAsiaMusiciansQuery(afterQid, safeLimit))
  );
}

export async function fetchAsiaActorsBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildAsiaActorsQuery(afterQid, safeLimit))
  );
}

export async function fetchLatamMusiciansBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildLatamMusiciansQuery(afterQid, safeLimit))
  );
}

export async function fetchLatamActorsBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildLatamActorsQuery(afterQid, safeLimit))
  );
}

export async function fetchBrMusiciansBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildBrMusiciansQuery(afterQid, safeLimit))
  );
}

export async function fetchBrActorsBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildBrActorsQuery(afterQid, safeLimit))
  );
}

export async function fetchEuMusiciansBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildEuMusiciansQuery(afterQid, safeLimit))
  );
}

export async function fetchEuActorsBatch(
  limit: number,
  _offset: number,
  afterQid: string | null = null
): Promise<WikidataImportRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  return parseSparqlBindings(
    await fetchSparqlJson(buildEuActorsQuery(afterQid, safeLimit))
  );
}

export function normalizeCommonsImageUrl(url: string): string {
  if (url.includes("commons.wikimedia.org") || url.includes("upload.wikimedia.org")) {
    if (url.includes("Special:FilePath/")) {
      const base = url.split("?")[0];
      return `${base}?width=800`;
    }
    return url;
  }
  return url;
}

function commonsUrlFromFilename(filename: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replace(/^File:/, ""))}?width=800`;
}

type EntityJson = {
  entities?: Record<
    string,
    {
      labels?: Record<string, { value: string }>;
      sitelinks?: Record<string, { title: string; url?: string }>;
      claims?: {
        P18?: Array<{
          mainsnak?: {
            datavalue?: { value?: string };
          };
        }>;
      };
    }
  >;
};

const WIKI_SITE_PRIORITY: Array<{ site: string; lang: string }> = [
  { site: "enwiki", lang: "en" },
  { site: "jawiki", lang: "ja" },
  { site: "zhwiki", lang: "zh" },
  { site: "kowiki", lang: "ko" },
  { site: "hiwiki", lang: "hi" },
  { site: "eswiki", lang: "es" },
  { site: "ptwiki", lang: "pt" },
];

const LABEL_LANG_PRIORITY = ["en", "ja", "zh", "ko", "hi", "es", "pt"];

/** Reliable single-person fetch — use for seed import mode. */
export async function fetchWikidataPersonForImport(
  id: string
): Promise<WikidataImportRow | null> {
  const meta = await fetchWikidataEntityMetadata(id);
  if (!meta) return null;

  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as EntityJson;
  const entity = data.entities?.[id];
  const imageClaims = entity?.claims?.P18 ?? [];

  let imageUrl: string | null = null;
  const imageUrls: string[] = [];
  for (const claim of imageClaims) {
    const filename = claim.mainsnak?.datavalue?.value;
    if (typeof filename === "string" && filename.length > 0) {
      const url = commonsUrlFromFilename(filename);
      if (!imageUrl) imageUrl = url;
      if (!imageUrls.includes(url)) imageUrls.push(url);
      if (imageUrls.length >= 3) break;
    }
  }

  if (!imageUrl || imageUrls.length === 0) return null;

  return {
    id,
    name: meta.name,
    imageUrl,
    imageUrls,
    articleUrl: meta.wikipedia.url,
  };
}

export async function fetchWikidataEntityMetadata(
  id: string
): Promise<{ name: string; wikipedia: { title: string; url: string; lang: string } } | null> {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as EntityJson;
  const entity = data.entities?.[id];
  const sitelinks = entity?.sitelinks ?? {};

  let wiki: { title: string; url?: string } | undefined;
  let lang = "en";
  for (const { site, lang: siteLang } of WIKI_SITE_PRIORITY) {
    if (sitelinks[site]?.title) {
      wiki = sitelinks[site];
      lang = siteLang;
      break;
    }
  }

  let name: string | undefined;
  for (const code of LABEL_LANG_PRIORITY) {
    const label = entity?.labels?.[code]?.value;
    if (label) {
      name = label;
      break;
    }
  }
  name ??= wiki?.title;
  if (!name || !wiki?.title) return null;

  return {
    name,
    wikipedia: {
      title: wiki.title,
      url:
        wiki.url ??
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(wiki.title.replace(/ /g, "_"))}`,
      lang,
    },
  };
}

export function pickLatestQid(ids: string[]): string | null {
  if (ids.length === 0) return null;
  return ids.reduce((best, id) =>
    qidToNumber(id) > qidToNumber(best) ? id : best
  );
}
