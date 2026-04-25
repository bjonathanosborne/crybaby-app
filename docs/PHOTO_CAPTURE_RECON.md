# Photo-Capture Scoring Feature — Codebase Recon

> **PR #27 (2026-04-24): Photo capture removed from gameplay UI.**
> The mid-round CapturePrompt banner + CaptureButton FAB, the
> post-completion FinalPhotoGate, the "Fix scores / add photo" CTA,
> and both CaptureFlow render-sites in CrybabyActiveRound are all
> gone. Edge functions (apply-capture, extract-scores), the
> round_captures table, the scorecards storage bucket, and the
> component files in `src/components/capture/` remain — legacy
> captures keep displaying via CaptureTile + CaptureAppliedCard, and
> the feature can be resurrected later.
>
> This document is preserved as the canonical reference for the
> shape of the original feature. If you're looking for the current
> state, search `PR #27` in the codebase — every dead-code shim
> carries a marker comment pointing back here.

**Date:** 2026-04-18
**Branch:** `main` (HEAD: `f3dd37d`)
**Mode:** Read-only reconnaissance
**Author:** Claude (synthesized from full codebase sweep + targeted verifications)

The feature: the scorekeeper photographs the physical scorecard, vision AI extracts scores, a confirmation UI allows manual override, the app recomputes money, and every capture — prompted or ad-hoc — publishes to the social feed. Two capture modes (game-driven cadence + always-available ad-hoc) share one pipeline.

This document maps what exists today and proposes how the new feature should land in it. It does **not** propose edits — implementation comes after your review.

---

## 1. Stack and architecture summary

### Frameworks and core libraries
| Layer | Version / choice |
|---|---|
| React | 18.3.1 |
| Build | Vite 5.4.19 with `@vitejs/plugin-react-swc` (dev port **8080**, not 5173) |
| Language | TypeScript 5.8.3 — but `CrybabyActiveRound.jsx` and several pages are `.jsx` (mixed TS/JS) |
| Styling | Tailwind 3.4.17 + shadcn/ui (Radix primitives) |
| Routing | React Router 6.30.1 (`BrowserRouter` in `src/App.tsx`) |
| Data | `@supabase/supabase-js` 2.95.3 |
| Server state | `@tanstack/react-query` 5.83.0 — **lightly used**; most fetches are raw `.then()` on the supabase client |
| Forms / validation | `react-hook-form` 7.61.1 + `zod` 3.25.76 |
| Native shell | Capacitor 8.1 (`@capacitor/core`, `/ios/`, `/android/`) |
| Tests | Vitest 3.2.4 + jsdom — `src/test/gameEngines.test.ts` only |

### State management
| Concern | Pattern | Location |
|---|---|---|
| Auth | React Context | `src/contexts/AuthContext.tsx` |
| Active round | 20+ `useState` hooks in one component | `src/pages/CrybabyActiveRound.jsx` (2211 lines) |
| Feed / posts | `useState` + Supabase Realtime subscription | `src/pages/CrybabyFeed.jsx` |
| Server cache | TanStack Query (present but under-used) | scattered |

No Redux, Zustand, or XState. No canonical store. Round state is duplicated — React `useState` owns the in-memory truth; `rounds.course_details.game_state` (JSONB) owns the persisted snapshot; `round_players.hole_scores` (JSONB array) owns the per-hole record. The three can drift.

### Routing (from `src/App.tsx`)
26 routes. All app routes wrap in `ProtectedRoute` → `ProfileGate` → `AppLayout`. Notable shape:
- `/round?id=<roundId>` — main scoring UI
- `/solo` — no-betting personal scorecard
- `/setup` — round creation wizard
- `/feed` — social feed
- `/watch?roundId=<id>` — live spectator
- `/admin/*` — role-gated admin panels

### AI / realtime / native infra
- **AI:** Two edge functions exist:
  - `supabase/functions/analyze-scorecard/index.ts` — **uses Anthropic Claude Opus 4.5 vision** for course-scorecard OCR (see §4.3). Auth-gated. System prompt returns strict JSON.
  - `supabase/functions/ai-commentary/index.ts` — uses the Lovable AI gateway (`google/gemini-3-flash-preview`), not Anthropic directly. Generates sarcastic caddie quips.
- **Realtime:** Supabase Realtime is the only push channel. Publication adds: `round_players, ai_commentary, comments, reactions, posts, round_events, round_event_reactions, round_followers`. No WebSockets outside Supabase. No SSE. One `setInterval` exists (30s `saveGameState` in the active-round component).
- **Native:** Capacitor is installed but **no Camera plugin, no Filesystem plugin, no Geolocation plugin**. The only real native capability wired is push notifications via `public/sw.js` + `push_subscriptions` table. Camera access today happens via browser `<input type="file" accept="image/*">` — which works on iOS Safari/PWA but falls back to photo-library picker, not a direct camera shutter.

---

## 2. Game logic inventory

### Where it lives
One file: `src/lib/gameEngines.ts` (642 lines). **Pure functions. No React imports. No side effects.** This is the single biggest architectural strength we can lean on — the entire money math could run in an Edge Function unchanged.

Callers: `src/pages/CrybabyActiveRound.jsx` (main) and `src/pages/RoundEditScores.tsx` (post-round replay). No dispatch table or strategy pattern — internal branching uses `switch` on `gameMode`.

### Exported surface
| Function | Purpose |
|---|---|
| `getStrokesOnHole` | Net-score handicap pop lookup |
| `supportsTeams / supportsHammer / supportsCrybaby` | Capability flags per game |
| `getPhaseLabel / getPhaseDisplayLabel / getPhaseColor` | Phase UI helpers (Drivers / Others / Carts / Crybaby / Front / Back / …) |
| `getTeamsForHole` | Team assignment per hole per mode (DOC / Flip / Wolf) |
| `generateFlipTeams` | Coin-flip team shuffle (`Math.random()` — non-deterministic) |
| `calculateSkinsResult` | Individual skins per hole |
| `initNassauState / calculateNassauHoleResult` | Nassau match state + per-hole update |
| `initWolfState / getWolfForHole / calculateWolfHoleResult` | Wolf rotation + hole calc |
| `calculateTeamHoleResult` | DOC / Flip team match play with hammer + carry-over |
| `calculateFoldResult` | Hammer-accepted fold settlement |
| `isRoundComplete` | "Round is done" predicate |
| `replayRound` | **Recalculate entire round from a list of inputs** (used by post-round edit) |

### Per-game: rules, state, photo cadence
For each mode, I inferred the **minimum photo cadence** required so money math stays correct. You'll want to validate these against your rule preferences:

| Mode | Inputs | Money events | First-class events? | Min photo cadence |
|---|---|---|---|---|
| **DOC** (`drivers_others_carts`) | 4–5 players with `{cart, position}`, 18 holes, hammer/crybaby/birdie/pops/carry-over flags | Hole win, hammer accept/fold, birdie doubling, crybaby skins (holes 16–18), carry-over pot | **No.** State is derived by replaying `calculateTeamHoleResult` over scores; `holeResults[]` array in memory holds `{push, winnerName, amount, carryOver, playerResults[], quip}`. Hammer state lives in a separate `hammerHistory` array. | **After every hole.** Carry-over, hammer-depth, and crybaby eligibility all require hole-by-hole history. Gaps corrupt money. |
| **Skins** | 2–6 players, optional net scoring | Single hole winner or push → pot carries | No | **After every hole.** Carry-over pot grows hole-by-hole. |
| **Nassau** | 2–4 players, 3 segments (F9 / B9 / overall), optional presses | Per-hole match point, segment settlement, press sub-matches | Partial — `nassauState` tracks `{frontMatch, backMatch, overallMatch, presses[]}`. Presses are objects with segment + hole started. | **Turn (9) and finish (18) only for plain Nassau.** Presses change the answer mid-segment — if presses are allowed, photo cadence jumps to every hole. |
| **Wolf** | 4 players (3–5 possible), rotation order | Wolf/partners vs others, 2× if lone wolf, rotation advances | Partial — `wolfState` tracks `{wolfOrder, currentWolfIndex, partnerSelected, isLoneWolf}`. Partner pick is in-app modal, not derived from scorecard. | **After every hole.** Wolf rotation depends on prior hole order; partner pick is per-hole and must be captured before scoring. |
| **Flip** | 4–5 players, `Math.random()` teams | Same as DOC | No | **After every hole** (same as DOC). |
| **Just Me** (solo) | 1 player | None | N/A | N/A — no money. |
| **Custom** | 2–N players | Whatever the group agrees | No | **Assume every hole** unless user explicitly opts into lighter cadence. |

**Cross-cutting mechanics that force cadence:**
- **Hammer** enabled → every hole (hammer offer resets per hole).
- **Crybaby** phase (holes 16–18 in DOC/Flip) → holes 15, 16, 17, 18 at minimum (must know who's most behind entering hole 16).
- **Birdie bonus** → every hole (multiplier triggered by gross birdie on that hole).
- **Carry-over** → every hole (pot persists until a winner).
- **Presses** in Nassau → every hole (press timing is a score-dependent decision).

**Honest take:** for realistic group play, "after every hole" is the safe default for all money-carrying modes. The plain-Nassau "turn + 18" case is a real but narrow exception. I'd design the cadence API to support both but default to per-hole.

### Coupling to React
Zero. `gameEngines.ts` imports nothing from React or from app code other than type definitions. Every function is deterministic (except `generateFlipTeams`, which uses `Math.random`). **This file is edge-function-ready as-is** — see §7 for how to lean on that.

The only React-coupled logic is in `CrybabyActiveRound.jsx`'s `advanceHole()` handler and the hammer/wolf/crybaby modals. Those marshal state into/out of the pure functions.

---

## 3. Data model

Migrations live in `supabase/migrations/` — 25 migrations, dating 2026-02-17 through 2026-04-15.

### Core round tables (quoted from initial migration `20260217062941_*`)

```sql
CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL DEFAULT 'stroke',
  course TEXT NOT NULL DEFAULT '',
  course_details JSONB DEFAULT '{}',     -- <-- the swiss army JSONB
  stakes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup','active','completed','canceled')),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  scorekeeper_mode BOOLEAN NOT NULL DEFAULT false,
  is_broadcast BOOLEAN NOT NULL DEFAULT false,   -- added in 20260219033950
  canceled_at TIMESTAMPTZ,                        -- added in 20260409100000
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name TEXT,
  hole_scores JSONB DEFAULT '[]',        -- per-hole scores as JSONB array
  total_score INTEGER,
  is_scorekeeper BOOLEAN DEFAULT false,
  UNIQUE (round_id, user_id)
);
```

### Supporting tables
- `round_settlements` — one row per player per round, final P&L (manual_adjustment flag lets players tweak after the fact).
- `round_events` — hole-by-hole play-by-play, event types `score | birdie | eagle | bogey | double_bogey | triple_plus | hammer | push | team_win`. `event_data` JSONB is free-form. **Added to realtime publication.** This is where the live feed draws from today.
- `round_event_reactions` — emoji reactions on events. Realtime-enabled.
- `round_followers` — who's spectating a broadcast round. Realtime-enabled.
- `courses` — not a normalized table; courses live inside `rounds.course_details.courseId` + `user_courses` (user-submitted).

### Per-hole score storage — the truth
`round_players.hole_scores` is a JSONB **object keyed by hole number**, not an array, despite the `DEFAULT '[]'`. Actual shape written by `src/lib/db.ts:176` (`updatePlayerScores`):

```json
{ "1": 4, "2": 5, "3": 3, ... }
```

On resume, `CrybabyActiveRound.jsx:1006-1047` reconstructs per-hole scores from this object and builds dummy `holeResults` entries `{ hole: h, push: false, resumed: true }`. This is fragile — the dummy entries don't carry money amounts, they just mark "hole was played." If a photo capture recomputes money for hole 10 after a correction, we need a better replay story than dummies.

### Game config storage
All in `rounds.course_details` JSONB. Shape (inferred from `createRound` in `src/lib/db.ts:75-150`):

```json
{
  "courseId": "...",
  "pars": [4,4,3,...18],
  "handicaps": [1,2,3,...18],
  "tees": [{ "name": "Blue", "slope": 135, "rating": 72.1, "yardage": 7100 }],
  "holeValue": 2,
  "mechanics": ["hammer", "crybaby", "birdie_bonus", "pops"],
  "mechanicSettings": {
    "hammerInitiator": "any",
    "hammerMaxDepth": "1",
    "crybabHammerRule": "allowed",
    "birdieMultiplier": 2,
    "handicapPercent": 100,
    "carryOverCap": "unlimited",
    "presses": false
  },
  "privacy": "public",
  "playerConfig": [{"name":"…","handicap":10,"cart":"A","position":"driver","userId":"…"}],
  "game_state": { "currentHole": 7, "carryOver": 4, "totals": {...}, "hammerHistory": [...] }
}
```

One JSONB holds: course data, game mechanics config, player roster, AND the mid-round save. No separation. There's no dedicated `game_config` or `round_snapshot` concept — `saveGameState` (db.ts:887-901) just merges into `course_details.game_state` and overwrites.

### Round lifecycle
1. **Create** — `CrybabySetupWizard.jsx` → `createRound()` (db.ts:75) → INSERT `rounds` (status=`active`) + INSERT `round_players` (hole_scores=`{}`).
2. **Active** — `/round?id=…` → `CrybabyActiveRound.jsx` mounts → `loadRound` + `loadGameState`. Each hole: `advanceHole()` (line 1412) calls `updatePlayerScores` (db.ts:176) + `saveGameState` (db.ts:887) + `createRoundEvent` (db.ts:1059) + `supabase.functions.invoke('ai-commentary')`. All fire-and-forget.
3. **Complete** — hole 18 triggers `completeRound` (db.ts:186) → UPDATE `rounds` status=`completed` + INSERT `round_settlements` + create a `round_summary` post.
4. **Post-round edit** — `/edit-scores` uses pure `replayRound()` to recompute + `deleteRoundSettlements` + `insertSettlements` to rewrite. **This is the closest existing pattern to what photo captures need to do mid-round.**

### What's missing for the new feature
- No `captures` or `round_snapshots` table (snapshots are merged JSONB).
- No storage bucket for scorecard photos (only `avatars`).
- No feed event type that carries a money-state delta.
- No concept of "this hole's state is confirmed vs. provisional."

---

## 4. Current scoring UI

### 4.1 The scoring monolith — `src/pages/CrybabyActiveRound.jsx` (2211 lines)
State is ~20 `useState` hooks at the top. All 10 `useEffect` hooks sit at lines 596, 884, 898, 919, 926, 1006, 1052, 1062, 1069, 1096 — all before the early returns at 1111 (this was the React #310 fix from commit `747ef77`, don't move them).

Key handlers:
- `handleScoreChange(playerId, score)` (line 1209) — updates in-memory `scores` state for `currentHole`.
- `advanceHole()` (line 1412-1539) — the critical path:
  - Line 1449: `updatePlayerScores(p.id, playerHoleScores, newTotals[p.id])` per player (fire-and-forget).
  - Line 1457: `saveGameState(roundId, { currentHole, carryOver, totals, hammerHistory })`.
  - Line 1535: `setCurrentHole(currentHole + 1)`.
  - Also calls `createRoundEvent` per player per hole for the live feed.
- Modal handlers: `handleNassauPress` (1563), wolf modal (918-923, 1069), hammer flow (scattered), crybaby setup (around 1320).

Manual score entry today happens via a `<input type="number">` per player on the current hole. No photo upload path touches this component.

### 4.2 Full create → settle flow
| Step | Route | File | Key call |
|---|---|---|---|
| Create | `/setup` | `CrybabySetupWizard.jsx` (1493 lines) | `createRound()` |
| Load | `/round?id=…` | `CrybabyActiveRound.jsx` (mount) | `loadRound()` + `loadGameState()` |
| Enter scores | — | same file | `handleScoreChange`, `advanceHole` |
| Hammer / wolf / crybaby | — | same file | modals, inline handlers |
| Complete | — | same file (auto-triggered) | `completeRound()` + `insertSettlements()` |
| Post-round edit | `/edit-scores` | `RoundEditScores.tsx` (525 lines) | `replayRound()` + rewrite settlements |

### 4.3 Existing image / photo handling (critical for recon)
**Exactly one image flow exists that's relevant: `src/components/AddClubModal.tsx` (519 lines).** This modal lets a user upload a photo of a course scorecard (not their played scores — the blank card for the course). Flow:

```
<input type="file" accept="image/*" />
  → FileReader.readAsDataURL → base64 string
  → supabase.functions.invoke("analyze-scorecard", { body: { image, mimeType } })
  → Anthropic Claude Opus 4.5 vision (supabase/functions/analyze-scorecard/index.ts:79-110)
  → strict JSON out: { name, city, state, holes, pars[], handicaps[], tees[] }
  → confirm step with editable fields
  → save to user_courses
```

**This is the exact pattern the new feature needs.** The edge function is 148 lines, already:
- Auth-gated (Bearer token → `supabase.auth.getUser`).
- Uses `ANTHROPIC_API_KEY` from Deno env — key already provisioned.
- Uses `claude-opus-4-5` with `type: "image"` + base64 source.
- Has a retry-on-parse-failure story (strips markdown code fences, falls back to manual entry).
- Returns 422 with raw text if JSON parse fails — UI can show the raw OCR for manual correction.

Other image endpoints:
- `uploadUserAvatar` (db.ts:404) + `uploadGroupAvatar` (db.ts:627) — both upload to the `avatars` Supabase Storage bucket (public, `users/{user_id}/…` or `groups/{group_id}/…`).
- No photo/video elsewhere. No Capacitor Camera plugin installed.

**What's not there:** any use of `capture="environment"` on file inputs (would hint iOS Safari to default to camera). Any file upload to a non-avatar bucket. Any video or burst capture.

---

## 5. Social / feed / leaderboard layer

This section matters most for ad-hoc captures as the "heartbeat" of a live round.

### 5.1 Feed — `src/pages/CrybabyFeed.jsx` (659 lines)
Renders four content sources in a single list:
1. **Active round banner** (sticky top) — if the current user has a round in `active` status.
2. **Broadcast rounds** — friends' `rounds` where `is_broadcast=true`, rendered as live cards pulling recent `round_events`.
3. **Posts** — `posts` table, joined to `profiles` for author info, with `comments` + `reactions` counts.
4. **Notifications** — served on the `/inbox` route, not the feed.

Realtime subscription (single channel, multiple filters):
```typescript
supabase.channel("feed-updates")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, refreshFeed)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, refreshFeed)
  .on("postgres_changes", { event: "*",      schema: "public", table: "reactions" }, refreshFeed)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "round_events" }, refreshBroadcasts)
  .on("postgres_changes", { event: "*",      schema: "public", table: "round_followers" }, refreshBroadcasts)
  .subscribe();
```

**This is good news for us:** there's already a realtime channel that reacts to `round_events` inserts. A new event type emitted per capture would surface in the feed with near-zero infra work.

**Caveat:** `refreshBroadcasts` and `refreshFeed` both do a full re-query on any event. At small scale this is fine. At scale (10 concurrent rounds × N captures per minute) you'll want payload-diffed updates, not re-fetches. **Defer unless validated.**

### 5.2 Round live feed component — `src/components/RoundLiveFeed.tsx` (262 lines)
Opens as a modal over the active round or the spectate view. Subscribes to `round-feed-${roundId}` channel on `round_events` INSERT and `round_event_reactions` `*`. Full re-query on any change. This is the component a capture event would render into — the "heartbeat" UI.

### 5.3 Leaderboards
**There are none.** `/stats` shows personal stats via the `get_user_stats()` Postgres function. No round leaderboard during play, no group standings, no per-course history. TODOS.md lists season W/L leagues as a P3 item.

This is worth noting because the product brief wants "leaderboards reflect the update in near real-time" — but there's no leaderboard surface to update. Either (a) we add a live hole-by-hole standings view inside `RoundLiveFeed` / `RoundSpectateView`, or (b) we ship captures first and leaderboards as a follow-on. I'd recommend (a) — see §7.

### 5.4 Following / friends / notifications
- `friendships` — bilateral, pending → accepted. `user_id_a / user_id_b`.
- `round_followers` — per-round follow (spectator model, independent of friendship).
- `notifications` — per-user inbox, populated by triggers on friendships/group_members, and by `notifyFriendsOfBroadcast` (db.ts:1118). `push_subscriptions` backs Web Push.
- `/inbox` is poll-based — I saw no realtime subscription on `notifications`. Low-priority but worth fixing eventually.

### 5.5 What tables publish to realtime today
From migrations: `round_players, ai_commentary, comments, reactions, posts, round_events, round_event_reactions, round_followers`. `notifications` is **not** in the realtime publication. If we push feed events via `round_events`, we inherit realtime for free. If we invent a new `captures` table, we need to add it.

---

## 6. Gaps and risks for the new feature

### 6.1 Architectural decisions that will bite us

1. **The CrybabyActiveRound monolith** (2211 lines). Adding photo capture + confirmation UI + game-cadence prompts + ad-hoc button + feed publish inside this file will push it past 2800. TODOS.md P3 already calls out the decomposition into `useRoundState / useRoundPersistence / useRoundGameModes` hooks. **My strong recommendation: do that refactor first** — then photo capture lands into clean hooks. Doing it in the wrong order means tangling capture logic into state that's about to move anyway.

2. **Scores stored two ways.** `round_players.hole_scores` (JSONB object `{"1":4}`) vs. in-memory `scores` + `holeResults[]` vs. persisted `rounds.course_details.game_state`. A capture that writes to one without updating the others corrupts replay. We need a single write path.

3. **No first-class event log.** `round_events` is a narrative table for the feed, not a replayable source of truth. `holeResults[]` in memory is replayable but lost on refresh. For photo captures — where each capture IS an event — we want an append-only log we can replay. See §7 for the `round_captures` table proposal.

4. **The post-round edit flow already does what we need mid-round.** `RoundEditScores.tsx` calls pure `replayRound()` → `deleteRoundSettlements` → `insertSettlements`. The hard part (recompute from a new score set + atomically rewrite settlement) is already solved. We should generalize it and call it from the capture confirm handler.

### 6.2 Refactors to do before building

| Refactor | Size | Why before |
|---|---|---|
| Decompose `CrybabyActiveRound.jsx` into `useRoundState` / `useRoundPersistence` / `useRoundGameModes` | XL (TODOS P3) | Capture integrates cleanly into hooks; integrating into the monolith traps us |
| Canonicalize `hole_scores` shape (array vs. object-keyed JSONB) | S | The dummy `{ hole, push: false, resumed: true }` hack suggests the replay story is brittle |
| Extract `replayRound` + settlement rewrite into a single `recomputeRound(roundId, newScores)` API | M | The capture confirm UI needs this exact verb |
| Resolve the Nassau settlement math (TODOS P1 CRITICAL) | S | If plain-Nassau is the "turn + 18 cadence" poster child, its math must be verified before we rely on sparse photo cadence |
| Add loadRound timeout + error state (TODOS P1 CRITICAL) | S | Captures happen on bad-reception courses; every round-load hang is a capture outage |

### 6.3 Schema changes needed
- **Storage bucket:** `scorecards` (private, RLS-scoped to round participants + followers).
- **`round_captures` table (new):** append-only log of every capture. Fields:
  ```
  id, round_id, captured_by (user), captured_at,
  trigger ('game_driven' | 'ad_hoc' | 'post_round_correction'),
  photo_path (storage key),
  raw_extraction (JSONB — vision AI output),
  confirmed_extraction (JSONB — after user edits),
  confidence (numeric 0-1, per-cell if we capture it),
  hole_range_start, hole_range_end (smallint[2]),
  applied_at (null until confirmed + applied),
  superseded_by (FK to next capture for same hole range),
  feed_published_at (timestamptz null)
  ```
  Indexes: `(round_id, captured_at)`, `(round_id, applied_at)`.
- **`round_events.event_type` extension:** add `capture_published` as an allowed event type (the check constraint is `TEXT` default — we use a narrative not enum, so no migration needed beyond updating the client's switch).
- **`rounds.capture_cadence` column (optional):** JSONB describing the game's required cadence (`{ "type": "every_hole" }` vs. `{ "type": "holes", "holes": [9, 18] }`). Alternative: derive from `game_type + mechanics` at call time. I lean "derive" — one source of truth.

### 6.4 Realtime performance concerns
Current pattern: any event → full re-query of the feed or the round event list. Fine at 1–10 rounds. At 100+ concurrent rounds with per-hole captures and reactions, the backend will fan out a lot.

Mitigations (not urgent, but design-aware):
- **Debounce capture fan-out:** when the same scorekeeper submits 3 captures in 30 seconds, publish only the latest to the feed (the others write to `round_captures` but don't emit `round_events`).
- **Patch-based updates:** instead of re-querying, the client applies the realtime payload directly. This is a general architecture improvement worth more than the capture feature.
- **Photo uploads don't block math:** decouple "applied to game state" from "uploaded to storage." The vision extraction should accept an in-memory base64 without requiring the upload to finish first. Upload in the background for the permanent record.

### 6.5 Relevant items from `TODOS.md` / `CLAUDE.md`
- P1 CRITICAL: **Nassau settlement math** (`calculateNassauSettlement` returns 0, dead code). If Nassau is the headline case for sparse cadence, this blocks feature correctness.
- P1 CRITICAL: `loadRound()` timeout + error state. A round-load hang on course = capture outage.
- P1: saveGameState/loadGameState error logging. Captures will hit the same network. Observability matters.
- P3: **Monolith decomposition.** See §6.2.
- P3: gameEngines.ts unit tests. Photo captures increase the blast radius of a math bug — the test suite needs to exist before we ship captures, not after.

Nothing in `TODOS.md` conflicts with the new feature. The existing P1/P3 items are the right ones to clear first.

---

## 7. Proposed architecture (recommendation)

### 7.1 High-level shape

```
┌─────────────────────────────────────────────────────────┐
│  UI (React)                                             │
│                                                         │
│  CrybabyActiveRound                                     │
│  ├─ CaptureButton     (ad-hoc; always visible)          │
│  └─ CapturePrompt     (game-driven; modal, blocking)    │
│                                                         │
│  Both open → CaptureFlow modal:                         │
│    1. Shutter         (<input capture="environment">)   │
│    2. Analyzing       (calls extract-scores edge fn)    │
│    3. Confirm grid    (editable per-cell with override) │
│    4. Apply           (calls recomputeRound via RPC)    │
└─────────────────────────────────────────────────────────┘
              │                            │
              ▼                            ▼
┌──────────────────────────┐    ┌────────────────────────┐
│  Edge Function           │    │  Edge Function         │
│  extract-scores          │    │  apply-capture         │
│  Anthropic Claude Vision │    │  Pure replayRound() +  │
│  In: base64 + round ctx  │    │  settlement rewrite +  │
│  Out: {hole:score} map + │    │  round_events emit +   │
│       per-cell confidence│    │  capture row insert    │
└──────────────────────────┘    └────────────────────────┘
              │                            │
              └─────────┬──────────────────┘
                        ▼
        ┌────────────────────────────────────┐
        │  Supabase Postgres                 │
        │                                    │
        │  round_captures  (append-only)     │
        │  round_players.hole_scores  (upd)  │
        │  rounds.course_details  (upd)      │
        │  round_settlements      (rewrite)  │
        │  round_events           (insert)   │
        │                                    │
        │  scorecards bucket (photo file)    │
        └────────────────────────────────────┘
                        │
                        ▼ Supabase Realtime
        ┌────────────────────────────────────┐
        │  CrybabyFeed / RoundLiveFeed       │
        │  (realtime refresh on INSERT into  │
        │   round_events)                    │
        └────────────────────────────────────┘
```

### 7.2 Where code lives

```
src/
  hooks/                      ← NEW (from the P3 decomposition)
    useRoundState.ts
    useRoundPersistence.ts
    useRoundGameModes.ts
    useCaptureCadence.ts      ← NEW: derives required-capture-holes from gameMode + mechanics
    useCapture.ts             ← NEW: opens CaptureFlow modal, uploads, applies
  components/
    capture/                  ← NEW directory for capture UI
      CaptureFlow.tsx         ← modal container (shutter → analyze → confirm → apply)
      CaptureShutter.tsx      ← file input + camera affordance
      CaptureConfirmGrid.tsx  ← editable hole × player grid with confidence highlights
      CaptureButton.tsx       ← always-visible ad-hoc trigger
      CapturePrompt.tsx       ← game-driven prompt (blocking banner, not modal)
  lib/
    recompute.ts              ← NEW: thin wrapper over replayRound + settlement rewrite
  pages/
    CrybabyActiveRound.jsx    ← consumes useRoundState + useCapture; no capture logic inline
supabase/
  functions/
    extract-scores/           ← NEW: vision extraction
    apply-capture/            ← NEW: server-side recompute + emit (or keep client-side)
  migrations/
    20260419000000_scorecards_bucket.sql
    20260419000100_round_captures.sql
```

### 7.3 Game-config declaration of capture cadence

Rather than a new DB column, derive cadence at runtime from `gameMode + mechanics` — one source of truth, no migration, easy to change as rules evolve:

```ts
// src/lib/captureCadence.ts
export type CaptureCadence =
  | { type: 'every_hole' }
  | { type: 'holes'; holes: number[] }   // e.g. [9, 18]

export function requiredCadence(round: RoundData): CaptureCadence {
  const mech = round.course_details.mechanics || []
  const hasHammer = mech.includes('hammer')
  const hasCrybaby = mech.includes('crybaby')
  const hasCarryOver = mech.includes('carry_over') || round.gameType === 'skins'
  const hasPresses = mech.includes('presses')

  if (round.gameType === 'solo') return { type: 'holes', holes: [] }

  if (round.gameType === 'nassau' && !hasPresses) {
    return { type: 'holes', holes: [9, 18] }
  }

  // Everything else (DOC, Flip, Wolf, Skins, Nassau+presses, Custom)
  return { type: 'every_hole' }
}
```

Ad-hoc captures are always available — they don't consult this function. It only drives the prompts/blocks.

### 7.4 Vision extraction edge function

New function: `supabase/functions/extract-scores/index.ts`. Mirror the structure of `analyze-scorecard/index.ts` — auth, CORS, base64 body, Claude Opus 4.5 vision, strict JSON out. Key differences:

- **Input:** `{ image, mimeType, roundContext }` where `roundContext` is `{ holes: 1..18, players: [{id, name, position}], pars: [...], lastKnownScores: {...} }`. Giving Claude the expected player names and hole numbers dramatically cuts the error rate.
- **Output schema:**
  ```json
  {
    "scores": { "player-id-1": { "1": 4, "2": 5, ... }, ... },
    "cellConfidence": { "player-id-1": { "1": 0.95, "2": 0.72, ... } },
    "unreadable": [{ "player_id": "...", "hole": 12 }],
    "notes": "Hole 14 cell is smudged, best guess is 5"
  }
  ```
- **Failure modes:** 422 on parse failure (UI shows the raw text + empty grid); 429/402/500 pass through like `analyze-scorecard`.
- **Secret:** reuses existing `ANTHROPIC_API_KEY` Supabase secret.

### 7.5 Confirmation + manual override

Two capture modes use the **same CaptureFlow component**. The only differences:
- **Game-driven:** rendered by `CapturePrompt` as a blocking banner "Photo required to continue" with a primary CTA. Cannot advance the hole until resolved.
- **Ad-hoc:** rendered by `CaptureButton` as an always-visible chip/FAB. Fully dismissible. Never blocks.

`CaptureConfirmGrid.tsx` shows a hole × player table with:
- Per-cell editable number input (Android numeric keypad / iOS numeric keypad).
- Low-confidence cells (`< 0.7`) highlighted with a yellow underline.
- Unreadable cells rendered as empty with a red underline — must fill before Apply.
- Override at three levels: individual cell, inferred decision (e.g. "hammer accepted on 12" — yes/no toggle), final money (a "Manual money override" override that writes straight to settlements).

### 7.6 Publishing to the feed

Option A (recommended): **reuse `round_events`** with new event types.
- New types: `capture_started`, `capture_applied`, `capture_money_shift`.
- `event_data` holds `{ capture_id, delta: { player_id → amount_change }, running_totals: {...}, strokes_over_par: {...} }`.
- Realtime subscription in `CrybabyFeed.jsx:feed-updates` already listens to `round_events` INSERT — **zero realtime infra to add**.
- `RoundLiveFeed` modal gets a new renderer for the capture event type.

Option B: separate `feed_events` table. More normalized but duplicates realtime pipeline. Skip.

### 7.7 Throttling

Ad-hoc captures can be spammed. Rules:
- **DB-level:** keep `round_captures` append-only; every tap writes a row. This is the audit log.
- **Feed-level:** debounce `round_events.capture_applied` emits to **one every 30 seconds per round per capturer** (server-side, in `apply-capture` edge function). Suppressed captures still update `round_captures` + the round state; they just don't fan out to the feed.
- **UI-level:** rate-limit the CaptureButton to one capture in flight at a time (disable while pending).

### 7.8 Scope estimate

**Phase 1 — foundations (pre-capture refactor) ~3-5 days human / ~1 day CC**
- [ ] P1 CRITICAL items from TODOS.md (Nassau math verify, loadRound timeout, score-write error unification).
- [ ] `CrybabyActiveRound.jsx` decomposition into 3 hooks (P3, but required for sanity).

**Phase 2 — capture pipeline MVP ~1-2 weeks human / ~2-3 days CC**
- [ ] `@capacitor/camera` install + iOS/Android permissions wiring.
- [ ] `scorecards` bucket migration + RLS.
- [ ] `round_captures` table migration + RLS.
- [ ] `extract-scores` edge function.
- [ ] `CaptureFlow` component family (shutter → analyzing → confirm → apply).
- [ ] `useCaptureCadence` + `useCapture` hooks.
- [ ] Wire into active-round UI: ad-hoc button + game-driven prompt.
- [ ] `recomputeRound` helper (generalize post-round edit flow).

**Phase 3 — social + feed integration ~3-5 days human / ~1 day CC**
- [ ] New `round_events` types (`capture_started`, `capture_applied`, `capture_money_shift`).
- [ ] Live standings panel in `RoundLiveFeed` / `RoundSpectateView` (current strokes over/under par per player, current money per active game).
- [ ] Throttling in `apply-capture` (debounce feed emits).
- [ ] Feed tile design for capture events (photo thumbnail + delta highlights).

**Phase 4 — polish + safety ~3-5 days human / ~1 day CC**
- [ ] Dispute resolution UI (two captures conflict → show both, force human arbitration).
- [ ] Vitest tests for `recomputeRound`, `requiredCadence`, `extract-scores` fixture-based.
- [ ] Per-cell confidence UI refinement.
- [ ] Offline queue for captures (if cell reception is spotty — likely worth it).

**Total honest range:** 4–6 weeks for a well-tested feature; 2–3 weeks for a rough cut you'd want to QA hard before trusting with real money. Phase 1 is non-negotiable unless we accept known-wrong Nassau settlement and a monolith that will resist surgery.

---

## 8. Open questions for you

Answer these before implementation. They shape the schema and the UI.

**Capture authorization**
1. **Who can capture?** Only the designated scorekeeper (`round_players.is_scorekeeper = true`)? Any round participant? Followers (spectators)? My recommendation: participants by default, scorekeeper-only if `scorekeeper_mode` is on.
2. **Can a spectator capture?** Probably no — but what if the group hands a follower the card at the turn? Edge case but real.

**Dispute resolution**
3. **Two captures conflict.** Player A captures scores for hole 8 saying `{Bob: 5}`. Player B captures 90 seconds later saying `{Bob: 4}`. What happens?
   - Option a: Latest wins, previous marked `superseded_by`.
   - Option b: Both are recorded; an arbitration UI prompts all participants to pick one.
   - Option c: Only scorekeeper's capture applies; others are observational.
   My default if you don't answer: (a) + a visible "Capture was superseded by X" badge in the feed.

**Privacy defaults**
4. **Does an ad-hoc capture always post to the feed?** Three levels worth considering:
   - All captures broadcast to everyone who can currently see the round (followers + broadcast friends).
   - Only game-driven captures broadcast; ad-hoc are private to the foursome unless user taps "share."
   - All captures private; a separate "Share this update" button promotes one to the feed.
   My default: **game-driven broadcast automatically; ad-hoc requires opt-in via a "Share" toggle on the confirm step.** Respects the "foursome banter" vs. "social broadcast" distinction without a third surface.
5. **Private rounds** (`rounds.course_details.privacy === 'private'`): never publish captures to the feed, always store them. Confirm?

**Throttling**
6. **If the scorekeeper snaps 5 photos in 2 minutes,** do all 5 appear in the feed, or only the latest? My default: all 5 write to `round_captures`; only one `round_events.capture_applied` emits per 30-second window per round per capturer.

**Correctness vs. speed**
7. **If extraction confidence is low (`< 0.6` on any cell),** should the app block applying until the user acknowledges each low-confidence cell, or just flag them? Default: flag but not block.
8. **What happens if the extract-scores function fails entirely?** Fall back to the manual-entry UI (same path as today). Default: yes, always.

**Data retention**
9. **How long do we keep the scorecard photos?** 90 days? Forever? Deleted on round cancel? This has privacy implications and storage cost implications. Default: 365 days, purged via a scheduled function; users can delete their own captures anytime.
10. **Does a post-round edit invalidate or replace prior captures?** I'd say post-round edits write a new `round_captures` row with `trigger='post_round_correction'` so the history is preserved.

**Cadence edge cases**
11. **Does Nassau with presses enabled count as "every hole"?** Yes per my §2 analysis. Confirm that matches your intuition — presses are allowed mid-segment, and the decision whether to press depends on current match state, which requires fresh scores.
12. **Custom game mode:** does it default to every-hole cadence, or does the user declare cadence at setup? Default: every hole. User can toggle "Skip prompts" if they want.

**Operational**
13. **Who owns the Anthropic API spend?** `analyze-scorecard` is already live, so this is incremental — but photo captures at 18 holes × 4-player rounds × many rounds/day will dwarf the course-add cost. Worth a rough cost model before launch.
14. **App Store submission** is pending. Does this feature go in the first submission, or do we ship without it and add in v1.1? My lean: **ship without, add in v1.1.** The photo feature is a headline addition that deserves its own release cycle + screenshots.

---

## Appendix: honest notes on messiness

- **`.jsx` vs. `.tsx` mixing.** The core scoring files (`CrybabyActiveRound.jsx`, `CrybabyFeed.jsx`, `CrybabySetupWizard.jsx`, `CrybabOnboarding.jsx`) are untyped. New hooks should land as `.ts` / `.tsx` to start the migration.
- **Fire-and-forget DB writes.** `updatePlayerScores`, `saveGameState`, `createRoundEvent` all do `.catch(() => {})` or similar. Captures should not. A capture that partially fails (photo uploaded, money applied, feed not published) must be recoverable.
- **RLS policy recursion.** Early migrations battled infinite-recursion policies; the fix was a sweep moving everything to `SECURITY DEFINER` helper functions. Any new table (e.g. `round_captures`) should follow that pattern from day one.
- **No test coverage to speak of.** `src/test/gameEngines.test.ts` is the only meaningful test file. Captures increase the blast radius of any math bug — unit tests for `requiredCadence`, `recomputeRound`, and `extract-scores` response parsing are non-negotiable.
- **README.md is a Lovable placeholder** with `REPLACE_WITH_PROJECT_ID` tokens. `CLAUDE.md` is the real project doc. Minor issue but worth flagging.

---

**Report status: ready.** No code written. Awaiting your direction on §8 open questions and phase sequencing.

---

## Phase 1 addendum — 2026-04-18 (branch `phase-1-foundations`)

Phase 1 foundations landed as three commits on `phase-1-foundations`. Net:
45 tests passing (up from 10), clean vite build, component monolith split
into three hooks with a pure compute seam Phase 2 can call.

### What shipped

**1a — Nassau settlement math** (commit `2070eab`)
- `calculateNassauSettlement(players, teams, state, segmentValue, completedHoles)`
  implemented correctly: front 9, back 9, overall each pay `segmentValue`
  independently. Ties push. Presses settle within their segment and compound.
  Abandoned rounds don't settle unsettled bets (front requires 9 holes,
  back/overall require 18).
- `calculateNassauHoleResult` no longer charges per-hole (Nassau is match
  play, not skins). Winners reported via new optional `HoleResult.winnerIds`
  field. `winnerName` + `quip` still populated for narrative UI.
- `replayRound` for Nassau reconstructs match state from winnerIds and
  returns `nassauSettlement` as an extra field. Note: press history is not
  carried through replay (out of scope for post-round score edits).
- Fixed two pre-existing Nassau state bugs: `.find()` only credited the
  first winning team member (team play undercount); presses accumulated
  wins past their segment end (front press stays front-only).
- `CrybabyActiveRound` Nassau totals now come from provisional segment
  settlement at every hole advance, not per-hole amount sum.
- Tests: 17 added covering clean wins, ties, presses, back-9 comebacks,
  abandoned rounds, and handicap pop flip-effects.

**1b — loadRound timeout + typed errors** (commit `fec9ed7`)
- New `src/lib/roundErrors.ts` exports `RoundLoadError` + classifier with
  discriminated kind `"timeout" | "not_found" | "unauthorized" | "network"`.
  Separate file so unit tests don't pull the Supabase client's noisy
  module-init into jsdom.
- `loadRound` and `loadGameState` now wrap their Supabase calls in an
  `AbortController` with 10-second timeout (`.abortSignal()`). Failures
  throw typed `RoundLoadError`. "not_found" replaces the old `null` return.
- `CrybabyActiveRound` error UI dispatches on `error.kind` with distinct
  copy + primary CTA per path. Retry button re-runs the load effect via
  a `retryNonce` state (no full page reload).
- `RoundEditScores` updated to the new throw semantics.
- Tests: 9 added covering error shape, instance checks, classifier
  mapping (PGRST301, 401, AbortError, unknown shapes, string/null throws).

**1c — Monolith decomposition** (commit `bc9f8a5`)
- Three new hooks in `src/hooks/`:
  - `useRoundState.ts` — owns round state and exposes `computeAdvanceHole`
    as a PURE function. No React, no side effects. This is the seam
    Phase 2's `apply-capture` edge function will import.
  - `useRoundPersistence.ts` — wraps every DB write in a promise-returning
    method with structured error logging. Owns online/offline state.
  - `useRoundGameModes.ts` — owns modal state (hammer, wolf, crybaby,
    press, flip, cancel, leave, leaderboard, live feed, hole-result preview)
    and handlers. Preserves the `wolfModalShownForHole` guard from the
    2026-04 wolf-modal-loop fix.
- `CrybabyActiveRound.jsx` → `CrybabyActiveRound.tsx`. The 35-useState
  header replaced with hook destructures — local names preserved so every
  downstream reference keeps working.
- Removed the duplicate online/offline useEffect (moved into persistence).
- Hook-order-before-early-return invariant (747ef77) preserved.
- Tests: 9 added covering `computeAdvanceHole` — initial state, non-Nassau
  totals accumulation, Nassau settlement derivation, push semantics,
  resume-like state.

### Intentionally deferred (noted in commit 1c)

These are safe to leave for Phase 2 integration work:
- `advanceHole` is still defined in the component body, not in the hook.
  It does DB emits + AI commentary + live feed events inline. Phase 2's
  `apply-capture` flow will naturally extract this.
- DB calls inside `advanceHole` are still direct; not yet routed through
  `persist.persistPlayerScores` / `persist.persistGameState` etc.
  Conversion is mechanical and best done alongside Phase 2 work.
- Full TypeScript typing of the component body. The `.tsx` rename was
  minimal-typing; `any`s remain where extraction would balloon the diff.

### Verification

- `npm test` → **45 passed / 0 failed** (+35 from baseline of 10).
- `npm run build` → clean (2.2s, 1.35 MB, gzipped 370 kB).
- Live smoke via preview server: `/feed`, `/setup`, `/round?id=<invalid>`
  all render correctly. "Round Not Found" dispatched via new typed
  RoundLoadError. No React hook errors, no console errors outside the
  expected `RoundLoadError` print from the invalid-id test.

### Ready for Phase 2

- `computeAdvanceHole` is the pure seam the `apply-capture` edge function
  will call server-side.
- `useRoundPersistence` is the promise-returning DB layer the capture
  flow will wire its writes through.
- `useRoundGameModes` is the modal-state owner; the capture modal (both
  prompt and ad-hoc) will land alongside these without changing the
  component body.

---

## Phase 2 addendum — 2026-04-18 (branch `phase-2-capture`, PR #2)

Phase 2 backend + pure-logic foundation shipped. Sub-phases 2f (hook
refactor), 2g (six UI components), 2h (integration + E2E) deferred to
a follow-on session with fresh context. Test count 45 → 71 (+26).

### What shipped

**2a — Schema + storage** (`f3df520`)
- `scorecards` private Storage bucket, 10MB cap, MIME allowlist.
- `round_captures` table with the full shape from recon §6.3:
  trigger, photo_path + photo_deleted_at, raw_extraction +
  confirmed_extraction + cell_confidence JSONB, hole_range_start/end,
  applied_at, superseded_by self-FK, feed_published_at, share_to_feed.
- New SECURITY DEFINER helpers: `is_round_scorekeeper`,
  `is_round_viewer` (union of participant/creator/follower/broadcast_friend).
- Added to `supabase_realtime` publication.
- RLS per spec: INSERT requires scorekeeper, SELECT any viewer,
  UPDATE the capturer (for confirm step; service role bypasses),
  DELETE capturer or admin.
- Manual RLS verify script at `supabase/tests/round_captures_rls.sql`.
  DEFERRED: automated RLS test harness — logged in TODOS.md.

**2b — Shared game engine** (`198fe43`)
- Moved `src/lib/gameEngines.ts` →
  `supabase/functions/_shared/gameEngines.ts`. Client re-exports
  from the new location via a 7-line shim. Zero behavior change;
  eliminates drift risk between client and edge fn money math.

**2c — Capture cadence** (`b69916c`)
- `supabase/functions/_shared/captureCadence.ts`:
  `requiredCadence(round)`, `isPhotoRequiredForHole(round, hole)`,
  `cadenceReason(round, hole)`. Discriminated-union CaptureCadence
  type.
- Client shim at `src/lib/captureCadence.ts`; `useCaptureCadence`
  hook with `{ cadence, isRequired, blockedOnPhoto, reason }`.
- Rules per spec: solo→none; nassau-no-presses→[9,18]; everything
  with hammer/crybaby/birdie/carry_over/presses→every_hole; all
  other money modes→every_hole default.
- 22 tests covering every game mode × mechanic combination,
  including exhaustiveness pattern that will break at compile time
  if a new variant is added to the union.

**2d — `extract-scores` edge function** (`e0ce620`)
- Mirrors `analyze-scorecard/index.ts` for CORS/auth/errors.
- **Scorekeeper auth gate via `is_round_scorekeeper` RPC BEFORE
  any Anthropic call** — prevents unauthorized API spend.
- Claude Opus 4.5 vision. System prompt carries player name+id list,
  hole numbers, par array, last-known scores as strong priors.
- Strict input validation; typed I/O; 422 raw-text on parse failure
  (client falls back to manual entry). No `any`.
- Observability logs: `{ roundId, userId, latencyMs, tokensIn,
  tokensOut, extractedCellCount, lowConfidenceCount,
  unreadableCount, parseSuccess }`.

**2e — `apply-capture` edge function** (`c5b338e`)
- Loads capture, re-verifies scorekeeper, computes delta vs. prior
  `round_players.hole_scores`.
- Noop fast path when delta is empty: marks capture applied, returns
  `{ noop: true }`. Client suppresses diff dialog.
- Non-empty delta: writes merged scores, calls
  `replayRound` on full updated score set, persists
  `game_state` (totals, carryOver, nassauState), rewrites
  `round_settlements` if round complete, supersedes prior
  overlapping applied captures via `superseded_by`.
- **Feed debounce**: 30s window per (round, scorekeeper) on
  `capture_applied` events. Private rounds always suppressed.
  Ad-hoc + `shareToFeed=false` suppressed. Otherwise published.
- Emits `round_events` types `capture_applied` (always) and
  `capture_money_shift` (only if totals changed).
- Strict typing; service-role client for writes (authz enforced
  up-front); observability logs.

### Release gate: replayRound equivalence (`c5b338e`)

`src/test/replayEquivalence.test.ts` proves that the live-play path
(`computeAdvanceHole` hole-by-hole) produces identical totals to
`replayRound` on the same score set. If these ever diverge,
`apply-capture` would produce wrong money. 4 tests cover:

- Skins with carry-over pushes
- DOC with hammer + crybaby phase (holes 16–18 switch to skins)
- Flip with birdie bonus
- Nassau 4-player team with segment settlement

All passing. This is the dollar-for-dollar correctness guarantee for
the capture pipeline.

### Deferred — carried forward to 2f/2g/2h session

| Item | Reason | Follow-on |
|---|---|---|
| **2f** — `useAdvanceHole` composite hook + `useRoundPersistence` extension + CrybabyActiveRound refactor | Moderate surgical work; higher quality with fresh context | Next session |
| **2g** — Six capture UI components (strictly typed, confidence tiers, a11y) | ~1000+ lines of new UI; quality-sensitive | Next session |
| **2h** — Integration + `useCapture` hook + E2E smoke test with mocked Supabase | Depends on 2f + 2g | Next session |
| **Wolf in `replayRound`** | Partner selections not in `ReplayHoleInput` | Post-Phase-2 |
| **Hammer history in `apply-capture`** | Same limitation as `RoundEditScores` (assumes depth=0, not folded) | Post-Phase-2 |
| **Edge function unit tests** | Vitest can't run Deno | E2E smoke test in 2h + manual `supabase functions serve` |
| **Automated RLS test harness** | No pattern in repo | Manual SQL script is stopgap; logged in TODOS.md |

### Test + build delta

- Phase 1 baseline: 45 tests.
- After Phase 2 backend (this PR as of 2e): **71 tests** (+26).
- Build: clean, 2.1s, 1.35 MB (unchanged — no UI yet).

### Ready for 2f/2g/2h

The Phase 2 backend is locked and tested. The UI session can move fast
because:
- `useRoundState` exposes `computeAdvanceHole` — the pure compute the
  capture flow drives.
- `useRoundPersistence` already has promise-returning wrappers; 2f
  just adds a few more named methods.
- `useRoundGameModes` owns modal state; the capture modal slots in
  alongside the existing hammer/wolf/crybaby/press modals without
  re-architecting anything.
- `extract-scores` and `apply-capture` are deployed-ready; 2g's
  `CaptureFlow` just orchestrates HTTP calls to them.
- The `replayRound` equivalence test is the CI-enforced guarantee
  that money math stays correct across every Phase 2 refactor.

---

## Phase 2 completion addendum — 2026-04-18 (branch `phase-2-capture`, PR #3)

Phase 2 complete. 2f, 2g, 2h shipped in a follow-on session after
2a–2e landed. Total delta vs. Phase 1: **86 tests** (+41 from Phase 1's
45 baseline), **~35 kB** added to gzipped bundle, end-to-end capture
flow compiling cleanly, passing release-gate equivalence, rendering
without runtime errors.

### What landed in 2f/2g/2h

**2f — Persistence Result envelope + `useAdvanceHole`** (`de35e3f`)
- `useRoundPersistence` methods return `PersistResult<T>` — a
  discriminated union `{ok: true, data} | {ok: false, error}` with
  kind `network | conflict | auth | unknown`. No thrown errors.
- `useAdvanceHole` composite hook sequences capture-gate → pure
  `computeAdvanceHole` → `Promise.all` of `persistPlayerScores` +
  `persistGameState` → React commit. Gate check is FIRST so we
  never partially commit before rejecting.
- `CaptureRequiredError` class the UI dispatches on; `PersistFailureError`
  aggregates per-step failures.
- Two `any`s narrowed: `showResult → HoleResult | null`,
  `crybabConfig → CrybabConfig | null`.
- +7 tests: clean advance, capture-gate block, holes-cadence
  non-blocking, unblock-after-apply, persistence failure (single +
  multi-step), unsaved-round path.

**2g — Six capture UI components** (`a137195`)
- Shared types with `classifyConfidence` function.
- `CaptureShutter` — `<input capture="environment">` + preview +
  Retake/Use photo. HEIC passthrough.
- `CaptureAnalyzing` — `role="status"` skeleton grid, focus-trapped
  Cancel.
- `CaptureConfirmGrid` — editable hole × player grid, three
  confidence channels (color + icon + aria-label). Apply disabled
  while any low-tier cell empty.
- `CaptureDisputeDialog` — only constructed on genuine overwrites.
- `CaptureFlow` — shadcn Dialog container, state machine
  `shutter → analyzing → confirm (+ optional dispute) → applying →
  done | error`. Parallel photo upload + extract-scores call.
- `CaptureButton` + `CapturePrompt` — presentational; parent gates
  visibility.
- All components have `data-testid`. Zero `any`.

**2h — Integration + `useCapture` + E2E smoke** (`0d02ebf`)
- `useCapture` coordinator ensures one modal instance shared between
  FAB + banner.
- Minimal-touch integration into CrybabyActiveRound.tsx:
  CapturePrompt at top (when blocked), CaptureButton as FAB,
  CaptureFlow when a capture is open. All gated by
  `isScorekeeper && status === "active"`.
- Two bugs fixed during integration:
  - `classifyConfidence(null)` returning `"low"` → corrected to
    `"high"` (no extraction ≠ unreadable).
  - Dispute dialog firing on first-time captures → corrected so only
    cells with a non-null PRIOR value produce diff rows.
- +8 E2E tests in `src/test/captureFlow.e2e.test.tsx` with mocked
  Supabase covering all six spec scenarios.

### Concerns from PR #2 review — how each was addressed

| Concern | Resolution |
|---|---|
| 1. `is_round_scorekeeper` edge cases | Helper doesn't check status (correct for `post_round_correction`). UI defensive gate via `dbRound?.status === "active"`. Guest scorekeepers deferred (TODOS.md). |
| 2. Shared `ANTHROPIC_API_KEY` | `extract-scores` logs prefix `[extract-scores]` vs. `analyze-scorecard`'s prefix — distinguishable. Split-key deferred. |
| 3. Noop toast differentiation | Implemented: ad-hoc noop → toast "Scores unchanged"; game-driven noop → silent close. Capture row always written. |
| 4. Upload race | Photo upload runs in parallel; apply proceeds with null `photo_path`; upload UPDATE fires on completion. Confirm grid shows upload status but never blocks. |
| 5. CaptureButton visibility | Gated by `isScorekeeper && status === "active" && !capture.isOpen`. |
| 6. CapturePrompt blocks advance | Banner non-dismissible. `isBlockedOnPhoto` + `CaptureRequiredError` in `useAdvanceHole` are the mechanism. Existing inline `advanceHole` not yet rerouted through the hook — deferred (TODOS.md). |

### Deferrals added to TODOS.md "Phase 2 deferrals"

- Automated RLS test harness (manual SQL script is stopgap).
- Wolf in `replayRound` (partner selections not stored).
- Hammer history in `apply-capture` (replay assumes depth=0).
- Guest-scorekeeper schema-level CHECK constraint.
- Route inline `advanceHole` through `useAdvanceHole` (hook + gate
  exist; inline body still works but doesn't use the hook).
- Post-launch: split `ANTHROPIC_API_KEY` per edge function if spend
  gets noisy.

### Ship status

- **86/86 tests pass** (+41 from Phase 1 baseline).
- **Build clean**: 2.3s, 1.38 MB bundle (371 kB gzipped).
- **Live smoke**: `/feed` renders, no runtime errors.
- **Release-gate equivalence**: `computeAdvanceHole == replayRound`
  across Skins/DOC/Flip/Nassau still green.
- **Zero `any`** in any Phase 2 code.

### Manual test script (for the user to run)

**Setup — once, before first test:**
1. Ensure Supabase migrations `20260418100000_scorecards_bucket.sql`
   and `20260418100100_round_captures.sql` are applied (`supabase db
   push` if not).
2. Deploy the edge functions:
   `supabase functions deploy extract-scores`
   `supabase functions deploy apply-capture`
3. Confirm `ANTHROPIC_API_KEY` Supabase secret is set (same key used
   by `analyze-scorecard` in Phase 1).

**Test 1 — happy path ad-hoc capture:**
1. Sign in, tap **Start Action** on /feed.
2. Create a 4-player Nassau round. Mark yourself **scorekeeper**.
3. On the round page: you see a camera FAB button (bottom-right),
   no "photo needed" banner.
4. Enter scores for hole 1 (Alice 4, Bob 5, Carol 4, Dave 5) and tap
   **Next Hole**. You advance to hole 2 normally.
5. Tap the **camera FAB**. The capture modal opens on the Shutter step.
6. Tap **Take photo** (camera opens on mobile; file picker on desktop).
   Pick any photo — a scorecard or a test image.
7. Review the preview. Tap **Use photo**.
8. The **Analyzing** step shows a shimmer for a few seconds.
9. The **confirm grid** appears with 4 players × 18 holes.
   Cells have confidence decoration: yellow for medium, red "?" for
   unreadable.
10. Fill any red "?" cells.
11. Leave **Share to feed** unchecked (ad-hoc default).
12. Tap **Apply**. Expect: "Saving scores…" spinner → "Scores updated"
    toast → modal closes.
13. Check /feed: no new post (ad-hoc + share off = private).
14. Return to /round: running totals reflect the applied scores.

**Test 2 — noop re-capture:**
1. Same round, no edits. Tap **camera FAB** again.
2. Walk through photo → analyze → confirm.
3. Tap **Apply** without editing. Expect: "Scores unchanged" toast,
   modal closes silently, NO dispute dialog.

**Test 3 — game-driven capture on Nassau hole 9:**
1. Play holes 1-9 manually.
2. After entering hole 9 scores and submitting: a yellow banner at
   the top reads "Photo needed to continue — End of front 9 — photo
   to settle segment."
3. The Next-hole button is disabled.
4. Tap **Capture now**. Modal opens in game-driven mode for hole 9
   only.
5. Take photo, confirm, apply. Banner disappears; you can advance.

**Test 4 — diff dialog on overwrite:**
1. After applying scores from test 1, tap the camera FAB again.
2. Upload a photo with different scores (e.g. Alice hole 3 now 6
   instead of 4 — or manually edit the extracted cell before apply).
3. Tap **Apply**. Expect: dispute dialog with heading "Overwrite
   current scores?", table showing `5 → 4` (or whatever differs),
   buttons Cancel / Overwrite with new.
4. Tap **Overwrite with new**. Scores update; "Scores updated" toast.

**Test 5 — non-scorekeeper view:**
1. In a second browser / incognito, join the round as a participant
   (NOT scorekeeper).
2. Open the round page. Expect: NO camera FAB, NO prompt banner.
3. Scores update in real time via the existing realtime subscription.

### Recommendation

**Merge PR #3.** Phase 2 is end-to-end complete, all tests pass, the
release gate is green, and the manual test script above is the
acceptance checklist. Deferred items are logged in TODOS.md and do
not block the feature — they become visible at higher scale or
specific game modes that are out of MVP scope.

---

## Phase 2.5 addendum — 2026-04-19 (branch `phase-2.5-hammer`, PR #4)

Closes the hammer money-math correctness gap: the hole winner isn't
always derivable from scores (a laid-down hammer overrides the
stroke-play winner). Adds a sequenced tap-prompt after scores are
confirmed so the scorekeeper logs each depth explicitly. Also hides
Wolf from the setup picker (same correctness problem — partner picks
not score-derivable).

### Delta vs. Phase 2

- **133 tests** (+47 over Phase 2's 86).
- Build clean, 2.2s, 1.38 MB (+~30 kB for hammer UI and types).
- Two Supabase migrations applied to the live project:
  - `20260418100000_scorecards_bucket.sql` (already live from Phase 2)
  - `20260418100100_round_captures.sql` (already live)
  - `20260419000000_hammer_capture.sql` (NEW — `hammer_state` +
    `confirmed_hammer_state` columns, broadened trigger CHECK)
- `apply-capture` edge function redeployed with hammer-state wiring.

### Commit summary

- **2.5a** (`dab63c5`) — Wolf hidden from setup picker via `hidden: true`
  flag on its `GAME_FORMATS` entry; legacy Wolf rounds still render via
  `calculateWolfHoleResult`. TODOS.md entry documents the re-enable
  path (extend hammer prompt pattern for partner picks).
- **2.5b** (`1e1e7c6`) — New rich `HoleHammerState` type + pure
  `hammerMath.ts` (`resolveHammerOutcome`, `validateHammerState`,
  `translateToLegacy`). Schema migration. `apply-capture` gains
  `hammerState` input; merges via translateToLegacy into
  `course_details.game_state.hammerHistory` (the legacy shape the
  engine already consumes). +27 hammer math tests + 9 release-gate
  equivalence tests including the critical "lay-down overrides score"
  case.
- **2.5c** — Sequenced prompt UI: 7 new components under
  `src/components/capture/hammer/` (TeamPicker, Response, HammerBack,
  Breadcrumb primitives; HammerHoleStep state machine;
  HammerHoleSummaryCard; HammerPromptFlow container). Inserted as
  `hammer_prompt` step in CaptureFlow between `confirm` and
  `applying`, only when `mechanics.includes("hammer")`. Birdie
  confirmation toasts fire after apply for any detected birdies.
  +6 component tests.
- **2.5d** — `EditHammerModal` for retro hammer fixes: opens
  `HammerPromptFlow` pre-populated with the round's current
  `hammerStateByHole`, writes a `trigger='hammer_correction'` capture
  row, and re-applies. Cadence copy updated to
  `"Hammer active — photo and hammer prompt required each hole."`

### Correctness rule — locked into the release gate

Release-gate equivalence tests in `src/test/replayEquivalence.test.ts`
prove (among others):

- **Depth 2 laid down by Team A** (riders threw at 2, drivers laid
  down): Team B wins at 2× **regardless of whether drivers outscored
  riders**. Verified with drivers shooting 3s vs riders shooting 5s —
  the fold still wins for riders.
- Birdie bonus multiplies the post-hammer payout only when the
  **winning** team had a gross birdie.
- Losing (folding) team birdie is ignored — `calculateFoldResult`
  doesn't route through `calculateTeamHoleResult` where the birdie
  multiplier lives.

All 9 hammer equivalence scenarios pass.

### Manual test script — Phase 2.5 additions

Run these AFTER the Phase 2 smoke tests pass.

**Setup:** Create a 4-player round with the **DOC game mode** and the
**hammer mechanic enabled** (and pops / crybaby off for clarity).
Mark yourself scorekeeper.

**Test 2.5-1 — No hammer on hole 1 (1 tap):**
1. Enter hole 1 scores manually, submit, advance to hole 2.
2. Enter hole 2 scores, submit, then tap the **camera FAB**.
3. Take any photo, confirm the grid (scores may be inaccurate — tap
   Apply anyway).
4. **After the grid, you should see a new screen titled "Hammers"**
   with hole 2 marked "Not answered yet".
5. Tap **Start**. You should see "Any hammers on hole 2?" with
   [No] [Yes] buttons.
6. Tap **No**. You should see "Hole 2 — all set" with "No hammer.
   Winner by score at 1× hole value."
7. Tap **Continue**. The flow returns to summary; tap **Looks good**.
8. "Scores updated" toast fires; money totals stay unchanged (1×
   hole value).

**Test 2.5-2 — Depth 1 scored out (4 taps):**
1. On the next hole, repeat the capture flow.
2. In the hammer prompt, tap **Yes**. Tap the **Team A** card ("Drivers"
   or whatever your team is called).
3. You should see "{Team B}'s response?". Tap **Accepted**.
4. You should see "Did {Team A} hammer back?". Tap
   **No — score it out** (the sub-label reads "at 2× the hole value").
5. Terminal says "Scored out at depth 1. Winner by score at 2× hole
   value."
6. Continue → Looks good. Check running totals: the winning team's
   money for that hole is 2× hole value each.

**Test 2.5-3 — THE CRITICAL TEST: depth 2 lay-down overrides scores:**
1. Arrange scores so Team A would normally win by score (e.g. A's
   best is 3, B's best is 5).
2. In the hammer prompt for that hole: **Yes** → **Team A threw first**
   → **B accepted** → **Yes, hammer back** → **A laid down**.
3. Terminal should say "{Team B} wins — {Team A} laid down at depth 2.
   2× hole value."
4. Apply. Check running totals: **Team B wins the hole at 2× even
   though they scored higher**. This is the correctness rule in action.

**Test 2.5-4 — Gross birdie by winning team:**
1. On a par 4, enter scores with one player at 3 (birdie) on the
   winning team. Run the capture + hammer prompt (depth 1 accepted,
   scored out).
2. After Apply, you should see a second toast: "Birdie bonus on
   hole N → {Player} — 2× multiplier." (Assuming
   `birdieMultiplier: 2` in your round config.)
3. Totals reflect 2× (hammer) × 2× (birdie) = 4× multiplier.

**Test 2.5-5 — Fix hammers retro:**
1. After applying a round with hammers, tap the 🔨 **Fix hammers**
   button (bottom-left of the active round page).
2. You should see the hammer summary with all played holes and their
   current states.
3. Tap **Edit** on any hole. Walk through and change the state
   (e.g. flip from "No hammer" to "D1 laid down by A").
4. Continue → Looks good. "Hammers updated" toast fires.
5. Running totals recompute — verify the edited hole's money changed.

### Deferrals carried forward from Phase 2.5

- **Wolf mode re-enable** — logged in TODOS.md; needs the same
  sequenced-prompt treatment for partner picks.
- **`override-birdie` dedicated edge function** — birdie correction
  currently has to go through the same apply-capture path via a new
  capture row. A dedicated route could reduce round-trips; deferred.
- **Hammer state in `replayRound` for post-round score edits** — the
  legacy `ReplayHoleInput` shape already carries `hammerDepth/folded/
  foldWinnerTeamId`; apply-capture writes this from new hammer states.
  Post-round edits via `RoundEditScores` don't yet use the new rich
  shape, but they'll still produce correct money via the legacy fields.

### Merge recommendation

**Merge PR #4 after the Phase 2.5 manual test script passes.** The
release gate is green; the money-math correctness hole is closed for
hammer rounds. Wolf remains hidden until we extend the pattern.

---

## Phase 3 addendum — 2026-04-19 (branch `phase-3-social`, PR #5)

The social layer that turns every live capture into a broadcast event.
Zero backend changes: `apply-capture` was already emitting
`capture_applied` + `capture_money_shift` events with
`feed_published_at` baked in; Phase 3 is the UI that consumes those
events and renders them as living tiles.

### Delta vs. Phase 2.5

- **171 tests** (+38 over Phase 2.5's 133).
- Build clean, 2.3s, 1.39 MB (+~15 kB for capture renderers, tile,
  standings panel).
- **No schema migrations.**
- **One edge function redeploy** (`apply-capture`) after refactoring
  the debounce logic into a shared pure function so Vitest can verify
  the decision rules without running Deno.

### Commit summary

- **3a** (`1863eaf`) — Capture event renderers in `RoundLiveFeed`.
  `CapturePhotoThumbnail`, `CaptureAppliedCard`, event-merge helpers
  in `captureEventTypes.ts`. `capture_applied` + `capture_money_shift`
  events with the same `capture_id` render as a single card. Photo
  thumbnails lazy-load via Supabase signed URLs (55-min cache);
  expanded modal for full-size view.
- **3b** (`a69a59d`) — `LiveStandings` panel at the top of
  `RoundLiveFeed`. Realtime-subscribed to `round_events`. Stroke
  indicator uses icon + color (▲/▼/•) for non-color-only
  accessibility. Collapsible. Open-hammer badge per player.
- **3c** (`60ea652`) — `CaptureTile` in the main `CrybabyFeed`. Small
  tap-through tile in the live-rounds section. Belt-and-suspenders
  privacy filter (client checks `course_details.privacy === 'private'`
  in addition to the server's `feed_published_at` gate).
- **3d** (`9e22c04`) — Debounce verification. Extracted the
  feed-publish decision from `apply-capture` into a pure
  `feedPublishDecision` function in `_shared/`. 12 tests covering
  every rule (private rounds, ad-hoc opt-in, 30s recency, retro
  triggers) + the 5-captures-in-30s simulation + private-round
  client-filter.

### Phase 3 manual test script

Run AFTER Phase 2 + Phase 2.5 manual tests pass.

**Setup:** Two browser sessions. One as you (scorekeeper of an active
broadcast round at `https://crybaby.golf`); another as a friend who
follows your round (or a second incognito window with a different
account you've friended).

**Test 3-1 — Live standings panel (participant view):**
1. In your scorekeeper session, open the active round and tap "Live
   feed" (or the broadcast icon, depending on where it's surfaced).
2. Expect a sticky panel at the top titled "Standings · {game name}".
3. Every player on the round appears in the panel with:
   - Their name
   - A stroke indicator (▲ red for over-par, ▼ green for under-par,
     • muted for even/unscored)
   - A money column (+$X in primary color for winners, −$X in
     destructive color for losers)
4. Tap the header to collapse; rows hide. Tap again to expand.
5. Return to the round and capture a scorecard. Within ~2 seconds of
   applying, the standings panel should update with the new running
   totals — no manual refresh.

**Test 3-2 — Capture cards in live feed (participant view):**
1. After applying a capture, the live-feed modal should show the new
   capture card at the top (above any existing birdie/team_win
   events):
   - Scorecard photo thumbnail (or a 📷 placeholder if upload failed)
   - "📷 Capture · Hole N" badge + timestamp
   - Your name as scorekeeper
   - If money shifted, a headline like "Grant +$40 on hole 14" with
     the mover's direction colored
   - A "New strokes:" line listing per-player stroke deltas
   - A "Money:" line with running totals sorted desc
2. If the round has hammers active AND the capture covered a hole
   where a hammer was logged, a "🔨 N hammers" badge appears next
   to the hole chip.
3. Tap the thumbnail — a full-screen modal opens with the large
   photo. Tap outside the image to close.

**Test 3-3 — Main feed tiles (follower view):**
1. Switch to the follower browser session. Visit `/feed`.
2. If you follow an active broadcast round with captures, the live
   round section for that round should now include up to 3 recent
   capture tiles at the top (before the legacy event list).
3. Each tile: small photo thumb + "📷 Capture" badge + timestamp +
   "{scorekeeper} · {course}" + "Hole N captured · {mover} +$N" summary.
4. Tap a tile — navigates to `/watch?roundId=...` for live
   spectating.

**Test 3-4 — Private round does not leak (follower view):**
1. Back in the scorekeeper session, mark a round as private
   (round setup → privacy: private).
2. Capture a scorecard.
3. In the follower session at `/feed`, confirm the capture tile
   does NOT appear under the private round. The live-round section
   may not appear at all if the round isn't a broadcast.

**Test 3-5 — 5 rapid captures produce 1 feed tile (participant view):**
1. In the scorekeeper session, apply 5 captures back-to-back (within
   30 seconds). Each one can have small or no score changes — the
   scenario is about frequency, not content.
2. In the follower session at `/feed`, the live-round section for
   this round should show exactly ONE capture tile, not five.
3. Verify in Supabase dashboard SQL editor (optional):
   ```sql
   SELECT COUNT(*) FILTER (WHERE event_data->>'feed_published_at' IS NOT NULL) AS published,
          COUNT(*) AS total
   FROM round_events
   WHERE round_id = '<your-round-id>'
     AND event_type = 'capture_applied';
   ```
   Expect `published = 1` and `total = 5`. The audit log has all
   five; the feed surfaces one.

**Test 3-6 — 31-second gap publishes both:**
1. Apply a capture, wait >31 seconds, apply another.
2. Feed shows BOTH tiles.

### What Phase 3 does NOT include (non-goals)

Per the spec, these remain deferred:
- **Push notifications** when a follower's foursome captures
  (infrastructure exists, wiring deferred).
- **Group chat embeds** of captures.
- **Trash talk / comments on captures.**
- **Post-round highlight reel.**
- **Season-long leaderboards / W-L records.**

### Important caveat carried forward

Phase 3 ships on top of **two unvalidated phases** (Phase 2 + Phase
2.5) — neither has been manually tested end-to-end on a real round
with a real scorecard. Before trusting the social layer with real
money on the course:

**Walk through Phase 2 + Phase 2.5 + Phase 3 manual test scripts in
one session.** The tests run independently (2.5 doesn't depend on
manual Phase 2 validation), but the full user journey is only verified
when all three scripts pass end-to-end.

### Merge recommendation

**Merge PR #5 after the Phase 3 manual test script passes.** All 171
tests green, release gate intact, zero `any` in new code,
accessibility constraints met (non-color signals, aria labels, focus
traps on the photo modal). Phase 3 is a pure UI layer on top of
already-deployed backend contracts — merging it is low risk; the only
behavior changes are: (a) richer cards in live feeds, (b) standings
panel, (c) tap-through tiles in the main feed.
