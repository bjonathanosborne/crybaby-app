import { describe, it, expect } from "vitest";
import { getTeamsForHole } from "@/lib/gameEngines";
import type { Player } from "@/lib/gameEngines";

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
