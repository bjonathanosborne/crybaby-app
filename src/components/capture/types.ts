// ============================================================
// Shared types for the capture flow.
// Kept in one file so CaptureFlow and its children can import without
// creating a tangle. Zero runtime deps — types only.
// ============================================================

import type { Player } from "@/lib/gameEngines";

/** Allowed MIME types accepted by the scorecards bucket + <input>. */
export type CaptureMime = "image/jpeg" | "image/png" | "image/heic" | "image/webp";

/** Confidence tier for a single extracted cell. Three distinct visual channels. */
export type ConfidenceTier = "high" | "medium" | "low";

/**
 * Classify a raw 0..1 confidence score (or "unreadable" sentinel) into a tier.
 * - high   ≥ 0.85 (no decoration)
 * - medium 0.60–0.84 (yellow border + triangle)
 * - low    <0.60 or "unreadable" sentinel (red border + question mark, apply-blocking)
 *
 * `null` means "no extraction attempt was made for this cell" — the cell is
 * treated as high-tier (no decoration, user can fill or leave blank). This is
 * NOT the same as "unreadable", which explicitly signals the model saw the
 * cell but couldn't parse it.
 */
export function classifyConfidence(score: number | "unreadable" | null): ConfidenceTier {
  if (score === "unreadable") return "low";
  if (score === null) return "high";
  if (score >= 0.85) return "high";
  if (score >= 0.60) return "medium";
  return "low";
}

/** A cell in the confirm grid: one player's score on one hole. */
export interface ConfirmCell {
  playerId: string;
  hole: number;
  /** User-entered / extracted value. Null = empty (unreadable + not yet filled). */
  value: number | null;
  /** 0..1 extraction confidence, or "unreadable". */
  confidence: number | "unreadable" | null;
}

/** Output of the CaptureFlow, passed to onComplete. */
export interface CaptureResult {
  captureId: string;
  applied: boolean;
  noop: boolean;
  /** Total money per player after apply. */
  totals: Record<string, number>;
  /** Was this capture published to the feed (respecting debounce + privacy). */
  feedPublished: boolean;
}

/** Props for the top-level CaptureFlow container. */
export interface CaptureFlowProps {
  /** Round being captured. */
  roundId: string;
  /**
   * Game-driven captures are prompted and blocking; ad-hoc are opt-in.
   * post_round_correction is launched from the completed-round view to
   * fix scores / add a photo after the round is already marked complete;
   * apply-capture rewrites non-manual settlements on apply.
   */
  trigger: "game_driven" | "ad_hoc" | "post_round_correction";
  /** Inclusive [start, end] holes to extract. */
  holeRange: [number, number];
  /** Players on the round, for extraction priors + confirm grid columns. */
  players: Player[];
  /** Course pars (length 18) — needed by extract-scores system prompt. */
  pars: number[];
  /** Course handicap indexes (length 18) — same. */
  handicaps: number[];
  /**
   * Round mechanics (from course_details.mechanics). Drives the hammer
   * prompt step: the flow inserts HammerPromptFlow between Confirm and
   * Apply iff this array includes "hammer". Omit or pass [] for rounds
   * without hammer.
   */
  mechanics?: string[];
  /**
   * Team split for the hammer prompt. Required when `mechanics` includes
   * "hammer". For 4-player DOC/Flip the caller derives this from
   * gameEngines.getTeamsForHole at capture time. Omitted for non-hammer
   * rounds.
   */
  hammerTeams?: { A: { name: string; players: Player[] }; B: { name: string; players: Player[] } };
  /**
   * Pre-populated hammer state from a prior capture — passed on back-edit
   * so the user doesn't lose their answers.
   */
  initialHammerState?: import("@/lib/hammerMath").CaptureHammerState;
  /**
   * Current DB-persisted scores. Used as priors for extraction AND
   * as the prior state for the dispute diff.
   */
  currentScores: Record<string, Record<number, number>>;
  /** Called when the flow completes (applied or noop). */
  onComplete: (result: CaptureResult) => void;
  /** Called when the user dismisses the flow without applying. */
  onCancel: () => void;
  /**
   * Is the current round private? Affects the Share-to-feed default
   * AND server-side debounce. The flow always shows Share off + disabled
   * when true.
   */
  roundPrivacy: "public" | "private";
}

/** Internal state machine for CaptureFlow. */
export type CaptureStep =
  | "shutter"
  | "uploading"
  | "analyzing"
  | "confirm"
  | "hammer_prompt"
  | "applying"
  | "done"
  | "error";

/** A single 422-style extraction response after the model parse. */
export interface ExtractionResponse {
  scores: Record<string, Record<number, number>>;
  cellConfidence: Record<string, Record<number, number>>;
  unreadable: Array<{ player_id: string; hole: number }>;
  notes?: string;
}
