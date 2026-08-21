import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  CelebrityMatch,
  detectFacesInImage,
  identifyBestFromFrames,
  identifyImage,
  WikipediaPage,
  type FaceBox,
  type IdentifyResult,
} from "./api";
import { AdminUnlock, TeachPanel } from "./components/TeachPanel";
import { ColdStartBanner } from "./components/ColdStartBanner";
import { FacePicker } from "./components/FacePicker";
import { LegalSheet } from "./components/LegalSheet";
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
import { messageForRejectReason, readImageFile, type RejectReason } from "./identifyHelpers";
import { useCamera, wait } from "./hooks/useCamera";
import { useAdminMode } from "./hooks/useAdminMode";
import type { LegalDoc } from "./legal";

type CapturePhase =
  | "idle"
  | "viewfinder"
  | "shutter"
  | "processing"
  | "picking";

type WikidataNiche = NonNullable<IdentifyResult["niche"]>;

/** More frames + wider spacing helps with moving / paused video. */
const BURST_COUNT = 6;
const BURST_INTERVAL_MS = 250;
const FOCUS_MS = 1100;

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

function googleSearchUrl(name: string, lang: AppLanguage): string {
  const query = encodeURIComponent(name);
  if (lang === "pt") {
    return `https://www.google.com.br/search?q=${query}&hl=pt-BR`;
  }
  return `https://www.google.com/search?q=${query}&hl=en`;
}

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
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [status, setStatus] = useState("");
  const [match, setMatch] = useState<CelebrityMatch | null>(null);
  const [wiki, setWiki] = useState<WikipediaPage | null>(null);
  const [wikiAlternatives, setWikiAlternatives] = useState<WikipediaPage[]>([]);
  const [wikiAmbiguous, setWikiAmbiguous] = useState(false);
  const [resultSource, setResultSource] = useState<
    "celebrity" | "learned" | "wikidata" | null
  >(null);
  const [resultNiche, setResultNiche] = useState<WikidataNiche | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [teachOpen, setTeachOpen] = useState(false);
  const [lastFailedFrame, setLastFailedFrame] = useState<string | null>(null);
  const [lastRejectReason, setLastRejectReason] = useState<RejectReason>(null);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [pickFaces, setPickFaces] = useState<FaceBox[]>([]);
  const [pickImage, setPickImage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingFramesRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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

  const resetResultState = () => {
    setError(null);
    setMatch(null);
    setWiki(null);
    setWikiAlternatives([]);
    setWikiAmbiguous(false);
    setResultSource(null);
    setResultNiche(null);
    setLastFailedFrame(null);
    setLastRejectReason(null);
    setTeachOpen(false);
    setPickFaces([]);
    setPickImage(null);
  };

  const beginAbortable = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  };

  const finishSession = useCallback(() => {
    pendingFramesRef.current = [];
    setPickFaces([]);
    setPickImage(null);
    setSnapshot(null);
    setPhase("idle");
    busyRef.current = false;
    abortRef.current = null;
    stopCamera();
  }, [stopCamera]);

  const cancelIdentify = useCallback(() => {
    abortRef.current?.abort();
    finishSession();
    setStatus(t.cancelled);
  }, [finishSession, t]);

  const applySuccess = (best: IdentifyResult) => {
    setMatch(best);
    setStatus(t.identified(best.name, best.confidence));
    setWiki(best.wikipedia);
    setWikiAlternatives(best.wikipediaAlternatives ?? []);
    setWikiAmbiguous(Boolean(best.wikipediaAmbiguous));
    setResultSource(best.source ?? "celebrity");
    setResultNiche(best.niche ?? null);
  };

  const identifyFrames = useCallback(
    async (frames: string[], faceIndex: number, signal: AbortSignal) => {
      setPhase("processing");
      setStatus(t.scanning);
      setPickFaces([]);
      setPickImage(null);

      const { result: best, rejectReason } = await identifyBestFromFrames(
        frames,
        toApiLanguage(lang),
        (n, total) => {
          setStatus(t.retryingFrame(n, total));
        },
        { signal, faceIndex }
      );

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      if (!best) {
        setLastFailedFrame(frames[frames.length - 1] ?? frames[0]);
        setLastRejectReason(rejectReason);
        return;
      }

      applySuccess(best);
    },
    [lang, t]
  );

  const runIdentify = useCallback(async () => {
    if (busyRef.current || !ready) return;

    busyRef.current = true;
    resetResultState();
    const signal = beginAbortable();
    let holdForPick = false;
    let capturedFrame: string | null = null;

    try {
      setPhase("viewfinder");
      setStatus(t.focusing);
      await wait(FOCUS_MS);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      setStatus(t.bursting);
      const frames = await captureBurst(BURST_COUNT, BURST_INTERVAL_MS);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (frames.length === 0) {
        setStatus(t.errorGeneric);
        return;
      }

      capturedFrame = frames[0];
      setPhase("shutter");
      setSnapshot(frames[0]);
      setFlash(true);
      await wait(120);
      setFlash(false);
      await wait(180);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      setPhase("processing");
      setStatus(t.detectingFaces);
      const faces = await detectFacesInImage(frames[0], signal);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      if (faces.length > 1) {
        pendingFramesRef.current = frames;
        setPickImage(frames[0]);
        setPickFaces(faces);
        setSnapshot(frames[0]);
        setPhase("picking");
        setStatus(t.pickFaceHint);
        holdForPick = true;
        return;
      }

      await identifyFrames(frames, 0, signal);
    } catch (err) {
      if (isAbortError(err)) {
        setStatus(t.cancelled);
        return;
      }
      if (capturedFrame) setLastFailedFrame(capturedFrame);
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      if (!holdForPick) finishSession();
    }
  }, [captureBurst, finishSession, identifyFrames, ready, t]);

  const runIdentifyFromUpload = useCallback(
    async (dataUrl: string) => {
      if (busyRef.current) return;

      busyRef.current = true;
      resetResultState();
      stopCamera();
      const signal = beginAbortable();
      let holdForPick = false;

      try {
        setPhase("processing");
        setSnapshot(dataUrl);
        setStatus(t.detectingFaces);

        const faces = await detectFacesInImage(dataUrl, signal);
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        if (faces.length > 1) {
          pendingFramesRef.current = [dataUrl];
          setPickImage(dataUrl);
          setPickFaces(faces);
          setSnapshot(dataUrl);
          setPhase("picking");
          setStatus(t.pickFaceHint);
          holdForPick = true;
          return;
        }

        setStatus(t.uploading);
        const { results, rejectReason } = await identifyImage(
          dataUrl,
          toApiLanguage(lang),
          { signal, faceIndex: 0 }
        );
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        const best = results[0] ?? null;
        if (!best) {
          setLastFailedFrame(dataUrl);
          setLastRejectReason(rejectReason);
          return;
        }
        applySuccess(best);
      } catch (err) {
        if (isAbortError(err)) {
          setStatus(t.cancelled);
          return;
        }
        setLastFailedFrame(dataUrl);
        setError(err instanceof Error ? err.message : t.errorGeneric);
      } finally {
        if (!holdForPick) finishSession();
      }
    },
    [finishSession, lang, stopCamera, t]
  );

  const handlePickFace = useCallback(
    async (faceIndex: number) => {
      const frames = pendingFramesRef.current;
      if (frames.length === 0 || !abortRef.current) return;

      const signal = abortRef.current.signal;
      try {
        setStatus(t.scanning);
        if (frames.length === 1) {
          setPhase("processing");
          const { results, rejectReason } = await identifyImage(
            frames[0],
            toApiLanguage(lang),
            { signal, faceIndex }
          );
          if (signal.aborted) throw new DOMException("Aborted", "AbortError");
          const best = results[0] ?? null;
          if (!best) {
            setLastFailedFrame(frames[0]);
            setLastRejectReason(rejectReason);
          } else {
            applySuccess(best);
          }
        } else {
          await identifyFrames(frames, faceIndex, signal);
        }
      } catch (err) {
        if (isAbortError(err)) {
          setStatus(t.cancelled);
          return;
        }
        setLastFailedFrame(frames[0] ?? null);
        setError(err instanceof Error ? err.message : t.errorGeneric);
      } finally {
        finishSession();
      }
    },
    [finishSession, identifyFrames, lang, t]
  );

  const handleUploadChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || busyRef.current) return;
      try {
        const dataUrl = await readImageFile(file);
        await runIdentifyFromUpload(dataUrl);
      } catch {
        setError(t.errorGeneric);
      }
    },
    [runIdentifyFromUpload, t]
  );

  const handleForesightClick = useCallback(async () => {
    if (busyRef.current || starting) return;

    if (!active) {
      resetResultState();
      setStatus(t.openingCamera);
      const ok = await startCamera();
      setStatus(ok ? t.aimAndTap : t.cameraError);
      return;
    }

    if (!ready) return;
    await runIdentify();
  }, [active, ready, runIdentify, startCamera, starting, t]);

  const handleTeachSuccess = (name: string, page: WikipediaPage) => {
    setTeachOpen(false);
    setLastFailedFrame(null);
    setLastRejectReason(null);
    setMatch({ name, confidence: 100 });
    setWiki(page);
    setWikiAlternatives([page]);
    setWikiAmbiguous(false);
    setResultSource("learned");
    setResultNiche(null);
    setStatus(t.teachSuccess(name));
  };

  const isActive = phase !== "idle" && phase !== "picking";
  const rejectTip =
    lastRejectReason && phase === "idle" && !match
      ? messageForRejectReason(lastRejectReason, t)
      : null;
  const displayStatus =
    rejectTip ||
    status ||
    (active ? t.aimAndTap : starting ? t.openingCamera : t.idle);
  const busy = phase !== "idle" || starting;
  const canCancel =
    phase === "viewfinder" ||
    phase === "shutter" ||
    phase === "processing" ||
    phase === "picking";
  const showTeachButton =
    isAdmin && phase === "idle" && !match && Boolean(lastFailedFrame);

  return (
    <div className="app">
      <ColdStartBanner lang={lang} />
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
            <div className="lang-switch" role="group" aria-label="Language">
              <button
                type="button"
                className={lang === "pt" ? "active" : ""}
                onClick={() => switchLanguage("pt")}
                disabled={busy}
              >
                PT
              </button>
              <button
                type="button"
                className={lang === "en" ? "active" : ""}
                onClick={() => switchLanguage("en")}
                disabled={busy}
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
        <div className="viewfinder-screen">
          <video ref={videoRef} playsInline muted className="target-video" />

          {snapshot && (
            <img src={snapshot} alt="" className="freeze-frame" aria-hidden="true" />
          )}

          {!active && !snapshot && (
            <div className="viewfinder-placeholder" aria-hidden="true" />
          )}
        </div>

        <div className="viewfinder-overlay">
          <div className="vf-top">
            <div className="vf-top-left">
              {active && (
                <span className="vf-live">
                  <span className="live-dot" /> {t.live}
                </span>
              )}
            </div>
            <div className="vf-top-right">
              {isActive && <span className="vf-af">{t.afLock}</span>}
            </div>
          </div>

          <div className="viewfinder-frame">
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />
            <div className="vf-center-mark">(+)</div>
            {isActive && <div className="focus-ring" />}
          </div>

          <div className="vf-bottom">
            <span className="vf-brand">WHO IS?</span>
          </div>
        </div>

        <button
          type="button"
          className="foresight-trigger"
          onClick={handleForesightClick}
          disabled={busy}
          aria-label={t.foresightLabel}
        >
          {!active && (
            <span className="foresight-hint">
              {starting ? "…" : "◉"}
            </span>
          )}
        </button>

        {flash && <div className="shutter-flash" aria-hidden="true" />}
      </div>

      <canvas ref={canvasRef} hidden />

      <div className="status-bar">
        <span
          className={`status-dot ${
            phase === "viewfinder" ||
            phase === "processing" ||
            phase === "picking" ||
            starting
              ? "scanning"
              : match
                ? "found"
                : active
                  ? "live"
                  : ""
          }`}
        />
        <span className="status-text">{displayStatus}</span>
        {canCancel && (
          <button
            type="button"
            className="cancel-scan-button"
            onClick={cancelIdentify}
          >
            {t.cancelScan}
          </button>
        )}
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

      {match && phase === "idle" && (
        <div className="result-card">
          {wiki?.thumbnail && <img src={wiki.thumbnail} alt={match.name} />}
          <div className="result-card-body">
            <h2>{match.name}</h2>
            {resultSource === "learned" && (
              <span className="learned-badge">{t.learnedBadge}</span>
            )}
            {resultSource === "wikidata" && (
              <span className="learned-badge">
                {wikidataBadgeForNiche(resultNiche, t)}
              </span>
            )}
            {wiki?.description && !wikiAmbiguous && (
              <span className="wiki-single-desc">{wiki.description}</span>
            )}
            <a
              className="result-link result-link-primary"
              href={googleSearchUrl(match.name, lang)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.googleLink} →
            </a>
            {wiki && !wikiAmbiguous && (
              <a
                className="result-link result-link-alt"
                href={wiki.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.wikiLink} ({t.wikiLang(wiki.lang)}) →
              </a>
            )}
            {wikiAmbiguous && wikiAlternatives.length > 0 && (
              <>
                <p className="wiki-pick-title">{t.wikiPickTitle}</p>
                <p className="wiki-pick-hint">{t.wikiPickHint}</p>
                <ul className="wiki-pick-list">
                  {wikiAlternatives.map((page) => (
                    <li key={page.url}>
                      <a href={page.url} target="_blank" rel="noopener noreferrer">
                        <span className="wiki-pick-name">{page.title}</span>
                        {page.description && (
                          <span className="wiki-pick-desc">{page.description}</span>
                        )}
                        <span className="wiki-pick-meta">
                          {t.wikiLang(page.lang)} →
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "picking" && pickImage && pickFaces.length > 1 && (
        <FacePicker
          lang={lang}
          image={pickImage}
          faces={pickFaces}
          onSelect={handlePickFace}
          onCancel={cancelIdentify}
        />
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

      {showOnboarding && (
        <OnboardingGuide lang={lang} onDismiss={() => setShowOnboarding(false)} />
      )}

      {legalDoc && (
        <LegalSheet
          lang={lang}
          doc={legalDoc}
          onClose={() => setLegalDoc(null)}
        />
      )}

      <footer className="app-footer">
        <button type="button" onClick={() => setLegalDoc("privacy")}>
          {t.footerPrivacy}
        </button>
        <button type="button" onClick={() => setLegalDoc("terms")}>
          {t.footerTerms}
        </button>
        <button type="button" onClick={() => setLegalDoc("about")}>
          {t.footerAbout}
        </button>
      </footer>
    </div>
  );
}
