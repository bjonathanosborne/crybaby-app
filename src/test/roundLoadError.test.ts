import { describe, it, expect } from "vitest";
import { RoundLoadError, classifyRoundLoadError } from "@/lib/roundErrors";

// Note: the loadRound/loadGameState timeout paths are integration-testable but
// would require mocking the supabase client. These unit tests cover the
// RoundLoadError shape, the discriminated-union semantics callers rely on,
// and the classifier that normalizes arbitrary throws into RoundLoadError.

describe("RoundLoadError", () => {
  it("exposes kind, roundId, message, and cause", () => {
    const underlying = { code: "PGRST301", message: "JWT expired" };
    const err = new RoundLoadError("unauthorized", "round-123", "auth failed", underlying);
    expect(err.kind).toBe("unauthorized");
    expect(err.roundId).toBe("round-123");
    expect(err.message).toBe("auth failed");
    expect(err.cause).toBe(underlying);
    expect(err.name).toBe("RoundLoadError");
  });

  it("is an instance of Error (stack traces work)", () => {
    const err = new RoundLoadError("timeout", "r", "timed out");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RoundLoadError);
  });

  it("supports all four kinds as literal types", () => {
    const kinds: Array<"timeout" | "not_found" | "unauthorized" | "network"> = [
      "timeout", "not_found", "unauthorized", "network",
    ];
    kinds.forEach(k => {
      const err = new RoundLoadError(k, "r", "x");
      expect(err.kind).toBe(k);
    });
  });
});

describe("classifyRoundLoadError", () => {
  it("passes through existing RoundLoadError instances unchanged", () => {
    const original = new RoundLoadError("not_found", "r1", "nope");
    const result = classifyRoundLoadError(original, "r2");
    expect(result).toBe(original); // same reference
    expect(result.roundId).toBe("r1"); // original roundId preserved
  });

  it("classifies PGRST301 as unauthorized", () => {
    const pgError = { code: "PGRST301", message: "JWT expired" };
    const err = classifyRoundLoadError(pgError, "r1");
    expect(err.kind).toBe("unauthorized");
    expect(err.cause).toBe(pgError);
  });

  it("classifies HTTP 401 as unauthorized", () => {
    const err = classifyRoundLoadError({ status: 401, message: "Unauthorized" }, "r1");
    expect(err.kind).toBe("unauthorized");
  });

  it("classifies AbortError as timeout", () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const err = classifyRoundLoadError(abortErr, "r1");
    expect(err.kind).toBe("timeout");
  });

  it("falls back to network for unknown shapes", () => {
    const err = classifyRoundLoadError({ message: "ECONNRESET" }, "r1");
    expect(err.kind).toBe("network");
    expect(err.message).toBe("ECONNRESET");
  });

  it("handles string and null throws gracefully", () => {
    expect(classifyRoundLoadError("oops", "r1").kind).toBe("network");
    expect(classifyRoundLoadError(null, "r1").kind).toBe("network");
  });
});
