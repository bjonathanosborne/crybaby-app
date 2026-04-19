import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRoundPersistence } from "@/hooks/useRoundPersistence";

// Mock the db layer so we can force setNeedsFinalPhoto to throw and verify
// the PersistResult envelope classification.
vi.mock("@/lib/db", () => ({
  updatePlayerScores: vi.fn(),
  saveGameState: vi.fn(),
  createRoundEvent: vi.fn(),
  completeRound: vi.fn(),
  insertSettlements: vi.fn(),
  cancelRound: vi.fn(),
  setNeedsFinalPhoto: vi.fn(),
  toggleBroadcast: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
beforeEach(async () => {
  db = await import("@/lib/db");
  vi.clearAllMocks();
});

/**
 * Bug 2: pre-completion final-photo gate.
 *
 * Invariants locked in here:
 *   - persistNeedsFinalPhoto writes true when user skips, false when cleared.
 *   - The auto-completion useEffect in CrybabyActiveRound does NOT run when
 *     finalPhotoDecision === "pending" (source-level guard).
 *   - FinalPhotoGate renders only for the scorekeeper when hole 18 is done
 *     and no other capture flow is open.
 *   - The migration exists and adds the column as NOT NULL DEFAULT false.
 */

describe("Bug 2 — final-photo gate persistence", () => {
  it("persistNeedsFinalPhoto(roundId, true) resolves ok on success", async () => {
    db.setNeedsFinalPhoto.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRoundPersistence());

    let res: Awaited<ReturnType<typeof result.current.persistNeedsFinalPhoto>> | undefined;
    await act(async () => {
      res = await result.current.persistNeedsFinalPhoto("r1", true);
    });
    expect(res?.ok).toBe(true);
    expect(db.setNeedsFinalPhoto).toHaveBeenCalledWith("r1", true);
  });

  it("persistNeedsFinalPhoto returns classified error on failure (never throws)", async () => {
    db.setNeedsFinalPhoto.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useRoundPersistence());

    let res: Awaited<ReturnType<typeof result.current.persistNeedsFinalPhoto>> | undefined;
    await act(async () => {
      res = await result.current.persistNeedsFinalPhoto("r1", true);
    });
    expect(res?.ok).toBe(false);
    if (res && !res.ok) expect(res.error.kind).toBe("network");
  });

  it("can be called with false to clear the flag (post-capture path)", async () => {
    db.setNeedsFinalPhoto.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRoundPersistence());

    await act(async () => {
      await result.current.persistNeedsFinalPhoto("r1", false);
    });
    expect(db.setNeedsFinalPhoto).toHaveBeenCalledWith("r1", false);
  });
});

describe("Bug 2 — db helper contract", () => {
  it("setNeedsFinalPhoto is exported and passes through to supabase", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db.ts"),
      "utf-8",
    );
    // Function must exist and update only the needs_final_photo column.
    expect(src).toMatch(/export async function setNeedsFinalPhoto\(roundId, value\)/);
    expect(src).toMatch(/update\(\{\s*needs_final_photo:\s*!!value\s*\}\)/);
    // Must throw on error — same pattern as the other rounds-table writers.
    expect(src).toMatch(/setNeedsFinalPhoto[\s\S]*?if\s*\(\s*error\s*\)\s*throw/);
  });
});

describe("Bug 2 — migration shape", () => {
  it("creates needs_final_photo as NOT NULL DEFAULT false", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../supabase/migrations/20260419020000_needs_final_photo.sql",
      ),
      "utf-8",
    );
    expect(src).toMatch(/ADD COLUMN IF NOT EXISTS needs_final_photo BOOLEAN NOT NULL DEFAULT false/);
    // The comment is useful for future maintainers — lock it in.
    expect(src).toMatch(/COMMENT ON COLUMN public\.rounds\.needs_final_photo/);
  });

  it("is typed in supabase types as a boolean on Row/Insert/Update", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/integrations/supabase/types.ts"),
      "utf-8",
    );
    // Row: boolean (required in the returned row)
    expect(src).toMatch(/rounds:[\s\S]*?Row:[\s\S]*?needs_final_photo:\s*boolean/);
    // Insert / Update: boolean optional (DEFAULT false) — both must be typed.
    expect(src).toMatch(/rounds:[\s\S]*?Insert:[\s\S]*?needs_final_photo\?:\s*boolean/);
    expect(src).toMatch(/rounds:[\s\S]*?Update:[\s\S]*?needs_final_photo\?:\s*boolean/);
  });
});

describe("Bug 2 — CrybabyActiveRound gate wiring", () => {
  it("blocks the auto-completion useEffect while gate decision is pending", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // The effect body must early-return when decision is still "pending".
    expect(src).toMatch(
      /if\s*\(\s*finalPhotoDecision\s*===\s*"pending"\s*\)\s*return/,
    );
  });

  it("renders the FinalPhotoGate only for the scorekeeper on hole 18 with no capture open", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // The <FinalPhotoGate open={...}> expression must gate on all four:
    // scorekeeper + no active capture + hole 18 scored + decision pending.
    const gateMatch = src.match(/<FinalPhotoGate[\s\S]*?\/>/);
    expect(gateMatch).toBeTruthy();
    const gate = gateMatch?.[0] ?? "";
    expect(gate).toMatch(/isScorekeeper/);
    expect(gate).toMatch(/!capture\.isOpen/);
    expect(gate).toMatch(/currentHole\s*>=\s*18/);
    expect(gate).toMatch(/holeResults\.length\s*>=\s*18/);
    expect(gate).toMatch(/finalPhotoDecision\s*===\s*"pending"/);
  });

  it("Skip handler routes through persistNeedsFinalPhoto (not a raw update)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/persist\.persistNeedsFinalPhoto\(roundId,\s*true\)/);
    // And must toast on failure (not a silent console-only catch).
    expect(src).toMatch(/Couldn't save your choice/);
  });

  it("Take Photo handler launches ad-hoc capture and marks the ref", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
      "utf-8",
    );
    // The ref must be set BEFORE openAdHoc so onApplied can detect the
    // gate origin. And onApplied must check the ref to flip decision.
    expect(src).toMatch(
      /handleTakeFinalPhoto[\s\S]*?gateCaptureInFlightRef\.current\s*=\s*true[\s\S]*?capture\.openAdHoc\(\)/,
    );
    expect(src).toMatch(
      /gateCaptureInFlightRef\.current[\s\S]*?setFinalPhotoDecision\("captured"\)/,
    );
  });
});
