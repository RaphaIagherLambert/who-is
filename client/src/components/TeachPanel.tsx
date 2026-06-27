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

interface TeachPanelProps {
  lang: AppLanguage;
  frame: string;
  onClose: () => void;
  onSuccess: (name: string, wiki: WikipediaPage) => void;
}

export function TeachPanel({ lang, frame, onClose, onSuccess }: TeachPanelProps) {
  const t = translations[lang];
  const apiLang = lang === "pt" ? "pt" : "en";
  const [name, setName] = useState("");
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

  const loadPreview = async (title: string) => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const page = await lookupWikipedia(title, apiLang);
      setPreview(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.teachError);
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
    await loadPreview(suggestion.title);
  };

  const saveTeaching = async () => {
    const secret = getAdminSecret();
    if (!secret || !preview) return;

    setBusy(true);
    setError(null);
    try {
      await teachPerson(frame, preview.title, apiLang, secret, preview.url);
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
          <h3>{t.teachTitle}</h3>
          <button type="button" className="teach-close" onClick={onClose} aria-label={t.teachClose}>
            ×
          </button>
        </div>

        <p className="teach-hint">{t.teachHint}</p>

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

        {preview && (
          <div className="teach-preview">
            {preview.thumbnail && <img src={preview.thumbnail} alt="" />}
            <div>
              <strong>{preview.title}</strong>
              {preview.description && <p>{preview.description}</p>}
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
