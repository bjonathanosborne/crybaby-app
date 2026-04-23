# TODOS — crybaby-app

Last updated: 2026-04-22 (PR #23 post-DOC-bug fixes shipped; D4-A atomic round creation parked below)
Branch: main

---

## Deferred: atomic round creation (D4-A)

**Problem.** `createRound` in `src/lib/db.ts:80-200` runs two sequential Supabase queries (rounds insert → round_players insert) with no transaction. If anything between step 1 and the successful client-side mount of `/round?id=X` crashes — including React render errors like the 2026-04-22 #310 — the `rounds` row is already committed at `status='active'`, which trips the "one active round" UI gate in `loadActiveRound()` and blocks new round creation.

**Tactical fix SHIPPED** in PR #23 commit 1 (`baa4f67` D4-B): `StuckRoundBanner` on the feed offers a self-service Abandon affordance so users can recover without DB-side intervention. Detects `status='active'` rounds that are past a 10-minute grace window AND have `course_details.game_state.currentHole === null` (never advanced past setup).

**Strategic fix (this TODO) — atomic creation.** Prevent orphans from being created in the first place:

1. Use the existing-but-unused `status = 'setup'` state (the `rounds_status_check` CHECK already allows it) as the create-landing state.
2. Create a Postgres function `start_round(p_course_details jsonb, p_player_configs jsonb[], …)` that runs both inserts inside a transaction. Rollback on any failure leaves zero rows.
3. Client calls the RPC via `supabase.rpc('start_round', { … })` instead of two separate `supabase.from(…)` inserts.
4. Round row stays at `status='setup'` until the client successfully mounts `CrybabyActiveRound` AND saves its first `game_state`. An edge-function or a subsequent `supabase.rpc('activate_round', { round_id })` call flips to `active`.
5. Server-side sweeper: any `status='setup'` round older than 30 minutes gets auto-canceled. Prevents orphans from the "user closed the tab mid-setup" case.

**Estimated scope:** medium, ~2 days. Touches:
- New migration: `CREATE FUNCTION start_round(…) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER` + RLS policy updates allowing `status='setup'` reads for the creator
- `createRound` in `src/lib/db.ts` rewritten to call the RPC
- CrybabyActiveRound mount-success handler that calls `activate_round`
- Scheduled Edge Function or pg_cron job for the 30-min sweep
- Regression: D4-B stays wired as a belt-and-suspenders fallback

**Schedule after:** on-course testing of PR #23 confirms the three commits ship cleanly without new orphan cases. If Jonathan reports zero orphans across a handful of rounds, D4-A becomes a nice-to-have polish item rather than a critical path.

**Related** drive-by findings from the PR #20 recon that REMAIN unaddressed:
- D-F#2: Solo rounds have no `playerConfig` → no net-score leaderboard (low priority; Solo is hidden as of PR #21)
- D-F#3: Solo rounds emit no per-hole `round_events` → don't contribute to scoring-distribution pie's birdie/eagle slices (same low priority; architectural consequence of Solo skipping the per-hole runtime)

---

## Dedupe AUSTIN_COURSES — two sources of truth

`AUSTIN_COURSES` is defined in TWO places:
1. `src/data/constants.js` — imported by `CourseSearch.tsx` (Solo mode course
   picker).
2. `src/pages/CrybabySetupWizard.jsx` (inline, starting around line 30) —
   used by the DOC setup wizard's course picker.

The two copies drifted: Westlake had Blue/White tees + old handicaps in
constants.js, and Black/Gold/Silver/Violet + new handicaps in the wizard.
Discovered 2026-04-19 during on-course testing (user saw Blue/White in
Solo). Constants has since been synced to the wizard's version, but the
underlying smell remains.

**Fix:** delete the inline list in the wizard, import from constants.
Also consider moving course data to a DB table so the app stops shipping
a hardcoded list entirely — but that's a larger lift. Smaller first move
is the import change. Estimated: 30 min.

---

## Testing phase: single-game surface

For on-course validation of the capture pipeline, the setup wizard
shows only DOC and Solo. DOC exercises teams, hammer, crybaby phase,
birdie bonus, and carry-over — validating it validates the
architecture.

**Hidden from setup; legacy rounds still load and replay:**
- Nassau
- ~~Skins~~ — un-hidden 2026-04-21 via PR #17 commit 3. Engine already production-ready (recon found `calculateSkinsResult` complete — ties carry, N×pot math correct, pops scaling via `getStrokesOnHole`). Commit added 19 direct unit tests to fill the engine-boundary coverage gap.
- ~~Flip~~ — un-hidden 2026-04-20 via PR #16 with full per-hole re-flip + crybaby sub-game + Model C accounting. See `supabase/functions/_shared/gameEngines.ts` Flip section.
- Custom
- Wolf (separately deferred; needs partner-pick capture)

Mechanism: `hidden: true` flag on the entry in
`src/lib/gameFormats.ts`. The setup wizard filters `!hidden` before
rendering. Everything downstream (engine, apply-capture, replayRound,
round-load, RoundLiveFeed) remains untouched so rounds created before
the flip still work.

**Un-hide order after DOC validates on-course:**
1. ~~Nassau + Skins — simpler money math, no team logic. Low risk.~~ Skins shipped 2026-04-21, PR #17 commit 3 (flag flip + 19-test engine coverage). Nassau still pending; engine is implemented but NOT yet validated with dedicated unit tests — recommend doing the same recon + un-hide-with-tests pattern before flipping its flag.
2. ~~Flip — DOC variant with random teams; low marginal risk once DOC works.~~ — Done 2026-04-20, PR #16. Flip ended up being a much bigger build than "DOC variant": per-hole reshuffle, rolling-window carry-over with forfeit accounting, separate crybaby sub-game on holes 16-18.
3. Custom — freeform, least-tested path.
4. Wolf — needs partner-pick capture work (see section below).

Each un-hide is a single-flag flip + a brief on-course test + ship.
<1 day each.

---

## Deferred: Skins UI polish (post-on-course validation)

PR #17 commit 3 un-hid Skins with ZERO UI changes — the engine, wizard,
runtime, settlement, and round detail all work via the generic
individual-format path. But a real Skins round would benefit from:

- **Running skins count per player** — live UI showing how many skins
  each player has taken so far (tied skins count as 0 for both
  players, they carry). Currently only the dollar balance is visible.
- **Carry-over indicator before scoring** — "$10 carry from hole 3"
  banner on the current hole pre-score, so players know the stakes
  before they swing. The post-resolution `quip` ("Tied! $X carries to
  the next hole.") surfaces this after the fact but not up front.
- **Per-hole Skins winners in round detail** — scorecard view could
  show which player took each skin (or "carry" for ties). Currently
  the detail view renders only the final settlement + hole scores.

Deferred intentionally: do the UI work AFTER Jonathan plays a real
Skins round and surfaces what he actually wants to see. Building the
polish blind risks shipping what a designer thinks a Skins player
needs rather than what the actual player needs.

Estimated effort when ready: ~1-2 days.

---

## Deferred: Wolf mode

### Wolf mode — hidden from setup; legacy rounds still supported

- Wolf requires per-hole partner selection (or lone-wolf declaration)
  BEFORE scores are known. Like hammers, partner picks can't be derived
  from scores — the round's money math is wrong without them captured.
- Wolf was first hidden in phase 2.5a; currently hidden alongside
  Nassau/Skins/Custom during the DOC-focused testing surface (Flip
  shipped 2026-04-20 via PR #16; see section above).
- When re-enabling: extend the sequenced-prompt pattern from Phase 2.5's
  hammer flow — after scores, ask "Who was the wolf?" and "Partner or
  lone wolf?" per hole. The `HammerPromptFlow` component is a template.
- Existing Wolf rounds still load and replay via the legacy code paths
  in `gameEngines.ts` (calculateWolfHoleResult, getWolfForHole).
- Estimated effort: 3–5 days once we validate the hammer prompt pattern
  in real use.

---

## Phase 2 deferrals

### Automated RLS tests — TODO
The round_captures RLS policies have a **manual** verification script at
`supabase/tests/round_captures_rls.sql` (see README inside). There is no
automated RLS test harness in the project yet. To automate: either wire
a GitHub Actions job that spins up `supabase start`, runs the SQL script,
and checks `NOTICE` / row-count output; or adopt `pgTAP` alongside the
existing Vitest unit tests. Low priority while the project has a single
scorekeeper per round, but needed before multi-scorekeeper rounds.

---

## P1 — Must do before scale / Good Good launch

### [CRITICAL] Add Bug 2 regression test for getDOCTeams() Others phase
**What:** After fixing Bug 2 (switching `players.find()` to `players.filter()` in the Others
phase of `getDOCTeams()`), add a Vitest test confirming all 5 players appear in exactly
one team on holes 6–10, and that money totals sum to zero.
**Why:** Without a regression test, this bug will recur. The fix is 3 lines in a pure
function — the test is the only guarantee it stays fixed. Test infrastructure (`vitest`,
`src/test/`) already exists.
**Effort:** S (human: ~30min / CC+gstack: ~10min)
**Where:** `src/test/gameEngines.test.ts` (new), `src/lib/gameEngines.ts`

### [CRITICAL] Add loadRound() timeout + error state
**What:** `loadRound()` on mount has no timeout. A 30-second Supabase hang leaves the
loading spinner up forever with no way out. Add a 10-second timeout; on failure,
show an error state with a "Retry" button.
**Why:** On a golf course with dead zones, the initial round load can hang. The user
currently has no recovery path. This is worse than no app.
**Effort:** S (human: ~20min / CC+gstack: ~5min)
**Where:** `src/pages/CrybabyActiveRound.jsx` — the `loadRound()` useEffect

### [CRITICAL] Unify updatePlayerScores() error handling with saveGameState()
**What:** `updatePlayerScores()` in `CrybabyActiveRound.jsx` is fire-and-forget with
`.catch()` swallowed. After this sprint, `saveGameState()` will have explicit error
handling. The inconsistency means player scores can fail silently while game state
errors are surfaced. Both paths should handle failures the same way.
**Why:** Silent score write failure = wrong money in Supabase even though local state
is correct. User sees correct app UI but Supabase has wrong data.
**Effort:** S (human: ~30min / CC+gstack: ~10min)
**Where:** `src/pages/CrybabyActiveRound.jsx` — advanceHole(), the updatePlayerScores call

### [CRITICAL] Fix or verify Nassau settlement math
**What:** `calculateNassauSettlement()` in `gameEngines.ts` returns 0 and is never
called. Nassau is a live game mode. This sprint includes fixing/deleting this function.
If it's deleted and Nassau settlement is handled inline in CrybabyActiveRound.jsx,
verify the inline logic is correct. Either way: run a Nassau round in the validation
protocol and confirm correct settlement totals.
**Why:** "Wrong money = wrong product" — this is the stated core principle.
**Effort:** S (human: ~1hr / CC+gstack: ~20min)
**Where:** `src/lib/gameEngines.ts`, `calculateNassauSettlement()`

### Add loading state for round resume on mount
**What:** When `loadGameState()` runs on mount (takes ~100-500ms on a golf course),
the UI flashes the hole-1 starting state before jumping to the resumed hole. Add a
"Resuming your round..." overlay or shimmer during the async load.
**Why:** Without this, a user who killed the app at hole 12 and reopens it will see
the hole-1 state for a split second before the correct state loads. Disorienting.
**Effort:** S (human: ~30min / CC+gstack: ~15min)
**Where:** `src/pages/CrybabyActiveRound.jsx` — mount/init section

### Check round status before restoring game state
**What:** On mount, before calling `restoreFromSavedState()`, verify the round's
`status` field is `in_progress` (not `completed` or `cancelled`). A completed round
with a non-null `game_state` should not be restored.
**Why:** If a user navigates back to a completed round, they should see the final
settlement, not a mid-round state restore.
**Effort:** S (human: ~15min / CC+gstack: ~5min)
**Where:** `src/pages/CrybabyActiveRound.jsx` — mount restore logic

### Log saveGameState/loadGameState failures with context
**What:** Add console.error() calls with roundId and hole number when these functions
fail. Currently they fail silently or with generic errors.
**Why:** When a user reports "my state didn't save at hole 14," you need to know
that from a log. Without it you're guessing.
**Effort:** S (human: ~15min / CC+gstack: ~5min)
**Where:** `src/pages/CrybabyActiveRound.jsx` + `src/lib/db.ts`

---

## P2 — Do before App Store public launch (post TestFlight validation)

### Settlement share card
**What:** Render the settlement screen as a shareable image/card — clean layout with
winner's name, amount, game mode. "I just won $47 in DOC" as an Instagram/Twitter post.
Web Share API is already wired in the "Send Reminders" button (use that flow).
**Why:** Free organic marketing. The settlement card going viral is part of the brand play.
Per the CEO review vision: "the app that makes you a crybaby golfer."
**Effort:** S-M (human: ~2hr / CC+gstack: ~45min)
**Where:** `src/pages/CrybabyActiveRound.jsx` — settlement/completion screen section

### Spectate "Watch live" chip on Feed
**What:** If a friend has an active round, show a "Watch live" chip on their feed entry.
One tap navigates to `RoundSpectateView` (`src/pages/RoundSpectateView.jsx`).
Edge case: handle round ending while spectator is watching (show "Round complete" + navigate back).
**Why:** Good Good demo UX — producer in cart should be able to pull up the live round
in 2 taps. Also valuable for general friends watching each other's rounds.
**Effort:** S-M (human: ~2hr / CC+gstack: ~1hr)
**Where:** `src/pages/CrybabyFeed.jsx`, `src/pages/RoundSpectateView.jsx`

### CI/CD: GitHub Actions build check
**What:** Basic GitHub Actions workflow: build check + Capacitor lint on every push.
Currently direct push to main with no gate.
**Why:** Design doc mentioned this as a pre-App Store item. Low risk for solo dev now
but before wider distribution, a broken build should be caught automatically.
**Effort:** S (human: ~1hr / CC+gstack: ~20min)
**Where:** `.github/workflows/` (new)

### Friend-filtered feed
**What:** `loadFeed()` in `CrybabyFeed.jsx` loads ALL posts. Add a filter to only
show posts from friends (users the current user follows).
**Why:** Privacy concern at scale. For small user base this is fine. For wider
distribution, strangers' posts appearing is unexpected and potentially off-putting.
**Effort:** S-M (human: ~1hr / CC+gstack: ~30min)
**Where:** `src/pages/CrybabyFeed.jsx`, `src/lib/db.ts`

---

## P2 — Phase 3 features (post-App Store public launch)

### Season W/L leagues
**What:** Show season standings between friends — total P&L over a configurable time
period (month/season/all-time). "You're up $340 against Mike this season."
The round and settlement data is already in Supabase. Mostly a query + display problem.
**Why:** Turns the app from a round tracker into a relationship tracker. High stickiness,
hard to leave. The 49yo plays 40+ rounds/year with the same 4 guys — he wants the season arc.
**Effort:** L (human: ~1 week / CC+gstack: ~3-4hr)
**Where:** New `src/pages/LeaguePage.tsx` + new queries in `src/lib/db.ts`
**Depends on:** App Store launch, some user base established first

### Full offline write queue
**What:** Multi-write queue with flush ordering — stores all failed Supabase writes
locally, replays them in order when connectivity is restored.
**Why:** Golf courses have dead zones. The scoped version (single-write retry) handles
the common case. Full queue for heavy dead-zone scenarios.
**Effort:** M-L (human: ~3 days / CC+gstack: ~3hr)
**Blocked by:** Validate that single-write retry is insufficient for real course use.
Don't build the full queue until users report it's needed.

### Client-side error tracking (Supabase Edge Function)
**What:** Pipe error boundary + DB failure events to a Supabase Edge Function that
stores them in an `app_errors` table. Query: "how many saveGameState failures in
the last week, by hole and game mode?"
**Why:** Currently no visibility into production failures. After App Store launch,
you need more than "user reported the app did something weird."
**Effort:** M (human: ~1 day / CC+gstack: ~1hr)

---

## P3 — Architectural debt (tackle before the codebase scales)

### Decompose CrybabyActiveRound.jsx monolith
**What:** The main active round file is 2100+ lines and contains all game logic,
all UI, and all state. Every sprint lands another 50-100 lines here. Split into:
- `src/hooks/useRoundState.ts` (~400 lines) — round loading, currentHole, totals, holeResults,
  carryOver, advanceHole() state mutations, init effects, cancel, settlement auto-save
- `src/hooks/useRoundPersistence.ts` (~120 lines) — saveGameState(), loadGameState(),
  online/offline event listeners, lastSaveFailed, single-write retry on reconnect,
  error logging with roundId + hole context
- `src/hooks/useRoundGameModes.ts` (~350 lines) — calculateHoleResult() dispatch,
  buildWolfTeams(), handleHammer/fold/back/accept, handleNassauPress(), nassauState,
  wolfState, flipTeams, crybabConfig, all game-mode event handlers
- `src/pages/CrybabyActiveRound.jsx` (UI rendering only, ~550 lines) — consumes
  all three hooks, renders JSX only, declares no game logic
**Why:** Every major bug so far has come from this file. It will keep breaking. The
monolith makes it impossible to test game logic in isolation. With the hooks-based
architecture, useRoundGameModes.ts can be unit tested in jsdom with no React render.
**Effort:** XL (human: ~1 week / CC+gstack: ~4-6hr)
**When:** After App Store launch is stable. Don't do this during an active sprint.
**Architecture diagram:** See `/plan-eng-review` output in `~/.gstack/` for full
dependency graph and concrete extraction table.

### Add unit tests for gameEngines.ts
**What:** `src/lib/gameEngines.ts` is pure functions with no side effects — perfectly
testable. Add Vitest tests covering all game modes, all edge cases (nil teams, empty
players, 3/4/5/6-player games, carries-over, press counts).
**Why:** Currently the test suite is "run a round and see if it looks right." These
functions calculate money — they need regression tests so fixes don't reintroduce bugs.
**Effort:** M (human: ~2 days / CC+gstack: ~1hr)
