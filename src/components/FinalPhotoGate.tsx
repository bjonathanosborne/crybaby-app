import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, SkipForward } from "lucide-react";

// ============================================================
// FinalPhotoGate
//
// Pre-completion capture gate shown between the 18th-hole score
// entry and completeRound/settlements. Two paths:
//
//   Take Photo  → closes the gate, opens CaptureFlow ad-hoc on
//                 holeRange [1, 18]. On a successful apply, the
//                 caller flips `decision = "captured"` and lets
//                 the auto-completion useEffect save settlements.
//
//   Skip Photo  → sets rounds.needs_final_photo = true, flips
//                 `decision = "skipped"`, and lets completion
//                 proceed. The completed-round view uses the
//                 flag to show a "Fix scores / add photo" CTA
//                 (Bug 3).
//
// The gate never dismisses without a decision — there's no X.
// ============================================================

export interface FinalPhotoGateProps {
  /** True when hole 18 is scored and the gate should render. */
  open: boolean;
  /** User tapped "Take Photo". Host should openAdHoc and watch for apply. */
  onTakePhoto: () => void;
  /**
   * User tapped "Skip photo". Host should set needs_final_photo=true and
   * proceed with round completion. Caller is responsible for toast + retry
   * if the skip-flag write fails.
   */
  onSkip: () => void;
  /** True while the skip-flag write is in flight. Disables buttons. */
  skipping?: boolean;
}

const BRAND_GREEN = "#2D5016";
const BRAND_SAND = "#F5EFE0";
const BRAND_BROWN = "#8B7355";

export default function FinalPhotoGate({
  open, onTakePhoto, onSkip, skipping,
}: FinalPhotoGateProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={() => { /* no dismiss — force decision */ }}>
      <DialogContent
        // Intentionally suppress the default close-X by hiding it via class;
        // the shadcn Dialog renders an X by default. Keeping the dialog
        // closable only via the two CTAs makes the gate explicit.
        className="sm:max-w-md [&>button[aria-label='Close']]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle
          style={{
            fontFamily: "'Pacifico', cursive",
            fontSize: 22,
            color: BRAND_GREEN,
            marginBottom: 4,
          }}
        >
          One more thing ⛳
        </DialogTitle>
        <DialogDescription
          style={{
            fontSize: 14,
            color: BRAND_BROWN,
            lineHeight: 1.5,
          }}
        >
          Snap the scorecard so we can lock in the round. The photo gets us
          all 18 holes at once in case anything drifted during the round.
        </DialogDescription>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button
            onClick={onTakePhoto}
            disabled={skipping}
            data-testid="final-photo-gate-take"
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: skipping ? "#DDD0BB" : BRAND_GREEN,
              color: skipping ? "#A8957B" : "#fff",
              fontFamily: "'Pacifico', cursive",
              fontSize: 17,
              cursor: skipping ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: skipping ? "none" : "0 4px 16px rgba(45,80,22,0.25)",
            }}
          >
            <Camera size={18} /> Take Photo
          </button>

          <button
            onClick={onSkip}
            disabled={skipping}
            data-testid="final-photo-gate-skip"
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 14,
              border: `1px solid ${BRAND_BROWN}`,
              background: BRAND_SAND,
              color: BRAND_BROWN,
              fontFamily: "'Lato', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              cursor: skipping ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <SkipForward size={16} />
            {skipping ? "Skipping…" : "Skip photo (add later)"}
          </button>
        </div>

        <p
          style={{
            fontSize: 11,
            color: BRAND_BROWN,
            marginTop: 10,
            lineHeight: 1.4,
            opacity: 0.75,
          }}
        >
          You can add a photo and edit scores from the completed-round view.
        </p>
      </DialogContent>
    </Dialog>
  );
}
