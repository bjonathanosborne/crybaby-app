

## Add Persistent Bottom Navigation Across All Screens

The feed is currently only reachable at the end of a round. Since Crybaby is also a social network, the feed (and other tabs) should be accessible from anywhere in the app at all times.

### What Changes

1. **Extract a shared BottomNav component** from the existing `NavBar` inside `CrybabyFeed.jsx` into its own file (`src/components/BottomNav.jsx`). It will use `react-router-dom` links so tapping Feed, Live, Groups, or Profile navigates to actual routes. It will also include a "+" button to start a new round (navigates to `/setup`).

2. **Add a persistent layout wrapper** (`src/components/AppLayout.jsx`) that renders the `BottomNav` on every post-onboarding screen. This layout will wrap the Setup Wizard, Active Round, and Feed routes.

3. **Update `App.tsx` routing** to use a nested layout route so the bottom nav appears on `/feed`, `/setup`, `/round`, and future routes -- but NOT on the onboarding screen (`/`).

4. **Adjust page padding** on Setup Wizard and Active Round pages to account for the fixed bottom nav (add bottom padding so content isn't hidden behind it).

5. **Remove the duplicate NavBar** from inside `CrybabyFeed.jsx` since the shared one will handle it.

### Result

- Users can tap "Feed" at any time during setup or an active round to check the social feed.
- Users can tap "+" to start a new round from the feed.
- The bottom nav is hidden during onboarding (splash/login flow) but visible everywhere else.

### Technical Details

- **New files**: `src/components/BottomNav.jsx`, `src/components/AppLayout.jsx`
- **Modified files**: `src/App.tsx` (nested routes with `<Outlet />`), `src/pages/CrybabyFeed.jsx` (remove internal NavBar), `src/pages/CrybabySetupWizard.jsx` and `src/pages/CrybabyActiveRound.jsx` (add bottom padding)
- The `AppLayout` component will render `<Outlet />` from react-router-dom plus the `<BottomNav />`, keeping the nav persistent across route changes.

