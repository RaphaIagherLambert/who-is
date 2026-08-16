import type { AppLanguage } from "../i18n";
import { translations } from "../i18n";
import { getLegalDoc, type LegalDoc } from "../legal";

interface Props {
  lang: AppLanguage;
  doc: LegalDoc;
  onClose: () => void;
}

export function LegalSheet({ lang, doc, onClose }: Props) {
  const t = translations[lang];
  const content = getLegalDoc(lang, doc);

  return (
    <div className="legal-overlay" role="dialog" aria-labelledby="legal-title">
      <div className="legal-card">
        <div className="legal-card-head">
          <h2 id="legal-title">{content.title}</h2>
          <button type="button" className="legal-close" onClick={onClose}>
            {t.legalClose}
          </button>
        </div>
        <div className="legal-body">
          {content.sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
