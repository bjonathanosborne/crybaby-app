# Crybaby Golf — App Store Metadata

Copy-paste this into App Store Connect when setting up the listing.

---

## Basic Info

| Field | Value |
|-------|-------|
| **App Name** | Crybaby Golf |
| **Bundle ID** | com.crybabygolf.app |
| **Primary Language** | English (U.S.) |
| **Primary Category** | Sports |
| **Secondary Category** | Social Networking |
| **Content Rating** | 4+ |

---

## Version Info

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Build** | 1 (set in Xcode: MARKETING_VERSION = 1.0.0, CURRENT_PROJECT_VERSION = 1) |
| **Copyright** | © 2026 Crybaby Golf |

---

## App Store Listing Text

### Name (max 30 chars)
```
Crybaby Golf
```

### Subtitle (max 30 chars)
```
Golf's Social Scoring App
```

### Description (max 4000 chars)
```
Crybaby Golf is the social scoring app for golfers who want to track rounds, compete with friends, and settle the score — hole by hole.

SCORE WITH YOUR CREW
Start a round with up to 4 players, assign handicaps, and score every hole in real time. Whether it's a casual Saturday game or a serious match, Crybaby keeps it fun and competitive.

LIVE SPECTATOR MODE
Going out without your crew? Friends can watch your round unfold in real time — see scores update hole by hole, react to big moments, and follow from anywhere.

NEVER LOSE A ROUND
Leave a round mid-game? Come back and pick up exactly where you left off. Your round stays open until you're done.

BUILT FOR THE COURSE
Clean, fast mobile interface designed for quick scoring between holes. No fuss, no lag, just tap and go.

FRIEND NETWORK
Add friends, get notified when they tee off, and build a social feed of everyone's recent rounds. No more "who shot what" group texts.

FEATURES:
• Real-time scoring with net and gross calculations
• Handicap support for every player
• Broadcast your round live to friends
• In-app notifications for friend activity
• Round history and stats
• Google Sign-In
• Works as a home screen app (PWA)
```

### Keywords (max 100 chars, comma-separated)
```
golf,scoring,scorecard,handicap,friends,social,rounds,scorekeeper,golf app,sports
```

### What's New (first release)
```
Welcome to Crybaby Golf! Track scores, compete with friends, and watch rounds live. Version 1.0 — let's play.
```

---

## URLs

| Field | Value |
|-------|-------|
| **Support URL** | https://crybaby.golf |
| **Marketing URL** | https://crybaby.golf |
| **Privacy Policy URL** | https://crybaby.golf/privacy |

---

## Screenshots Needed

Apple requires at minimum **6.7-inch iPhone** screenshots (iPhone 16 Pro Max size).

**Suggested screens to screenshot (6 max shown in listing):**
1. Home feed / dashboard
2. Active scoring screen (hole-by-hole)
3. Scorecard / leaderboard
4. Live spectator view
5. Friend feed
6. Round setup / setup wizard

**How to take screenshots:**
1. In Xcode → open Simulator → Device: iPhone 16 Pro Max
2. Navigate to each screen in the simulator
3. Press `Cmd+S` (or Device menu → Screenshot) to save
4. Upload to App Store Connect under "Screenshots"

---

## Age Rating Questionnaire

Answer **None/No** to all — Crybaby Golf has no:
- Violence, sexual content, or mature themes
- User-generated content visible to others (beyond friend groups)
- Unrestricted web access
- Gambling

**Final Rating: 4+**

---

## Review Notes (for Apple reviewers)

```
Crybaby Golf is a golf scorecard and social app.

Test account for review:
- Sign in with Google (use any Google account)
- No special reviewer credentials needed
- All features accessible after sign-in

The app requires a Supabase backend (already live at crybaby.golf).
Internet connection required.
```

---

## Xcode Steps Before Submitting

1. Open Xcode → Select `App` target → **Signing & Capabilities** → set your Team
2. Set version: `MARKETING_VERSION = 1.0.0`, `CURRENT_PROJECT_VERSION = 1`
   (Project settings → App target → Build Settings → search "version")
3. **Add PrivacyInfo.xcprivacy to Xcode project:**
   - In Xcode's Project Navigator, right-click the `App` folder → "Add Files to App…"
   - Select `ios/App/App/PrivacyInfo.xcprivacy`
   - Ensure "Add to target: App" is checked
4. **Product → Archive** → Distribute App → App Store Connect → Upload
