import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ============================================================
// PR #24 commit 2 — ErrorBoundary with stuck-round recovery.
//
// Covers:
//   (a) No active round → render defaults (Try Again only, no Abandon)
//   (b) Active but not-stuck round → Try Again + Abandon + Go to Feed
//   (c) Stuck round → amber styling + Abandon + Try Again + Go to Feed
//   (d) Abandon handler calls cancelRound + redirects to /feed
//   (e) Abandon failure surfaces an error message + re-enables buttons
//
// Source-level wiring tests at the bottom confirm imports + structure.
// ============================================================

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock db.ts — tests control loadActiveRound / cancelRound return values.
vi.mock("@/lib/db", () => ({
  loadActiveRound: vi.fn(),
  cancelRound: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

/** A component that throws synchronously — triggers the error boundary. */
function Boom(): JSX.Element {
  throw new Error("boom: synthetic crash");
}

beforeEach(async () => {
  db = await import("@/lib/db");
  db.loadActiveRound.mockReset();
  db.cancelRound.mockReset();
  // Silence the expected React-error console noise from the boom component
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("<ErrorBoundary /> — no active round", () => {
  it("falls back to just 'Try Again' (no Abandon / Go to Feed buttons)", async () => {
    db.loadActiveRound.mockResolvedValue(null);
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    // Wait for the useEffect probe to resolve
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-fallback")).toHaveAttribute("data-stuck", "false");
    });
    expect(screen.getByTestId("error-boundary-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-abandon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-feed")).not.toBeInTheDocument();
  });

  it("renders the generic error message, not the stuck-round copy", async () => {
    db.loadActiveRound.mockResolvedValue(null);
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    });
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/looks stuck/i)).not.toBeInTheDocument();
  });
});

describe("<ErrorBoundary /> — stuck active round (Jonathan's scenario)", () => {
  const stuckRound = {
    id: "10a26980-1234-5678-9abc-def012345678",
    course: "Austin Muni",
    created_at: "2026-04-22T17:00:00Z", // hours before any test's NOW
    course_details: { game_state: { currentHole: null } },
  };

  it("renders Abandon + Try Again + Go to Feed (all three buttons)", async () => {
    db.loadActiveRound.mockResolvedValue(stuckRound);
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-fallback")).toHaveAttribute("data-stuck", "true");
    });
    expect(screen.getByTestId("error-boundary-abandon")).toBeInTheDocument();
    expect(screen.getByTestId("error-boundary-retry")).toBeInTheDocument();
    expect(screen.getByTestId("error-boundary-feed")).toBeInTheDocument();
  });

  it("surfaces the stuck-round copy + course name", async () => {
    db.loadActiveRound.mockResolvedValue(stuckRound);
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await waitFor(() => {
      expect(screen.getByText(/Your round crashed/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Austin Muni/)).toBeInTheDocument();
  });

  it("clicking Abandon calls cancelRound with the stuck round's id", async () => {
    db.loadActiveRound.mockResolvedValue(stuckRound);
    db.cancelRound.mockResolvedValue(undefined);
    // Replace the redirect with a spy — JSDOM's location.href=... isn't a no-op
    const locationHrefSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { set href(v: string) { locationHrefSpy(v); } },
      writable: true,
    });
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-abandon")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("error-boundary-abandon"));
    await waitFor(() => {
      expect(db.cancelRound).toHaveBeenCalledWith(stuckRound.id);
    });
    // Successful abandon redirects to /feed
    expect(locationHrefSpy).toHaveBeenCalledWith("/feed");
  });

  it("Abandon button disabled + label swaps during in-flight", async () => {
    db.loadActiveRound.mockResolvedValue(stuckRound);
    // Resolve cancelRound SLOWLY — gives us time to observe the in-flight state
    let resolveCancel: () => void = () => {};
    db.cancelRound.mockImplementation(
      () => new Promise<void>((res) => { resolveCancel = res; }),
    );
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-abandon")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("error-boundary-abandon"));
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-abandon")).toBeDisabled();
    });
    expect(screen.getByTestId("error-boundary-abandon")).toHaveTextContent(/Abandoning…/);
    expect(screen.getByTestId("error-boundary-retry")).toBeDisabled();
    expect(screen.getByTestId("error-boundary-feed")).toBeDisabled();
    // Clean up pending promise so the test doesn't leak
    resolveCancel();
  });

  it("Abandon failure surfaces an error + re-enables buttons", async () => {
    db.loadActiveRound.mockResolvedValue(stuckRound);
    db.cancelRound.mockRejectedValue(new Error("network down"));
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-abandon")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("error-boundary-abandon"));
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-abandon-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("error-boundary-abandon-error")).toHaveTextContent("network down");
    // Buttons re-enabled so user can retry
    expect(screen.getByTestId("error-boundary-abandon")).not.toBeDisabled();
    expect(screen.getByTestId("error-boundary-retry")).not.toBeDisabled();
  });
});

describe("<ErrorBoundary /> — active but not stuck", () => {
  // Fresh round (<10 min old) with currentHole=null. NOT stuck by the
  // detector's rule, but still has an active round the user might want
  // to recover from. We surface Abandon + Go to Feed (fewer urgency
  // cues; standard "Something went wrong" copy).
  it("renders Abandon + Try Again + Go to Feed but not the stuck-specific copy", async () => {
    const recentRound = {
      id: "deadbeef-1234",
      course: "Flintrock",
      // Created 1 minute before "now" — well inside the grace window
      created_at: new Date(Date.now() - 60_000).toISOString(),
      course_details: { game_state: { currentHole: null } },
    };
    db.loadActiveRound.mockResolvedValue(recentRound);
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    });
    expect(screen.getByTestId("error-boundary-fallback")).toHaveAttribute("data-stuck", "false");
    expect(screen.getByTestId("error-boundary-abandon")).toBeInTheDocument();
    expect(screen.queryByText(/Your round crashed/)).not.toBeInTheDocument();
  });
});

describe("<ErrorBoundary /> — source-level wiring", () => {
  it("imports loadActiveRound + cancelRound from db", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/components/ErrorBoundary.tsx"), "utf-8");
    expect(src).toMatch(
      /import \{ loadActiveRound, cancelRound \} from "@\/lib\/db"/,
    );
  });

  it("imports isRoundStuck from the shared stuckRound module", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/components/ErrorBoundary.tsx"), "utf-8");
    expect(src).toMatch(/import \{ isRoundStuck[^}]*\} from "@\/lib\/stuckRound"/);
  });

  it("useEffect probe runs on mount (async loadActiveRound call)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/components/ErrorBoundary.tsx"), "utf-8");
    expect(src).toMatch(/useEffect\(\(\) => \{[\s\S]*?loadActiveRound\(\)/);
  });

  it("redirect path on successful Abandon is /feed (not the crashed URL)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/components/ErrorBoundary.tsx"), "utf-8");
    expect(src).toMatch(/window\.location\.href = "\/feed"/);
  });
});
