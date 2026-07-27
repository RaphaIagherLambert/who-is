import type { IdentifyResponse } from "./api";
import type { AppLanguage, translations } from "./i18n";

export type RejectReason = IdentifyResponse["rejectReason"];

export function messageForRejectReason(
  reason: RejectReason,
  t: (typeof translations)[AppLanguage]
): string {
  switch (reason) {
    case "no_faces":
      return t.tipNoFaces;
    case "low_confidence":
      return t.tipLowConfidence;
    case "ambiguous":
      return t.tipAmbiguous;
    case "poor_quality":
      return t.tipPoorQuality;
    case "bad_pose":
      return t.tipBadPose;
    case "no_wiki":
      return t.tipNoWiki;
    default:
      return t.notFound;
  }
}

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Invalid image"));
    };
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}
