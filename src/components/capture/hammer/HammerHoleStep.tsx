import { useCallback, useState } from "react";
import type { Player } from "@/lib/gameEngines";
import type { HammerDepthEvent, HoleHammerState } from "@/lib/hammerMath";
import { resolveHammerOutcome } from "@/lib/hammerMath";
import TeamPickerButtons from "./TeamPickerButtons";
import ResponseButtons from "./ResponseButtons";
import HammerBackButtons from "./HammerBackButtons";
import HammerDepthBreadcrumb from "./HammerDepthBreadcrumb";

/**
 * State machine for one hole. Walks the scorekeeper through:
 *   asking_initial        → "Any hammers on hole X?"
 *   asking_first_thrower  → "Who threw first?"
 *   asking_response       → "{responder}'s response?" [Accepted | Laid down]
 *   asking_hammer_back    → "Did {previous responder} hammer back?"
 * Loops response ↔ hammer-back until a terminal (laid_down or scored_out).
 *
 * On terminal, renders a small confirm with the computed outcome and a
 * "Continue to next hole" CTA that calls onHoleComplete(finalState).
 *
 * Pre-populated mode (back-edit from summary): the parent can pass
 * `initialEvents` and this component resumes at the appropriate step.
 * Editing discards events past the edit point on user confirm.
 */

type Step =
  | { kind: "asking_initial" }
  | { kind: "asking_first_thrower" }
  | { kind: "asking_response"; depth: number; thrower: "A" | "B" }
  | { kind: "asking_hammer_back"; currentDepth: number; previousResponder: "A" | "B" }
  | { kind: "terminal" };

interface HammerHoleStepProps {
  hole: number;
  par: number;
  teams: { A: { name: string; players: Player[] }; B: { name: string; players: Player[] } };
  /** Pre-populated events if editing an existing hole; undefined for a fresh hole. */
  initialEvents?: HammerDepthEvent[];
  initialScoredOut?: boolean;
  onHoleComplete: (state: HoleHammerState) => void;
  onBack: () => void;
}

export default function HammerHoleStep(props: HammerHoleStepProps): JSX.Element {
  const { hole, teams, initialEvents, initialScoredOut, onHoleComplete, onBack } = props;

  const [events, setEvents] = useState<HammerDepthEvent[]>(initialEvents ?? []);
  const [scoredOut, setScoredOut] = useState<boolean>(initialScoredOut ?? false);

  // Determine which step to render from the current events + scoredOut.
  const deriveStep = useCallback((evs: HammerDepthEvent[], so: boolean): Step => {
    if (evs.length === 0 && !so) {
      return { kind: "asking_initial" };
    }
    // Terminal? Either last event was laid_down OR scoredOut was flipped.
    const last = evs[evs.length - 1];
    if (last && last.response === "laid_down") return { kind: "terminal" };
    if (so) return { kind: "terminal" };
    // Not terminal yet — decide next step.
    // (Non-terminal states only reach here with events.length > 0 AND last.response === "accepted")
    if (last && last.response === "accepted") {
      // After an accept: the previous responder (the accepter) decides
      // whether to hammer back. The accepter is whoever didn't throw.
      const previousResponder: "A" | "B" = last.thrower === "A" ? "B" : "A";
      return { kind: "asking_hammer_back", currentDepth: last.depth, previousResponder };
    }
    // Unreachable: no events + scoredOut handled above.
    return { kind: "asking_initial" };
  }, []);

  // Pending step is a local override for the asking_first_thrower and
  // asking_response screens, because those don't change events.length —
  // they just change what we're asking next.
  const [pendingStep, setPendingStep] = useState<Step | null>(() => {
    // Initialize: if we have pre-populated events, derive the step.
    const derived = deriveStep(initialEvents ?? [], initialScoredOut ?? false);
    return derived;
  });

  const step: Step = pendingStep ?? deriveStep(events, scoredOut);

  const resetHole = useCallback(() => {
    setEvents([]);
    setScoredOut(false);
    setPendingStep({ kind: "asking_initial" });
  }, []);

  // --- transitions ---

  const handleInitialAnswer = useCallback((hadHammer: boolean) => {
    if (!hadHammer) {
      // No hammers → terminal, events stay empty, scoredOut stays false.
      setPendingStep({ kind: "terminal" });
      return;
    }
    setPendingStep({ kind: "asking_first_thrower" });
  }, []);

  const handleFirstThrower = useCallback((team: "A" | "B") => {
    // Transition to asking_response at depth 1.
    setPendingStep({ kind: "asking_response", depth: 1, thrower: team });
  }, []);

  const handleResponse = useCallback((thrower: "A" | "B", depth: number, response: "accepted" | "laid_down") => {
    const newEvent: HammerDepthEvent = { depth, thrower, response };
    const next = [...events, newEvent];
    setEvents(next);
    setPendingStep(null); // derive from events now
    if (response === "laid_down") {
      // Terminal via lay-down; derived step becomes "terminal".
      return;
    }
    // Accepted → derived step will become asking_hammer_back automatically.
  }, [events]);

  const handleHammerBackDecision = useCallback((hammerBack: boolean) => {
    if (!hammerBack) {
      // Score it out at the current depth.
      setScoredOut(true);
      setPendingStep(null);
      return;
    }
    // Hammer back → new thrower is the previous responder, depth goes up by 1.
    const last = events[events.length - 1];
    const previousResponder: "A" | "B" = last.thrower === "A" ? "B" : "A";
    setPendingStep({
      kind: "asking_response",
      depth: last.depth + 1,
      thrower: previousResponder,
    });
  }, [events]);

  const handleJumpToDepth = useCallback((depth: number) => {
    // Truncate events to just before `depth`. Confirm destruction.
    const confirmed = window.confirm(
      `Editing from depth ${depth} will discard events at depth ${depth} and after. Continue?`,
    );
    if (!confirmed) return;
    const truncated = events.filter(e => e.depth < depth);
    setEvents(truncated);
    setScoredOut(false);
    setPendingStep(null);
  }, [events]);

  const handleConfirmTerminal = useCallback(() => {
    onHoleComplete({ events, scoredOut });
  }, [events, scoredOut, onHoleComplete]);

  // --- render ---

  const outcome = resolveHammerOutcome({ events, scoredOut });
  const thrower = step.kind === "asking_response" ? step.thrower : null;
  const responderName = thrower
    ? (thrower === "A" ? teams.B.name : teams.A.name)
    : "";
  const nextThrowerForHammerBack =
    step.kind === "asking_hammer_back" ? teams[step.previousResponder].name : "";

  return (
    <div
      data-testid="hammer-hole-step"
      className="flex flex-col gap-4 px-4 py-4"
    >
      <header className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hammer prompt — hole {hole}
        </div>
        <HammerDepthBreadcrumb
          events={events}
          onJumpTo={events.length > 0 ? handleJumpToDepth : undefined}
        />
      </header>

      {step.kind === "asking_initial" && (
        <div className="space-y-4">
          <h2 className="font-pacifico text-xl text-foreground">
            Any hammers on hole {hole}?
          </h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleInitialAnswer(false)}
              data-testid="hammer-initial-no"
              className="flex-1 rounded-2xl border-4 border-border bg-background p-4 text-lg font-bold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => handleInitialAnswer(true)}
              data-testid="hammer-initial-yes"
              className="flex-1 rounded-2xl border-4 border-primary bg-primary p-4 text-lg font-bold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Yes
            </button>
          </div>
        </div>
      )}

      {step.kind === "asking_first_thrower" && (
        <div className="space-y-4">
          <h2 className="font-pacifico text-xl text-foreground">
            Who threw first on hole {hole}?
          </h2>
          <TeamPickerButtons
            teamA={teams.A}
            teamB={teams.B}
            selected={null}
            onSelect={handleFirstThrower}
          />
        </div>
      )}

      {step.kind === "asking_response" && (
        <div className="space-y-4">
          <h2 className="font-pacifico text-xl text-foreground">
            {responderName}'s response?
          </h2>
          <p className="text-xs text-muted-foreground">
            Depth {step.depth}. Team {step.thrower} threw — {step.thrower === "A" ? teams.A.name : teams.B.name}.
          </p>
          <ResponseButtons
            responderTeamName={responderName}
            onAccept={() => handleResponse(step.thrower, step.depth, "accepted")}
            onLayDown={() => handleResponse(step.thrower, step.depth, "laid_down")}
          />
        </div>
      )}

      {step.kind === "asking_hammer_back" && (
        <div className="space-y-4">
          <h2 className="font-pacifico text-xl text-foreground">
            Did {nextThrowerForHammerBack} hammer back?
          </h2>
          <p className="text-xs text-muted-foreground">
            Depth {step.currentDepth} was accepted.
          </p>
          <HammerBackButtons
            currentDepth={step.currentDepth}
            nextThrowerTeamName={nextThrowerForHammerBack}
            onScoreOut={() => handleHammerBackDecision(false)}
            onHammerBack={() => handleHammerBackDecision(true)}
          />
        </div>
      )}

      {step.kind === "terminal" && (
        <div className="space-y-4">
          <h2 className="font-pacifico text-xl text-foreground">
            Hole {hole} — all set
          </h2>
          <div
            role="status"
            aria-live="polite"
            data-testid="hammer-hole-terminal-summary"
            className="rounded-xl border border-border bg-muted/40 p-4 text-sm"
          >
            {outcome.source === "no_hammer" && <>No hammer. Winner by score at 1× hole value.</>}
            {outcome.source === "scored_out" && (
              <>
                Scored out at depth {outcome.scoredOutAtDepth}. Winner by score at {outcome.multiplier}× hole value.
              </>
            )}
            {outcome.source === "laid_down" && (
              <>
                <strong>{teams[outcome.winner].name}</strong> wins — {teams[outcome.winner === "A" ? "B" : "A"].name} laid down at depth {outcome.laidDownAtDepth}. {outcome.multiplier}× hole value.
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetHole}
              data-testid="hammer-terminal-redo"
              className="flex-1 rounded-xl border-2 border-border bg-transparent px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Redo
            </button>
            <button
              type="button"
              onClick={handleConfirmTerminal}
              data-testid="hammer-terminal-next"
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <div className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Back to hole list
        </button>
      </div>
    </div>
  );
}
