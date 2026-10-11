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
  sitelinks?: { value: string };
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
          wdt:P345 ?imdb ;
          wdt:P18 ?image ;
          wikibase:sitelinks ?sitelinks .${buildEuropeanCitizenshipClause()}
  FILTER(?sitelinks >= 10)${cursor}
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
          wdt:P18 ?image ;
          wikibase:sitelinks ?sitelinks .${buildBrCitizenshipClause()}
  FILTER(?sitelinks >= 5)${cursor}
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
  // influencer, YouTuber, TikToker
  return `
  VALUES ?occupation { wd:Q2906862 wd:Q17125263 wd:Q94791573 }
  ?person wdt:P106 ?occupation .`;
}

export type ImportRegion = "us" | "eu" | "br" | "latam";

// Kept minimal for QLever: its planner returned empty results for the EU clause
// when combined with FILTER(?country != wd:Q30), which is redundant anyway.
const REGION_CLAUSES: Record<ImportRegion, string> = {
  us: `
  ?person wdt:P27 wd:Q30 .`,
  eu: `
  ?person wdt:P27 ?country .
  ?country wdt:P30 wd:Q46 .`,
  br: buildBrCitizenshipClause(),
  latam: buildLatamCitizenshipClause(),
};

// comedian, stand-up comedian
const COMEDIAN_OCCUPATIONS = "wd:Q245068 wd:Q18545066";

// athlete, football, basketball, American football, tennis, baseball, athletics,
// swimming, volleyball, MMA, boxing, Formula One, racing driver
export const ATHLETE_OCCUPATION_IDS = [
  "Q2066131",
  "Q937857",
  "Q3665646",
  "Q19204627",
  "Q10833314",
  "Q10871364",
  "Q11513337",
  "Q10843402",
  "Q15117302",
  "Q11607585",
  "Q11338576",
  "Q10841764",
  "Q378622",
] as const;

const ATHLETE_OCCUPATIONS = ATHLETE_OCCUPATION_IDS.map((id) => `wd:${id}`).join(" ");

// Wikidata has hundreds of thousands of athletes; high sitelink floors keep imports
// to recognizable names. Comedian floors stay low so smaller TV comedians qualify.
const COMEDIAN_MIN_SITELINKS: Record<ImportRegion, number> = {
  us: 8,
  eu: 8,
  br: 3,
  latam: 4,
};

const ATHLETE_MIN_SITELINKS: Record<ImportRegion, number> = {
  us: 25,
  eu: 30,
  br: 15,
  latam: 20,
};

// Multi-country occupation queries time out on query.wikidata.org (60 s limit).
// QLever serves the same Wikidata data and answers these in about a second.
const QLEVER_ENDPOINT = "https://qlever.cs.uni-freiburg.de/api/wikidata";

const QLEVER_PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
`;

function buildRankedOccupationQuery(
  occupations: string,
  region: ImportRegion,
  offset: number,
  pageSize: number
): string {
  // QLever has no label service; names come from fetchWikidataEntityMetadata.
  // No FILTER on ?sitelinks: QLever intermittently returned zero rows with it, so the
  // minimum is applied in code while walking the descending list.
  return `${QLEVER_PREFIXES}
SELECT ?person ?image ?sitelinks WHERE {
  VALUES ?occupation { ${occupations} }
  ?person wdt:P106 ?occupation ;
          wdt:P18 ?image ;
          wikibase:sitelinks ?sitelinks .${REGION_CLAUSES[region]}
}
ORDER BY DESC(?sitelinks) ?person
LIMIT ${pageSize}
OFFSET ${offset}
`;
}

/**
 * One page of a popularity-ranked list. rawCount is the number of result rows consumed
 * (before de-duplication); 0 means the list is exhausted or fell below the minimum.
 */
export type RankedPageFetcher = (
  offset: number,
  pageSize: number
) => Promise<{ rows: WikidataImportRow[]; rawCount: number }>;

function rankedOccupationFetcher(
  occupations: string,
  region: ImportRegion,
  minSitelinks: number
): RankedPageFetcher {
  return async (offset, pageSize) => {
    const all = await fetchSparqlJson(
      buildRankedOccupationQuery(occupations, region, offset, pageSize),
      QLEVER_ENDPOINT
    );
    const belowMin = all.findIndex(
      (b) => Number(b.sitelinks?.value ?? 0) < minSitelinks
    );
    const bindings = belowMin === -1 ? all : all.slice(0, belowMin);
    const seen = new Set<string>();
    const rows: WikidataImportRow[] = [];
    for (const binding of bindings) {
      const personUri = binding.person?.value;
      const imageUrl = binding.image?.value;
      if (!personUri || !imageUrl) continue;
      const id = extractQid(personUri);
      if (seen.has(id)) continue;
      seen.add(id);
      const url = normalizeCommonsImageUrl(imageUrl);
      rows.push({ id, name: id, imageUrl: url, imageUrls: [url] });
    }
    return { rows, rawCount: bindings.length };
  };
}

export const fetchUsComediansRanked = rankedOccupationFetcher(
  COMEDIAN_OCCUPATIONS, "us", COMEDIAN_MIN_SITELINKS.us
);
export const fetchEuComediansRanked = rankedOccupationFetcher(
  COMEDIAN_OCCUPATIONS, "eu", COMEDIAN_MIN_SITELINKS.eu
);
export const fetchBrComediansRanked = rankedOccupationFetcher(
  COMEDIAN_OCCUPATIONS, "br", COMEDIAN_MIN_SITELINKS.br
);
export const fetchLatamComediansRanked = rankedOccupationFetcher(
  COMEDIAN_OCCUPATIONS, "latam", COMEDIAN_MIN_SITELINKS.latam
);
export const fetchUsAthletesRanked = rankedOccupationFetcher(
  ATHLETE_OCCUPATIONS, "us", ATHLETE_MIN_SITELINKS.us
);
export const fetchEuAthletesRanked = rankedOccupationFetcher(
  ATHLETE_OCCUPATIONS, "eu", ATHLETE_MIN_SITELINKS.eu
);
export const fetchBrAthletesRanked = rankedOccupationFetcher(
  ATHLETE_OCCUPATIONS, "br", ATHLETE_MIN_SITELINKS.br
);
export const fetchLatamAthletesRanked = rankedOccupationFetcher(
  ATHLETE_OCCUPATIONS, "latam", ATHLETE_MIN_SITELINKS.latam
);

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

  // Prefer actors with IMDb + enough Wikipedia sitelinks (more recognizable faces).
  return `
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P27 wd:Q30 ;
          wdt:P106 wd:Q33999 ;
          wdt:P345 ?imdb ;
          wdt:P18 ?image ;
          wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= 12)${cursor}
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

async function fetchSparqlJson(
  query: string,
  endpoint: string = SPARQL_ENDPOINT
): Promise<SparqlBinding[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < SPARQL_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = 3000 * 2 ** (attempt - 1);
      console.warn(`Wikidata busy — retry ${attempt}/${SPARQL_MAX_RETRIES - 1} in ${waitMs}ms…`);
      await sleep(waitMs);
    }

    try {
      const res = await fetch(endpoint, {
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
        P106?: Array<{
          rank?: "preferred" | "normal" | "deprecated";
          mainsnak?: {
            datavalue?: { value?: { id?: string } };
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

// "mul" is Wikidata's language-neutral default label; many items no longer repeat it under "en".
const LABEL_LANG_PRIORITY = ["en", "mul", "pt", "es", "ja", "zh", "ko", "hi"];

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

export async function fetchWikidataEntityMetadata(id: string): Promise<{
  name: string;
  wikipedia: { title: string; url: string; lang: string };
  /** P106 occupation QIDs, preferred rank first, then in listed order. */
  occupations: string[];
} | null> {
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

  const occupationClaims = (entity?.claims?.P106 ?? []).filter(
    (c) => c.rank !== "deprecated"
  );
  const occupations = [
    ...occupationClaims.filter((c) => c.rank === "preferred"),
    ...occupationClaims.filter((c) => c.rank !== "preferred"),
  ]
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter((qid): qid is string => Boolean(qid));

  return {
    name,
    occupations,
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
