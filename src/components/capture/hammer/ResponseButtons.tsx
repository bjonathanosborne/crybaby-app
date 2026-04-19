/**
 * [Accepted] [Laid down] — the two responses at every depth. Large,
 * thumb-reachable, with clear action verbs. "Laid down" is styled
 * distinctly so the scorekeeper can't confuse it with Accepted
 * (shape + icon + text, not just color).
 */

interface ResponseButtonsProps {
  responderTeamName: string;
  onAccept: () => void;
  onLayDown: () => void;
  disabled?: boolean;
}

export default function ResponseButtons({
  responderTeamName,
  onAccept,
  onLayDown,
  disabled = false,
}: ResponseButtonsProps): JSX.Element {
  return (
    <div data-testid="response-buttons" className="flex gap-3">
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        aria-label={`${responderTeamName} accepted the hammer`}
        data-testid="response-accept"
        className="flex min-h-20 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-4 border-primary bg-primary p-4 text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <span aria-hidden="true" className="text-2xl">✊</span>
        <span className="text-base font-bold">Accepted</span>
      </button>
      <button
        type="button"
        onClick={onLayDown}
        disabled={disabled}
        aria-label={`${responderTeamName} laid down the hammer`}
        data-testid="response-lay-down"
        className="flex min-h-20 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-4 border-destructive bg-background p-4 text-destructive transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
      >
        <span aria-hidden="true" className="text-2xl">🐔</span>
        <span className="text-base font-bold">Laid down</span>
      </button>
    </div>
  );
}
