# Crybaby Golf — Recent Build Sessions

Last updated: 2026-04-13

---

## Session Overview

Three back-to-back sessions covering a full UI rebrand, worldwide course search, admin overhaul, and a solo scorecard feature. ~40 commits across all sessions.

---

## 1. Design System + Branding Overhaul

Took the app from generic shadcn/Tailwind look to a cohesive "warm California golf" identity.

### Typography

| Role | Font | Where |
|------|------|-------|
| Brand / headings | Pacifico (cursive) | Logo, page titles, section labels, nav, empty states |
| Body text | DM Sans (sans-serif) | All UI copy |
| Numbers / codes | JetBrains Mono | Scores, user IDs, stakes |

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#F5EFE0` | Page background (parchment/cream) |
| Card | `#FAF5EC` | Card surfaces, sidebar |
| Border | `#DDD0BB` | Dividers, card borders |
| Primary green | `#2D5016` | Buttons, active states, headings |
| Dark text | `#1E130A` | Primary copy |
| Muted text | `#8B7355` | Secondary copy, timestamps |
| Gold accent | `#D4AF37` | Button text, badges, score highlights |

### Changes Made (chronological)

- Replaced all page headings with Pacifico + primary green across Feed, Friends, Groups, Profile, Setup Wizard, Active Round
- Replaced PNG logo with Pacifico "Crybaby Golf" text in header, splash screen, hamburger menu, and admin
- Added gold text shadow to logo and main headings
- Gold text on green buttons (Masters aesthetic)
- Standardized page headers: `px-5 pt-5 pb-4`, `text-3xl`
- Setup Wizard: green/gold Continue button, breathing room
- Auth page: parchment background, Pacifico logo, green/gold Sign In
- Bottom nav: Pacifico labels, bumped from 11px to 12px
- Notification settings: stripped to bare toggle, Pacifico labels
- Hamburger menu: Pacifico text logo, breathing room in header
- Profile avatar: 72px to 96px
- Removed redundant "Action" header from feed page
- Empty states: Pacifico green titles for no-groups/no-friends/no-rounds

### Files Touched

`AuthPage.tsx`, `AppLayout.jsx`, `HamburgerMenu.tsx`, `NotificationSettings.tsx`, `CrybabyFeed.jsx`, `CrybabySetupWizard.jsx`, `CrybabyActiveRound.jsx`, `ProfilePage.tsx`, `FriendsPage.tsx`, `GroupsPage.tsx`, `tailwind.config.ts`

---

## 2. Worldwide Golf Course Search

Replaced the Austin-only course dropdown with a searchable component backed by an external API.

### Architecture

```
User types → CourseSearch.tsx (debounce 300ms)
  ├─ Always: filter AUSTIN_COURSES local presets (2+ chars)
  └─ If API key: fetch from GolfCourseAPI.com (3+ chars)
       └─ On select: fetch full course detail → normalize to AppCourse
```

### API: GolfCourseAPI.com

- ~30,000 courses worldwide
- `GET /v1/search?search_query={query}` — returns name, city, state, country
- `GET /v1/courses/{id}` — returns full detail with tees, holes, pars, handicaps
- Auth: `Authorization: Key {key}`
- Env var: `VITE_GOLF_COURSE_API_KEY`
- Cost: $6.99/month

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/courseApi.ts` | 96 | API client — `searchCourses()`, `getCourseDetail()`, `normalizeCourse()`, `hasApiKey()` |
| `src/components/CourseSearch.tsx` | 389 | Debounced search UI — Austin presets + worldwide results, per-row loading spinner, "Add manually" fallback |

### Types

```typescript
type AppCourse = {
  id: string;
  api_id?: number;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  type?: string;
  holes: number;
  pars: number[];
  handicaps: number[];
  tees: { name: string; yardage?: number; rating?: number; slope?: number }[];
};
```

### Integration Points

- **CrybabySetupWizard.jsx** — replaced grouped `<select>` dropdown with `<CourseSearch>`. Added `selectedCourseData` state. Tee selector and canProceed logic flow from resolved course.
- **ProfilePage.tsx** — replaced `AUSTIN_COURSES` select with `<CourseSearch>`. Manual-add form preserved as fallback.

### Graceful Degradation

Works without API key — Austin presets always available. If no key, shows a nudge link to golfcourseapi.com. API results de-duped against local presets by name match.

### Setup Required

Sign up at golfcourseapi.com, then:
```bash
# .env
VITE_GOLF_COURSE_API_KEY=your_key_here
```

---

## 3. Admin Section Rebrand

All 6 admin files rewritten from generic shadcn/Tailwind to inline styles matching the app's warm palette.

### Files Rewritten

| File | Key Changes |
|------|-------------|
| `AdminLayout.tsx` | Cream sidebar (`#FAF5EC`), sand borders, brand green active nav with right-border indicator, gold Admin badge, Pacifico "Crybaby Golf" text logo (desktop + mobile) |
| `AdminDashboard.tsx` | Pacifico heading, colored stat cards with icon badges, warm backgrounds |
| `AdminUsersPage.tsx` | Warm table (`#FAF5EC` bg, `#F0E9D8` header), inline action buttons, branded Edit/Invite modals |
| `AdminRoundsPage.tsx` | Warm table, status pills (green for active, sand for complete), branded action buttons |
| `AdminGroupsPage.tsx` | Warm table + modal, privacy pills, branded save/cancel |
| `AdminSettingsPage.tsx` | Pacifico headings, warm cards, JetBrains Mono for user IDs |

---

## 4. Solo Scorecard Feature

New feature: simple personal stroke tracker — no betting, no opponents.

### Flow

```
Feed ("Just keeping score →")
  → /solo (setup phase)
    → Search/select course
    → Pick tees
    → "Start Scorecard →"
  → /solo (scorecard phase)
    → Hole-by-hole +/− scoring
    → Score-vs-par pills per hole
    → Front 9 / Back 9 sub-totals
    → "Finish Round ⛳" saves to Supabase
    → Redirect to /feed
```

### New File: `src/pages/SoloRound.jsx` (381 lines)

Two-phase component (`phase: "setup" | "scorecard"`):

**Setup phase:**
- `<CourseSearch>` for course selection
- Tee selector buttons (branded, with yardage)
- Disabled until course + tee selected

**Scorecard phase:**
- Sticky header: course name + running total (Pacifico gold)
- 18 hole cards with +/− buttons
- Score initialized to par for each hole
- Color-coded pills: Eagle (dark green), Birdie (green), Par (neutral), Bogey (sand), Double (orange), +3 and worse (red)
- Front 9 / Back 9 sections with sub-total rows
- Dark green summary card with total strokes + score vs par
- Gold "Finish Round" button

### Data Storage

Direct Supabase insert (bypasses complex `createRound()` which sets up round_players, teams, etc.):

```javascript
supabase.from("rounds").insert({
  created_by: user.id,
  game_type: "solo",
  course: course.name,
  course_details: {
    city, state, pars, handicaps,
    selectedTee, tees, scores,
    totalStrokes, totalDiff, holes
  },
  stakes: null,
  status: "complete",
  scorekeeper_mode: false,
  is_broadcast: false,
});
```

### Route + Entry Point

- **App.tsx** — added `/solo` as `<ProtectedRoute>` alongside `/round`
- **CrybabyFeed.jsx** — added "Just keeping score →" muted link below "Start Action" button

---

## 5. Bug Fixes + Cleanup

| Commit | Fix |
|--------|-----|
| `4cd6e78` | Removed 4 duplicate style object keys across SoloRound, AdminSettingsPage, CrybabyActiveRound (was causing Vite build warnings) |
| Earlier sessions | 8 QA bugs fixed (see CLAUDE.md for full list) — round ending at hole 17, Wolf modal loop, dead Send Reminders button, settlement timing, interval leaks |

---

## Open Items

| Item | Status | Notes |
|------|--------|-------|
| Golf Course API key | Needs user action | Sign up at golfcourseapi.com, add key to `.env` |
| Home course handicap update | Waiting on user | User mentioned their home course changed hole handicaps — need course name + new values |
| OG social sharing card | Deferred | `public/og-image.svg` and `public/og-preview.html` created locally but NOT committed. `index.html` OG meta updates also uncommitted. User said "lets not touch right now." |
| App Store submission | Pending | Screenshots, PrivacyInfo.xcprivacy, Xcode signing still needed |

---

## File Inventory (new files this session)

```
src/lib/courseApi.ts          — 96 lines  — Golf course API client
src/components/CourseSearch.tsx — 389 lines — Searchable course picker
src/pages/SoloRound.jsx       — 381 lines — Solo scorecard feature
public/og-image.svg            — (uncommitted) — OG social card
public/og-preview.html         — (uncommitted) — OG card preview
```
