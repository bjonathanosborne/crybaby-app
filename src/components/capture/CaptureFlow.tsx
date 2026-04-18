import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CaptureShutter from "./CaptureShutter";
import CaptureAnalyzing from "./CaptureAnalyzing";
import CaptureConfirmGrid from "./CaptureConfirmGrid";
import CaptureDisputeDialog from "./CaptureDisputeDialog";
import type {
  CaptureFlowProps,
  CaptureStep,
  CaptureMime,
  ExtractionResponse,
  CaptureResult,
} from "./types";

// ============================================================
// CaptureFlow — modal container that sequences
//   shutter -> uploading -> analyzing -> confirm (+ dispute) -> applying -> done
//
// Owns the network calls to extract-scores + apply-capture, and the
// parallel upload to the scorecards bucket. Each child step is a
// presentational component; CaptureFlow decides what to show next
// based on state machine transitions.
// ============================================================

interface DiffRow {
  playerId: string;
  playerName: string;
  hole: number;
  prior: number | null;
  next: number;
}

function computeDiff(
  confirmed: Record<string, Record<number, number>>,
  prior: Record<string, Record<number, number>>,
  playerNames: Record<string, string>,
): DiffRow[] {
  const out: DiffRow[] = [];
  for (const pid of Object.keys(confirmed)) {
    for (const [h, v] of Object.entries(confirmed[pid])) {
      const hole = Number(h);
      const priorVal = prior[pid]?.[hole];
      if (priorVal !== v) {
        out.push({
          playerId: pid,
          playerName: playerNames[pid] ?? pid,
          hole,
          prior: typeof priorVal === "number" ? priorVal : null,
          next: v,
        });
      }
    }
  }
  return out;
}

export default function CaptureFlow(props: CaptureFlowProps): JSX.Element {
  const { roundId, trigger, holeRange, players, pars, handicaps, currentScores, onComplete, onCancel, roundPrivacy } = props;
  const { toast } = useToast();

  const [step, setStep] = useState<CaptureStep>("shutter");
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const [pendingApply, setPendingApply] = useState<{
    scores: Record<string, Record<number, number>>;
    shareToFeed: boolean;
    diffs: DiffRow[];
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "failed">("idle");
  const [imageData, setImageData] = useState<{ base64: string; mime: CaptureMime } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Player id -> name map for diff rendering.
  const playerNames: Record<string, string> = {};
  for (const p of players) playerNames[p.id] = p.name;

  // ---- step transitions -------------------------------------------------

  const handleShutterSubmit = useCallback((base64: string, mime: CaptureMime) => {
    setImageData({ base64, mime });
    setStep("analyzing");
  }, []);

  // Kick off the extract-scores edge function when we enter analyzing.
  useEffect(() => {
    if (step !== "analyzing" || !imageData) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      // 1. Insert a round_captures row FIRST so we have a captureId for
      //    the photo upload path. raw_extraction stays {} until the model
      //    responds.
      const { data: insertData, error: insertErr } = await supabase
        .from("round_captures")
        .insert({
          round_id: roundId,
          trigger,
          hole_range_start: holeRange[0],
          hole_range_end: holeRange[1],
          // captured_by is set server-side via auth.uid() default? No --
          // the RLS requires captured_by = auth.uid(). We need to set it
          // explicitly.
          captured_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select("id")
        .single();

      if (insertErr || !insertData) {
        if (cancelled) return;
        setErrorBanner("Couldn't start capture — check your connection.");
        setStep("error");
        return;
      }
      const id = (insertData as { id: string }).id;
      if (cancelled) return;
      setCaptureId(id);

      // 2. Kick off photo upload in parallel (does NOT block analysis).
      setUploadStatus("uploading");
      const ext = imageData.mime === "image/png" ? "png" : imageData.mime === "image/heic" ? "heic" : imageData.mime === "image/webp" ? "webp" : "jpg";
      const path = `rounds/${roundId}/${id}.${ext}`;
      void (async () => {
        try {
          const bytes = Uint8Array.from(atob(imageData.base64), c => c.charCodeAt(0));
          const { error: uploadErr } = await supabase.storage
            .from("scorecards")
            .upload(path, bytes, { contentType: imageData.mime, upsert: true });
          if (uploadErr) {
            setUploadStatus("failed");
            console.error("[capture] photo upload failed", uploadErr);
            return;
          }
          // Update the capture row with the storage path.
          await supabase
            .from("round_captures")
            .update({ photo_path: path })
            .eq("id", id);
          if (!cancelled) setUploadStatus("done");
        } catch (e) {
          console.error("[capture] photo upload threw", e);
          if (!cancelled) setUploadStatus("failed");
        }
      })();

      // 3. Call extract-scores.
      const holes: number[] = [];
      for (let h = holeRange[0]; h <= holeRange[1]; h++) holes.push(h);

      const lastKnownScores: Record<string, Record<number, number>> = {};
      for (const [pid, perHole] of Object.entries(currentScores)) {
        lastKnownScores[pid] = { ...perHole };
      }

      try {
        const { data: extractData, error: extractErr } = await supabase.functions.invoke<ExtractionResponse>(
          "extract-scores",
          {
            body: {
              image: imageData.base64,
              mimeType: imageData.mime,
              roundId,
              roundContext: {
                players: players.map(p => ({ id: p.id, name: p.name, position: p.position })),
                holes,
                pars,
                handicaps,
                lastKnownScores,
              },
            },
          },
        );

        if (cancelled) return;

        if (extractErr) {
          // 422 returned JSON has `error` + `raw`; supabase-js surfaces the error.
          // Fall back to manual entry with an empty extraction.
          console.warn("[capture] extract-scores error, falling back to manual", extractErr);
          setExtraction({ scores: {}, cellConfidence: {}, unreadable: [] });
          setStep("confirm");
          return;
        }

        if (!extractData) {
          setErrorBanner("Couldn't read the card. Enter scores manually.");
          setExtraction({ scores: {}, cellConfidence: {}, unreadable: [] });
          setStep("confirm");
          return;
        }

        setExtraction(extractData);
        setStep("confirm");
      } catch (e) {
        if (cancelled) return;
        console.error("[capture] extract-scores threw", e);
        setExtraction({ scores: {}, cellConfidence: {}, unreadable: [] });
        setErrorBanner("Couldn't read the card. Enter scores manually.");
        setStep("confirm");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [step, imageData, roundId, trigger, holeRange, players, pars, handicaps, currentScores]);

  // ---- apply (from confirm grid) ----------------------------------------

  const runApply = useCallback(async (
    confirmedScores: Record<string, Record<number, number>>,
    shareToFeed: boolean,
  ) => {
    if (!captureId) return;
    setStep("applying");

    const { data, error } = await supabase.functions.invoke<{
      captureId: string;
      applied: boolean;
      noop: boolean;
      supersededIds: string[];
      feedPublished: boolean;
      totals: Record<string, number>;
    }>("apply-capture", {
      body: { captureId, confirmedScores, shareToFeed },
    });

    if (error || !data) {
      console.error("[capture] apply-capture failed", error);
      setErrorBanner("Couldn't save these scores. Try again.");
      setStep("error");
      return;
    }

    // noop handling: differentiate ad-hoc (toast) vs game-driven (silent).
    if (data.noop) {
      if (trigger === "ad_hoc") {
        toast({
          title: "Scores unchanged",
          description: "No differences from the last capture.",
        });
      }
      const result: CaptureResult = {
        captureId: data.captureId,
        applied: true,
        noop: true,
        totals: data.totals,
        feedPublished: false,
      };
      onComplete(result);
      return;
    }

    const result: CaptureResult = {
      captureId: data.captureId,
      applied: true,
      noop: false,
      totals: data.totals,
      feedPublished: data.feedPublished,
    };
    toast({
      title: "Scores updated",
      description: data.feedPublished ? "Posted to the feed." : "Applied to the round.",
    });
    onComplete(result);
  }, [captureId, trigger, toast, onComplete]);

  const handleConfirmApply = useCallback((
    confirmedScores: Record<string, Record<number, number>>,
    shareToFeed: boolean,
  ) => {
    const diffs = computeDiff(confirmedScores, currentScores, playerNames);
    if (diffs.length === 0) {
      // No diff — go straight to apply (server will also return noop, but
      // we save a round-trip by not showing the dispute dialog).
      void runApply(confirmedScores, shareToFeed);
      return;
    }
    // Show dispute dialog first.
    setPendingApply({ scores: confirmedScores, shareToFeed, diffs });
  }, [currentScores, runApply, playerNames]);

  const handleDisputeOverwrite = useCallback(() => {
    if (!pendingApply) return;
    const { scores, shareToFeed } = pendingApply;
    setPendingApply(null);
    void runApply(scores, shareToFeed);
  }, [pendingApply, runApply]);

  const handleDisputeCancel = useCallback(() => {
    setPendingApply(null);
    // User cancels the overwrite: stay on confirm grid so they can edit.
  }, []);

  // ---- render -----------------------------------------------------------

  const content = pendingApply
    ? (
      <CaptureDisputeDialog
        diffs={pendingApply.diffs}
        players={players}
        onOverwrite={handleDisputeOverwrite}
        onCancel={handleDisputeCancel}
      />
    )
    : step === "shutter"
      ? <CaptureShutter onSubmit={handleShutterSubmit} onCancel={onCancel} />
      : step === "analyzing"
        ? <CaptureAnalyzing banner={errorBanner} onCancel={onCancel} />
        : step === "confirm" && extraction
          ? (
            <CaptureConfirmGrid
              players={players}
              holeRange={holeRange}
              extraction={extraction}
              priorScores={currentScores}
              trigger={trigger}
              roundPrivacy={roundPrivacy}
              uploadStatus={uploadStatus}
              onApply={handleConfirmApply}
              onCancel={onCancel}
            />
          )
          : step === "applying"
            ? (
              <div data-testid="capture-applying" className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="status" aria-live="polite">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Saving scores…</p>
              </div>
            )
            : step === "error"
              ? (
                <div data-testid="capture-error" className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                  <div className="text-5xl" aria-hidden="true">⚠️</div>
                  <p className="text-sm text-foreground">{errorBanner ?? "Something went wrong."}</p>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
                  >
                    Close
                  </button>
                </div>
              )
              : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent
        data-testid="capture-flow"
        className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-lg"
        onEscapeKeyDown={(e) => {
          // Prevent escape-closing during applying so we don't lose the in-flight request.
          if (step === "applying") e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Scorecard photo capture</DialogTitle>
        <DialogDescription className="sr-only">
          Photograph the scorecard, confirm the extracted scores, and apply to the round.
        </DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}
