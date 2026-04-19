// ============================================================
// Capture cadence — when the app *requires* a scorecard photo
//
// Pure functions, no React, no DB. Derive cadence from the round's
// gameType + mechanics at runtime -- no DB column, single source of
// truth. Shared between the client (useCaptureCadence hook) and the
// apply-capture edge function's cadence gate.
//
// Rules (see docs/PHOTO_CAPTURE_RECON.md §2 and §7.3):
//  - solo: no photos required (no money).
//  - nassau without presses: only at the turn (hole 9) and after 18.
//  - nassau WITH presses: every hole (press timing depends on current
//      match state, which needs fresh scores).
//  - anything with hammer, crybaby, birdie bonus, or carry-over: every
//      hole (state accumulates hole-by-hole, gaps corrupt money).
//  - otherwise: every hole (safe default; money-carrying modes can't
//      reconstruct state from sparse photos).
// ============================================================

export type CaptureCadence =
  | { type: "every_hole" }
  | { type: "holes"; holes: number[] }
  | { type: "none" };

/**
 * Subset of the round's fields this function reads. Kept narrow so
 * both the client and edge functions can construct it without
 * pulling the full RoundData shape.
 */
export interface CadenceRoundInput {
  gameType: string; // GameMode string; kept as string to stay decoupled
  mechanics: string[]; // e.g. ["hammer", "crybaby", "birdie_bonus", "pops", "presses", "carry_over"]
}

export function requiredCadence(round: CadenceRoundInput): CaptureCadence {
  const { gameType, mechanics } = round;
  const has = (m: string) => mechanics.includes(m);

  // Solo play has no money, no photos.
  if (gameType === "solo" || gameType === "just_me") {
    return { type: "none" };
  }

  // Any of these mechanics require per-hole state visibility.
  const needsEveryHole =
    has("hammer") ||
    has("crybaby") ||
    has("birdie_bonus") ||
    has("carry_over") ||
    has("presses");

  if (needsEveryHole) {
    return { type: "every_hole" };
  }

  // Nassau (without presses) is the only narrow case that can run sparse:
  // segments settle at the turn and at 18.
  if (gameType === "nassau") {
    return { type: "holes", holes: [9, 18] };
  }

  // Skins has implicit carry-over semantics (ties push to next hole).
  // DOC, Flip, Wolf all carry hole-by-hole state.
  // Default to every hole for any money-carrying mode.
  return { type: "every_hole" };
}

/**
 * Is a photo required *for* `justCompletedHole` (i.e., after scoring
 * this hole, before advancing to the next)?
 *
 * - every_hole: true for every hole 1..18
 * - holes: true iff `justCompletedHole` is in the list
 * - none: always false
 */
export function isPhotoRequiredForHole(
  round: CadenceRoundInput,
  justCompletedHole: number,
): boolean {
  const cadence = requiredCadence(round);
  switch (cadence.type) {
    case "every_hole":
      return justCompletedHole >= 1 && justCompletedHole <= 18;
    case "holes":
      return cadence.holes.includes(justCompletedHole);
    case "none":
      return false;
  }
}

/**
 * Human-readable reason a photo is required at this moment (or null).
 * Drives the copy on the CapturePrompt banner.
 */
export function cadenceReason(
  round: CadenceRoundInput,
  justCompletedHole: number,
): string | null {
  if (!isPhotoRequiredForHole(round, justCompletedHole)) return null;
  const { gameType, mechanics } = round;
  // Phase 2.5: when hammer is enabled, the scorekeeper needs to walk the
  // sequenced hammer prompt after each hole (hammers can't be derived
  // from scores). Copy reflects the prompt flow.
  if (mechanics.includes("hammer")) return "Hammer active — photo and hammer prompt required each hole.";
  if (mechanics.includes("crybaby") && justCompletedHole >= 15)
    return "Crybaby phase needs a fresh photo each hole.";
  if (mechanics.includes("presses")) return "Presses need current match state — photo each hole.";
  if (mechanics.includes("carry_over")) return "Carry-over pot — photo each hole.";
  if (mechanics.includes("birdie_bonus")) return "Birdie bonus active — photo each hole.";
  if (gameType === "nassau") {
    if (justCompletedHole === 9) return "End of front 9 — photo to settle segment.";
    if (justCompletedHole === 18) return "Final hole — photo to settle round.";
  }
  return "Photo required for this hole.";
}
