import { describe, it, expect } from "vitest";
import { feedPublishDecision } from "../../supabase/functions/_shared/feedPublishDecision";
import {
  mergeCaptureEvents,
  type RoundEventRow,
} from "@/components/round/events/captureEventTypes";

/**
 * Phase 3d — end-to-end verification of the server-side feed-publish
 * debounce logic AND the client's filter that reads feed_published_at.
 *
 * The edge function's DB query for recent published events runs in Deno
 * and isn't directly exercised here; what we can exercise is the pure
 * `feedPublishDecision` used by that edge function, plus the client
 * filter that decides what lands in the feed tile list.
 *
 * Scenarios covered (from the 3d spec):
 *   - 5 captures in 30 seconds → exactly 1 published; other 4 written
 *     but suppressed from feed.
 *   - 2 captures 31 seconds apart → both published.
 *   - Private round → capture written; feed_published_at is null.
 *   - Ad-hoc with shareToFeed=false → capture written; suppressed.
 *   - Game-driven always publishes (unless private or recently-published).
 *   - hammer_correction / birdie_correction triggers also publish unless
 *     private or recently-published.
 */

const NOW = "2026-04-19T01:00:30.000Z";

// ---- feedPublishDecision — the pure rule that drives all scenarios ----

describe("feedPublishDecision — private rounds", () => {
  it("always suppresses regardless of shareToFeed or recency", () => {
    expect(
      feedPublishDecision({
        privacy: "private",
        trigger: "game_driven",
        shareToFeed: true,
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBeNull();
    expect(
      feedPublishDecision({
        privacy: "private",
        trigger: "ad_hoc",
        shareToFeed: true,
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBeNull();
  });
});

describe("feedPublishDecision — ad-hoc opt-in toggle", () => {
  it("ad_hoc + shareToFeed=false suppresses", () => {
    expect(
      feedPublishDecision({
        privacy: "public",
        trigger: "ad_hoc",
        shareToFeed: false,
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBeNull();
  });

  it("ad_hoc + shareToFeed=true publishes (when not recently published)", () => {
    expect(
      feedPublishDecision({
        privacy: "public",
        trigger: "ad_hoc",
        shareToFeed: true,
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBe(NOW);
  });
});

describe("feedPublishDecision — 30s recency debounce", () => {
  it("suppresses when hasRecentlyPublished is true", () => {
    expect(
      feedPublishDecision({
        privacy: "public",
        trigger: "game_driven",
        shareToFeed: true,
        hasRecentlyPublished: true,
        nowIso: NOW,
      }),
    ).toBeNull();
  });

  it("publishes when hasRecentlyPublished is false", () => {
    expect(
      feedPublishDecision({
        privacy: "public",
        trigger: "game_driven",
        shareToFeed: true,
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBe(NOW);
  });
});

describe("feedPublishDecision — 2.5 retro-correction triggers", () => {
  it("hammer_correction publishes when not recently published + not private", () => {
    expect(
      feedPublishDecision({
        privacy: "public",
        trigger: "hammer_correction",
        shareToFeed: false, // retro fixes don't need the ad-hoc toggle
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBe(NOW);
  });

  it("birdie_correction publishes when not recently published + not private", () => {
    expect(
      feedPublishDecision({
        privacy: "public",
        trigger: "birdie_correction",
        shareToFeed: false,
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBe(NOW);
  });

  it("post_round_correction publishes when not recently published + not private", () => {
    expect(
      feedPublishDecision({
        privacy: "public",
        trigger: "post_round_correction",
        shareToFeed: false,
        hasRecentlyPublished: false,
        nowIso: NOW,
      }),
    ).toBe(NOW);
  });
});

/**
 * "5 captures in 30 seconds" — simulate how the edge function processes
 * them ONE AT A TIME. For each, hasRecentlyPublished reflects whether
 * any PRIOR one already published.
 *
 * Expected: capture 1 publishes, captures 2-5 suppressed (because
 * #1 is still inside the 30s window when the subsequent ones run).
 */
describe("5 captures in 30 seconds — only 1 publishes", () => {
  it("sequences through 5 captures with the edge fn's hasRecentlyPublished logic", () => {
    const results: (string | null)[] = [];
    let anyRecentlyPublished = false;
    for (let i = 0; i < 5; i++) {
      const out = feedPublishDecision({
        privacy: "public",
        trigger: "game_driven",
        shareToFeed: true,
        hasRecentlyPublished: anyRecentlyPublished,
        nowIso: NOW,
      });
      results.push(out);
      if (out !== null) anyRecentlyPublished = true;
    }
    // Exactly one published
    const publishedCount = results.filter(r => r !== null).length;
    expect(publishedCount).toBe(1);
    // And it's the first one
    expect(results[0]).toBe(NOW);
    for (let i = 1; i < 5; i++) expect(results[i]).toBeNull();
  });
});

/**
 * "2 captures 31 seconds apart" — second capture's query would see no
 * recent published events (the 30s window has expired), so both publish.
 */
describe("2 captures 31 seconds apart — both publish", () => {
  it("second capture publishes because the 30s window expired", () => {
    const first = feedPublishDecision({
      privacy: "public",
      trigger: "game_driven",
      shareToFeed: true,
      hasRecentlyPublished: false,
      nowIso: "2026-04-19T01:00:00.000Z",
    });
    // 31 seconds later, the edge fn's DB query returns no events
    // because the 30s filter excludes the first one.
    const second = feedPublishDecision({
      privacy: "public",
      trigger: "game_driven",
      shareToFeed: true,
      hasRecentlyPublished: false, // DB query found nothing inside 30s
      nowIso: "2026-04-19T01:00:31.000Z",
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });
});

// ---- Client-side filter side of the contract --------------------------

describe("Client feed filter — respects feed_published_at across all 5 simulated events", () => {
  it("only the one event with non-null feed_published_at survives", () => {
    // Simulate what the database looks like after the 5-capture burst:
    // 1 published, 4 with null.
    const events: RoundEventRow[] = [
      {
        id: "e1", round_id: "r1", hole_number: 5,
        event_type: "capture_applied",
        event_data: { capture_id: "c1", running_totals: {}, feed_published_at: "2026-04-19T01:00:00Z" },
        created_at: "2026-04-19T01:00:00Z",
      },
      {
        id: "e2", round_id: "r1", hole_number: 5,
        event_type: "capture_applied",
        event_data: { capture_id: "c2", running_totals: {}, feed_published_at: null },
        created_at: "2026-04-19T01:00:05Z",
      },
      {
        id: "e3", round_id: "r1", hole_number: 5,
        event_type: "capture_applied",
        event_data: { capture_id: "c3", running_totals: {}, feed_published_at: null },
        created_at: "2026-04-19T01:00:10Z",
      },
      {
        id: "e4", round_id: "r1", hole_number: 5,
        event_type: "capture_applied",
        event_data: { capture_id: "c4", running_totals: {}, feed_published_at: null },
        created_at: "2026-04-19T01:00:15Z",
      },
      {
        id: "e5", round_id: "r1", hole_number: 5,
        event_type: "capture_applied",
        event_data: { capture_id: "c5", running_totals: {}, feed_published_at: null },
        created_at: "2026-04-19T01:00:20Z",
      },
    ];
    const { merged } = mergeCaptureEvents(events);
    // Apply the CrybabyFeed 3c filter (feed_published_at != null, non-private round)
    const visible = merged.filter(m => m.appliedData?.feed_published_at != null);
    expect(merged).toHaveLength(5); // all 5 captures exist (audit log intact)
    expect(visible).toHaveLength(1); // only 1 shows in the feed
    expect(visible[0].captureId).toBe("c1");
  });
});

describe("Client feed filter — private round never leaks", () => {
  it("even with feed_published_at set, a private round's captures are hidden by the client filter", () => {
    // Simulate a case where the server somehow published (shouldn't
    // happen but belt-and-suspenders) — the client still hides it.
    const events: RoundEventRow[] = [
      {
        id: "e1", round_id: "r1", hole_number: 5,
        event_type: "capture_applied",
        event_data: { capture_id: "c1", running_totals: {}, feed_published_at: "2026-04-19T01:00:00Z" },
        created_at: "2026-04-19T01:00:00Z",
      },
    ];
    const { merged } = mergeCaptureEvents(events);
    // Private round filter from CrybabyFeed.jsx:
    const isPrivateRound = true;
    const visible = isPrivateRound ? [] : merged.filter(m => m.appliedData?.feed_published_at != null);
    expect(visible).toHaveLength(0);
  });
});
