import type { Player } from "@/lib/gameEngines";

/**
 * Shown ONLY when the capturer's confirmed scores differ from what's
 * currently applied (persisted in round_players.hole_scores). Two-column
 * diff: "Currently applied" vs "New capture". Cells that differ are
 * highlighted. User chooses Overwrite or Cancel.
 *
 * If `apply-capture` returns `{ noop: true }`, this dialog is NEVER
 * constructed — the CaptureFlow skips straight to done/close.
 */

interface DiffRow {
  playerId: string;
  playerName: string;
  hole: number;
  prior: number | null;
  next: number;
}

interface CaptureDisputeDialogProps {
  /** Per-player row in the diff table. */
  diffs: DiffRow[];
  players: Player[];
  onOverwrite: () => void;
  onCancel: () => void;
}

export default function CaptureDisputeDialog({ diffs, onOverwrite, onCancel }: CaptureDisputeDialogProps): JSX.Element {
  // Group diffs by hole for a row-per-hole layout; easier to read than a
  // raw list of cells when multiple players have changes on the same hole.
  const byHole = new Map<number, DiffRow[]>();
  for (const d of diffs) {
    const rows = byHole.get(d.hole) ?? [];
    rows.push(d);
    byHole.set(d.hole, rows);
  }
  const sortedHoles = Array.from(byHole.keys()).sort((a, b) => a - b);

  return (
    <div
      data-testid="capture-dispute-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispute-title"
      aria-describedby="dispute-desc"
      className="flex flex-col gap-4 px-4 py-4"
    >
      <header className="space-y-1">
        <h2 id="dispute-title" className="font-pacifico text-xl text-foreground">
          Overwrite current scores?
        </h2>
        <p id="dispute-desc" className="text-xs text-muted-foreground">
          The new capture changes {diffs.length} cell{diffs.length === 1 ? "" : "s"}.
          This will supersede the previously applied capture for the same holes.
        </p>
      </header>

      <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-sm" aria-label="Differences between current and new scores">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Hole</th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Player</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Current</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-primary">New</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoles.map(hole => byHole.get(hole)!.map((row, i) => (
              <tr key={`${row.playerId}-${row.hole}`} className={i === 0 ? "border-t border-border" : ""}>
                {i === 0 ? (
                  <td scope="row" className="px-3 py-2 align-top text-sm font-medium text-foreground">{hole}</td>
                ) : (
                  <td className="px-3 py-2" />
                )}
                <td className="px-3 py-2 text-sm text-foreground">{row.playerName}</td>
                <td className="px-3 py-2 text-right font-mono text-sm text-muted-foreground">
                  {row.prior == null ? "—" : row.prior}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-primary">
                  {row.next}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

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
          onClick={onOverwrite}
          className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Overwrite with new
        </button>
      </div>
    </div>
  );
}
