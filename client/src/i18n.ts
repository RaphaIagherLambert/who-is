export type AppLanguage = "pt" | "en";

const STORAGE_KEY = "whois-lang";

export const translations = {
  pt: {
    subtitle: "Aponte e descubra",
    focusing: "Enfocando…",
    scanning: "Analisando…",
    idle: "Toque na mira para abrir a câmera",
    openingCamera: "Abrindo câmera…",
    aimAndTap: "Aponte e toque na mira para identificar",
    notFound: "Nenhuma figura pública detectada",
    identified: (name: string, confidence: number) =>
      `Identificado: ${name} (${confidence.toFixed(0)}%)`,
    noWiki: (name: string) =>
      `${name} identificado, mas não há página na Wikipedia`,
    wikiLink: "Ver na Wikipedia",
    errorGeneric: "Algo deu errado",
    cameraError: "Câmera indisponível ou acesso negado",
    foresightLabel: "Mira — toque para abrir a câmera ou identificar",
    afLock: "AF",
    rec: "REC",
  },
  en: {
    subtitle: "Point and find out",
    focusing: "Focusing…",
    scanning: "Analyzing…",
    idle: "Tap the sight to open the camera",
    openingCamera: "Opening camera…",
    aimAndTap: "Point and tap the sight to identify",
    notFound: "No public figure detected",
    identified: (name: string, confidence: number) =>
      `Identified: ${name} (${confidence.toFixed(0)}%)`,
    noWiki: (name: string) =>
      `${name} identified, but no Wikipedia page was found`,
    wikiLink: "View on Wikipedia",
    errorGeneric: "Something went wrong",
    cameraError: "Camera unavailable or access denied",
    foresightLabel: "Sight — tap to open camera or identify",
    afLock: "AF",
    rec: "REC",
  },
} as const;

export function getDefaultLanguage(): AppLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "pt" || stored === "en") return stored;
  return "pt";
}

export function saveLanguage(lang: AppLanguage): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

export function toApiLanguage(lang: AppLanguage): string {
  return lang === "pt" ? "pt" : "en";
}
