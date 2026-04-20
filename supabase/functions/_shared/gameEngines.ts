// ============================================================
// GAME ENGINES — Scoring logic for all Crybaby game formats
// ============================================================

export type GameMode = 'drivers_others_carts' | 'skins' | 'nassau' | 'wolf' | 'flip' | 'custom';

export interface Player {
  id: string;
  name: string;
  handicap: number;
  cart?: string;
  position?: string;
  color: string;
  userId?: string | null;
}

export interface TeamInfo {
  teamA: { name: string; players: Player[]; color: string };
  teamB: { name: string; players: Player[]; color: string };
}

export interface HoleResult {
  push: boolean;
  winnerName: string | null;
  amount: number;
  carryOver: number;
  playerResults: { id: string; name: string; amount: number }[];
  quip: string;
  folded?: boolean;
  birdiePush?: boolean;
  skinWinner?: string;
  /**
   * Explicit ids of the players who won the hole. For individual play this is
   * a single id; for team play it's all the winning team's player ids; on a
   * push it's empty. Added so callers can track match state without relying on
   * `amount > 0` (which doesn't work when per-hole amounts are 0, e.g. Nassau).
   */
  winnerIds?: string[];
}

export interface GameSettings {
  hammer: boolean;
  hammerInitiator: string;
  hammerMaxDepth: string;
  crybaby: boolean;
  crybabHoles: number;
  crybabHammerRule: string;
  birdieBonus: boolean;
  birdieMultiplier: number;
  pops: boolean;
  noPopsParThree: boolean;
  carryOverCap: string;
  handicapPercent: number;
  presses: boolean;
  pressType: string;
}

// ============================================================
// FLIP MODE — full type system
//
// Flip is a per-hole team game exclusive to 5-player rounds.
// Holes 1-15 are the base game (random 3v2 reshuffled per decided
// hole, teams stay on a push, rolling-window carry-over). Holes
// 16-18 are the crybaby sub-game (worst-balance player picks a
// partner + bet each hole, 2v3 with custom payout math).
//
// All Flip state is serialised to
// `rounds.course_details.game_state.flipState` JSONB. There is no
// schema migration for the state itself — it's a typed JSON blob.
// A separate tiny migration adds nullable `base_amount` and
// `crybaby_amount` columns to `round_settlements` so the two
// settlement components are queryable at audit time.
// ============================================================

/**
 * Scorekeeper's setup-wizard choices for a Flip round.
 *
 * `baseBet`: per-hole stake in the base game (holes 1-15). Enforced
 *            to be an even integer in dollars by the setup wizard
 *            AND by the engine (both validate — UI is the fast path,
 *            engine is the guarantee).
 *
 * `carryOverWindow`: size of the rolling push-carry queue. When the
 *                    window fills, the oldest push-hole's money is
 *                    forfeited (goes to no one) on the next push.
 *                    `"all"` disables the eviction (infinite window).
 */
export interface FlipConfig {
  baseBet: number;
  carryOverWindow: number | "all";
}

/**
 * Per-hole Flip team assignments for the base game (holes 1-15).
 * Crybaby-phase teams are stored on `CrybabyState.byHole`, NOT here.
 *
 * `teamsByHole` is keyed by hole number (1..15). Missing keys mean
 * the scorekeeper hasn't tapped the Flip button for that hole yet.
 */
export interface FlipState {
  teamsByHole: Record<number, TeamInfo>;
  /**
   * The last hole for which teams have been committed. Used as a
   * guard so the UI can't render a hole whose teams aren't locked
   * in (would be a race condition on the flip button tap).
   */
  currentHole: number;
}

/**
 * Crybaby sub-game state (holes 16-18).
 *
 * Determined between hole 15 and hole 16 from the base-game balance.
 * The crybaby = the player with the most-negative hole-15 balance.
 * If two or more players are tied for most-negative, a deterministic
 * tiebreaker runs (seeded by `round.id` so an audit replay of the
 * same round always picks the same crybaby).
 *
 * `losingBalance` is the crybaby's negative dollar amount after 15
 * holes, stored as a POSITIVE number for cap math clarity. The 50%
 * cap on per-hole bets is `floor(losingBalance / 2)` rounded DOWN
 * to the nearest even dollar — AND computed ONCE at hole 15, never
 * updated during crybaby play even if the crybaby's running balance
 * swings positive.
 *
 * `byHole` holds the crybaby's choices per crybaby hole (16/17/18):
 * their bet, their partner, and the resulting 2v3 team assignment.
 */
export interface CrybabyState {
  /** Player id of the crybaby. Set once between hole 15 and hole 16. */
  crybaby: string;
  /** Crybaby's base-game losing balance (positive dollars). */
  losingBalance: number;
  /** 50% cap, pre-computed at hole 15. floor(losingBalance / 2) rounded DOWN to even dollars. */
  maxBetPerHole: number;

  /** Per-hole crybaby choices. Keys are hole numbers 16, 17, 18. */
  byHole: Record<number, CrybabyHoleChoice>;

  /**
   * Audit record if a tiebreaker ran at hole 15. Undefined when the
   * crybaby was unambiguous (single most-negative player).
   *
   * The `seed` field lets a future session replay the tiebreaker
   * deterministically. We store the seed SOURCE (e.g., the round id)
   * rather than the derived number so humans can verify the choice
   * was made by rule rather than by accident.
   */
  tiebreakOutcome?: {
    tied: string[];
    winner: string;
    seedSource: string;
  };
}

export interface CrybabyHoleChoice {
  /** Even-dollar bet the crybaby chose for this hole. <= maxBetPerHole. */
  bet: number;
  /** Player id of the crybaby's chosen partner. One of the 4 non-crybaby players. */
  partner: string;
  /**
   * Team split for this crybaby hole:
   *   teamA = [crybaby, partner]       (the 2-man team)
   *   teamB = [other 3]                (the 3-man team)
   * Recorded here rather than recomputed so it survives any post-round
   * player-order changes and any partner-name edits.
   */
  teams: TeamInfo;
}

/**
 * Rolling-window carry-over queue for the Flip base game.
 *
 * Unlike DOC/Nassau's scalar carry-over (a single accumulator that
 * zeroes on a decided hole), Flip's carry is a FIFO queue of push
 * entries. When the queue grows beyond `windowSize`, the oldest
 * entry is evicted and its money is FORFEITED (goes to no one).
 *
 * `forfeited` is a running total of money that has fallen off the
 * window over the course of the round — strictly for audit display
 * ("$14 fell into the ether on hole 12"), never paid out.
 */
export interface RollingCarryWindow {
  entries: Array<{ holeNumber: number; amount: number }>;
  forfeited: number;
  windowSize: number | "all";
}

// --- HANDICAP STROKES ---
export function getStrokesOnHole(playerHandicap: number, lowestHandicap: number, holeHandicapRank: number, handicapPercent = 100): number {
  const adjustedHandicap = Math.round(playerHandicap * handicapPercent / 100);
  const adjustedLowest = Math.round(lowestHandicap * handicapPercent / 100);
  const diff = adjustedHandicap - adjustedLowest;
  if (diff <= 0) return 0;
  if (diff >= 18 + holeHandicapRank) return 2;
  if (diff >= holeHandicapRank) return 1;
  return 0;
}

// --- GAME CAPABILITIES ---
export function supportsTeams(gameMode: GameMode): boolean {
  return ['drivers_others_carts', 'flip', 'wolf'].includes(gameMode);
}

export function supportsHammer(gameMode: GameMode): boolean {
  return ['drivers_others_carts', 'flip'].includes(gameMode);
}

export function supportsCrybaby(gameMode: GameMode): boolean {
  return ['drivers_others_carts', 'flip'].includes(gameMode);
}

export function getPhaseLabel(gameMode: GameMode, holeNumber: number): string {
  switch (gameMode) {
    case 'drivers_others_carts':
      if (holeNumber <= 5) return 'drivers';
      if (holeNumber <= 10) return 'others';
      if (holeNumber <= 15) return 'carts';
      return 'crybaby';
    case 'nassau':
      if (holeNumber <= 9) return 'front';
      return 'back';
    case 'skins':
      return 'skins';
    case 'wolf':
      return 'wolf';
    case 'flip':
      return 'flip';
    default:
      return 'play';
  }
}

export function getPhaseDisplayLabel(phase: string): string {
  const labels: Record<string, string> = {
    drivers: 'Drivers', others: 'Others', carts: 'Carts', crybaby: 'Crybaby',
    front: 'Front 9', back: 'Back 9',
    skins: 'Skins', wolf: 'Wolf', flip: 'Flip', play: 'Play',
  };
  return labels[phase] || phase;
}

export function getPhaseColor(phase: string): string {
  const colors: Record<string, string> = {
    drivers: '#16A34A', others: '#F59E0B', carts: '#3B82F6', crybaby: '#DC2626',
    front: '#16A34A', back: '#3B82F6',
    skins: '#F59E0B', wolf: '#8B5CF6', flip: '#EC4899', play: '#6B7280',
  };
  return colors[phase] || '#6B7280';
}

// --- TEAM FORMATION ---

/**
 * Flip teams input for `getTeamsForHole`. Callers pass EITHER a static
 * `TeamInfo` (legacy shape — teams held constant across the round) OR
 * a `FlipState` (per-hole shape). The union preserves backward compat
 * for any test / legacy caller still handing in a single TeamInfo,
 * while letting the new Flip implementation pass hole-specific teams.
 *
 * Crybaby-phase teams (holes 16-18) are passed via the SEPARATE
 * `crybabyTeams` arg, not through this union — crybaby has its own
 * per-hole team shape on `CrybabyState.byHole` and the engine reads
 * that directly at the caller boundary.
 */
export type FlipTeamsInput = TeamInfo | FlipState | null | undefined;

function resolveFlipTeams(input: FlipTeamsInput, holeNumber: number): TeamInfo | null {
  if (!input) return null;
  // FlipState has `teamsByHole`; a raw TeamInfo has `teamA`.
  if ("teamsByHole" in input) {
    return input.teamsByHole[holeNumber] ?? null;
  }
  return input;
}

export function getTeamsForHole(
  gameMode: GameMode,
  holeNumber: number,
  players: Player[],
  flipTeams?: FlipTeamsInput,
  crybabyTeams?: TeamInfo | null,
): TeamInfo | null {
  switch (gameMode) {
    case 'drivers_others_carts':
      return getDOCTeams(holeNumber, players);
    case 'flip':
      // Crybaby sub-game (holes 16-18) uses its own team shape passed
      // explicitly by the caller; the base game reads per-hole teams
      // off FlipState (or falls back to a static TeamInfo for legacy).
      if (holeNumber >= 16 && crybabyTeams) return crybabyTeams;
      return resolveFlipTeams(flipTeams, holeNumber);
    case 'nassau':
      if (players.length === 4) {
        return {
          teamA: { name: 'Team 1', players: [players[0], players[1]], color: '#16A34A' },
          teamB: { name: 'Team 2', players: [players[2], players[3]], color: '#3B82F6' },
        };
      }
      return null;
    case 'skins':
    case 'custom':
      return null;
    case 'wolf':
      return null; // Wolf teams determined dynamically per hole
    default:
      return null;
  }
}

function getDOCTeams(holeNumber: number, players: Player[]): TeamInfo | null {
  const drivers = players.filter(p => p.position === 'driver');
  const riders = players.filter(p => p.position === 'rider');
  const cartA = players.filter(p => p.cart === 'A');
  const cartB = players.filter(p => p.cart === 'B');

  if (holeNumber <= 5) {
    return {
      teamA: { name: 'Drivers', players: drivers, color: '#16A34A' },
      teamB: { name: 'Riders', players: riders, color: '#8B5CF6' },
    };
  } else if (holeNumber <= 10) {
    // Others phase: teams split by cart assignment so all players are included.
    // Previous find()-based approach excluded duplicate cart+position combos (Bug 2).
    const othersA = players.filter(p => p.cart === 'A');
    const othersB = players.filter(p => p.cart === 'B');
    return {
      teamA: { name: 'Others 1', players: othersA, color: '#F59E0B' },
      teamB: { name: 'Others 2', players: othersB, color: '#EC4899' },
    };
  } else if (holeNumber <= 15) {
    return {
      teamA: { name: 'Cart A', players: cartA, color: '#3B82F6' },
      teamB: { name: 'Cart B', players: cartB, color: '#DC2626' },
    };
  }
  return null; // Crybaby holes
}

// --- FLIP TEAMS (random coin flip) ---
export function generateFlipTeams(players: Player[]): TeamInfo {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const half = Math.ceil(shuffled.length / 2);
  return {
    teamA: { name: 'Heads', players: shuffled.slice(0, half), color: '#16A34A' },
    teamB: { name: 'Tails', players: shuffled.slice(half), color: '#DC2626' },
  };
}

// ============================================================
// FLIP ENGINE — pure primitives
// ============================================================

/**
 * Create an empty FlipState at round start. `currentHole` is 0 because
 * no teams have been committed yet; the initial FlipTeamModal at hole 1
 * will advance it to 1.
 */
export function initFlipState(): FlipState {
  return { teamsByHole: {}, currentHole: 0 };
}

/**
 * Commit teams for a specific hole. Pure — returns a new state with
 * `teamsByHole[holeNumber]` set and `currentHole` advanced to match.
 * The caller decides WHEN to call this (round-start modal, per-hole
 * flip button tap, or push-carry auto-advance).
 */
export function commitFlipTeams(prev: FlipState, holeNumber: number, teams: TeamInfo): FlipState {
  return {
    ...prev,
    teamsByHole: { ...prev.teamsByHole, [holeNumber]: teams },
    currentHole: Math.max(prev.currentHole, holeNumber),
  };
}

/**
 * Compute the next hole's Flip teams given the previous hole's outcome.
 *
 *   - Previous hole was a push     → carry same teams forward (spec).
 *   - Previous hole was decided    → new random 3v2 shuffle.
 *   - `prev.teamsByHole[prevHole]` missing → generate fresh teams
 *     (fallback for the very-first hole before any modal tap).
 *
 * Pure: the random shuffle is deterministic per call only if callers
 * stub `Math.random` — which our test harness does. Production callers
 * let it be genuinely random.
 */
export function advanceFlipState(
  prev: FlipState,
  prevHoleNumber: number,
  prevHolePush: boolean,
  players: Player[],
): FlipState {
  const nextHoleNumber = prevHoleNumber + 1;
  const priorTeams = prev.teamsByHole[prevHoleNumber];

  if (prevHolePush && priorTeams) {
    // Push → teams stay. Copy the prior teams into the next hole slot.
    return commitFlipTeams(prev, nextHoleNumber, priorTeams);
  }

  // Decided hole (win/loss) or no prior teams → fresh flip.
  return commitFlipTeams(prev, nextHoleNumber, generateFlipTeams(players));
}

// ============================================================
// FLIP ROLLING CARRY-OVER
// ============================================================

/**
 * Initialise an empty rolling carry window at round start.
 */
export function initRollingCarryWindow(windowSize: number | "all"): RollingCarryWindow {
  return { entries: [], forfeited: 0, windowSize };
}

/**
 * Append a new push-hole's money to the window. If the window has
 * a finite size and adding this entry would exceed it, the oldest
 * entry is evicted — its money is added to `forfeited` (audit only).
 */
export function appendPushToWindow(
  prev: RollingCarryWindow,
  holeNumber: number,
  pushAmount: number,
): RollingCarryWindow {
  const nextEntries = [...prev.entries, { holeNumber, amount: pushAmount }];
  const cap = prev.windowSize;
  if (cap !== "all" && nextEntries.length > cap) {
    const evicted = nextEntries.shift()!;
    return {
      entries: nextEntries,
      forfeited: prev.forfeited + evicted.amount,
      windowSize: cap,
    };
  }
  return { entries: nextEntries, forfeited: prev.forfeited, windowSize: prev.windowSize };
}

/**
 * Compute the total pot to award on a decided hole: sum of all entries
 * currently in the window (everything that hasn't been forfeited).
 * Returns the sum and a CLEARED window (entries reset to empty).
 *
 * Note: `forfeited` is preserved across claims — it's a running audit
 * counter for the whole round.
 */
export function claimRollingCarryWindow(
  prev: RollingCarryWindow,
): { total: number; cleared: RollingCarryWindow } {
  const total = prev.entries.reduce((acc, e) => acc + e.amount, 0);
  return {
    total,
    cleared: { entries: [], forfeited: prev.forfeited, windowSize: prev.windowSize },
  };
}

// ============================================================
// FLIP PAYOUT MATH — Model C
//
// Each push is a flat-ante into the rolling window. Every player
// debits `effectiveBet` ($B) on a push; the hole's pot entry on
// the window is `N * B` (5 players × bet for standard Flip).
//
// On a decided hole there is NO separate ante. Losers pay
// asymmetrically per spec's "risk" scaling:
//    - 3-man side losing: each pays B.
//    - 2-man side losing: each pays 1.5B.
// Either framing yields a losers' pot of 3B. Winners split
// `3B + window` evenly among the winning side's players.
//
// The 1.5B factor depends on B being even — that invariant is
// enforced at setup + in FlipConfig typing. For B=$2: 2-man
// losers each pay $3. For B=$4: $6. For B=$6: $9. etc. All
// integer dollars when B is even.
//
// Closed-system invariants:
//    - On a pure push: sum(balance deltas) = -N*B (real money
//      leaves wallets into the window).
//    - On a decided hole after claims: sum(balance deltas) =
//      winnerPayout - losersCollected = +windowSum (winners
//      receive more than losers pay because the window had
//      prior-push money).
//    - Across the full round: sum(all player balances) =
//      -(forfeited + any unclaimed window entries).
//
// The `forfeited` counter on RollingCarryWindow accrues real
// money that left the closed system permanently (evicted push
// entries). Never repaid.
// ============================================================

export interface FlipPayoutResult {
  push: boolean;
  winningSide: "A" | "B" | null;
  /**
   * Total dollars the losing side collectively contributes on a
   * decided hole (3B), OR the total ante pot on a push (N*B).
   * Zero on any result where no player-to-pot transfer happened.
   */
  potFromBet: number;
  /** Dollars pulled from the rolling window and paid to winners. */
  potFromCarry: number;
  perPlayer: Array<{ id: string; name: string; amount: number }>;
  forfeitedThisHole: number;
  newWindow: RollingCarryWindow;
}

export function calculateFlipHoleResult(args: {
  teams: TeamInfo;
  teamABest: number;
  teamBBest: number;
  effectiveBet: number;
  window: RollingCarryWindow;
  holeNumber: number;
}): FlipPayoutResult {
  const { teams, teamABest, teamBBest, effectiveBet, window, holeNumber } = args;
  const allPlayers = [...teams.teamA.players, ...teams.teamB.players];
  const playerCount = allPlayers.length;

  if (teamABest === teamBBest) {
    // PUSH: every player antes the flat base bet. The full N*B lands
    // in the rolling window as a single entry. If this push evicts
    // an older entry, its amount is added to `forfeited` (real money
    // out of the closed system permanently).
    const perPlayerAnte = effectiveBet;
    const totalAntePot = perPlayerAnte * playerCount;
    const newWindow = appendPushToWindow(window, holeNumber, totalAntePot);
    const forfeitedThisHole = newWindow.forfeited - window.forfeited;
    return {
      push: true,
      winningSide: null,
      potFromBet: totalAntePot,
      potFromCarry: 0,
      perPlayer: allPlayers.map(p => ({ id: p.id, name: p.name, amount: -perPlayerAnte })),
      forfeitedThisHole,
      newWindow,
    };
  }

  const winningSide: "A" | "B" = teamABest < teamBBest ? "A" : "B";
  const winTeam = winningSide === "A" ? teams.teamA : teams.teamB;
  const loseTeam = winningSide === "A" ? teams.teamB : teams.teamA;

  // DECIDED: losers pay asymmetrically. No flat ante — the losers'
  // contribution IS the hole's money-out-of-pocket. 3-man loser pays
  // B; 2-man loser pays 1.5B. Either side's collective loss = 3B.
  //
  // Fallback: for any non-3-and-non-2 team split (legacy flip rounds
  // that were 2v2 / 3v3 from before the 5-player-only lock), we keep
  // the symmetric flat-B path so historical replay stays sane.
  let loserPerPlayer: number;
  if (loseTeam.players.length === 3) {
    loserPerPlayer = effectiveBet;
  } else if (loseTeam.players.length === 2) {
    loserPerPlayer = (effectiveBet * 3) / 2;
  } else {
    loserPerPlayer = effectiveBet; // legacy fallback
  }
  const totalFromLosers = loserPerPlayer * loseTeam.players.length;

  const { total: carryTotal, cleared: newWindow } = claimRollingCarryWindow(window);
  const potTotal = totalFromLosers + carryTotal;
  const winnerShare = potTotal / winTeam.players.length;

  const perPlayer = allPlayers.map(p => {
    const onWinTeam = winTeam.players.some(w => w.id === p.id);
    return { id: p.id, name: p.name, amount: onWinTeam ? winnerShare : -loserPerPlayer };
  });

  return {
    push: false,
    winningSide,
    potFromBet: totalFromLosers,
    potFromCarry: carryTotal,
    perPlayer,
    forfeitedThisHole: 0,
    newWindow,
  };
}

// --- SKINS SCORING ---
export function calculateSkinsResult(
  players: Player[],
  scores: Record<string, number>,
  par: number,
  holeNumber: number,
  holeValue: number,
  carryOver: number,
  settings: GameSettings,
  lowestHandicap: number,
  holeHandicapRank: number,
): HoleResult {
  const totalPot = holeValue + carryOver;

  // Calculate net scores
  const netScores: Record<string, number> = {};
  players.forEach(p => {
    const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicapRank, settings.handicapPercent) : 0;
    netScores[p.id] = scores[p.id] - strokes;
  });

  // Find lowest net score
  const netValues = Object.values(netScores);
  const lowestNet = Math.min(...netValues);
  const winnersWithLowest = players.filter(p => netScores[p.id] === lowestNet);

  if (winnersWithLowest.length > 1) {
    // Tie — carry over
    return {
      push: true,
      winnerName: null,
      amount: 0,
      carryOver: totalPot,
      playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: `Tied! $${totalPot} carries to the next hole. 💰`,
    };
  }

  const winner = winnersWithLowest[0];
  const winAmount = totalPot * (players.length - 1);
  const loseAmount = totalPot;

  return {
    push: false,
    winnerName: winner.name,
    amount: totalPot,
    carryOver: 0,
    skinWinner: winner.id,
    playerResults: players.map(p => ({
      id: p.id,
      name: p.name,
      amount: p.id === winner.id ? loseAmount * (players.length - 1) : -loseAmount,
    })),
    quip: `${winner.name} takes the skin! $${totalPot} per player. 💰`,
  };
}

// --- NASSAU SCORING ---
export interface NassauState {
  frontMatch: Record<string, number>; // player/team → holes won on front 9
  backMatch: Record<string, number>;  // player/team → holes won on back 9
  overallMatch: Record<string, number>; // player/team → total holes won
  presses: { startHole: number; match: Record<string, number> }[];
}

export function initNassauState(players: Player[]): NassauState {
  const init: Record<string, number> = {};
  players.forEach(p => { init[p.id] = 0; });
  return {
    frontMatch: { ...init },
    backMatch: { ...init },
    overallMatch: { ...init },
    presses: [],
  };
}

/**
 * Compute which side won a Nassau hole.
 *
 * **Payout model:** Nassau pays by segment (front-9, back-9, overall) and by
 * press — NOT per hole. This function therefore returns `amount: 0` and zero
 * per-player amounts. Hole winners are carried via the `winnerIds` field so
 * callers can update `NassauState` and compute segment settlement at round
 * end via `calculateNassauSettlement`.
 *
 * `winnerName` and `quip` are still populated for narrative UI (live feed,
 * hole summaries) — only the money is suppressed.
 */
export function calculateNassauHoleResult(
  players: Player[],
  teams: TeamInfo | null,
  scores: Record<string, number>,
  par: number,
  holeNumber: number,
  holeValue: number,
  settings: GameSettings,
  lowestHandicap: number,
  holeHandicapRank: number,
): HoleResult {
  const zeroResults = () => players.map(p => ({ id: p.id, name: p.name, amount: 0 }));

  // For individual Nassau (2-3 players)
  if (!teams) {
    const netScores: Record<string, number> = {};
    players.forEach(p => {
      const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicapRank, settings.handicapPercent) : 0;
      netScores[p.id] = scores[p.id] - strokes;
    });

    const lowestNet = Math.min(...Object.values(netScores));
    const winners = players.filter(p => netScores[p.id] === lowestNet);

    if (winners.length > 1) {
      return {
        push: true,
        winnerName: null,
        amount: 0,
        carryOver: 0,
        playerResults: zeroResults(),
        quip: 'Halved. Nobody wins this hole.',
        winnerIds: [],
      };
    }

    const winner = winners[0];
    return {
      push: false,
      winnerName: winner.name,
      amount: 0,
      carryOver: 0,
      playerResults: zeroResults(),
      quip: `${winner.name} wins the hole.`,
      winnerIds: [winner.id],
    };
  }

  // Team Nassau (2v2)
  const netScores: Record<string, number> = {};
  players.forEach(p => {
    const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicapRank, settings.handicapPercent) : 0;
    netScores[p.id] = scores[p.id] - strokes;
  });

  const teamABest = Math.min(...teams.teamA.players.map(p => netScores[p.id]));
  const teamBBest = Math.min(...teams.teamB.players.map(p => netScores[p.id]));

  if (teamABest === teamBBest) {
    return {
      push: true,
      winnerName: null,
      amount: 0,
      carryOver: 0,
      playerResults: zeroResults(),
      quip: 'Halved. All square.',
      winnerIds: [],
    };
  }

  const winnerTeam = teamABest < teamBBest ? teams.teamA : teams.teamB;
  const loserTeam = teamABest < teamBBest ? teams.teamB : teams.teamA;

  return {
    push: false,
    winnerName: winnerTeam.name,
    amount: 0,
    carryOver: 0,
    playerResults: zeroResults(),
    quip: `${winnerTeam.name} takes the hole. ${loserTeam.name} needs to answer.`,
    winnerIds: winnerTeam.players.map(p => p.id),
  };
}

// --- NASSAU SETTLEMENT ---

/**
 * Result of a single Nassau segment (front / back / overall) or a press.
 * winner is a player id (individual play) or team name (team play), or null on push.
 */
export interface NassauSegmentResult {
  winner: string | null;
  amount: number;    // $ changed hands on this bet (0 on push or unsettled)
  settled: boolean;  // false when the segment did not complete (e.g. abandoned round)
}

export interface NassauPressResult extends NassauSegmentResult {
  startHole: number;
  segment: "front" | "back";
}

export interface NassauSettlement {
  /** Per-player dollar amounts (positive = won, negative = owed). */
  playerAmounts: Record<string, number>;
  front: NassauSegmentResult;
  back: NassauSegmentResult;
  overall: NassauSegmentResult;
  presses: NassauPressResult[];
}

/**
 * Aggregated "holes won by each side" for a single Nassau match. Used internally
 * by the settlement function to determine the winning side.
 */
type SideKey = string; // player.id for individual; players.id per-team-member for team (see below)

/**
 * For a given match-count map, determine which *side* won the segment.
 *
 * - Individual (2-3 player): sides are player ids. The side with the highest
 *   holes-won total wins; any tie at the top pushes the segment.
 * - Team (4-player 2v2): we aggregate each team's total by taking the MAX of
 *   its two players' counts. This is deliberate and robust against either
 *   tracking style: the current inline update in CrybabyActiveRound credits
 *   only the "first winner" per hole (one player per winning team), so that
 *   player's count equals the team's true count while the other teammate's
 *   stays at zero; if a future refactor instead credits both teammates, MAX
 *   still returns the team's true count. SUM would over-count in the
 *   double-credit case, so we avoid it.
 *
 * Returns { winner, contenderCount } where winner is null on push.
 */
function decideNassauSegment(
  players: Player[],
  teams: TeamInfo | null,
  matchCounts: Record<string, number>,
): { winner: string | null } {
  if (teams) {
    const teamATotal = Math.max(...teams.teamA.players.map(p => matchCounts[p.id] || 0));
    const teamBTotal = Math.max(...teams.teamB.players.map(p => matchCounts[p.id] || 0));
    if (teamATotal > teamBTotal) return { winner: teams.teamA.name };
    if (teamBTotal > teamATotal) return { winner: teams.teamB.name };
    return { winner: null };
  }
  // Individual — pick the player with strictly most holes won
  let bestCount = -1;
  let bestIds: string[] = [];
  players.forEach(p => {
    const c = matchCounts[p.id] || 0;
    if (c > bestCount) {
      bestCount = c;
      bestIds = [p.id];
    } else if (c === bestCount) {
      bestIds.push(p.id);
    }
  });
  if (bestIds.length === 1) {
    return { winner: bestIds[0] };
  }
  return { winner: null }; // tie at the top = push (even if only 2 of 3 tie)
}

/**
 * Calculate the final Nassau settlement after the round has been played
 * (or abandoned early).
 *
 * Nassau is three independent bets per round:
 *   1. Front 9 — side with more holes won on holes 1–9 wins `segmentValue`.
 *   2. Back 9  — side with more holes won on holes 10–18 wins `segmentValue`.
 *   3. Overall — side with more holes won across all 18 wins `segmentValue`.
 *
 * Each declared *press* creates an additional bet running from the press's
 * start hole through the end of its segment (a press on hole ≤9 settles at
 * hole 9; a press on holes 10–18 settles at hole 18). Presses pay at the
 * same `segmentValue`. Presses that compound (multiple within one segment)
 * each pay independently.
 *
 * Ties push — no money changes hands for a pushed segment or press.
 *
 * **Abandoned rounds:** we deliberately do *not* settle unfinished bets.
 *   - Front segment settles only if `completedHoles >= 9`.
 *   - Back and Overall settle only if `completedHoles >= 18`.
 *   - A press settles only if its segment has settled.
 * Unsettled bets return `settled: false, amount: 0, winner: null`.
 *
 * **Handicap pops:** pops are applied at the hole level inside
 * `calculateNassauHoleResult` (via `getStrokesOnHole`). By the time holes are
 * counted in `NassauState`, net scoring has already decided each hole's winner.
 * This function trusts those counts; it does not re-apply handicap.
 *
 * **Player payouts:**
 *   - 2-player individual: winner +segmentValue, loser −segmentValue.
 *   - 3-player individual: winner +segmentValue × (players − 1); each loser −segmentValue.
 *   - 4-player team (2v2): each winning-team player +segmentValue; each losing-team player −segmentValue.
 *
 * @param players        All round participants (2–4).
 * @param teams          2v2 team split (pass for 4-player team Nassau; null for individual).
 * @param state          Accumulated match counts from `calculateNassauHoleResult` results.
 * @param segmentValue   Dollars paid per segment or press (= round.holeValue).
 * @param completedHoles How many of the 18 holes were actually played (defaults to 18).
 */
export function calculateNassauSettlement(
  players: Player[],
  teams: TeamInfo | null,
  state: NassauState,
  segmentValue: number,
  completedHoles: number = 18,
): NassauSettlement {
  const playerAmounts: Record<string, number> = {};
  players.forEach(p => { playerAmounts[p.id] = 0; });

  /** Credit a segment win to the winning side; null winner = push (no-op). */
  const creditSegment = (winner: string | null): number => {
    if (!winner) return 0;
    if (teams) {
      const winTeam = teams.teamA.name === winner ? teams.teamA : teams.teamB;
      const loseTeam = teams.teamA.name === winner ? teams.teamB : teams.teamA;
      winTeam.players.forEach(p => { playerAmounts[p.id] += segmentValue; });
      loseTeam.players.forEach(p => { playerAmounts[p.id] -= segmentValue; });
      return segmentValue * winTeam.players.length;
    }
    // Individual — winner collects from every other player
    players.forEach(p => {
      if (p.id === winner) playerAmounts[p.id] += segmentValue * (players.length - 1);
      else playerAmounts[p.id] -= segmentValue;
    });
    return segmentValue * (players.length - 1);
  };

  const frontSettled = completedHoles >= 9;
  const backSettled = completedHoles >= 18;
  const overallSettled = completedHoles >= 18;

  const frontDecision = frontSettled ? decideNassauSegment(players, teams, state.frontMatch) : { winner: null };
  const backDecision = backSettled ? decideNassauSegment(players, teams, state.backMatch) : { winner: null };
  const overallDecision = overallSettled ? decideNassauSegment(players, teams, state.overallMatch) : { winner: null };

  const frontAmount = frontSettled ? creditSegment(frontDecision.winner) : 0;
  const backAmount = backSettled ? creditSegment(backDecision.winner) : 0;
  const overallAmount = overallSettled ? creditSegment(overallDecision.winner) : 0;

  const pressResults: NassauPressResult[] = state.presses.map(press => {
    const segment: "front" | "back" = press.startHole <= 9 ? "front" : "back";
    const settled = segment === "front" ? frontSettled : backSettled;
    if (!settled) {
      return { startHole: press.startHole, segment, winner: null, amount: 0, settled: false };
    }
    const decision = decideNassauSegment(players, teams, press.match);
    const amount = creditSegment(decision.winner);
    return { startHole: press.startHole, segment, winner: decision.winner, amount, settled: true };
  });

  return {
    playerAmounts,
    front: { winner: frontDecision.winner, amount: frontAmount, settled: frontSettled },
    back: { winner: backDecision.winner, amount: backAmount, settled: backSettled },
    overall: { winner: overallDecision.winner, amount: overallAmount, settled: overallSettled },
    presses: pressResults,
  };
}

// --- WOLF SCORING ---
export interface WolfState {
  wolfOrder: string[]; // player IDs in wolf rotation order
  currentWolfIndex: number;
  partnerSelected: string | null;
  isLoneWolf: boolean;
}

export function initWolfState(players: Player[]): WolfState {
  return {
    wolfOrder: players.map(p => p.id),
    currentWolfIndex: 0,
    partnerSelected: null,
    isLoneWolf: false,
  };
}

export function getWolfForHole(wolfState: WolfState, holeNumber: number): string {
  return wolfState.wolfOrder[(holeNumber - 1) % wolfState.wolfOrder.length];
}

export function calculateWolfHoleResult(
  players: Player[],
  scores: Record<string, number>,
  par: number,
  holeValue: number,
  wolfId: string,
  partnerId: string | null,
  isLoneWolf: boolean,
  settings: GameSettings,
  lowestHandicap: number,
  holeHandicapRank: number,
): HoleResult {
  const netScores: Record<string, number> = {};
  players.forEach(p => {
    const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicapRank, settings.handicapPercent) : 0;
    netScores[p.id] = scores[p.id] - strokes;
  });

  const wolfTeam = isLoneWolf
    ? [players.find(p => p.id === wolfId)!]
    : [players.find(p => p.id === wolfId)!, players.find(p => p.id === partnerId)!].filter(Boolean);
  const otherTeam = players.filter(p => !wolfTeam.some(w => w.id === p.id));

  const wolfBest = Math.min(...wolfTeam.map(p => netScores[p.id]));
  const otherBest = Math.min(...otherTeam.map(p => netScores[p.id]));

  const multiplier = isLoneWolf ? 2 : 1;
  const effectiveValue = holeValue * multiplier;

  if (wolfBest === otherBest) {
    return {
      push: true,
      winnerName: null,
      amount: 0,
      carryOver: 0,
      playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: 'Push. Wolf lives to hunt another hole. 🐺',
    };
  }

  const wolfWins = wolfBest < otherBest;
  const wolfPlayer = players.find(p => p.id === wolfId)!;

  if (wolfWins) {
    return {
      push: false,
      winnerName: isLoneWolf ? `${wolfPlayer.name} (Lone Wolf)` : 'Wolf Team',
      amount: effectiveValue,
      carryOver: 0,
      playerResults: players.map(p => ({
        id: p.id, name: p.name,
        amount: wolfTeam.some(w => w.id === p.id) ? effectiveValue * otherTeam.length / wolfTeam.length : -effectiveValue,
      })),
      quip: isLoneWolf
        ? `🐺 LONE WOLF ${wolfPlayer.name} takes it! Double payout!`
        : `Wolf team wins. ${wolfPlayer.name} picked well.`,
    };
  } else {
    return {
      push: false,
      winnerName: 'Pack',
      amount: effectiveValue,
      carryOver: 0,
      playerResults: players.map(p => ({
        id: p.id, name: p.name,
        amount: wolfTeam.some(w => w.id === p.id) ? -effectiveValue * otherTeam.length / wolfTeam.length : effectiveValue,
      })),
      quip: isLoneWolf
        ? `The pack devours the lone wolf. ${wolfPlayer.name} pays double. 🐺💀`
        : `Pack wins! The wolf's pick backfired.`,
    };
  }
}

// --- GENERIC TEAM SCORING (used by DOC, Flip) ---
export function calculateTeamHoleResult(
  players: Player[],
  teams: TeamInfo,
  scores: Record<string, number>,
  par: number,
  holeValue: number,
  carryOver: number,
  hammerDepth: number,
  settings: GameSettings,
  lowestHandicap: number,
  holeHandicapRank: number,
  carryOverCap: string,
): HoleResult {
  const netScores: Record<string, number> = {};
  players.forEach(p => {
    const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicapRank, settings.handicapPercent) : 0;
    netScores[p.id] = scores[p.id] - strokes;
  });

  // Team best ball
  const teamABest = Math.min(...teams.teamA.players.map(p => netScores[p.id]));
  const teamBBest = Math.min(...teams.teamB.players.map(p => netScores[p.id]));

  // Birdie bonus
  const bestGross = Math.min(...Object.values(scores));
  const bestGrossPlayer = players.find(p => scores[p.id] === bestGross);
  const hasGrossBirdie = bestGross < par && settings.birdieBonus;

  let birdieMultiplier = 1;
  let birdieForcedPush = false;

  if (hasGrossBirdie) {
    const grossBirdieTeamA = teams.teamA.players.some(p => scores[p.id] < par);
    const grossBirdieTeamB = teams.teamB.players.some(p => scores[p.id] < par);
    const teamAHasNetBirdie = teams.teamA.players.some(p => netScores[p.id] < par);
    const teamBHasNetBirdie = teams.teamB.players.some(p => netScores[p.id] < par);

    if ((grossBirdieTeamA && teamBHasNetBirdie) || (grossBirdieTeamB && teamAHasNetBirdie)) {
      birdieForcedPush = true;
    } else {
      birdieMultiplier = settings.birdieMultiplier;
    }
  }

  if (birdieForcedPush) {
    const rawCarry = holeValue * Math.pow(2, hammerDepth) + carryOver;
    const cappedCarry = capCarryOver(rawCarry, holeValue, carryOverCap);
    return {
      push: true,
      winnerName: null,
      amount: 0,
      carryOver: cappedCarry,
      playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: `Net birdie cancels the gross birdie. Push. 🛡️`,
      birdiePush: true,
    };
  }

  const holeVal = (holeValue * Math.pow(2, hammerDepth) + carryOver) * birdieMultiplier;

  if (teamABest === teamBBest) {
    const rawCarry = holeValue * Math.pow(2, hammerDepth) * birdieMultiplier + carryOver;
    const cappedCarry = capCarryOver(rawCarry, holeValue, carryOverCap);
    return {
      push: true,
      winnerName: null,
      amount: 0,
      carryOver: cappedCarry,
      playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: cappedCarry === 0
        ? 'Push. No carry-overs — clean slate next hole.'
        : `Push. $${cappedCarry} carries to next hole. 🤝`,
    };
  }

  const winnerTeamKey = teamABest < teamBBest ? 'A' : 'B';
  const winTeam = winnerTeamKey === 'A' ? teams.teamA : teams.teamB;
  const loseTeam = winnerTeamKey === 'A' ? teams.teamB : teams.teamA;

  return {
    push: false,
    winnerName: winTeam.name,
    amount: holeVal,
    carryOver: 0,
    playerResults: players.map(p => ({
      id: p.id, name: p.name,
      amount: winTeam.players.some(tp => tp.id === p.id) ? holeVal : -holeVal,
    })),
    quip: hasGrossBirdie && birdieMultiplier > 1
      ? `${bestGrossPlayer?.name} cashes a gross birdie! Pot doubled. 💰`
      : holeVal >= holeValue * 3
        ? `$${holeVal * 2} swing. Someone felt that. 🔥`
        : `${winTeam.name} takes the hole. $${holeVal} changes hands.`,
  };
}

function capCarryOver(rawCarry: number, holeValue: number, cap: string): number {
  if (cap === 'None') return 0;
  if (cap === '∞') return rawCarry;
  const maxCarry = holeValue * parseInt(cap);
  return Math.min(rawCarry, maxCarry);
}

// --- FOLD RESULT (for hammer games) ---
export function calculateFoldResult(
  players: Player[],
  teams: TeamInfo,
  foldValue: number,
  winnerTeamId: string,
): HoleResult {
  const winTeam = winnerTeamId === 'A' ? teams.teamA : teams.teamB;
  const loseTeam = winnerTeamId === 'A' ? teams.teamB : teams.teamA;
  return {
    push: false,
    winnerName: winTeam.name,
    amount: foldValue,
    carryOver: 0,
    playerResults: players.map(p => ({
      id: p.id, name: p.name,
      amount: winTeam.players.some(tp => tp.id === p.id) ? foldValue : -foldValue,
    })),
    quip: `🐔 ${loseTeam.name} folds. Probably smart.`,
    folded: true,
  };
}

// --- ROUND COMPLETION ---
export function isRoundComplete(gameMode: GameMode, currentHole: number, totalHoles: number, holeResultsCount: number): boolean {
  return currentHole >= totalHoles && holeResultsCount >= totalHoles - 1;
}

// --- ROUND REPLAY (for post-round score editing) ---

export interface ReplayHoleInput {
  holeNumber: number;
  scores: Record<string, number>;
  hammerDepth: number;
  folded: boolean;
  foldWinnerTeamId?: string;
}

export interface ReplayRoundResult {
  totals: Record<string, number>;
  holeResults: (HoleResult & { hole: number })[];
  /**
   * Nassau-only: segment and press settlement detail. Undefined for other game modes.
   */
  nassauSettlement?: NassauSettlement;
}

/**
 * Replays all 18 holes through the appropriate game engine with (possibly
 * corrected) scores. Returns new per-player money totals and per-hole results.
 *
 * **Nassau:** per-hole results carry no money (see `calculateNassauHoleResult`);
 * totals come from `calculateNassauSettlement` applied to the reconstructed
 * `NassauState`. This replay does NOT know about presses declared mid-round
 * (press history isn't carried in `ReplayHoleInput`), so post-round score
 * edits on Nassau rounds will re-settle segments only. Persist press history
 * separately if edits need to preserve it.
 *
 * **Wolf:** money recalculation not supported (partner selections not stored).
 */
export function replayRound(
  gameMode: GameMode,
  players: Player[],
  pars: number[],
  handicaps: number[],
  holeValue: number,
  settings: GameSettings,
  holes: ReplayHoleInput[],
  flipTeams?: FlipTeamsInput,
  flipConfig?: FlipConfig,
): ReplayRoundResult {
  const lowestHandicap = Math.min(...players.map(p => p.handicap));
  const totals: Record<string, number> = {};
  players.forEach(p => { totals[p.id] = 0; });
  const holeResults: (HoleResult & { hole: number })[] = [];
  let carryOver = 0;
  const carryOverCap = settings.carryOverCap || "∞";

  // Flip rolling carry-over window. Only used when gameMode === 'flip' AND
  // the caller passed a FlipState (per-hole shape). Legacy callers passing
  // a static TeamInfo stay on the scalar `carryOver` path below.
  const usingFlipState = gameMode === 'flip' && flipTeams !== null && flipTeams !== undefined
    && typeof flipTeams === 'object' && 'teamsByHole' in flipTeams;
  let flipWindow: RollingCarryWindow | null = usingFlipState
    ? initRollingCarryWindow(flipConfig?.carryOverWindow ?? 'all')
    : null;

  // Nassau match state reconstructed as we replay
  const nassauState: NassauState | null = gameMode === 'nassau' ? initNassauState(players) : null;
  const nassauTeams: TeamInfo | null = gameMode === 'nassau' && players.length === 4
    ? {
        teamA: { name: 'Team 1', players: [players[0], players[1]], color: '#16A34A' },
        teamB: { name: 'Team 2', players: [players[2], players[3]], color: '#3B82F6' },
      }
    : null;

  for (const hole of holes) {
    const { holeNumber, scores, hammerDepth, folded, foldWinnerTeamId } = hole;
    const par = pars[holeNumber - 1];
    const holeHandicapRank = handicaps[holeNumber - 1];

    // Determine teams for this hole
    const teams = getTeamsForHole(gameMode, holeNumber, players, flipTeams);

    let result: HoleResult;

    if (folded && teams && foldWinnerTeamId) {
      // Folded hole — score-independent, amount = pot at fold time
      const foldValue = holeValue * Math.pow(2, hammerDepth) + carryOver;
      result = calculateFoldResult(players, teams, foldValue, foldWinnerTeamId);
      result.carryOver = 0;
    } else if (gameMode === 'skins' || gameMode === 'custom') {
      result = calculateSkinsResult(players, scores, par, holeNumber, holeValue, carryOver, settings, lowestHandicap, holeHandicapRank);
    } else if (gameMode === 'nassau') {
      result = calculateNassauHoleResult(players, nassauTeams, scores, par, holeNumber, holeValue, settings, lowestHandicap, holeHandicapRank);
    } else if (usingFlipState && teams && flipWindow) {
      // Flip base game (1-15) — rolling-window carry-over, 3v2 payouts.
      // Crybaby phase (16-18) bypasses this and is replayed via the crybaby
      // engine in a separate code path once Commit 6 lands.
      const baseBet = flipConfig?.baseBet ?? holeValue;
      const effectiveBet = baseBet * Math.pow(2, hammerDepth);
      const netScores: Record<string, number> = {};
      players.forEach(p => {
        const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicapRank, settings.handicapPercent) : 0;
        netScores[p.id] = scores[p.id] - strokes;
      });
      const teamABest = Math.min(...teams.teamA.players.map(p => netScores[p.id]));
      const teamBBest = Math.min(...teams.teamB.players.map(p => netScores[p.id]));
      const flipResult = calculateFlipHoleResult({
        teams, teamABest, teamBBest, effectiveBet, window: flipWindow, holeNumber,
      });
      flipWindow = flipResult.newWindow;
      result = {
        push: flipResult.push,
        winnerName: flipResult.winningSide === null
          ? null
          : flipResult.winningSide === 'A' ? teams.teamA.name : teams.teamB.name,
        amount: flipResult.potFromBet + flipResult.potFromCarry,
        carryOver: 0, // scalar unused in rolling-window mode
        playerResults: flipResult.perPlayer,
        quip: flipResult.push
          ? flipResult.forfeitedThisHole > 0
            ? `Push. $${flipResult.forfeitedThisHole} fell into the ether.`
            : 'Push. Pot carries to next hole.'
          : `${flipResult.winningSide === 'A' ? teams.teamA.name : teams.teamB.name} takes the hole.`,
      };
    } else if (teams) {
      // DOC / legacy-Flip path — team best ball with scalar carry.
      result = calculateTeamHoleResult(players, teams, scores, par, holeValue, carryOver, hammerDepth, settings, lowestHandicap, holeHandicapRank, carryOverCap);
    } else {
      // DOC crybaby phase (holes 16-18) — skins scoring
      result = calculateSkinsResult(players, scores, par, holeNumber, holeValue, carryOver, settings, lowestHandicap, holeHandicapRank);
    }

    // Nassau per-hole amounts are 0; accumulate match state instead
    if (gameMode === 'nassau' && nassauState && result.winnerIds && result.winnerIds.length > 0) {
      const bump = (map: Record<string, number>, id: string) =>
        (map[id] = (map[id] || 0) + 1);
      result.winnerIds.forEach(wid => {
        if (holeNumber <= 9) bump(nassauState.frontMatch, wid);
        else bump(nassauState.backMatch, wid);
        bump(nassauState.overallMatch, wid);
      });
    } else {
      result.playerResults.forEach(pr => {
        totals[pr.id] = (totals[pr.id] || 0) + pr.amount;
      });
    }

    carryOver = result.carryOver || 0;
    holeResults.push({ hole: holeNumber, ...result });
  }

  // Final Nassau settlement — segments only (presses not carried through replay)
  let nassauSettlement: NassauSettlement | undefined;
  if (gameMode === 'nassau' && nassauState) {
    nassauSettlement = calculateNassauSettlement(
      players,
      nassauTeams,
      nassauState,
      holeValue,
      holes.length,
    );
    players.forEach(p => { totals[p.id] = nassauSettlement!.playerAmounts[p.id] || 0; });
  }

  return { totals, holeResults, nassauSettlement };
}
