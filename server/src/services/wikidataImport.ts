export interface WikidataImportRow {
  id: string;
  name: string;
  imageUrl: string;
  articleUrl: string;
}

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "WhoIsApp/1.0 (public-figure-spotter; educational face index)";

const US_ACTORS_QUERY = `
SELECT ?person ?personLabel ?image ?article WHERE {
  ?person wdt:P27 wd:Q30 ;
          wdt:P106 wd:Q33999 ;
          wdt:P18 ?image .
  ?article schema:about ?person ;
           schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?person
`;

interface SparqlBinding {
  person?: { value: string };
  personLabel?: { value: string };
  image?: { value: string };
  article?: { value: string };
}

function extractQid(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? uri;
}

function articleTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
    return segment.replace(/_/g, " ");
  } catch {
    return url;
  }
}

export async function fetchUsActorsBatch(
  limit: number,
  offset: number
): Promise<WikidataImportRow[]> {
  const query = `${US_ACTORS_QUERY}\nLIMIT ${limit}\nOFFSET ${offset}`;

  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query }),
  });

  if (!res.ok) {
    throw new Error(`Wikidata SPARQL failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    results?: { bindings?: SparqlBinding[] };
  };

  const seen = new Set<string>();
  const rows: WikidataImportRow[] = [];

  for (const binding of data.results?.bindings ?? []) {
    const personUri = binding.person?.value;
    const imageUrl = binding.image?.value;
    const articleUrl = binding.article?.value;
    if (!personUri || !imageUrl || !articleUrl) continue;

    const id = extractQid(personUri);
    if (seen.has(id)) continue;
    seen.add(id);

    const label = binding.personLabel?.value ?? articleTitleFromUrl(articleUrl);
    if (label.endsWith(` (${id})`)) {
      // Wikidata label fallback when no label
      continue;
    }

    rows.push({
      id,
      name: label,
      imageUrl: normalizeCommonsImageUrl(imageUrl),
      articleUrl,
    });
  }

  return rows;
}

export function normalizeCommonsImageUrl(url: string): string {
  if (url.includes("commons.wikimedia.org/wiki/Special:FilePath/")) {
    const base = url.split("?")[0];
    return `${base}?width=800`;
  }
  return url;
}

export function toWikipediaPage(row: WikidataImportRow) {
  return {
    title: articleTitleFromUrl(row.articleUrl),
    url: row.articleUrl,
    lang: "en",
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWikidataEntityMetadata(
  id: string
): Promise<{ name: string; wikipedia: { title: string; url: string; lang: string } } | null> {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    entities?: Record<
      string,
      {
        labels?: { en?: { value: string } };
        sitelinks?: { enwiki?: { title: string; url?: string } };
      }
    >;
  };

  const entity = data.entities?.[id];
  const enwiki = entity?.sitelinks?.enwiki;
  const name = entity?.labels?.en?.value ?? enwiki?.title;
  if (!name || !enwiki?.title) return null;

  return {
    name,
    wikipedia: {
      title: enwiki.title,
      url:
        enwiki.url ??
        `https://en.wikipedia.org/wiki/${encodeURIComponent(enwiki.title.replace(/ /g, "_"))}`,
      lang: "en",
    },
  };
}
