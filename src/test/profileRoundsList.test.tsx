import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProfileRoundsList from "@/components/profile/ProfileRoundsList";
import RoundCard from "@/components/profile/RoundCard";
import {
  applyDateFilter,
  cumulativePnl,
  groupRounds,
  formatCardDate,
  gameModeLabel,
  playerPnl,
  playerScore,
  partnerNames,
} from "@/components/profile/roundMath";
import type { UserRoundSummary } from "@/lib/db";

// ============================================================
// Part 1 — profile rounds list tests.
//
// Unit coverage for the pure math helpers + render coverage for
// the component (empty state, month/year expand, filter dropdown,
// privacy hide, date-year-suppress).
// ============================================================

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    loadUserRounds: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
beforeEach(async () => {
  db = await import("@/lib/db");
  vi.clearAllMocks();
  cleanup();
});

function renderWithRouter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function mkRound(partial: Partial<UserRoundSummary>, id: string, createdAt: string): UserRoundSummary {
  return {
    id,
    course: "Austin CC",
    game_type: "drivers_others_carts",
    status: "completed",
    created_at: createdAt,
    course_details: { pars: Array(18).fill(4) },
    round_players: [
      { id: `${id}-p1`, user_id: "viewer", guest_name: null, hole_scores: Array(18).fill(4), total_score: 72, is_scorekeeper: true },
    ],
    round_settlements: [{ user_id: "viewer", guest_name: null, amount: 0 }],
    participant_names: { viewer: "Jonathan" },
    ...partial,
  };
}

// ============================================================
// Pure math helpers
// ============================================================

describe("roundMath — applyDateFilter", () => {
  const now = new Date("2026-04-19T12:00:00Z");
  const rounds = [
    mkRound({}, "a", "2026-04-10T12:00:00Z"), // 9 days ago
    mkRound({}, "b", "2026-02-15T12:00:00Z"), // ~63 days ago
    mkRound({}, "c", "2025-10-01T12:00:00Z"), // >180 days
  ];

  it("all-time returns everything", () => {
    expect(applyDateFilter(rounds, "all", now)).toHaveLength(3);
  });
  it("30d keeps only the last 30 days", () => {
    const out = applyDateFilter(rounds, "30d", now).map(r => r.id);
    expect(out).toEqual(["a"]);
  });
  it("90d keeps last 90 days", () => {
    const out = applyDateFilter(rounds, "90d", now).map(r => r.id);
    expect(out).toEqual(["a", "b"]);
  });
});

describe("roundMath — cumulativePnl", () => {
  it("sums settlements for the given user, skipping null settlement rounds", () => {
    const r1 = mkRound({ round_settlements: [{ user_id: "viewer", guest_name: null, amount: 40 }] }, "a", "2026-04-10T00:00:00Z");
    const r2 = mkRound({ round_settlements: [{ user_id: "viewer", guest_name: null, amount: -20 }] }, "b", "2026-04-11T00:00:00Z");
    const r3 = mkRound({ round_settlements: [] }, "c", "2026-04-12T00:00:00Z"); // solo / no money
    expect(cumulativePnl([r1, r2, r3], "viewer")).toBe(20);
  });

  it("returns 0 when user has no settlement rows on any round", () => {
    const r = mkRound({ round_settlements: [{ user_id: "someone-else", guest_name: null, amount: 10 }] }, "a", "2026-04-10T00:00:00Z");
    expect(cumulativePnl([r], "viewer")).toBe(0);
  });
});

describe("roundMath — groupRounds", () => {
  const now = new Date("2026-04-19T12:00:00Z");

  it("returns empty collections for an empty list", () => {
    const g = groupRounds([], now);
    expect(g.recent).toEqual([]);
    expect(g.currentYearMonths).toEqual([]);
    expect(g.priorYears).toEqual([]);
  });

  it("puts the 5 most-recent into recent[] and nothing else", () => {
    const rs = Array.from({ length: 4 }, (_, i) =>
      mkRound({}, `r${i}`, `2026-04-${10 + i}T00:00:00Z`),
    );
    const g = groupRounds(rs.reverse(), now); // reverse: newest-first per contract
    expect(g.recent).toHaveLength(4);
    expect(g.currentYearMonths).toEqual([]);
    expect(g.priorYears).toEqual([]);
  });

  it("overflow rounds group into current-year months, newest-first", () => {
    const rs: UserRoundSummary[] = [];
    // 5 recent (April)
    for (let i = 0; i < 5; i++) rs.push(mkRound({}, `apr-${i}`, `2026-04-${18 - i}T12:00:00Z`));
    // 2 extra in March, 1 in February
    rs.push(mkRound({}, "mar-1", "2026-03-15T00:00:00Z"));
    rs.push(mkRound({}, "mar-2", "2026-03-05T00:00:00Z"));
    rs.push(mkRound({}, "feb-1", "2026-02-10T00:00:00Z"));
    const g = groupRounds(rs, now);
    expect(g.recent).toHaveLength(5);
    expect(g.currentYearMonths.map(m => m.label)).toEqual(["March 2026", "February 2026"]);
    expect(g.currentYearMonths[0].rounds).toHaveLength(2);
    expect(g.currentYearMonths[1].rounds).toHaveLength(1);
  });

  it("rounds from prior years bucket into priorYears → months", () => {
    const rs: UserRoundSummary[] = [];
    for (let i = 0; i < 5; i++) rs.push(mkRound({}, `2026-${i}`, `2026-04-${18 - i}T12:00:00Z`));
    // noon UTC so the local-time getMonth() lands on the same calendar date in any tz.
    rs.push(mkRound({}, "2025-dec", "2025-12-12T12:00:00Z"));
    rs.push(mkRound({}, "2025-jun", "2025-06-15T12:00:00Z"));
    rs.push(mkRound({}, "2024-feb", "2024-02-14T12:00:00Z"));
    const g = groupRounds(rs, now);
    expect(g.priorYears.map(y => y.year)).toEqual([2025, 2024]);
    const y2025 = g.priorYears[0];
    expect(y2025.months.map(m => m.label)).toEqual(["December 2025", "June 2025"]);
  });
});

describe("roundMath — formatCardDate", () => {
  it("suppresses year when round is in context year", () => {
    expect(formatCardDate("2026-04-15T12:00:00Z", 2026)).toBe("Apr 15");
  });
  it("includes year when different from context", () => {
    expect(formatCardDate("2025-04-15T12:00:00Z", 2026)).toBe("Apr 15, 2025");
  });
});

describe("roundMath — gameModeLabel", () => {
  it("maps known tokens", () => {
    expect(gameModeLabel("drivers_others_carts")).toBe("DOC");
    expect(gameModeLabel("solo")).toBe("Solo");
    expect(gameModeLabel("nassau")).toBe("Nassau");
  });
  it("returns raw token for unknowns", () => {
    expect(gameModeLabel("hypothetical_mode")).toBe("hypothetical_mode");
  });
});

describe("roundMath — playerScore", () => {
  it("sums hole_scores when provided as an object map", () => {
    const r = mkRound(
      {
        course_details: { pars: [4, 4, 4, 4, 4, 4, 4, 4, 4] },
        round_players: [{
          id: "p", user_id: "viewer", guest_name: null,
          hole_scores: { "1": 5, "2": 4, "3": 4, "4": 5, "5": 4, "6": 4, "7": 4, "8": 4, "9": 4 },
          total_score: 38, is_scorekeeper: true,
        }],
      },
      "a",
      "2026-04-10T00:00:00Z",
    );
    const s = playerScore(r, "viewer");
    expect(s?.total).toBe(38);
    expect(s?.par).toBe(36);
    expect(s?.diff).toBe(2);
  });
  it("returns null when viewer didn't play", () => {
    const r = mkRound({ round_players: [{ id: "p", user_id: "someone-else", guest_name: null, hole_scores: [4, 4], total_score: 8, is_scorekeeper: true }] }, "a", "2026-04-10T00:00:00Z");
    expect(playerScore(r, "viewer")).toBeNull();
  });
});

describe("roundMath — partnerNames", () => {
  it("includes other players' names, excludes viewer", () => {
    const r = mkRound(
      {
        round_players: [
          { id: "p1", user_id: "viewer", guest_name: null, hole_scores: [4], total_score: 4, is_scorekeeper: true },
          { id: "p2", user_id: "u2", guest_name: null, hole_scores: [4], total_score: 4, is_scorekeeper: false },
          { id: "p3", user_id: null, guest_name: "Grant", hole_scores: [5], total_score: 5, is_scorekeeper: false },
        ],
        participant_names: { viewer: "Jonathan", u2: "Said" },
      },
      "a",
      "2026-04-10T00:00:00Z",
    );
    const out = partnerNames(r, "viewer");
    expect(out.names).toEqual(["Said", "Grant"]);
    expect(out.overflow).toBe(0);
  });

  it("overflow when > max names", () => {
    const r = mkRound(
      {
        round_players: [
          { id: "p1", user_id: "viewer", guest_name: null, hole_scores: [4], total_score: 4, is_scorekeeper: true },
          { id: "p2", user_id: "u2", guest_name: null, hole_scores: [4], total_score: 4, is_scorekeeper: false },
          { id: "p3", user_id: null, guest_name: "B", hole_scores: [5], total_score: 5, is_scorekeeper: false },
          { id: "p4", user_id: null, guest_name: "C", hole_scores: [5], total_score: 5, is_scorekeeper: false },
          { id: "p5", user_id: null, guest_name: "D", hole_scores: [5], total_score: 5, is_scorekeeper: false },
        ],
        participant_names: { u2: "Said" },
      },
      "a",
      "2026-04-10T00:00:00Z",
    );
    const out = partnerNames(r, "viewer", 3);
    expect(out.names).toHaveLength(3);
    expect(out.overflow).toBe(1);
  });
});

describe("roundMath — playerPnl", () => {
  it("returns null for non-money rounds (no settlement rows)", () => {
    const r = mkRound({ round_settlements: [] }, "a", "2026-04-10T00:00:00Z");
    expect(playerPnl(r, "viewer")).toBeNull();
  });
  it("returns 0 when viewer has no row but round had settlements", () => {
    const r = mkRound({ round_settlements: [{ user_id: "someone-else", guest_name: null, amount: 10 }] }, "a", "2026-04-10T00:00:00Z");
    expect(playerPnl(r, "viewer")).toBe(0);
  });
});

// ============================================================
// RoundCard render + RTL interaction
// ============================================================

describe("<RoundCard /> rendering", () => {
  it("renders date+course / mode+score / partners / View details link", () => {
    const r = mkRound(
      {
        course: "Austin CC",
        game_type: "drivers_others_carts",
        round_settlements: [{ user_id: "viewer", guest_name: null, amount: 40 }],
        round_players: [
          { id: "p1", user_id: "viewer", guest_name: null, hole_scores: Array(18).fill(5), total_score: 90, is_scorekeeper: true },
          { id: "p2", user_id: "u2", guest_name: null, hole_scores: Array(18).fill(4), total_score: 72, is_scorekeeper: false },
          { id: "p3", user_id: null, guest_name: "Grant", hole_scores: Array(18).fill(4), total_score: 72, is_scorekeeper: false },
        ],
        participant_names: { viewer: "Jonathan", u2: "Said" },
      },
      "round-abc",
      "2026-04-15T12:00:00Z",
    );
    renderWithRouter(<RoundCard round={r} viewerUserId="viewer" contextYear={2026} />);
    expect(screen.getByText("Austin CC")).toBeInTheDocument();
    expect(screen.getByText("Apr 15")).toBeInTheDocument();
    // Mode
    expect(screen.getByText("DOC")).toBeInTheDocument();
    // Score total + diff
    expect(screen.getByText("90")).toBeInTheDocument();
    // Partners
    expect(screen.getByText(/Said, Grant/)).toBeInTheDocument();
    // Money
    expect(screen.getByTestId("round-card-round-abc-pnl")).toHaveTextContent("+$40");
    // Link
    const link = screen.getByTestId("round-card-round-abc-details");
    expect(link).toHaveAttribute("href", "/round/round-abc/summary");
  });

  it("shows year when round is from a prior year (different context)", () => {
    const r = mkRound({}, "round-old", "2025-04-15T12:00:00Z");
    renderWithRouter(<RoundCard round={r} viewerUserId="viewer" contextYear={2026} />);
    expect(screen.getByText("Apr 15, 2025")).toBeInTheDocument();
  });

  it("omits the P&L chip for non-money rounds", () => {
    const r = mkRound({ round_settlements: [] }, "round-solo", "2026-04-10T12:00:00Z");
    renderWithRouter(<RoundCard round={r} viewerUserId="viewer" contextYear={2026} />);
    expect(screen.queryByTestId("round-card-round-solo-pnl")).not.toBeInTheDocument();
  });
});

// ============================================================
// <ProfileRoundsList /> interactions
// ============================================================

describe("<ProfileRoundsList />", () => {
  it("renders empty state when the target has no rounds", async () => {
    db.loadUserRounds.mockResolvedValue([]);
    renderWithRouter(<ProfileRoundsList targetUserId="u1" viewerUserId="u1" />);
    expect(await screen.findByTestId("rounds-list-empty")).toBeInTheDocument();
  });

  it("renders hidden-line when hideAllRounds is true and skips the query", () => {
    db.loadUserRounds.mockResolvedValue([]); // should never be called
    renderWithRouter(<ProfileRoundsList targetUserId="u2" viewerUserId="u1" hideAllRounds />);
    expect(screen.getByTestId("rounds-list-hidden")).toHaveTextContent(/hidden their rounds/i);
    expect(db.loadUserRounds).not.toHaveBeenCalled();
  });

  it("renders 5 recent rounds as always-expanded cards", async () => {
    const now = Date.now();
    const rounds = Array.from({ length: 5 }, (_, i) =>
      mkRound({}, `r${i}`, new Date(now - i * 86400_000).toISOString()),
    );
    db.loadUserRounds.mockResolvedValue(rounds);
    renderWithRouter(<ProfileRoundsList targetUserId="viewer" viewerUserId="viewer" />);
    await screen.findByTestId("rounds-section-recent");
    for (const r of rounds) {
      expect(screen.getByTestId(`recent-${r.id}`)).toBeInTheDocument();
    }
  });

  it("current-year months render collapsed; tapping toggles expand and a second tap collapses", async () => {
    const now = Date.now();
    const rounds: UserRoundSummary[] = [];
    for (let i = 0; i < 5; i++) rounds.push(mkRound({}, `apr-${i}`, new Date(now - i * 86400_000).toISOString())); // recent
    rounds.push(mkRound({}, "mar-1", "2026-03-15T00:00:00Z"));
    db.loadUserRounds.mockResolvedValue(rounds);
    renderWithRouter(<ProfileRoundsList targetUserId="viewer" viewerUserId="viewer" />);
    await screen.findByTestId("rounds-section-recent");

    const monthToggle = screen.getByTestId("month-2026-03-toggle");
    expect(monthToggle).toHaveAttribute("aria-expanded", "false");
    // Card not rendered yet.
    expect(screen.queryByTestId("month-2026-03-card-mar-1")).not.toBeInTheDocument();

    fireEvent.click(monthToggle);
    expect(monthToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("month-2026-03-card-mar-1")).toBeInTheDocument();

    fireEvent.click(monthToggle);
    expect(monthToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("two months can be expanded simultaneously", async () => {
    const rounds: UserRoundSummary[] = [];
    const now = Date.now();
    for (let i = 0; i < 5; i++) rounds.push(mkRound({}, `apr-${i}`, new Date(now - i * 86400_000).toISOString()));
    rounds.push(mkRound({}, "mar-1", "2026-03-15T00:00:00Z"));
    rounds.push(mkRound({}, "feb-1", "2026-02-10T00:00:00Z"));
    db.loadUserRounds.mockResolvedValue(rounds);
    renderWithRouter(<ProfileRoundsList targetUserId="viewer" viewerUserId="viewer" />);
    await screen.findByTestId("rounds-section-recent");

    fireEvent.click(screen.getByTestId("month-2026-03-toggle"));
    fireEvent.click(screen.getByTestId("month-2026-02-toggle"));
    expect(screen.getByTestId("month-2026-03-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("month-2026-02-toggle")).toHaveAttribute("aria-expanded", "true");
  });

  it("year header expands to reveal months; months independently expandable", async () => {
    const rounds: UserRoundSummary[] = [];
    const now = Date.now();
    for (let i = 0; i < 5; i++) rounds.push(mkRound({}, `apr-${i}`, new Date(now - i * 86400_000).toISOString()));
    rounds.push(mkRound({}, "dec-2025", "2025-12-10T00:00:00Z"));
    db.loadUserRounds.mockResolvedValue(rounds);
    renderWithRouter(<ProfileRoundsList targetUserId="viewer" viewerUserId="viewer" />);
    await screen.findByTestId("rounds-section-recent");

    const yearToggle = screen.getByTestId("year-2025-toggle");
    expect(yearToggle).toHaveAttribute("aria-expanded", "false");
    // Inner month not rendered yet.
    expect(screen.queryByTestId("year-2025-month-2025-12-toggle")).not.toBeInTheDocument();

    fireEvent.click(yearToggle);
    expect(yearToggle).toHaveAttribute("aria-expanded", "true");
    const innerMonth = screen.getByTestId("year-2025-month-2025-12-toggle");
    expect(innerMonth).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(innerMonth);
    expect(innerMonth).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("year-2025-month-2025-12-card-dec-2025")).toBeInTheDocument();
  });

  it("filter dropdown updates the cumulative total", async () => {
    const old = mkRound({ round_settlements: [{ user_id: "viewer", guest_name: null, amount: 100 }] }, "old", "2026-01-01T00:00:00Z");
    const recent = mkRound({ round_settlements: [{ user_id: "viewer", guest_name: null, amount: 40 }] }, "recent", new Date(Date.now() - 5 * 86400_000).toISOString());
    db.loadUserRounds.mockResolvedValue([recent, old]);
    renderWithRouter(<ProfileRoundsList targetUserId="viewer" viewerUserId="viewer" />);
    const cumulative = await screen.findByTestId("rounds-cumulative-pnl");
    expect(cumulative).toHaveTextContent("+ $140"); // both
    fireEvent.change(screen.getByTestId("rounds-date-filter"), { target: { value: "30d" } });
    expect(screen.getByTestId("rounds-cumulative-pnl")).toHaveTextContent("+ $40"); // only recent
  });
});

// ============================================================
// Migration shape + types.ts shape
// ============================================================

describe("Part 1 — migration + types shape", () => {
  it("rounds_visible_to_friends column migration exists and defaults to true", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260419030000_rounds_visible_to_friends.sql"),
      "utf-8",
    );
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS rounds_visible_to_friends BOOLEAN NOT NULL DEFAULT true/);
    expect(src).toMatch(/COMMENT ON COLUMN public\.profiles\.rounds_visible_to_friends/);
  });

  it("types.ts picks up rounds_visible_to_friends on Row/Insert/Update", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/integrations/supabase/types.ts"),
      "utf-8",
    );
    expect(src).toMatch(/profiles:[\s\S]*?Row:[\s\S]*?rounds_visible_to_friends:\s*boolean/);
    expect(src).toMatch(/profiles:[\s\S]*?Insert:[\s\S]*?rounds_visible_to_friends\?:\s*boolean/);
    expect(src).toMatch(/profiles:[\s\S]*?Update:[\s\S]*?rounds_visible_to_friends\?:\s*boolean/);
  });

  it("ProfilePage exposes a rounds-visibility toggle matching the handicap pattern", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/ProfilePage.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/rounds-visibility-toggle/);
    expect(src).toMatch(/Show my rounds to other users/);
    expect(src).toMatch(/rounds_visible_to_friends: editForm\.rounds_visible_to_friends/);
  });

  it("UserProfilePage passes hideAllRounds based on the viewed user's flag", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/UserProfilePage.tsx"),
      "utf-8",
    );
    expect(src).toMatch(
      /hideAllRounds=\{[\s\S]*?profile\.rounds_visible_to_friends\s*===\s*false[\s\S]*?\}/,
    );
  });
});
