import { describe, it, expect } from "vitest";
import {
  getTeamsForHole,
  calculateNassauHoleResult,
  calculateNassauSettlement,
  initNassauState,
  replayRound,
} from "@/lib/gameEngines";
import type { Player, GameSettings, TeamInfo, NassauState, ReplayHoleInput } from "@/lib/gameEngines";

// --- Nassau test helpers ---

function makeSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    hammer: false,
    hammerInitiator: "any",
    hammerMaxDepth: "1",
    crybaby: false,
    crybabHoles: 3,
    crybabHammerRule: "allowed",
    birdieBonus: false,
    birdieMultiplier: 2,
    pops: false,
    noPopsParThree: true,
    carryOverCap: "∞",
    handicapPercent: 100,
    presses: false,
    pressType: "auto",
    ...overrides,
  };
}

function makeNassauPlayers(n: 2 | 3 | 4): Player[] {
  const base = [
    { id: "a", name: "Alice", handicap: 10, color: "#16A34A" },
    { id: "b", name: "Bob",   handicap: 10, color: "#3B82F6" },
    { id: "c", name: "Carol", handicap: 10, color: "#F59E0B" },
    { id: "d", name: "Dave",  handicap: 10, color: "#DC2626" },
  ];
  return base.slice(0, n);
}

function teamsFor4(players: Player[]): TeamInfo {
  return {
    teamA: { name: "Team 1", players: [players[0], players[1]], color: "#16A34A" },
    teamB: { name: "Team 2", players: [players[2], players[3]], color: "#3B82F6" },
  };
}

/**
 * Helper: apply a hole-by-hole list of winners to a NassauState. `winners[i]`
 * is the list of player ids that won hole i+1 (empty array = push).
 */
function applyWinners(
  state: NassauState,
  winners: string[][],
  activePresses: { startHole: number }[] = [],
): NassauState {
  const out: NassauState = {
    frontMatch: { ...state.frontMatch },
    backMatch: { ...state.backMatch },
    overallMatch: { ...state.overallMatch },
    presses: activePresses.map(p => ({ startHole: p.startHole, match: {} })),
  };
  const bump = (map: Record<string, number>, id: string) => {
    map[id] = (map[id] || 0) + 1;
  };
  winners.forEach((winnerIds, idx) => {
    const hole = idx + 1;
    winnerIds.forEach(wid => {
      if (hole <= 9) bump(out.frontMatch, wid);
      else bump(out.backMatch, wid);
      bump(out.overallMatch, wid);
      out.presses.forEach(press => {
        // Press runs from startHole through end of its segment (9 for front, 18 for back)
        const segmentEnd = press.startHole <= 9 ? 9 : 18;
        if (hole >= press.startHole && hole <= segmentEnd) bump(press.match, wid);
      });
    });
  });
  return out;
}

// Default 5-player assignments matching CrybabyActiveRound.jsx lines 964-965:
//   cart: i < 2 ? "A" : "B"
//   position: i % 2 === 0 ? "driver" : "rider"
//
//   i=0: cart=A, position=driver
//   i=1: cart=A, position=rider
//   i=2: cart=B, position=driver
//   i=3: cart=B, position=rider
//   i=4: cart=B, position=driver  ← was excluded by find() bug
function make5Players(): Player[] {
  return [
    { id: "p1", name: "Alice", handicap: 12, cart: "A", position: "driver", color: "#16A34A" },
    { id: "p2", name: "Bob",   handicap: 10, cart: "A", position: "rider",  color: "#3B82F6" },
    { id: "p3", name: "Carol", handicap: 14, cart: "B", position: "driver", color: "#F59E0B" },
    { id: "p4", name: "Dave",  handicap: 8,  cart: "B", position: "rider",  color: "#DC2626" },
    { id: "p5", name: "Eve",   handicap: 16, cart: "B", position: "driver", color: "#8B5CF6" },
  ];
}

describe("getDOCTeams — Drivers phase (holes 1-5)", () => {
  const players = make5Players();

  it("splits by driver vs rider", () => {
    for (let hole = 1; hole <= 5; hole++) {
      const teams = getTeamsForHole("drivers_others_carts", hole, players);
      expect(teams).not.toBeNull();
      const teamAIds = teams!.teamA.players.map(p => p.id);
      const teamBIds = teams!.teamB.players.map(p => p.id);
      // Drivers: p1, p3, p5 (position=driver)
      expect(teamAIds.sort()).toEqual(["p1", "p3", "p5"]);
      // Riders: p2, p4
      expect(teamBIds.sort()).toEqual(["p2", "p4"]);
    }
  });

  it("all 5 players appear in exactly one team", () => {
    const teams = getTeamsForHole("drivers_others_carts", 3, players)!;
    const all = [...teams.teamA.players, ...teams.teamB.players].map(p => p.id).sort();
    expect(all).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });
});

describe("getDOCTeams — Others phase (holes 6-10)", () => {
  const players = make5Players();

  it("all 5 players appear in exactly one team — regression for Bug 2", () => {
    for (let hole = 6; hole <= 10; hole++) {
      const teams = getTeamsForHole("drivers_others_carts", hole, players);
      expect(teams).not.toBeNull();
      const teamAIds = teams!.teamA.players.map(p => p.id);
      const teamBIds = teams!.teamB.players.map(p => p.id);

      // No player should appear in both teams
      const overlap = teamAIds.filter(id => teamBIds.includes(id));
      expect(overlap).toHaveLength(0);

      // All 5 players must be assigned
      const all = [...teamAIds, ...teamBIds].sort();
      expect(all).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    }
  });

  it("splits by cart assignment — cart A vs cart B", () => {
    const teams = getTeamsForHole("drivers_others_carts", 7, players)!;
    const teamAIds = teams.teamA.players.map(p => p.id).sort();
    const teamBIds = teams.teamB.players.map(p => p.id).sort();
    // cart=A: p1, p2
    expect(teamAIds).toEqual(["p1", "p2"]);
    // cart=B: p3, p4, p5
    expect(teamBIds).toEqual(["p3", "p4", "p5"]);
  });

  it("p5 (cart=B, position=driver — same slot as p3) is included in a team", () => {
    // This was the exact player excluded by the find() bug
    for (let hole = 6; hole <= 10; hole++) {
      const teams = getTeamsForHole("drivers_others_carts", hole, players)!;
      const allIds = [...teams.teamA.players, ...teams.teamB.players].map(p => p.id);
      expect(allIds).toContain("p5");
    }
  });

  it("team sizes reflect cart counts (2 cart-A vs 3 cart-B for default 5-player setup)", () => {
    const teams = getTeamsForHole("drivers_others_carts", 8, players)!;
    // cart=A: p1, p2 = 2 players; cart=B: p3, p4, p5 = 3 players
    expect(teams.teamA.players).toHaveLength(2);
    expect(teams.teamB.players).toHaveLength(3);
  });
});

describe("getDOCTeams — Carts phase (holes 11-15)", () => {
  const players = make5Players();

  it("splits by cart A vs cart B", () => {
    for (let hole = 11; hole <= 15; hole++) {
      const teams = getTeamsForHole("drivers_others_carts", hole, players)!;
      const teamAIds = teams.teamA.players.map(p => p.id).sort();
      const teamBIds = teams.teamB.players.map(p => p.id).sort();
      expect(teamAIds).toEqual(["p1", "p2"]);
      expect(teamBIds).toEqual(["p3", "p4", "p5"]);
    }
  });
});

describe("getDOCTeams — Crybaby phase (holes 16-18)", () => {
  const players = make5Players();

  it("returns null for crybaby holes", () => {
    for (let hole = 16; hole <= 18; hole++) {
      const teams = getTeamsForHole("drivers_others_carts", hole, players);
      expect(teams).toBeNull();
    }
  });
});

describe("getDOCTeams — 4-player game", () => {
  const players4: Player[] = [
    { id: "p1", name: "Alice", handicap: 12, cart: "A", position: "driver", color: "#16A34A" },
    { id: "p2", name: "Bob",   handicap: 10, cart: "A", position: "rider",  color: "#3B82F6" },
    { id: "p3", name: "Carol", handicap: 14, cart: "B", position: "driver", color: "#F59E0B" },
    { id: "p4", name: "Dave",  handicap: 8,  cart: "B", position: "rider",  color: "#DC2626" },
  ];

  it("all 4 players appear in exactly one team across all phases", () => {
    for (let hole = 1; hole <= 15; hole++) {
      const teams = getTeamsForHole("drivers_others_carts", hole, players4)!;
      const all = [...teams.teamA.players, ...teams.teamB.players].map(p => p.id).sort();
      expect(all).toEqual(["p1", "p2", "p3", "p4"]);
    }
  });
});

// ============================================================================
// NASSAU SETTLEMENT TESTS
// Coverage: per-hole result carries no money; segment/press settlement math;
// tied segments push; compounding presses; back-9 comebacks; abandoned rounds;
// handicap pops applied at the hole level flow through correctly.
// ============================================================================

describe("calculateNassauHoleResult — no per-hole money", () => {
  it("winner carries zero amount on playerResults and on result.amount", () => {
    const players = makeNassauPlayers(2);
    const result = calculateNassauHoleResult(
      players, null,
      { a: 4, b: 5 }, 4, 1, 2, makeSettings(), 10, 1,
    );
    expect(result.push).toBe(false);
    expect(result.winnerName).toBe("Alice");
    expect(result.amount).toBe(0);
    expect(result.playerResults.every(pr => pr.amount === 0)).toBe(true);
    expect(result.winnerIds).toEqual(["a"]);
  });

  it("push carries winnerIds: []", () => {
    const players = makeNassauPlayers(2);
    const result = calculateNassauHoleResult(
      players, null,
      { a: 4, b: 4 }, 4, 1, 2, makeSettings(), 10, 1,
    );
    expect(result.push).toBe(true);
    expect(result.winnerIds).toEqual([]);
  });

  it("team Nassau winner populates winnerIds with all winning team players", () => {
    const players = makeNassauPlayers(4);
    const teams = teamsFor4(players);
    const result = calculateNassauHoleResult(
      players, teams,
      { a: 4, b: 5, c: 5, d: 5 }, 4, 1, 2, makeSettings(), 10, 1,
    );
    expect(result.push).toBe(false);
    expect(result.winnerIds!.sort()).toEqual(["a", "b"]);
    expect(result.playerResults.every(pr => pr.amount === 0)).toBe(true);
  });
});

describe("calculateNassauSettlement — clean wins", () => {
  it("2-player: Alice wins all three segments outright (no presses) = 3 × stake", () => {
    const players = makeNassauPlayers(2);
    // Alice wins every hole
    const winners = Array.from({ length: 18 }, () => ["a"]);
    const state = applyWinners(initNassauState(players), winners);
    const s = calculateNassauSettlement(players, null, state, 5);
    expect(s.front.winner).toBe("a");
    expect(s.front.amount).toBe(5);
    expect(s.back.winner).toBe("a");
    expect(s.back.amount).toBe(5);
    expect(s.overall.winner).toBe("a");
    expect(s.overall.amount).toBe(5);
    expect(s.playerAmounts.a).toBe(15);
    expect(s.playerAmounts.b).toBe(-15);
  });

  it("4-player team: Team 1 wins front, Team 2 wins back and overall", () => {
    const players = makeNassauPlayers(4);
    const teams = teamsFor4(players);
    // Holes 1-9: Team 1 wins 6, Team 2 wins 3
    const front = [
      ["a", "b"], ["a", "b"], ["a", "b"], ["a", "b"], ["a", "b"], ["a", "b"],
      ["c", "d"], ["c", "d"], ["c", "d"],
    ];
    // Holes 10-18: Team 2 wins 7, Team 1 wins 2 → Team 2 overall by 9-8
    const back = [
      ["a", "b"], ["a", "b"],
      ["c", "d"], ["c", "d"], ["c", "d"], ["c", "d"], ["c", "d"], ["c", "d"], ["c", "d"],
    ];
    const state = applyWinners(initNassauState(players), [...front, ...back]);
    const s = calculateNassauSettlement(players, teams, state, 10);
    expect(s.front.winner).toBe("Team 1");
    expect(s.back.winner).toBe("Team 2");
    expect(s.overall.winner).toBe("Team 2");
    // Alice: +$10 (front) - $10 (back) - $10 (overall) = -$10
    expect(s.playerAmounts.a).toBe(-10);
    expect(s.playerAmounts.b).toBe(-10);
    expect(s.playerAmounts.c).toBe(10);
    expect(s.playerAmounts.d).toBe(10);
  });
});

describe("calculateNassauSettlement — tied segment pushes", () => {
  it("2-player tied front 9 = no front money; other segments settle normally", () => {
    const players = makeNassauPlayers(2);
    // Front: 4 each + 1 pushed hole
    const front: string[][] = [
      ["a"], ["a"], ["a"], ["a"],
      ["b"], ["b"], ["b"], ["b"],
      [], // pushed
    ];
    // Back: Alice wins 5-4
    const back: string[][] = [
      ["a"], ["a"], ["a"], ["a"], ["a"],
      ["b"], ["b"], ["b"], ["b"],
    ];
    const state = applyWinners(initNassauState(players), [...front, ...back]);
    const s = calculateNassauSettlement(players, null, state, 3);
    expect(s.front.winner).toBeNull();
    expect(s.front.amount).toBe(0);
    expect(s.back.winner).toBe("a");
    expect(s.back.amount).toBe(3);
    // Overall: Alice 9, Bob 8 → Alice
    expect(s.overall.winner).toBe("a");
    expect(s.playerAmounts.a).toBe(6); // back + overall
    expect(s.playerAmounts.b).toBe(-6);
  });

  it("3-player: tie at top of segment (2 of 3 tie) pushes the segment", () => {
    const players = makeNassauPlayers(3);
    // Front: a=4, b=4, c=1 → push (top tie)
    const front: string[][] = [
      ["a"], ["a"], ["a"], ["a"],
      ["b"], ["b"], ["b"], ["b"],
      ["c"],
    ];
    // Back: a=9, b=0, c=0 → a wins outright
    const back: string[][] = [
      ["a"], ["a"], ["a"], ["a"], ["a"], ["a"], ["a"], ["a"], ["a"],
    ];
    const state = applyWinners(initNassauState(players), [...front, ...back]);
    const s = calculateNassauSettlement(players, null, state, 2);
    expect(s.front.winner).toBeNull();
    expect(s.back.winner).toBe("a");
    // Overall: a=13, b=4, c=1 → a
    expect(s.overall.winner).toBe("a");
    // a: 2 × (2+2) = 8; b,c: -2 × (back+overall bets) = -4 each
    expect(s.playerAmounts.a).toBe(8);
    expect(s.playerAmounts.b).toBe(-4);
    expect(s.playerAmounts.c).toBe(-4);
  });
});

describe("calculateNassauSettlement — presses", () => {
  it("2-player: press on hole 5 won by Alice pays an extra stake", () => {
    const players = makeNassauPlayers(2);
    // Alice wins front 6-3, back 6-3, so overall 12-6; press from hole 5: Alice wins 4 of 5 front holes
    const winners: string[][] = [
      ["a"], ["b"], ["a"], ["b"],    // 1-4
      ["a"], ["a"], ["a"], ["a"], ["b"], // 5-9 (press covers 5-9)
      ["a"], ["a"], ["b"], ["a"], ["a"], ["b"], ["a"], ["a"], ["a"], // 10-18
    ];
    const state = applyWinners(
      initNassauState(players),
      winners,
      [{ startHole: 5 }],
    );
    const s = calculateNassauSettlement(players, null, state, 4);
    // Front: Alice 6-3, Back: Alice 6-3, Overall: Alice 12-6, Press: Alice 4-1
    expect(s.front.winner).toBe("a");
    expect(s.back.winner).toBe("a");
    expect(s.overall.winner).toBe("a");
    expect(s.presses).toHaveLength(1);
    expect(s.presses[0].segment).toBe("front");
    expect(s.presses[0].winner).toBe("a");
    expect(s.presses[0].amount).toBe(4);
    // Alice: front + back + overall + press = 4 × 4 = $16
    expect(s.playerAmounts.a).toBe(16);
    expect(s.playerAmounts.b).toBe(-16);
  });

  it("press lost — loser pays the extra stake", () => {
    const players = makeNassauPlayers(2);
    // Alice wins front outright, but then Bob declares a press on hole 7 and wins it
    const winners: string[][] = [
      ["a"], ["a"], ["a"], ["a"], ["a"], // Alice up 5-0 through 5
      ["b"],                              // 6 — Bob
      ["b"], ["b"], ["b"],               // 7-9 (Bob's press 7-9: Bob 3-0)
      ...Array(9).fill(["a"]) as string[][], // back 9 all Alice
    ];
    const state = applyWinners(
      initNassauState(players),
      winners,
      [{ startHole: 7 }],
    );
    const s = calculateNassauSettlement(players, null, state, 5);
    // Press on 7-9: Bob 3-0
    expect(s.presses[0].winner).toBe("b");
    expect(s.presses[0].amount).toBe(5);
    // Alice front (5-4), back (9-0), overall (14-4), loses press
    // Totals: Alice +5 +5 +5 -5 = +10
    expect(s.playerAmounts.a).toBe(10);
    expect(s.playerAmounts.b).toBe(-10);
  });

  it("compounding presses — two presses in the same segment each pay", () => {
    const players = makeNassauPlayers(2);
    // Alice wins front 9-0; press on hole 3 (7 holes: Alice 7-0); press on hole 6 (4 holes: Alice 4-0)
    const winners: string[][] = Array.from({ length: 18 }, () => ["a"]);
    const state = applyWinners(
      initNassauState(players),
      winners,
      [{ startHole: 3 }, { startHole: 6 }],
    );
    const s = calculateNassauSettlement(players, null, state, 2);
    expect(s.presses).toHaveLength(2);
    expect(s.presses.every(p => p.winner === "a")).toBe(true);
    // Alice: front + back + overall + 2 presses = 5 × 2 = 10
    expect(s.playerAmounts.a).toBe(10);
    expect(s.playerAmounts.b).toBe(-10);
  });
});

describe("calculateNassauSettlement — overall via back-9 comeback", () => {
  it("2-player: Alice loses front 3-6, wins back 9-0 → overall 12-6 Alice", () => {
    const players = makeNassauPlayers(2);
    const front: string[][] = [
      ["b"], ["b"], ["b"], ["b"], ["b"], ["b"],
      ["a"], ["a"], ["a"],
    ];
    const back: string[][] = Array.from({ length: 9 }, () => ["a"]);
    const state = applyWinners(initNassauState(players), [...front, ...back]);
    const s = calculateNassauSettlement(players, null, state, 10);
    expect(s.front.winner).toBe("b");
    expect(s.back.winner).toBe("a");
    expect(s.overall.winner).toBe("a");
    // Alice: -10 +10 +10 = +10
    expect(s.playerAmounts.a).toBe(10);
    expect(s.playerAmounts.b).toBe(-10);
  });
});

describe("calculateNassauSettlement — abandoned rounds", () => {
  it("only 8 holes played: no segment settles (front requires 9)", () => {
    const players = makeNassauPlayers(2);
    const winners: string[][] = Array.from({ length: 8 }, () => ["a"]);
    const state = applyWinners(initNassauState(players), winners);
    const s = calculateNassauSettlement(players, null, state, 5, 8);
    expect(s.front.settled).toBe(false);
    expect(s.back.settled).toBe(false);
    expect(s.overall.settled).toBe(false);
    expect(s.playerAmounts.a).toBe(0);
    expect(s.playerAmounts.b).toBe(0);
  });

  it("exactly 9 holes played: front settles, back+overall don't", () => {
    const players = makeNassauPlayers(2);
    // Alice wins all 9
    const winners: string[][] = Array.from({ length: 9 }, () => ["a"]);
    const state = applyWinners(initNassauState(players), winners);
    const s = calculateNassauSettlement(players, null, state, 5, 9);
    expect(s.front.settled).toBe(true);
    expect(s.front.winner).toBe("a");
    expect(s.back.settled).toBe(false);
    expect(s.overall.settled).toBe(false);
    expect(s.playerAmounts.a).toBe(5);
    expect(s.playerAmounts.b).toBe(-5);
  });

  it("12 holes played: front settled (9 holes in), back+overall require full 18", () => {
    const players = makeNassauPlayers(2);
    // Front: Alice 5-4, holes 10-12 Alice sweeps
    const winners: string[][] = [
      ["a"], ["a"], ["a"], ["a"], ["a"],
      ["b"], ["b"], ["b"], ["b"],
      ["a"], ["a"], ["a"],
    ];
    const state = applyWinners(initNassauState(players), winners);
    const s = calculateNassauSettlement(players, null, state, 2, 12);
    expect(s.front.settled).toBe(true);
    expect(s.back.settled).toBe(false);
    expect(s.overall.settled).toBe(false);
    expect(s.playerAmounts.a).toBe(2);
    expect(s.playerAmounts.b).toBe(-2);
  });

  it("abandoned round: unsettled press does not pay", () => {
    const players = makeNassauPlayers(2);
    // 5 holes played, press on hole 2
    const winners: string[][] = [["a"], ["a"], ["a"], ["a"], ["a"]];
    const state = applyWinners(
      initNassauState(players),
      winners,
      [{ startHole: 2 }],
    );
    const s = calculateNassauSettlement(players, null, state, 3, 5);
    expect(s.presses[0].settled).toBe(false);
    expect(s.presses[0].amount).toBe(0);
    expect(s.playerAmounts.a).toBe(0);
  });
});

describe("calculateNassauSettlement — handicap pops flow through", () => {
  it("handicap pop flips a hole winner, which flips the segment winner", () => {
    // Two 2-player rounds with identical gross scores but different handicap settings.
    // Handicap pop on hole 1 changes Bob's net score from 5 to 4, matching Alice's gross 4 → push instead of Alice win.
    const players: Player[] = [
      { id: "a", name: "Alice", handicap: 10, color: "#16A34A" },
      { id: "b", name: "Bob",   handicap: 18, color: "#3B82F6" },
    ];

    // Without pops: Alice wins 5-4 on holes 1-9 → front to Alice
    const settingsNoPops = makeSettings({ pops: false });
    // With pops: Bob gets 1 stroke on hole 1 (handicap index 1), ties that hole instead of losing; Alice now 4-4, Bob 4 → push
    const settingsPops = makeSettings({ pops: true });

    // Construct 9 holes where Alice shoots 4s, Bob shoots 5s except hole 6 where Bob shoots 4 and Alice 5
    // Without pops: Alice wins 1-5 and 7-9 = 8 holes, Bob wins hole 6 = 1 hole → Alice 8-1
    // With pops on hole 1 (index 1): Bob net 4 = Alice net 4 → push hole 1 → Alice 7 wins, Bob 1, 1 push → Alice still wins front
    // That's not a flip. Let me design something cleaner.

    // Simpler: Bob has 1 pop on hole 3. Without pops: Alice wins hole 3 (4 vs 5). With pops: hole 3 pushes.
    // Front 9: Alice wins 4-3-4-3, Bob wins 5-6-7-8 depending on design.
    // Let me do: 9 holes, Alice 4 gross every hole. Bob 4 gross on hole 3 only (tie), 5 everywhere else.
    // Without pops: Alice wins 8, Bob 0, 1 push → Alice 8-0 front.
    // With pops (1 stroke on hole 3 → but tied gross so net = 3 vs 4 → Bob wins hole 3): Alice 7, Bob 1, 0 push → Alice 7-1 still wins.
    // That's still not a flip.

    // Let me design for a clean flip:
    // Without pops: Alice wins front 5-4.
    // With pops (2 strokes at handicaps 1-2): Bob wins hole 1 instead of losing, ties hole 2 instead of losing.
    // Without pops front: a,a,a,a,a, b,b,b,b = 5-4 Alice
    // With pops front: _,_,a,a,a, b,b,b,b = Alice 3, Bob 4, 2 pushes → Bob wins 4-3
    const pars = [4, 4, 4, 4, 4, 4, 4, 4, 4];
    const handicaps = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const holes: ReplayHoleInput[] = [
      // Holes 1-5: Alice 4, Bob 5 (Alice wins gross; with 1 pop on each of 1-2, Bob ties; hole 3-5 Alice still wins)
      { holeNumber: 1, scores: { a: 4, b: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 2, scores: { a: 4, b: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 3, scores: { a: 4, b: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 4, scores: { a: 4, b: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 5, scores: { a: 4, b: 5 }, hammerDepth: 0, folded: false },
      // Holes 6-9: Alice 5, Bob 4 (Bob wins gross)
      { holeNumber: 6, scores: { a: 5, b: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 7, scores: { a: 5, b: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 8, scores: { a: 5, b: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 9, scores: { a: 5, b: 4 }, hammerDepth: 0, folded: false },
    ];

    // Without pops: Alice wins front 5-4
    const resNoPops = replayRound(
      "nassau",
      players,
      Array(18).fill(4),
      Array.from({ length: 18 }, (_, i) => i + 1),
      3, settingsNoPops, holes,
    );
    expect(resNoPops.nassauSettlement).toBeDefined();
    expect(resNoPops.nassauSettlement!.front.winner).toBe("a");

    // With pops (Bob handicap 18, Alice 10 → Bob gets 8 strokes on lowest-index holes 1-8):
    // Bob's 5 on holes 1-5 becomes net 4 → ties Alice; Alice's 5 on holes 6-8 → Bob net 3 wins (gets stroke),
    // hole 9 no pop → Bob net 4 wins gross.
    // Front net: holes 1-5 push, holes 6-9 Bob. Alice 0, Bob 4. Bob wins front with pops.
    const resPops = replayRound(
      "nassau",
      players,
      Array(18).fill(4),
      Array.from({ length: 18 }, (_, i) => i + 1),
      3, settingsPops, holes,
    );
    expect(resPops.nassauSettlement!.front.winner).toBe("b");
  });
});

describe("replayRound — Nassau settlement integration", () => {
  it("Nassau replay carries 0 per-hole money; totals come from settlement", () => {
    const players = makeNassauPlayers(2);
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    // Alice shoots 4 every hole; Bob shoots 5 every hole; Alice sweeps
    const holes: ReplayHoleInput[] = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      scores: { a: 4, b: 5 },
      hammerDepth: 0,
      folded: false,
    }));
    const result = replayRound("nassau", players, pars, handicaps, 5, makeSettings(), holes);
    // Alice wins front, back, overall = 3 × 5 = $15
    expect(result.totals.a).toBe(15);
    expect(result.totals.b).toBe(-15);
    // Per-hole results carry 0 amount
    expect(result.holeResults.every(h => h.amount === 0)).toBe(true);
    // Nassau settlement attached
    expect(result.nassauSettlement).toBeDefined();
    expect(result.nassauSettlement!.front.winner).toBe("a");
  });
});
