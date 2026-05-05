# Engineering lessons

Short, blameless post-mortems. One per incident. Cross-reference from the
relevant test files + CHANGELOG entries so the lesson surfaces next time
someone reads the adjacent code.

---

## 2026-04-23 — Hook-ordering bugs require full mount tests

### What happened

- **2026-04-21** PR #19 (Scorecard mode) merged. Added a `useEffect` to
  `CrybabyActiveRound.tsx` for scorecard auto-advance. Placed it BELOW
  the `// --- Early returns (after all hooks) ---` marker by accident.
- **2026-04-22** Jonathan ran a DOC round on course. React threw #310
  during `/round?id=X` mount. Orphan round written at `status='active'`
  trapped him from creating new rounds.
- **2026-04-22** PR #23 recon pointed at cart/position data-shape bugs.
  Synthetic test (`d3VerificationPostD2.test.ts`) confirmed that with
  D2's fix applied, `resolvePlayerCartPosition` + `getTeamsForHole`
  produced balanced team rosters from the orphan's shape. I declared
  "D3 resolved as side effect of D2" and shipped PR #23.
- **2026-04-23** Jonathan tried a Scorecard 1-player round. Same #310.
  Same orphan problem. PR #24 recon found the real root cause: the
  misplaced `useEffect` from PR #19 was still there. D2's fix had
  improved data quality but never fixed the hook violation. The
  synthetic test that "verified" D3 could not possibly have caught
  it — it exercised pure helpers, never mounted the component.

Two orphan rounds. Two days. One bug I shipped and then misdiagnosed.

### Lesson

**Data-pipeline tests verify data, not hooks-order invariants.**

Anything that looks like a React hook-chain problem — #310, #301, hooks
inside conditionals, hooks called in loops — can only be verified by a
test that actually mounts the component. Pure-function tests of the
helpers feeding the component are categorically insufficient.

**Any claim that a React crash is "resolved as a side effect" must
include a mount test as evidence.** If the mount test is infeasible
(jsdom + async init race, for instance), say so explicitly in the PR
comment and ship the uncertainty. Don't declare victory because the
adjacent data pipeline looks right.

### What's in place now

- `src/test/hookPositionInvariant.test.ts` — scans
  `CrybabyActiveRound.tsx` for any top-level hook call positioned
  after the early-returns marker. Line-numbered failure report if one
  slips through.
- `src/test/scorecardRoundMount.test.tsx` — actually mounts
  `CrybabyActiveRound` with Jonathan's exact 2026-04-23 orphan
  playerConfig shape. If the hook chain becomes invalid, React throws
  during render and this test fails.
- `src/test/dataShapeOrphanRound.test.ts` — kept (renamed from
  `d3VerificationPostD2.test.ts`) with a prominent scope-clarification
  comment at the top. It's useful data-pipeline coverage but NEVER
  evidence of React crash resolution.

### What would have caught this earlier

If PR #19 had shipped with a mount test alongside the source-level
regex tests, React would have thrown #310 in CI the moment the
misplaced `useEffect` landed. Two days of user-facing breakage,
averted.

For any future PR that adds a `useEffect` / `useMemo` /
`useCallback` / `useState` / `useRef` to a component that has early
returns, the review checklist is:

1. Is the hook call above every early return? (Check visually AND run
   `hookPositionInvariant.test.ts`.)
2. Is there a mount test that covers the render path the hook
   participates in? (If no, write one — `scorecardRoundMount.test.tsx`
   is the template.)
3. Does the commit message explicitly call out the hook position? (So
   future reviewers reading the diff understand the constraint.)

### Related

- PR #19 — original Scorecard mode ship (root of the regression)
- PR #23 — cart/position + name-validation fixes (correct on their own
  merits, but misdiagnosed as the #310 fix)
- PR #24 — real #310 fix + error-boundary recovery + this doc
- TODOS.md — "Deferred: atomic round creation (D4-A)" — the
  structural fix that would have prevented orphan-round creation
  regardless of WHICH component bug was responsible

---

## 2026-04-24 — When ripping a feature, preserve the data tier

### What happened

Photo capture shipped over Phases 1–3 (Apr 7–18) as a four-surface
feature: a mid-round CapturePrompt banner, a CaptureButton FAB, a
pre-completion FinalPhotoGate modal, and a post-completion
"Fix scores / add photo" CTA. By Apr 24 the product call landed: the
scorekeeper is the authority, photos add friction without
proportional value, rip the gameplay UI.

PR #27 did the rip in three commits. The decision that mattered most
wasn't what to remove — it was what to keep.

**Removed** (gameplay UI only): four render-sites in
`CrybabyActiveRound.tsx`, plus the supporting state, derivations,
handlers, and useEffect gates. ~600 lines of UI logic.

**Kept** (everything below the UI layer): `apply-capture` and
`extract-scores` edge functions, the `round_captures` table, the
`scorecards` storage bucket, and every component file in
`src/components/capture/` + `src/components/FinalPhotoGate.tsx` +
`src/hooks/useCapture.ts` + `src/hooks/useCaptureCadence.ts`. The
files carry `// PR #27` marker comments explaining they're
deliberate dead code.

### Lesson

**Removing a feature has two distinct phases. Conflate them and you
either break legacy data or carry forever-debt.**

Phase 1 — UI removal. Stop creating new instances of the feature.
Delete renders, handlers, state. This is a high-velocity edit; the
diff lives in one or two component files.

Phase 2 — data tier removal. Delete the storage, the edge functions,
the tables, the migrations. This is irreversible and has to wait
until you're certain no historical data needs to render.

For Crybaby's photo capture, **legacy rounds with `round_captures`
rows still need to display** via `CaptureTile` + `CaptureAppliedCard`
+ `LiveStandings` event subscription. If we'd dropped the edge
functions or the storage bucket along with the UI, every completed
round-with-photos in users' history would render broken thumbnails
or missing event cards. The data tier has to outlive the UI.

The dead-code shims (`CapturePrompt.tsx` etc.) are the same
principle one layer up: they don't render in the runtime today, but
they're cheap to keep, they document the wire format if the feature
is resurrected, and the alternative is a future PR that has to
reconstruct the UX from git history.

**Set a calendar reminder** to revisit dead code 60–90 days after
removal. By then either the feature has been resurrected (in which
case the shims paid for themselves) or it hasn't (in which case
delete with confidence). The shims should not be permanent — they
should be a finite-duration bet on resurrection.

### What's in place now

- Marker comments at the top of every dead-code file pointing back
  to PR #27 and explaining the resurrection-vs-delete tradeoff.
- `docs/PHOTO_CAPTURE_RECON.md` carries a top-of-file deprecation
  note so a future engineer reading it knows the feature is gone
  but the doc is preserved as a reference.
- `docs/ON_COURSE_TEST_CHECKLIST.md` Sections 2 and P6.2–P6.5
  marked obsolete with a redirect to the still-relevant tests.
- `src/test/photoCaptureMidRoundRemoved.test.ts` +
  `src/test/photoCapturePostRoundRemoved.test.ts` — absence
  assertions guarding against accidental re-introduction.

### What would have caught this earlier

Nothing was broken — this is a process lesson, not a bug. But the
checklist for future feature removals:

1. **Inventory before cutting.** What components, hooks, edge
   functions, tables, migrations, storage buckets, and tests
   compose this feature? (PR #27's `/tmp/recon27.md` did this.)
2. **Classify each by removal phase.** UI now (Phase 1) vs. data
   tier later (Phase 2) vs. preserved infrastructure (resurrect-able
   shims).
3. **Write absence tests with the removal commit.** Not a
   nice-to-have — they're how you prevent the next reviewer from
   merging a "cleanup" PR that re-introduces a broken render-site.
4. **Schedule the cleanup follow-up.** Calendar item, TODOs.md
   entry, or a dated marker comment ("revisit 2026-07-24").

### Related

- PR #27 — the photo-capture removal (3 commits)
- `docs/PHOTO_CAPTURE_RECON.md` — original feature-recon document,
  preserved with a deprecation note
- `src/test/photoCaptureMidRoundRemoved.test.ts` — Commit 1 absence
  guard
- `src/test/photoCapturePostRoundRemoved.test.ts` — Commit 2 absence
  guard

---

## 2026-04-29 — Dead exports preserve their assumptions, not their irrelevance

### What happened

PR #32 fixed an on-course pop-math bug: `db.ts`'s round-start
handicap scaling used `Math.floor((raw * percent) / 100)`, which
truncated 7.8 → 7 and 17.9 → 17, fabricating 1-stroke gaps where
the raw values were essentially tied. Jonathan's 2026-04-29 DOC
round caught it — Michael (raw 8.0) got a phantom pop because Todd
(raw 7.8) floored to 7. Fix was a single function call swap to
`Math.round` at both `db.ts` call sites (`startRound` and the
deprecated `createRound`).

Live deploy verification through Claude in Chrome's `javascript_tool`
fetched the bundle and counted `Math.round((var * var) / 100)`
matches: **3 hits where I expected 2.** The third was an unrelated
codepath I hadn't touched. Searched the source: `Math.floor` was
still present at `src/lib/handicap.ts:117-125` in a function called
`computeAdjustedHandicap`. Same bug shape — same broken rounding
rule — sitting in a parallel module.

But the helper had **zero production callers.** Only its own test
file imported it. Tree-shaking didn't drop it because it was an
exported symbol. The deployed bundle was carrying:
- The CORRECT rounding at the live `db.ts` sites.
- The INCORRECT rounding in a stranded helper that nothing called.

The helper's docstring even justified the floor — "stricter-for-the-
field rounding matches standard team-game practice" — a confidently
wrong audit trail of stranded assumptions. A future engineer
refactoring the round-start path could plausibly grep for "scale
handicap" or similar, find this helper, wire it up, and re-introduce
the exact bug PR #32 had just removed. Without realizing it had its
own tests proving the wrong values were correct.

PR #33 deleted the helper, its tests, and its import. 2 files
changed, -8 tests (all from the dead block), zero behaviour change
in production.

### Lesson

**Unused exports are not zero-risk. They are latent risk.**

Tree-shaking can drop unused functions IF they're not exported. The
moment you `export` a helper, you've created a public API surface
the next refactor can wire into — carrying whatever assumptions
were baked in when the helper was written. If those assumptions are
wrong, deletion is the cleanest move. Flipping the rule preserves
a symbol nobody asked for; deleting it forces the next caller to
think clearly about which canonical helper to use (or to extract
a new one with the right rule).

The helper's audit trail is the giveaway. A docstring like
"stricter-for-the-field" justifying a deliberate choice — when no
production code actually exercises that choice — is **stranded
intent**. Nobody validated that the choice was right, because
nobody used it. The comment looks authoritative; the code is
unverified.

This is distinct from PR #27's "preserve the data tier" lesson,
which is about KEEPING dead code (component shims) so legacy data
keeps rendering. The difference:

- PR #27 dead code: required for legacy DATA paths; deletion would
  break historical rounds. Preserve with explicit dead-code
  markers.
- PR #33 dead code: was never required for any path. Deletion has
  zero blast radius and removes future-bug surface area.

**Triage rule:** unused export → check if anything depends on it
SHIPPING (legacy data, replay paths, type re-exports). If nothing
depends on it shipping, delete. The autonomous policy already
authorizes this; PR #33 just exercised it.

### What's in place now

- `src/lib/handicap.ts` retains a PR-#33 marker comment where
  `computeAdjustedHandicap` used to live. The marker explains what
  was removed AND why — so a future engineer doing similar recon
  finds the deletion rationale before re-introducing the same shape.
- `src/test/jonathanDOCPopMath.test.ts` (PR #32) is the canonical
  regression suite for round-start handicap rounding. Cross-
  referenced from the test file that used to host the deleted
  block.
- The autonomous policy (locked in 2026-04-29) explicitly covers
  this case: "Helper function cleanup (delete vs deprecate): if no
  callers exist after a refactor, delete. Don't ask."

### What would have caught this earlier

Two checks during the original PR #32 fix would have surfaced the
parallel stranded helper:

1. **Grep for the buggy pattern, not just the changed file.**
   `grep -rE "Math\.floor.*\* *[a-zA-Z]+ *\/ *100"` would have
   landed on both `db.ts` AND `handicap.ts`. I only edited `db.ts`
   because that was the call site forensics pointed at.
2. **Bundle inspection counts as evidence.** The deploy-verify
   script that surfaced the unexpected `Math.floor` hit was a
   second pass that should be standard procedure when fixing a
   rounding/scaling bug — there's almost always more than one
   place the same conversion gets done.

### Related

- PR #32 — the round-to-nearest fix at `db.ts` (the production sites)
- PR #33 — the dead-helper deletion (this lesson's source)
- `src/test/jonathanDOCPopMath.test.ts` — canonical regression suite
- `src/lib/handicap.ts` — PR-#33 marker comment in place of the
  deleted helper

---

## 2026-04-29 — Replay-equivalence tests must exercise both paths

### What happened

PR #16 (2026-03-15) shipped `calculateFlipHoleResult` in
`supabase/functions/_shared/gameEngines.ts` as the canonical
Flip-base-game payout function. It encoded the 3v2 asymmetric
stakes (3-man risks $B per player, 2-man risks $1.5B per player)
and the rolling-window carry-over. The replay path
(`replayRound` → `apply-capture` edge function) was wired through
it correctly. The test suite passed.

But the **live** path in `src/pages/CrybabyActiveRound.tsx`'s
`calculateHoleResult` was never wired to call it. Live Flip holes
fell through to the DOC team-based math at the bottom of the
function. The bug sat dormant for six weeks because nobody ran a
real Flip round.

**2026-04-29:** Jonathan ran the first on-course Flip round.
Three settlement-affecting symptoms surfaced at once:

1. A hole that should have been won via best-ball (2-man team had
   a gross birdie + pop = net eagle) was scored as a **push**.
   Root cause: DOC's birdie-forced-push rule (PR #31) — fires when
   one team has a gross birdie crossed with the other team having
   a net birdie via pop — kicked in. That rule is DOC-specific,
   but live Flip was running through DOC's math.
2. Decided holes paid **symmetric flat stakes** (each player ±$B)
   instead of Flip's 3v2 asymmetric (3-man ±$B, 2-man ±$1.5B).
3. Push pots accumulated in DOC's **scalar `carryOver`** field
   instead of Flip's rolling window. The window state was never
   updated on live holes.

PR #55 fixed all three by adding a Flip branch to live
`calculateHoleResult` that mirrors the replay path — same engine
call (`calculateFlipHoleResult`), same translation to `HoleResult`,
identical quip strings. Plus rolling-window state transitions in
`advanceHole` and resume hydration of the saved window.

The fix was small. The fact that it took six weeks of silent
divergence + an on-course settlement bug to surface is the
problem worth documenting.

### Lesson

**Replay-equivalence tests that only exercise one engine path
are not equivalence tests.**

PR #16's existing test file (`flipReplayEquivalence.test.ts`)
asserted the replay output matched expected money values for a
mix of pushes and decided holes. That kept the replay path
correct. It did NOT compare the replay output against what the
LIVE path would produce for the same fixture. The two paths
could (and did) diverge silently.

The structural pattern: anywhere two implementations of the
same logic exist — engine module vs. apply-capture, client UI
vs. edge function, primary code path vs. fallback — the correct
regression guard is a test that runs the **same fixture**
through **both** and asserts deep-equal results. The pattern
generalises beyond Flip:

- DOC's `calculateTeamHoleResult` (replay) vs. the inline DOC
  math in `CrybabyActiveRound.tsx`. Both exist; both should
  produce identical settlements for the same scores. Equivalence
  test does not yet exist.
- Skins, Wolf, Nassau, Crybaby phase — same shape. Replay path
  uses dedicated engine functions; the live page often has its
  own version inline. Each pair is a candidate for an
  equivalence test.
- Future engine forks (when DOC's birdie-forced-push was added
  in PR #31, an equivalence test would have caught that the rule
  applied to Flip too — because the live page didn't disambiguate
  game modes for the team-math fall-through).

### What's in place now

- `src/test/flipLiveReplayEquivalence.test.ts` — runs four
  fixtures through both `calculateFlipHoleResult` (replay's
  canonical engine) AND a pure helper that mirrors the live
  page's translation logic. Asserts deep-equal `HoleResult`
  shapes including quip strings and rolling-window state.
  Fixtures: (1) the on-course bug scenario, (2) no-birdies
  baseline, (3) legitimate push, (4) three consecutive holes
  with rolling-window math.
- `src/test/jonathanFlipBestBall.test.ts` — named regression for
  the on-course failure. Asserts the engine returns
  `winningSide='A'` (NOT push) and 3v2 asymmetric stakes for the
  exact scenario Jonathan ran. Plus three source-level guards
  pinning the live wiring (Flip branch present, advanceHole
  transitions the window, resume restores the window).
- The Flip branch in `src/pages/CrybabyActiveRound.tsx` carries
  a comment explicitly cross-referencing the replay path's
  location so future maintainers see both paths together.

### What would have caught this earlier

If PR #16 had shipped with the equivalence test alongside the
replay-only test, the divergence would have been a CI failure
the moment `calculateHoleResult`'s Flip branch was missing. PR
#16 reviewers would have seen the failure, asked the obvious
question ("why is the live path producing different output?"),
and either added the missing branch or explicitly opted out
with a comment. Six weeks of latent bug surface, averted.

For future engine work that introduces a parallel replay path,
the review checklist:

1. Does the live UI also call this engine? (If yes, where? If
   no, why not?)
2. Is there a single fixture where both paths produce results we
   can compare? (If no, the equivalence test isn't possible —
   note that explicitly in the PR.)
3. Does the equivalence test compare deep-equal, including
   cosmetic fields like quip strings? (If only money fields are
   compared, a future PR adding a divergent quip can mask
   underlying logic divergence.)

### Related

- PR #16 — original Flip engine ship (root of the divergence)
- PR #31 — DOC birdie-forced-push (the rule that triggered the
  on-course symptom on a Flip hole)
- PR #55 — live-path Flip branch + equivalence test + named
  regression + this doc
- `src/test/flipLiveReplayEquivalence.test.ts` — the regression
  guard PR #16 should have shipped
- `src/test/jonathanFlipBestBall.test.ts` — named regression for
  Jonathan's 2026-04-29 round
