# Handicaps — locked-vs-current, privacy, and the GHIN-API future

Short doc covering how handicaps are stored, displayed, and protected
in the current manual-entry model, and what changes when a real GHIN
API integration lands.

## Current state (manual entry)

Users type their own handicap index on their profile page. There is
**no GHIN API integration** yet — that's deferred until there's
subscription revenue to pay for USGA API access. See `TODOS.md` →
"GHIN API integration" for the re-enable spec.

### Where the value lives

| Column | Location | Purpose |
|---|---|---|
| `profiles.handicap NUMERIC(4,1)` | per user | The user's current self-reported index |
| `profiles.handicap_visible_to_friends BOOLEAN` | per user | Privacy toggle (see below) |
| `rounds.course_details.playerConfig[].handicap` | per round, JSONB | **Locked** course handicap for each player at round start |

## The single most important rule

**Round-context screens never read `profiles.handicap` at scoring time.**

The course handicap used to compute net scores and stroke pops is
locked into `rounds.course_details.playerConfig[].handicap` when
`createRound` fires (`src/lib/db.ts:85`). From that point forward,
the engine (`supabase/functions/_shared/gameEngines.ts`) reads the
locked value via `Player.handicap` and never re-queries Supabase.

Why this matters:

- If a player updates their index mid-round, it would retroactively
  change the stroke pops on earlier holes. Money math drifts.
- Post-round, if an index update propagated, settlement would become
  non-deterministic — re-loading the round would recompute totals
  against the new index.

The architecture enforces the rule:
- `gameEngines.ts` has zero Supabase imports, zero `@/lib/db`
  imports, no `fetch()` calls. Pure functions in, results out.
- `Player.handicap` is typed as `number`, not as a getter or a
  reactive subscription.
- `src/test/handicapPrivacy.test.ts` locks both invariants in CI.

### Where each value shows up

| Surface | Value | Rationale |
|---|---|---|
| ProfilePage (own) | `profiles.handicap` (current) | You're looking at yourself, not a round |
| UserProfilePage (friend) | `profiles.handicap` (current) — **if** `handicap_visible_to_friends !== false` | Passive browse; respects privacy toggle |
| StatsPage (own) | `profiles.handicap` (current) | Personal stats |
| CrybabyActiveRound | `Player.handicap` (locked at round start) | Money math |
| RoundLiveFeed | `Player.handicap` (locked at round start) | Spectator view of active round |
| Round history / summaries | `playerConfig[].handicap` (locked, from round's JSONB) | Historical accuracy |

## Privacy toggle

`profiles.handicap_visible_to_friends` (default `true`) controls
whether your handicap appears to others in passive-browsing contexts.

- **Your own profile always shows your handicap** regardless of the flag.
- **UserProfilePage (viewing a friend)** respects the flag: if `false`,
  the HCP chip is hidden entirely.
- **In-round contexts never consult the flag** — you're in a money
  game with the other round participants, they have a right to see
  the number. Locked round-start handicap is visible to all round
  viewers (participants + followers) via the normal RLS on
  `round_players` / `round_events`.

UI: checkbox on the ProfilePage edit form labelled "Show my handicap
on friends' profiles" with helper text "Players in your active rounds
see it either way." `data-testid="handicap-visibility-toggle"`.

## Why no `handicap_index_at_start` column

The prior spec proposed adding `round_players.handicap_index_at_start`
+ `handicap_percent_at_start` columns for audit / "at GHIN 12.4"
tooltips on round history. We skipped it because
`rounds.course_details.playerConfig[].handicap` already preserves
the exact handicap used at round start. Adding columns would just
duplicate what's in JSONB.

If a future feature needs to retroactively recompute course handicaps
against a different percentage, the existing JSONB blob has enough
info — the `handicapPercent` is in `course_details.mechanicSettings`
and the raw per-player indexes are in `playerConfig`. The engine's
`replayRound` can consume both.

## Future — when we integrate the real GHIN API

When subscription revenue supports USGA API costs:

1. New table `ghin_handicap_cache(user_id, handicap_index, fetched_at)`.
2. New edge function `fetch-ghin-handicaps` that reads `profiles.ghin`
   (already stored) and populates the cache.
3. ProfilePage gets a "Refresh from GHIN" button that triggers the
   fetch with a per-user 10-minute rate limit.
4. CrybabySetupWizard auto-pulls from the cache at round start for
   signed-in users who have a GHIN number (falling back to
   `profiles.handicap` if no cached value and the live fetch fails).
5. The locked-at-round-start rule is unchanged — the fetched value
   is immediately copied into `playerConfig[].handicap` and the
   engine keeps reading from the locked location.

No architectural change will be needed in the scoring layer. The
integration is additive: profile displays can switch from manual
index → cached GHIN index; round scoring stays on locked JSONB
throughout.

## Test coverage

- `src/test/handicapPrivacy.test.ts` — 5 tests:
  - default-visible semantic (`!== false` check)
  - `Player.handicap` is a plain number in the engine (not a getter)
  - `createRound` persists handicap into `playerConfig` JSONB
  - `gameEngines.ts` imports nothing from `@/lib/db` or `supabase`
  - `loadUserProfile` uses `select("*")` so new columns flow through

These tests are the guardrail. A regression that accidentally makes
round-context handicaps reactive to profile updates will fail here.
