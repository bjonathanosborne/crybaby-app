import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  computeOpponentStake,
  calculateCrybabyHoleResult,
  type Player,
} from "@/lib/gameEngines";
import CrybabyHoleSetup from "@/components/flip/CrybabyHoleSetup";

// ============================================================
// C6 — Crybaby hole flow: engine primitive + setup component +
// render-gate source guards.
// ============================================================

beforeEach(() => cleanup());

const P: Player[] = [
  { id: "p1", name: "Alice", handicap: 0, color: "#16A34A" },
  { id: "p2", name: "Bob",   handicap: 0, color: "#3B82F6" },
  { id: "p3", name: "Carol", handicap: 0, color: "#F59E0B" },
  { id: "p4", name: "Dave",  handicap: 0, color: "#DC2626" },
  { id: "p5", name: "Eve",   handicap: 0, color: "#8B5CF6" },
];

// ============================================================
// computeOpponentStake — even-rounded bet ÷ 3 with $2 floor
// ============================================================

describe("computeOpponentStake", () => {
  it("$30 → $10 (exact, even)", () => { expect(computeOpponentStake(30)).toBe(10); });
  it("$24 → $8 (exact, even)", () => { expect(computeOpponentStake(24)).toBe(8); });
  it("$20 → $6 (6.67 rounds to even 6)", () => { expect(computeOpponentStake(20)).toBe(6); });
  it("$22 → $8 (7.33 rounds to even 8)", () => { expect(computeOpponentStake(22)).toBe(8); });
  it("$14 → $4 (4.67 rounds to even 4)", () => { expect(computeOpponentStake(14)).toBe(4); });
  it("$10 → $4 (3.33 rounds to even 4)", () => { expect(computeOpponentStake(10)).toBe(4); });
  it("$8 → $2 (2.67 rounds to even 2 but floor lifts to 2)", () => { expect(computeOpponentStake(8)).toBe(2); });
  it("$6 → $2 (2 exact)", () => { expect(computeOpponentStake(6)).toBe(2); });
  it("$4 → $2 (1.33 floored to 2 via even-bet floor)", () => { expect(computeOpponentStake(4)).toBe(2); });
  it("$2 → $2 (0.67 floored to 2)", () => { expect(computeOpponentStake(2)).toBe(2); });
  it("$0 → $0", () => { expect(computeOpponentStake(0)).toBe(0); });
  it("negative → 0", () => { expect(computeOpponentStake(-5)).toBe(0); });
});

// ============================================================
// calculateCrybabyHoleResult — payout math both directions
// ============================================================

describe("calculateCrybabyHoleResult — 2-man wins", () => {
  it("$30 bet, 2-man wins → 2-man each +$15, 3-man each -$10", () => {
    const r = calculateCrybabyHoleResult({
      bet: 30, crybabyId: "p1", partnerId: "p2", players: P, twoManWon: true,
    });
    expect(r.push).toBe(false);
    expect(r.winningSide).toBe("A");
    expect(r.opponentStake).toBe(10);
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(15);
    expect(r.perPlayer.find(p => p.id === "p2")!.amount).toBe(15);
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBe(-10);
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(-10);
    expect(r.perPlayer.find(p => p.id === "p5")!.amount).toBe(-10);
    // Zero-sum: 2×$15 = $30 = 3×$10.
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(0);
  });

  it("$10 bet (opponentStake floors to $4), 2-man wins → 2-man each +$6, 3-man each -$4", () => {
    const r = calculateCrybabyHoleResult({
      bet: 10, crybabyId: "p1", partnerId: "p2", players: P, twoManWon: true,
    });
    expect(r.opponentStake).toBe(4);
    // 2-man gain = (3 × 4) / 2 = $6 each
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(6);
    expect(r.perPlayer.find(p => p.id === "p2")!.amount).toBe(6);
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBe(-4);
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(0);
  });
});

describe("calculateCrybabyHoleResult — 3-man wins", () => {
  it("$30 bet, 3-man wins → 3-man each +$20, 2-man each -$30", () => {
    const r = calculateCrybabyHoleResult({
      bet: 30, crybabyId: "p1", partnerId: "p2", players: P, twoManWon: false,
    });
    expect(r.winningSide).toBe("B");
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(-30);
    expect(r.perPlayer.find(p => p.id === "p2")!.amount).toBe(-30);
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBe(20);
    expect(r.perPlayer.find(p => p.id === "p4")!.amount).toBe(20);
    expect(r.perPlayer.find(p => p.id === "p5")!.amount).toBe(20);
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(0);
  });

  it("$12 bet (divisible by 3), 3-man wins → 3-man each +$8, 2-man each -$12 (clean integers)", () => {
    const r = calculateCrybabyHoleResult({
      bet: 12, crybabyId: "p1", partnerId: "p2", players: P, twoManWon: false,
    });
    // 3-man gain = (2 × 12) / 3 = $8
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBe(8);
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(-12);
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBe(0);
  });

  it("$14 bet (not divisible by 3) — zero-sum preserved even with fractional 3-man share", () => {
    const r = calculateCrybabyHoleResult({
      bet: 14, crybabyId: "p1", partnerId: "p2", players: P, twoManWon: false,
    });
    // 3-man gain = 28 / 3 = $9.333... per winner (fractional, C7 rounds at settlement display)
    expect(r.perPlayer.find(p => p.id === "p3")!.amount).toBeCloseTo(28 / 3, 5);
    expect(r.perPlayer.find(p => p.id === "p1")!.amount).toBe(-14);
    // Zero-sum invariant still holds.
    expect(r.perPlayer.reduce((a, b) => a + b.amount, 0)).toBeCloseTo(0, 5);
  });
});

describe("calculateCrybabyHoleResult — push", () => {
  it("net zero per player, no carry (crybaby holes are independent)", () => {
    const r = calculateCrybabyHoleResult({
      bet: 30, crybabyId: "p1", partnerId: "p2", players: P, twoManWon: null,
    });
    expect(r.push).toBe(true);
    expect(r.winningSide).toBeNull();
    expect(r.perPlayer.every(p => p.amount === 0)).toBe(true);
  });
});

// ============================================================
// <CrybabyHoleSetup />
// ============================================================

describe("<CrybabyHoleSetup />", () => {
  it("renders the crybaby's name + all 4 candidates as partner options (excluding crybaby)", () => {
    render(
      <CrybabyHoleSetup
        holeNumber={16}
        players={P}
        crybabyId="p1"
        maxBetPerHole={30}
        onConfirm={() => {}}
      />,
    );
    // Crybaby header mentions Alice; partner list has Bob/Carol/Dave/Eve, not Alice.
    expect(screen.getByTestId("crybaby-hole-setup-root")).toHaveTextContent(/Alice/);
    expect(screen.queryByTestId("crybaby-hole-setup-partner-p1")).not.toBeInTheDocument();
    for (const id of ["p2", "p3", "p4", "p5"]) {
      expect(screen.getByTestId(`crybaby-hole-setup-partner-${id}`)).toBeInTheDocument();
    }
  });

  it("bet stepper clamps at $2 min and maxBetPerHole max", () => {
    render(
      <CrybabyHoleSetup
        holeNumber={16} players={P} crybabyId="p1" maxBetPerHole={10}
        onConfirm={() => {}}
      />,
    );
    const dec = screen.getByTestId("crybaby-hole-setup-bet-decrement");
    const inc = screen.getByTestId("crybaby-hole-setup-bet-increment");
    // Start at $2 → dec is disabled.
    expect(dec).toBeDisabled();
    // Inc repeatedly: $2 → $4 → $6 → $8 → $10 → disabled.
    fireEvent.click(inc); fireEvent.click(inc); fireEvent.click(inc); fireEvent.click(inc);
    expect(screen.getByTestId("crybaby-hole-setup-bet-value")).toHaveTextContent("$10");
    expect(inc).toBeDisabled();
    // Dec back: $10 → $8 → $6 → enabled again.
    fireEvent.click(dec);
    expect(screen.getByTestId("crybaby-hole-setup-bet-value")).toHaveTextContent("$8");
  });

  it("quick-pick chips only show values within the cap", () => {
    render(
      <CrybabyHoleSetup
        holeNumber={16} players={P} crybabyId="p1" maxBetPerHole={6}
        onConfirm={() => {}}
      />,
    );
    // $2, $4, $6 chips present; $10 and $20 suppressed.
    expect(screen.getByTestId("crybaby-hole-setup-bet-chip-2")).toBeInTheDocument();
    expect(screen.getByTestId("crybaby-hole-setup-bet-chip-4")).toBeInTheDocument();
    expect(screen.getByTestId("crybaby-hole-setup-bet-chip-6")).toBeInTheDocument();
    expect(screen.queryByTestId("crybaby-hole-setup-bet-chip-10")).not.toBeInTheDocument();
    expect(screen.queryByTestId("crybaby-hole-setup-bet-chip-20")).not.toBeInTheDocument();
  });

  it("Confirm is disabled until a partner is chosen", () => {
    const onConfirm = vi.fn();
    render(
      <CrybabyHoleSetup
        holeNumber={16} players={P} crybabyId="p1" maxBetPerHole={30}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByTestId("crybaby-hole-setup-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByTestId("crybaby-hole-setup-partner-p3"));
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const arg = onConfirm.mock.calls[0][0];
    expect(arg.partner).toBe("p3");
    expect(arg.bet).toBe(2);
    expect(arg.teams.teamA.players.map((p: Player) => p.id).sort()).toEqual(["p1", "p3"]);
    expect(arg.teams.teamB.players.map((p: Player) => p.id).sort()).toEqual(["p2", "p4", "p5"]);
  });

  it("stakes preview shows bet + partner match + opponent stake + total pot", () => {
    render(
      <CrybabyHoleSetup
        holeNumber={17} players={P} crybabyId="p1" maxBetPerHole={30}
        onConfirm={() => {}}
      />,
    );
    // Click +++ to get to $8 then chip $30 to test.
    fireEvent.click(screen.getByTestId("crybaby-hole-setup-bet-chip-20"));
    const preview = screen.getByTestId("crybaby-hole-setup-stakes-preview");
    expect(preview).toHaveTextContent(/\$20/); // crybaby + partner stake
    expect(preview).toHaveTextContent(/\$6/);   // opponent stake (20/3 → 6.67 → 6 even)
    // Total pot = 2*20 + 3*6 = 58
    expect(preview).toHaveTextContent(/\$58/);
  });
});

// ============================================================
// CrybabyActiveRound source guards
// ============================================================

describe("CrybabyActiveRound — C6 integration source guards", () => {
  it("imports CrybabyHoleSetup + calculateCrybabyHoleResult + CrybabyHoleChoice type", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/import CrybabyHoleSetup from\s+["']@\/components\/flip\/CrybabyHoleSetup["']/);
    expect(src).toMatch(/calculateCrybabyHoleResult/);
    expect(src).toMatch(/type CrybabyHoleChoice/);
  });

  it("renders CrybabyHoleSetup for holes 16-18 when crybaby is designated + byHole entry missing", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(
      /round\.gameMode\s*===\s*'flip'\s*&&[\s\S]*?currentHole\s*>=\s*16\s*&&[\s\S]*?currentHole\s*<=\s*18[\s\S]*?crybabyState\.crybaby\s*!==\s*""\s*&&[\s\S]*?!crybabyState\.byHole\[currentHole\]/,
    );
    expect(src).toMatch(/<CrybabyHoleSetup[\s\S]*?onConfirm=\{handleCrybabyHoleSetupConfirm\}/);
  });

  it("handleCrybabyHoleSetupConfirm writes CrybabyState.byHole[currentHole] via PersistResult + Retry toast", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/const\s+handleCrybabyHoleSetupConfirm\s*=/);
    expect(src).toMatch(/nextByHole[\s\S]*?currentHole[\s\S]*?bet:\s*choice\.bet[\s\S]*?partner:\s*choice\.partner[\s\S]*?teams:\s*choice\.teams/);
    expect(src).toMatch(/persist\.persistGameState\(roundId,\s*\{[\s\S]*?crybabyState:\s*nextCrybaby/);
    expect(src).toMatch(/Couldn't save hole \${currentHole} setup/);
    expect(src).toMatch(/<ToastAction[\s\S]*?handleCrybabyHoleSetupConfirm\(choice\)/);
  });

  it("calculateHoleResult routes crybaby holes through calculateCrybabyHoleResult", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // Branch is gated on gameMode + currentHole range + crybabyState.byHole[currentHole] present.
    expect(src).toMatch(
      /gameMode\s*===\s*'flip'\s*&&[\s\S]*?currentHole\s*>=\s*16[\s\S]*?crybabyState\.byHole\[currentHole\][\s\S]*?calculateCrybabyHoleResult/,
    );
    // twoManWon is determined by comparing best-ball of the two teams.
    expect(src).toMatch(/twoManBest[\s\S]*?threeManBest/);
  });

  it("all-square branch (crybaby === '') skips the setup gate and lets base game continue", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // The setup render gate explicitly checks crybaby !== "" before showing,
    // so the sentinel state falls through to the base-game scoring UI.
    expect(src).toMatch(/crybabyState\.crybaby\s*!==\s*""\s*&&[\s\S]*?!crybabyState\.byHole\[currentHole\]/);
  });
});
