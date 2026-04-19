import { useCallback, useMemo, useRef, useState } from "react";
import type { Player } from "@/lib/gameEngines";
import type { CaptureHammerState, HoleHammerState } from "@/lib/hammerMath";
import HammerHoleStep from "./HammerHoleStep";
import HammerHoleSummaryCard from "./HammerHoleSummaryCard";
import HoleTransition from "./HoleTransition";
import { pickTransitionCity } from "./transitionCities";

/**
 * Per-capture wizard that walks every hole in holeRange and produces a
 * CaptureHammerState to send to apply-capture.
 *
 * View model: two screens — the per-hole prompt (delegated to
 * HammerHoleStep) and the summary screen. Transitions:
 *   summary (default) → user taps a hole or the progress CTA →
 *     HammerHoleStep(hole) → on complete → summary
 *   From summary, tap "Looks good" to commit onComplete(state).
 *
 * Auto-advance: when coming from the per-hole prompt, if there's another
 * un-answered hole, we open it instead of returning to summary.
 */

interface HammerPromptFlowProps {
  holeRange: [number, number];
  teams: { A: { name: string; players: Player[] }; B: { name: string; players: Player[] } };
  pars: number[];
  /** Pre-populated state (from a prior capture or back-edit). */
  initial?: CaptureHammerState;
  onComplete: (state: CaptureHammerState) => void;
  onBack: () => void;
}

export default function HammerPromptFlow(props: HammerPromptFlowProps): JSX.Element {
  const { holeRange, teams, pars, initial, onComplete, onBack } = props;

  const holes = useMemo<number[]>(() => {
    const out: number[] = [];
    for (let h = holeRange[0]; h <= holeRange[1]; h++) out.push(h);
    return out;
  }, [holeRange]);

  const [byHole, setByHole] = useState<Record<number, HoleHammerState>>(
    () => initial?.byHole ?? {},
  );
  const [openHole, setOpenHole] = useState<number | null>(null);

  // "OK. Cool onto [city]" transition between holes. Cincinnati always comes
  // first; subsequent holes pick unseen cities from TRANSITION_CITIES.
  // pendingAdvance holds the deferred "go to this hole next" action that the
  // transition's onComplete callback fires.
  const [transitionCity, setTransitionCity] = useState<string | null>(null);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const usedCitiesRef = useRef<Set<string>>(new Set());

  const teamNames = useMemo(() => ({ A: teams.A.name, B: teams.B.name }), [teams]);

  const handleHoleComplete = useCallback((hole: number, state: HoleHammerState) => {
    setByHole(prev => ({ ...prev, [hole]: state }));

    // Decide where we're going after this hole's transition.
    const idx = holes.indexOf(hole);
    const nextUnanswered = holes.slice(idx + 1).find(h => !(h in byHole));
    pendingAdvanceRef.current = () => {
      if (nextUnanswered !== undefined) {
        setOpenHole(nextUnanswered);
      } else {
        setOpenHole(null);
      }
    };

    // Pick the city + remember it so we don't repeat within the session.
    const city = pickTransitionCity(usedCitiesRef.current);
    usedCitiesRef.current.add(city);
    setTransitionCity(city);
  }, [holes, byHole]);

  const handleTransitionComplete = useCallback(() => {
    setTransitionCity(null);
    const advance = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    if (advance) advance();
  }, []);

  const handleEdit = useCallback((hole: number) => {
    setOpenHole(hole);
  }, []);

  const handleStartAll = useCallback(() => {
    // Open the first un-answered hole in range (or hole 1 of range if none).
    const first = holes.find(h => !(h in byHole)) ?? holes[0];
    setOpenHole(first);
  }, [holes, byHole]);

  const handleCommit = useCallback(() => {
    // Ensure every hole has an entry. If any missing, fill with empty state.
    const complete: Record<number, HoleHammerState> = { ...byHole };
    for (const h of holes) {
      if (!(h in complete)) complete[h] = { events: [], scoredOut: false };
    }
    onComplete({ byHole: complete });
  }, [byHole, holes, onComplete]);

  const allDone = holes.every(h => h in byHole);

  if (openHole !== null) {
    const existing = byHole[openHole];
    // key={openHole} forces HammerHoleStep to remount on hole change
    // so its internal step state starts fresh instead of carrying over
    // from the previous hole.
    return (
      <>
        <HammerHoleStep
          key={openHole}
          hole={openHole}
          par={pars[openHole - 1] ?? 4}
          teams={teams}
          initialEvents={existing?.events}
          initialScoredOut={existing?.scoredOut}
          onHoleComplete={(state) => handleHoleComplete(openHole, state)}
          onBack={() => setOpenHole(null)}
        />
        {transitionCity ? (
          <HoleTransition city={transitionCity} onComplete={handleTransitionComplete} />
        ) : null}
      </>
    );
  }

  // Summary screen. The transition always overlays the hole-step branch
  // above; by the time we reach this branch, handleTransitionComplete has
  // already cleared transitionCity and called setOpenHole(null).
  return (
    <div
      data-testid="hammer-prompt-flow"
      className="flex flex-col gap-4 px-4 py-4"
    >
      <header className="space-y-1">
        <h2 className="font-pacifico text-xl text-foreground">Hammers</h2>
        <p className="text-xs text-muted-foreground">
          Walk through each hole and tell us what happened. Default answer is "no hammer" — one tap per clean hole.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {holes.map(h => {
          const state = byHole[h];
          if (!state) {
            return (
              <div
                key={h}
                data-testid={`hammer-summary-card-${h}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Hole {h}
                  </div>
                  <div className="truncate text-sm italic text-muted-foreground">Not answered yet</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenHole(h)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                  aria-label={`Answer hammer state for hole ${h}`}
                >
                  Answer
                </button>
              </div>
            );
          }
          return (
            <HammerHoleSummaryCard
              key={h}
              hole={h}
              state={state}
              teamNames={teamNames}
              onEdit={handleEdit}
            />
          );
        })}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border-2 border-border bg-transparent px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Back
        </button>
        {!allDone ? (
          <button
            type="button"
            onClick={handleStartAll}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Start
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCommit}
            data-testid="hammer-prompt-commit"
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Looks good
          </button>
        )}
      </div>
    </div>
  );
}
