import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Player } from "@/lib/gameEngines";
import type { CaptureHammerState, HoleHammerState } from "@/lib/hammerMath";
import HammerPromptFlow from "./HammerPromptFlow";

/**
 * Retro-correction: the scorekeeper missed logging a hammer on an earlier
 * hole and wants to fix it without re-capturing scores.
 *
 * Opens a `HammerPromptFlow` pre-populated with the round's current
 * `hammerStateByHole` (from `course_details.game_state`). On commit,
 * writes a new `round_captures` row with trigger='hammer_correction',
 * hammer_state= the user-edited state, NO score changes. Then calls
 * apply-capture — which merges the new hammer state into the round's
 * hammerHistory via translateToLegacy and re-runs replayRound. This
 * flow never touches round_players.hole_scores; it's hammer-only.
 *
 * Triggered from the active round UI by a "Fix hammers" button.
 */

interface EditHammerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  holeRange: [number, number];
  teams: { A: { name: string; players: Player[] }; B: { name: string; players: Player[] } };
  pars: number[];
  initialHammerState?: CaptureHammerState;
  currentScores: Record<string, Record<number, number>>;
  onApplied: () => void;
}

export default function EditHammerModal(props: EditHammerModalProps): JSX.Element {
  const { open, onOpenChange, roundId, holeRange, teams, pars, initialHammerState, currentScores, onApplied } = props;
  const { toast } = useToast();
  const [applying, setApplying] = useState<boolean>(false);

  const handleCommit = useCallback(async (state: CaptureHammerState) => {
    setApplying(true);
    try {
      // 1. Insert a round_captures row with trigger='hammer_correction'.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Sign-in required", variant: "destructive" });
        return;
      }
      const { data: captureRow, error: insertErr } = await supabase
        .from("round_captures")
        .insert({
          round_id: roundId,
          trigger: "hammer_correction",
          captured_by: user.id,
          hole_range_start: holeRange[0],
          hole_range_end: holeRange[1],
          hammer_state: state,
        })
        .select("id")
        .single();
      if (insertErr || !captureRow) {
        console.error("[EditHammerModal] insert capture row failed", insertErr);
        toast({
          title: "Couldn't save hammer fix",
          description: "Check your connection and try again.",
          variant: "destructive",
        });
        return;
      }
      const captureId = (captureRow as { id: string }).id;

      // 2. Call apply-capture. Pass the SAME currentScores as confirmedScores
      //    (no score delta) plus the hammer state. The edge function's noop
      //    check explicitly allows fall-through when hammerState has
      //    entries, so this re-applies hammer math without score changes.
      const { data, error } = await supabase.functions.invoke<{
        applied: boolean;
        noop: boolean;
      }>("apply-capture", {
        body: {
          captureId,
          confirmedScores: currentScores,
          shareToFeed: false, // retro-fix isn't a broadcast event
          hammerState: state,
        },
      });

      if (error || !data) {
        console.error("[EditHammerModal] apply failed", error);
        toast({
          title: "Couldn't apply hammer fix",
          description: "The capture row was saved — retry from the round page.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Hammers updated",
        description: "Money totals recomputed.",
      });
      onApplied();
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  }, [roundId, holeRange, currentScores, toast, onApplied, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="edit-hammer-modal"
        className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-lg"
        onEscapeKeyDown={(e) => {
          if (applying) e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Fix hammers</DialogTitle>
        <DialogDescription className="sr-only">
          Walk through each hole and update the hammer state. Money totals
          recompute on save. Scores are not changed by this flow.
        </DialogDescription>
        {applying ? (
          <div
            data-testid="edit-hammer-applying"
            className="flex flex-col items-center gap-3 px-6 py-10 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Updating hammer totals…</p>
          </div>
        ) : (
          <HammerPromptFlow
            holeRange={holeRange}
            teams={teams}
            pars={pars}
            initial={initialHammerState}
            onComplete={handleCommit}
            onBack={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
