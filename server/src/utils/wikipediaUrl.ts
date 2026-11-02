export interface ParsedWikipediaUrl {
  lang: string;
  title: string;
  canonicalUrl: string;
}

/**
 * Parse https://*.wikipedia.org/wiki/... (including mobile *.m.wikipedia.org).
 */
export function parseWikipediaArticleUrl(
  url: string
): ParsedWikipediaUrl | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return null;

    let host = parsed.hostname.toLowerCase();
    host = host.replace(
      /^([a-z]{2,3})\.m\.wikipedia\.org$/,
      "$1.wikipedia.org"
    );

    let lang = "en";
    if (host === "wikipedia.org") {
      lang = "en";
    } else if (host.endsWith(".wikipedia.org")) {
      lang = host.slice(0, -".wikipedia.org".length);
      if (!/^[a-z]{2,3}$/.test(lang)) return null;
    } else {
      return null;
    }

    if (!parsed.pathname.startsWith("/wiki/")) return null;
    const raw = parsed.pathname.slice("/wiki/".length);
    if (!raw) return null;

    let title: string;
    try {
      title = decodeURIComponent(raw.replace(/_/g, " ")).trim();
    } catch {
      return null;
    }
    if (!title) return null;

    // Skip obvious non-article namespaces (EN + common PT/ES labels).
    const ns = title.split(":")[0]?.toLowerCase() ?? "";
    if (
      new Set([
        "special",
        "especial",
        "talk",
        "user",
        "usuário",
        "usuario",
        "category",
        "categoria",
        "file",
        "ficheiro",
        "archivo",
        "template",
        "predefinição",
        "help",
        "ajuda",
        "portal",
        "wikipedia",
      ]).has(ns)
    ) {
      return null;
    }

    const canonicalUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
      title.replace(/ /g, "_")
    )}`;
    return { lang, title, canonicalUrl };
  } catch {
    return null;
  }
}

/** Accept only https Wikipedia article URLs for teach mode. */
export function isAllowedWikipediaUrl(url: string): boolean {
  return parseWikipediaArticleUrl(url) !== null;
}
