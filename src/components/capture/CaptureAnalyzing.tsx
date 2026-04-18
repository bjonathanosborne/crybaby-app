import { useEffect, useRef } from "react";

/**
 * "Analyzing" step of the capture flow. Shimmer-skeleton grid + status
 * message while the extract-scores edge function runs.
 *
 * Gets a ref to an AbortController so the parent can cancel the analysis
 * if the user navigates away. The actual analysis fetch is owned by
 * CaptureFlow; this component is purely presentational + passes onCancel
 * up for the "Cancel" affordance.
 */

interface CaptureAnalyzingProps {
  /** Optional warning banner (e.g. "Photo still uploading — apply will complete anyway"). */
  banner?: string | null;
  onCancel: () => void;
}

export default function CaptureAnalyzing({ banner, onCancel }: CaptureAnalyzingProps): JSX.Element {
  // Trap focus on the cancel button when the analyzing step opens so
  // keyboard users can always back out.
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="capture-analyzing"
      className="flex flex-col items-center gap-6 px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div aria-hidden="true" className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground">
          🤖
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="font-pacifico text-2xl text-foreground">Reading the card…</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Pulling scores out of your photo. Usually under ten seconds.
        </p>
      </div>

      {/* Skeleton grid — three rows of shimmery cells so the user has something to look at */}
      <div className="grid w-full max-w-sm grid-cols-4 gap-2" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-8 animate-pulse rounded-md bg-muted"
            style={{ animationDelay: `${(i % 4) * 80}ms` }}
          />
        ))}
      </div>

      {banner ? (
        <div
          role="note"
          className="rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2 text-xs text-yellow-900"
        >
          {banner}
        </div>
      ) : null}

      <button
        ref={cancelRef}
        type="button"
        className="text-sm text-muted-foreground underline hover:text-foreground"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
