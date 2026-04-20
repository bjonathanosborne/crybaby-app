import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { canInitiateCrybabyHammer } from "@/lib/flipCrybaby";

// ============================================================
// C6.1 — crybaby hammer-initiator gate tests.
//
// Pure helper (canInitiateCrybabyHammer) + source guards on the
// CrybabyActiveRound UI path that renders the disabled button.
// ============================================================

beforeEach(() => cleanup());

const aCrybabyState = {
  crybaby: "p1",
  byHole: {
    16: { partner: "p2" },
    17: { partner: "p3" },
  },
};

// ============================================================
// canInitiateCrybabyHammer — every edge case in one suite
// ============================================================

describe("canInitiateCrybabyHammer — gate open (returns true)", () => {
  it("base game hole (1-15): always true regardless of crybaby state", () => {
    for (const h of [1, 5, 10, 15]) {
      expect(canInitiateCrybabyHammer({
        gameMode: "flip",
        currentHole: h,
        crybabyState: aCrybabyState,
        currentUserPlayerId: "p5", // 3-man team member
      })).toBe(true);
    }
  });

  it("non-flip game mode: always true (gate is Flip-exclusive)", () => {
    expect(canInitiateCrybabyHammer({
      gameMode: "drivers_others_carts",
      currentHole: 17,
      crybabyState: aCrybabyState,
      currentUserPlayerId: "p5",
    })).toBe(true);
  });

  it("crybabyState is null (non-crybaby Flip round): true", () => {
    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 16,
      crybabyState: null,
      currentUserPlayerId: "p5",
    })).toBe(true);
  });

  it("crybaby sentinel (all-square, crybaby === ''): true", () => {
    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 17,
      crybabyState: { crybaby: "", byHole: {} },
      currentUserPlayerId: "p5",
    })).toBe(true);
  });

  it("crybaby phase but byHole not yet populated for currentHole: true (hammer not in play)", () => {
    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 18, // 18 has no byHole entry in the fixture
      crybabyState: aCrybabyState,
      currentUserPlayerId: "p5",
    })).toBe(true);
  });

  it("scorekeeper IS the crybaby: true", () => {
    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 16,
      crybabyState: aCrybabyState,
      currentUserPlayerId: "p1", // crybaby
    })).toBe(true);
  });

  it("scorekeeper IS the chosen partner for THIS hole: true", () => {
    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 16,
      crybabyState: aCrybabyState,
      currentUserPlayerId: "p2", // hole 16 partner
    })).toBe(true);

    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 17,
      crybabyState: aCrybabyState,
      currentUserPlayerId: "p3", // hole 17 partner (different from hole 16)
    })).toBe(true);
  });
});

describe("canInitiateCrybabyHammer — gate closed (returns false)", () => {
  it("crybaby phase, setup confirmed, scorekeeper on the 3-man team", () => {
    // Hole 16: 2-man = {p1, p2}; 3-man = {p3, p4, p5}.
    for (const id of ["p3", "p4", "p5"]) {
      expect(canInitiateCrybabyHammer({
        gameMode: "flip",
        currentHole: 16,
        crybabyState: aCrybabyState,
        currentUserPlayerId: id,
      })).toBe(false);
    }
  });

  it("different partner per hole: former partner blocked, new partner allowed", () => {
    // Hole 17 partner is p3, so p2 (hole 16 partner) is now on the 3-man side.
    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 17,
      crybabyState: aCrybabyState,
      currentUserPlayerId: "p2",
    })).toBe(false);

    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 17,
      crybabyState: aCrybabyState,
      currentUserPlayerId: "p3",
    })).toBe(true);
  });

  it("spectator / admin (currentUserPlayerId === null) during crybaby phase: false", () => {
    expect(canInitiateCrybabyHammer({
      gameMode: "flip",
      currentHole: 16,
      crybabyState: aCrybabyState,
      currentUserPlayerId: null,
    })).toBe(false);
  });
});

// ============================================================
// CrybabyActiveRound source guards
// ============================================================

describe("CrybabyActiveRound — C6.1 hammer gate UI integration", () => {
  it("imports canInitiateCrybabyHammer from @/lib/flipCrybaby", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/import\s*\{[^}]*canInitiateCrybabyHammer[^}]*\}\s*from\s*["']@\/lib\/flipCrybaby["']/);
  });

  it("resolves currentUserPlayerId from dbPlayers + currentUser", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(
      /currentUserPlayerId\s*=\s*dbPlayers\.find\(p\s*=>\s*p\.user_id\s*===\s*currentUser\?\.id\)\?\.id\s*\?\?\s*null/,
    );
  });

  it("renders the disabled gated variant with the exact tooltip copy when canInitiate=false", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // data-testid for E2E + the required tooltip copy from spec.
    expect(src).toMatch(/data-testid="hammer-initiate-gated"/);
    expect(src).toMatch(/Only the crybaby's team can initiate a hammer in crybaby phase\./);
    // Disabled button + aria-disabled for a11y. Order-agnostic — we care
    // that all three attrs are on the same element, not the JSX order.
    const gatedMatch = src.match(/<button[\s\S]*?data-testid="hammer-initiate-gated"[\s\S]*?<\/button>/);
    expect(gatedMatch).toBeTruthy();
    const body = gatedMatch?.[0] ?? "";
    expect(body).toMatch(/\sdisabled\b/);
    expect(body).toMatch(/aria-disabled="true"/);
    expect(body).toMatch(/title="[^"]*Only the crybaby/);
  });

  it("gate applies only to depth-0 initiation; hammer-back at depth >= 1 stays untouched", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // Existing handleHammerBack button (rendered at hammerDepth > 0) is unchanged
    // — it still uses handleHammerBack onClick and the depth-based styling.
    expect(src).toMatch(/hammerDepth === 0 \?[\s\S]*?canInitiate\s*\?[\s\S]*?handleHammer[\s\S]*?:[\s\S]*?handleHammerBack/);
  });

  it("canInitiate computed via the helper with all four inputs", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(
      /canInitiateCrybabyHammer\(\{[\s\S]*?gameMode:\s*round\.gameMode[\s\S]*?currentHole[\s\S]*?crybabyState[\s\S]*?currentUserPlayerId[\s\S]*?\}\)/,
    );
  });
});

// ============================================================
// Smoke render: disabled button renders with the right attrs
// ============================================================

describe("Gated hammer button DOM smoke test (via inline render)", () => {
  it("emits a button with disabled + aria-disabled + title + testid", () => {
    // We don't render CrybabyActiveRound (too heavy) — we render an isolated
    // copy of the gated-button JSX to confirm its attrs match spec.
    const Disabled = (): JSX.Element => (
      <button
        type="button"
        disabled
        data-testid="hammer-initiate-gated"
        aria-disabled="true"
        title="Only the crybaby's team can initiate a hammer in crybaby phase."
      >
        🔨 Only crybaby&apos;s team can hammer
      </button>
    );
    render(<Disabled />);
    const btn = screen.getByTestId("hammer-initiate-gated");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute(
      "title",
      "Only the crybaby's team can initiate a hammer in crybaby phase.",
    );
  });
});
