import { useEffect, useState } from "react";
import { ErrorBoundary as REB } from "react-error-boundary";
import { loadActiveRound, cancelRound } from "@/lib/db";
import { isRoundStuck, type StuckRoundCandidate } from "@/lib/stuckRound";

// ============================================================
// Root-level ErrorBoundary with stuck-round recovery (PR #24 commit 2).
//
// Pre-PR-24 this rendered a generic "Something went wrong / Try Again"
// fallback. For users whose round crashed on mount (React #310 and
// similar), "Try Again" reloads the crashed URL → crashes again →
// infinite stuck loop. The StuckRoundBanner (shipped in PR #23) can't
// help because it only renders on /feed, and the user is stuck on
// /round?id=X staring at the fallback.
//
// Fix: the Fallback component now probes `loadActiveRound()` on mount.
// If it finds an active round AND the stuck heuristic matches (same
// detector as the feed's StuckRoundBanner — >10 min old + null
// currentHole), we surface an "Abandon Round" button alongside the
// standard "Try Again" + "Go to Feed" buttons. User recovers from
// the crashed screen itself, no navigation required.
//
// Design notes:
// - All three buttons are always visible when a stuck round is
//   detected. Users get a clear choice: retry (maybe it'll work this
//   time), abandon (clean the orphan), navigate away.
// - When no stuck round exists (the boundary caught an error on some
//   non-round page), we render just the original Try Again button —
//   no behaviour change for the common case.
// - Abandon fires `cancelRound` + reloads to `/feed` on success.
//   On failure, logs + shows a toast-style error line; user can
//   retry or fall back to Try Again.
// ============================================================

type StuckRoundState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "stuck"; round: StuckRoundCandidate & { id: string; course?: string | null } }
  | { kind: "active-not-stuck"; round: StuckRoundCandidate & { id: string; course?: string | null } };

interface FallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function Fallback({ error, resetErrorBoundary }: FallbackProps): JSX.Element {
  const [stuckState, setStuckState] = useState<StuckRoundState>({ kind: "loading" });
  const [abandonInFlight, setAbandonInFlight] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);

  // On mount, probe for the user's active round. If it exists and looks
  // stuck by the same heuristic as StuckRoundBanner, surface Abandon.
  useEffect(() => {
    let cancelled = false;
    loadActiveRound()
      .then((round) => {
        if (cancelled) return;
        if (!round) {
          setStuckState({ kind: "none" });
          return;
        }
        // round shape from loadActiveRound: { id, course, ..., course_details }
        const looksStuck = isRoundStuck(round as unknown as StuckRoundCandidate);
        setStuckState(looksStuck
          ? { kind: "stuck", round: round as never }
          : { kind: "active-not-stuck", round: round as never });
      })
      .catch(() => {
        if (!cancelled) setStuckState({ kind: "none" });
      });
    return () => { cancelled = true; };
  }, []);

  const handleAbandon = async () => {
    if (stuckState.kind !== "stuck" && stuckState.kind !== "active-not-stuck") return;
    setAbandonInFlight(true);
    setAbandonError(null);
    try {
      await cancelRound(stuckState.round.id);
      // Navigate AWAY from the crashed URL so the retry isn't against
      // the same broken page. Full reload kicks the app into a fresh
      // mount state with no active round.
      window.location.href = "/feed";
    } catch (err) {
      setAbandonInFlight(false);
      setAbandonError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't abandon the round. Try again or tap Reload.",
      );
    }
  };

  const handleGoToFeed = () => {
    window.location.href = "/feed";
  };

  const showAbandon = stuckState.kind === "stuck" || stuckState.kind === "active-not-stuck";

  return (
    <div
      data-testid="error-boundary-fallback"
      data-stuck={stuckState.kind === "stuck" ? "true" : "false"}
      style={{
        maxWidth: 420, margin: "0 auto", minHeight: "100vh",
        background: "#F5EFE0", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Lato', -apple-system, sans-serif", padding: 24,
      }}
    >
      <div style={{ textAlign: "center", width: "100%" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          {stuckState.kind === "stuck" ? "⚠️" : "😬"}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", marginBottom: 8 }}>
          {stuckState.kind === "stuck" ? "Your round crashed" : "Something went wrong"}
        </div>
        <div style={{ fontSize: 13, color: "#8B7355", marginBottom: 24, lineHeight: 1.5 }}>
          {stuckState.kind === "stuck" ? (
            <>
              We found an active round that looks stuck
              {stuckState.round.course ? <> ({stuckState.round.course})</> : null}.
              Abandon it to unblock new round creation, or try reloading.
            </>
          ) : (
            <>{error?.message || "An unexpected error occurred."}</>
          )}
        </div>

        {abandonError && (
          <div
            data-testid="error-boundary-abandon-error"
            role="alert"
            style={{
              padding: "10px 14px", marginBottom: 16, borderRadius: 10,
              background: "#FEE2E2", color: "#DC2626", fontSize: 12,
            }}
          >
            {abandonError}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {showAbandon && (
            <button
              onClick={handleAbandon}
              disabled={abandonInFlight}
              data-testid="error-boundary-abandon"
              style={{
                padding: "14px 28px", borderRadius: 12, border: "none",
                cursor: abandonInFlight ? "not-allowed" : "pointer",
                fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                background: "#DC2626", color: "#fff",
                opacity: abandonInFlight ? 0.6 : 1,
              }}
            >
              {abandonInFlight ? "Abandoning…" : "Abandon Round"}
            </button>
          )}
          <button
            onClick={resetErrorBoundary}
            disabled={abandonInFlight}
            data-testid="error-boundary-retry"
            style={{
              padding: "12px 28px", borderRadius: 12, border: "none",
              cursor: abandonInFlight ? "not-allowed" : "pointer",
              fontFamily: "inherit", fontSize: 14, fontWeight: 700,
              background: "#1E130A", color: "#fff",
              opacity: abandonInFlight ? 0.6 : 1,
            }}
          >
            Try Again
          </button>
          {showAbandon && (
            <button
              onClick={handleGoToFeed}
              disabled={abandonInFlight}
              data-testid="error-boundary-feed"
              style={{
                padding: "12px 28px", borderRadius: 12,
                border: "1px solid #DDD0BB", cursor: abandonInFlight ? "not-allowed" : "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                background: "#FAF5EC", color: "#8B7355",
                opacity: abandonInFlight ? 0.6 : 1,
              }}
            >
              Go to Feed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <REB FallbackComponent={Fallback} onReset={() => window.location.reload()}>
      {children}
    </REB>
  );
}
