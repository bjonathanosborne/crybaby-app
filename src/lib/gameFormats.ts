// ============================================================
// GAME_FORMATS — metadata for every game mode the app knows about.
//
// Kept in its own file (not co-located with CrybabySetupWizard) so tests
// can import without transitively pulling the Supabase client's init
// chatter into jsdom.
//
// Entries flagged `hidden: true` are excluded from the setup picker
// but remain available for legacy-round metadata lookups (name/icon/
// description by game_type string).
// ============================================================

import type { GameMode } from "@/lib/gameEngines";

/**
 * Format id. Includes every `GameMode` literal plus `'solo'`, which is its own
 * route (Just Me / SoloRound) and isn't a `GameMode` in the engine type system.
 */
export type GameFormatId = GameMode | "solo";

export interface GameFormat {
  id: GameFormatId;
  name: string;
  players: { min: number; max: number };
  description: string;
  mechanics: string[];
  defaultHoles: number;
  teamStructure: string;
  requiresCarts: boolean;
  hidden?: boolean;
}

export const GAME_FORMATS: GameFormat[] = [
  {
    id: "drivers_others_carts",
    name: "Drivers / Others / Carts",
    players: { min: 4, max: 4 },
    description: "15-hole rotating partners. Drivers, cross-cart, then same-cart. Crybaby finishes it.",
    mechanics: ["hammer", "crybaby", "birdie_bonus", "pops"],
    defaultHoles: 18,
    teamStructure: "rotating",
    requiresCarts: true,
  },
  {
    id: "flip",
    name: "Flip",
    // Locked to exactly 5 players. The 3v2 split is core to the game;
    // other counts would produce 2v2 / 3v3 / 3v4 with different payout
    // math. Setup wizard enforces this with an explicit error state.
    players: { min: 5, max: 5 },
    description: "Per-hole coin flip — random 3v2. Push keeps teams. Crybaby comeback on holes 16–18.",
    mechanics: ["hammer", "crybaby", "birdie_bonus", "pops"],
    defaultHoles: 18,
    teamStructure: "coin_flip",
    requiresCarts: false,
  },
  {
    id: "nassau",
    name: "Nassau",
    players: { min: 2, max: 4 },
    description: "The classic. Three bets in one — front 9, back 9, and overall 18.",
    mechanics: ["presses", "pops"],
    defaultHoles: 18,
    teamStructure: "fixed",
    requiresCarts: false,
    // Hidden for DOC-only testing surface. See TODOS.md. Un-hide order: #1.
    hidden: true,
  },
  {
    id: "skins",
    name: "Skins",
    players: { min: 2, max: 6 },
    description: "Per-hole competition with carry-over. 2–6 players, net or gross.",
    mechanics: ["carry_overs", "pops"],
    defaultHoles: 18,
    teamStructure: "individual",
    requiresCarts: false,
    // Un-hidden 2026-04-21 (PR #17 commit 3). Engine (calculateSkinsResult)
    // + setup wizard + runtime + settlement all work via the generic
    // individual-format path. No Skins-specific UI shipped this commit —
    // follow-up PR will add running skins count, carry indicator, and
    // per-hole winners display once the mode has on-course mileage.
    hidden: false,
  },
  {
    id: "wolf",
    name: "Wolf",
    players: { min: 4, max: 4 },
    description: "Rotating Wolf picks a partner — or goes lone. Strategy meets guts.",
    mechanics: ["lone_wolf", "pops"],
    defaultHoles: 18,
    teamStructure: "wolf_rotation",
    requiresCarts: false,
    // Wolf temporarily hidden — partner-pick capture not yet specified.
    // See TODOS.md "Deferred: Wolf mode". Keeping the full entry here so
    // legacy Wolf rounds still lookup metadata (name, icon, description)
    // when loaded; the visible picker filters `hidden` out.
    hidden: true,
  },
  {
    id: "solo",
    name: "Just Me",
    players: { min: 1, max: 1 },
    description: "Keep your own score. No bets, no opponents — just you and the course.",
    mechanics: [],
    defaultHoles: 18,
    teamStructure: "solo",
    requiresCarts: false,
    // Hidden 2026-04-21 via PR #21. Scorecard mode (PR #19) supports
    // 1 player and is a strict superset of Solo's capabilities —
    // photo capture, resume, net-score leaderboard, event emission.
    // Legacy Solo rounds (2 in prod as of un-hide) continue to load +
    // render through the game-agnostic pipeline; SoloRound.jsx and
    // the /solo route stay in the tree so any future un-hide is a
    // one-line flag flip. Recon: see closed PR #20.
    hidden: true,
  },
  {
    // PR #19: Pure score-tracking mode. No money, no teams, no mechanics.
    // Flows through the same wizard + active-round runtime as every other
    // multi-player format; a no-op engine helper (calculateScorecardResult)
    // satisfies the HoleResult interface so CrybabyActiveRound doesn't
    // need a second rendering path. Net-score display uses the player
    // handicaps already captured during the Players step when ALL players
    // have handicaps (Handicap Option B from the PR #19 recon).
    id: "scorecard",
    name: "Scorecard",
    players: { min: 1, max: 6 },
    description: "Track scores for 1–6 players. No betting, no teams — just the scorecard.",
    mechanics: [],
    defaultHoles: 18,
    teamStructure: "scorecard",
    requiresCarts: false,
    hidden: false,
  },
  {
    id: "custom",
    name: "Custom Game",
    players: { min: 2, max: 6 },
    description: "Build your own rules. Your house, your game.",
    mechanics: [],
    defaultHoles: 18,
    teamStructure: "custom",
    requiresCarts: false,
    // Hidden for DOC-only testing surface. See TODOS.md. Un-hide order: #3.
    hidden: true,
  },
];
