// ============================================================
// Stuck-round detection (PR #23 D4-B + PR #30 D4-A).
//
// A round is "stuck" when it was created but the scorekeeper never
// reached the first-hole-submit state. Two failure modes:
//
// 1. PR #23 D4-B path — round at status='active' with
//    `game_state.currentHole` still null/0 + age >= 10 min.
//    Created when CrybabyActiveRound crashed on mount (the React
//    #310 hook violation from 2026-04-22). The rounds row was
//    already committed at status='active', but saveGameState never
//    ran so currentHole stayed null.
//
// 2. PR #30 D4-A path — round at status='setup' + age >= 5 min.
//    Created when the new atomic-creation path's mount-success
//    `activate_round` never fired (network failure, user closed
//    the tab mid-setup, etc.). The 5-minute window is shorter than
//    the legacy active-stuck window because setup-state should
//    flip to 'active' immediately on mount; anything still in
//    setup is suspect quickly. The 30-minute server sweeper
//    (cleanup_stuck_setup_rounds) handles long-tail cleanup; this
//    predicate gives the scorekeeper a manual abandon affordance
//    in the in-window space (5-30 min).
//
// False positives are survivable (the user can still Resume);
// false negatives would leave users stuck.
// ============================================================

export const STUCK_GRACE_MINUTES = 10;
// PR #30 D4-A: tighter grace for setup-state stuck rounds.
// Setup → active should be near-instant on mount, so 5 min is
// enough rope without false-flagging legitimate slow setups.
export const STUCK_SETUP_GRACE_MINUTES = 5;

/**
 * The minimum round shape the detector reads. Intentionally loose so
 * callers can pass `loadActiveRound()` output directly without type
 * gymnastics.
 *
 * PR #30 D4-A: `status` is now consulted by the predicate so we can
 * distinguish 'active'-with-no-progress (PR #23 path) from 'setup'-
 * stuck (PR #30 path). Optional so callers passing the legacy shape
 * still work — they're treated as 'active' by default.
 */
export interface StuckRoundCandidate {
  id: string;
  created_at: string;
  status?: string | null;
  course_details?: {
    game_state?: {
      currentHole?: number | null;
    } | null;
  } | null;
}

/**
 * True iff the round shows every mark of a crashed-on-mount orphan.
 * Two predicates ORed together:
 *
 *   - PR #23 path: status='active' + currentHole null/0 + age >= 10 min
 *   - PR #30 path: status='setup' + age >= 5 min
 *
 * `now` is injectable so unit tests can deterministically cross the
 * grace window without mocking Date.
 */
export function isRoundStuck(
  round: StuckRoundCandidate,
  now: Date = new Date(),
): boolean {
  const createdAtMs = Date.parse(round.created_at);
  if (!Number.isFinite(createdAtMs)) return false;
  const ageMinutes = (now.getTime() - createdAtMs) / 60_000;

  // PR #30 D4-A: status='setup' + age >= 5 min is the new stuck
  // predicate. Setup-state rounds whose mount-success activate
  // never fired; the user gets an in-window abandon affordance
  // before the 30-min server sweeper catches it.
  if (round.status === "setup") {
    return ageMinutes >= STUCK_SETUP_GRACE_MINUTES;
  }

  // PR #23 D4-B path: status='active' (or unspecified-defaulted-to-
  // active) AND currentHole is null/0 AND age >= 10 min.
  const currentHole = round.course_details?.game_state?.currentHole ?? null;
  if (typeof currentHole === "number" && currentHole > 0) return false;
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
