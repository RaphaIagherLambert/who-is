import { useCallback, useRef, useState } from "react";

import {

  CelebrityMatch,

  identifyImage,

  WikipediaPage,

} from "./api";

import { AdminUnlock, TeachPanel } from "./components/TeachPanel";

import {

  AppLanguage,

  getDefaultLanguage,

  saveLanguage,

  toApiLanguage,

  translations,

} from "./i18n";

import { useCamera, wait } from "./hooks/useCamera";

import { useAdminMode } from "./hooks/useAdminMode";



type CapturePhase = "idle" | "viewfinder" | "shutter" | "processing";



export default function App() {

  const [lang, setLang] = useState<AppLanguage>(getDefaultLanguage);

  const [phase, setPhase] = useState<CapturePhase>("idle");

  const [status, setStatus] = useState("");

  const [match, setMatch] = useState<CelebrityMatch | null>(null);

  const [wiki, setWiki] = useState<WikipediaPage | null>(null);

  const [resultSource, setResultSource] = useState<"celebrity" | "learned" | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<string | null>(null);

  const [flash, setFlash] = useState(false);

  const [teachOpen, setTeachOpen] = useState(false);

  const [lastFailedFrame, setLastFailedFrame] = useState<string | null>(null);

  const busyRef = useRef(false);



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

    captureFrame,

  } = useCamera();



  const switchLanguage = (next: AppLanguage) => {

    setLang(next);

    saveLanguage(next);

    if (phase === "idle" && !match && !busyRef.current) {

      setStatus(active ? translations[next].aimAndTap : translations[next].idle);

    }

  };



  const runIdentify = useCallback(async () => {

    if (busyRef.current || !ready) return;



    busyRef.current = true;

    setError(null);

    setMatch(null);

    setWiki(null);

    setResultSource(null);

    setLastFailedFrame(null);

    setTeachOpen(false);



    let capturedFrame: string | null = null;



    try {

      setPhase("viewfinder");

      setStatus(t.focusing);

      await wait(900);



      const frame = captureFrame();

      if (!frame) {

        setStatus(t.errorGeneric);

        return;

      }



      capturedFrame = frame;

      setPhase("shutter");

      setSnapshot(frame);

      setFlash(true);

      await wait(120);

      setFlash(false);

      await wait(180);



      setPhase("processing");

      setStatus(t.scanning);



      const { results, rejectReason } = await identifyImage(

        frame,

        toApiLanguage(lang)

      );

      const best = results[0] ?? null;



      if (!best) {

        setLastFailedFrame(frame);

        setStatus(

          rejectReason && rejectReason !== "no_faces"

            ? t.notConfident

            : t.notFound

        );

        return;

      }



      setMatch(best);

      setStatus(t.identified(best.name, best.confidence));

      setWiki(best.wikipedia);

      setResultSource(best.source ?? "celebrity");

    } catch (err) {

      if (capturedFrame) setLastFailedFrame(capturedFrame);

      setError(err instanceof Error ? err.message : t.errorGeneric);

    } finally {

      setSnapshot(null);

      setPhase("idle");

      busyRef.current = false;

      stopCamera();

    }

  }, [captureFrame, lang, ready, stopCamera, t]);



  const handleForesightClick = useCallback(async () => {

    if (busyRef.current || starting) return;



    if (!active) {

      setError(null);

      setMatch(null);

      setWiki(null);

      setResultSource(null);

      setLastFailedFrame(null);

      setTeachOpen(false);

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

    setMatch({ name, confidence: 100 });

    setWiki(page);

    setResultSource("learned");

    setStatus(t.teachSuccess(name));

  };



  const isActive = phase !== "idle";

  const displayStatus =

    status || (active ? t.aimAndTap : starting ? t.openingCamera : t.idle);

  const busy = phase !== "idle" || starting;

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

        <video ref={videoRef} playsInline muted className="target-video" />



        {snapshot && (

          <img src={snapshot} alt="" className="freeze-frame" aria-hidden="true" />

        )}



        <div className="target-vignette" aria-hidden="true" />



        <button

          type="button"

          className="foresight-trigger"

          onClick={handleForesightClick}

          disabled={busy}

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

            <span /><span /><span /><span />

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



      {(error || mediaError) && (

        <div className="error-banner">

          {error ?? mediaError}

        </div>

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

            {resultSource === "learned" && (

              <span className="learned-badge">{t.learnedBadge}</span>

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

    </div>

  );

}


