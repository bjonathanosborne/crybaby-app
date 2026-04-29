import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FlipTeamsBadge from "@/components/flip/FlipTeamsBadge";
import type { TeamInfo } from "@/lib/gameEngines";

// ============================================================
// C4B runtime-wiring guards for Flip base game.
// ============================================================

beforeEach(() => cleanup());

function mkTeams3v2(): TeamInfo {
  return {
    teamA: {
      name: "Heads",
      color: "#16A34A",
      players: [
        { id: "p1", name: "Alice", handicap: 0, color: "#16A34A" },
        { id: "p2", name: "Bob",   handicap: 0, color: "#3B82F6" },
        { id: "p3", name: "Carol", handicap: 0, color: "#F59E0B" },
      ],
    },
    teamB: {
      name: "Tails",
      color: "#DC2626",
      players: [
        { id: "p4", name: "Dave", handicap: 0, color: "#DC2626" },
        { id: "p5", name: "Eve",  handicap: 0, color: "#8B5CF6" },
      ],
    },
  };
}

// ============================================================
// FlipTeamsBadge
// ============================================================

describe("<FlipTeamsBadge />", () => {
  it("renders the hole number + both teams' player names", () => {
    render(<FlipTeamsBadge holeNumber={4} teams={mkTeams3v2()} />);
    expect(screen.getByText("Hole 4 teams")).toBeInTheDocument();
    const teams = screen.getByTestId("flip-teams-badge-teams");
    expect(teams).toHaveTextContent("Alice, Bob, Carol");
    expect(teams).toHaveTextContent("Dave, Eve");
  });

  it("returns null when teams are missing (pre-flip state)", () => {
    const { container } = render(<FlipTeamsBadge holeNumber={2} teams={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("has a descriptive aria-label for screen readers", () => {
    render(<FlipTeamsBadge holeNumber={7} teams={mkTeams3v2()} />);
    const badge = screen.getByTestId("flip-teams-badge-root");
    const label = badge.getAttribute("aria-label") || "";
    expect(label).toMatch(/hole 7/i);
    expect(label).toMatch(/Heads/);
    expect(label).toMatch(/Alice, Bob, Carol/);
    expect(label).toMatch(/Tails/);
    expect(label).toMatch(/Dave, Eve/);
  });
});

// ============================================================
// Source guards for the C4B integration points
// ============================================================

describe("C4B — useRoundState widened to carry flipState / flipConfig / rollingCarryWindow", () => {
  it("useRoundState.ts exposes all three new setters", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useRoundState.ts"),
      "utf-8",
    );
    expect(src).toMatch(/flipState:\s*FlipState/);
    expect(src).toMatch(/setFlipState:/);
    expect(src).toMatch(/flipConfig:\s*FlipConfig\s*\|\s*null/);
    expect(src).toMatch(/setFlipConfig:/);
    expect(src).toMatch(/rollingCarryWindow:\s*RollingCarryWindow\s*\|\s*null/);
    expect(src).toMatch(/setRollingCarryWindow:/);
    // initFlipState() seeds the default empty per-hole map.
    expect(src).toMatch(/useState<FlipState>\(\(\)\s*=>\s*initFlipState\(\)\)/);
  });

  it("getSnapshot returns flipState + flipConfig + rollingCarryWindow for persistence", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useRoundState.ts"),
      "utf-8",
    );
    const snap = src.match(/const getSnapshot[\s\S]*?\}\), \[[\s\S]*?\]\);/);
    expect(snap).toBeTruthy();
    const body = snap?.[0] ?? "";
    expect(body).toMatch(/flipState,/);
    expect(body).toMatch(/flipConfig,/);
    expect(body).toMatch(/rollingCarryWindow,/);
  });
});

describe("C4B — useAdvanceHole integrates advanceFlipState + rolling window", () => {
  it("imports the engine primitives and wires them into the advance path", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useAdvanceHole.ts"),
      "utf-8",
    );
    expect(src).toMatch(/advanceFlipState,\s*\n/);
    expect(src).toMatch(/appendPushToWindow,\s*\n/);
    expect(src).toMatch(/claimRollingCarryWindow,\s*\n/);
    expect(src).toMatch(/initRollingCarryWindow/);
  });

  it("gates the Flip path on gameMode === 'flip' AND currentHole <= 15", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useAdvanceHole.ts"),
      "utf-8",
    );
    // Crybaby phase (16-18) must NOT flow through advanceFlipState.
    expect(src).toMatch(/gameMode\s*===\s*'flip'\s*&&\s*state\.currentHole\s*<=\s*15/);
  });

  it("persists nextFlipState + rollingCarryWindow via game_state snapshot", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useAdvanceHole.ts"),
      "utf-8",
    );
    // The GameStateSnapshot written to persistence must include the new
    // fields. If someone rewrites this block and forgets either, the
    // persistence layer silently drops them.
    expect(src).toMatch(/flipState:\s*nextFlipState/);
    expect(src).toMatch(/rollingCarryWindow:\s*nextRollingCarryWindow/);
  });

  it("pushes update per-player amounts + claims window on decided holes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/hooks/useAdvanceHole.ts"),
      "utf-8",
    );
    // Must branch on result.push to pick append vs claim.
    expect(src).toMatch(/if\s*\(\s*result\.push\s*\)[\s\S]*?appendPushToWindow/);
    expect(src).toMatch(/else[\s\S]*?claimRollingCarryWindow\([\s\S]*?cleared/);
  });
});

describe("C4B — setup wizard flip-config panel", () => {
  it("renders a base-bet picker and a carry-over window selector when selectedFormat is 'flip'", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabySetupWizard.jsx"),
      "utf-8",
    );
    // Panel is gated on selectedFormat === "flip" so non-flip rounds see the
    // standard Hole Value picker.
    expect(src).toMatch(/selectedFormat\s*===\s*"flip"\s*&&[\s\S]*?data-testid="flip-config-panel"/);
    // Bet: even-only validation + increment/decrement handlers.
    expect(src).toMatch(/setFlipBaseBet\(Math\.max\(2,\s*flipBaseBet\s*-\s*2\)\)/);
    expect(src).toMatch(/setFlipBaseBet\(flipBaseBet\s*\+\s*2\)/);
    // Window selector exposes the six spec values.
    expect(src).toMatch(/\[1,\s*2,\s*3,\s*4,\s*5,\s*"all"\]/);
    // Step 3 gate: flip round needs both baseBet + window before advancing.
    expect(src).toMatch(/flipConfigReady\s*=\s*flipBetIsValid\s*&&\s*flipWindowIsChosen/);
  });

  it("passes flipConfig through the round-create call when the scorekeeper picked Flip", async () => {
    // PR #30 D4-A: wizard now calls `startRound` (atomic RPC path).
    // The flipConfig arg flows through the same shape; this test
    // tolerates either function name so the assertion stays robust
    // if/when createRound is fully removed in a follow-up.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabySetupWizard.jsx"),
      "utf-8",
    );
    expect(src).toMatch(/selectedFormat\s*===\s*"flip"[\s\S]*?\{\s*baseBet:\s*flipBaseBet,\s*carryOverWindow:\s*flipCarryWindow\s*\}/);
    // The wizard's create-round call object must include flipConfig.
    // Accepts startRound (current) or createRound (legacy).
    expect(src).toMatch(/(startRound|createRound)\(\{[\s\S]*?flipConfig,[\s\S]*?\}\)/);
  });
});

describe("C4B — round creation seeds game_state.flipConfig + empty flipState", () => {
  it("db.ts startRound accepts flipConfig and writes it into course_details.game_state", async () => {
    // PR #30 D4-A: startRound is the canonical path. Its courseDetails
    // builder mirrors the deprecated createRound's flipConfig handling.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db.ts"),
      "utf-8",
    );
    // startRound's StartRoundArgs interface includes flipConfig
    expect(src).toMatch(/flipConfig\?:\s*\{\s*baseBet:\s*number;\s*carryOverWindow:/);
    // courseDetails payload conditionally includes flipConfig + empty FlipState
    expect(src).toMatch(
      /\.\.\.\(args\.flipConfig\s*&&\s*\{\s*game_state:\s*\{\s*flipConfig:\s*args\.flipConfig,\s*flipState:\s*\{\s*teamsByHole:\s*\{\}/,
    );
  });
});

describe("C4B — CrybabyActiveRound runtime integration", () => {
  it("imports FlipReel + FlipTeamsBadge + commitFlipTeams", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/import FlipReel from\s+["']@\/components\/flip\/FlipReel["']/);
    expect(src).toMatch(/import FlipTeamsBadge from\s+["']@\/components\/flip\/FlipTeamsBadge["']/);
    expect(src).toMatch(/import\s+\{[\s\S]*?commitFlipTeams[\s\S]*?\}\s+from\s+["']@\/lib\/gameEngines["']/);
  });

  it("renders FlipTeamsBadge during Flip base game only (holes 1-15)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // The badge is wrapped in a gameMode + currentHole <= 15 guard.
    expect(src).toMatch(/round\.gameMode\s*===\s*'flip'\s*&&\s*currentHole\s*<=\s*15[\s\S]*?<FlipTeamsBadge/);
  });

  it("renders a per-hole Flip button with push-aware disabled state + tooltip", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/data-testid="flip-per-hole-button"/);
    // Scorekeeper-only + hole 2+.
    expect(src).toMatch(/isScorekeeper\s*&&\s*currentHole\s*>=\s*2/);
    // Disabled when prior hole was a push AND teams are already locked.
    expect(src).toMatch(/prevHoleWasPush\s*&&\s*teamsAlreadyLocked/);
    expect(src).toMatch(/Teams stay after a push/);
  });

  it("replaces the legacy inline FlipTeamModal with FlipReel (initial + per-hole instances)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // The two reels are rendered via FlipReel, not FlipTeamModal.
    expect(src).toMatch(/<FlipReel[\s\S]*?mode="initial"/);
    expect(src).toMatch(/<FlipReel[\s\S]*?mode="per-hole"/);
    // handleFlipConfirm writes to flipState via commitFlipTeams + persists.
    expect(src).toMatch(/commitFlipTeams\(flipState,\s*targetHole,\s*teams\)/);
    expect(src).toMatch(/persist\.persistGameState\(roundId/);
  });

  it("hydrates flipState + flipConfig from course_details.game_state on round load", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/if\s*\(saved\.flipConfig\)\s*setFlipConfig/);
    expect(src).toMatch(/if\s*\(saved\.flipState\)\s*setFlipState/);
  });
});
