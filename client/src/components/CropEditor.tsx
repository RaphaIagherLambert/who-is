import { useCallback, useRef, useState } from "react";
import type { AppLanguage } from "../i18n";
import { translations } from "../i18n";
import {
  DEFAULT_CROP,
  type CropTransform,
} from "../cropImage";

interface Props {
  lang: AppLanguage;
  imageSrc: string;
  onConfirm: (transform: CropTransform) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function CropEditor({ lang, imageSrc, onConfirm, onSkip, onCancel }: Props) {
  const t = translations[lang];
  const [transform, setTransform] = useState<CropTransform>(DEFAULT_CROP);
  const dragRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: transform.offsetX,
        oy: transform.offsetY,
      };
    },
    [transform.offsetX, transform.offsetY]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.x) / 280;
    const dy = (e.clientY - drag.y) / 280;
    setTransform((prev) => ({
      ...prev,
      offsetX: Math.max(-0.45, Math.min(0.45, drag.ox - dx / prev.scale)),
      offsetY: Math.max(-0.45, Math.min(0.45, drag.oy - dy / prev.scale)),
    }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="crop-overlay" role="dialog" aria-labelledby="crop-title">
      <div className="crop-card">
        <h2 id="crop-title">{t.cropTitle}</h2>
        <p className="crop-hint">{t.cropHint}</p>

        <div
          className="crop-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            className="crop-image"
            style={{
              transform: `translate(-50%, -50%) translate(${transform.offsetX * 100}%, ${transform.offsetY * 100}%) scale(${transform.scale})`,
            }}
          />
          <div className="crop-mask" aria-hidden="true" />
        </div>

        <label className="crop-zoom">
          <span>{t.cropZoom}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={transform.scale}
            onChange={(e) =>
              setTransform((prev) => ({
                ...prev,
                scale: Number(e.target.value),
              }))
            }
          />
        </label>

        <div className="crop-actions">
          <button type="button" className="crop-cancel" onClick={onCancel}>
            {t.cropCancel}
          </button>
          <button type="button" className="crop-skip" onClick={onSkip}>
            {t.cropSkip}
          </button>
          <button
            type="button"
            className="crop-confirm"
            onClick={() => onConfirm(transform)}
          >
            {t.cropConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
