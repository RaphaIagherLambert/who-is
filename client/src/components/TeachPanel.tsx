import { useEffect, useRef, useState } from "react";
import {
  lookupWikipedia,
  searchWikipediaSuggestions,
  teachPerson,
  WikipediaPage,
  WikipediaSuggestion,
} from "../api";
import { AppLanguage, translations } from "../i18n";
import { getAdminSecret } from "../hooks/adminAuth";

/** Parse https://*.wikipedia.org/wiki/... (incl. mobile *.m.wikipedia.org). */
function parseWikipediaLink(
  raw: string
): { title: string; lang: string } | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:") return null;
    let host = parsed.hostname.toLowerCase();
    host = host.replace(/^([a-z]{2,3})\.m\.wikipedia\.org$/, "$1.wikipedia.org");
    let wikiLang = "en";
    if (host === "wikipedia.org") wikiLang = "en";
    else if (host.endsWith(".wikipedia.org")) {
      wikiLang = host.slice(0, -".wikipedia.org".length);
      if (!/^[a-z]{2,3}$/.test(wikiLang)) return null;
    } else return null;
    if (!parsed.pathname.startsWith("/wiki/")) return null;
    const slug = parsed.pathname.slice("/wiki/".length);
    if (!slug) return null;
    const title = decodeURIComponent(slug.replace(/_/g, " ")).trim();
    return title ? { title, lang: wikiLang } : null;
  } catch {
    return null;
  }
}

interface TeachPanelProps {
  lang: AppLanguage;
  frame: string;
  faceIndex?: number;
  /** Name the app showed; set when the admin is correcting a wrong recognition. */
  wrongName?: string;
  onClose: () => void;
  onSuccess: (name: string, wiki: WikipediaPage) => void;
}

export function TeachPanel({
  lang,
  frame,
  faceIndex = 0,
  wrongName,
  onClose,
  onSuccess,
}: TeachPanelProps) {
  const t = translations[lang];
  const apiLang = lang === "pt" ? "pt" : "en";
  const [name, setName] = useState("");
  const [wikiUrl, setWikiUrl] = useState("");
  const [preview, setPreview] = useState<WikipediaPage | null>(null);
  const [suggestions, setSuggestions] = useState<WikipediaSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipSuggestRef = useRef(false);

  useEffect(() => {
    const trimmed = name.trim();
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }

    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const results = await searchWikipediaSuggestions(trimmed, apiLang);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [name, apiLang]);

  const loadPreview = async (title: string, pageLang = apiLang) => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const page = await lookupWikipedia(title, pageLang);
      setPreview(page);
      setWikiUrl(page.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} ${t.teachTryPasteLink}`
          : t.teachError
      );
    } finally {
      setBusy(false);
    }
  };

  const searchWiki = async () => {
    if (name.trim().length < 2) return;
    setSuggestions([]);
    await loadPreview(name.trim());
  };

  const selectSuggestion = async (suggestion: WikipediaSuggestion) => {
    skipSuggestRef.current = true;
    setName(suggestion.title);
    setSuggestions([]);
    await loadPreview(suggestion.title, suggestion.lang || apiLang);
  };

  const loadFromUrl = async () => {
    const parsed = parseWikipediaLink(wikiUrl);
    if (!parsed) {
      setError(t.teachInvalidWikiUrl);
      setPreview(null);
      return;
    }
    skipSuggestRef.current = true;
    setName(parsed.title);
    setSuggestions([]);
    await loadPreview(parsed.title, parsed.lang);
  };

  const saveTeaching = async () => {
    const secret = getAdminSecret();
    if (!secret || !preview) return;

    setBusy(true);
    setError(null);
    try {
      await teachPerson(
        frame,
        preview.title,
        preview.lang || apiLang,
        secret,
        preview.url,
        faceIndex
      );
      onSuccess(preview.title, preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.teachError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="teach-overlay" role="dialog" aria-modal="true" aria-label={t.teachTitle}>
      <div className="teach-panel">
        <div className="teach-panel-header">
          <h3>{wrongName ? t.correctTitle : t.teachTitle}</h3>
          <button type="button" className="teach-close" onClick={onClose} aria-label={t.teachClose}>
            ×
          </button>
        </div>

        <p className="teach-hint">{wrongName ? t.correctHint(wrongName) : t.teachHint}</p>

        <label className="teach-label" htmlFor="teach-name">
          {t.teachNameLabel}
        </label>
        <div className="teach-search-wrap">
          <div className="teach-row">
            <input
              id="teach-name"
              type="text"
              value={name}
              onChange={(e) => {
                setPreview(null);
                setError(null);
                setName(e.target.value);
              }}
              placeholder={t.teachNamePlaceholder}
              disabled={busy}
              autoComplete="off"
            />
            <button type="button" onClick={searchWiki} disabled={busy || name.trim().length < 2}>
              {t.teachSearchWiki}
            </button>
          </div>

          {(suggestLoading || suggestions.length > 0) && (
            <ul className="teach-suggestions" role="listbox" aria-label={t.teachSuggestionsLabel}>
              {suggestLoading && suggestions.length === 0 && (
                <li className="teach-suggestion muted">{t.teachSuggestionsLoading}</li>
              )}
              {suggestions.map((suggestion) => (
                <li key={suggestion.title}>
                  <button
                    type="button"
                    className="teach-suggestion"
                    onClick={() => selectSuggestion(suggestion)}
                    disabled={busy}
                  >
                    <strong>{suggestion.title}</strong>
                    {suggestion.snippet && <span>{suggestion.snippet}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="teach-label" htmlFor="teach-wiki-url">
          {t.teachWikiUrlLabel}
        </label>
        <p className="teach-url-hint">{t.teachWikiUrlHint}</p>
        <div className="teach-row">
          <input
            id="teach-wiki-url"
            type="url"
            inputMode="url"
            value={wikiUrl}
            onChange={(e) => {
              setPreview(null);
              setError(null);
              setWikiUrl(e.target.value);
            }}
            placeholder={t.teachWikiUrlPlaceholder}
            disabled={busy}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={loadFromUrl}
            disabled={busy || wikiUrl.trim().length < 12}
          >
            {t.teachUseWikiUrl}
          </button>
        </div>

        {preview && (
          <div className="teach-preview">
            {preview.thumbnail && <img src={preview.thumbnail} alt="" />}
            <div>
              <strong>{preview.title}</strong>
              {preview.description && <p>{preview.description}</p>}
              <a
                className="teach-preview-link"
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {preview.url}
              </a>
            </div>
          </div>
        )}

        {error && <p className="teach-error">{error}</p>}

        <button
          type="button"
          className="teach-save"
          onClick={saveTeaching}
          disabled={busy || !preview}
        >
          {busy ? t.teachSaving : t.teachSave}
        </button>
      </div>
    </div>
  );
}

interface AdminUnlockProps {
  lang: AppLanguage;
  onUnlock: (secret: string) => Promise<boolean>;
  onClose: () => void;
}

export function AdminUnlock({ lang, onUnlock, onClose }: AdminUnlockProps) {
  const t = translations[lang];
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const ok = await onUnlock(secret);
    if (!ok) setError(t.adminWrongSecret);
    setBusy(false);
  };

  return (
    <div className="teach-overlay" role="dialog" aria-modal="true" aria-label={t.adminUnlockTitle}>
      <div className="teach-panel">
        <div className="teach-panel-header">
          <h3>{t.adminUnlockTitle}</h3>
          <button type="button" className="teach-close" onClick={onClose} aria-label={t.teachClose}>
            ×
          </button>
        </div>
        <p className="teach-hint">{t.adminUnlockHint}</p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={t.adminSecretPlaceholder}
          disabled={busy}
          className="teach-secret-input"
        />
        {error && <p className="teach-error">{error}</p>}
        <button type="button" className="teach-save" onClick={submit} disabled={busy || !secret}>
          {t.adminUnlockButton}
        </button>
      </div>
    </div>
  );
}
