import { describe, it, expect } from "vitest";
import { GAME_FORMATS } from "@/lib/gameFormats";

// ============================================================
// C4A shape guards — Flip un-hide + 5-player lock + FlipReel
// extraction + TODOS.md update.
// ============================================================

describe("GAME_FORMATS — Flip un-hidden and locked to 5 players", () => {
  const flip = GAME_FORMATS.find(f => f.id === "flip")!;

  it("Flip entry exists with id='flip'", () => {
    expect(flip).toBeDefined();
  });

  it("is no longer hidden (visible in setup picker)", () => {
    expect(flip.hidden).toBeFalsy();
  });

  it("locks players to exactly 5 (min === max === 5)", () => {
    expect(flip.players.min).toBe(5);
    expect(flip.players.max).toBe(5);
  });

  it("retains crybaby + hammer + birdie_bonus + pops mechanics", () => {
    expect(flip.mechanics).toEqual(
      expect.arrayContaining(["hammer", "crybaby", "birdie_bonus", "pops"]),
    );
  });

  it("description reflects the per-hole re-flip + crybaby semantics", () => {
    expect(flip.description.toLowerCase()).toMatch(/per-hole|3v2|crybaby/);
  });
});

describe("FlipReel — extracted component shape", () => {
  it("lives at src/components/flip/FlipReel.tsx and exports a default component", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/flip/FlipReel.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/export default function FlipReel\(/);
  });

  it("accepts both 'initial' and 'per-hole' modes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/flip/FlipReel.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/mode\?:\s*"initial"\s*\|\s*"per-hole"/);
  });

  it("animates a 6-frame reshuffle matching the original FlipTeamModal cadence", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/flip/FlipReel.tsx"),
      "utf-8",
    );
    // 120ms setInterval, 6 frames — same as the legacy FlipTeamModal.
    expect(src).toMatch(/setInterval\([\s\S]*?,\s*120\)/);
    expect(src).toMatch(/count\s*>=\s*6/);
  });

  it("per-hole mode renders hole-specific copy when given a holeNumber", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/flip/FlipReel.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/Flip for hole/);
    expect(src).toMatch(/Lock hole [^"']+teams/);
  });

  it("is purely presentational — no DB / router imports", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/flip/FlipReel.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/from\s+["']@\/lib\/db["']/);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/useNavigate|useLocation|react-router-dom/);
  });
});

describe("TODOS.md — Flip struck from hidden list", () => {
  it("Flip line is struck through with a reference to PR #16", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../TODOS.md"),
      "utf-8",
    );
    // Match a strike-through Flip line in the Hidden list.
    expect(src).toMatch(/~~Flip~~.*PR #16/);
  });
});
