// ============================================================
// Pure helpers for the profile rounds list.
//
// Kept separate from the React components so tests can exercise
// the grouping / P&L / score math without rendering anything.
// ============================================================

import type { UserRoundSummary } from "@/lib/db";

export type DateFilter = "all" | "30d" | "90d";

/** Human-readable label for a game_type token. */
export function gameModeLabel(gameType: string): string {
  switch (gameType) {
    case "drivers_others_carts": return "DOC";
    case "solo": return "Solo";
    case "skins": return "Skins";
    case "nassau": return "Nassau";
    case "wolf": return "Wolf";
    case "flip": return "Flip";
    case "custom": return "Custom";
    default: return gameType;
  }
}

/** Filter a round list by a client-side date window. */
export function applyDateFilter(
  rounds: UserRoundSummary[],
  filter: DateFilter,
  now: Date = new Date(),
): UserRoundSummary[] {
  if (filter === "all") return rounds;
  const days = filter === "30d" ? 30 : 90;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return rounds.filter(r => new Date(r.created_at).getTime() >= cutoff);
}

/**
 * Money P&L for a specific user on a specific round.
 * Returns null when the round has no settlement rows (solo / non-money).
 * Guest settlements are keyed by guest_name — we only expose the user's
 * own P&L here, so guest rows aren't reachable via this helper.
 */
export function playerPnl(round: UserRoundSummary, userId: string): number | null {
  if (!round.round_settlements || round.round_settlements.length === 0) return null;
  const mine = round.round_settlements.find(s => s.user_id === userId);
  return mine ? Number(mine.amount) : 0;
}

/** Sum the user's P&L across a list of rounds. Null rounds contribute 0. */
export function cumulativePnl(rounds: UserRoundSummary[], userId: string): number {
  let total = 0;
  for (const r of rounds) {
    const amt = playerPnl(r, userId);
    if (amt !== null) total += amt;
  }
  return total;
}

/** Score + par total for the user on this round. Null if user didn't play or has no holes scored. */
export function playerScore(
  round: UserRoundSummary,
  userId: string,
): { total: number; par: number; diff: number; holesPlayed: number } | null {
  const player = round.round_players.find(p => p.user_id === userId);
  if (!player) return null;
  const raw = player.hole_scores;
  const holeScores: number[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.keys(raw).sort((a, b) => Number(a) - Number(b)).map(k => (raw as Record<string, number>)[k])
      : [];
  const holesPlayed = holeScores.filter(s => s > 0).length;
  if (holesPlayed === 0) return null;
  const total = typeof player.total_score === "number" && player.total_score > 0
    ? player.total_score
    : holeScores.reduce((a, b) => a + (b || 0), 0);
  const pars = round.course_details?.pars || [];
  const par = pars.slice(0, holesPlayed).reduce((a, b) => a + (b || 0), 0);
  return { total, par, diff: total - par, holesPlayed };
}

/** Partner list for the user, excluding themselves. Max `max` names, overflow suffix. */
export function partnerNames(
  round: UserRoundSummary,
  userId: string,
  max = 3,
): { names: string[]; overflow: number } {
  const all: string[] = [];
  for (const p of round.round_players) {
    if (p.user_id === userId) continue;
    const name = p.user_id
      ? round.participant_names[p.user_id] || p.guest_name || "Player"
      : p.guest_name || "Guest";
    all.push(name);
  }
  return {
    names: all.slice(0, max),
    overflow: Math.max(0, all.length - max),
  };
}

// ============================================================
// Grouping: Recent (≤5) / Current-year months / Prior years
// ============================================================

export interface RoundsGrouping {
  recent: UserRoundSummary[];
  currentYearMonths: Array<{ key: string; label: string; monthIdx: number; rounds: UserRoundSummary[] }>;
  priorYears: Array<{
    year: number;
    label: string;
    months: Array<{ key: string; label: string; monthIdx: number; rounds: UserRoundSummary[] }>;
    pnl: number;
  }>;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Partition a rounds list into:
 *   - recent: the 5 most-recent rounds overall (strict)
 *   - currentYearMonths: months of the current (viewer-local) year that have
 *     rounds, EXCLUDING rounds already in recent[]
 *   - priorYears: years with their month-rollup, descending, again with
 *     rounds from recent[] excluded
 *
 * Returns empty collections when `rounds` is empty. Assumes `rounds` is
 * already sorted newest-first (loadUserRounds guarantees this).
 */
export function groupRounds(
  rounds: UserRoundSummary[],
  now: Date = new Date(),
): RoundsGrouping {
  const recent = rounds.slice(0, 5);
  const recentIds = new Set(recent.map(r => r.id));
  const rest = rounds.filter(r => !recentIds.has(r.id));

  const currentYear = now.getFullYear();
  const currentYearMonthsMap = new Map<string, UserRoundSummary[]>();
  const priorYearsMap = new Map<number, Map<string, UserRoundSummary[]>>();

  for (const r of rest) {
    const d = new Date(r.created_at);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-11
    const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
    if (y === currentYear) {
      const bucket = currentYearMonthsMap.get(monthKey) || [];
      bucket.push(r);
      currentYearMonthsMap.set(monthKey, bucket);
    } else {
      let yearMap = priorYearsMap.get(y);
      if (!yearMap) {
        yearMap = new Map();
        priorYearsMap.set(y, yearMap);
      }
      const bucket = yearMap.get(monthKey) || [];
      bucket.push(r);
      yearMap.set(monthKey, bucket);
    }
  }

  const buildMonths = (entries: [string, UserRoundSummary[]][]) =>
    entries
      .sort((a, b) => b[0].localeCompare(a[0])) // newest-first by yyyy-mm string
      .map(([key, bucket]) => {
        const [y, m] = key.split("-").map(Number);
        return {
          key,
          label: `${MONTH_NAMES[m - 1]} ${y}`,
          monthIdx: m - 1,
          rounds: bucket,
        };
      });

  const currentYearMonths = buildMonths(Array.from(currentYearMonthsMap.entries()));

  const priorYears = Array.from(priorYearsMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, monthsMap]) => {
      const months = buildMonths(Array.from(monthsMap.entries()));
      return {
        year,
        label: String(year),
        months,
        // pnl computed at render time (needs userId); leave 0 placeholder.
        pnl: 0,
      };
    });

  return { recent, currentYearMonths, priorYears };
}

/**
 * Compute a round-card's primary date string. The viewing-context year
 * (`contextYear`, default: current year) is suppressed; any year that
 * differs is included to avoid ambiguity.
 */
export function formatCardDate(iso: string, contextYear?: number): string {
  const d = new Date(iso);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  const day = d.getDate();
  const y = d.getFullYear();
  const ctx = contextYear ?? new Date().getFullYear();
  if (y === ctx) return `${month} ${day}`;
  return `${month} ${day}, ${y}`;
}
