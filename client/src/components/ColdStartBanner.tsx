import { useEffect, useState } from "react";
import type { AppLanguage } from "../i18n";
import { translations } from "../i18n";

export function ColdStartBanner({ lang }: { lang: AppLanguage }) {
  const t = translations[lang];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setVisible(true);
    }, 1600);

    fetch("/api/health")
      .then(() => {
        if (!cancelled) setVisible(false);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="cold-start-banner" role="status">
      {t.coldStart}
    </div>
  );
}
