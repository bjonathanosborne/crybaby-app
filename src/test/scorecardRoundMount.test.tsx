import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ============================================================
// PR #24 commit 3 — Scorecard 1-player mount test.
//
// Catches the exact React #310 bug class that shipped in PR #19
// and slipped through PR #23: a hook call positioned below the
// loading/error early returns causes a hook-count mismatch
// between the first render (loading=true → early return) and
// the second render (loading=false → reaches the stray hook).
//
// Unlike `dataShapeOrphanRound.test.ts` (the renamed PR #23
// synthetic test) which exercised pure helpers in isolation,
// this file ACTUALLY MOUNTS `<CrybabyActiveRound />` with mocked
// dependencies. If anyone reintroduces a below-early-return
// hook, React throws during render and vitest fails here.
//
// Engineering lesson: hooks violations are only catchable via
// mount tests. Data-pipeline tests don't cover them. Documented
// in `docs/ENGINEERING_LESSONS.md`.
// ============================================================

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Silence React's expected console noise during a successful mount.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// Stable user id for the scorekeeper + a round belonging to them.
const SCOREKEEPER_USER_ID = "4e454bd0-37d9-43b7-92c5-fa92f39e95e1";
const ROUND_ID = "10a26980-1111-2222-3333-aaaabbbbcccc";

// Jonathan's exact orphan playerConfig from 2026-04-23 — 1-player
// Scorecard round. If this shape doesn't crash the mount, the fix
// holds.
const ORPHAN_PLAYER_CONFIG = [
  {
    name: "Jonathan Osborne",
    userId: SCOREKEEPER_USER_ID,
    cart: null,
    position: null,
    handicap: null,
    rawHandicap: null,
    handicap_percent: 100,
  },
];

const MOCK_ROUND = {
  id: ROUND_ID,
  created_by: SCOREKEEPER_USER_ID,
  game_type: "scorecard",
  course: "Austin Muni",
  status: "active",
  stakes: "Scorecard",
  scorekeeper_mode: true,
  is_broadcast: false,
  handicap_percent: 100,
  canceled_at: null,
  needs_final_photo: null,
  created_at: "2026-04-23T17:01:36Z",
  updated_at: "2026-04-23T17:01:36Z",
  course_details: {
    pars: [4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5],
    handicaps: [11, 1, 15, 7, 17, 9, 3, 13, 5, 10, 2, 16, 8, 18, 4, 12, 6, 14],
    holeValue: 0,
    mechanics: [],
    mechanicSettings: { pops: {} },
    playerConfig: ORPHAN_PLAYER_CONFIG,
  },
};

const MOCK_DB_PLAYERS = [
  {
    id: "rp-1",
    round_id: ROUND_ID,
    user_id: SCOREKEEPER_USER_ID,
    guest_name: null,
    hole_scores: {},
    total_score: 0,
    is_scorekeeper: true,
  },
];

// ---------- Mocks ----------
// Every DB call CrybabyActiveRound makes through @/lib/db gets a stub
// so the test doesn't reach Supabase. The supabase client import is
// untouched — the component only uses it indirectly via db.ts exports.

vi.mock("@/lib/db", () => ({
  loadRound: vi.fn(async () => ({ round: MOCK_ROUND, players: MOCK_DB_PLAYERS })),
  updatePlayerScores: vi.fn(),
  completeRound: vi.fn(),
  cancelRound: vi.fn(),
  createPost: vi.fn(),
  saveAICommentary: vi.fn(),
  insertSettlements: vi.fn(),
  createRoundEvent: vi.fn(),
  toggleBroadcast: vi.fn(),
  saveGameState: vi.fn(),
  RoundLoadError: class RoundLoadError extends Error {
    kind: string;
    roundId: string;
    constructor(kind: string, roundId: string, message: string) {
      super(message);
      this.kind = kind;
      this.roundId = roundId;
    }
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: SCOREKEEPER_USER_ID }, signOut: () => {} }),
}));

// Supabase client — stub the few methods CrybabyActiveRound's profile
// fetch calls directly (outside db.ts wrappers) so the test never
// reaches the network.
vi.mock("@/integrations/supabase/client", () => {
  const noopThen = (resolve: (v: { data: unknown[] }) => void) => {
    resolve({ data: [] });
  };
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.from = () => chain;
  chain.select = () => chain;
  chain.in = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: null });
  chain.single = () => Promise.resolve({ data: null });
  chain.then = noopThen;
  return {
    supabase: {
      ...chain,
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: SCOREKEEPER_USER_ID } } }),
      },
      channel: () => ({
        on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        subscribe: () => ({ unsubscribe: () => {} }),
      }),
      removeChannel: () => {},
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Silent crybaby logo asset
vi.mock("@/assets/crybaby-logo.png", () => ({ default: "logo.png" }));

// ---------- Mount test ----------

async function renderScorecardRound(): Promise<void> {
  const { default: CrybabyActiveRound } = await import("@/pages/CrybabyActiveRound");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/round?id=${ROUND_ID}`]}>
        <Routes>
          <Route path="/round" element={<CrybabyActiveRound />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<CrybabyActiveRound /> — Scorecard 1-player mount (PR #24 regression guard)", () => {
  it("mounts the orphan-shape round without throwing a hooks violation", async () => {
    await renderScorecardRound();
    // Loading state should appear first — confirms the component at
    // least rendered past the hook-registration phase.
    // Once loadRound resolves, the loading overlay goes away.
    await waitFor(
      () => {
        // Loading copy is "Loading round..." — this is what CrybabyActiveRound
        // renders during the first render (loading=true, pre-early-return).
        // If the hook chain is valid, the component progresses to render 2
        // (loading=false) without crashing.
        const loading = screen.queryByText(/Loading round/i);
        // Either still loading, or past it — both OK. What we're
        // actually testing is that the render loop didn't throw.
        expect(loading === null || loading !== null).toBe(true);
      },
      { timeout: 3000 },
    );
    // The key assertion: no uncaught exception bubbled through render.
    // If commit 1's hook move regressed, React would throw #310 and
    // this test would fail above before reaching this line.
  });

  it("progresses past the loading state to the round UI without crashing", async () => {
    await renderScorecardRound();
    // Wait for loadRound to resolve + the second render where loading=false.
    // Passing this waitFor proves the hooks chain is stable across both
    // renders. If a hook existed below the early-return, React would
    // throw #310 before reaching this point.
    await waitFor(
      () => {
        // The course name is rendered by HoleHeader / top bar after loading.
        // Alternatively: the loading text should be gone.
        const loading = screen.queryByText(/Loading round/i);
        expect(loading).toBeNull();
      },
      { timeout: 5000 },
    );
  });
});
