import type { WikipediaPage } from "./wikipedia.js";

// Rekognition ExternalImageId: [a-zA-Z0-9_.\-:]+, max 255 chars.
// Hex keeps the title free of "_", which normalizePersonExternalId treats as a face-index suffix.
const PREFIX = "wp.";
const MAX_LENGTH = 255;

function titleFromPage(page: WikipediaPage): string {
  const match = /\/wiki\/([^?#]+)/.exec(page.url);
  if (match) {
    try {
      return decodeURIComponent(match[1]).replace(/_/g, " ").trim();
    } catch {
      // fall through to page.title
    }
  }
  return page.title.trim();
}

/** Encode lang + Wikipedia title so taught faces survive server restarts. */
export function encodeTeachExternalId(page: WikipediaPage): string | null {
  const lang = page.lang.split("-")[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) return null;
  const title = titleFromPage(page);
  if (!title) return null;
  const id = `${PREFIX}${lang}.${Buffer.from(title, "utf8").toString("hex")}`;
  return id.length <= MAX_LENGTH ? id : null;
}

export function decodeTeachExternalId(
  externalId: string
): { lang: string; title: string } | null {
  const match = /^wp\.([a-z]{2,3})\.((?:[0-9a-f]{2})+)$/.exec(externalId);
  if (!match) return null;
  const title = Buffer.from(match[2], "hex").toString("utf8").trim();
  return title ? { lang: match[1], title } : null;
}
