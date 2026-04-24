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
