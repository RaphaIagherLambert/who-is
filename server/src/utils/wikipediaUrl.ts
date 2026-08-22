/** Accept only https Wikipedia article URLs for teach mode. */
export function isAllowedWikipediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();
    if (host === "wikipedia.org") return parsed.pathname.startsWith("/wiki/");
    if (host.endsWith(".wikipedia.org")) {
      return parsed.pathname.startsWith("/wiki/");
    }
    return false;
  } catch {
    return false;
  }
}
