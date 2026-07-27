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
    wikidataBadge: "Ator EUA",
    wikidataMusicianBadge: "Músico EUA",
    wikidataUsInfluencerBadge: "Influencer EUA",
    wikidataEuActorBadge: "Ator europeu",
    wikidataEuMusicianBadge: "Músico europeu",
    wikidataEuInfluencerBadge: "Influencer europeu",
    wikidataBrActorBadge: "Ator brasileiro",
    wikidataBrMusicianBadge: "Músico brasileiro",
    wikidataBrInfluencerBadge: "Influencer brasileiro",
    wikidataLatamActorBadge: "Ator latino-americano",
    wikidataLatamMusicianBadge: "Músico latino-americano",
    wikidataAsiaActorBadge: "Ator asiático",
    wikidataAsiaMusicianBadge: "Músico asiático",
    teachButton: "Ensinar o sistema",
    teachTitle: "Ensinar pessoa",
    teachHint: "Use a foto da última tentativa. Digite o nome e escolha a pessoa sugerida.",
    teachSuggestionsLabel: "Sugestões da Wikipedia",
    teachSuggestionsLoading: "Buscando sugestões…",
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
    tipNoFaces: "Nenhum rosto detectado. Pause a TV, aproxime o rosto na mira e tente de novo.",
    tipLowConfidence:
      "Não deu para confirmar. Pause o vídeo, aponte de frente com boa luz e tente outra vez.",
    tipAmbiguous:
      "Mais de uma pessoa possível. Centralize só um rosto na mira e tente de novo.",
    tipPoorQuality:
      "Imagem borrada ou escura. Pause a cena, segure firme e tente de novo.",
    tipNoWiki: "Pessoa reconhecida, mas sem página na Wikipedia.",
    tipBadPose: "Rosto de lado ou parcial. Aponte de frente e tente de novo.",
    uploading: "Analisando imagem…",
    uploadButton: "Enviar print / foto",
    uploadHint: "Use um print pausado da TV ou série",
    bursting: "Capturando várias fotos…",
    retryingFrame: (n: number, total: number) => `Tentativa ${n} de ${total}…`,
    onboardingTitle: "Como usar na TV",
    onboardingStep1: "Pause o vídeo ou série",
    onboardingStep2: "Aponte a câmera para o rosto",
    onboardingStep3: "Toque na mira para identificar",
    onboardingAlt: "Ou envie um print da tela",
    onboardingGotIt: "Entendi",
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
    wikidataBadge: "US actor",
    wikidataMusicianBadge: "US musician",
    wikidataUsInfluencerBadge: "US influencer",
    wikidataEuActorBadge: "European actor",
    wikidataEuMusicianBadge: "European musician",
    wikidataEuInfluencerBadge: "European influencer",
    wikidataBrActorBadge: "Brazilian actor",
    wikidataBrMusicianBadge: "Brazilian musician",
    wikidataBrInfluencerBadge: "Brazilian influencer",
    wikidataLatamActorBadge: "Latin American actor",
    wikidataLatamMusicianBadge: "Latin American musician",
    wikidataAsiaActorBadge: "Asian actor",
    wikidataAsiaMusicianBadge: "Asian musician",
    teachButton: "Teach the system",
    teachTitle: "Teach person",
    teachHint: "Uses the photo from your last scan. Type a name and pick from the suggestions.",
    teachSuggestionsLabel: "Wikipedia suggestions",
    teachSuggestionsLoading: "Searching suggestions…",
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
    tipNoFaces: "No face detected. Pause the TV, center the face in the sight, and try again.",
    tipLowConfidence:
      "Could not confirm. Pause the video, face the camera with good light, and try again.",
    tipAmbiguous:
      "More than one possible person. Center a single face in the sight and try again.",
    tipPoorQuality:
      "Image too blurry or dark. Pause the scene, hold steady, and try again.",
    tipNoWiki: "Person recognized, but no Wikipedia page was found.",
    tipBadPose: "Face is angled or partial. Point straight-on and try again.",
    uploading: "Analyzing image…",
    uploadButton: "Upload screenshot / photo",
    uploadHint: "Use a paused TV or series screenshot",
    bursting: "Capturing several frames…",
    retryingFrame: (n: number, total: number) => `Attempt ${n} of ${total}…`,
    onboardingTitle: "How to use with TV",
    onboardingStep1: "Pause the video or series",
    onboardingStep2: "Point the camera at the face",
    onboardingStep3: "Tap the sight to identify",
    onboardingAlt: "Or upload a screenshot",
    onboardingGotIt: "Got it",
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
