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

export function getTeamsForHole(gameMode: GameMode, holeNumber: number, players: Player[], flipTeams?: TeamInfo | null): TeamInfo | null {
  switch (gameMode) {
    case 'drivers_others_carts':
      return getDOCTeams(holeNumber, players);
    case 'flip':
      return flipTeams || null;
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
        playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
        quip: 'Halved. Nobody wins this hole.',
      };
    }

    const winner = winners[0];
    return {
      push: false,
      winnerName: winner.name,
      amount: holeValue,
      carryOver: 0,
      playerResults: players.map(p => ({
        id: p.id, name: p.name,
        amount: p.id === winner.id ? holeValue * (players.length - 1) : -holeValue,
      })),
      quip: `${winner.name} wins the hole.`,
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
      playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
      quip: 'Halved. All square.',
    };
  }

  const winnerTeam = teamABest < teamBBest ? teams.teamA : teams.teamB;
  const loserTeam = teamABest < teamBBest ? teams.teamB : teams.teamA;

  return {
    push: false,
    winnerName: winnerTeam.name,
    amount: holeValue,
    carryOver: 0,
    playerResults: players.map(p => ({
      id: p.id, name: p.name,
      amount: winnerTeam.players.some(tp => tp.id === p.id) ? holeValue : -holeValue,
    })),
    quip: `${winnerTeam.name} takes the hole. ${loserTeam.name} needs to answer.`,
  };
}

export function calculateNassauSettlement(
  nassauState: NassauState,
  players: Player[],
  teams: TeamInfo | null,
  holeValue: number,
): { id: string; name: string; amount: number }[] {
  // Nassau has 3 bets: front 9, back 9, overall
  // Each bet = holeValue amount
  // Winner of each bet = whoever won more holes in that segment
  const betValue = holeValue * 9; // Total bet per segment = holeValue × 9 holes

  if (!teams) {
    // Individual Nassau
    const totals: Record<string, number> = {};
    players.forEach(p => { totals[p.id] = 0; });

    // Front 9 bet
    const frontResults = settleNassauBet(players, nassauState.frontMatch, betValue);
    // Back 9 bet
    const backResults = settleNassauBet(players, nassauState.backMatch, betValue);
    // Overall bet
    const overallResults = settleNassauBet(players, nassauState.overallMatch, betValue);

    players.forEach(p => {
      totals[p.id] = (frontResults[p.id] || 0) + (backResults[p.id] || 0) + (overallResults[p.id] || 0);
    });

    return players.map(p => ({ id: p.id, name: p.name, amount: totals[p.id] }));
  }

  return players.map(p => ({ id: p.id, name: p.name, amount: 0 }));
}

function settleNassauBet(players: Player[], holesWon: Record<string, number>, betValue: number): Record<string, number> {
  const result: Record<string, number> = {};
  players.forEach(p => { result[p.id] = 0; });

  // Find who won the most holes
  let maxWins = 0;
  players.forEach(p => { if ((holesWon[p.id] || 0) > maxWins) maxWins = holesWon[p.id] || 0; });

  const winners = players.filter(p => (holesWon[p.id] || 0) === maxWins && maxWins > 0);
  if (winners.length === 1) {
    const winner = winners[0];
    const losers = players.filter(p => p.id !== winner.id);
    const perLoser = Math.round(betValue / losers.length);
    result[winner.id] = perLoser * losers.length;
    losers.forEach(l => { result[l.id] = -perLoser; });
  }

  return result;
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
