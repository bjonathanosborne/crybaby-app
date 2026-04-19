import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HammerPromptFlow from "@/components/capture/hammer/HammerPromptFlow";
import HammerHoleStep from "@/components/capture/hammer/HammerHoleStep";
import type { Player } from "@/lib/gameEngines";

/**
 * Component tests for the sequenced hammer prompt UI. Covers:
 *  - State machine transitions (initial → first-thrower → response → hammer-back → terminal).
 *  - Correct emitted HoleHammerState for each terminal path.
 *  - Summary list rendering + edit button.
 *  - PromptFlow auto-advances to next unanswered hole after a terminal.
 */

const ps = (suffix: string): Player => ({
  id: suffix,
  name: suffix.toUpperCase(),
  handicap: 10,
  color: "#000",
});

const TEAMS = {
  A: { name: "Drivers", players: [ps("alice"), ps("carol")] },
  B: { name: "Riders", players: [ps("bob"), ps("dave")] },
};

describe("HammerHoleStep — no hammer path", () => {
  it("initial No → terminal, emits empty events + scoredOut false", () => {
    const onComplete = vi.fn();
    render(
      <HammerHoleStep
        hole={1}
        par={4}
        teams={TEAMS}
        onHoleComplete={onComplete}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId("hammer-hole-step")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("hammer-initial-no"));
    // Terminal screen with Continue button fires onComplete
    expect(screen.getByTestId("hammer-hole-terminal-summary")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    expect(onComplete).toHaveBeenCalledWith({ events: [], scoredOut: false });
  });
});

describe("HammerHoleStep — depth 1 laid down path", () => {
  it("Yes → pick A → B laid down → terminal, emits [{depth:1, thrower:A, response:laid_down}]", () => {
    const onComplete = vi.fn();
    render(
      <HammerHoleStep
        hole={3}
        par={4}
        teams={TEAMS}
        onHoleComplete={onComplete}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("hammer-initial-yes"));
    fireEvent.click(screen.getByTestId("team-picker-a"));
    fireEvent.click(screen.getByTestId("response-lay-down"));
    // Terminal
    expect(screen.getByTestId("hammer-hole-terminal-summary")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    expect(onComplete).toHaveBeenCalledWith({
      events: [{ depth: 1, thrower: "A", response: "laid_down" }],
      scoredOut: false,
    });
  });
});

describe("HammerHoleStep — depth 1 accepted + scored out path", () => {
  it("Yes → A throws → B accepted → No (score out) → terminal, emits scoredOut:true", () => {
    const onComplete = vi.fn();
    render(
      <HammerHoleStep
        hole={5}
        par={4}
        teams={TEAMS}
        onHoleComplete={onComplete}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("hammer-initial-yes"));
    fireEvent.click(screen.getByTestId("team-picker-a"));
    fireEvent.click(screen.getByTestId("response-accept"));
    // Now on hammer-back screen for B (previous responder)
    fireEvent.click(screen.getByTestId("hammer-back-score-out"));
    // Terminal
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    expect(onComplete).toHaveBeenCalledWith({
      events: [{ depth: 1, thrower: "A", response: "accepted" }],
      scoredOut: true,
    });
  });
});

describe("HammerHoleStep — depth 2 laid down path", () => {
  it("Yes → A throws → B accepted → Yes hammer back → B throws → A laid down → terminal", () => {
    const onComplete = vi.fn();
    render(
      <HammerHoleStep
        hole={9}
        par={4}
        teams={TEAMS}
        onHoleComplete={onComplete}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("hammer-initial-yes"));
    fireEvent.click(screen.getByTestId("team-picker-a"));
    fireEvent.click(screen.getByTestId("response-accept"));
    // hammer-back? yes
    fireEvent.click(screen.getByTestId("hammer-back-yes"));
    // Now depth 2, thrower B, responder A
    fireEvent.click(screen.getByTestId("response-lay-down"));
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    expect(onComplete).toHaveBeenCalledWith({
      events: [
        { depth: 1, thrower: "A", response: "accepted" },
        { depth: 2, thrower: "B", response: "laid_down" },
      ],
      scoredOut: false,
    });
  });
});

describe("HammerPromptFlow — walks range, auto-advances, commits full state", () => {
  it("answers holes 1 and 2 then commits state via Looks good", () => {
    const onComplete = vi.fn();
    render(
      <HammerPromptFlow
        holeRange={[1, 2]}
        teams={TEAMS}
        pars={Array(18).fill(4)}
        onComplete={onComplete}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId("hammer-prompt-flow")).toBeInTheDocument();
    // Start opens first unanswered hole (1)
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(screen.getByTestId("hammer-hole-step")).toBeInTheDocument();
    // Hole 1: No hammer
    fireEvent.click(screen.getByTestId("hammer-initial-no"));
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    // Auto-advances to hole 2
    expect(screen.getByTestId("hammer-hole-step")).toBeInTheDocument();
    // Hole 2: No hammer
    fireEvent.click(screen.getByTestId("hammer-initial-no"));
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    // Back to summary; Looks good commits
    fireEvent.click(screen.getByTestId("hammer-prompt-commit"));
    expect(onComplete).toHaveBeenCalledWith({
      byHole: {
        1: { events: [], scoredOut: false },
        2: { events: [], scoredOut: false },
      },
    });
  });

  it("allows editing a hole from the summary", () => {
    const onComplete = vi.fn();
    render(
      <HammerPromptFlow
        holeRange={[1, 1]}
        teams={TEAMS}
        pars={Array(18).fill(4)}
        initial={{ byHole: { 1: { events: [], scoredOut: false } } }}
        onComplete={onComplete}
        onBack={vi.fn()}
      />,
    );
    // Summary shows hole 1 with "No hammers"
    expect(screen.getByTestId("hammer-summary-card-1")).toBeInTheDocument();
    // Edit button takes us back into the hole step
    fireEvent.click(screen.getByRole("button", { name: /edit hammer state for hole 1/i }));
    expect(screen.getByTestId("hammer-hole-step")).toBeInTheDocument();
  });
});
