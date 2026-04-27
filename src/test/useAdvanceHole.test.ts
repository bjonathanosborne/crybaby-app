import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useAdvanceHole,
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

/**
 * Unit tests for the useAdvanceHole composite hook.
 *
 * Originally (PR 2f) had four scenarios including a capture-gate
 * blocked path. PR #28 removed the capture gate from the hook (it
 * had no live caller after PR #27 stripped the page-level wiring),
 * so the surviving scenarios are:
 *   1. Clean advance — snapshot returned, state committed.
 *   2. Persistence failure surfaces as PersistFailureError, no crash, state not committed.
 *   3. roundId=null (unsaved round) skips persistence entirely.
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
 * compute + persist path without a live DB.
 */
function renderComposite(opts: {
  persistence?: UseRoundPersistenceReturn;
  roundId?: string;
} = {}) {
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
    };
    const advance = useAdvanceHole(args);
    return { state, persist, advance };
  });
}

// ---- tests ----------------------------------------------------------------

describe("useAdvanceHole — clean advance", () => {
  it("returns ok snapshot, commits totals + currentHole to state, calls persistence", async () => {
    const r = renderComposite();
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

// PR #28: "capture gate blocks advance" + "unblocks after capture applies"
// describe blocks removed. Capture gate no longer exists in this hook.
// CaptureRequiredError class is gone; AdvanceResult only carries
// PersistFailureError now. The shape-level guard that the gate is
// gone lives in src/test/unifiedScoreState.test.ts.

describe("useAdvanceHole — persistence failure", () => {
  it("surfaces PersistFailureError without crashing or committing state", async () => {
    const persist = mockPersistence({
      persistGameState: vi.fn(async (_rid: string, _s: GameStateSnapshot) => networkFail<void>()),
    });
    const r = renderComposite({ persistence: persist });

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
    const r = renderComposite({ persistence: persist });

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
    const r = renderComposite({ persistence: persist });
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
