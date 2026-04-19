// ============================================================
// Shared types for capture event rendering. Mirrors the shape emitted
// by supabase/functions/apply-capture/index.ts. Keep these in sync if
// the server ever changes the emit contract.
// ============================================================

/** One per-player-per-hole diff applied by a capture. */
export interface CaptureDelta {
  playerId: string;
  hole: number;
  prior?: number;
  next: number;
}

/** event_data shape for a 'capture_applied' round_events row. */
export interface CaptureAppliedEventData {
  capture_id?: string;
  delta?: CaptureDelta[];
  running_totals?: Record<string, number>;
  prior_totals?: Record<string, number>;
  photo_path?: string | null;
  feed_published_at?: string | null;
}

/** event_data shape for a 'capture_money_shift' round_events row. */
export interface CaptureMoneyShiftEventData {
  capture_id?: string;
  prior_totals?: Record<string, number>;
  new_totals?: Record<string, number>;
  feed_published_at?: string | null;
}

/**
 * A normalized round_events row shape we consume in renderers.
 * Kept loose (unknown event_data) so legacy event types (score/birdie/etc.)
 * still fit through the pipeline.
 */
export interface RoundEventRow {
  id: string;
  round_id: string;
  round_player_id?: string | null;
  hole_number: number;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

/**
 * Type guard: does this event_data look like a CaptureAppliedEventData?
 * We only check the shape of keys we actually use, so downstream code
 * gets strong typing without being rejection-strict.
 */
export function isCaptureAppliedEventData(
  data: Record<string, unknown>,
): data is CaptureAppliedEventData {
  return typeof data === "object" && data !== null;
}

export function isCaptureMoneyShiftEventData(
  data: Record<string, unknown>,
): data is CaptureMoneyShiftEventData {
  return typeof data === "object" && data !== null;
}

/**
 * Merge a capture_applied event with its matching capture_money_shift (if present).
 * Server emits both for a single capture when money changed; UI shows them as one card.
 * Returns the merged view; `applied` is always present, `moneyShift` is optional.
 */
export interface MergedCaptureEvent {
  captureId: string;
  holeNumber: number;
  createdAt: string;
  applied: RoundEventRow;
  appliedData: CaptureAppliedEventData;
  moneyShift?: RoundEventRow;
  moneyShiftData?: CaptureMoneyShiftEventData;
}

/**
 * Given a flat list of round_events rows (any type), extract + merge capture
 * events by capture_id. Returns only the capture-related events; non-capture
 * events pass through the caller unchanged.
 */
export function mergeCaptureEvents(events: RoundEventRow[]): {
  merged: MergedCaptureEvent[];
  nonCapture: RoundEventRow[];
} {
  const appliedById = new Map<string, RoundEventRow>();
  const shiftById = new Map<string, RoundEventRow>();
  const nonCapture: RoundEventRow[] = [];

  for (const evt of events) {
    const data = evt.event_data as Record<string, unknown>;
    const captureId = typeof data.capture_id === "string" ? data.capture_id : null;
    if (evt.event_type === "capture_applied" && captureId) {
      appliedById.set(captureId, evt);
    } else if (evt.event_type === "capture_money_shift" && captureId) {
      shiftById.set(captureId, evt);
    } else {
      nonCapture.push(evt);
    }
  }

  const merged: MergedCaptureEvent[] = [];
  for (const [captureId, applied] of appliedById.entries()) {
    const appliedData = applied.event_data as CaptureAppliedEventData;
    const moneyShift = shiftById.get(captureId);
    merged.push({
      captureId,
      holeNumber: applied.hole_number,
      createdAt: applied.created_at,
      applied,
      appliedData,
      moneyShift,
      moneyShiftData: moneyShift?.event_data as CaptureMoneyShiftEventData | undefined,
    });
  }

  // Sort merged by createdAt ascending — caller can reverse if needed.
  merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { merged, nonCapture };
}

/**
 * Compute the largest money mover from a money-shift payload — the player
 * whose total changed by the greatest absolute amount. Used for the
 * "Grant takes +$40 on hole 14" headline text.
 */
export function largestMover(shiftData: CaptureMoneyShiftEventData): {
  playerId: string;
  delta: number;
} | null {
  const prior = shiftData.prior_totals ?? {};
  const next = shiftData.new_totals ?? {};
  const ids = new Set<string>([...Object.keys(prior), ...Object.keys(next)]);
  let best: { playerId: string; delta: number } | null = null;
  for (const id of ids) {
    const d = (next[id] ?? 0) - (prior[id] ?? 0);
    if (best === null || Math.abs(d) > Math.abs(best.delta)) {
      best = { playerId: id, delta: d };
    }
  }
  return best;
}

/**
 * Derive per-player strokes-over-par from raw hole_scores + pars.
 * Returns a map: playerId → +3 / -1 / 0. Players with no scores return null.
 */
export function strokesOverPar(
  holeScoresByPlayer: Record<string, Record<number, number>>,
  pars: number[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [pid, byHole] of Object.entries(holeScoresByPlayer)) {
    let played = 0;
    let strokes = 0;
    let parSum = 0;
    for (const [h, s] of Object.entries(byHole)) {
      const hole = Number(h);
      if (hole < 1 || hole > 18) continue;
      strokes += s;
      parSum += pars[hole - 1] ?? 4;
      played++;
    }
    out[pid] = played > 0 ? strokes - parSum : null;
  }
  return out;
}
