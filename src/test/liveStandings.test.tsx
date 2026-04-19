import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock Supabase client before importing LiveStandings.
// We provide:
//   - A channel builder that captures the postgres_changes callback so
//     tests can fire fake realtime events.
//   - A stubbed loadRoundEvents so refresh() returns what the test sets.
const onEventCallbacks: Array<() => void> = [];
const mockLoadRoundEvents = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (_name: string) => ({
      on: (_t: string, _f: unknown, cb: () => void) => {
        onEventCallbacks.push(cb);
        return {
          on: (_t2: string, _f2: unknown, cb2: () => void) => {
            onEventCallbacks.push(cb2);
            return { subscribe: () => ({}) };
          },
          subscribe: () => ({}),
        };
      },
      subscribe: () => ({}),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  loadRoundEvents: (...args: unknown[]) => mockLoadRoundEvents(...args),
}));

import LiveStandings from "@/components/round/LiveStandings";

const PLAYER_NAMES = { p1: "Grant", p2: "Said", p3: "Jonathan", p4: "Tom" };
const PARS = [4, 4, 3, 4, 5, 4, 3, 5, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];

beforeEach(() => {
  onEventCallbacks.length = 0;
  mockLoadRoundEvents.mockReset();
  mockLoadRoundEvents.mockResolvedValue([]);
});

describe("LiveStandings — initial render without captures", () => {
  it("shows 4 players with strokes derived from initialHoleScores and zero money", async () => {
    mockLoadRoundEvents.mockResolvedValue([]);
    render(
      <LiveStandings
        roundId="r1"
        playerNames={PLAYER_NAMES}
        gameLabel="Nassau"
        pars={PARS}
        initialHoleScores={{
          p1: { 1: 4, 2: 3 }, // 7 - 8 = -1
          p2: { 1: 5, 2: 5 }, // 10 - 8 = +2
          p3: { 1: 4, 2: 4 }, // 8 - 8 = 0
          p4: {},              // null
        }}
        initialTotals={{ p1: 0, p2: 0, p3: 0, p4: 0 }}
      />,
    );
    // Wait for the async refresh to settle (it's a no-op here because no events).
    await waitFor(() => expect(screen.getByTestId("live-standings")).toBeInTheDocument());
    // Rows present for all players.
    expect(screen.getByTestId("live-standings-row-p1")).toBeInTheDocument();
    expect(screen.getByTestId("live-standings-row-p2")).toBeInTheDocument();
    // Stroke indicator: Grant -1, Said +3, Jonathan E, Tom —
    expect(screen.getByTestId("live-standings-strokes-p1").textContent).toContain("-1");
    expect(screen.getByTestId("live-standings-strokes-p2").textContent).toContain("+2");
    expect(screen.getByTestId("live-standings-strokes-p3").textContent).toContain("E");
    expect(screen.getByTestId("live-standings-strokes-p4").textContent).toContain("—");
    // Money all zero.
    expect(screen.getByTestId("live-standings-money-p1").textContent).toBe("$0");
  });
});

describe("LiveStandings — updates on realtime event", () => {
  it("re-renders with new running_totals when a capture_applied event arrives", async () => {
    // Start with no events; after the realtime trigger fires, refresh()
    // returns an event with new totals.
    mockLoadRoundEvents.mockResolvedValueOnce([]);
    const { rerender: _rerender } = render(
      <LiveStandings
        roundId="r1"
        playerNames={PLAYER_NAMES}
        gameLabel="DOC"
        pars={PARS}
        initialTotals={{ p1: 0, p2: 0, p3: 0, p4: 0 }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("live-standings")).toBeInTheDocument());
    // Money still zero.
    expect(screen.getByTestId("live-standings-money-p1").textContent).toBe("$0");

    // Fake the realtime trigger. Set up the next loadRoundEvents response.
    mockLoadRoundEvents.mockResolvedValueOnce([
      {
        id: "evt-a",
        round_id: "r1",
        hole_number: 5,
        event_type: "capture_applied",
        event_data: {
          capture_id: "c1",
          delta: [{ playerId: "p1", hole: 5, prior: 4, next: 3 }],
          running_totals: { p1: 20, p2: -10, p3: 5, p4: -15 },
        },
        created_at: "2026-04-19T01:00:00Z",
      },
    ]);
    // Fire every captured callback (simulates realtime notification).
    onEventCallbacks.forEach(cb => cb());

    await waitFor(() =>
      expect(screen.getByTestId("live-standings-money-p1").textContent).toBe("+$20"),
    );
    expect(screen.getByTestId("live-standings-money-p2").textContent).toBe("−$10");
    // Sort by money desc: Grant first row, Tom last row.
    const rows = screen.getAllByTestId(/^live-standings-row-/);
    expect(rows[0].getAttribute("data-testid")).toBe("live-standings-row-p1");
    expect(rows[rows.length - 1].getAttribute("data-testid")).toBe("live-standings-row-p4");
  });
});

describe("LiveStandings — solo round (no money)", () => {
  it("hideMoney hides the money column", async () => {
    mockLoadRoundEvents.mockResolvedValue([]);
    render(
      <LiveStandings
        roundId="r-solo"
        playerNames={{ p1: "Grant" }}
        gameLabel="Solo"
        pars={PARS}
        initialHoleScores={{ p1: { 1: 4 } }}
        hideMoney
      />,
    );
    await waitFor(() => expect(screen.getByTestId("live-standings-row-p1")).toBeInTheDocument());
    expect(screen.queryByTestId("live-standings-money-p1")).not.toBeInTheDocument();
    // Stroke column still renders.
    expect(screen.getByTestId("live-standings-strokes-p1")).toBeInTheDocument();
  });
});

describe("LiveStandings — collapsed state", () => {
  it("toggling the header hides and shows the rows", async () => {
    mockLoadRoundEvents.mockResolvedValue([]);
    render(
      <LiveStandings
        roundId="r1"
        playerNames={PLAYER_NAMES}
        gameLabel="Nassau"
        pars={PARS}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("live-standings")).toBeInTheDocument());
    // Initially expanded — rows visible.
    expect(screen.getByTestId("live-standings-row-p1")).toBeInTheDocument();
    const toggle = screen.getByTestId("live-standings-toggle");
    fireEvent.click(toggle);
    // After toggle, rows hidden.
    expect(screen.queryByTestId("live-standings-row-p1")).not.toBeInTheDocument();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    // Re-expanded.
    expect(screen.getByTestId("live-standings-row-p1")).toBeInTheDocument();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("LiveStandings — open hammer badge", () => {
  it("renders the hammer badge on players in openHammerPlayerIds", async () => {
    mockLoadRoundEvents.mockResolvedValue([]);
    render(
      <LiveStandings
        roundId="r1"
        playerNames={PLAYER_NAMES}
        gameLabel="DOC"
        pars={PARS}
        openHammerPlayerIds={["p1", "p3"]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("live-standings-row-p1")).toBeInTheDocument());
    expect(screen.getByTestId("live-standings-hammer-badge-p1")).toBeInTheDocument();
    expect(screen.getByTestId("live-standings-hammer-badge-p3")).toBeInTheDocument();
    expect(screen.queryByTestId("live-standings-hammer-badge-p2")).not.toBeInTheDocument();
  });
});
