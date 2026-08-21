import type { FaceBox } from "../api";
import type { AppLanguage } from "../i18n";
import { translations } from "../i18n";

interface Props {
  lang: AppLanguage;
  image: string;
  faces: FaceBox[];
  onSelect: (index: number) => void;
  onCancel: () => void;
}

export function FacePicker({ lang, image, faces, onSelect, onCancel }: Props) {
  const t = translations[lang];

  return (
    <div className="face-picker" role="dialog" aria-labelledby="face-picker-title">
      <div className="face-picker-card">
        <h2 id="face-picker-title">{t.pickFaceTitle}</h2>
        <p className="face-picker-hint">{t.pickFaceHint}</p>

        <div className="face-picker-stage">
          <div className="face-picker-frame">
            <img src={image} alt="" className="face-picker-image" />
            {faces.map((face, index) => (
              <button
                key={`${face.left}-${face.top}-${index}`}
                type="button"
                className="face-box"
                style={{
                  left: `${face.left * 100}%`,
                  top: `${face.top * 100}%`,
                  width: `${face.width * 100}%`,
                  height: `${face.height * 100}%`,
                }}
                onClick={() => onSelect(index)}
                aria-label={t.pickFacePerson(index + 1)}
              >
                <span className="face-box-label">{index + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="face-picker-cancel" onClick={onCancel}>
          {t.cancelScan}
        </button>
      </div>
    </div>
  );
}
