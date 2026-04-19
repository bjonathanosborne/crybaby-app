// ============================================================
// Pure decision function for the server-side feed-publish debounce.
//
// Extracted from apply-capture/index.ts so Vitest (client) + the Deno
// edge function (server) both verify the same logic. The DB query for
// "has this round had a published capture in the last 30s" lives in
// apply-capture; this function consumes its result as a boolean.
//
// Returns the ISO string that should be written to the event's
// feed_published_at, OR null if the emit should be suppressed from
// the feed (still written for audit).
// ============================================================

export interface FeedPublishDecisionInput {
  /** rounds.course_details.privacy — 'public' | 'private'. */
  privacy: "public" | "private" | string;
  /** Capture trigger: 'game_driven' | 'ad_hoc' | 'hammer_correction' | 'birdie_correction' | 'post_round_correction'. */
  trigger: string;
  /** Scorekeeper's explicit shareToFeed toggle from the confirm step. */
  shareToFeed: boolean;
  /**
   * True iff there's already a published (feed_published_at != null)
   * capture_applied event for this round within the last 30 seconds.
   * The edge function queries round_events to populate this.
   */
  hasRecentlyPublished: boolean;
  /** Current time, as an ISO string. Injected for test determinism. */
  nowIso: string;
}

/**
 * Returns the ISO string for feed_published_at (= publish) or null
 * (= suppress). All three debounce rules in one place:
 *
 *   1. Private rounds: ALWAYS suppress.
 *   2. Ad-hoc captures with shareToFeed === false: suppress.
 *      (Game-driven, hammer_correction, birdie_correction, and
 *       post_round_correction triggers default to publishing unless
 *       caught by rule 1 or 3.)
 *   3. 30-second window already has a published capture for this round:
 *      suppress.
 */
export function feedPublishDecision(
  input: FeedPublishDecisionInput,
): string | null {
  if (input.privacy === "private") return null;
  if (input.trigger === "ad_hoc" && !input.shareToFeed) return null;
  if (input.hasRecentlyPublished) return null;
  return input.nowIso;
}
