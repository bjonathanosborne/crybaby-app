import { useMemo } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import CapturePhotoThumbnail from "@/components/round/events/CapturePhotoThumbnail";
import {
  largestMover,
  type MergedCaptureEvent,
} from "@/components/round/events/captureEventTypes";

/**
 * Capture tile rendered in the MAIN feed (CrybabyFeed.jsx). Smaller and
 * denser than the per-round RoundLiveFeed card — this is one tile
 * among many in a global feed, so it has to be scannable without
 * losing the visual "capture" vibe.
 *
 * Layout:
 *   [thumb] creator name · course
 *           one-line summary: "Hole 14 captured · +$40 swing"
 *           timestamp ago
 * Whole tile is tappable → navigates to /watch?roundId=... for live
 * spectating.
 *
 * Only rendered when merged.appliedData.feed_published_at !== null
 * (caller filters). Private rounds never reach this render path.
 */

export interface CaptureTileProps {
  merged: MergedCaptureEvent;
  /** Player id → display name (used for the headline if we have a mover). */
  playerNames: Record<string, string>;
  /** Course name to show in the secondary line. */
  courseName: string;
  /** Display name for the round's creator (scorekeeper). */
  scorekeeperName?: string;
  /** Round id for tap-through navigation. */
  roundId: string;
}

function formatMoneyAbs(n: number): string {
  return `$${Math.abs(n)}`;
}

export default function CaptureTile(props: CaptureTileProps): JSX.Element {
  const { merged, playerNames, courseName, scorekeeperName, roundId } = props;
  const navigate = useNavigate();

  const { appliedData, moneyShiftData, holeNumber, createdAt } = merged;

  const { rangeStart, rangeEnd } = useMemo(() => {
    const holes = (appliedData.delta ?? []).map(d => d.hole);
    if (holes.length === 0) return { rangeStart: holeNumber, rangeEnd: holeNumber };
    return { rangeStart: Math.min(...holes), rangeEnd: Math.max(...holes) };
  }, [appliedData.delta, holeNumber]);

  const rangeLabel = rangeStart === rangeEnd ? `Hole ${rangeStart}` : `Holes ${rangeStart}–${rangeEnd}`;
  const mover = moneyShiftData ? largestMover(moneyShiftData) : null;

  const summary = useMemo<string>(() => {
    if (mover && mover.delta !== 0) {
      const sign = mover.delta > 0 ? "+" : "−";
      const moverName = playerNames[mover.playerId] ?? mover.playerId;
      return `${rangeLabel} captured · ${moverName} ${sign}${formatMoneyAbs(mover.delta)}`;
    }
    return `${rangeLabel} captured`;
  }, [mover, playerNames, rangeLabel]);

  const handleTap = () => {
    // The app's round spectate route is /watch?roundId=<id>.
    navigate(`/watch?roundId=${roundId}`);
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      data-testid="capture-tile"
      aria-label={`${summary}. Tap to watch live.`}
      className="w-full rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <div className="flex items-start gap-3">
        <CapturePhotoThumbnail
          photoPath={appliedData.photo_path}
          size="md"
          captureLabel={`scorecard for ${rangeLabel}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md"
              style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
            >
              📷 Capture
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(parseISO(createdAt), { addSuffix: true })}
            </span>
          </div>
          {scorekeeperName ? (
            <p className="text-xs text-muted-foreground mt-1">
              {scorekeeperName} · {courseName}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              {courseName}
            </p>
          )}
          <p
            data-testid="capture-tile-summary"
            className="text-sm font-semibold text-foreground mt-1 leading-snug"
            style={mover && mover.delta !== 0 ? { color: mover.delta > 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))" } : undefined}
          >
            {summary}
          </p>
        </div>
      </div>
    </button>
  );
}
