import { describe, it, expect, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";

import { GAME_FORMATS } from "@/lib/gameFormats";
import { calculateScorecardResult, type Player, type GameMode } from "@/lib/gameEngines";

// ============================================================
// PR #19 — Scorecard mode.
//
// Coverage:
//   (a) gameFormats registry — scorecard entry shape
//   (b) GameMode union accepts 'scorecard'
//   (c) calculateScorecardResult engine helper — zero payload invariant
//   (d) Setup wizard source-level: hides hole value + mechanics +
//       exposure for scorecard; 1-6 player range enforced
//   (e) CrybabyActiveRound source-level: hasMoneyMode predicate,
//       scorecard runtime dispatch, settlement skip, auto-advance
//   (f) RoundDetailPage source-level: net-leaderboard render gate,
//       strokes computation via getStrokesOnHole
// ============================================================

beforeEach(() => cleanup());

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

// ---------- (a)+(b) format registry + type ----------

describe("GAME_FORMATS — scorecard entry", () => {
  const entry = GAME_FORMATS.find(g => g.id === "scorecard");

  it("is registered", () => {
    expect(entry).toBeDefined();
  });

  it("is visible in the picker (hidden: false)", () => {
    expect(entry?.hidden).toBe(false);
  });

  it("supports 1-6 players", () => {
    expect(entry?.players).toEqual({ min: 1, max: 6 });
  });

  it("has no mechanics + non-team structure", () => {
    expect(entry?.mechanics).toEqual([]);
    expect(entry?.teamStructure).toBe("scorecard");
    expect(entry?.requiresCarts).toBe(false);
  });

  it("description reflects the betting-free framing", () => {
    expect(entry?.description).toMatch(/No betting/i);
  });
});

describe("GameMode union — scorecard literal", () => {
  it("accepts 'scorecard' as a valid GameMode", () => {
    // Compile-time check: if 'scorecard' is ever removed from the union,
    // this assignment breaks typecheck. The runtime assertion is belt-and-
    // suspenders.
    const m: GameMode = "scorecard";
    expect(m).toBe("scorecard");
  });
});

// ---------- (c) engine helper ----------

describe("calculateScorecardResult", () => {
  const players: Player[] = [
    { id: "p1", name: "Alice", handicap: 8, color: "#16A34A" },
    { id: "p2", name: "Bob",   handicap: 12, color: "#3B82F6" },
    { id: "p3", name: "Carol", handicap: 0,  color: "#F59E0B" },
  ];

  it("returns zero amount + no winner + empty quip's just 'Scored.'", () => {
    const r = calculateScorecardResult(players);
    expect(r.push).toBe(false);
    expect(r.winnerName).toBeNull();
    expect(r.amount).toBe(0);
    expect(r.carryOver).toBe(0);
    expect(r.quip).toBe("Scored.");
  });

  it("every per-player amount is 0", () => {
    const r = calculateScorecardResult(players);
    expect(r.playerResults).toHaveLength(3);
    for (const pr of r.playerResults) {
      expect(pr.amount).toBe(0);
    }
  });

  it("preserves player ids + names in playerResults", () => {
    const r = calculateScorecardResult(players);
    expect(r.playerResults.map(p => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(r.playerResults.map(p => p.name)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("empty player list → empty playerResults", () => {
    const r = calculateScorecardResult([]);
    expect(r.playerResults).toEqual([]);
    expect(r.amount).toBe(0);
  });

  it("zero-sum invariant holds trivially (every amount is 0)", () => {
    const r = calculateScorecardResult(players);
    const sum = r.playerResults.reduce((acc, pr) => acc + pr.amount, 0);
    expect(sum).toBe(0);
  });
});

// ---------- (d) Setup wizard source-level ----------

describe("CrybabySetupWizard — scorecard config gating (source-level)", () => {
  const src = readFile("src/pages/CrybabySetupWizard.jsx");

  it("Hole Value section is suppressed for scorecard", () => {
    expect(src).toMatch(/selectedFormat !== "flip" && selectedFormat !== "scorecard"/);
  });

  it("Game Mechanics section is suppressed for scorecard", () => {
    // Look for the mechanics wrapper gating
    expect(src).toMatch(/selectedFormat !== "scorecard"[\s\S]{0,400}Game Mechanics/);
  });

  it("Estimated Max Exposure card is suppressed for scorecard", () => {
    expect(src).toMatch(/Estimated exposure[\s\S]*?selectedFormat !== "scorecard"/);
  });

  it("Review screen omits Hole Value + Mechanics rows for scorecard", () => {
    // The review render wraps those two ReviewSections in a selectedFormat !== "scorecard" gate.
    expect(src).toMatch(/selectedFormat !== "scorecard"[\s\S]{0,400}Hole Value[\s\S]{0,400}Mechanics/);
  });

  it("canProceed returns true on Rules step for scorecard regardless of holeValue", () => {
    expect(src).toMatch(/selectedFormat === "scorecard"\)\s*\{\s*return true;/);
  });

  it("createRound is called with persistedHoleValue=0 + stakes='Scorecard' for scorecard", () => {
    expect(src).toMatch(/selectedFormat === "scorecard"\s*\?\s*0/);
    expect(src).toMatch(/selectedFormat === "scorecard"\s*\?\s*"Scorecard"/);
  });
});

// ---------- (e) CrybabyActiveRound source-level ----------

describe("CrybabyActiveRound — scorecard runtime wiring (source-level)", () => {
  const src = readFile("src/pages/CrybabyActiveRound.tsx");

  it("imports calculateScorecardResult from gameEngines", () => {
    expect(src).toMatch(/calculateScorecardResult/);
  });

  it("declares hasMoneyMode predicate derived from gameMode", () => {
    expect(src).toMatch(/const hasMoneyMode = round\.gameMode !== 'scorecard'/);
  });

  it("dispatches to calculateScorecardResult in the hole-result branch", () => {
    expect(src).toMatch(/if \(gameMode === 'scorecard'\)\s*\{\s*return calculateScorecardResult\(players\);/);
  });

  it("skips the settlement write when !hasMoneyMode (scorecard rounds)", () => {
    // Must appear BEFORE the persistSettlements call in handleRoundCompletion
    const gatePos = src.indexOf("if (!hasMoneyMode) {");
    const settlePos = src.indexOf("persist.persistSettlements(roundId, settlementData)");
    expect(gatePos).toBeGreaterThan(0);
    expect(gatePos).toBeLessThan(settlePos);
  });

  it("HoleResultCard render predicate now includes hasMoneyMode", () => {
    expect(src).toMatch(/showResult && hasMoneyMode/);
  });

  it("auto-advance useEffect fires for scorecard when showResult is set", () => {
    expect(src).toMatch(/round\.gameMode !== 'scorecard'/);
    expect(src).toMatch(/advanceHole\(\);\s*\/\/ Purposely omit advanceHole from deps/);
  });

  it("Leaderboard component call-site passes mode='strokes' for scorecard rounds", () => {
    expect(src).toMatch(/mode=\{hasMoneyMode \? "money" : "strokes"\}/);
  });

  it("Leaderboard component accepts mode prop and strokesByPlayer", () => {
    // Regex uses [\s\S]*? to allow the default-value `{}` token inside
    // the destructure (`strokesByPlayer = {}`) without tripping a
    // negative char-class match on the closing brace.
    expect(src).toMatch(/function Leaderboard\(\{[\s\S]*?mode[\s\S]*?strokesByPlayer[\s\S]*?\}\)/);
  });
});

// ---------- (f) RoundDetailPage source-level ----------

describe("RoundDetailPage — net leaderboard (Handicap B, source-level)", () => {
  const src = readFile("src/pages/RoundDetailPage.tsx");

  it("imports getStrokesOnHole from gameEngines", () => {
    expect(src).toMatch(/import \{ getStrokesOnHole \} from "@\/lib\/gameEngines"/);
  });

  it("netLeaderboard memo bails when any player lacks a handicap", () => {
    expect(src).toMatch(/allHaveHcp\s*=\s*playerConfigs\.every\(pc =>/);
    expect(src).toMatch(/if \(!allHaveHcp\) return null/);
  });

  it("net = gross - strokes sorted ascending (lowest best)", () => {
    expect(src).toMatch(/net\s*=\s*gross\s*-\s*strokes/);
    expect(src).toMatch(/\.sort\(\(a, b\) => a\.net - b\.net\)/);
  });

  it("strokes summed over holes via getStrokesOnHole with handicapPercent=100", () => {
    expect(src).toMatch(/getStrokesOnHole\(hcp, lowestHcp, handicapRanks\[h\], 100\)/);
  });

  it("renders the Net Totals block only when the memo is non-null", () => {
    expect(src).toMatch(/netLeaderboard && netLeaderboard\.length > 0 && \(/);
    expect(src).toMatch(/data-testid="round-detail-net-leaderboard"/);
  });

  it("each net row has stable testids + shows gross alongside", () => {
    expect(src).toMatch(/data-testid=\{`round-detail-net-row-\$\{i\}`\}/);
    expect(src).toMatch(/data-testid=\{`round-detail-net-\$\{i\}`\}/);
    expect(src).toMatch(/data-testid=\{`round-detail-net-gross-\$\{i\}`\}/);
    expect(src).toMatch(/\{row\.gross\}\s*−\s*\{row\.strokes\}/);
  });
});

// ---------- (g) integration: replayRound dispatches to scorecard ----------

describe("replayRound — scorecard dispatch (engine integration)", () => {
  it("feeds scorecard holes through calculateScorecardResult (zero-sum totals)", async () => {
    const { replayRound } = await import("@/lib/gameEngines");
    const players: Player[] = [
      { id: "p1", name: "Alice", handicap: 0, color: "#16A34A" },
      { id: "p2", name: "Bob",   handicap: 0, color: "#3B82F6" },
    ];
    const pars = Array(18).fill(4);
    const handicaps = Array.from({ length: 18 }, (_, i) => i + 1);
    const settings = {
      hammer: false, hammerInitiator: "any", hammerMaxDepth: "1",
      crybaby: false, crybabHoles: 3, crybabHammerRule: "allowed",
      birdieBonus: false, birdieMultiplier: 2,
      pops: false, noPopsParThree: true,
      carryOverCap: "∞", handicapPercent: 100,
      presses: false, pressType: "auto",
    } as const;
    const holes = [
      { holeNumber: 1, scores: { p1: 4, p2: 5 }, hammerDepth: 0, folded: false },
      { holeNumber: 2, scores: { p1: 5, p2: 4 }, hammerDepth: 0, folded: false },
      { holeNumber: 3, scores: { p1: 3, p2: 6 }, hammerDepth: 0, folded: false },
    ];
    const result = replayRound("scorecard", players, pars, handicaps, 5, settings, holes);
    // All totals zero regardless of scores.
    expect(result.totals).toEqual({ p1: 0, p2: 0 });
    expect(result.holeResults).toHaveLength(3);
    for (const hr of result.holeResults) {
      expect(hr.amount).toBe(0);
      expect(hr.carryOver).toBe(0);
      expect(hr.winnerName).toBeNull();
      for (const pr of hr.playerResults) {
        expect(pr.amount).toBe(0);
      }
    }
  });
});
