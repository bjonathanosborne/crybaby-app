import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ============================================================
// FinishRoundConfirm (PR #18)
//
// Pre-save confirmation gate for every round-finish path. Wraps
// the existing save flow — on confirm, the dialog's onConfirm
// handler fires and the caller's existing finish logic (photo
// gate, settlement write, navigation) runs unchanged.
//
// Radix Dialog underneath gives us:
//   - Focus trap while open
//   - Esc-to-close
//   - Click-outside-to-close
//   - aria-labelledby / aria-describedby wired via DialogTitle /
//     DialogDescription
//   - Focus returns to the trigger button on close
//
// Copy per spec: one-line title, secondary Cancel + primary
// destructive-style Finish. "Destructive-style" here = brand-red
// background; the action itself is recoverable (round stays
// active if cancelled) but the finality merits visual weight.
// ============================================================

const BRAND_GREEN = "#2D5016";
const BRAND_RED = "#DC2626";

export interface FinishRoundConfirmProps {
  /** Controls visibility. Caller owns the state. */
  open: boolean;
  /** Called when the user cancels (button tap, Esc, or click outside). */
  onCancel: () => void;
  /** Called when the user confirms — caller runs the existing save flow. */
  onConfirm: () => void;
  /**
   * Render the confirm button in a saving state. Disables both
   * buttons and swaps the confirm label to "Saving…". Caller sets
   * this true once onConfirm has been acknowledged and the downstream
   * save is in-flight; false (the default) allows normal use.
   */
  confirming?: boolean;
}

export function FinishRoundConfirm({
  open,
  onCancel,
  onConfirm,
  confirming = false,
}: FinishRoundConfirmProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Radix calls onOpenChange(false) for Esc, outside-click, and
        // the built-in X close button. All three should behave as
        // Cancel — we don't want an accidental dismiss to somehow
        // trigger a save.
        if (!next) onCancel();
      }}
    >
      <DialogContent
        data-testid="finish-round-confirm"
        // Tighter max-width + centred copy read better on phone than
        // the default wide dialog.
        className="sm:max-w-[400px]"
      >
        <DialogHeader>
          <DialogTitle data-testid="finish-round-confirm-title">
            Finish and save round?
          </DialogTitle>
          <DialogDescription data-testid="finish-round-confirm-description">
            This will save your scores and settle up the money. You won't be
            able to edit the round from the main view after this — corrections
            are still possible from the completed-round screen.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={confirming}
            data-testid="finish-round-confirm-cancel"
            style={{ minHeight: 44 }}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={confirming}
            data-testid="finish-round-confirm-submit"
            style={{
              minHeight: 44,
              background: confirming ? "#A8957B" : BRAND_RED,
              color: "#fff",
            }}
          >
            {confirming ? "Saving…" : "Finish Round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FinishRoundConfirm;

// Re-export BRAND colour constants for tests + callers that want to
// assert on the colour palette of the confirm-button (keeps a single
// source of truth rather than re-hard-coding `#DC2626` in test code).
export { BRAND_GREEN as FINISH_CONFIRM_BRAND_GREEN, BRAND_RED as FINISH_CONFIRM_BRAND_RED };
