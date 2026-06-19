export type AppLanguage = "pt" | "en";

const STORAGE_KEY = "whois-lang";

export const translations = {
  pt: {
    subtitle: "Aponte e descubra",
    focusing: "Enfocando…",
    scanning: "Analisando…",
    idle: "Toque na mira para abrir a câmera",
    scanAgain: "Toque na mira para nova identificação",
    openingCamera: "Abrindo câmera…",
    aimAndTap: "Aponte e toque na mira para identificar",
    notFound: "Nenhuma figura pública detectada",
    notConfident:
      "Não foi possível identificar com segurança. Aponte de frente, com boa luz, e tente de novo.",
    identified: (name: string, confidence: number) =>
      `Identificado: ${name} (${confidence.toFixed(0)}%)`,
    noWiki: (name: string) =>
      `${name} identificado, mas não há página na Wikipedia`,
    wikiLink: "Ver na Wikipedia",
    errorGeneric: "Algo deu errado",
    cameraError: "Câmera indisponível ou acesso negado",
    foresightLabel: "Mira — toque para abrir a câmera e identificar",
    afLock: "AF",
    rec: "REC",
    learnedBadge: "Aprendido",
    teachButton: "Ensinar o sistema",
    teachTitle: "Ensinar pessoa",
    teachHint: "Use a foto da última tentativa. Busque o nome na Wikipedia e confirme.",
    teachNameLabel: "Nome da pessoa",
    teachNamePlaceholder: "Ex.: Nome do ator",
    teachSearchWiki: "Buscar",
    teachSave: "Salvar para o futuro",
    teachSaving: "Salvando…",
    teachClose: "Fechar",
    teachSuccess: (name: string) => `${name} aprendido! Na próxima vez o sistema deve reconhecer.`,
    teachError: "Não foi possível salvar",
    adminUnlockTitle: "Modo admin",
    adminUnlockHint: "Toque 5× no título para abrir. Digite a senha de administrador.",
    adminSecretPlaceholder: "Senha admin",
    adminUnlockButton: "Entrar",
    adminWrongSecret: "Senha incorreta",
    adminModeOn: "Admin",
  },
  en: {
    subtitle: "Point and find out",
    focusing: "Focusing…",
    scanning: "Analyzing…",
    idle: "Tap the sight to open the camera",
    scanAgain: "Tap the sight to scan again",
    openingCamera: "Opening camera…",
    aimAndTap: "Point and tap the sight to identify",
    notFound: "No public figure detected",
    notConfident:
      "Could not identify with confidence. Face the camera with good lighting and try again.",
    identified: (name: string, confidence: number) =>
      `Identified: ${name} (${confidence.toFixed(0)}%)`,
    noWiki: (name: string) =>
      `${name} identified, but no Wikipedia page was found`,
    wikiLink: "View on Wikipedia",
    errorGeneric: "Something went wrong",
    cameraError: "Camera unavailable or access denied",
    foresightLabel: "Sight — tap to open camera and identify",
    afLock: "AF",
    rec: "REC",
    learnedBadge: "Learned",
    teachButton: "Teach the system",
    teachTitle: "Teach person",
    teachHint: "Uses the photo from your last scan. Search Wikipedia and confirm.",
    teachNameLabel: "Person's name",
    teachNamePlaceholder: "e.g. Actor name",
    teachSearchWiki: "Search",
    teachSave: "Save for future scans",
    teachSaving: "Saving…",
    teachClose: "Close",
    teachSuccess: (name: string) => `${name} learned! The system should recognize them next time.`,
    teachError: "Could not save",
    adminUnlockTitle: "Admin mode",
    adminUnlockHint: "Tap the title 5× to open. Enter the admin password.",
    adminSecretPlaceholder: "Admin password",
    adminUnlockButton: "Unlock",
    adminWrongSecret: "Wrong password",
    adminModeOn: "Admin",
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
