import { useMemo, useState } from "react";
import {
  fetchTmdbCast,
  searchTmdbTitles,
  type TmdbCastMember,
  type TmdbTitleHit,
} from "../api";
import { AppLanguage, translations } from "../i18n";

interface CastLookupPanelProps {
  lang: AppLanguage;
  onSelect: (person: TmdbCastMember) => void;
}

type Step = "search" | "season" | "cast";

export function CastLookupPanel({ lang, onSelect }: CastLookupPanelProps) {
  const t = translations[lang];
  const apiLang = lang === "pt" ? "pt" : "en";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [titles, setTitles] = useState<TmdbTitleHit[]>([]);
  const [selected, setSelected] = useState<TmdbTitleHit | null>(null);
  const [season, setSeason] = useState(1);
  const [cast, setCast] = useState<TmdbCastMember[]>([]);
  const [castFilter, setCastFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  const seasonOptions = useMemo(() => {
    const n = Math.max(1, selected?.seasonCount ?? 1);
    return Array.from({ length: Math.min(n, 40) }, (_, i) => i + 1);
  }, [selected?.seasonCount]);

  const visibleCast = useMemo(() => {
    const q = castFilter.trim().toLowerCase();
    if (!q) return cast;
    return cast.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.character?.toLowerCase().includes(q) ?? false)
    );
  }, [cast, castFilter]);

  const resetFlow = () => {
    setStep("search");
    setTitles([]);
    setSelected(null);
    setSeason(1);
    setCast([]);
    setCastFilter("");
    setError(null);
  };

  const searchTitles = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setBusy(true);
    setError(null);
    setTitles([]);
    setSelected(null);
    setCast([]);
    try {
      const res = await searchTmdbTitles(q, apiLang);
      setConfigured(res.configured);
      if (!res.configured) {
        setError(t.castTmdbMissing);
        return;
      }
      setTitles(res.results);
      if (res.results.length === 0) setError(t.castNoTitles);
    } catch {
      setError(t.castError);
    } finally {
      setBusy(false);
    }
  };

  const loadCast = async (title: TmdbTitleHit, seasonNum: number) => {
    setBusy(true);
    setError(null);
    setCast([]);
    setCastFilter("");
    try {
      const members = await fetchTmdbCast(
        title.mediaType,
        title.id,
        apiLang,
        seasonNum
      );
      setCast(members);
      setStep("cast");
      if (members.length === 0) setError(t.castNoPeople);
    } catch {
      setError(t.castError);
    } finally {
      setBusy(false);
    }
  };

  const pickTitle = async (title: TmdbTitleHit) => {
    setSelected(title);
    if (title.mediaType === "tv") {
      setSeason(1);
      setStep("season");
      return;
    }
    await loadCast(title, 1);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="cast-lookup-open"
        onClick={() => setOpen(true)}
      >
        {t.castLookupOpen}
      </button>
    );
  }

  return (
    <div className="cast-lookup-panel" role="region" aria-label={t.castLookupTitle}>
      <div className="cast-lookup-header">
        <h3>{t.castLookupTitle}</h3>
        <button
          type="button"
          className="cast-lookup-close"
          onClick={() => {
            setOpen(false);
            resetFlow();
          }}
          aria-label={t.teachClose}
        >
          ×
        </button>
      </div>
      <p className="cast-lookup-hint">{t.castLookupHint}</p>

      {step === "search" && (
        <>
          <label className="teach-label" htmlFor="cast-title-query">
            {t.castTitleLabel}
          </label>
          <div className="teach-row">
            <input
              id="cast-title-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void searchTitles();
              }}
              placeholder={t.castTitlePlaceholder}
              disabled={busy}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => void searchTitles()}
              disabled={busy || query.trim().length < 2}
            >
              {t.castSearch}
            </button>
          </div>

          {titles.length > 0 && (
            <ul className="cast-title-list">
              {titles.map((title) => (
                <li key={`${title.mediaType}-${title.id}`}>
                  <button
                    type="button"
                    className="cast-title-button"
                    onClick={() => void pickTitle(title)}
                    disabled={busy}
                  >
                    {title.posterUrl ? (
                      <img src={title.posterUrl} alt="" />
                    ) : (
                      <span className="cast-poster-fallback" />
                    )}
                    <span className="cast-title-meta">
                      <strong>{title.title}</strong>
                      <span>
                        {title.mediaType === "tv" ? t.seriesLabel : t.movieLabel}
                        {title.year ? ` · ${title.year}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {step === "season" && selected && (
        <>
          <p className="cast-selected-title">
            <strong>{selected.title}</strong>
            {selected.year ? ` (${selected.year})` : ""}
          </p>
          <label className="teach-label" htmlFor="cast-season">
            {t.castSeasonLabel}
          </label>
          <div className="teach-row">
            <select
              id="cast-season"
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              disabled={busy}
            >
              {seasonOptions.map((n) => (
                <option key={n} value={n}>
                  {t.castSeasonOption(n)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadCast(selected, season)}
              disabled={busy}
            >
              {t.castShowPeople}
            </button>
          </div>
          <button
            type="button"
            className="cast-back"
            onClick={() => {
              setStep("search");
              setSelected(null);
            }}
            disabled={busy}
          >
            {t.castBack}
          </button>
        </>
      )}

      {step === "cast" && (
        <>
          <p className="cast-selected-title">
            <strong>{selected?.title}</strong>
            {selected?.mediaType === "tv" ? ` · ${t.castSeasonOption(season)}` : ""}
          </p>
          <label className="teach-label" htmlFor="cast-filter">
            {t.castFilterLabel}
          </label>
          <input
            id="cast-filter"
            type="search"
            className="cast-filter-input"
            value={castFilter}
            onChange={(e) => setCastFilter(e.target.value)}
            placeholder={t.castFilterPlaceholder}
            disabled={busy}
          />
          <ul className="cast-people-list">
            {visibleCast.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="cast-person-button"
                  onClick={() => onSelect(person)}
                  disabled={busy}
                >
                  {person.profileUrl ? (
                    <img src={person.profileUrl} alt="" />
                  ) : (
                    <span className="cast-avatar-fallback" />
                  )}
                  <span className="cast-person-meta">
                    <strong>{person.name}</strong>
                    {person.character && <span>{person.character}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="cast-back"
            onClick={() => {
              if (selected?.mediaType === "tv") setStep("season");
              else {
                setStep("search");
                setSelected(null);
              }
              setCast([]);
            }}
            disabled={busy}
          >
            {t.castBack}
          </button>
        </>
      )}

      {busy && <p className="cast-busy">{t.castLoading}</p>}
      {error && configured && <p className="teach-error">{error}</p>}
      {error && !configured && <p className="teach-error">{t.castTmdbMissing}</p>}
    </div>
  );
}
