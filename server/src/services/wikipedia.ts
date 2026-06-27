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

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];

  const searchData = (await searchRes.json()) as {
    query?: {
      search?: Array<{ title: string; snippet?: string }>;
    };
  };

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

export async function findWikipediaPage(
  name: string,
  lang: string
): Promise<WikipediaPage | null> {
  const safeLang = normalizeLang(lang);

  const searchUrl = new URL(
    `https://${safeLang}.wikipedia.org/w/api.php`
  );
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", name);
  searchUrl.searchParams.set("srlimit", "5");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return null;

  const searchData = (await searchRes.json()) as {
    query?: { search?: Array<{ title: string }> };
  };

  const results = searchData.query?.search ?? [];
  if (results.length === 0) {
    if (safeLang !== "en") {
      return findWikipediaPage(name, "en");
    }
    return null;
  }

  const title = results[0].title;
  const summaryUrl = `https://${safeLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  const summaryRes = await fetch(summaryUrl);
  if (!summaryRes.ok) {
    return {
      title,
      url: wikiPageUrl(title, safeLang),
      lang: safeLang,
    };
  }

  const summary = (await summaryRes.json()) as {
    title: string;
    description?: string;
    extract?: string;
    thumbnail?: { source: string };
    content_urls?: { desktop?: { page: string } };
  };

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
