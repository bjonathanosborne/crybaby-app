# Phase 2 deploy + test — quick start

**Status as of 2026-04-19:**
- ✅ PR #3 merged to `main`
- ✅ Edge functions `extract-scores` + `apply-capture` deployed to your Supabase project
- ✅ `ANTHROPIC_API_KEY` confirmed set
- ⏳ Database migrations — needs your action (one minute)

## Step 1 — Apply the database migrations

Two new things land in your database: the `scorecards` storage bucket (for photo uploads) and the `round_captures` table (the audit log). I can't apply these for you because they need your database password.

Easiest path: paste the SQL into Supabase's SQL Editor.

1. Open https://supabase.com/dashboard/project/rrgjqhevwffghvelgljm/sql/new
2. You should see a big text box that says "SQL Editor".
3. Open this file on your laptop: `crybaby-app/supabase/migrations/20260418100000_scorecards_bucket.sql`. Copy its contents, paste into the SQL editor. Click the green **Run** button. You should see "Success. No rows returned."
4. Open the second file: `crybaby-app/supabase/migrations/20260418100100_round_captures.sql`. Copy-paste it into the same editor (replacing the first one). Click **Run**. Again: "Success. No rows returned."

**If either errors out with "already exists":** that's fine, the object was created on a previous run. Ignore.

**If you see any other error:** stop and paste it to me.

## Step 2 — Verify the setup

One more paste into the SQL editor to confirm everything landed:

```sql
SELECT
  (SELECT COUNT(*) FROM storage.buckets WHERE id = 'scorecards') AS scorecards_bucket,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'round_captures') AS round_captures_table,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'is_round_scorekeeper') AS scorekeeper_helper,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'is_round_viewer') AS viewer_helper;
```

You should see:
```
scorecards_bucket | round_captures_table | scorekeeper_helper | viewer_helper
------------------|----------------------|--------------------|--------------
1                 | 1                    | 1                  | 1
```

Four 1s. Four columns. If any column is 0, that object didn't get created — tell me which one.

## Step 3 — Manual smoke test on the live app

Everything below happens in the Crybaby Golf web app. No SQL. No Supabase dashboard. Just the app.

### Setup a test round

1. Go to https://crybaby.golf on your phone (or laptop browser with a camera).
2. Sign in if you're not already.
3. Tap **Start Action** on /feed.
4. Pick **Nassau** (it's the simplest for this test — no hammer/crybaby complications yet).
5. Pick any course. Set hole value to `$2`. Set stakes to whatever.
6. Add 4 players — you as player 1 (scorekeeper is you automatically), and three others (can be "guest" names; they don't need to be signed in).
7. Make sure **you** are marked as the scorekeeper. Usually this is the default for the person starting the round.
8. Start the round.

### Test 1 — Happy path ad-hoc capture (~3 minutes)

1. You should be on the round page, hole 1.
2. **Look at the bottom-right corner of the screen.** You should see a small green camera button (📷). That's the ad-hoc capture FAB.
3. **Look at the top of the screen.** You should NOT see a yellow "Photo needed" banner. (Nassau doesn't require photos until hole 9.)
4. Enter scores for hole 1 manually — let's say Alice 4, Bob 5, Carol 4, Dave 5. Tap **Submit scores**, then **Next hole**.
5. You should be on hole 2. Good — the app lets you advance without a photo.
6. Now tap the **camera button** (bottom-right).
7. A big full-screen modal should open with "Snap the scorecard" and a "Take photo" button.
8. Tap **Take photo**. On your phone, your camera opens. On desktop, a file picker opens. Either way: take or pick any photo. It doesn't even need to be a real scorecard for this test — any photo.
9. You should see a preview with **Retake** / **Use photo** buttons. Tap **Use photo**.
10. You should see the "Reading the card…" screen with a shimmer animation for 5–15 seconds. (It's calling Claude's vision API.)
11. Next screen: a grid of all 4 players × 18 holes with scores filled in (wherever the AI could read) and empty cells (wherever it couldn't, or wherever there was nothing to read).
12. **Don't worry if the scores are wrong or mostly empty** — this is a smoke test. The photo wasn't a real scorecard.
13. Below the grid you should see a toggle: **Share to feed** (unchecked by default — that's correct for ad-hoc).
14. Tap **Apply**. Expect: a brief "Saving scores…" spinner, then a toast that says something like "Scores updated" or "Applied to the round." The modal closes.
15. ✅ **What just happened:** a capture row was written to your DB, the photo uploaded to the scorecards bucket, and any changed scores were applied to the round. All without leaving the app.

### Test 2 — Noop re-capture (~1 minute)

Without changing anything on the round page:

1. Tap the **camera button** again.
2. Walk through the same flow. Take another photo. Go to confirm grid.
3. Tap **Apply** without editing anything.
4. Expect: a toast that says **"Scores unchanged"** and the modal closes silently. No dispute dialog appears.
5. ✅ **What just happened:** the server saw no difference between the new capture and what's already applied, so it skipped the save but still logged the capture row for audit.

### Test 3 — Dispute dialog on overwrite (~2 minutes)

1. Tap the **camera button** again.
2. Walk through the flow. On the confirm grid, **manually change one score** — tap any cell with a number and type a different value.
3. Tap **Apply**.
4. Expect: instead of saving, a new dialog appears titled **"Overwrite current scores?"** with two columns — "Current" / "New" — and your edited cell highlighted.
5. Tap **Overwrite with new**.
6. Expect: "Scores updated" toast, modal closes. The running money totals on the round page should reflect the new value.
7. ✅ **What just happened:** the server detected your edit was different from the applied state, the client showed you the diff, and you confirmed the overwrite.

### Test 4 — Non-scorekeeper view (optional, ~2 minutes)

If you can, have a friend (or a second incognito/private window) sign in as a different user and join the round as a participant:

1. They should NOT see the camera button.
2. They should NOT see any capture prompt banner.
3. They can still see scores update in real time as you capture.

### Test 5 — Game-driven capture on hole 9 (Nassau) (~5 minutes)

1. On your main scorekeeper session, play through holes 2-9 normally (enter scores, advance).
2. After entering hole 9 scores and tapping "Submit scores":
3. **Expect a yellow banner at the top of the screen**: "Photo needed to continue — End of front 9 — photo to settle segment."
4. The Next-hole button should be **disabled**.
5. Tap **Capture now** in the banner.
6. The modal opens in "game-driven" mode. Take a photo. Walk through confirm.
7. Tap **Apply**.
8. Expect: banner disappears; you can advance to hole 10.
9. ✅ **What just happened:** the app recognized Nassau's cadence rule (photo at the turn and finish only), blocked your advance, and unblocked after the capture applied.

---

## When you're done testing

Tell me **"Tested, works"** or give me a specific bug report (what you did, what you saw, what you expected).

Once you confirm Phase 2 works on staging, I start **Phase 2.5** — the sequenced hammer prompt, which is the piece that makes money math correct on hammer rounds.

**What can go wrong:**
- Edge function errors (auth, rate limit) → you'll see a toast with a message; copy it to me.
- Upload errors → you'll see "Photo upload failed — scores will still apply" in the confirm grid. Not blocking.
- Claude misreading scores → expected; the confirm grid is there so you catch and fix it.
- Anything feeling weird / slow / confusing → worth telling me. The capture flow is a new surface; small UX bugs surface here.

No SQL required for any test above. If I ask you to run a query, I'll write it and tell you exactly where to paste it.
