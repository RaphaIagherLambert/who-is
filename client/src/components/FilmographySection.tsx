import type { TmdbPersonEnrichment } from "../api";
import type { AppLanguage } from "../i18n";
import { translations } from "../i18n";

interface Props {
  enrichment: TmdbPersonEnrichment;
  lang: AppLanguage;
}

export function FilmographySection({ enrichment, lang }: Props) {
  const t = translations[lang];
  if (enrichment.titles.length === 0) return null;

  return (
    <div className="filmography">
      <div className="filmography-head">
        <p className="filmography-title">{t.filmographyTitle}</p>
        <span className="filmography-region">
          {t.watchRegion(enrichment.region)}
        </span>
      </div>
      <ul className="filmography-list">
        {enrichment.titles.map((title) => (
          <li key={`${title.mediaType}-${title.id}`} className="filmography-item">
            <a
              className="filmography-main"
              href={title.tmdbUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {title.posterUrl ? (
                <img
                  className="filmography-poster"
                  src={title.posterUrl}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="filmography-poster filmography-poster-empty" />
              )}
              <span className="filmography-meta">
                <span className="filmography-name">{title.title}</span>
                <span className="filmography-sub">
                  {title.mediaType === "tv" ? t.seriesLabel : t.movieLabel}
                  {title.year ? ` · ${title.year}` : ""}
                  {title.rating != null
                    ? ` · ${t.ratingLabel(title.rating)}`
                    : ""}
                </span>
              </span>
            </a>
            {title.providers.length > 0 && (
              <div className="filmography-providers" aria-label={t.watchOn}>
                {title.providers.map((p) =>
                  title.watchLink ? (
                    <a
                      key={p.id}
                      href={title.watchLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={p.name}
                    >
                      <img
                        className="provider-logo"
                        src={p.logoUrl}
                        alt={p.name}
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <img
                      key={p.id}
                      className="provider-logo"
                      src={p.logoUrl}
                      alt={p.name}
                      title={p.name}
                      loading="lazy"
                    />
                  )
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="filmography-attr">{t.tmdbAttribution}</p>
    </div>
  );
}
