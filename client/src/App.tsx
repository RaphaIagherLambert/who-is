import { useCallback, useRef, useState, type ChangeEvent } from "react";

import {
  CelebrityMatch,
  identifyBestFromFrames,
  WikipediaPage,
  type IdentifyResult,
} from "./api";
import { AdminUnlock, TeachPanel } from "./components/TeachPanel";
import { CropEditor } from "./components/CropEditor";
import {
  OnboardingGuide,
  shouldShowOnboarding,
} from "./components/OnboardingGuide";
import {
  AppLanguage,
  getDefaultLanguage,
  saveLanguage,
  toApiLanguage,
  translations,
} from "./i18n";
import { applyCropToFrames, type CropTransform } from "./cropImage";
import { messageForRejectReason, readImageFile } from "./identifyHelpers";
import { useCamera, wait } from "./hooks/useCamera";
import { useAdminMode } from "./hooks/useAdminMode";
import {
  getRecognitionMode,
  saveRecognitionMode,
  type RecognitionMode,
} from "./recognitionMode";

type CapturePhase = "idle" | "viewfinder" | "shutter" | "processing" | "crop";

type WikidataNiche = NonNullable<IdentifyResult["niche"]>;

const BURST_COUNT = 4;
const BURST_INTERVAL_MS = 180;

function wikidataBadgeForNiche(
  niche: WikidataNiche | null,
  t: (typeof translations)[AppLanguage]
): string {
  if (!niche) return t.wikidataBadge;

  const badges: Record<WikidataNiche, string> = {
    "us-actor": t.wikidataBadge,
    "us-musician": t.wikidataMusicianBadge,
    "us-influencer": t.wikidataUsInfluencerBadge,
    "eu-actor": t.wikidataEuActorBadge,
    "eu-musician": t.wikidataEuMusicianBadge,
    "eu-influencer": t.wikidataEuInfluencerBadge,
    "br-actor": t.wikidataBrActorBadge,
    "br-musician": t.wikidataBrMusicianBadge,
    "br-influencer": t.wikidataBrInfluencerBadge,
    "latam-actor": t.wikidataLatamActorBadge,
    "latam-musician": t.wikidataLatamMusicianBadge,
    "asia-actor": t.wikidataAsiaActorBadge,
    "asia-musician": t.wikidataAsiaMusicianBadge,
  };

  return badges[niche];
}

export default function App() {
  const [lang, setLang] = useState<AppLanguage>(getDefaultLanguage);
  const [mode, setMode] = useState<RecognitionMode>(getRecognitionMode);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [status, setStatus] = useState("");
  const [match, setMatch] = useState<CelebrityMatch | null>(null);
  const [wiki, setWiki] = useState<WikipediaPage | null>(null);
  const [resultSource, setResultSource] = useState<
    "celebrity" | "learned" | "wikidata" | null
  >(null);
  const [resultNiche, setResultNiche] = useState<WikidataNiche | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [teachOpen, setTeachOpen] = useState(false);
  const [lastFailedFrame, setLastFailedFrame] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const [pendingFrames, setPendingFrames] = useState<string[] | null>(null);
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = translations[lang];

  const {
    isAdmin,
    unlockOpen,
    setUnlockOpen,
    onTitleTap,
    unlock,
    logout,
  } = useAdminMode();

  const {
    videoRef,
    canvasRef,
    error: mediaError,
    ready,
    starting,
    active,
    startCamera,
    stopCamera,
    captureBurst,
  } = useCamera();

  const switchLanguage = (next: AppLanguage) => {
    setLang(next);
    saveLanguage(next);
    if (phase === "idle" && !match && !busyRef.current) {
      setStatus(active ? translations[next].aimAndTap : translations[next].idle);
    }
  };

  const switchMode = (next: RecognitionMode) => {
    setMode(next);
    saveRecognitionMode(next);
  };

  const resetResultState = () => {
    setError(null);
    setMatch(null);
    setWiki(null);
    setResultSource(null);
    setResultNiche(null);
    setUncertain(false);
    setLastFailedFrame(null);
    setTeachOpen(false);
  };

  const applySuccess = (best: IdentifyResult) => {
    setMatch(best);
    setStatus(t.identified(best.name, best.confidence));
    setWiki(best.wikipedia);
    setResultSource(best.source ?? "celebrity");
    setResultNiche(best.niche ?? null);
    setUncertain(Boolean(best.uncertain));
  };

  const runIdentifyFrames = useCallback(
    async (frames: string[]) => {
      setPhase("processing");
      setSnapshot(frames[0] ?? null);
      setStatus(t.scanning);

      const { result: best, rejectReason, framesTried } =
        await identifyBestFromFrames(
          frames,
          toApiLanguage(lang),
          (n, total) => {
            if (n > 1) setStatus(t.retryingFrame(n, total));
          },
          mode
        );

      if (!best) {
        setLastFailedFrame(frames[framesTried - 1] ?? frames[0] ?? null);
        setStatus(messageForRejectReason(rejectReason, t));
        return;
      }

      applySuccess(best);
    },
    [lang, mode, t]
  );

  const openCrop = (frames: string[]) => {
    stopCamera();
    setPendingFrames(frames);
    setSnapshot(frames[0] ?? null);
    setPhase("crop");
    busyRef.current = false;
  };

  const finishIdentifySession = () => {
    setSnapshot(null);
    setPendingFrames(null);
    setPhase("idle");
    busyRef.current = false;
    stopCamera();
  };

  const handleCropConfirm = async (transform: CropTransform) => {
    if (!pendingFrames?.length || busyRef.current) return;
    busyRef.current = true;
    try {
      setStatus(t.scanning);
      const cropped = await applyCropToFrames(pendingFrames, transform);
      setPendingFrames(null);
      await runIdentifyFrames(cropped);
    } catch (err) {
      setLastFailedFrame(pendingFrames[0] ?? null);
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      finishIdentifySession();
    }
  };

  const handleCropSkip = async () => {
    if (!pendingFrames?.length || busyRef.current) return;
    busyRef.current = true;
    const frames = pendingFrames;
    setPendingFrames(null);
    try {
      await runIdentifyFrames(frames);
    } catch (err) {
      setLastFailedFrame(frames[0] ?? null);
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      finishIdentifySession();
    }
  };

  const handleCropCancel = () => {
    setPendingFrames(null);
    setSnapshot(null);
    setPhase("idle");
    busyRef.current = false;
    stopCamera();
    setStatus(active ? t.aimAndTap : t.idle);
  };

  const runIdentify = useCallback(async () => {
    if (busyRef.current || !ready) return;

    busyRef.current = true;
    resetResultState();

    try {
      setPhase("viewfinder");
      setStatus(t.focusing);
      await wait(900);

      setStatus(t.bursting);
      const frames = await captureBurst(BURST_COUNT, BURST_INTERVAL_MS);
      if (frames.length === 0) {
        setStatus(t.errorGeneric);
        finishIdentifySession();
        return;
      }

      setPhase("shutter");
      setSnapshot(frames[0]);
      setFlash(true);
      await wait(120);
      setFlash(false);
      await wait(180);

      openCrop(frames);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
      finishIdentifySession();
    }
  }, [captureBurst, ready, t]);

  const handleUploadChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || busyRef.current) return;
      try {
        resetResultState();
        stopCamera();
        const dataUrl = await readImageFile(file);
        busyRef.current = true;
        openCrop([dataUrl]);
      } catch {
        setError(t.errorGeneric);
        busyRef.current = false;
      }
    },
    [stopCamera, t]
  );

  const handleForesightClick = useCallback(async () => {
    if (busyRef.current || starting || phase === "crop") return;

    if (!active) {
      resetResultState();
      setStatus(t.openingCamera);
      const ok = await startCamera();
      setStatus(ok ? t.aimAndTap : t.cameraError);
      return;
    }

    if (!ready) return;
    await runIdentify();
  }, [active, phase, ready, runIdentify, startCamera, starting, t]);

  const handleTeachSuccess = (name: string, page: WikipediaPage) => {
    setTeachOpen(false);
    setLastFailedFrame(null);
    setMatch({ name, confidence: 100 });
    setWiki(page);
    setResultSource("learned");
    setResultNiche(null);
    setUncertain(false);
    setStatus(t.teachSuccess(name));
  };

  const isActive = phase !== "idle" && phase !== "crop";
  const displayStatus =
    status || (active ? t.aimAndTap : starting ? t.openingCamera : t.idle);
  const busy = (phase !== "idle" && phase !== "crop") || starting;
  const showTeachButton =
    isAdmin && phase === "idle" && !match && Boolean(lastFailedFrame);

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1>
            <button type="button" className="title-button" onClick={onTitleTap}>
              Who is?
            </button>
          </h1>
          <div className="header-actions">
            {isAdmin && (
              <button type="button" className="admin-badge" onClick={logout}>
                {t.adminModeOn}
              </button>
            )}
            <div className="mode-switch" role="group" aria-label={t.modeLabel}>
              <button
                type="button"
                className={mode === "strict" ? "active" : ""}
                onClick={() => switchMode("strict")}
                disabled={busy || phase === "crop"}
              >
                {t.modeStrict}
              </button>
              <button
                type="button"
                className={mode === "curious" ? "active" : ""}
                onClick={() => switchMode("curious")}
                disabled={busy || phase === "crop"}
              >
                {t.modeCurious}
              </button>
            </div>
            <div className="lang-switch" role="group" aria-label="Language">
              <button
                type="button"
                className={lang === "pt" ? "active" : ""}
                onClick={() => switchLanguage("pt")}
                disabled={busy || phase === "crop"}
              >
                PT
              </button>
              <button
                type="button"
                className={lang === "en" ? "active" : ""}
                onClick={() => switchLanguage("en")}
                disabled={busy || phase === "crop"}
              >
                EN
              </button>
            </div>
          </div>
        </div>
        <p>{t.subtitle}</p>
      </header>

      <div
        className={`target-stage ${isActive ? "active" : ""} ${active ? "camera-live" : ""}`}
      >
        <video ref={videoRef} playsInline muted className="target-video" />

        {snapshot && phase !== "crop" && (
          <img src={snapshot} alt="" className="freeze-frame" aria-hidden="true" />
        )}

        <div className="target-vignette" aria-hidden="true" />

        <button
          type="button"
          className="foresight-trigger"
          onClick={handleForesightClick}
          disabled={busy || phase === "crop"}
          aria-label={t.foresightLabel}
        >
          <span className="foresight-hint">
            {starting ? "…" : active ? "◎" : "◉"}
          </span>
        </button>

        <div className="viewfinder-hud" aria-hidden={!isActive}>
          <div className="hud-top">
            <span className="hud-rec">
              <span className="rec-dot" /> {t.rec}
            </span>
            <span className="hud-meta">4K · 24fps</span>
          </div>
          <div className="hud-bottom">
            <span className="hud-af">{t.afLock}</span>
            <span className="hud-focal">85mm · f/1.8</span>
            <span className="hud-iso">ISO 400</span>
          </div>
        </div>

        <div className="viewfinder-frame" aria-hidden="true">
          <div className="viewfinder-ring" />
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
          <div className="focus-ring" />
          <div className="grid-lines">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="lens-ring" aria-hidden="true" />
        <div className="target-crosshair" aria-hidden="true">
          <span />
          <span />
        </div>

        {flash && <div className="shutter-flash" aria-hidden="true" />}
      </div>

      <canvas ref={canvasRef} hidden />

      <div className="status-bar">
        <span
          className={`status-dot ${
            phase === "viewfinder" || phase === "processing" || starting
              ? "scanning"
              : match
                ? "found"
                : active
                  ? "live"
                  : ""
          }`}
        />
        <span className="status-text">{displayStatus}</span>
      </div>

      {phase === "idle" && !busy && (
        <div className="upload-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="upload-input"
            onChange={handleUploadChange}
          />
          <button
            type="button"
            className="upload-button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {t.uploadButton}
          </button>
          <p className="upload-hint">{t.uploadHint}</p>
        </div>
      )}

      {(error || mediaError) && (
        <div className="error-banner">{error ?? mediaError}</div>
      )}

      {showTeachButton && (
        <button
          type="button"
          className="teach-button"
          onClick={() => setTeachOpen(true)}
        >
          {t.teachButton}
        </button>
      )}

      {wiki && match && phase === "idle" && (
        <a
          className="result-card"
          href={wiki.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {wiki.thumbnail && <img src={wiki.thumbnail} alt={match.name} />}
          <div className="result-card-body">
            <h2>{match.name}</h2>
            {uncertain && (
              <span className="uncertain-badge">{t.uncertainBadge}</span>
            )}
            {resultSource === "learned" && (
              <span className="learned-badge">{t.learnedBadge}</span>
            )}
            {resultSource === "wikidata" && (
              <span className="learned-badge">
                {wikidataBadgeForNiche(resultNiche, t)}
              </span>
            )}
            <span className="result-link">{t.wikiLink} →</span>
          </div>
        </a>
      )}

      {unlockOpen && (
        <AdminUnlock
          lang={lang}
          onUnlock={unlock}
          onClose={() => setUnlockOpen(false)}
        />
      )}

      {teachOpen && lastFailedFrame && (
        <TeachPanel
          lang={lang}
          frame={lastFailedFrame}
          onClose={() => setTeachOpen(false)}
          onSuccess={handleTeachSuccess}
        />
      )}

      {phase === "crop" && pendingFrames?.[0] && (
        <CropEditor
          lang={lang}
          imageSrc={pendingFrames[0]}
          onConfirm={handleCropConfirm}
          onSkip={handleCropSkip}
          onCancel={handleCropCancel}
        />
      )}

      {showOnboarding && (
        <OnboardingGuide lang={lang} onDismiss={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
