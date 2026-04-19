/**
 * [No, scored it out at 2^D×] [Yes, hammer back] — decision buttons
 * after the previous depth was accepted. The responder at the previous
 * depth is now the potential new thrower: if they "hammer back" we go
 * one level deeper; otherwise the hole scores out at the current
 * multiplier.
 */

interface HammerBackButtonsProps {
  /** Depth that was just accepted — scoredOut multiplier would be 2^currentDepth. */
  currentDepth: number;
  nextThrowerTeamName: string;
  onScoreOut: () => void;
  onHammerBack: () => void;
  disabled?: boolean;
}

export default function HammerBackButtons({
  currentDepth,
  nextThrowerTeamName,
  onScoreOut,
  onHammerBack,
  disabled = false,
}: HammerBackButtonsProps): JSX.Element {
  const multiplier = Math.pow(2, currentDepth);
  return (
    <div data-testid="hammer-back-buttons" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onScoreOut}
        disabled={disabled}
        aria-label={`No hammer back — score the hole out at ${multiplier} times`}
        data-testid="hammer-back-score-out"
        className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-4 border-border bg-background p-4 text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <span className="text-base font-bold">No — score it out</span>
        <span className="text-sm text-muted-foreground">at {multiplier}× the hole value</span>
      </button>
      <button
        type="button"
        onClick={onHammerBack}
        disabled={disabled}
        aria-label={`Yes — ${nextThrowerTeamName} hammers back at depth ${currentDepth + 1}`}
        data-testid="hammer-back-yes"
        className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-4 border-primary bg-primary p-4 text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <span aria-hidden="true" className="text-2xl">🔨</span>
        <span className="text-base font-bold">Yes — hammer back</span>
        <span className="text-xs opacity-80">{nextThrowerTeamName} throws at depth {currentDepth + 1}</span>
      </button>
    </div>
  );
}
