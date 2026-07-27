import type { AppLanguage } from "../i18n";
import { translations } from "../i18n";

const STORAGE_KEY = "whois-onboarding-done";

export function shouldShowOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

interface Props {
  lang: AppLanguage;
  onDismiss: () => void;
}

export function OnboardingGuide({ lang, onDismiss }: Props) {
  const t = translations[lang];

  const dismiss = () => {
    markOnboardingDone();
    onDismiss();
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <h2 id="onboarding-title">{t.onboardingTitle}</h2>
        <ol className="onboarding-steps">
          <li>{t.onboardingStep1}</li>
          <li>{t.onboardingStep2}</li>
          <li>{t.onboardingStep3}</li>
        </ol>
        <p className="onboarding-alt">{t.onboardingAlt}</p>
        <button type="button" className="onboarding-got-it" onClick={dismiss}>
          {t.onboardingGotIt}
        </button>
      </div>
    </div>
  );
}
