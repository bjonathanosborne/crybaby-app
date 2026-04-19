import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import HoleTransition from "@/components/capture/hammer/HoleTransition";
import HammerPromptFlow from "@/components/capture/hammer/HammerPromptFlow";
import {
  pickTransitionCity,
  TRANSITION_CITIES,
  CINCINNATI,
} from "@/components/capture/hammer/transitionCities";
import type { Player } from "@/lib/gameEngines";

/**
 * "OK. Cool onto [city]" transition between hammer holes.
 *
 * Covers:
 *  - Cincinnati is always the first city of a session.
 *  - Subsequent cities come from TRANSITION_CITIES and don't repeat
 *    within the session.
 *  - Tap-to-dismiss fires onComplete immediately.
 *  - Auto-advance fires onComplete after the 1500ms linger.
 */

function ps(id: string, name: string): Player {
  return { id, name, handicap: 10, color: "#000" };
}

const TEAMS = {
  A: { name: "Drivers", players: [ps("a", "Alice"), ps("b", "Bob")] },
  B: { name: "Riders", players: [ps("c", "Carol"), ps("d", "Dave")] },
};

describe("pickTransitionCity", () => {
  it("returns Cincinnati when usedCities is empty", () => {
    expect(pickTransitionCity(new Set())).toBe(CINCINNATI);
  });

  it("never returns Cincinnati when usedCities is non-empty (Cincinnati isn't in TRANSITION_CITIES)", () => {
    // 1000 rolls to confirm Cincinnati never emerges from the random pool.
    for (let i = 0; i < 1000; i++) {
      const picked = pickTransitionCity(new Set([CINCINNATI]));
      expect(picked).not.toBe(CINCINNATI);
      expect(TRANSITION_CITIES).toContain(picked);
    }
  });

  it("avoids already-used cities when possible", () => {
    // Use a deterministic RNG so we can confirm the exclusion logic.
    const used = new Set<string>([CINCINNATI, "Toledo", "Duluth"]);
    for (let i = 0; i < 50; i++) {
      const picked = pickTransitionCity(used, () => Math.random());
      expect(used.has(picked)).toBe(false);
    }
  });

  it("allows repeats when every city is exhausted", () => {
    // Put every TRANSITION_CITIES plus Cincinnati in the used set.
    const used = new Set<string>([CINCINNATI, ...TRANSITION_CITIES]);
    const picked = pickTransitionCity(used);
    // Pool falls back to TRANSITION_CITIES — we get a city even though all were used.
    expect(TRANSITION_CITIES).toContain(picked);
  });
});

describe("HoleTransition component — tap to dismiss", () => {
  it("calls onComplete immediately on tap", () => {
    const onComplete = vi.fn();
    render(<HoleTransition city="Toledo" onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId("hole-transition"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("only fires onComplete once even on multiple taps", () => {
    const onComplete = vi.fn();
    render(<HoleTransition city="Toledo" onComplete={onComplete} />);
    const btn = screen.getByTestId("hole-transition");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("HoleTransition component — auto-advance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onComplete after 1500ms", () => {
    const onComplete = vi.fn();
    render(<HoleTransition city="Cincinnati" onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("doesn't fire onComplete before 1500ms elapses", () => {
    const onComplete = vi.fn();
    render(<HoleTransition city="Cincinnati" onComplete={onComplete} />);
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("renders the city name in the overlay", () => {
    render(<HoleTransition city="Poughkeepsie" onComplete={vi.fn()} />);
    const node = screen.getByTestId("hole-transition");
    expect(node.textContent).toContain("OK. Cool onto");
    expect(node.textContent).toContain("Poughkeepsie");
  });

  it("has role=status + aria-live=polite for screen readers", () => {
    render(<HoleTransition city="Boise" onComplete={vi.fn()} />);
    const node = screen.getByTestId("hole-transition");
    expect(node.getAttribute("role")).toBe("status");
    expect(node.getAttribute("aria-live")).toBe("polite");
    expect(node.getAttribute("aria-label")).toBe("OK. Cool onto Boise.");
  });
});

describe("HammerPromptFlow — transition integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("first hole of session triggers Cincinnati transition", () => {
    render(
      <HammerPromptFlow
        holeRange={[7, 10]}
        teams={TEAMS}
        pars={Array(18).fill(4)}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // Start: opens hole 7.
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    // Answer "No hammer" for hole 7.
    fireEvent.click(screen.getByTestId("hammer-initial-no"));
    // Continue to complete the hole.
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    // Transition overlay should appear with Cincinnati.
    const overlay = screen.getByTestId("hole-transition");
    expect(overlay.textContent).toContain("Cincinnati");
  });

  it("second hole of session uses a non-Cincinnati city from TRANSITION_CITIES", () => {
    render(
      <HammerPromptFlow
        holeRange={[1, 3]}
        teams={TEAMS}
        pars={Array(18).fill(4)}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));

    // Complete hole 1 → Cincinnati transition.
    fireEvent.click(screen.getByTestId("hammer-initial-no"));
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    expect(screen.getByTestId("hole-transition").textContent).toContain("Cincinnati");
    // Tap-through to advance to hole 2.
    fireEvent.click(screen.getByTestId("hole-transition"));

    // Complete hole 2 → different city.
    fireEvent.click(screen.getByTestId("hammer-initial-no"));
    fireEvent.click(screen.getByTestId("hammer-terminal-next"));
    const second = screen.getByTestId("hole-transition").textContent ?? "";
    expect(second).toContain("OK. Cool onto");
    expect(second).not.toContain("Cincinnati");
    const cityMatch = TRANSITION_CITIES.find(c => second.includes(c));
    expect(cityMatch).toBeDefined();
  });

  it("three holes produce three distinct cities in the same session", () => {
    render(
      <HammerPromptFlow
        holeRange={[1, 3]}
        teams={TEAMS}
        pars={Array(18).fill(4)}
        onComplete={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));

    const citiesSeen: string[] = [];

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByTestId("hammer-initial-no"));
      fireEvent.click(screen.getByTestId("hammer-terminal-next"));
      const text = screen.getByTestId("hole-transition").textContent ?? "";
      // First slot is Cincinnati; subsequent are TRANSITION_CITIES.
      const city = i === 0
        ? "Cincinnati"
        : TRANSITION_CITIES.find(c => text.includes(c));
      expect(city).toBeDefined();
      citiesSeen.push(city as string);
      // Tap through the overlay to advance to the next hole.
      fireEvent.click(screen.getByTestId("hole-transition"));
    }
    // All three distinct.
    expect(new Set(citiesSeen).size).toBe(3);
    expect(citiesSeen[0]).toBe("Cincinnati");
  });
});
