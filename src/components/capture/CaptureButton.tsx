/**
 * Always-visible FAB that opens the ad-hoc capture flow.
 *
 * Render rules (enforced by the caller, not this component):
 *   1. Current user is the scorekeeper (round_players.is_scorekeeper = true).
 *   2. Round status is 'active' (not setup, completed, or canceled).
 *   3. No other capture is currently in flight.
 *
 * The button itself is purely presentational — the parent decides when
 * to render it.
 *
 * PR #27: Photo capture removed from gameplay UI. This component is
 * no longer rendered anywhere in the runtime. The file is kept so
 * existing round_captures rows + scorecards storage entries keep
 * displaying via CaptureTile + CaptureAppliedCard, and so the
 * feature can be resurrected later. No active call sites; safe to
 * delete after a few months of dead-code monitoring.
 */

interface CaptureButtonProps {
  onOpen: () => void;
  /** Disabled while another capture is in flight; also when cadence-blocked elsewhere. */
  disabled?: boolean;
  /** Accessibility label; defaults to "Take scorecard photo". */
  label?: string;
}

export default function CaptureButton({ onOpen, disabled = false, label = "Take scorecard photo" }: CaptureButtonProps): JSX.Element {
  return (
    <button
      data-testid="capture-button"
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={label}
      className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <span aria-hidden="true">📷</span>
    </button>
  );
}
