import { useMemo } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import CapturePhotoThumbnail from "./CapturePhotoThumbnail";
import {
  largestMover,
  type MergedCaptureEvent,
} from "./captureEventTypes";

/**
 * Full capture card rendered inside RoundLiveFeed. Merges the
 * `capture_applied` event with its matching `capture_money_shift` (if the
 * server emitted one) into a single visual unit.
 *
 * Layout:
 *   [photo thumb] | scorekeeper name + timestamp
 *                 | hole range label
 *                 | (if money shifted) big headline: "Grant +$40 on hole 14"
 *                 | per-player delta summary
 *                 | per-player running totals
 *                 | (if hammers present) small badge
 */

export interface CaptureAppliedCardProps {
  merged: MergedCaptureEvent;
  /** Player id → display name. Supplied by the parent round context. */
  playerNames: Record<string, string>;
  /** Scorekeeper display name to show in the header (if available). */
  scorekeeperName?: string;
  /** Count of holes in this capture with non-empty hammer state (for badge). */
  hammerHoleCount?: number;
}

function formatMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs}`;
}

function formatStroke(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

export default function CaptureAppliedCard(props: CaptureAppliedCardProps): JSX.Element {
  const { merged, playerNames, scorekeeperName, hammerHoleCount = 0 } = props;
  const { appliedData, moneyShiftData, holeNumber, createdAt } = merged;

  // Compute the hole range this capture covered. appliedData.delta has
  // per-player-per-hole entries; the hole range is min..max of those,
  // or just holeNumber if delta is empty (noop captures).
  const { rangeStart, rangeEnd } = useMemo(() => {
    const holes = (appliedData.delta ?? []).map(d => d.hole);
    if (holes.length === 0) return { rangeStart: holeNumber, rangeEnd: holeNumber };
    return { rangeStart: Math.min(...holes), rangeEnd: Math.max(...holes) };
  }, [appliedData.delta, holeNumber]);

  // Group delta entries by player for the summary line.
  const strokeDeltaByPlayer = useMemo<Array<{ playerId: string; addedStrokes: number }>>(() => {
    const byId: Record<string, number> = {};
    for (const d of appliedData.delta ?? []) {
      const added = typeof d.prior === "number" ? d.next - d.prior : d.next;
      byId[d.playerId] = (byId[d.playerId] ?? 0) + added;
    }
    return Object.entries(byId).map(([playerId, addedStrokes]) => ({ playerId, addedStrokes }));
  }, [appliedData.delta]);

  const mover = moneyShiftData ? largestMover(moneyShiftData) : null;
  const runningTotals = appliedData.running_totals ?? {};

  const rangeLabel = rangeStart === rangeEnd ? `Hole ${rangeStart}` : `Holes ${rangeStart}–${rangeEnd}`;

  return (
    <div
      data-testid="capture-applied-card"
      className="rounded-2xl border border-border bg-card p-3"
    >
      <div className="flex items-start gap-3">
        <CapturePhotoThumbnail
          photoPath={appliedData.photo_path}
          size="md"
          captureLabel={`scorecard for ${rangeLabel}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
            >
              📷 Capture · {rangeLabel}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(parseISO(createdAt), { addSuffix: true })}
            </span>
            {hammerHoleCount > 0 ? (
              <span
                data-testid="capture-applied-hammer-badge"
                className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-amber-100 text-amber-900"
              >
                🔨 {hammerHoleCount} hammer{hammerHoleCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {scorekeeperName ? (
            <p className="text-sm font-semibold text-foreground mt-1 leading-snug">
              {scorekeeperName}
            </p>
          ) : null}

          {/* Money-shift headline — only when the server emitted capture_money_shift */}
          {mover && mover.delta !== 0 ? (
            <p
              data-testid="capture-money-headline"
              className="text-base font-bold text-foreground mt-2 leading-snug"
              style={{ color: mover.delta > 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}
            >
              {playerNames[mover.playerId] ?? mover.playerId} {formatMoney(mover.delta)} on {rangeLabel.toLowerCase()}
            </p>
          ) : null}

          {/* Per-player stroke delta summary */}
          {strokeDeltaByPlayer.length > 0 ? (
            <p
              data-testid="capture-stroke-summary"
              className="text-xs text-muted-foreground mt-2 leading-relaxed"
            >
              <span className="font-semibold">New strokes:</span>{" "}
              {strokeDeltaByPlayer.map((d, i) => (
                <span key={d.playerId}>
                  {i > 0 ? ", " : ""}
                  {playerNames[d.playerId] ?? d.playerId} {formatStroke(d.addedStrokes)}
                </span>
              ))}
            </p>
          ) : null}

          {/* Running totals line */}
          {Object.keys(runningTotals).length > 0 ? (
            <p
              data-testid="capture-running-totals"
              className="text-xs text-foreground mt-1 leading-relaxed"
            >
              <span className="font-semibold text-muted-foreground">Money:</span>{" "}
              {Object.entries(runningTotals)
                .sort(([, a], [, b]) => b - a)
                .map(([pid, total], i) => (
                  <span key={pid} className="inline-block">
                    {i > 0 ? " · " : ""}
                    <span className="font-semibold">{playerNames[pid] ?? pid}</span>{" "}
                    <span className="font-mono">{formatMoney(total)}</span>
                  </span>
                ))}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
