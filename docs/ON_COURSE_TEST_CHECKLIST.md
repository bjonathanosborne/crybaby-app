# On-Course Test Checklist

Everything you need to validate Phase 2 → Phase 3 on a real round. One document, phone-readable, no SQL unless explicitly flagged.

**Deploy status as of 2026-04-19:** crybaby.golf is serving `main` (verified via JS bundle fingerprint — Cincinnati transition, Fix hammers button, and DOC-only picker are all live). No further deploy action needed.

---

## Section 1 — Pre-round setup

Do these **once** before you start. Skip to Section 2 if you already have a DOC + hammer round running.

### 1.1 Sign in

**Do:** Open https://crybaby.golf on your phone in Safari (or desktop Chrome with a camera).
**Expect:** Crybaby landing page → tap **Continue with Google** or sign in with email/password → land on `/feed`.

### 1.2 Start a DOC round

**Do:** Tap **Start Action** on `/feed`.
**Expect:** Setup wizard opens at step 1 (Choose your game).

**Do:** Look at the game picker.
**Expect:** Exactly **two** options visible — **Drivers / Others / Carts** and **Just Me**. (Nassau/Skins/Flip/Custom/Wolf are hidden for this test surface.)

**Do:** Tap **Drivers / Others / Carts**.
**Expect:** Highlighted with green border. Tap **Continue**.

### 1.3 Add players (4 total, you as scorekeeper)

**Do:** Add yourself + 3 others. The 3 others can be "guest" names if they're not signed-in users.
**Expect:** You're marked as scorekeeper automatically (there's a scorekeeper badge on your row).

**Do:** Assign each player a **cart** (A or B, 2 players per cart) and a **position** (driver or rider).
**Expect:** All 4 player rows green. Continue button enabled.

### 1.4 Course + mechanics

**Do:** Pick any course from the list (Lions Muni, Jimmy Clay, Roy Kizer — whichever you're playing).
**Expect:** Pars + handicaps auto-fill.

**Do:** Set hole value to **$2** (small stakes for testing).
**Expect:** Mechanics section appears.

**Do:** **Enable all four mechanics**: **Hammer**, **Crybaby**, **Birdie Bonus**, **Pops**. Leave presses off (DOC doesn't use them).
**Expect:** All four toggles green.

**Do:** Leave privacy set to **Public** (we'll test private in Phase 3).
**Do:** Tap **Start Round**.
**Expect:** Redirect to `/round?id=...`. Hole 1 ready for score entry. Running money shows $0 for everyone.

**Save the URL.** The `id=...` in the query string is your round ID — you'll need it for some later tests.

---

## Section 2 — Phase 2 capture core

Tests the basic capture pipeline. Do these before touching hammers.

### P2.1 — Happy path ad-hoc capture (~3 minutes)

**Do:** Enter scores for hole 1 manually — e.g. Alice 4, Bob 5, Carol 4, Dave 5. Tap **Submit scores** → **Next hole**.
**Expect:** Advance to hole 2. Totals update to reflect the hole 1 winner.

**Do:** On hole 2, **before entering scores**, look for a small green camera button (📷) in the bottom-right corner of the screen.
**Expect:** Camera FAB visible (only visible because you're the scorekeeper on an active round).

**Do:** Tap the camera FAB.
**Expect:** Full-screen modal opens with "Snap the scorecard" and a **Take photo** button.

**Do:** Tap **Take photo**. On your phone the rear camera opens; on desktop, a file picker opens. Take any photo — a real scorecard is ideal but any image works for smoke testing.
**Expect:** Preview screen with **Retake** / **Use photo** buttons.

**Do:** Tap **Use photo**.
**Expect:** "Reading the card…" screen with shimmer animation for ~5–15 seconds (calling Claude Opus 4.5).

**Do:** Wait for the confirm grid to appear.
**Expect:** A grid of 4 players × 18 holes. Cells the AI read confidently have no decoration. Medium-confidence cells (0.60–0.84) have a yellow underline + ▲ icon. Unreadable cells have a red "?" icon.

**Do:** If any cells are red, tap them and type values manually.
**Expect:** Apply button stays disabled while any red cell is empty; enables after all are filled.

**Do:** Leave **Share to feed** unchecked (ad-hoc default). Tap **Apply**.
**Expect:** Brief "Saving scores…" spinner → "Scores updated" toast → **hammer prompt** step opens (because hammer is enabled on this round).

**Do:** At the hammer prompt for this capture's hole range, tap **No** on "Any hammers?" for each hole. Tap **Continue** through each terminal screen.
**Expect:** "OK. Cool onto Cincinnati." overlay after the first hole, random city after subsequent. Final hole → summary → **Looks good**.

**Do:** After apply completes, check the /round page.
**Expect:** Modal closes. You're back on the round with updated totals.

### P2.2 — Noop re-capture (~1 minute)

**Do:** Without changing any scores, tap the camera FAB again. Walk through the same flow (photo → analyze → confirm).
**Do:** On the confirm grid, don't edit anything. Tap **Apply**.
**Expect:** Toast reads **"Scores unchanged"**. Modal closes silently. No hammer prompt, no dispute dialog. (Server returned `noop: true`; client recognizes there's nothing to apply.)

### P2.3 — Dispute dialog on overwrite (~2 minutes)

**Do:** Tap the camera FAB again. Walk through photo → analyze → confirm.
**Do:** On the confirm grid, **manually change one cell** that currently has a value — pick any player's hole 1 or hole 2 score and set it to something different.
**Do:** Tap **Apply**.
**Expect:** Instead of saving, a new dialog opens titled **"Overwrite current scores?"** with two columns — "Current" / "New" — and your edited cell highlighted.

**Do:** Tap **Overwrite with new**.
**Expect:** Hammer prompt opens (because scores changed) → walk through. Then "Scores updated" toast. Running money reflects the new cell value.

### P2.4 — Low-confidence cell blocks Apply

**Do:** Take a capture of a **deliberately hard-to-read image** — smudged card, bad lighting, or just photograph a random surface. Walk through analyze.
**Expect:** Confirm grid has many red "?" cells, some yellow-underlined cells.

**Do:** Look at the **Apply** button.
**Expect:** Button reads **"Fill red cells first"** and is disabled.

**Do:** Tap a red cell and type a number.
**Expect:** After the last red cell is filled, button re-enables and reads **Apply**.

**Do:** Tap **Cancel** (we don't need to save this junk data).
**Expect:** Modal closes without applying.

### P2.5 — Non-scorekeeper visibility

**Do:** In a second browser window (incognito / private) or on a friend's device, sign in as a different user and join the round as a regular participant (NOT scorekeeper).
**Expect:** The round page loads but:
- **NO** camera FAB in the bottom-right
- **NO** capture prompt banner at the top
- **NO** "Fix hammers" button

**Do:** Scores you enter on the scorekeeper side should still update on the participant's screen via realtime.
**Expect:** Live updates visible without refresh.

---

## Section 3 — Phase 2.5 hammer scenarios

This is the money-math correctness section. P2.5.3 is the single most important test in this document.

### P2.5.1 — No hammer on a hole (1 tap)

**Do:** Advance to a hole where no one used the hammer. Enter scores manually, tap Submit + capture via FAB.
**Do:** In the hammer prompt, tap **No** on "Any hammers on hole N?".
**Expect:** Terminal screen: "No hammer. Winner by score at 1× hole value."
**Do:** Tap **Continue**.
**Expect:** "OK. Cool onto Cincinnati." overlay (if first hole of this capture) OR a random city.
**Do:** Wait for the transition to auto-dismiss, then tap **Looks good** on the summary.
**Expect:** Running money updates by exactly 1× hole value for the stroke winner.

### P2.5.2 — Depth 1 accepted, scored out (4 taps, 2× multiplier)

**Scenario to play:** One team throws the hammer on a hole. The other team accepts. Neither side hammers back. Hole is scored normally at 2× value.

**Do:** Play the hole that way. Enter scores. Tap Submit + capture via FAB.
**Do:** Hammer prompt: tap **Yes** on "Any hammers?". Tap the team card for whoever threw first.
**Expect:** "{other team}'s response?" with [Accepted] [Laid down].
**Do:** Tap **Accepted**.
**Expect:** "Did {previous responder} hammer back?" with [No — score it out] [Yes — hammer back].
**Do:** Tap **No — score it out** (the subtitle should say "at 2× the hole value").
**Expect:** Terminal: "Scored out at depth 1. Winner by score at 2× hole value."
**Do:** Continue → Looks good.
**Expect:** Running money for the winning team = 2× hole value × 2 players = **4 × hole value** per team total.

### P2.5.3 — ⚠️ CRITICAL: Depth 2 lay-down overrides stroke winner

**This is the test that proves Phase 2.5's correctness rule.** If this fails, stop and report immediately.

**Scenario to play:** Arrange actual strokes so Team A would **win by score** (e.g. a Team A player shoots a 3 on the hole, both Team B players shoot 5+). Then simulate this hammer sequence during play:
- Team A throws hammer at depth 1
- Team B accepts
- Team B hammers back at depth 2
- Team A **lays down** (concedes at depth 2)

**Do:** Enter the actual scores showing Team A's better numbers. Tap Submit + capture via FAB.
**Do:** Hammer prompt: **Yes** → pick **Team A** as first thrower → **Accepted** (B's response) → **Yes — hammer back** (B hammers back at depth 2) → **Laid down** (A's response).
**Expect:** Terminal screen: "**{Team B} wins — {Team A} laid down at depth 2. 2× hole value**."
**Do:** Continue → (Cincinnati or another city) → Looks good.
**Expect:** **Running money goes to Team B at 2×**, even though Team A shot better by stroke.

If the money moves to Team A because of their lower scores, **this is a Phase 2.5 correctness failure.** Screenshot + report. The scoreboard should reflect the lay-down, not the strokes.

### P2.5.4 — Gross birdie compounds with hammer multiplier

**Scenario:** On a par 4, one player on the **winning team** shoots a 3 (gross birdie). The hole also had a depth-1 accepted + scored-out hammer.

**Do:** Enter scores (with the 3 for the winning-team player). Tap Submit + capture. In hammer prompt: **Yes** → thrower → **Accepted** → **No — score it out**.
**Expect:** Hammer multiplier = 2×. Birdie multiplier = 2× (default). Net multiplier = **4×**.
**Expect:** After Apply, a **second toast** appears: "Birdie bonus on hole N → {player name} — 2× multiplier. Tap to correct." Auto-dismisses after ~4s.
**Expect:** Running money moves by 4× hole value per player × team size.

### P2.5.5 — Retro "Fix hammers" path

**Do:** After you've captured several holes, tap the small **🔨 Fix hammers** button in the bottom-**left** corner of the round page.
**Expect:** Modal opens showing every played hole with its current hammer state summarized.

**Do:** Tap **Edit** next to any hole that shows "No hammers".
**Expect:** Hammer prompt opens for that hole, pre-populated with the existing (empty) state.

**Do:** Walk through the prompt — change the answer (e.g. "Yes" → thrower → "Laid down"). Continue → Cool-onto-X transition → Looks good.
**Expect:** "Hammers updated" toast fires. Running money recomputes for the edited hole. Stroke scores **are not** changed.

---

## Section 4 — Phase 3 social layer

Best done with a second browser session (friend or incognito) following your round. If solo, P3.1, P3.2, P3.5, P3.6 still work from your own scorekeeper view.

### P3.1 — Live standings panel (participant view)

**Do:** On your round page, tap the live-feed icon / Broadcast link (the radio-tower icon in the header).
**Expect:** Feed modal opens. **Sticky panel at the top titled "Standings · DOC"** with every player listed.

**Do:** Look at each player's row.
**Expect:**
- Name on the left
- Stroke indicator in the middle: **▲ +N in red** for over par, **▼ −N in green** for under par, **• E** for even, **— —** for no score
- Money column on the right: **+$X in green** for winners, **−$X in red** for losers, **$0** in muted gray for even

**Do:** Tap the "Standings" header.
**Expect:** Panel collapses (rows hidden). Chevron flips. Tap again → rows return.

**Do:** Capture a hole. Wait for apply to complete + the "Scores updated" toast.
**Expect:** Within ~2 seconds, standings panel re-renders with the new money + strokes — no manual refresh.

### P3.2 — Capture cards in live feed (participant view)

**Do:** After applying a capture, look at the feed modal below the standings panel.
**Expect:** At the top, a **capture card** with:
- Photo thumbnail (or 📷 placeholder if upload failed)
- "📷 Capture · Hole N" badge + relative timestamp
- If money shifted, a big headline like "**Grant +$40 on hole 14**" colored green (winner) or red (loser)
- "New strokes:" line with per-player stroke deltas (e.g. "Grant +4, Said +5")
- "Money:" line with running totals sorted descending

**Do:** If the capture hit a hole that had a hammer, look for a small badge next to the hole chip.
**Expect:** Yellow "🔨 1 hammer" or "🔨 2 hammers" badge.

**Do:** Tap the photo thumbnail.
**Expect:** Full-screen modal opens with the photo at full resolution. On mobile, pinch-to-zoom works. Tap outside the image or the X to close.

### P3.3 — Main feed tiles (follower view)

**Do:** Switch to the second browser session (a friend who follows your round, or an incognito second account you've friended and added as a follower).
**Do:** Visit `/feed`.
**Expect:** Under the active broadcast round's section, up to **3 recent capture tiles** appear above the legacy event list.

**Do:** Look at a tile.
**Expect:** Small photo thumb + "📷 Capture" badge + "Grant · Lions Muni" (scorekeeper name · course) + "Hole N captured · Grant +$40" summary.

**Do:** Tap a tile.
**Expect:** Navigates to `/watch?roundId=...` — the live spectate view.

### P3.4 — Private round does not leak

**Do:** Back on your scorekeeper device, start a **new** DOC round. On the setup wizard's privacy step, select **Private**.
**Do:** Play + capture a hole.
**Do:** Switch to the follower session. Visit `/feed`.
**Expect:** Nothing from the private round appears. No tile, no live-round section for it.

**Do:** On the scorekeeper session, toggle the private round's sharing off completely (or end the round).
**Expect:** No feed leak retroactively.

### P3.5 — 5 rapid captures produce 1 feed tile

**Do:** On a public broadcast round, capture 5 scorecards back-to-back within 30 seconds. Each one can have tiny or no score changes — the scenario is about frequency.
**Do:** On the follower's `/feed`, look at this round's section.
**Expect:** Exactly **ONE** capture tile, not five. (The other four landed in the audit log but were debounced from the feed.)

**Optional verification via Supabase:** If you want proof, open https://supabase.com/dashboard/project/rrgjqhevwffghvelgljm/editor → **round_events** table → filter `round_id = <your round id>` and `event_type = capture_applied`. You should see 5 rows; only 1 has `event_data.feed_published_at` populated (the others show `null`).

### P3.6 — 31-second gap publishes both

**Do:** Capture, wait more than 31 seconds, capture again.
**Expect:** On the follower's feed, both tiles appear (the 30-second debounce window expired between them).

---

## Section 5 — Cincinnati transition

Quick rhythm check. Runs during Section 3's hammer prompts automatically — this section just verifies the specifics.

### P5.1 — Cincinnati always first

**Do:** Start a new capture that covers hammer-eligible holes. Walk the hammer prompt for the **first** hole of that capture session (whatever that hole is).
**Expect:** After the terminal screen's **Continue** tap, a full-bleed overlay appears with:
- Deep golf green background
- Large Pacifico-script text: **"OK. Cool onto"**
- Below it, **"Cincinnati."** in Masters-gold color
**Expect:** Overlay fades in quickly, lingers ~1.5 seconds, fades out.

### P5.2 — Subsequent holes use random cities

**Do:** On the second hole of the same capture, walk the prompt → Continue.
**Expect:** Overlay appears with a random non-Cincinnati city — **Toledo**, **Duluth**, **Muncie**, **Poughkeepsie**, **Kalamazoo**, etc. (Full list of 20 in `src/components/capture/hammer/transitionCities.ts`.)

**Do:** On the third hole, Continue.
**Expect:** A third, different city. No repeats within the same capture session (unless you capture more than 20 holes, which shouldn't happen in practice).

### P5.3 — Tap to dismiss early

**Do:** When the overlay appears, tap anywhere on it immediately.
**Expect:** Overlay dismisses right away — no 1.5-second wait. Advances to the next hole's prompt (or summary if it was the final hole).

### P5.4 — Final hole also triggers a transition

**Do:** On the last hole of your capture's range, Continue after the terminal screen.
**Expect:** City transition still appears (don't skip the final one). After the overlay dismisses, the **summary screen** appears with all holes listed.

---

## Section 6 — Round completion flow

Verifies the three round-completion fixes (Bug 1 silent-failure + retry carry-over, Bug 2 pre-completion photo gate, Bug 3 post-completion "Fix scores / add photo").

### P6.1 — Solo round completes (~2 minutes)

**Do:** Go to Keep Score → pick a course → enter any 18 hole scores → tap **Finish Round ⛳**.
**Expect:**
- Button briefly shows "Saving…" then navigates to `/feed`.
- Round appears in the feed with `status=completed`.
- (If it fails) A destructive **toast** appears with the error message — no silent flicker-and-return.

### P6.2 — DOC round hits the pre-completion photo gate

**Do:** Play a DOC round to hole 18; enter the 18th hole's scores.
**Expect:**
- A modal titled **"One more thing ⛳"** appears with two buttons: **Take Photo** and **Skip photo (add later)**.
- The modal is not dismissable via tap-outside or ESC — only the two CTAs close it.
- Settlements DO NOT save until you choose.

### P6.3 — Take Photo path clears the gate

**Do:** In the gate, tap **Take Photo**.
**Expect:**
- Gate closes; capture flow opens covering holes 1–18.
- Shoot the scorecard, confirm, Apply.
- Apply succeeds → settlements save → completed-round view renders.
- `rounds.needs_final_photo` stays `false` (default).

### P6.4 — Skip photo path sets the flag

**Do:** In the gate, tap **Skip photo (add later)**.
**Expect:**
- Button shows "Skipping…" briefly.
- Gate closes; settlements save; completed-round view renders.
- `rounds.needs_final_photo` is now `true` in the DB.
- The completed view shows an **amber "Add scorecard photo"** button (prominent), not the subtle default.

### P6.5 — Post-completion "Fix scores / add photo"

**Do:** On a completed round with `needs_final_photo=false`, scroll to the bottom of the completion screen.
**Expect:**
- Subtle secondary button labeled **"Fix scores / add photo"** above "Go to Feed →".
- Tapping it opens the capture flow covering holes 1–18 with trigger `post_round_correction`.
- After a successful apply, settlements are **rewritten** (check for any changed amounts); if `needs_final_photo` was `true`, it flips to `false` and the button reverts to the subtle styling.

### P6.6 — Completion failure shows Retry (no auto-loop)

**Do:** This one's hard to trigger deliberately — simulate by going offline right as you enter hole 18's final score (airplane mode on).
**Expect:**
- Destructive toast: "Couldn't finalize round" with a **Retry** button.
- Toast does NOT re-fire every second (no auto-retry loop).
- Tap **Retry** with connection restored → exactly one retry attempt. On success, settlements save + completed view renders.

### P6.7 — Retry works after settlement-only failure

**Do:** Harder to reproduce; triggered if `completeRound` succeeds but `insertSettlements` fails.
**Expect:**
- Toast: "Couldn't save settlements — Round finalized. Tap Retry to save settlement amounts."
- Tap Retry → second attempt runs. `completeRound` is called again (idempotent — already `status='completed'`) then settlements insert retries.

**Non-scorekeeper:** The gate and the "Fix scores" CTA should both be **invisible** to non-scorekeeper participants.

---

## Section 7 — Profile rounds list + round detail + stats polish (PR #12)

Verifies the three profile-dashboard improvements: rounds list with recent/month/year hierarchy, round detail drill-down, and stats page polish.

### P7.1 — Profile cumulative P&L header

**Do:** Open `/profile` with at least one money round in your history.
**Expect:**
- Section at top showing **"Cumulative P&L"**, big number (green if positive, red if negative, muted `—` if zero), round count below.
- Filter dropdown on the right: All-time / Last 30 days / Last 90 days.
- Changing the filter recalculates the number AND the round count.

### P7.2 — Recent rounds always expanded

**Do:** Scroll to the "Recent rounds" section.
**Expect:**
- Up to 5 round cards, most-recent-first.
- Each card: date (`Apr 15`, or `Apr 15, 2025` if different year), course, game mode, score + ±par, per-round P&L (hidden if solo/non-money), "With: …" line, "View details →" link.
- Card body is NOT tappable — only the "View details →" link navigates.

### P7.3 — Current-year months collapsed; multi-expand

**Do:** Play at least 6 rounds this year (so overflow into months). Scroll to "Earlier in {year}".
**Expect:**
- Month headers with P&L on the right (e.g. "April 2026 · +$65 ‣").
- Tap a month → expands inline showing all rounds for that month as cards.
- Tap a second month → that one also expands (first stays open).
- Tap the open month again → collapses.

### P7.4 — Prior-year hierarchy

**Do:** Play at least one round in a prior year (data permitting).
**Expect:**
- Year header with cumulative P&L (e.g. "2025 · +$280 ‣").
- Tap → expands showing month headers inside.
- Each month header inside is independently expandable.

### P7.5 — Rounds visibility toggle (own profile)

**Do:** Edit your profile → toggle **off** "Show my rounds to other users" → Save.
**Expect:**
- Your own profile still shows all rounds (self always visible).
- Have a friend open your profile via `/profile/:yourId` → they see a single line: "This user has hidden their rounds."

**Do:** Turn it back on.
**Expect:** Their view reloads with the full rounds list.

### P7.6 — Round detail: back button + scorecard default

**Do:** From any profile rounds list, tap "View details →" on any round.
**Expect:**
- URL is `/round/:id/summary`.
- Top-left **Back** button returns to the previous page.
- Header shows: course, date, game mode, your total score + ±par, P&L badge (hidden for non-money).
- Default view: **Scorecard** — traditional layout with holes 1-9 / OUT / 10-18 / IN / TOT.
- All players in the round appear as rows; your row is subtly highlighted (gold tint).

### P7.7 — Scorecard decorations

**Do:** On the round detail, look at individual score cells.
**Expect:**
- Birdies: small green circle outline.
- Eagles: double-ring green circle.
- Hole-in-one (score=1 on par 3+): **filled gold cell**, ringed.
- Par: plain.
- Bogeys: red square outline.
- Doubles+: filled red square, white text.

### P7.8 — Grid view toggle

**Do:** Tap the **Grid** button in the segmented toggle.
**Expect:**
- Compact horizontal-scroll grid: scores row on top, `±par` row below.
- ±par color-coded: green under, muted at par, red over.
- Tap Scorecard → switches back.
- First tab `aria-pressed="true"`, other `false`.

### P7.9 — Settlement + events

**Do:** On a completed money round's detail page.
**Expect:**
- **Settlement** card below the scorecard with per-player P&L.
- Below that, a **View all events (N)** expandable — tapping shows all round_events in order.

### P7.10 — Stats back button

**Do:** Navigate to `/stats` from the Profile → "View Full Stats Dashboard" button.
**Expect:**
- Top of page has a **Back** button with `ChevronLeft` icon.
- Tapping it returns to the profile (history-back).

### P7.11 — Stats scoring distribution

**Do:** With at least a few completed rounds, scroll to the new **Scoring Distribution** card on `/stats`.
**Expect:**
- If you've ever made a hole-in-one: prominent **🎉 Career holes-in-one: N** badge above the pie.
- Pie chart with 6 colored slices: Eagle / Birdie / Par / Bogey / Double / Triple+.
- Legend table to the right (below on narrow phones) with raw counts + percent of total.
- Total row: "Total {count} holes".
- Percentages sum to ~100%.
- If you have no scored holes yet, a friendly "No scored holes yet" message instead of a broken chart.

---

## Troubleshooting

### Common failure modes

| What you see | Likely cause | What to do |
|---|---|---|
| Camera FAB not visible | You're not the scorekeeper, OR round status isn't active, OR a capture is already open | Check round setup; confirm your row has the scorekeeper badge |
| "Forbidden: not the scorekeeper" toast | Server auth check on extract-scores or apply-capture failed | Screenshot; confirm your user_id matches the round's scorekeeper row |
| Hammer prompt never appears after Apply | Round doesn't have the hammer mechanic enabled | Go back and confirm hammer was toggled on in setup |
| "OK. Cool onto Cincinnati" overlay stuck on screen | Timer didn't fire (rare) | Tap anywhere on it to dismiss |
| Capture grid has zero scores extracted | Photo was too blurry / wrong angle, OR Anthropic API rate limited | Tap Cancel; enter scores manually; try another capture later |
| "Scores unchanged" when you meant to overwrite | You edited a cell to the same value it already had | Edit to a genuinely different value |
| Standings panel shows $0 for everyone after a capture | Capture applied but realtime subscription didn't propagate | Reload the round page — last-known state will persist |
| Feed tile shows for a private round | Server-side privacy check failed | **This is a bug — screenshot the feed and the round's setup page. Report immediately.** |
| Depth-2 lay-down moves money to wrong team | Phase 2.5 correctness rule violated | **Highest-severity bug. Screenshot + note which team had the lower score + which team threw. Report immediately.** |

### What to capture when something breaks

1. **Screenshot the moment it breaks** — the whole screen, not just the bad element.
2. **Note the test number** (e.g. "P2.5.3 step 4").
3. **Note what you tapped last** ("tapped Apply on the confirm grid").
4. **Note what you expected vs. what you saw** — use the checklist's Expect language.
5. **Console errors**: on iPhone Safari, go to **Settings → Safari → Advanced → Web Inspector**, then plug into a Mac and look at the console. On desktop, open DevTools (Cmd+Option+I).
6. **Round ID** — the `id` query param from the URL. Helps trace the round in Supabase.

### Starting a fresh round if something goes sideways

If a round gets into a bad state and you want to abandon it:

**Do:** From the round page, look for a **cancel / leave round** option (usually in the header menu or settings icon).
**Do:** Confirm cancellation.
**Expect:** Round status flips to `canceled`; running money zeros out; navigation returns to `/feed`.

If there's no cancel button visible (older unresolved edge case), you can start a new round from `/setup` — the app loads the most recent active round on next visit, but you can explicitly navigate to `/setup` to begin fresh.

Orphan data risk is low: every capture row, score, and settlement is tied to `round_id`. Canceling the round doesn't delete its data (RLS keeps it visible to participants/admins), it just marks the round dead.

---

## Report template

Copy one of these and fill in. Paste into a chat / email / Slack. I'll triage from there.

### Bug report

```
## Bug

**Test:** P2.5.3 (or whichever)
**Device:** iPhone 15 Pro, Safari / Chrome on Mac / etc.
**Round ID:** [paste from URL]
**Round setup:** DOC, hammer + crybaby + birdie_bonus + pops enabled, $2 hole value, 4 players

**Step that failed:** [which numbered step in the test]

**What I saw:**
[screenshot attached / textual description]

**What I expected:**
[paste the Expect: line from the checklist]

**Console errors (if any):**
[paste text or screenshot]

**What I tapped last:**
[e.g. "Tapped Apply button on confirm grid after editing Alice's hole 3 from 4 to 3"]
```

### Success report

```
## Pass

**Test:** P2.5.3
**Outcome:** ✅ Team B won the hole at 2× despite Team A shooting lower. Running money updated correctly.
**Notes:** [anything notable about timing, UX smoothness, etc.]
```

### Full-run report (end of session)

```
## On-course test summary

**Rounds played:** 1
**Holes played with capture:** 8
**Holes where I used the hammer:** 3
**Weird moments:** 1 (describe below)

**Results:**
- Section 1 (setup): ✅
- P2.1 happy path: ✅
- P2.2 noop: ✅
- P2.3 dispute: ✅
- P2.4 low-confidence: ✅ / 🟡 / ❌
- P2.5 non-scorekeeper: skipped (no second device)
- P2.5.1 no hammer: ✅
- P2.5.2 scored out 2×: ✅
- P2.5.3 CRITICAL lay-down: ✅ (or 🚨 if failed)
- P2.5.4 birdie: ✅
- P2.5.5 Fix hammers: ✅
- P3.1 standings: ✅
- P3.2 capture cards: ✅
- P3.3 main feed: skipped (no follower)
- P3.4 private: skipped
- P3.5 debounce: ✅
- P3.6 gap: skipped
- P5 Cincinnati: ✅
- P6.1 solo completes: ✅
- P6.2 gate appears on hole 18: ✅
- P6.3 Take Photo path: ✅
- P6.4 Skip sets flag + amber CTA: ✅
- P6.5 post-completion Fix CTA: ✅
- P6.6 completion failure Retry (no auto-loop): ✅ / skipped
- P6.7 settlement-only Retry: skipped (hard to repro)
- P7.1 cumulative P&L header: ✅
- P7.2 recent rounds always expanded: ✅
- P7.3 current-year months collapse/expand: ✅
- P7.4 prior-year two-level hierarchy: ✅ / skipped
- P7.5 rounds_visible_to_friends toggle: ✅
- P7.6 round detail back + scorecard default: ✅
- P7.7 scorecard decorations (birdie/eagle/ace/bogey/double): ✅
- P7.8 grid view toggle: ✅
- P7.9 settlement + events disclosure: ✅
- P7.10 stats back button: ✅
- P7.11 stats scoring distribution pie: ✅

**Bugs to file:**
- [Paste bug reports above]

**Notes on UX:**
- [Anything felt slow / confusing / delightful / broken]
```

---

**Checklist last updated:** 2026-04-20 after PR #16 (Flip mode full implementation). Section 8 added for the end-to-end Flip round — setup, base-game play, rolling-window forfeits, crybaby transition, crybaby sub-game, settlement, post-round correction, and the all-square edge case.

---

## Section 8 — Flip mode (full 5-man 3v2 + crybaby)

Added for PR #16. Run this section on your next 5-man round. It covers every state transition in Flip — if anything in F8.1–F8.8 deviates from "Expect," file a bug before continuing the round.

**Prereqs:** 5 real (signed-in) players, one is you (scorekeeper). Pick a course with all 18 holes. Agree on stakes before you start (base bet $2 or $4, window size 2 or "all" recommended).

### F8.1 — Setup walkthrough (~5 minutes, do once before tee-off)

**Do:** `/feed` → Start Action.
**Expect:** Setup wizard step 1.

**Do:** Look at the game picker. Tap **Flip**.
**Expect:** Flip is visible and selectable. Tap Continue.

**Do:** Add 5 players (you + 4 others). Try to add a 6th.
**Expect:** 6th-player attempt blocked with "Flip locks at 5 players" — confirms the 5-player cap from C2.

**Do:** Advance to course + mechanics. Set base bet to **$4** (must be even). Set carry-over window to **2**.
**Expect:** Both fields accept the values; odd values (e.g., $3) are rejected with a validation message. Hammer mechanic is available (Flip supports hammer).

**Do:** Tap **Start Round**.
**Expect:** Redirect to the round. The initial **FlipReel** animation plays and lands on the first 3v2 split. Teams lock in. Hole 1 ready for score entry. Running money shows $0 for everyone.

### F8.2 — Base game flow (holes 1-15, ~45 minutes during play)

**Do:** Score hole 1 as a **push** (every player same score).
**Expect:** Hole resolves with "Push. Pot carries to next hole." quip. Running money shifts: every player shows **−$4** (flat ante per push per player, Model C).

**Do:** Advance to hole 2. Look at the teams badge at the top of the hole row.
**Expect:** **Same teams as hole 1** — pushes don't re-shuffle. Flip button is disabled with a tooltip saying "Teams stay after a push."

**Do:** Score hole 2 as **decided** (one team clearly has the best net score).
**Expect:** Winning team gets positive delta, losing team negative. Pot claims from the window — the hole-1 push money flows into winners' balances.

**Do:** Advance to hole 3. Flip button is now **enabled** (decided hole triggers a re-shuffle offer).
**Expect:** Tap the Flip button. FlipReel plays a short shuffle animation and lands on new teams. Badge updates with the new split.

**Do:** Repeat through hole 15. Mix pushes, decided holes, and at least one **hammer throw** if you have the appetite.
**Expect:** On a hammer throw at depth 1, the effective bet doubles (B × 2). If folded, the thrower at depth wins regardless of scores (release gate from Phase 2.5).

### F8.3 — Rolling window forfeit verification (~5 minutes)

This exercises the forfeit path. Only run if your window is set to 2.

**Do:** Engineer 3 consecutive pushes somewhere in holes 1-15 (pick a tee box, everyone makes the same net score).
**Expect:** After the 3rd consecutive push, the hole summary shows **"$X fell into the ether"** — this is the oldest push being evicted. The window now holds only the 2 most-recent pushes.

**Do:** Next hole after the forfeit, score a decided hole.
**Expect:** Winner claims ONLY the most-recent 2 pushes (not all 3). The forfeited money is never paid out — it's gone.

### F8.4 — Crybaby transition (hole 15 → 16, ~2 minutes)

**Do:** Finish hole 15. Advance to hole 16.
**Expect:** Instead of the normal score-entry panel, the **Crybaby Transition Screen** renders. It shows:
- Each player's hole-15 balance, sorted most-negative first
- The crybaby is announced (most-negative player, or deterministic tiebreaker if tied)
- **Max bet cap math**: `floor(losingBalance / 2)` rounded down to the nearest even dollar, min $2

**Do:** If multiple players are tied for most-negative, watch the coin-flip animation.
**Expect:** The reel animates for ~1 second and lands on one of the tied players. If you reload the page and re-run, it picks the SAME player (seeded by round.id, deterministic).

**Do:** Tap **Enter Crybaby Phase**.
**Expect:** Transition to hole 16 scoring.

### F8.5 — Crybaby hole flow (holes 16-18, ~15 minutes)

**Do:** At hole 16, look at the crybaby setup panel.
**Expect:** Crybaby's name is shown. Bet picker defaults to max; you can step down in $2 increments to min $2. Partner picker shows the **other 4 players** (crybaby is excluded from partner options).

**Do:** Pick a partner + set a bet. Look at the stakes preview.
**Expect:** "If 2-man wins: +$X each for {crybaby, partner}, −$Y each for the 3-man team." "If 3-man wins: +$Z each for 3-man, −$bet each for 2-man." Numbers match `calculateCrybabyHoleResult` math (opponentStake = bet/3 rounded to even dollar, min $2).

**Do:** Check the hammer button.
**Expect:** If you (scorekeeper) are on the 2-man team, hammer is **enabled**. If you're on the 3-man team (or a non-player), hammer is **disabled** with a tooltip: "Only the crybaby + partner can throw a hammer."

**Do:** Confirm setup. Enter scores for all 5 players. Resolve the hole.
**Expect:** 2-man-wins: +$15/−$10 at $30 bet (or ratio for your chosen bet). 3-man-wins: +$20 loser-math at $30 bet.

**Do:** Repeat for holes 17 and 18.

### F8.6 — Round completion (~2 minutes)

**Do:** Finish hole 18. Advance.
**Expect:** Round completes. Settlement screen shows each player with a card containing **three lines**:
- Combined total ($X)
- **Base game (1-15)**: $Y
- **Crybaby (16-18)**: $Z

where `Y + Z == X` for every player. Numbers match what you saw during live play (hole-by-hole money should sum to these).

**Do:** Open the profile round-card for this round (on your profile, in the recent rounds list).
**Expect:** Card shows the **combined** total only (split is in the detail view, not the list).

**Do:** Tap through to round detail (/round/:id/summary).
**Expect:** The three-line breakdown renders under the Settlement section. The Base/Crybaby lines use smaller muted text; combined total is bolded.

### F8.7 — Post-round correction (~5 minutes, only if a score was wrong)

**Do:** From the round detail page (or the completion screen), tap **Fix scores / add photo** and correct a hole 1-15 score.
**Expect:** Apply-capture re-runs. The settlement card refreshes. **Only `base_amount` changed** for affected players; `crybaby_amount` is identical to before. Combined `amount` = base + crybaby.

**Do:** Correct a hole 16-18 score (change a crybaby hole's outcome).
**Expect:** **Only `crybaby_amount` changed**; `base_amount` is identical to before. Combined `amount` updated.

**Note:** If the correction changes hole 15 such that the crybaby designation would change, **it doesn't re-designate** — apply-capture preserves the original `crybabyState.crybaby` (matches the `hammerHistory` preservation pattern). This is by design; a re-designation would require a separate "reset crybaby" flow and invalidate all hole 16-18 choices.

### F8.8 — All-square edge case (if balances all finish at $0 after 15)

**Do:** If at hole 15 **every player's balance is $0**, advance to hole 16.
**Expect:** Transition screen shows **"All Square — no crybaby this round."** Tapping through lands on hole 16 with the **normal base-game score-entry panel** (same 3v2 teams can be re-flipped, same rolling window, same pot).

**Do:** Play holes 16, 17, 18 as base-game continuation.
**Expect:** Holes 16-18 score exactly like holes 1-15 — no asymmetric payouts, no bet picker, no partner picker. On the settlement screen, the per-player card shows `Crybaby (16-18): $0` explicitly (not "—" / missing data). Combined total includes all 18 holes of base-game money.

### Flip mode — report-back template

Copy/paste into a bug report or checkpoint. Mark ✅ / ❌ per item:

```
Date:
Course:
Players (5):
Base bet:
Window size:

- F8.1 setup walkthrough (game picker, 5-player cap, even-bet validation): ✅ / ❌
- F8.2 base game flow (push persists teams; decide re-enables flip button): ✅ / ❌
- F8.3 rolling window forfeit ("$X fell into the ether"): ✅ / ❌
- F8.4 crybaby transition screen (standings, cap math, tiebreaker reel): ✅ / ❌
- F8.5 crybaby hole flow (bet picker max, partner exclusion, hammer gate): ✅ / ❌
- F8.6 settlement three-line breakdown (base + crybaby + combined): ✅ / ❌
- F8.7 post-round correction (base-only update preserves crybaby; crybaby-only update preserves base): ✅ / ❌ / skipped
- F8.8 all-square sentinel (holes 16-18 as base continuation; crybaby_amount = $0): ✅ / ❌ / skipped

Bugs to file:
- [Paste bug reports above]

Notes on UX:
- [Anything felt slow / confusing / delightful / broken]
```

---

**Checklist last updated:** 2026-04-20 after PR #16 (Flip mode full implementation). Section 8 added for the end-to-end Flip round — 8 sub-scenarios covering setup through all-square edge case.
