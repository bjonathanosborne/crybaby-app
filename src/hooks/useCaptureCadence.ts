import { useMemo } from "react";
import {
  requiredCadence,
  isPhotoRequiredForHole,
  cadenceReason,
  type CadenceRoundInput,
  type CaptureCadence,
} from "@/lib/captureCadence";

export interface UseCaptureCadenceReturn {
  /** Full cadence descriptor for the round (`every_hole` / `holes` / `none`). */
  cadence: CaptureCadence;
  /** True iff the just-completed hole demands a photo before we can advance. */
  isRequired: boolean;
  /** True iff advance is currently gated on a photo capture being applied. */
  blockedOnPhoto: boolean;
  /** Human-readable reason, for the CapturePrompt banner copy. */
  reason: string | null;
}

/**
 * Client hook wrapping the pure cadence module. Given the round config
 * and the just-completed hole number, returns whether a capture is
 * required and whether advance is currently blocked.
 *
 * `captureApplied` is the caller's signal that a capture row with
 * `applied_at IS NOT NULL` covers this hole. When true, blockedOnPhoto
 * flips to false even if `isRequired` is true.
 */
export function useCaptureCadence(
  round: CadenceRoundInput | null | undefined,
  justCompletedHole: number,
  captureApplied: boolean = false,
): UseCaptureCadenceReturn {
  return useMemo<UseCaptureCadenceReturn>(() => {
    if (!round) {
      return { cadence: { type: "none" }, isRequired: false, blockedOnPhoto: false, reason: null };
    }
    const cadence = requiredCadence(round);
    const isRequired = isPhotoRequiredForHole(round, justCompletedHole);
    return {
      cadence,
      isRequired,
      blockedOnPhoto: isRequired && !captureApplied,
      reason: cadenceReason(round, justCompletedHole),
    };
  }, [round, justCompletedHole, captureApplied]);
}
