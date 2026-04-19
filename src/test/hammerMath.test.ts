import { describe, it, expect } from "vitest";
import { resolveHammerOutcome, validateHammerState, translateToLegacy } from "@/lib/hammerMath";
import type { HoleHammerState, HammerDepthEvent } from "@/lib/hammerMath";

/**
 * Locks every terminal case of the hammer state machine into the test
 * suite. If money math on a hammer hole ever changes, these tests fire.
 */

// ----- helper fixtures -------------------------------------------

function ev(depth: number, thrower: "A" | "B", response: "accepted" | "laid_down"): HammerDepthEvent {
  return { depth, thrower, response };
}

function state(events: HammerDepthEvent[], scoredOut: boolean): HoleHammerState {
  return { events, scoredOut };
}

// ================================================================
// resolveHammerOutcome
// ================================================================

describe("resolveHammerOutcome — no hammer", () => {
  it("empty events: winner by_score, 1×, source no_hammer", () => {
    const out = resolveHammerOutcome(state([], false));
    expect(out.source).toBe("no_hammer");
    expect(out.winner).toBe("by_score");
    expect(out.multiplier).toBe(1);
  });
});

describe("resolveHammerOutcome — laid down", () => {
  it("depth 1, A throws, B lays down → A wins 1×", () => {
    const out = resolveHammerOutcome(state([ev(1, "A", "laid_down")], false));
    expect(out.source).toBe("laid_down");
    expect(out.winner).toBe("A");
    expect(out.multiplier).toBe(1); // 2^(1-1) = 1
    if (out.source !== "laid_down") throw new Error("narrow");
    expect(out.laidDownAtDepth).toBe(1);
  });

  it("depth 1, B throws, A lays down → B wins 1×", () => {
    const out = resolveHammerOutcome(state([ev(1, "B", "laid_down")], false));
    expect(out.winner).toBe("B");
    expect(out.multiplier).toBe(1);
  });

  it("depth 2 laid down by A (B threw at 2) → B wins 2×", () => {
    const out = resolveHammerOutcome(
      state([ev(1, "A", "accepted"), ev(2, "B", "laid_down")], false),
    );
    expect(out.winner).toBe("B");
    expect(out.multiplier).toBe(2); // 2^(2-1)
    if (out.source !== "laid_down") throw new Error("narrow");
    expect(out.laidDownAtDepth).toBe(2);
  });

  it("depth 3 laid down by B (A threw at 3) → A wins 4×", () => {
    const out = resolveHammerOutcome(
      state(
        [ev(1, "A", "accepted"), ev(2, "B", "accepted"), ev(3, "A", "laid_down")],
        false,
      ),
    );
    expect(out.winner).toBe("A");
    expect(out.multiplier).toBe(4); // 2^(3-1)
  });

  it("depth 7 laid down by A (B threw at 7) → B wins 64×", () => {
    const events = [
      ev(1, "A", "accepted"),
      ev(2, "B", "accepted"),
      ev(3, "A", "accepted"),
      ev(4, "B", "accepted"),
      ev(5, "A", "accepted"),
      ev(6, "B", "accepted"),
      ev(7, "A", "laid_down"),
    ];
    const out = resolveHammerOutcome(state(events, false));
    expect(out.winner).toBe("A");
    expect(out.multiplier).toBe(64); // 2^(7-1)
  });
});

describe("resolveHammerOutcome — scored out", () => {
  it("depth 1 accepted, scored out → by_score, 2×", () => {
    const out = resolveHammerOutcome(state([ev(1, "A", "accepted")], true));
    expect(out.source).toBe("scored_out");
    expect(out.winner).toBe("by_score");
    expect(out.multiplier).toBe(2); // 2^1
    if (out.source !== "scored_out") throw new Error("narrow");
    expect(out.scoredOutAtDepth).toBe(1);
  });

  it("depth 2 scored out → by_score, 4×", () => {
    const out = resolveHammerOutcome(
      state([ev(1, "A", "accepted"), ev(2, "B", "accepted")], true),
    );
    expect(out.multiplier).toBe(4);
  });

  it("depth 5 scored out → by_score, 32×", () => {
    const events = [
      ev(1, "A", "accepted"),
      ev(2, "B", "accepted"),
      ev(3, "A", "accepted"),
      ev(4, "B", "accepted"),
      ev(5, "A", "accepted"),
    ];
    const out = resolveHammerOutcome(state(events, true));
    expect(out.multiplier).toBe(32);
  });
});

// ================================================================
// validateHammerState
// ================================================================

describe("validateHammerState — accepts valid sequences", () => {
  it("empty events with scoredOut=false", () => {
    expect(validateHammerState(state([], false))).toEqual({ ok: true, errors: [] });
  });

  it("single laid_down at depth 1", () => {
    const r = validateHammerState(state([ev(1, "A", "laid_down")], false));
    expect(r.ok).toBe(true);
  });

  it("two accepts then scored out", () => {
    const r = validateHammerState(
      state([ev(1, "A", "accepted"), ev(2, "B", "accepted")], true),
    );
    expect(r.ok).toBe(true);
  });

  it("three accepts then laid down at depth 4", () => {
    const r = validateHammerState(
      state(
        [
          ev(1, "A", "accepted"),
          ev(2, "B", "accepted"),
          ev(3, "A", "accepted"),
          ev(4, "B", "laid_down"),
        ],
        false,
      ),
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateHammerState — rejects malformed sequences", () => {
  it("rejects non-alternating throwers (A accepts then A throws again)", () => {
    const r = validateHammerState(
      state([ev(1, "A", "accepted"), ev(2, "A", "laid_down")], false),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /alternate/i.test(e))).toBe(true);
  });

  it("rejects events after a laid_down", () => {
    const r = validateHammerState(
      state([ev(1, "A", "laid_down"), ev(2, "B", "accepted")], false),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /laid_down/i.test(e))).toBe(true);
  });

  it("rejects scoredOut=true when last event is laid_down", () => {
    const r = validateHammerState(state([ev(1, "A", "laid_down")], true));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /incompatible.*laid_down/i.test(e))).toBe(true);
  });

  it("rejects scoredOut=false when last event is accepted (incomplete sequence)", () => {
    const r = validateHammerState(state([ev(1, "A", "accepted")], false));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /scoredOut must be true/i.test(e))).toBe(true);
  });

  it("rejects scoredOut=true with empty events", () => {
    const r = validateHammerState(state([], true));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /scoredOut must be false/i.test(e))).toBe(true);
  });

  it("rejects non-1-indexed depths", () => {
    const badEvent: HammerDepthEvent = { depth: 0, thrower: "A", response: "laid_down" };
    const r = validateHammerState(state([badEvent], false));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /expected depth 1/i.test(e))).toBe(true);
  });

  it("rejects gaps in depth numbering", () => {
    const events: HammerDepthEvent[] = [
      { depth: 1, thrower: "A", response: "accepted" },
      { depth: 3, thrower: "B", response: "laid_down" },
    ];
    const r = validateHammerState(state(events, false));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /expected depth 2/i.test(e))).toBe(true);
  });
});

// ================================================================
// translateToLegacy — rich → engine shape
// ================================================================

describe("translateToLegacy — maps to the engine's hammerHistory entry", () => {
  it("no hammer → hammerDepth=0, folded=false", () => {
    expect(translateToLegacy(5, state([], false))).toEqual({
      hole: 5,
      hammerDepth: 0,
      folded: false,
    });
  });

  it("scored out at depth 1 → hammerDepth=1, folded=false", () => {
    expect(translateToLegacy(7, state([ev(1, "A", "accepted")], true))).toEqual({
      hole: 7,
      hammerDepth: 1,
      folded: false,
    });
  });

  it("scored out at depth 3 → hammerDepth=3, folded=false", () => {
    const events = [
      ev(1, "A", "accepted"),
      ev(2, "B", "accepted"),
      ev(3, "A", "accepted"),
    ];
    expect(translateToLegacy(12, state(events, true))).toEqual({
      hole: 12,
      hammerDepth: 3,
      folded: false,
    });
  });

  it("laid down at depth 1 (A threw) → hammerDepth=0, folded=true, winner=A", () => {
    expect(translateToLegacy(3, state([ev(1, "A", "laid_down")], false))).toEqual({
      hole: 3,
      hammerDepth: 0,
      folded: true,
      foldWinnerTeamId: "A",
    });
  });

  it("laid down at depth 2 (B threw) → hammerDepth=1, folded=true, winner=B", () => {
    const events = [ev(1, "A", "accepted"), ev(2, "B", "laid_down")];
    expect(translateToLegacy(9, state(events, false))).toEqual({
      hole: 9,
      hammerDepth: 1,
      folded: true,
      foldWinnerTeamId: "B",
    });
  });

  it("laid down at depth 4 (B threw) → hammerDepth=3, folded=true, winner=B", () => {
    const events = [
      ev(1, "A", "accepted"),
      ev(2, "B", "accepted"),
      ev(3, "A", "accepted"),
      ev(4, "B", "laid_down"),
    ];
    expect(translateToLegacy(14, state(events, false))).toEqual({
      hole: 14,
      hammerDepth: 3,
      folded: true,
      foldWinnerTeamId: "B",
    });
  });
});

// ================================================================
// Property: legacy multiplier matches outcome multiplier
// ================================================================

describe("translateToLegacy — multiplier consistency with resolveHammerOutcome", () => {
  it("every terminal state's legacy hammerDepth exponent matches the outcome multiplier", () => {
    const cases: Array<{ state: HoleHammerState; expectedMult: number }> = [
      { state: state([], false), expectedMult: 1 },
      { state: state([ev(1, "A", "laid_down")], false), expectedMult: 1 },
      { state: state([ev(1, "B", "laid_down")], false), expectedMult: 1 },
      { state: state([ev(1, "A", "accepted")], true), expectedMult: 2 },
      {
        state: state([ev(1, "A", "accepted"), ev(2, "B", "laid_down")], false),
        expectedMult: 2,
      },
      {
        state: state(
          [ev(1, "A", "accepted"), ev(2, "B", "accepted"), ev(3, "A", "laid_down")],
          false,
        ),
        expectedMult: 4,
      },
      {
        state: state(
          [ev(1, "A", "accepted"), ev(2, "B", "accepted"), ev(3, "A", "accepted")],
          true,
        ),
        expectedMult: 8,
      },
    ];

    for (const c of cases) {
      const outcome = resolveHammerOutcome(c.state);
      const legacy = translateToLegacy(1, c.state);
      // Engine computes (holeValue * 2^hammerDepth) * (2 if folded else 1 — no, wait:
      // folded uses 2^hammerDepth as the fold value. Scored-out uses 2^hammerDepth too.)
      // So legacy multiplier is 2^hammerDepth in both cases.
      const legacyMult = Math.pow(2, legacy.hammerDepth);
      expect(legacyMult).toBe(outcome.multiplier);
      expect(legacyMult).toBe(c.expectedMult);
    }
  });
});
