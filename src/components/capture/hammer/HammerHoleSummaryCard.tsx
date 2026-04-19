import type { HoleHammerState } from "@/lib/hammerMath";
import { resolveHammerOutcome } from "@/lib/hammerMath";

/**
 * One row in the summary grid: a hole + its current hammer state, with
 * an [Edit] button that lets the user jump back into the prompt for
 * that hole.
 */

interface HammerHoleSummaryCardProps {
  hole: number;
  state: HoleHammerState;
  teamNames: { A: string; B: string };
  onEdit: (hole: number) => void;
}

function describe(state: HoleHammerState, teamNames: { A: string; B: string }): string {
  const outcome = resolveHammerOutcome(state);
  switch (outcome.source) {
    case "no_hammer":
      return "No hammers";
    case "scored_out":
      return `D${outcome.scoredOutAtDepth} accepted, scored out at ${outcome.multiplier}×`;
    case "laid_down": {
      const loser = outcome.winner === "A" ? teamNames.B : teamNames.A;
      return `D${outcome.laidDownAtDepth} laid down by ${loser} → ${teamNames[outcome.winner]} wins at ${outcome.multiplier}×`;
    }
  }
}

export default function HammerHoleSummaryCard({
  hole,
  state,
  teamNames,
  onEdit,
}: HammerHoleSummaryCardProps): JSX.Element {
  const summary = describe(state, teamNames);
  return (
    <div
      data-testid={`hammer-summary-card-${hole}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2"
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hole {hole}
        </div>
        <div className="truncate text-sm text-foreground">{summary}</div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(hole)}
        aria-label={`Edit hammer state for hole ${hole}`}
        className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
      >
        Edit
      </button>
    </div>
  );
}
