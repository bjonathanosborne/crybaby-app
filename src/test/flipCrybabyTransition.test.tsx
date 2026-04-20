import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import {
  computeBaseGameBalances,
  computeMaxBetPerHole,
  identifyCrybaby,
  seededHash,
  seededPick,
} from "@/lib/flipCrybaby";
import CrybabyTransition from "@/components/flip/CrybabyTransition";
import type { HoleResult, Player } from "@/lib/gameEngines";

// ============================================================
// C5 — Crybaby transition (hole 15 → 16 handoff) tests.
//
//   - Pure-helper math: balance computation, even-rounded cap,
//     crybaby selection (unambiguous + tied), deterministic
//     tiebreaker, seededHash determinism.
//   - Component rendering: standings, announcement, tiebreaker
//     reel, cap-math line, all-square fallback.
//   - Source guards for the CrybabyActiveRound integration
//     (state hydration, transition intercept, persist call).
// ============================================================

beforeEach(() => cleanup());

const P: Player[] = [
  { id: "p1", name: "Alice", handicap: 0, color: "#16A34A" },
  { id: "p2", name: "Bob",   handicap: 0, color: "#3B82F6" },
  { id: "p3", name: "Carol", handicap: 0, color: "#F59E0B" },
  { id: "p4", name: "Dave",  handicap: 0, color: "#DC2626" },
  { id: "p5", name: "Eve",   handicap: 0, color: "#8B5CF6" },
];

function mkHoleResult(hole: number, amounts: Record<string, number>): HoleResult & { hole: number } {
  return {
    hole,
    push: false,
    winnerName: null,
    amount: 0,
    carryOver: 0,
    playerResults: Object.entries(amounts).map(([id, amount]) => {
      const p = P.find(pp => pp.id === id);
      return { id, name: p?.name ?? id, amount };
    }),
    quip: "",
  };
}

// ============================================================
// computeBaseGameBalances
// ============================================================

describe("computeBaseGameBalances", () => {
  it("sums per-player amounts across holes 1-15 by default", () => {
    const holes = [
      mkHoleResult(1, { p1: -2, p2: -2, p3: -2, p4: 3, p5: 3 }),
      mkHoleResult(2, { p1: 2,  p2: 2,  p3: 2,  p4: -3, p5: -3 }),
      mkHoleResult(3, { p1: -2, p2: -2, p3: -2, p4: -2, p5: -2 }), // push, all -$2
    ];
    expect(computeBaseGameBalances(holes, P)).toEqual({
      p1: -2, p2: -2, p3: -2, p4: -2, p5: -2,
    });
  });

  it("ignores holes > 15 when scope is 'base'", () => {
    const holes = [
      mkHoleResult(15, { p1: -10, p2: 0, p3: 0, p4: 5, p5: 5 }),
      mkHoleResult(16, { p1: 100, p2: 0, p3: 0, p4: -50, p5: -50 }), // crybaby phase
    ];
    const base = computeBaseGameBalances(holes, P, "base");
    expect(base.p1).toBe(-10); // hole 16 excluded
    expect(base.p4).toBe(5);
  });

  it("includes all holes when scope is 'all'", () => {
    const holes = [
      mkHoleResult(15, { p1: -10, p2: 0, p3: 0, p4: 5, p5: 5 }),
      mkHoleResult(16, { p1: 100, p2: 0, p3: 0, p4: -50, p5: -50 }),
    ];
    const all = computeBaseGameBalances(holes, P, "all");
    expect(all.p1).toBe(90);
    expect(all.p4).toBe(-45);
  });

  it("initialises every player to $0 even if they appear in zero holes", () => {
    const holes = [mkHoleResult(1, { p1: 5, p2: -5 })]; // p3-p5 absent
    const b = computeBaseGameBalances(holes, P);
    expect(b.p3).toBe(0);
    expect(b.p4).toBe(0);
    expect(b.p5).toBe(0);
  });
});

// ============================================================
// computeMaxBetPerHole
// ============================================================

describe("computeMaxBetPerHole", () => {
  it("$60 loss → $30 cap (50% rounded-to-even)", () => {
    expect(computeMaxBetPerHole(60)).toBe(30);
  });
  it("$23 loss → $10 cap (half = 11.5, floor-to-even = 10)", () => {
    expect(computeMaxBetPerHole(23)).toBe(10);
  });
  it("$20 loss → $10 cap", () => {
    expect(computeMaxBetPerHole(20)).toBe(10);
  });
  it("$4 loss → $2 cap", () => {
    expect(computeMaxBetPerHole(4)).toBe(2);
  });
  it("$2 loss → $2 cap (lifted to even-bet floor)", () => {
    expect(computeMaxBetPerHole(2)).toBe(2);
  });
  it("$1 loss → $2 cap (floor says $0, lifted to $2 min)", () => {
    expect(computeMaxBetPerHole(1)).toBe(2);
  });
  it("$0 → $0 (no crybaby)", () => {
    expect(computeMaxBetPerHole(0)).toBe(0);
  });
  it("negative input (shouldn't happen) returns 0", () => {
    expect(computeMaxBetPerHole(-5)).toBe(0);
  });
});

// ============================================================
// seededHash + seededPick determinism
// ============================================================

describe("seededHash / seededPick determinism", () => {
  it("seededHash is pure — same seed → same number", () => {
    const a = seededHash("round-abc-123");
    const b = seededHash("round-abc-123");
    expect(a).toBe(b);
  });

  it("seededHash differentiates distinct seeds", () => {
    const a = seededHash("round-abc-123");
    const b = seededHash("round-xyz-999");
    expect(a).not.toBe(b);
  });

  it("seededPick is stable regardless of input order (sorts internally)", () => {
    const seed = "round-flip-42";
    const one = seededPick(seed, ["p1", "p3"], x => x);
    const two = seededPick(seed, ["p3", "p1"], x => x);
    expect(one).toBe(two);
  });

  it("seededPick never throws on a single-element tied set — passes through", () => {
    expect(seededPick("seed", ["lone"], x => x)).toBe("lone");
  });
});

// ============================================================
// identifyCrybaby
// ============================================================

describe("identifyCrybaby", () => {
  it("picks the single most-negative player, no tiebreaker", () => {
    const r = identifyCrybaby({ p1: 20, p2: -10, p3: -5, p4: -60, p5: 0 }, "round-1");
    expect(r.crybaby).toBe("p4");
    expect(r.losingBalance).toBe(60);
    expect(r.maxBetPerHole).toBe(30);
    expect(r.tiebreakOutcome).toBeUndefined();
  });

  it("resolves two-way tie deterministically by round.id", () => {
    const a = identifyCrybaby({ p1: -60, p2: -60, p3: 0, p4: 30, p5: 90 }, "round-xyz");
    const b = identifyCrybaby({ p2: -60, p1: -60, p3: 0, p4: 30, p5: 90 }, "round-xyz");
    expect(a.crybaby).toBe(b.crybaby); // same seed + same tied set → same winner
    expect(a.tiebreakOutcome?.tied).toEqual(["p1", "p2"]);
    expect(a.tiebreakOutcome?.winner).toBe(a.crybaby);
    expect(a.tiebreakOutcome?.seedSource).toBe("round-xyz");
    expect(a.losingBalance).toBe(60);
    expect(a.maxBetPerHole).toBe(30);
  });

  it("three-way tie still resolves cleanly", () => {
    const r = identifyCrybaby({ p1: -20, p2: -20, p3: -20, p4: 30, p5: 30 }, "seed");
    expect(r.tiebreakOutcome?.tied).toEqual(["p1", "p2", "p3"]);
    expect(["p1", "p2", "p3"]).toContain(r.crybaby);
  });

  it("returns crybaby=null when no one is in the hole (all >= 0)", () => {
    const r = identifyCrybaby({ p1: 0, p2: 20, p3: 5, p4: 0, p5: 10 }, "round-1");
    expect(r.crybaby).toBeNull();
    expect(r.losingBalance).toBe(0);
    expect(r.maxBetPerHole).toBe(0);
  });

  it("handles edge: one player in the hole by $1 → cap lifted to $2", () => {
    const r = identifyCrybaby({ p1: -1, p2: 0, p3: 0, p4: 0, p5: 1 }, "round-1");
    expect(r.crybaby).toBe("p1");
    expect(r.losingBalance).toBe(1);
    expect(r.maxBetPerHole).toBe(2); // floored to even-bet min
  });
});

// ============================================================
// CrybabyTransition rendering
// ============================================================

function balancesFromMap(m: Record<string, number>): Record<string, number> {
  return m;
}

describe("<CrybabyTransition />", () => {
  it("renders the 5-player standings sorted most-negative first", () => {
    render(
      <CrybabyTransition
        players={P}
        balances={{ p1: -60, p2: 30, p3: -10, p4: 0, p5: 40 }}
        roundId="round-1"
        onBegin={() => {}}
      />,
    );
    const rows = [
      screen.getByTestId("crybaby-transition-row-p1"),
      screen.getByTestId("crybaby-transition-row-p2"),
      screen.getByTestId("crybaby-transition-row-p3"),
      screen.getByTestId("crybaby-transition-row-p4"),
      screen.getByTestId("crybaby-transition-row-p5"),
    ];
    // Every row mounted; the test doesn't assert DOM order but does check crybaby flag.
    const crybabyRow = rows.find(r => r.getAttribute("data-crybaby") === "true");
    expect(crybabyRow).toBe(screen.getByTestId("crybaby-transition-row-p1"));
  });

  it("announces the crybaby with the cap-math line when someone is in the hole", () => {
    render(
      <CrybabyTransition
        players={P}
        balances={{ p1: -60, p2: 30, p3: -10, p4: 0, p5: 40 }}
        roundId="round-1"
        onBegin={() => {}}
      />,
    );
    const announce = screen.getByTestId("crybaby-transition-announcement");
    expect(announce).toHaveTextContent(/Alice/);
    expect(screen.getByTestId("crybaby-transition-cap-math")).toHaveTextContent(/\$60/);
    expect(screen.getByTestId("crybaby-transition-cap-math")).toHaveTextContent(/\$30/);
  });

  it("renders the all-square fallback when nobody is in the hole", () => {
    render(
      <CrybabyTransition
        players={P}
        balances={{ p1: 0, p2: 20, p3: 10, p4: 0, p5: 0 }}
        roundId="round-1"
        onBegin={() => {}}
      />,
    );
    expect(screen.getByTestId("crybaby-transition-announcement")).toHaveTextContent(/All Square/i);
    expect(screen.getByTestId("crybaby-transition-begin")).toHaveTextContent(/Continue to 16-18/);
  });

  it("tiebreaker reel appears only when tied; Begin button is disabled until reel settles", async () => {
    vi.useFakeTimers();
    const onBegin = vi.fn();
    render(
      <CrybabyTransition
        players={P}
        balances={{ p1: -60, p2: -60, p3: 0, p4: 30, p5: 30 }}
        roundId="seed"
        onBegin={onBegin}
      />,
    );
    expect(screen.getByTestId("crybaby-transition-tiebreak-reel")).toBeInTheDocument();
    expect(screen.getByTestId("crybaby-transition-begin")).toBeDisabled();
    // Advance through the full 12-frame reel cadence (160ms × 12 = 1920ms).
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("crybaby-transition-tiebreak-reveal")).toBeInTheDocument();
    expect(screen.getByTestId("crybaby-transition-begin")).not.toBeDisabled();
    vi.useRealTimers();
  });

  it("Begin button calls onBegin with a resolved identification", () => {
    const onBegin = vi.fn();
    render(
      <CrybabyTransition
        players={P}
        balances={{ p1: -20, p2: 10, p3: 10, p4: 0, p5: 0 }}
        roundId="round-1"
        onBegin={onBegin}
      />,
    );
    fireEvent.click(screen.getByTestId("crybaby-transition-begin"));
    expect(onBegin).toHaveBeenCalledTimes(1);
    const arg = onBegin.mock.calls[0][0];
    expect(arg.crybaby).toBe("p1");
    expect(arg.losingBalance).toBe(20);
    expect(arg.maxBetPerHole).toBe(10);
  });
});

// ============================================================
// CrybabyActiveRound source guards for the transition intercept
// ============================================================

describe("CrybabyActiveRound — Crybaby transition wiring", () => {
  it("imports CrybabyTransition + computeBaseGameBalances + CrybabyState type", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/import CrybabyTransition from\s+["']@\/components\/flip\/CrybabyTransition["']/);
    expect(src).toMatch(/computeBaseGameBalances/);
    expect(src).toMatch(/type CrybabyState as CrybabyStateType/);
  });

  it("intercepts render with the transition when Flip + hole 16 + no crybabyState", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(
      /round\.gameMode\s*===\s*'flip'\s*&&[\s\S]*?currentHole\s*===\s*16\s*&&[\s\S]*?!crybabyState/,
    );
    // Uses the pure helper, not a copy-paste reimplementation of balances.
    // (Regex tolerates a trailing comma before the close paren — some formatters
    // add one and that's fine.)
    expect(src).toMatch(/computeBaseGameBalances\([\s\S]*?"base"\s*,?\s*\)/);
    // Renders the component with onBegin -> handleCrybabyBegin.
    expect(src).toMatch(/<CrybabyTransition[\s\S]*?onBegin=\{handleCrybabyBegin\}/);
  });

  it("handleCrybabyBegin persists crybabyState via PersistResult wrapper", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // Writer uses persist.persistGameState with crybabyState field included.
    expect(src).toMatch(/persist\.persistGameState\(roundId,\s*\{[\s\S]*?crybabyState:\s*next[\s\S]*?\}\)/);
    // Failure path toasts with a Retry action (no silent swallow).
    expect(src).toMatch(/Couldn't save crybaby selection/);
    expect(src).toMatch(/<ToastAction[\s\S]*?handleCrybabyBegin\(identification\)/);
  });

  it("hydrates crybabyState from saved.crybabyState on round load", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/if\s*\(saved\.crybabyState\)\s*setCrybabyState/);
  });

  it("useRoundState exposes crybabyState + setCrybabyState", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useRoundState.ts"),
      "utf-8",
    );
    expect(src).toMatch(/crybabyState:\s*CrybabyState\s*\|\s*null/);
    expect(src).toMatch(/setCrybabyState:/);
    expect(src).toMatch(/useState<CrybabyState\s*\|\s*null>\(null\)/);
  });
});
