// Typed errors for round loading. Lives in its own file so unit tests can
// import without pulling in the Supabase client's module-init side effects.

/**
 * Discriminator for RoundLoadError recovery paths:
 *  - "timeout"      — 10s AbortController timeout fired; show retry
 *  - "not_found"    — round id doesn't exist or RLS hides it; back to home
 *  - "unauthorized" — JWT expired / PGRST301; redirect to /auth
 *  - "network"      — everything else; show retry + generic message
 */
export type RoundLoadErrorKind = "timeout" | "not_found" | "unauthorized" | "network";

export class RoundLoadError extends Error {
  kind: RoundLoadErrorKind;
  roundId: string;
  override cause?: unknown;

  constructor(kind: RoundLoadErrorKind, roundId: string, message: string, cause?: unknown) {
    super(message);
    this.name = "RoundLoadError";
    this.kind = kind;
    this.roundId = roundId;
    this.cause = cause;
  }
}

/**
 * Classify an arbitrary thrown value into a RoundLoadError. Callers use this
 * inside catch blocks around Supabase calls. If the error is already a
 * RoundLoadError, returned as-is.
 */
export function classifyRoundLoadError(err: any, roundId: string): RoundLoadError {
  if (err instanceof RoundLoadError) return err;
  const msg = String(err?.message || err || "unknown error");
  const code = err?.code || err?.status;

  if (code === "PGRST301" || code === 401 || /jwt|unauthor/i.test(msg)) {
    return new RoundLoadError("unauthorized", roundId, msg, err);
  }
  if (err?.name === "AbortError") {
    return new RoundLoadError("timeout", roundId, "Request aborted", err);
  }
  return new RoundLoadError("network", roundId, msg, err);
}
