export interface WikipediaPage {
  title: string;
  url: string;
  lang: string;
  description?: string;
  thumbnail?: string;
}

export interface WikipediaSuggestion {
  title: string;
  snippet: string;
  url: string;
  lang: string;
}

export interface WikipediaResolveResult {
  /** Clear primary page when we are confident. */
  primary: WikipediaPage | null;
  /** All person pages linked to this name (1+). Shown as a picker when ambiguous. */
  alternatives: WikipediaPage[];
  ambiguous: boolean;
}

const USER_AGENT =
  "WhoIsApp/1.0 (public-figure-spotter; wikipedia resolve; educational)";

const NON_PERSON_RE =
  /\b(film|movie|television series|tv series|album|song|single|novel|book|comics?|manga|anime|episode|soundtrack|disambiguation|filme|série|serie|álbum|album|canção|cancao|livro|banda sonora|programa de televisão)\b/i;

const PERSON_HINT_RE =
  /\b(actor|actress|singer|musician|rapper|drummer|guitarist|songwriter|composer|politician|footballer|soccer|athlete|model|influencer|comedian|director|producer|presenter|broadcaster|writer|author|dancer|youtuber|streamer|ator|atriz|cantor|cantora|músico|musico|político|politico|jogador|atriz|modelo|apresentador|comediante|diretor|escritor|bailarina)\b/i;

function normalizeLang(lang: string): string {
  const normalizedLang = lang.split("-")[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(normalizedLang) ? normalizedLang : "en";
}

function wikiPageUrl(title: string, lang: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function searchWikipediaSuggestions(
  query: string,
  lang: string,
  limit = 6
): Promise<WikipediaSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const safeLang = normalizeLang(lang);
  const searchUrl = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", trimmed);
  searchUrl.searchParams.set("srlimit", String(limit));
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const searchData = await fetchJson<{
    query?: { search?: Array<{ title: string; snippet?: string }> };
  }>(searchUrl.toString());
  if (!searchData) return [];

  const results = searchData.query?.search ?? [];
  if (results.length === 0 && safeLang !== "en") {
    return searchWikipediaSuggestions(query, "en", limit);
  }

  return results.map((item) => ({
    title: item.title,
    snippet: stripHtml(item.snippet ?? ""),
    url: wikiPageUrl(item.title, safeLang),
    lang: safeLang,
  }));
}

async function fetchPageSummary(
  title: string,
  lang: string
): Promise<WikipediaPage | null> {
  const safeLang = normalizeLang(lang);
  const summaryUrl = `https://${safeLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;
  const summary = await fetchJson<{
    type?: string;
    title: string;
    description?: string;
    extract?: string;
    thumbnail?: { source: string };
    content_urls?: { desktop?: { page: string } };
  }>(summaryUrl);

  if (!summary) {
    return {
      title,
      url: wikiPageUrl(title, safeLang),
      lang: safeLang,
    };
  }

  if (summary.type === "disambiguation") return null;

  return {
    title: summary.title,
    url:
      summary.content_urls?.desktop?.page ??
      wikiPageUrl(title, safeLang),
    lang: safeLang,
    description: summary.description ?? summary.extract?.slice(0, 200),
    thumbnail: summary.thumbnail?.source,
  };
}

function isLikelyNonPerson(page: WikipediaPage): boolean {
  const text = `${page.title} ${page.description ?? ""}`;
  return NON_PERSON_RE.test(text);
}

function isLikelyPerson(page: WikipediaPage): boolean {
  const text = `${page.title} ${page.description ?? ""}`;
  if (NON_PERSON_RE.test(text)) return false;
  return PERSON_HINT_RE.test(text);
}

type WikidataEntity = {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string; url?: string }>;
  claims?: {
    P31?: Array<{
      mainsnak?: { datavalue?: { value?: { id?: string } } };
    }>;
  };
};

function isHumanEntity(entity: WikidataEntity): boolean {
  const instances =
    entity.claims?.P31?.map((c) => c.mainsnak?.datavalue?.value?.id).filter(
      Boolean
    ) ?? [];
  return instances.includes("Q5");
}

function pickSitelink(
  sitelinks: Record<string, { title: string; url?: string }>,
  preferredLang: string
): { title: string; lang: string; url: string } | null {
  const skip = new Set([
    "commonswiki",
    "specieswiki",
    "wikidatawiki",
    "mediawikiwiki",
    "metawiki",
    "sourceswiki",
  ]);

  const trySite = (site: string, lang: string) => {
    const link = sitelinks[site];
    if (!link?.title) return null;
    return {
      title: link.title,
      lang,
      url:
        link.url ??
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
          link.title.replace(/ /g, "_")
        )}`,
    };
  };

  const preferred =
    trySite(`${preferredLang}wiki`, preferredLang) ??
    (preferredLang !== "en" ? trySite("enwiki", "en") : null);
  if (preferred) return preferred;

  for (const [site, link] of Object.entries(sitelinks)) {
    if (!site.endsWith("wiki") || skip.has(site) || !link?.title) continue;
    const lang = site.slice(0, -4);
    if (!/^[a-z]{2,3}$/.test(lang)) continue;
    return {
      title: link.title,
      lang,
      url:
        link.url ??
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
          link.title.replace(/ /g, "_")
        )}`,
    };
  }

  return null;
}

async function enrichPage(
  page: { title: string; lang: string; url: string },
  descriptionHint?: string
): Promise<WikipediaPage> {
  const summary = await fetchPageSummary(page.title, page.lang);
  if (summary) {
    return {
      ...summary,
      url: summary.url || page.url,
      description: summary.description ?? descriptionHint,
    };
  }
  return {
    title: page.title,
    lang: page.lang,
    url: page.url,
    description: descriptionHint,
  };
}

async function searchWikidataHumans(
  name: string,
  preferredLang: string
): Promise<WikipediaPage[]> {
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("search", name);
  searchUrl.searchParams.set("language", preferredLang);
  searchUrl.searchParams.set("uselang", preferredLang);
  searchUrl.searchParams.set("type", "item");
  searchUrl.searchParams.set("limit", "8");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const searchData = await fetchJson<{
    search?: Array<{ id: string; label?: string; description?: string }>;
  }>(searchUrl.toString());

  let hits = searchData?.search ?? [];
  if (hits.length === 0 && preferredLang !== "en") {
    const enUrl = new URL(searchUrl.toString());
    enUrl.searchParams.set("language", "en");
    enUrl.searchParams.set("uselang", "en");
    const enData = await fetchJson<{
      search?: Array<{ id: string; label?: string; description?: string }>;
    }>(enUrl.toString());
    hits = enData?.search ?? [];
  }

  const pages: WikipediaPage[] = [];
  const seenUrls = new Set<string>();

  for (const hit of hits) {
    if (hit.description && NON_PERSON_RE.test(hit.description)) continue;

    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`;
    const entityData = await fetchJson<{
      entities?: Record<string, WikidataEntity>;
    }>(entityUrl);
    const entity = entityData?.entities?.[hit.id];
    if (!entity || !isHumanEntity(entity)) continue;

    const label =
      entity.labels?.[preferredLang]?.value ??
      entity.labels?.en?.value ??
      hit.label ??
      "";
    if (label && !namesMatch(name, label) && !namesMatch(name, hit.label ?? "")) {
      // Allow close search hits from Wikidata even with parentheses titles.
      const labelCore = label.split("(")[0]?.trim() ?? label;
      if (!namesMatch(name, labelCore)) continue;
    }

    const sitelink = pickSitelink(entity.sitelinks ?? {}, preferredLang);
    if (!sitelink) continue;

    const page = await enrichPage(
      sitelink,
      hit.description ?? entity.descriptions?.[preferredLang]?.value
    );
    if (isLikelyNonPerson(page)) continue;
    if (seenUrls.has(page.url)) continue;
    seenUrls.add(page.url);
    pages.push(page);
  }

  return pages;
}

async function searchWikipediaPersonFallback(
  name: string,
  preferredLang: string
): Promise<WikipediaPage[]> {
  const langs = Array.from(
    new Set([normalizeLang(preferredLang), "en", "pt", "es"])
  );
  const pages: WikipediaPage[] = [];
  const seen = new Set<string>();

  for (const lang of langs) {
    const searchUrl = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", name);
    searchUrl.searchParams.set("srlimit", "6");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const searchData = await fetchJson<{
      query?: { search?: Array<{ title: string }> };
    }>(searchUrl.toString());

    for (const item of searchData?.query?.search ?? []) {
      const page = await fetchPageSummary(item.title, lang);
      if (!page || isLikelyNonPerson(page)) continue;
      if (!namesMatch(name, page.title.split("(")[0] ?? page.title)) continue;
      if (seen.has(page.url)) continue;
      seen.add(page.url);
      pages.push(page);
    }

    if (pages.some(isLikelyPerson)) break;
  }

  const personPages = pages.filter(isLikelyPerson);
  return personPages.length > 0 ? personPages : pages;
}

/**
 * Resolve Wikipedia for a recognized person name.
 * Prefers human Wikidata entities and any available language sitelink.
 * When several people match, returns all pages as alternatives.
 */
export async function resolvePersonWikipedia(
  name: string,
  lang: string
): Promise<WikipediaResolveResult> {
  const preferredLang = normalizeLang(lang);
  const trimmed = name.trim();
  if (!trimmed) {
    return { primary: null, alternatives: [], ambiguous: false };
  }

  let candidates = await searchWikidataHumans(trimmed, preferredLang);
  if (candidates.length === 0) {
    candidates = await searchWikipediaPersonFallback(trimmed, preferredLang);
  }

  if (candidates.length === 0) {
    return { primary: null, alternatives: [], ambiguous: false };
  }

  if (candidates.length === 1) {
    return {
      primary: candidates[0],
      alternatives: candidates,
      ambiguous: false,
    };
  }

  // Prefer pages in the user's language when still ranking multiples.
  const preferred = candidates.filter((p) => p.lang === preferredLang);
  const pool = preferred.length > 0 ? preferred : candidates;

  if (pool.length === 1 && candidates.length > 1) {
    // One in preferred language, but other humans exist → still ambiguous.
    return {
      primary: null,
      alternatives: candidates,
      ambiguous: true,
    };
  }

  return {
    primary: null,
    alternatives: candidates,
    ambiguous: true,
  };
}

/** Backward-compatible helper: clear single page or null. */
export async function findWikipediaPage(
  name: string,
  lang: string
): Promise<WikipediaPage | null> {
  const resolved = await resolvePersonWikipedia(name, lang);
  if (resolved.ambiguous) return null;
  return resolved.primary;
}

/**
 * Pick the best sitelink language for a known Wikidata Q-id (no name search).
 */
export async function wikipediaForWikidataId(
  id: string,
  preferredLang: string
): Promise<{ page: WikipediaPage; name: string } | null> {
  const lang = normalizeLang(preferredLang);
  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
  const entityData = await fetchJson<{
    entities?: Record<string, WikidataEntity>;
  }>(entityUrl);
  const entity = entityData?.entities?.[id];
  if (!entity) return null;

  const sitelink = pickSitelink(entity.sitelinks ?? {}, lang);
  if (!sitelink) return null;

  const description =
    entity.descriptions?.[lang]?.value ?? entity.descriptions?.en?.value;
  const page = await enrichPage(sitelink, description);
  const name =
    entity.labels?.[lang]?.value ??
    entity.labels?.en?.value ??
    page.title;

  return { page, name };
}
