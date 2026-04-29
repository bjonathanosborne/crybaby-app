import { describe, it, expect } from "vitest";
import { computeAdvanceHole, type RoundStateSnapshot } from "@/hooks/useRoundState";
import { initNassauState, type Player, type HoleResult, type TeamInfo } from "@/lib/gameEngines";

/**
 * Smoke tests for the pure `computeAdvanceHole` function. Verifies the
 * behaviors the page component relied on before the refactor: totals
 * accumulation (non-Nassau), Nassau segment settlement (no per-hole money),
 * holeResults append, hammer reset, and carryOver propagation.
 *
 * React render / setState behavior is not tested here — the hook wiring is
 * thin and covered by the active-round integration smoke test in CI.
 */

function players4(): Player[] {
  return [
    { id: "a", name: "Alice", handicap: 10, color: "#000", cart: "A", position: "driver" },
    { id: "b", name: "Bob",   handicap: 10, color: "#000", cart: "A", position: "rider" },
    { id: "c", name: "Carol", handicap: 10, color: "#000", cart: "B", position: "driver" },
    { id: "d", name: "Dave",  handicap: 10, color: "#000", cart: "B", position: "rider" },
  ];
}

function freshState(players: Player[]): RoundStateSnapshot {
  return {
    currentHole: 1,
    scores: {},
    totals: Object.fromEntries(players.map(p => [p.id, 0])),
    holeResults: [],
    hammerDepth: 0,
    hammerHistory: [],
    hammerPending: false,
    lastHammerBy: null,
    // PR #31: hammer-resolved + conceded-winner per-hole state.
    hammerResolved: false,
    concededHammerWinnerTeamId: null,
    carryOver: 0,
    flipTeams: null,
    flipState: { teamsByHole: {}, currentHole: 0 },
    flipConfig: null,
    rollingCarryWindow: null,
    crybabyState: null,
    wolfState: { wolfOrder: [], currentWolfIndex: 0, partnerSelected: null, isLoneWolf: false },
    nassauState: initNassauState(players),
    nassauPresses: [],
  };
}

describe("computeAdvanceHole — initial state", () => {
  it("initial state has zeroed totals, empty results, hole 1, hammer fully reset", () => {
    const ps = players4();
    const s = freshState(ps);
    expect(s.currentHole).toBe(1);
    expect(s.totals).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(s.holeResults).toHaveLength(0);
    expect(s.hammerDepth).toBe(0);
    expect(s.hammerPending).toBe(false);
    expect(s.carryOver).toBe(0);
  });
});

describe("computeAdvanceHole — non-Nassau totals accumulation", () => {
  it("skins: per-hole amounts are summed into totals; currentHole advances; holeResults append", () => {
    const ps = players4();
    const prev = freshState(ps);
    // Fabricate a skins-style hole result: Alice wins $6, everyone else -$2
    const result: HoleResult = {
      push: false,
      winnerName: "Alice",
      amount: 2,
      carryOver: 0,
      playerResults: [
        { id: "a", name: "Alice", amount: 6 },
        { id: "b", name: "Bob", amount: -2 },
        { id: "c", name: "Carol", amount: -2 },
        { id: "d", name: "Dave", amount: -2 },
      ],
      quip: "Alice takes it",
    };
    const next = computeAdvanceHole(prev, {
      result, currentHole: 1, gameMode: "skins",
      players: ps, holeValue: 2, teams: null, nassauTeams: null,
    });
    expect(next.currentHole).toBe(2);
    expect(next.totals.a).toBe(6);
    expect(next.totals.b).toBe(-2);
    expect(next.holeResults).toHaveLength(1);
    expect(next.holeResults[0].hole).toBe(1);
    expect(next.hammerDepth).toBe(0);
  });

  it("push result: no totals change; carryOver propagates", () => {
    const ps = players4();
    const prev = freshState(ps);
    const result: HoleResult = {
      push: true, winnerName: null, amount: 0, carryOver: 4,
      playerResults: ps.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: "push",
    };
    const next = computeAdvanceHole(prev, {
      result, currentHole: 3, gameMode: "drivers_others_carts",
      players: ps, holeValue: 2, teams: null, nassauTeams: null,
    });
    expect(next.currentHole).toBe(4);
    expect(next.totals).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(next.carryOver).toBe(4);
  });

  it("hammer state fully resets after advance; hammerHistory records depth + fold", () => {
    const ps = players4();
    const prev: RoundStateSnapshot = {
      ...freshState(ps),
      hammerDepth: 2,
      hammerPending: true,
      lastHammerBy: "A",
    };
    const teams: TeamInfo = {
      teamA: { name: "Drivers", players: [ps[0], ps[2]], color: "#000" },
      teamB: { name: "Riders", players: [ps[1], ps[3]], color: "#000" },
    };
    const result: HoleResult = {
      push: false, winnerName: "Drivers", amount: 8, carryOver: 0,
      playerResults: [
        { id: "a", name: "Alice", amount: 8 },
        { id: "b", name: "Bob", amount: -8 },
        { id: "c", name: "Carol", amount: 8 },
        { id: "d", name: "Dave", amount: -8 },
      ],
      quip: "Drivers take it",
      folded: true,
    };
    const next = computeAdvanceHole(prev, {
      result, currentHole: 5, gameMode: "drivers_others_carts",
      players: ps, holeValue: 2, teams, nassauTeams: null,
    });
    expect(next.hammerDepth).toBe(0);
    expect(next.hammerPending).toBe(false);
    expect(next.lastHammerBy).toBeNull();
    expect(next.hammerHistory).toHaveLength(1);
    expect(next.hammerHistory[0]).toMatchObject({
      hole: 5,
      hammerDepth: 2, // depth at time of fold
      folded: true,
      foldWinnerTeamId: "A", // Alice was on teamA
    });
  });

  it("currentHole caps at 18 (can't advance past the 18th)", () => {
    const ps = players4();
    const prev = { ...freshState(ps), currentHole: 18 };
    const result: HoleResult = {
      push: true, winnerName: null, amount: 0, carryOver: 0,
      playerResults: ps.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: "push",
    };
    const next = computeAdvanceHole(prev, {
      result, currentHole: 18, gameMode: "skins",
      players: ps, holeValue: 2, teams: null, nassauTeams: null,
    });
    expect(next.currentHole).toBe(18); // stays at 18
    expect(next.holeResults).toHaveLength(1);
  });
});

describe("computeAdvanceHole — Nassau totals from settlement", () => {
  it("Nassau: per-hole amounts ignored; totals reflect provisional segment settlement", () => {
    const ps = players4();
    const prev = freshState(ps);
    const nassauTeams: TeamInfo = {
      teamA: { name: "Team 1", players: [ps[0], ps[1]], color: "#000" },
      teamB: { name: "Team 2", players: [ps[2], ps[3]], color: "#000" },
    };
    // Advance 9 holes, Team 1 wins all 9 → front segment should pay
    let state = prev;
    for (let hole = 1; hole <= 9; hole++) {
      const result: HoleResult = {
        push: false, winnerName: "Team 1", amount: 0, carryOver: 0,
        playerResults: ps.map(p => ({ id: p.id, name: p.name, amount: 0 })),
        quip: `hole ${hole}`,
        winnerIds: ["a", "b"],
      };
      state = computeAdvanceHole(state, {
        result, currentHole: hole, gameMode: "nassau",
        players: ps, holeValue: 5, teams: nassauTeams, nassauTeams,
      });
    }
    // After 9 holes: front settled (Team 1 wins $5 each), back+overall not settled yet
    expect(state.totals.a).toBe(5);
    expect(state.totals.b).toBe(5);
    expect(state.totals.c).toBe(-5);
    expect(state.totals.d).toBe(-5);
  });

  it("Nassau: nassauState match counts accumulate correctly per segment", () => {
    const ps = players4();
    const prev = freshState(ps);
    const nassauTeams: TeamInfo = {
      teamA: { name: "Team 1", players: [ps[0], ps[1]], color: "#000" },
      teamB: { name: "Team 2", players: [ps[2], ps[3]], color: "#000" },
    };
    const teamAWin: HoleResult = {
      push: false, winnerName: "Team 1", amount: 0, carryOver: 0,
      playerResults: ps.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: "",
      winnerIds: ["a", "b"],
    };
    // Hole 1 front
    const s1 = computeAdvanceHole(prev, {
      result: teamAWin, currentHole: 1, gameMode: "nassau",
      players: ps, holeValue: 5, teams: nassauTeams, nassauTeams,
    });
    expect(s1.nassauState.frontMatch.a).toBe(1);
    expect(s1.nassauState.frontMatch.b).toBe(1);
    expect(s1.nassauState.overallMatch.a).toBe(1);
    expect(s1.nassauState.backMatch.a ?? 0).toBe(0);
    // Hole 12 (back)
    const s2 = computeAdvanceHole(s1, {
      result: teamAWin, currentHole: 12, gameMode: "nassau",
      players: ps, holeValue: 5, teams: nassauTeams, nassauTeams,
    });
    expect(s2.nassauState.backMatch.a).toBe(1);
    expect(s2.nassauState.overallMatch.a).toBe(2);
  });

  it("Nassau push: no winners credited; totals unchanged", () => {
    const ps = players4();
    const prev = freshState(ps);
    const nassauTeams: TeamInfo = {
      teamA: { name: "Team 1", players: [ps[0], ps[1]], color: "#000" },
      teamB: { name: "Team 2", players: [ps[2], ps[3]], color: "#000" },
    };
    const pushResult: HoleResult = {
      push: true, winnerName: null, amount: 0, carryOver: 0,
      playerResults: ps.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: "push",
      winnerIds: [],
    };
    const next = computeAdvanceHole(prev, {
      result: pushResult, currentHole: 5, gameMode: "nassau",
      players: ps, holeValue: 5, teams: nassauTeams, nassauTeams,
    });
    expect(next.nassauState.frontMatch).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(next.totals).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});

describe("computeAdvanceHole — resume-like state", () => {
  it("can apply advance to a state with pre-populated holeResults (resume path)", () => {
    const ps = players4();
    const prev: RoundStateSnapshot = {
      ...freshState(ps),
      currentHole: 5,
      totals: { a: 10, b: -10, c: 10, d: -10 },
      holeResults: Array.from({ length: 4 }, (_, i) => ({
        hole: i + 1,
        push: false,
        winnerName: null,
        amount: 0,
        carryOver: 0,
        playerResults: [],
        quip: "",
        resumed: true as any,
      })),
    };
    const result: HoleResult = {
      push: false, winnerName: "Alice", amount: 2, carryOver: 0,
      playerResults: [
        { id: "a", name: "Alice", amount: 6 },
        { id: "b", name: "Bob", amount: -2 },
        { id: "c", name: "Carol", amount: -2 },
        { id: "d", name: "Dave", amount: -2 },
      ],
      quip: "A wins",
    };
    const next = computeAdvanceHole(prev, {
      result, currentHole: 5, gameMode: "skins",
      players: ps, holeValue: 2, teams: null, nassauTeams: null,
    });
    expect(next.currentHole).toBe(6);
    expect(next.totals.a).toBe(16);
    expect(next.totals.b).toBe(-12);
    // Prior resumed results preserved, new result appended
    expect(next.holeResults).toHaveLength(5);
    expect(next.holeResults[4].hole).toBe(5);
  });
});
