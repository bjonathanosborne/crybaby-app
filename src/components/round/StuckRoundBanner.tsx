import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  isRoundStuck,
  formatRoundAge,
  type StuckRoundCandidate,
} from "@/lib/stuckRound";

// ============================================================
// StuckRoundBanner (PR #23 D4-B)
//
// Replaces the inline "Round In Progress" banner on the feed with
// a richer two-button affordance — Resume + Abandon. Abandon is the
// self-service recovery path for rounds that crashed on mount,
// landing the user in a state where new-round creation is gated
// by an orphan `status='active'` row. Before this PR a user had
// to wait for DB-side intervention (like Jonathan's 2026-04-22
// orphan cleanup).
//
// Always-available Abandon is deliberate — we don't gate it on a
// stuck heuristic because false negatives strand users. When the
// heuristic DOES fire (game_state.currentHole null + round >
// STUCK_GRACE_MINUTES old), we upgrade the visual: swap the blue
// "in progress" styling for an amber "looks stuck" callout, and
// show the age. User still chooses between Resume and Abandon;
// we don't auto-abandon.
// ============================================================

export interface StuckRoundBannerRound extends StuckRoundCandidate {
  course?: string | null;
}

export interface StuckRoundBannerProps {
  round: StuckRoundBannerRound;
  /** Called when user confirms Abandon. Caller runs cancelRound(). */
  onAbandon: () => Promise<void> | void;
  /** Called when user taps Resume. Caller navigates to /round?id=X. */
  onResume: () => void;
  /** Set true while Abandon is in-flight to disable both buttons + swap label. */
  abandoning?: boolean;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

export function StuckRoundBanner({
  round,
  onAbandon,
  onResume,
  abandoning = false,
  now,
}: StuckRoundBannerProps): JSX.Element {
  const stuck = isRoundStuck(round, now);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const palette = stuck
    ? {
        chipBg: "bg-amber-100",
        chipBorder: "border-amber-300",
        chipText: "text-amber-900",
        title: "Looks Stuck",
        subtitle: round.course || "Round setup crashed",
      }
    : {
        chipBg: "bg-primary/10",
        chipBorder: "border-primary/20",
        chipText: "text-primary",
        title: "Round In Progress",
        subtitle: round.course || "Active round",
      };

  return (
    <>
      <div
        data-testid="stuck-round-banner"
        data-stuck={stuck ? "true" : "false"}
        className={`mx-4 mb-1 px-4 py-3 rounded-2xl border flex flex-col gap-2 ${palette.chipBg} ${palette.chipBorder}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg" aria-hidden>
            {stuck ? "⚠️" : "🏌️"}
          </span>
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] font-bold uppercase tracking-wider ${palette.chipText}`}>
              {palette.title}
            </div>
            <div className="text-sm font-semibold text-foreground truncate">
              {palette.subtitle}
            </div>
            {stuck && (
              <div
                data-testid="stuck-round-age"
                className="text-[11px] text-muted-foreground"
              >
                Started {formatRoundAge(round, now)} — never reached hole 1.
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onResume}
            disabled={abandoning}
            data-testid="stuck-round-resume"
            className="flex-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Resume →
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={abandoning}
            data-testid="stuck-round-abandon"
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              stuck
                ? "bg-red-600 text-white border-none"
                : "bg-background text-destructive border border-destructive/30"
            }`}
          >
            {abandoning ? "Abandoning…" : "Abandon"}
          </button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          data-testid="stuck-round-abandon-confirm"
          className="sm:max-w-[400px]"
        >
          <DialogHeader>
            <DialogTitle>Abandon this round?</DialogTitle>
            <DialogDescription>
              The round will be marked canceled. Scores saved so far stay in
              the database but the round won't appear as active anymore, so
              you can start a new one. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={abandoning}
              data-testid="stuck-round-abandon-cancel"
              style={{ minHeight: 44 }}
            >
              Keep it
            </Button>
            <Button
              onClick={async () => {
                await onAbandon();
                setConfirmOpen(false);
              }}
              disabled={abandoning}
              data-testid="stuck-round-abandon-submit"
              style={{
                minHeight: 44,
                background: "#DC2626",
                color: "#fff",
              }}
            >
              {abandoning ? "Abandoning…" : "Abandon Round"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default StuckRoundBanner;
