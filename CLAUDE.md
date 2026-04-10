# Crybaby Golf — Claude Code Context

Golf scoring + social app. React + TypeScript + Vite + Supabase + Capacitor (iOS).
Live at: https://crybaby.golf
Repo: https://github.com/bjonathanosborne/crybaby-app

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind, shadcn/ui |
| Backend | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) |
| Mobile | Capacitor (iOS build in `/ios`) |
| Deploy | Render (web), App Store pending |

---

## Project Status (as of 2026-04-10)

Targeting App Store submission. Core features complete. Recent QA pass identified and fixed 8 bugs (see below).

**What's done:**
- Scoring flows for all game modes (DOC, Skins, Nassau, Wolf, Flip)
- Live round broadcasting + spectator view
- Friend network + friend feeds
- Social feed with posts, comments, reactions
- Admin panel (role toggle, user management)
- Google Sign-In + email/password auth
- iOS Capacitor build
- Supabase backend fully wired

**Still needed for App Store:**
- App Store screenshots (6 screens, iPhone 16 Pro Max / 6.7-inch)
- `PrivacyInfo.xcprivacy` added to Xcode project (file exists at `ios/App/App/PrivacyInfo.xcprivacy`, needs to be added to Xcode target)
- Signing & Capabilities → set Team in Xcode
- Product → Archive → upload to App Store Connect

---

## Key Files

```
src/
  pages/
    CrybabyActiveRound.jsx   -- core scoring UI (2031 lines) — most critical
    CrybabySetupWizard.jsx   -- round setup flow
    CrybabyFeed.jsx          -- social feed + active round banner
    ProfilePage.tsx          -- current user profile
    UserProfilePage.tsx      -- other user profiles
    FriendsPage.tsx          -- friend management
    RoundSpectateView.jsx    -- live spectator mode
    AuthPage.tsx             -- login / sign up
  lib/
    db.ts                    -- all Supabase queries (1250 lines)
    gameEngines.ts           -- scoring logic for all game modes (621 lines)
  components/
    AppLayout.jsx            -- bottom nav + layout wrapper
    RoundLiveFeed.tsx        -- live event feed component
  contexts/
    AuthContext.tsx          -- auth state
  App.tsx                    -- routing
```

---

## Game Modes

| Mode | Description |
|------|-------------|
| `drivers_others_carts` (DOC) | Teams rotate every 5 holes (Drivers / Others / Carts / Crybaby) |
| `skins` | Individual — lowest net score wins skin, ties carry over |
| `nassau` | Match play — 3 separate bets: front 9, back 9, overall |
| `flip` | Random team assignment each round via coin flip |
| `wolf` | One player is "wolf" per hole, picks partner or goes lone wolf |
| `custom` | Free-form |

### Mechanics (optional overlays)
- **Hammer** — team can double the hole value; opponent accepts or folds
- **Crybaby** — last 3 holes (16–18), player most in the hole gets a redemption bet
- **Birdie Bonus** — gross birdie doubles the hole value
- **Pops (Handicaps)** — net scoring using handicap strokes
- **Carry-Overs** — tied holes carry pot to next hole
- **Presses** — Nassau only: start a new match mid-segment

---

## Bugs Fixed (2026-04-10) — commit `c70e78e`

These were all found in a QA pass. Documenting so future sessions know the history.

### Critical (were live in prod before fix)

**1. Round ended after hole 17, not hole 18**
- `CrybabyActiveRound.jsx` — `roundIsComplete` condition was `holeResults.length >= 17`, which fires when entering hole 18 before it's scored
- Settlements were saved with hole 18 missing from the totals (wrong money)
- Completion screen showed one hole too early
- Fixed: changed to `>= 18` in 3 places (roundIsComplete, settlements effect, completion screen)

**2. Wolf game unplayable — modal looped after every partner pick**
- `CrybabyActiveRound.jsx:993` — useEffect had `showWolfModal` in deps; when user picked a partner (modal closed), effect fired and immediately reset `wolfPartner` to null + reopened the modal
- Also: wolf modal and crybaby setup modal would both show simultaneously on hole 16
- Fixed: added `wolfModalShownForHole` state to track which hole the modal was shown for; effect now only triggers when hole changes

### High

**3. "Send Reminders" button was dead (no onClick)**
- `CrybabyActiveRound.jsx` — completion screen button did nothing
- Fixed: wired up Web Share API with clipboard fallback; shares settlement breakdown

**4. Settlements saved after hole 17 (same root as bug #1)**
- Same condition fix — settlements now save after all 18 holes

### Medium

**5. Wolf + crybaby modal conflict on hole 16**
- Fixed by the wolfModalShownForHole approach — wolf modal waits for crybaby setup to dismiss

**6. `reshuffle` interval leaked on unmount in FlipTeamModal**
- Fixed: stored interval in `intervalRef`, cleaned up in useEffect return

**7. `holeValue: 0` silently became 5**
- `|| 5` changed to `?? 5`

**8. "Resume Round" on feed replayed splash screen**
- `CrybabyFeed.jsx:542` — was `window.location.href = ...`, now uses `navigate()`

---

## Known Remaining Issues / Low Priority

- `calculateNassauSettlement()` in `gameEngines.ts` is dead code and returns 0 for team Nassau — not called anywhere, low risk
- Feed loads ALL posts (no friend filter in `loadFeed()`) — may be intentional for small user base; Supabase RLS policies may handle visibility
- No error boundary — unhandled JS errors show blank screen
- Wolf game: carry-overs not supported (always returns carryOver: 0) — may be by design

---

## Dev Setup

```bash
npm install
npm run dev        # localhost:5173
npm run build      # production build
```

**Supabase local:** `supabase start` (requires Docker)

**iOS build:**
```bash
npm run build
npx cap sync ios
open ios/App/App.xcworkspace   # open in Xcode
```

---

## gstack Skills

gstack skills are installed at `~/.claude/skills/`. Available: `/qa`, `/ship`, `/review`, `/investigate`, `/health`, `/checkpoint`, etc.

**Known issue with browse:** The gstack browse server (`$B`) does not persist across separate Bash tool calls. All `$B` commands must run in a single shell invocation. Connect with `$B connect` first; subsequent commands in the same call will use the headed browser. bun must be in PATH: `export PATH="$HOME/.bun/bin:$PATH"`.
