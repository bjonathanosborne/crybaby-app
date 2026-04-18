import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useAdvanceHole,
  CaptureRequiredError,
  PersistFailureError,
  type UseAdvanceHoleArgs,
} from "@/hooks/useAdvanceHole";
import type {
  UseRoundPersistenceReturn,
  PersistResult,
  GameStateSnapshot,
  RoundEventInput,
  SettlementRow,
} from "@/hooks/useRoundPersistence";
import { useRoundState } from "@/hooks/useRoundState";
import { initNassauState, type Player, type HoleResult, type TeamInfo } from "@/lib/gameEngines";
import type { CaptureCadence } from "@/lib/captureCadence";

/**
 * Unit tests for the useAdvanceHole composite hook.
 *
 * Covers the four scenarios in the 2f spec:
 *   1. Clean advance (no capture required) — snapshot returned, state committed.
 *   2. Advance blocked when cadence requires photo and none applied.
 *   3. Advance unblocks after a successful capture apply (captureApplied=true).
 *   4. Persistence failure surfaces as PersistFailureError, no crash, state not committed.
 */

// ---- test fixtures --------------------------------------------------------

function players4(): Player[] {
  return [
    { id: "a", name: "Alice", handicap: 10, color: "#000", cart: "A", position: "driver" },
    { id: "b", name: "Bob",   handicap: 10, color: "#000", cart: "A", position: "rider" },
    { id: "c", name: "Carol", handicap: 10, color: "#000", cart: "B", position: "driver" },
    { id: "d", name: "Dave",  handicap: 10, color: "#000", cart: "B", position: "rider" },
  ];
}

function okResult<T>(data: T): PersistResult<T> { return { ok: true, data }; }
function networkFail<T>(): PersistResult<T> {
  return { ok: false, error: { kind: "network", message: "ECONNRESET", cause: new Error("net") } };
}

/**
 * Build a fake UseRoundPersistenceReturn that always succeeds, unless
 * `overrides` provides a specific mock.
 */
function mockPersistence(
  overrides: Partial<UseRoundPersistenceReturn> = {},
): UseRoundPersistenceReturn {
  const okVoid = async () => okResult<void>(undefined);
  return {
    isOnline: true,
    lastSaveFailed: false,
    pendingSync: 0,
    setPendingSync: vi.fn(),
    persistPlayerScores: vi.fn(okVoid),
    persistGameState: vi.fn(okVoid),
    persistRoundEvent: vi.fn(okVoid),
    persistRoundCompletion: vi.fn(okVoid),
    persistSettlements: vi.fn(okVoid),
    persistCancel: vi.fn(okVoid),
    persistBroadcast: vi.fn(okVoid),
    ...overrides,
  };
}

function skinsHoleResult(winnerId: string, names: Record<string, string>): HoleResult {
  return {
    push: false,
    winnerName: names[winnerId],
    amount: 2,
    carryOver: 0,
    playerResults: Object.keys(names).map(id => ({
      id,
      name: names[id],
      amount: id === winnerId ? 6 : -2,
    })),
    quip: "test",
  };
}

/**
 * Render the composite. We pair useRoundState (real) with useAdvanceHole
 * and a mocked useRoundPersistence. That's enough to exercise the
 * capture gate + compute + persist path without a live DB.
 */
function renderComposite(opts: {
  captureApplied: boolean;
  cadence: CaptureCadence;
  persistence?: UseRoundPersistenceReturn;
  roundId?: string;
}) {
  const ps = players4();
  const teams: TeamInfo | null = null;
  return renderHook(() => {
    const state = useRoundState();
    const persist = opts.persistence ?? mockPersistence();
    const args: UseAdvanceHoleArgs = {
      roundId: opts.roundId ?? "round-1",
      gameMode: "skins",
      players: ps,
      holeValue: 2,
      teams,
      nassauTeams: null,
      state,
      persist,
      cadence: opts.cadence,
      captureApplied: opts.captureApplied,
      cadenceReason: opts.captureApplied ? null : "Photo required",
    };
    const advance = useAdvanceHole(args);
    return { state, persist, advance };
  });
}

// ---- tests ----------------------------------------------------------------

describe("useAdvanceHole — clean advance", () => {
  it("returns ok snapshot, commits totals + currentHole to state, calls persistence", async () => {
    const r = renderComposite({ captureApplied: false, cadence: { type: "none" } });
    const { advance, persist, state: _state } = r.result.current;

    const result = await act(async () => {
      return advance.advanceHole(
        skinsHoleResult("a", { a: "Alice", b: "Bob", c: "Carol", d: "Dave" }),
      );
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.snapshot.currentHole).toBe(2);
    expect(result.snapshot.totals.a).toBe(6);
    expect(result.snapshot.totals.b).toBe(-2);

    // Persisted
    expect(persist.persistPlayerScores).toHaveBeenCalledTimes(4);
    expect(persist.persistGameState).toHaveBeenCalledTimes(1);

    // State committed
    expect(r.result.current.state.currentHole).toBe(2);
    expect(r.result.current.state.totals.a).toBe(6);
  });
});

describe("useAdvanceHole — capture gate blocks advance", () => {
  it("rejects with CaptureRequiredError when cadence requires photo and none applied", async () => {
    const r = renderComposite({ captureApplied: false, cadence: { type: "every_hole" } });
    expect(r.result.current.advance.isBlockedOnPhoto).toBe(true);

    const result = await act(async () => {
      return r.result.current.advance.advanceHole(
        skinsHoleResult("a", { a: "Alice", b: "Bob", c: "Carol", d: "Dave" }),
      );
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBeInstanceOf(CaptureRequiredError);
    if (!(result.error instanceof CaptureRequiredError)) throw new Error("unreachable");
    expect(result.error.kind).toBe("capture_required");
    expect(result.error.hole).toBe(1);
    expect(result.error.reason).toBe("Photo required");

    // State NOT committed
    expect(r.result.current.state.currentHole).toBe(1);
    expect(r.result.current.state.totals).toEqual({});
    // Persistence NOT called
    expect(r.result.current.persist.persistPlayerScores).not.toHaveBeenCalled();
  });

  it("holes cadence only blocks on the listed holes", async () => {
    // Cadence = [9, 18]. Hole 1 should NOT be blocked.
    const r = renderComposite({ captureApplied: false, cadence: { type: "holes", holes: [9, 18] } });
    expect(r.result.current.advance.isBlockedOnPhoto).toBe(false);

    const result = await act(async () => {
      return r.result.current.advance.advanceHole(
        skinsHoleResult("a", { a: "Alice", b: "Bob", c: "Carol", d: "Dave" }),
      );
    });
    expect(result.ok).toBe(true);
  });
});

describe("useAdvanceHole — unblocks after capture applies", () => {
  it("captureApplied=true unblocks advance even when cadence requires photo", async () => {
    const r = renderComposite({ captureApplied: true, cadence: { type: "every_hole" } });
    expect(r.result.current.advance.isBlockedOnPhoto).toBe(false);

    const result = await act(async () => {
      return r.result.current.advance.advanceHole(
        skinsHoleResult("a", { a: "Alice", b: "Bob", c: "Carol", d: "Dave" }),
      );
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.snapshot.currentHole).toBe(2);
  });
});

describe("useAdvanceHole — persistence failure", () => {
  it("surfaces PersistFailureError without crashing or committing state", async () => {
    const persist = mockPersistence({
      persistGameState: vi.fn(async (_rid: string, _s: GameStateSnapshot) => networkFail<void>()),
    });
    const r = renderComposite({
      captureApplied: false,
      cadence: { type: "none" },
      persistence: persist,
    });

    const result = await act(async () => {
      return r.result.current.advance.advanceHole(
        skinsHoleResult("a", { a: "Alice", b: "Bob", c: "Carol", d: "Dave" }),
      );
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBeInstanceOf(PersistFailureError);
    if (!(result.error instanceof PersistFailureError)) throw new Error("unreachable");
    expect(result.error.kind).toBe("persist_failure");
    expect(result.error.failures[0].step).toBe("game_state");
    expect(result.error.failures[0].cause.kind).toBe("network");

    // State NOT committed despite the compute succeeding
    expect(r.result.current.state.currentHole).toBe(1);
    expect(r.result.current.state.totals).toEqual({});
  });

  it("multiple failures (per-player + game_state) are all reported", async () => {
    const persist = mockPersistence({
      persistPlayerScores: vi.fn(async () => networkFail<void>()),
      persistGameState: vi.fn(async () => networkFail<void>()),
    });
    const r = renderComposite({
      captureApplied: false,
      cadence: { type: "none" },
      persistence: persist,
    });

    const result = await act(async () => {
      return r.result.current.advance.advanceHole(
        skinsHoleResult("a", { a: "Alice", b: "Bob", c: "Carol", d: "Dave" }),
      );
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBeInstanceOf(PersistFailureError);
    if (!(result.error instanceof PersistFailureError)) throw new Error("unreachable");
    // 4 players failed + game_state failed = 5 failures
    expect(result.error.failures.length).toBe(5);
  });
});

describe("useAdvanceHole — roundId null (unsaved round)", () => {
  it("skips persistence entirely when roundId is null", async () => {
    const persist = mockPersistence();
    const r = renderComposite({
      captureApplied: false,
      cadence: { type: "none" },
      persistence: persist,
      roundId: undefined, // via default? We want null explicitly; adjust:
    });
    // Actually the renderComposite has roundId default; overwrite:
    const r2 = renderHook(() => {
      const state = useRoundState();
      const args: UseAdvanceHoleArgs = {
        roundId: null,
        gameMode: "skins",
        players: players4(),
        holeValue: 2,
        teams: null,
        nassauTeams: null,
        state,
        persist,
        cadence: { type: "none" },
        captureApplied: false,
        cadenceReason: null,
      };
      return { state, advance: useAdvanceHole(args) };
    });

    const result = await act(async () => {
      return r2.result.current.advance.advanceHole(
        skinsHoleResult("a", { a: "Alice", b: "Bob", c: "Carol", d: "Dave" }),
      );
    });
    expect(result.ok).toBe(true);
    expect(persist.persistPlayerScores).not.toHaveBeenCalled();
    expect(persist.persistGameState).not.toHaveBeenCalled();
    // unused var warning silencer
    expect(persist.persistRoundEvent).not.toHaveBeenCalled();
    // Unused parameter tolerance
    const _unused: [RoundEventInput | undefined, SettlementRow | undefined] = [undefined, undefined];
    void _unused;
    void initNassauState; // ensure import not tree-shaken; compilation check
    void r.result; // keep r alive
  });
});
