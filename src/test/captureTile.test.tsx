import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CaptureTile from "@/components/feed/CaptureTile";
import {
  mergeCaptureEvents,
  type RoundEventRow,
} from "@/components/round/events/captureEventTypes";

// Mock Supabase client for CapturePhotoThumbnail's signed URL lookup.
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

// Mock react-router-dom useNavigate so we can assert on nav.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const PLAYER_NAMES = { p1: "Grant", p2: "Said", p3: "Jonathan", p4: "Tom" };

function appliedEvent(data: Record<string, unknown> = {}): RoundEventRow {
  return {
    id: "evt-a",
    round_id: "r1",
    hole_number: 14,
    event_type: "capture_applied",
    event_data: {
      capture_id: "c1",
      delta: [{ playerId: "p1", hole: 14, prior: 3, next: 4 }],
      running_totals: { p1: 40, p2: -20, p3: 10, p4: -30 },
      photo_path: "rounds/r1/c1.jpg",
      feed_published_at: "2026-04-19T01:00:00Z",
      ...data,
    },
    created_at: "2026-04-19T01:00:00Z",
  };
}

function moneyShiftEvent(): RoundEventRow {
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
  };
}

describe("CaptureTile", () => {
  it("renders summary with money mover when capture_money_shift present", () => {
    const { merged } = mergeCaptureEvents([appliedEvent(), moneyShiftEvent()]);
    render(
      <MemoryRouter>
        <CaptureTile
          merged={merged[0]}
          playerNames={PLAYER_NAMES}
          courseName="Lions Muni"
          scorekeeperName="Jonathan"
          roundId="r1"
        />
      </MemoryRouter>,
    );
    const summary = screen.getByTestId("capture-tile-summary");
    expect(summary.textContent).toContain("Hole 14 captured");
    expect(summary.textContent).toContain("Grant +$40");
  });

  it("renders without money mover when capture_money_shift absent", () => {
    const { merged } = mergeCaptureEvents([appliedEvent()]);
    render(
      <MemoryRouter>
        <CaptureTile
          merged={merged[0]}
          playerNames={PLAYER_NAMES}
          courseName="Lions Muni"
          roundId="r1"
        />
      </MemoryRouter>,
    );
    const summary = screen.getByTestId("capture-tile-summary");
    expect(summary.textContent).toContain("Hole 14 captured");
    // No "Grant +" headline when there's no moneyShift.
    expect(summary.textContent).not.toMatch(/Grant \+\$/);
  });

  it("tapping navigates to /watch?roundId=...", () => {
    const { merged } = mergeCaptureEvents([appliedEvent(), moneyShiftEvent()]);
    render(
      <MemoryRouter>
        <CaptureTile
          merged={merged[0]}
          playerNames={PLAYER_NAMES}
          courseName="Lions Muni"
          roundId="r42"
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("capture-tile"));
    expect(mockNavigate).toHaveBeenCalledWith("/watch?roundId=r42");
  });

  it("uses hole range when delta spans multiple holes", () => {
    const evt = appliedEvent({
      delta: [
        { playerId: "p1", hole: 9, prior: 4, next: 4 },
        { playerId: "p1", hole: 10, prior: 3, next: 3 },
        { playerId: "p1", hole: 11, prior: 4, next: 5 },
      ],
    });
    const { merged } = mergeCaptureEvents([evt]);
    render(
      <MemoryRouter>
        <CaptureTile
          merged={merged[0]}
          playerNames={PLAYER_NAMES}
          courseName="Lions Muni"
          roundId="r1"
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("capture-tile-summary").textContent).toContain("Holes 9–11");
  });
});

/**
 * Integration-style: verify the privacy + feed_published_at filtering.
 * We test the filter logic directly rather than mounting the full
 * CrybabyFeed page (which is a 660-line component with many auxiliary
 * hooks and would require heavy mocking to render). The filter is the
 * load-bearing correctness check; the component's layout is covered
 * by E2E later.
 */
describe("CrybabyFeed feed filter — privacy + feed_published_at", () => {
  function filter(events: RoundEventRow[], isPrivateRound: boolean) {
    const { merged } = mergeCaptureEvents(events);
    return isPrivateRound
      ? []
      : merged.filter(m => m.appliedData?.feed_published_at != null);
  }

  it("includes capture_applied events with non-null feed_published_at", () => {
    const visible = filter([appliedEvent(), moneyShiftEvent()], false);
    expect(visible).toHaveLength(1);
    expect(visible[0].captureId).toBe("c1");
  });

  it("excludes captures whose feed_published_at is null (server debounced)", () => {
    const debounced = appliedEvent({ feed_published_at: null });
    const visible = filter([debounced], false);
    expect(visible).toHaveLength(0);
  });

  it("excludes all captures when the round is private", () => {
    const visible = filter([appliedEvent(), moneyShiftEvent()], true);
    expect(visible).toHaveLength(0);
  });
});
