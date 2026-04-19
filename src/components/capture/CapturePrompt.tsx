/**
 * Blocking banner rendered at the top of the active-round UI when
 * `useCaptureCadence().blockedOnPhoto` is true and no capture has been
 * applied for the current hole.
 *
 * The banner is NOT dismissible by the user — the only way to clear it
 * is to complete a capture. The parent component disables the
 * Next-hole button while this banner is visible.
 */

interface CapturePromptProps {
  /** Copy shown in the banner, typically from `cadenceReason(round, hole)`. */
  reason: string;
  onCapture: () => void;
  /** Disabled while a capture is in flight. */
  captureInFlight?: boolean;
}

export default function CapturePrompt({ reason, onCapture, captureInFlight = false }: CapturePromptProps): JSX.Element {
  return (
    <div
      data-testid="capture-prompt"
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-30 flex items-center gap-3 border-b border-yellow-500/30 bg-yellow-50 px-4 py-3 shadow-sm"
    >
      <div aria-hidden="true" className="text-xl">📸</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-yellow-900">Photo needed to continue</div>
        <div className="text-xs text-yellow-800">{reason}</div>
      </div>
      <button
        type="button"
        onClick={onCapture}
        disabled={captureInFlight}
        className="whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {captureInFlight ? "Opening…" : "Capture now"}
      </button>
    </div>
  );
}
