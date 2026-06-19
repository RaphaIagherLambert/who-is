import { useState } from "react";
import { lookupWikipedia, teachPerson, WikipediaPage } from "../api";
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
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<WikipediaPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchWiki = async () => {
    if (name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const page = await lookupWikipedia(name.trim(), lang === "pt" ? "pt" : "en");
      setPreview(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.teachError);
    } finally {
      setBusy(false);
    }
  };

  const saveTeaching = async () => {
    const secret = getAdminSecret();
    if (!secret || !preview) return;

    setBusy(true);
    setError(null);
    try {
      await teachPerson(frame, preview.title, lang === "pt" ? "pt" : "en", secret, preview.url);
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
        <div className="teach-row">
          <input
            id="teach-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.teachNamePlaceholder}
            disabled={busy}
          />
          <button type="button" onClick={searchWiki} disabled={busy || name.trim().length < 2}>
            {t.teachSearchWiki}
          </button>
        </div>

        {preview && (
          <div className="teach-preview">
            {preview.thumbnail && (
              <img src={preview.thumbnail} alt="" />
            )}
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
