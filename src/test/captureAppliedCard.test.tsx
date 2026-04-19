import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CaptureAppliedCard from "@/components/round/events/CaptureAppliedCard";
import {
  mergeCaptureEvents,
  largestMover,
  strokesOverPar,
  type RoundEventRow,
  type MergedCaptureEvent,
} from "@/components/round/events/captureEventTypes";

// Mock Supabase client — CapturePhotoThumbnail pulls signed URLs which
// we want to stub. Tests hitting real storage would be flaky.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(async (path: string) => ({
          data: { signedUrl: `https://stub.test/${path}?sig=abc` },
          error: null,
        })),
      }),
    },
  },
}));

const PLAYER_NAMES = { p1: "Grant", p2: "Said", p3: "Jonathan", p4: "Tom" };

function appliedEvent(overrides: Partial<RoundEventRow> = {}, data: Record<string, unknown> = {}): RoundEventRow {
  return {
    id: "evt-a",
    round_id: "r1",
    hole_number: 14,
    event_type: "capture_applied",
    event_data: {
      capture_id: "c1",
      delta: [
        { playerId: "p1", hole: 14, prior: 3, next: 4 },
        { playerId: "p2", hole: 14, prior: 3, next: 5 },
        { playerId: "p3", hole: 14, prior: 3, next: 4 },
        { playerId: "p4", hole: 14, prior: 3, next: 6 },
      ],
      running_totals: { p1: 40, p2: -20, p3: 10, p4: -30 },
      prior_totals: { p1: 0, p2: 0, p3: 0, p4: 0 },
      photo_path: "rounds/r1/c1.jpg",
      feed_published_at: "2026-04-19T01:00:00Z",
      ...data,
    },
    created_at: "2026-04-19T01:00:00Z",
    ...overrides,
  };
}

function moneyShiftEvent(overrides: Partial<RoundEventRow> = {}): RoundEventRow {
  return {
    id: "evt-s",
    round_id: "r1",
    hole_number: 14,
    event_type: "capture_money_shift",
    event_data: {
      capture_id: "c1",
      prior_totals: { p1: 0, p2: 0, p3: 0, p4: 0 },
      new_totals: { p1: 40, p2: -20, p3: 10, p4: -30 },
      feed_published_at: "2026-04-19T01:00:00Z",
    },
    created_at: "2026-04-19T01:00:00Z",
    ...overrides,
  };
}

describe("mergeCaptureEvents", () => {
  it("merges capture_applied + capture_money_shift with the same capture_id", () => {
    const events = [appliedEvent(), moneyShiftEvent()];
    const { merged, nonCapture } = mergeCaptureEvents(events);
    expect(merged).toHaveLength(1);
    expect(merged[0].captureId).toBe("c1");
    expect(merged[0].applied.id).toBe("evt-a");
    expect(merged[0].moneyShift?.id).toBe("evt-s");
    expect(nonCapture).toHaveLength(0);
  });

  it("leaves applied-only captures without moneyShift", () => {
    const { merged } = mergeCaptureEvents([appliedEvent()]);
    expect(merged[0].moneyShift).toBeUndefined();
  });

  it("separates non-capture events into nonCapture bucket", () => {
    const legacy: RoundEventRow = {
      id: "evt-x", round_id: "r1", hole_number: 3,
      event_type: "birdie",
      event_data: { playerName: "Grant", message: "Birdie on 3!" },
      created_at: "2026-04-19T00:50:00Z",
    };
    const { merged, nonCapture } = mergeCaptureEvents([legacy, appliedEvent()]);
    expect(merged).toHaveLength(1);
    expect(nonCapture).toHaveLength(1);
    expect(nonCapture[0].event_type).toBe("birdie");
  });
});

describe("largestMover", () => {
  it("finds the biggest absolute mover", () => {
    const m = largestMover({
      prior_totals: { p1: 10, p2: 20, p3: 30 },
      new_totals: { p1: 50, p2: -10, p3: 30 },
    });
    expect(m).toEqual({ playerId: "p1", delta: 40 });
  });

  it("returns a negative delta when a player lost the most", () => {
    const m = largestMover({
      prior_totals: { p1: 10, p2: 20 },
      new_totals: { p1: 10, p2: -100 },
    });
    expect(m).toEqual({ playerId: "p2", delta: -120 });
  });

  it("handles missing totals gracefully", () => {
    expect(largestMover({})).toBeNull();
  });
});

describe("strokesOverPar", () => {
  it("sums strokes minus par sum for played holes", () => {
    const holeScores = {
      p1: { 1: 4, 2: 3, 3: 5 }, // 12
      p2: { 1: 4, 2: 4, 3: 4 }, // 12
      p3: {},                   // nothing played
    };
    const pars = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
    const result = strokesOverPar(holeScores, pars);
    expect(result.p1).toBe(0); // 12 - 12 = 0
    expect(result.p2).toBe(0);
    expect(result.p3).toBeNull();
  });

  it("returns positive for over-par, negative for under-par", () => {
    const holeScores = { p1: { 1: 5 }, p2: { 1: 3 } };
    const pars = [4];
    const result = strokesOverPar(holeScores, pars);
    expect(result.p1).toBe(1);
    expect(result.p2).toBe(-1);
  });
});

describe("CaptureAppliedCard — without hammers", () => {
  it("renders hole range, delta summary, running totals", () => {
    const { merged } = mergeCaptureEvents([appliedEvent(), moneyShiftEvent()]);
    render(
      <CaptureAppliedCard
        merged={merged[0]}
        playerNames={PLAYER_NAMES}
        scorekeeperName="Grant"
      />,
    );
    expect(screen.getByTestId("capture-applied-card")).toBeInTheDocument();
    // Hole label
    expect(screen.getByText(/Capture · Hole 14/)).toBeInTheDocument();
    // Money headline (largest mover: Grant +$40)
    const headline = screen.getByTestId("capture-money-headline");
    expect(headline.textContent).toContain("Grant");
    expect(headline.textContent).toContain("+$40");
    // Stroke summary contains each player
    const strokeSummary = screen.getByTestId("capture-stroke-summary");
    expect(strokeSummary.textContent).toContain("Grant");
    expect(strokeSummary.textContent).toContain("Said");
    // Running totals includes all four players
    const totals = screen.getByTestId("capture-running-totals");
    expect(totals.textContent).toContain("Grant");
    expect(totals.textContent).toContain("Tom");
  });
});

describe("CaptureAppliedCard — with hammer badge", () => {
  it("renders the hammer count badge when hammerHoleCount > 0", () => {
    const { merged } = mergeCaptureEvents([appliedEvent()]);
    render(
      <CaptureAppliedCard
        merged={merged[0]}
        playerNames={PLAYER_NAMES}
        hammerHoleCount={2}
      />,
    );
    expect(screen.getByTestId("capture-applied-hammer-badge")).toBeInTheDocument();
    expect(screen.getByTestId("capture-applied-hammer-badge").textContent).toContain("2 hammers");
  });

  it("omits the hammer badge when hammerHoleCount is 0 or missing", () => {
    const { merged } = mergeCaptureEvents([appliedEvent()]);
    render(
      <CaptureAppliedCard
        merged={merged[0]}
        playerNames={PLAYER_NAMES}
      />,
    );
    expect(screen.queryByTestId("capture-applied-hammer-badge")).not.toBeInTheDocument();
  });
});

describe("CaptureAppliedCard — without money shift", () => {
  it("omits the money-shift headline but still shows delta + totals", () => {
    // applied only — no moneyShift event
    const { merged } = mergeCaptureEvents([appliedEvent()]);
    render(
      <CaptureAppliedCard
        merged={merged[0]}
        playerNames={PLAYER_NAMES}
      />,
    );
    expect(screen.queryByTestId("capture-money-headline")).not.toBeInTheDocument();
    expect(screen.getByTestId("capture-stroke-summary")).toBeInTheDocument();
    expect(screen.getByTestId("capture-running-totals")).toBeInTheDocument();
  });
});

describe("CaptureAppliedCard — photo states", () => {
  it("renders the skeleton while the signed URL resolves", () => {
    const { merged } = mergeCaptureEvents([appliedEvent()]);
    render(
      <CaptureAppliedCard
        merged={merged[0]}
        playerNames={PLAYER_NAMES}
      />,
    );
    // Skeleton shows until the mocked signed URL resolves — testing the
    // initial synchronous render catches it.
    expect(screen.getByTestId("capture-photo-thumbnail-skeleton")).toBeInTheDocument();
  });

  it("renders the missing-photo placeholder when photo_path is null", () => {
    const evt = appliedEvent({}, { photo_path: null });
    const { merged } = mergeCaptureEvents([evt]);
    render(
      <CaptureAppliedCard
        merged={merged[0]}
        playerNames={PLAYER_NAMES}
      />,
    );
    expect(screen.getByTestId("capture-photo-thumbnail-missing")).toBeInTheDocument();
  });
});
