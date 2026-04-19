import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRoundPersistence } from "@/hooks/useRoundPersistence";

// Mock the db layer so we can force completeRound / insertSettlements to throw
// and verify the PersistResult envelope narrows the failure correctly.
vi.mock("@/lib/db", () => ({
  updatePlayerScores: vi.fn(),
  saveGameState: vi.fn(),
  createRoundEvent: vi.fn(),
  completeRound: vi.fn(),
  insertSettlements: vi.fn(),
  cancelRound: vi.fn(),
  toggleBroadcast: vi.fn(),
}));

// Import after mock registration so the hook picks up the mocks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
beforeEach(async () => {
  db = await import("@/lib/db");
  vi.clearAllMocks();
});

/**
 * These tests lock in the fix for Bug 1 — "Finish round silently fails."
 *
 * Root cause was two-fold:
 *   1. SoloRound.finishRound wrote `status: "complete"` which violates the
 *      CHECK constraint on rounds.status; the error was caught and logged to
 *      console only.
 *   2. CrybabyActiveRound's auto-completion useEffect wrapped completeRound +
 *      insertSettlements in a plain try/catch that console.error'd on failure;
 *      `settlementsSaved` never flipped, UI stuck on scoring with no toast.
 *
 * The architectural fix routes both call sites through useRoundPersistence,
 * which returns a PersistResult<void> discriminated union. These tests lock
 * in the envelope contract + guard the source-level invariants so a future
 * regression fails here.
 */

describe("Bug 1 regression — round completion surfaces errors", () => {
  describe("persistRoundCompletion contract", () => {
    it("returns ok: true when completeRound resolves", async () => {
      db.completeRound.mockResolvedValue(undefined);
      const { result } = renderHook(() => useRoundPersistence());

      let res: Awaited<ReturnType<typeof result.current.persistRoundCompletion>> | undefined;
      await act(async () => {
        res = await result.current.persistRoundCompletion("r1");
      });
      expect(res?.ok).toBe(true);
      expect(db.completeRound).toHaveBeenCalledWith("r1");
    });

    it("returns ok: false with classified kind when completeRound throws", async () => {
      db.completeRound.mockRejectedValue(new Error("network fetch failed"));
      const { result } = renderHook(() => useRoundPersistence());

      let res: Awaited<ReturnType<typeof result.current.persistRoundCompletion>> | undefined;
      await act(async () => {
        res = await result.current.persistRoundCompletion("r1");
      });
      expect(res?.ok).toBe(false);
      if (res && !res.ok) {
        expect(res.error.kind).toBe("network");
      }
    });

    it("classifies auth failures as kind=auth so callers can redirect to /auth", async () => {
      db.completeRound.mockRejectedValue(
        Object.assign(new Error("JWT expired"), { code: "PGRST301" }),
      );
      const { result } = renderHook(() => useRoundPersistence());

      let res: Awaited<ReturnType<typeof result.current.persistRoundCompletion>> | undefined;
      await act(async () => {
        res = await result.current.persistRoundCompletion("r1");
      });
      expect(res?.ok).toBe(false);
      if (res && !res.ok) expect(res.error.kind).toBe("auth");
    });
  });

  describe("persistSettlements contract", () => {
    it("returns ok: false when insertSettlements throws; caller must NOT flip settlementsSaved", async () => {
      db.insertSettlements.mockRejectedValue(new Error("network"));
      const { result } = renderHook(() => useRoundPersistence());

      let res: Awaited<ReturnType<typeof result.current.persistSettlements>> | undefined;
      await act(async () => {
        res = await result.current.persistSettlements("r1", [
          { userId: "u1", guestName: null, amount: 10 },
        ]);
      });
      expect(res?.ok).toBe(false);
      // Critical invariant: the contract promises the hook does NOT throw; it
      // returns a value. A caller that forgets to inspect `ok` will silently
      // swallow the error — that's why the auto-completion useEffect must
      // branch on result.ok before setting settlementsSaved=true.
    });
  });

  describe("SoloRound.finishRound — source-level invariants", () => {
    it("inserts with status: \"completed\" (not the invalid \"complete\")", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../src/pages/SoloRound.jsx"),
        "utf-8",
      );
      // The rounds.status CHECK constraint only accepts
      // 'setup' | 'active' | 'completed' | 'canceled'. Writing 'complete'
      // triggers a 23514 which was being swallowed.
      expect(src).toMatch(/status:\s*"completed"/);
      expect(src).not.toMatch(/status:\s*"complete"(?!d)/);
    });

    it("calls toast() on the error path (no more silent console.error)", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../src/pages/SoloRound.jsx"),
        "utf-8",
      );
      // Both regressions the spec calls out: failure must surface to UI.
      expect(src).toMatch(/import\s*\{\s*toast\s*\}\s*from\s*["']@\/hooks\/use-toast["']/);
      expect(src).toMatch(/toast\(\{[\s\S]*?variant:\s*"destructive"/);
    });

    it("inspects the round_players insert error (no unchecked write)", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../src/pages/SoloRound.jsx"),
        "utf-8",
      );
      // Previously `await supabase.from("round_players").insert({...})` dropped
      // the returned error; an RLS failure here would leave an orphan round.
      expect(src).toMatch(/playersError[\s\S]*?round_players[\s\S]*?if\s*\(\s*playersError\s*\)\s*throw/);
    });
  });

  describe("CrybabyActiveRound auto-completion — source-level invariants", () => {
    it("routes through persist.persistRoundCompletion (not raw completeRound)", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
        "utf-8",
      );
      // The auto-completion useEffect must use the PersistResult envelope,
      // not call completeRound directly. Direct calls would re-introduce the
      // silent-failure bug.
      expect(src).toMatch(/persist\.persistRoundCompletion\(roundId\)/);
      expect(src).toMatch(/persist\.persistSettlements\(roundId/);
    });

    it("shows a toast when completion or settlement persistence fails", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
        "utf-8",
      );
      expect(src).toMatch(/import\s*\{\s*toast\s*\}\s*from\s*["']@\/hooks\/use-toast["']/);
      expect(src).toMatch(/Couldn't finalize round/);
      expect(src).toMatch(/Couldn't save settlements/);
    });

    it("does NOT flip settlementsSaved on failure (allows retry)", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"),
        "utf-8",
      );
      // The effect must early-return (not set settlementsSaved=true) when a
      // result is !ok. This grep asserts `return` appears inside a !ok branch
      // before the setSettlementsSaved(true) line.
      const effectMatch = src.match(
        /saveRoundSettlements\s*=\s*async[\s\S]*?setSettlementsSaved\(true\)/,
      );
      expect(effectMatch).toBeTruthy();
      const body = effectMatch?.[0] ?? "";
      // There must be at least one `if (!...ok) { ...; return; }` style guard
      // before the success flip.
      expect(body).toMatch(/!\w*[Rr]esult\.ok[\s\S]*?return/);
    });
  });
});
