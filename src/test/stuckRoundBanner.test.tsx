import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import {
  isRoundStuck,
  formatRoundAge,
  STUCK_GRACE_MINUTES,
  type StuckRoundCandidate,
} from "@/lib/stuckRound";
import StuckRoundBanner from "@/components/round/StuckRoundBanner";

// ============================================================
// PR #23 commit 1 (D4-B) — Self-service stuck-round recovery.
//
// Coverage:
//   (a) Pure detector: isRoundStuck + formatRoundAge across all edges
//   (b) <StuckRoundBanner /> — two modes (in-progress / stuck), both
//       action handlers wired, confirm dialog gates Abandon
// ============================================================

beforeEach(() => cleanup());

// ---------- (a) pure helpers ----------

describe("isRoundStuck", () => {
  const NOW = new Date("2026-04-22T20:00:00Z");

  it("round WITH currentHole > 0 is never stuck (even old rounds)", () => {
    const round: StuckRoundCandidate = {
      id: "r1",
      created_at: "2026-04-20T08:00:00Z", // 2 days old
      course_details: { game_state: { currentHole: 3 } },
    };
    expect(isRoundStuck(round, NOW)).toBe(false);
  });

  it("round with currentHole=0 + past grace window → stuck", () => {
    const round: StuckRoundCandidate = {
      id: "r1",
      created_at: "2026-04-22T19:45:00Z", // 15 minutes old
      course_details: { game_state: { currentHole: 0 } },
    };
    expect(isRoundStuck(round, NOW)).toBe(true);
  });

  it("round with currentHole=null + past grace window → stuck (Jonathan's case)", () => {
    const round: StuckRoundCandidate = {
      id: "r1",
      created_at: "2026-04-22T17:08:48Z", // ~3 hours old
      course_details: { game_state: { currentHole: null } },
    };
    expect(isRoundStuck(round, NOW)).toBe(true);
  });

  it("round with no game_state at all (fresh insert) + past grace → stuck", () => {
    const round: StuckRoundCandidate = {
      id: "r1",
      created_at: "2026-04-22T19:30:00Z",
      course_details: null,
    };
    expect(isRoundStuck(round, NOW)).toBe(true);
  });

  it("round within grace window → not stuck even with null currentHole", () => {
    const createdAt = new Date(NOW.getTime() - (STUCK_GRACE_MINUTES - 1) * 60_000);
    const round: StuckRoundCandidate = {
      id: "r1",
      created_at: createdAt.toISOString(),
      course_details: { game_state: { currentHole: null } },
    };
    expect(isRoundStuck(round, NOW)).toBe(false);
  });

  it("round exactly at the grace boundary → stuck (>=, not >)", () => {
    const createdAt = new Date(NOW.getTime() - STUCK_GRACE_MINUTES * 60_000);
    const round: StuckRoundCandidate = {
      id: "r1",
      created_at: createdAt.toISOString(),
      course_details: { game_state: { currentHole: null } },
    };
    expect(isRoundStuck(round, NOW)).toBe(true);
  });

  it("invalid created_at string → not stuck (defensive, doesn't crash)", () => {
    const round: StuckRoundCandidate = {
      id: "r1",
      created_at: "not a date",
      course_details: null,
    };
    expect(isRoundStuck(round, NOW)).toBe(false);
  });

  it("constants match spec (10-minute grace)", () => {
    expect(STUCK_GRACE_MINUTES).toBe(10);
  });
});

describe("formatRoundAge", () => {
  const NOW = new Date("2026-04-22T20:00:00Z");

  it("<60 min renders in minutes, plural/singular correct", () => {
    expect(formatRoundAge({ id: "r", created_at: "2026-04-22T19:59:00Z" }, NOW)).toBe("1 minute ago");
    expect(formatRoundAge({ id: "r", created_at: "2026-04-22T19:45:00Z" }, NOW)).toBe("15 minutes ago");
  });

  it("<1 minute clamps up to 1 minute (no '0 minutes')", () => {
    expect(formatRoundAge({ id: "r", created_at: "2026-04-22T19:59:30Z" }, NOW)).toBe("1 minute ago");
  });

  it("<24h renders in hours", () => {
    expect(formatRoundAge({ id: "r", created_at: "2026-04-22T19:00:00Z" }, NOW)).toBe("1 hour ago");
    expect(formatRoundAge({ id: "r", created_at: "2026-04-22T17:00:00Z" }, NOW)).toBe("3 hours ago");
  });

  it(">=24h renders in days", () => {
    expect(formatRoundAge({ id: "r", created_at: "2026-04-21T20:00:00Z" }, NOW)).toBe("1 day ago");
    expect(formatRoundAge({ id: "r", created_at: "2026-04-18T20:00:00Z" }, NOW)).toBe("4 days ago");
  });

  it("invalid date → 'recently' (defensive)", () => {
    expect(formatRoundAge({ id: "r", created_at: "oops" }, NOW)).toBe("recently");
  });
});

// ---------- (b) component ----------

function baseRound(overrides: Partial<StuckRoundCandidate & { course: string }> = {}): StuckRoundCandidate & { course: string } {
  return {
    id: "006181dc-1529-4843-bc50-9fa4ca3a1b46",
    course: "Westlake Country Club",
    created_at: "2026-04-22T17:08:48Z", // 3 hours before the NOW baseline below
    course_details: { game_state: { currentHole: null } },
    ...overrides,
  };
}

const NOW_STUCK = new Date("2026-04-22T20:00:00Z");
const NOW_FRESH = new Date("2026-04-22T17:10:00Z"); // 2 minutes after create

describe("<StuckRoundBanner /> — in-progress mode (NOT stuck)", () => {
  it("renders with data-stuck=false and 'Round In Progress' header", () => {
    render(
      <StuckRoundBanner
        round={baseRound()}
        onResume={() => {}}
        onAbandon={() => {}}
        now={NOW_FRESH}
      />,
    );
    const banner = screen.getByTestId("stuck-round-banner");
    expect(banner).toHaveAttribute("data-stuck", "false");
    expect(banner).toHaveTextContent(/Round In Progress/i);
    expect(banner).toHaveTextContent("Westlake Country Club");
    expect(screen.queryByTestId("stuck-round-age")).not.toBeInTheDocument();
  });

  it("both buttons render with testids", () => {
    render(
      <StuckRoundBanner
        round={baseRound()}
        onResume={() => {}}
        onAbandon={() => {}}
        now={NOW_FRESH}
      />,
    );
    expect(screen.getByTestId("stuck-round-resume")).toHaveTextContent(/Resume/);
    expect(screen.getByTestId("stuck-round-abandon")).toHaveTextContent(/Abandon/);
  });
});

describe("<StuckRoundBanner /> — stuck mode", () => {
  it("renders data-stuck=true + 'Looks Stuck' header + age line", () => {
    render(
      <StuckRoundBanner
        round={baseRound()}
        onResume={() => {}}
        onAbandon={() => {}}
        now={NOW_STUCK}
      />,
    );
    const banner = screen.getByTestId("stuck-round-banner");
    expect(banner).toHaveAttribute("data-stuck", "true");
    expect(banner).toHaveTextContent(/Looks Stuck/i);
    expect(screen.getByTestId("stuck-round-age")).toHaveTextContent(/never reached hole 1/);
  });
});

describe("<StuckRoundBanner /> — action handlers", () => {
  it("Resume tap calls onResume, not onAbandon", () => {
    const onResume = vi.fn();
    const onAbandon = vi.fn();
    render(
      <StuckRoundBanner
        round={baseRound()}
        onResume={onResume}
        onAbandon={onAbandon}
        now={NOW_STUCK}
      />,
    );
    fireEvent.click(screen.getByTestId("stuck-round-resume"));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it("Abandon opens confirm dialog; dialog's Keep It closes without calling onAbandon", () => {
    const onAbandon = vi.fn();
    render(
      <StuckRoundBanner
        round={baseRound()}
        onResume={() => {}}
        onAbandon={onAbandon}
        now={NOW_STUCK}
      />,
    );
    expect(screen.queryByTestId("stuck-round-abandon-confirm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stuck-round-abandon"));
    expect(screen.getByTestId("stuck-round-abandon-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stuck-round-abandon-cancel"));
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it("Abandon → Abandon Round in the dialog triggers onAbandon exactly once", async () => {
    const onAbandon = vi.fn().mockResolvedValue(undefined);
    render(
      <StuckRoundBanner
        round={baseRound()}
        onResume={() => {}}
        onAbandon={onAbandon}
        now={NOW_STUCK}
      />,
    );
    fireEvent.click(screen.getByTestId("stuck-round-abandon"));
    fireEvent.click(screen.getByTestId("stuck-round-abandon-submit"));
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  it("abandoning=true disables both buttons + dialog submit + swaps label", () => {
    render(
      <StuckRoundBanner
        round={baseRound()}
        onResume={() => {}}
        onAbandon={() => {}}
        abandoning={true}
        now={NOW_STUCK}
      />,
    );
    expect(screen.getByTestId("stuck-round-abandon")).toBeDisabled();
    expect(screen.getByTestId("stuck-round-abandon")).toHaveTextContent(/Abandoning…/);
    expect(screen.getByTestId("stuck-round-resume")).toBeDisabled();
  });
});

// ---------- (c) feed wiring (source-level) ----------

describe("CrybabyFeed — StuckRoundBanner wiring (source-level)", () => {
  it("imports StuckRoundBanner + cancelRound", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabyFeed.jsx"), "utf-8");
    expect(src).toMatch(/import StuckRoundBanner from "@\/components\/round\/StuckRoundBanner"/);
    expect(src).toMatch(/cancelRound/);
  });

  it("renders StuckRoundBanner in place of the old inline banner", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabyFeed.jsx"), "utf-8");
    expect(src).toMatch(/<StuckRoundBanner[\s\S]*?round=\{activeRound\}/);
    expect(src).toMatch(/onAbandon=\{async \(\) => \{[\s\S]*?await cancelRound\(activeRound\.id\);[\s\S]*?setActiveRound\(null\);/);
    expect(src).toMatch(/onResume=\{\(\) => navigate\(`\/round\?id=\$\{activeRound\.id\}`\)/);
  });

  it("declares abandoningRound state to disable buttons during the cancel flight", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabyFeed.jsx"), "utf-8");
    expect(src).toMatch(/\[abandoningRound,\s*setAbandoningRound\]/);
  });

  it("old inline banner is gone (regression guard)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabyFeed.jsx"), "utf-8");
    // The old banner's unique markup — `<ParFlagIcon size={22}` appeared
    // only in that banner. If it's back, someone reverted the refactor.
    expect(src).not.toMatch(/<ParFlagIcon size=\{22\}/);
  });
});

describe("loadActiveRound — SELECT now includes course_details (source-level)", () => {
  it("ROUND_COLS string includes course_details for the stuck detector", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/lib/db.ts"), "utf-8");
    expect(src).toMatch(/const ROUND_COLS = "[^"]*course_details[^"]*"/);
  });
});
