import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as fs from "fs";
import * as path from "path";

import {
  computeFlipSettlementSplit,
  roundHasFlipSettlementSplit,
} from "@/lib/flipCrybaby";
import type { HoleResult } from "@/lib/gameEngines";
import RoundDetailPage from "@/pages/RoundDetailPage";

// ============================================================
// C7 — Two-component settlement split for Flip rounds.
//
// Pure math (computeFlipSettlementSplit, roundHasFlipSettlementSplit)
// + round-detail UI rendering (three-line breakdown per player)
// + source-level wiring checks for CrybabyActiveRound settlement
// compute + apply-capture edge function + db insertSettlements /
// loadRoundDetail types.
// ============================================================

function hole(
  h: number,
  amounts: Record<string, number>,
): HoleResult & { hole: number } {
  return {
    hole: h,
    winnerIds: [],
    holeValue: 5,
    carryOver: 0,
    playerResults: Object.entries(amounts).map(([id, amount]) => ({
      id,
      name: id,
      amount,
    })),
  };
}

beforeEach(() => cleanup());

// ============================================================
// Pure helpers
// ============================================================

describe("roundHasFlipSettlementSplit", () => {
  it("returns true for flip, false for everything else", () => {
    expect(roundHasFlipSettlementSplit("flip")).toBe(true);
    expect(roundHasFlipSettlementSplit("drivers_others_carts")).toBe(false);
    expect(roundHasFlipSettlementSplit("skins")).toBe(false);
    expect(roundHasFlipSettlementSplit("nassau")).toBe(false);
    expect(roundHasFlipSettlementSplit("wolf")).toBe(false);
    expect(roundHasFlipSettlementSplit("custom")).toBe(false);
  });
});

describe("computeFlipSettlementSplit — crybaby played", () => {
  it("sums 1-15 into baseAmount, 16-18 into crybabyAmount", () => {
    const holes = [
      hole(1, { p1: 5, p2: -5 }),
      hole(10, { p1: 10, p2: -10 }),
      hole(15, { p1: -2, p2: 2 }),
      hole(16, { p1: 15, p2: -15 }),
      hole(17, { p1: 0, p2: 0 }), // push
      hole(18, { p1: -30, p2: 30 }),
    ];
    const p1 = computeFlipSettlementSplit(holes, "p1", true);
    expect(p1.baseAmount).toBe(13); // 5 + 10 - 2
    expect(p1.crybabyAmount).toBe(-15); // 15 + 0 - 30
    expect(p1.baseAmount + p1.crybabyAmount).toBe(-2); // combined

    const p2 = computeFlipSettlementSplit(holes, "p2", true);
    expect(p2.baseAmount).toBe(-13);
    expect(p2.crybabyAmount).toBe(15);
  });

  it("player not present in a hole contributes 0 for that hole", () => {
    const holes = [
      hole(1, { p1: 5 }),        // p2 missing → 0
      hole(16, { p1: 10, p2: -10 }),
    ];
    const p2 = computeFlipSettlementSplit(holes, "p2", true);
    expect(p2.baseAmount).toBe(0);
    expect(p2.crybabyAmount).toBe(-10);
  });

  it("empty hole list yields zeros", () => {
    const split = computeFlipSettlementSplit([], "p1", true);
    expect(split).toEqual({ baseAmount: 0, crybabyAmount: 0 });
  });

  it("holes 15 exactly is base; hole 16 exactly is crybaby (boundary)", () => {
    const holes = [
      hole(15, { p1: 7 }),
      hole(16, { p1: 11 }),
    ];
    const split = computeFlipSettlementSplit(holes, "p1", true);
    expect(split.baseAmount).toBe(7);
    expect(split.crybabyAmount).toBe(11);
  });
});

describe("computeFlipSettlementSplit — all-square sentinel (crybaby skipped)", () => {
  it("rolls every played hole (including 16-18) into baseAmount; crybabyAmount = 0", () => {
    const holes = [
      hole(1, { p1: 5 }),
      hole(15, { p1: -2 }),
      hole(16, { p1: 10 }),
      hole(18, { p1: -3 }),
    ];
    const split = computeFlipSettlementSplit(holes, "p1", false);
    expect(split.baseAmount).toBe(10); // 5 - 2 + 10 - 3
    expect(split.crybabyAmount).toBe(0); // explicit zero, not null
  });

  it("crybabyAmount is exactly 0 (not NaN/undefined) when no holes played", () => {
    const split = computeFlipSettlementSplit([], "p1", false);
    expect(split.crybabyAmount).toBe(0);
    expect(Number.isFinite(split.crybabyAmount)).toBe(true);
  });
});

// ============================================================
// Round detail page — three-line breakdown for Flip rounds
// ============================================================

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "viewer" }, signOut: () => {} }),
}));

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    loadRoundDetail: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
beforeEach(async () => {
  db = await import("@/lib/db");
  vi.clearAllMocks();
});

function renderAtRoute(p: string, ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[p]}>
        <Routes>
          <Route path="/round/:id/summary" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function baseBundle(overrides: Record<string, unknown> = {}) {
  return {
    round: {
      id: "r1",
      course: "Austin CC",
      game_type: "flip",
      status: "completed",
      created_at: "2026-04-15T12:00:00Z",
      course_details: {
        pars: Array(18).fill(4),
        handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
        selectedTee: "Blue",
      },
    },
    players: [
      {
        id: "p1", user_id: "viewer", guest_name: null,
        hole_scores: Array(18).fill(4), total_score: 72, is_scorekeeper: true,
      },
      {
        id: "p2", user_id: "u2", guest_name: null,
        hole_scores: Array(18).fill(4), total_score: 72, is_scorekeeper: false,
      },
    ],
    settlements: [
      {
        user_id: "viewer", guest_name: null,
        amount: 25, base_amount: 10, crybaby_amount: 15,
        is_manual_adjustment: false, notes: "",
      },
      {
        user_id: "u2", guest_name: null,
        amount: -25, base_amount: -10, crybaby_amount: -15,
        is_manual_adjustment: false, notes: "",
      },
    ],
    events: [],
    participant_names: { viewer: "Jonathan", u2: "Said" },
    ...overrides,
  };
}

describe("<RoundDetailPage /> — Flip settlement breakdown", () => {
  it("renders three line items (combined + base + crybaby) per Flip player", async () => {
    db.loadRoundDetail.mockResolvedValue(baseBundle());
    renderAtRoute("/round/r1/summary", <RoundDetailPage />);
    await screen.findByTestId("round-detail-page");

    // Player 0: combined +$25, base +$10, crybaby +$15
    const row0 = screen.getByTestId("round-detail-settlement-row-0");
    expect(row0).toHaveAttribute("data-split", "flip");
    expect(within(row0).getByTestId("round-detail-settlement-combined-0")).toHaveTextContent("+$25");
    expect(within(row0).getByTestId("round-detail-settlement-base-0")).toHaveTextContent("+$10");
    expect(within(row0).getByTestId("round-detail-settlement-crybaby-0")).toHaveTextContent("+$15");

    // Player 1: combined -$25, base -$10, crybaby -$15
    const row1 = screen.getByTestId("round-detail-settlement-row-1");
    expect(within(row1).getByTestId("round-detail-settlement-combined-1")).toHaveTextContent("−$25");
    expect(within(row1).getByTestId("round-detail-settlement-base-1")).toHaveTextContent("−$10");
    expect(within(row1).getByTestId("round-detail-settlement-crybaby-1")).toHaveTextContent("−$15");
  });

  it("renders $0 crybaby leg explicitly for all-square Flip rounds", async () => {
    db.loadRoundDetail.mockResolvedValue(baseBundle({
      settlements: [
        {
          user_id: "viewer", guest_name: null,
          amount: 20, base_amount: 20, crybaby_amount: 0,
          is_manual_adjustment: false, notes: "",
        },
      ],
    }));
    renderAtRoute("/round/r1/summary", <RoundDetailPage />);
    await screen.findByTestId("round-detail-page");
    const row = screen.getByTestId("round-detail-settlement-row-0");
    expect(within(row).getByTestId("round-detail-settlement-base-0")).toHaveTextContent("+$20");
    expect(within(row).getByTestId("round-detail-settlement-crybaby-0")).toHaveTextContent("$0");
  });

  it("falls back to single-line layout for non-Flip rounds", async () => {
    db.loadRoundDetail.mockResolvedValue(baseBundle({
      round: {
        ...baseBundle().round,
        game_type: "drivers_others_carts",
      },
      settlements: [
        {
          user_id: "viewer", guest_name: null,
          amount: 25, base_amount: null, crybaby_amount: null,
          is_manual_adjustment: false, notes: "",
        },
      ],
    }));
    renderAtRoute("/round/r1/summary", <RoundDetailPage />);
    await screen.findByTestId("round-detail-page");
    // Legacy split line components are NOT rendered for non-Flip rounds.
    expect(screen.queryByTestId("round-detail-settlement-base-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("round-detail-settlement-crybaby-0")).not.toBeInTheDocument();
    // Settlement section itself still rendered.
    expect(screen.getByTestId("round-detail-settlement")).toBeInTheDocument();
  });

  it("falls back to single-line layout when Flip round has null base/crybaby (legacy row)", async () => {
    db.loadRoundDetail.mockResolvedValue(baseBundle({
      settlements: [
        {
          user_id: "viewer", guest_name: null,
          amount: 25, base_amount: null, crybaby_amount: null,
          is_manual_adjustment: false, notes: "",
        },
      ],
    }));
    renderAtRoute("/round/r1/summary", <RoundDetailPage />);
    await screen.findByTestId("round-detail-page");
    expect(screen.queryByTestId("round-detail-settlement-base-0")).not.toBeInTheDocument();
  });
});

// ============================================================
// Source-level wiring checks (no runtime exercise — read file)
// ============================================================

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

describe("C7 source wiring", () => {
  it("CrybabyActiveRound imports the split helpers from flipCrybaby", () => {
    const src = readFile("src/pages/CrybabyActiveRound.tsx");
    expect(src).toMatch(/import[^;]*computeFlipSettlementSplit[^;]*from\s+["']@\/lib\/flipCrybaby["']/);
    expect(src).toMatch(/roundHasFlipSettlementSplit/);
  });

  it("CrybabyActiveRound attaches baseAmount + crybabyAmount to settlement rows when Flip", () => {
    const src = readFile("src/pages/CrybabyActiveRound.tsx");
    // Expect some form of "baseAmount = split.baseAmount" assignment
    expect(src).toMatch(/baseAmount\s*=\s*split\.baseAmount/);
    expect(src).toMatch(/crybabyAmount\s*=\s*split\.crybabyAmount/);
  });

  it("db.insertSettlements accepts optional baseAmount + crybabyAmount", () => {
    const src = readFile("src/lib/db.ts");
    expect(src).toMatch(/base_amount/);
    expect(src).toMatch(/crybaby_amount/);
  });

  it("db.loadRoundDetail selects base_amount + crybaby_amount from round_settlements", () => {
    const src = readFile("src/lib/db.ts");
    // The select includes both columns
    expect(src).toMatch(/base_amount/);
    expect(src).toMatch(/crybaby_amount/);
  });

  it("useRoundPersistence SettlementRow type exposes optional baseAmount + crybabyAmount", () => {
    const src = readFile("src/hooks/useRoundPersistence.ts");
    expect(src).toMatch(/baseAmount\?:\s*number/);
    expect(src).toMatch(/crybabyAmount\?:\s*number/);
  });

  it("apply-capture edge function imports the split helpers + writes split to DB", () => {
    const src = readFile("supabase/functions/apply-capture/index.ts");
    expect(src).toMatch(/computeFlipSettlementSplit/);
    expect(src).toMatch(/roundHasFlipSettlementSplit/);
    expect(src).toMatch(/base_amount\s*=\s*split\.baseAmount/);
    expect(src).toMatch(/crybaby_amount\s*=\s*split\.crybabyAmount/);
  });

  it("_shared/flipCrybaby.ts exports the two split helpers", () => {
    const src = readFile("supabase/functions/_shared/flipCrybaby.ts");
    expect(src).toMatch(/export\s+function\s+computeFlipSettlementSplit/);
    expect(src).toMatch(/export\s+function\s+roundHasFlipSettlementSplit/);
  });
});
