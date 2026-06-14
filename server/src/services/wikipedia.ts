export interface WikipediaPage {
  title: string;
  url: string;
  lang: string;
  description?: string;
  thumbnail?: string;
}

export async function findWikipediaPage(
  name: string,
  lang: string
): Promise<WikipediaPage | null> {
  const normalizedLang = lang.split("-")[0].toLowerCase();
  const safeLang = /^[a-z]{2,3}$/.test(normalizedLang) ? normalizedLang : "en";

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
      url: `https://${safeLang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
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
      `https://${safeLang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    lang: safeLang,
    description: summary.description ?? summary.extract?.slice(0, 200),
    thumbnail: summary.thumbnail?.source,
  };
}
