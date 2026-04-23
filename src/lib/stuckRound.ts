// ============================================================
// Stuck-round detection (PR #23 D4-B).
//
// A round is "stuck" when it was created but the scorekeeper never
// reached the first-hole-submit state. This happens most commonly
// when CrybabyActiveRound crashes on mount (e.g., the React #310
// hook violation on 2026-04-22): the `rounds` row is already
// committed at status='active', but `game_state.currentHole` was
// never written because `saveGameState` never ran.
//
// The predicate here is UI-facing — used by StuckRoundBanner on
// the feed to offer an Abandon affordance when the user has a
// round that looks crash-born rather than in-progress. False
// positives are survivable (the user can still Resume); false
// negatives would leave users stuck.
//
// Heuristic:
//   - `status` is always "active" (caller pre-filters)
//   - `game_state.currentHole` is null OR 0 (game never advanced)
//   - AND the round is older than STUCK_GRACE_MINUTES
//
// The grace window gives the scorekeeper time to complete setup +
// score hole 1 before we flag their round as stuck. Tuned to 10
// minutes — generous enough that a real in-progress setup won't
// hit it, tight enough that a crashed round surfaces before the
// user has to ask why new-round is blocked.
// ============================================================

export const STUCK_GRACE_MINUTES = 10;

/**
 * The minimum round shape the detector reads. Intentionally loose so
 * callers can pass `loadActiveRound()` output directly without type
 * gymnastics.
 */
export interface StuckRoundCandidate {
  id: string;
  created_at: string;
  course_details?: {
    game_state?: {
      currentHole?: number | null;
    } | null;
  } | null;
}

/**
 * True iff the round shows every mark of a crashed-on-mount orphan.
 * Caller has already filtered to `status === 'active'`.
 *
 * `now` is injectable so unit tests can deterministically cross the
 * grace window without mocking Date.
 */
export function isRoundStuck(
  round: StuckRoundCandidate,
  now: Date = new Date(),
): boolean {
  const currentHole = round.course_details?.game_state?.currentHole ?? null;
  // A non-null, non-zero currentHole means the scorekeeper at least
  // advanced past hole 1 → definitely not stuck.
  if (typeof currentHole === "number" && currentHole > 0) return false;

  const createdAtMs = Date.parse(round.created_at);
  if (!Number.isFinite(createdAtMs)) return false;
  const ageMinutes = (now.getTime() - createdAtMs) / 60_000;
  return ageMinutes >= STUCK_GRACE_MINUTES;
}

/**
 * Human-friendly age string for the banner copy ("12 minutes ago",
 * "2 hours ago", etc.). Clamps to >=1 minute so we never render
 * "0 minutes ago" for a just-created round — that'd be weird.
 */
export function formatRoundAge(
  round: StuckRoundCandidate,
  now: Date = new Date(),
): string {
  const createdAtMs = Date.parse(round.created_at);
  if (!Number.isFinite(createdAtMs)) return "recently";
  const diffMs = Math.max(0, now.getTime() - createdAtMs);
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
