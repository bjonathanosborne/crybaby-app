import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadRoundEvents } from "@/lib/db";
import {
  mergeCaptureEvents,
  strokesOverPar,
  type RoundEventRow,
} from "./events/captureEventTypes";

/**
 * LiveStandings — a realtime panel that shows where every player stands
 * RIGHT NOW. Renders at the top of RoundLiveFeed (collapsible).
 *
 * Data flow:
 *   1. On mount, load the round's events + round_players for the initial
 *      render. The latest `capture_applied` event's running_totals is
 *      money truth; if none exists, money is zero and strokes come from
 *      the raw hole_scores JSONB.
 *   2. Subscribe to realtime round_events INSERT for this round. Each
 *      new event re-derives the standings (cheap at foursome scale).
 *   3. If the realtime subscription fails to establish OR drops, we keep
 *      rendering the last known state and retry silently. No banner
 *      unless failure persists > 30s (future enhancement).
 *
 * Multi-game note: the current data model has one `gameMode` per round;
 * running_totals is a single money column. Layout is structured so a
 * future multi-game extension just swaps `money` for an array.
 */

interface LiveStandingsProps {
  roundId: string;
  /** Display names for each round_player. Parent supplies. */
  playerNames: Record<string, string>;
  /** The game mode label for the money column header (e.g. "Nassau"). */
  gameLabel: string;
  /**
   * Course pars (length 18). Used for strokes-over-par derivation when
   * no capture event exists yet.
   */
  pars: number[];
  /**
   * Initial raw hole_scores from round_players (keyed by round_player_id).
   * Used as the fallback for strokes-over-par when no captures exist.
   */
  initialHoleScores?: Record<string, Record<number, number>>;
  /**
   * Initial totals from round_players.total_score — used for money when
   * no capture events exist yet.
   */
  initialTotals?: Record<string, number>;
  /**
   * If true, hide the money columns (solo rounds where money isn't tracked).
   */
  hideMoney?: boolean;
  /**
   * Ids of players currently holding an open hammer (not yet resolved) —
   * optional, drives a small badge next to the player name. Derived by
   * the parent from game_state.
   */
  openHammerPlayerIds?: string[];
}

interface StandingRow {
  playerId: string;
  playerName: string;
  strokesVsPar: number | null;
  money: number;
  hasOpenHammer: boolean;
}

function strokesIndicator(delta: number | null): { label: string; direction: "up" | "down" | "even" } {
  if (delta === null) return { label: "—", direction: "even" };
  if (delta > 0) return { label: `+${delta}`, direction: "up" };
  if (delta < 0) return { label: String(delta), direction: "down" };
  return { label: "E", direction: "even" };
}

function moneyText(n: number): string {
  if (n === 0) return "$0";
  const sign = n > 0 ? "+" : "−";
  return `${sign}$${Math.abs(n)}`;
}

export default function LiveStandings(props: LiveStandingsProps): JSX.Element {
  const {
    roundId,
    playerNames,
    gameLabel,
    pars,
    initialHoleScores = {},
    initialTotals = {},
    hideMoney = false,
    openHammerPlayerIds = [],
  } = props;

  // Whether the panel is collapsed. Defaults to expanded on first mount.
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Raw state that drives the derived rows.
  const [runningTotals, setRunningTotals] = useState<Record<string, number>>(initialTotals);
  const [holeScores, setHoleScores] = useState<Record<string, Record<number, number>>>(initialHoleScores);

  // Initial load — pull the latest capture_applied event's running_totals
  // if present; otherwise stick with props' initialTotals.
  const refresh = useCallback(async () => {
    try {
      const evts = await loadRoundEvents(roundId);
      const { merged } = mergeCaptureEvents(evts as RoundEventRow[]);
      if (merged.length === 0) return;
      // Latest merged event wins.
      const latest = merged[merged.length - 1];
      const newTotals = latest.appliedData.running_totals;
      if (newTotals && typeof newTotals === "object") {
        setRunningTotals(newTotals);
      }
      // Rebuild hole_scores from all applied deltas so strokes-over-par
      // stays in sync as captures land.
      const nextHoleScores: Record<string, Record<number, number>> = {};
      for (const m of merged) {
        for (const d of m.appliedData.delta ?? []) {
          if (!nextHoleScores[d.playerId]) nextHoleScores[d.playerId] = {};
          nextHoleScores[d.playerId][d.hole] = d.next;
        }
      }
      if (Object.keys(nextHoleScores).length > 0) {
        // Merge with initial (which may have pre-capture scores).
        setHoleScores(prev => {
          const out: Record<string, Record<number, number>> = { ...prev };
          for (const [pid, byHole] of Object.entries(nextHoleScores)) {
            out[pid] = { ...(out[pid] ?? {}), ...byHole };
          }
          return out;
        });
      }
    } catch (err) {
      console.warn("[LiveStandings] refresh failed; keeping last-known state", err);
    }
  }, [roundId]);

  // Subscribe to realtime round_events INSERT. On each new event, re-derive.
  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`standings-${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "round_events", filter: `round_id=eq.${roundId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roundId, refresh]);

  const strokesByPlayer = useMemo<Record<string, number | null>>(() => {
    return strokesOverPar(holeScores, pars);
  }, [holeScores, pars]);

  const rows = useMemo<StandingRow[]>(() => {
    const ids = new Set<string>([
      ...Object.keys(playerNames),
      ...Object.keys(runningTotals),
      ...Object.keys(strokesByPlayer),
    ]);
    const out: StandingRow[] = [];
    const openHammerSet = new Set(openHammerPlayerIds);
    for (const id of ids) {
      out.push({
        playerId: id,
        playerName: playerNames[id] ?? id,
        strokesVsPar: strokesByPlayer[id] ?? null,
        money: runningTotals[id] ?? 0,
        hasOpenHammer: openHammerSet.has(id),
      });
    }
    // Sort by money desc (biggest winner at top); ties broken by name.
    out.sort((a, b) => {
      if (b.money !== a.money) return b.money - a.money;
      return a.playerName.localeCompare(b.playerName);
    });
    return out;
  }, [playerNames, runningTotals, strokesByPlayer, openHammerPlayerIds]);

  if (rows.length === 0) {
    return (
      <div
        data-testid="live-standings-empty"
        className="rounded-xl border border-dashed border-border p-3 text-center text-xs italic text-muted-foreground"
      >
        No players yet.
      </div>
    );
  }

  return (
    <div
      data-testid="live-standings"
      className="rounded-2xl border border-border bg-card"
    >
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        aria-controls="live-standings-rows"
        data-testid="live-standings-toggle"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Standings
          {hideMoney ? null : (
            <span className="ml-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {gameLabel}
            </span>
          )}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {!collapsed ? (
        <div
          id="live-standings-rows"
          className="flex flex-col gap-1 border-t border-border px-3 py-2"
        >
          {rows.map(row => {
            const indicator = strokesIndicator(row.strokesVsPar);
            const indicatorColor =
              indicator.direction === "up"
                ? "text-destructive"
                : indicator.direction === "down"
                  ? "text-primary"
                  : "text-muted-foreground";
            const indicatorIcon =
              indicator.direction === "up"
                ? "▲"
                : indicator.direction === "down"
                  ? "▼"
                  : "•";
            return (
              <div
                key={row.playerId}
                data-testid={`live-standings-row-${row.playerId}`}
                className="flex items-center justify-between gap-2 py-1"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-sm font-medium text-foreground">
                    {row.playerName}
                  </span>
                  {row.hasOpenHammer ? (
                    <span
                      data-testid={`live-standings-hammer-badge-${row.playerId}`}
                      aria-label="Open hammer held"
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900"
                    >
                      🔨
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    data-testid={`live-standings-strokes-${row.playerId}`}
                    aria-label={`${row.playerName} strokes ${indicator.direction === "up" ? "over" : indicator.direction === "down" ? "under" : "at"} par: ${indicator.label}`}
                    className={`flex items-center gap-1 text-xs font-mono ${indicatorColor}`}
                  >
                    <span aria-hidden="true">{indicatorIcon}</span>
                    <span>{indicator.label}</span>
                  </span>
                  {hideMoney ? null : (
                    <span
                      data-testid={`live-standings-money-${row.playerId}`}
                      className={`text-sm font-mono font-bold ${row.money > 0 ? "text-primary" : row.money < 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {moneyText(row.money)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
