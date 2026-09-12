import type { CelebrityMatch } from "./types.js";

export interface MatchFilterConfig {
  minConfidence: number;
  /** Top match must beat the runner-up by at least this many points. */
  minMargin: number;
  minFaceConfidence: number;
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
  maxPoseYaw: number;
  maxPosePitch: number;
  /** When true, also enforce AWS Face Quality / pose gates (strict). */
  requireFaceQuality: boolean;
}

export type RejectReason =
  | "no_faces"
  | "low_confidence"
  | "ambiguous"
  | "poor_quality"
  | "bad_pose"
  | "no_wiki";

export interface FilterResult {
  match: CelebrityMatch | null;
  reason: RejectReason | null;
}

/**
 * Defaults tuned for paused video / TV frames (more recall, less rejection for blur/pose).
 * Celebrity MatchConfidence on screen photos is often 75–90; sharpness is often soft.
 *
 * Face Quality (sharpness/brightness/pose) from CelebrityFaces is unreliable on
 * phone→screen captures — off by default. Set CELEBRITY_FACE_QUALITY=true to enforce.
 */
export function loadMatchFilterConfig(): MatchFilterConfig {
  return {
    minConfidence: Number(process.env.MIN_CONFIDENCE) || 80,
    minMargin: Number(process.env.MIN_MATCH_MARGIN) || 4,
    minFaceConfidence: Number(process.env.MIN_FACE_CONFIDENCE) || 80,
    minSharpness: Number(process.env.MIN_FACE_SHARPNESS) || 8,
    minBrightness: Number(process.env.MIN_FACE_BRIGHTNESS) || 8,
    maxBrightness: Number(process.env.MAX_FACE_BRIGHTNESS) || 100,
    maxPoseYaw: Number(process.env.MAX_POSE_YAW) || 60,
    maxPosePitch: Number(process.env.MAX_POSE_PITCH) || 55,
    requireFaceQuality:
      process.env.CELEBRITY_FACE_QUALITY === "true" ||
      process.env.CELEBRITY_FACE_QUALITY === "1",
  };
}

function passesQualityChecks(match: CelebrityMatch, config: MatchFilterConfig): boolean {
  if (match.faceConfidence != null && match.faceConfidence < config.minFaceConfidence) {
    return false;
  }

  if (match.sharpness != null && match.sharpness < config.minSharpness) {
    return false;
  }

  if (match.brightness != null) {
    if (
      match.brightness < config.minBrightness ||
      match.brightness > config.maxBrightness
    ) {
      return false;
    }
  }

  const yaw = Math.abs(match.pose?.yaw ?? 0);
  const pitch = Math.abs(match.pose?.pitch ?? 0);
  if (yaw > config.maxPoseYaw || pitch > config.maxPosePitch) {
    return false;
  }

  return true;
}

/**
 * Pick at most one match. Prefer silence over a wrong suggestion.
 */
export function pickConfidentMatch(
  matches: CelebrityMatch[],
  config: MatchFilterConfig
): FilterResult {
  if (matches.length === 0) {
    return { match: null, reason: "no_faces" };
  }

  const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];
  const runnerUp = sorted[1];

  if (best.confidence < config.minConfidence) {
    return { match: null, reason: "low_confidence" };
  }

  if (
    runnerUp &&
    best.confidence - runnerUp.confidence < config.minMargin
  ) {
    return { match: null, reason: "ambiguous" };
  }

  if (config.requireFaceQuality && !passesQualityChecks(best, config)) {
    const yaw = Math.abs(best.pose?.yaw ?? 0);
    const pitch = Math.abs(best.pose?.pitch ?? 0);
    if (yaw > config.maxPoseYaw || pitch > config.maxPosePitch) {
      return { match: null, reason: "bad_pose" };
    }
    return { match: null, reason: "poor_quality" };
  }

  return { match: best, reason: null };
}
