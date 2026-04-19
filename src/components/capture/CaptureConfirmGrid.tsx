import { useCallback, useMemo, useState } from "react";
import type { Player } from "@/lib/gameEngines";
import { classifyConfidence, type ConfirmCell, type ConfidenceTier, type ExtractionResponse } from "./types";

/**
 * Editable hole × player grid.
 *
 * - Every cell is always editable regardless of tier.
 * - Confidence uses THREE distinct visual channels (not just color) per
 *   Concern spec: high (clean), medium (yellow border + triangle icon
 *   + aria "Review this"), low (red border + "?" circle icon +
 *   aria "Needs review"; must be filled before Apply enables).
 * - On narrow screens (<640px), renders as a vertical per-player list;
 *   on wider screens as a horizontal grid. Controlled by a simple
 *   Tailwind breakpoint.
 * - "Share to feed" toggle only shown for ad-hoc trigger. Default off.
 *   Always disabled (forced-off) on private rounds — communicated with a
 *   visible label.
 *
 * Apply button is disabled while any low-tier cell is empty. After fill,
 * it enables; on click, calls `onApply(confirmedScores, shareToFeed)`.
 */

interface CaptureConfirmGridProps {
  players: Player[];
  /** Inclusive hole range this capture covers. */
  holeRange: [number, number];
  /** Initial extraction (from the edge function or the manual-fallback empty shape). */
  extraction: ExtractionResponse;
  /** What's already persisted to the DB (used to seed un-extracted cells + show "unchanged"). */
  priorScores: Record<string, Record<number, number>>;
  /**
   * "game_driven" hides Share toggle (always true).
   * "ad_hoc" shows it (default off).
   * "post_round_correction" hides it (completed-round fixes publish by default).
   */
  trigger: "game_driven" | "ad_hoc" | "post_round_correction";
  /** Private rounds force Share off and disable the toggle. */
  roundPrivacy: "public" | "private";
  /** Current upload status — drives a small "Uploading photo…" spinner below the grid. */
  uploadStatus: "idle" | "uploading" | "done" | "failed";
  onApply: (confirmedScores: Record<string, Record<number, number>>, shareToFeed: boolean) => void;
  onCancel: () => void;
}

/**
 * Build the initial cell matrix from (extraction ∪ priorScores).
 * Precedence: extraction > prior. Unreadable cells get confidence="unreadable".
 */
function buildInitialCells(
  players: Player[],
  holeRange: [number, number],
  extraction: ExtractionResponse,
  priorScores: Record<string, Record<number, number>>,
): ConfirmCell[] {
  const cells: ConfirmCell[] = [];
  const unreadable = new Set(
    extraction.unreadable.map(u => `${u.player_id}:${u.hole}`),
  );
  for (const p of players) {
    for (let h = holeRange[0]; h <= holeRange[1]; h++) {
      const extractedVal = extraction.scores[p.id]?.[h];
      const priorVal = priorScores[p.id]?.[h];
      const isUnreadable = unreadable.has(`${p.id}:${h}`);
      const value = isUnreadable
        ? null
        : typeof extractedVal === "number"
          ? extractedVal
          : typeof priorVal === "number"
            ? priorVal
            : null;
      const confidence: ConfirmCell["confidence"] = isUnreadable
        ? "unreadable"
        : extraction.cellConfidence[p.id]?.[h] ?? null;
      cells.push({ playerId: p.id, hole: h, value, confidence });
    }
  }
  return cells;
}

function cellClassesForTier(tier: ConfidenceTier): string {
  switch (tier) {
    case "high":
      return "border-border focus:ring-primary";
    case "medium":
      return "border-yellow-500 focus:ring-yellow-600";
    case "low":
      return "border-destructive focus:ring-destructive";
  }
}

function iconForTier(tier: ConfidenceTier): JSX.Element | null {
  if (tier === "high") return null;
  if (tier === "medium") {
    return (
      <span
        aria-label="Review this cell"
        role="img"
        className="inline-flex h-3 w-3 items-center justify-center text-yellow-600"
        title="Review this cell"
      >
        ▲
      </span>
    );
  }
  return (
    <span
      aria-label="Needs review"
      role="img"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-destructive text-xs font-bold text-destructive"
      title="Needs review — fill in a score"
    >
      ?
    </span>
  );
}

export default function CaptureConfirmGrid(props: CaptureConfirmGridProps): JSX.Element {
  const { players, holeRange, extraction, priorScores, trigger, roundPrivacy, uploadStatus, onApply, onCancel } = props;

  const [cells, setCells] = useState<ConfirmCell[]>(() =>
    buildInitialCells(players, holeRange, extraction, priorScores),
  );
  // Share default:
  //   - ad_hoc: toggle shown, default off
  //   - game_driven / post_round_correction: toggle hidden, on for public
  //     rounds, off for private (server-side debounce in
  //     feedPublishDecision enforces the private rule as a belt).
  const [shareToFeed, setShareToFeed] = useState<boolean>(
    (trigger === "game_driven" || trigger === "post_round_correction") &&
      roundPrivacy === "public",
  );

  const holes: number[] = useMemo(() => {
    const out: number[] = [];
    for (let h = holeRange[0]; h <= holeRange[1]; h++) out.push(h);
    return out;
  }, [holeRange]);

  const cellAt = useCallback((playerId: string, hole: number): ConfirmCell | undefined => {
    return cells.find(c => c.playerId === playerId && c.hole === hole);
  }, [cells]);

  const handleCellChange = useCallback((playerId: string, hole: number, raw: string) => {
    setCells(prev => prev.map(c => {
      if (c.playerId !== playerId || c.hole !== hole) return c;
      if (raw === "") return { ...c, value: null };
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return c;
      const clamped = Math.max(1, Math.min(20, parsed));
      return { ...c, value: clamped };
    }));
  }, []);

  // Apply disabled until every low-tier (or unreadable) cell is filled.
  const canApply = useMemo<boolean>(() => {
    for (const c of cells) {
      const tier = classifyConfidence(c.confidence);
      if (tier === "low" && c.value == null) return false;
    }
    return true;
  }, [cells]);

  const handleApply = useCallback(() => {
    if (!canApply) return;
    // Serialize cells back to { playerId: { hole: value } }. Only include
    // cells with a non-null value; the server merges into prior state.
    const out: Record<string, Record<number, number>> = {};
    for (const c of cells) {
      if (c.value == null) continue;
      if (!out[c.playerId]) out[c.playerId] = {};
      out[c.playerId][c.hole] = c.value;
    }
    onApply(out, shareToFeed);
  }, [canApply, cells, shareToFeed, onApply]);

  const showShareToggle = trigger === "ad_hoc";
  const shareDisabled = roundPrivacy === "private";

  return (
    <div
      data-testid="capture-confirm-grid"
      className="flex flex-col gap-4 px-4 py-4"
    >
      <header className="space-y-1">
        <h2 className="font-pacifico text-xl text-foreground">Review scores</h2>
        <p className="text-xs text-muted-foreground">
          Yellow = double-check. Red = we couldn't read it — fill it in.
        </p>
      </header>

      {/* Mobile-first layout: horizontal scroll on small screens, grid on wider.
          The table renders as a simple 2-dim layout with player rows. */}
      <div className="overflow-x-auto">
        <table
          className="w-full border-separate border-spacing-x-1 border-spacing-y-2 text-sm"
          role="grid"
          aria-label="Scorecard confirm grid"
        >
          <thead>
            <tr>
              <th scope="col" className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Player
              </th>
              {holes.map(h => (
                <th key={h} scope="col" className="min-w-10 text-center text-xs font-semibold text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id}>
                <th scope="row" className="text-left text-sm font-medium text-foreground">
                  {p.name}
                </th>
                {holes.map(h => {
                  const cell = cellAt(p.id, h);
                  if (!cell) return <td key={h} />;
                  const tier = classifyConfidence(cell.confidence);
                  return (
                    <td key={h} className="relative text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={20}
                        value={cell.value == null ? "" : cell.value}
                        onChange={(e) => handleCellChange(p.id, h, e.target.value)}
                        placeholder={tier === "low" ? "?" : ""}
                        aria-label={`Hole ${h} score for ${p.name}${tier !== "high" ? " — " + (tier === "low" ? "needs review" : "check this") : ""}`}
                        aria-invalid={tier === "low" && cell.value == null}
                        className={`h-10 w-10 rounded-md border-2 bg-background text-center text-base font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 ${cellClassesForTier(tier)}`}
                      />
                      {tier !== "high" ? (
                        <span className="pointer-events-none absolute -right-1 -top-1">
                          {iconForTier(tier)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {extraction.notes ? (
        <p className="text-xs italic text-muted-foreground">AI note: {extraction.notes}</p>
      ) : null}

      {/* Share toggle — only ad-hoc triggers show it. Private rounds force-disable. */}
      {showShareToggle ? (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2">
          <input
            type="checkbox"
            checked={shareToFeed}
            disabled={shareDisabled}
            onChange={(e) => setShareToFeed(e.target.checked)}
            className="h-4 w-4 accent-primary"
            aria-describedby="share-help"
          />
          <span className="flex-1 text-sm">
            <span className="block font-medium text-foreground">Share to feed</span>
            <span id="share-help" className="block text-xs text-muted-foreground">
              {shareDisabled
                ? "This round is private — captures never post to the feed."
                : "Post a tile so followers see the latest standings."}
            </span>
          </span>
        </label>
      ) : null}

      {/* Upload status — never blocks apply */}
      {uploadStatus === "uploading" ? (
        <p role="status" className="text-xs text-muted-foreground">
          <span aria-hidden="true">⌛</span> Uploading photo to the round's audit log…
        </p>
      ) : uploadStatus === "failed" ? (
        <p role="status" className="text-xs text-yellow-700">
          Photo upload failed — scores will still apply; the photo won't be saved.
        </p>
      ) : null}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border-2 border-border bg-transparent px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          {canApply ? "Apply" : "Fill red cells first"}
        </button>
      </div>
    </div>
  );
}
