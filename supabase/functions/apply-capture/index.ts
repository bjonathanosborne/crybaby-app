// ============================================================
// apply-capture — server-side apply of a confirmed scorecard capture
//
// Takes a captureId + the scorekeeper-confirmed scores, replays the
// entire round via the shared gameEngines module to recompute totals /
// holeResults / nassauState, writes everything to the DB atomically
// (as far as Postgres allows through the Supabase client), marks the
// capture row applied, emits round_events for the live feed (with
// 30s debounce per scorekeeper per round), supersedes any overlapping
// prior captures.
//
// Uses the service_role key to bypass RLS for the writes. The caller
// is authenticated + authorized at the top of the handler.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  replayRound,
  initNassauState,
  type GameMode,
  type GameSettings,
  type Player,
  type ReplayHoleInput,
  type TeamInfo,
  type FlipState,
  type FlipConfig,
  type FlipTeamsInput,
} from "../_shared/gameEngines.ts";
import {
  translateToLegacy,
  validateHammerState,
} from "../_shared/hammerMath.ts";
import {
  computeFlipSettlementSplit,
  roundHasFlipSettlementSplit,
} from "../_shared/flipCrybaby.ts";
import type {
  CaptureHammerState,
  HoleHammerState,
  LegacyHammerEntry,
} from "../_shared/hammerTypes.ts";
import { feedPublishDecision } from "../_shared/feedPublishDecision.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

// ---- I/O shapes ---------------------------------------------------------

interface ApplyCaptureInput {
  captureId: string;
  confirmedScores: Record<string, Record<number, number>>;
  shareToFeed: boolean;
  /**
   * Optional per-hole hammer state captured from the sequenced prompt
   * (Phase 2.5c). Omit for non-hammer rounds or when only score
   * corrections are being applied. Server merges into
   * course_details.game_state.hammerHistory via translateToLegacy.
   */
  hammerState?: CaptureHammerState;
}

interface ApplyCaptureResult {
  captureId: string;
  applied: boolean;
  noop: boolean;
  supersededIds: string[];
  feedPublished: boolean;
  totals: Record<string, number>;
}

// ---- Helpers ------------------------------------------------------------

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateInput(body: unknown): ApplyCaptureInput | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.captureId !== "string" || b.captureId.length === 0) return "captureId required";
  if (typeof b.confirmedScores !== "object" || b.confirmedScores === null) return "confirmedScores required";
  if (typeof b.shareToFeed !== "boolean") return "shareToFeed: boolean required";
  // Light shape check on confirmedScores: record of record of number
  for (const pid of Object.keys(b.confirmedScores as Record<string, unknown>)) {
    const holeMap = (b.confirmedScores as Record<string, unknown>)[pid];
    if (typeof holeMap !== "object" || holeMap === null) return `confirmedScores.${pid} must be object`;
    for (const [h, s] of Object.entries(holeMap as Record<string, unknown>)) {
      const hn = Number(h);
      if (!Number.isInteger(hn) || hn < 1 || hn > 18) return `invalid hole key ${h} under ${pid}`;
      if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > 20) {
        return `confirmedScores.${pid}.${h} must be integer 1..20`;
      }
    }
  }
  // Optional hammerState: { byHole: { <hole>: HoleHammerState } }
  if (b.hammerState !== undefined && b.hammerState !== null) {
    const hs = b.hammerState as Record<string, unknown>;
    if (typeof hs !== "object" || hs === null) return "hammerState must be an object";
    const byHole = hs.byHole as Record<string, unknown> | undefined;
    if (!byHole || typeof byHole !== "object") return "hammerState.byHole required";
    for (const [holeKey, stateVal] of Object.entries(byHole)) {
      const hn = Number(holeKey);
      if (!Number.isInteger(hn) || hn < 1 || hn > 18) return `hammerState.byHole: invalid hole key ${holeKey}`;
      if (typeof stateVal !== "object" || stateVal === null) return `hammerState.byHole.${holeKey} must be an object`;
      const validation = validateHammerState(stateVal as HoleHammerState);
      if (!validation.ok) return `hammerState.byHole.${holeKey} invalid: ${validation.errors.join("; ")}`;
    }
  }
  return b as unknown as ApplyCaptureInput;
}

/**
 * Compute the set of { playerId, hole, priorValue, newValue } where the
 * confirmed scores differ from the current round_players.hole_scores.
 */
function computeDelta(
  prior: Record<string, Record<number, number>>,
  confirmed: Record<string, Record<number, number>>,
): Array<{ playerId: string; hole: number; prior?: number; next: number }> {
  const delta: Array<{ playerId: string; hole: number; prior?: number; next: number }> = [];
  for (const pid of Object.keys(confirmed)) {
    const priorPer = prior[pid] || {};
    const nextPer = confirmed[pid];
    for (const [h, v] of Object.entries(nextPer)) {
      const hole = Number(h);
      if (priorPer[hole] !== v) {
        delta.push({ playerId: pid, hole, prior: priorPer[hole], next: v });
      }
    }
  }
  return delta;
}

// ---- Main handler -------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let logCtx: Record<string, unknown> = {};

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client for auth checks
    const userClient: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userRes.user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    // Parse + validate
    let body: unknown;
    try { body = await req.json(); } catch { return badRequest("body must be valid JSON"); }
    const input = validateInput(body);
    if (typeof input === "string") return badRequest(input);
    logCtx = { captureId: input.captureId, userId };

    // Service-role client for the writes (bypasses RLS; we've already authz'd)
    const service: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load capture, verify ownership + scorekeeper
    const { data: capture, error: capErr } = await service
      .from("round_captures")
      .select("*")
      .eq("id", input.captureId)
      .maybeSingle();
    if (capErr || !capture) {
      return new Response(JSON.stringify({ error: "Capture not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (capture.captured_by !== userId) {
      return new Response(JSON.stringify({ error: "Only the capturer can apply" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const roundId: string = capture.round_id;
    logCtx.roundId = roundId;

    // Confirm still scorekeeper (RLS rule)
    const { data: isSk } = await userClient.rpc("is_round_scorekeeper", {
      _user_id: userId, _round_id: roundId,
    });
    if (!isSk) {
      return new Response(JSON.stringify({ error: "Forbidden: not scorekeeper" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load round + players
    const { data: round, error: roundErr } = await service
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .single();
    if (roundErr || !round) {
      return new Response(JSON.stringify({ error: "Round not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rpsData, error: rpsErr } = await service
      .from("round_players")
      .select("*")
      .eq("round_id", roundId)
      .order("created_at");
    if (rpsErr || !rpsData) {
      return new Response(JSON.stringify({ error: "Failed to load players" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rps = rpsData as Array<{
      id: string;
      user_id: string | null;
      guest_name: string | null;
      hole_scores: Record<string, number> | null;
      total_score: number | null;
    }>;

    // --- Compute delta ---
    const priorScores: Record<string, Record<number, number>> = {};
    for (const rp of rps) {
      const map: Record<number, number> = {};
      for (const [h, s] of Object.entries(rp.hole_scores || {})) {
        map[Number(h)] = s as number;
      }
      priorScores[rp.id] = map;
    }
    const delta = computeDelta(priorScores, input.confirmedScores);

    // --- Noop path: scores AND hammer state both unchanged ---
    // If hammerState was submitted with any byHole entries, fall through to
    // the apply path so translateToLegacy updates hammerHistory. A "noop"
    // response is only valid when the submission adds nothing.
    const hammerHasEntries =
      input.hammerState !== undefined && input.hammerState !== null &&
      Object.keys(input.hammerState.byHole || {}).length > 0;
    if (delta.length === 0 && !hammerHasEntries) {
      await service
        .from("round_captures")
        .update({
          confirmed_extraction: input.confirmedScores,
          applied_at: new Date().toISOString(),
          share_to_feed: input.shareToFeed,
        })
        .eq("id", input.captureId);

      console.log("[apply-capture] noop", { ...logCtx, latencyMs: Date.now() - startedAt });
      const totals: Record<string, number> = {};
      for (const rp of rps) totals[rp.id] = rp.total_score ?? 0;
      const result: ApplyCaptureResult = {
        captureId: input.captureId,
        applied: true,
        noop: true,
        supersededIds: [],
        feedPublished: false,
        totals,
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Apply delta: write hole_scores per affected player ---
    // Build the full new hole_scores object per player (merge-ish, but
    // we write the whole object to avoid races).
    const nextScoresByPlayer: Record<string, Record<number, number>> = {};
    for (const rp of rps) {
      const confirmedForPlayer = input.confirmedScores[rp.id];
      if (!confirmedForPlayer) {
        nextScoresByPlayer[rp.id] = priorScores[rp.id];
      } else {
        nextScoresByPlayer[rp.id] = { ...priorScores[rp.id], ...confirmedForPlayer };
      }
    }

    // --- Build round metadata needed for replayRound ---
    const courseDetails = (round.course_details || {}) as Record<string, unknown>;
    const pars = Array.isArray(courseDetails.pars)
      ? (courseDetails.pars as number[])
      : Array(18).fill(4);
    const handicaps = Array.isArray(courseDetails.handicaps)
      ? (courseDetails.handicaps as number[])
      : Array.from({ length: 18 }, (_, i) => i + 1);
    const holeValue = typeof courseDetails.holeValue === "number" ? courseDetails.holeValue : 5;
    const playerConfigs = Array.isArray(courseDetails.playerConfig)
      ? (courseDetails.playerConfig as Array<Record<string, unknown>>)
      : [];
    const mechanicSettings = (courseDetails.mechanicSettings || {}) as Record<string, unknown>;

    const settings: GameSettings = {
      hammer: Array.isArray(courseDetails.mechanics) && (courseDetails.mechanics as string[]).includes("hammer"),
      hammerInitiator: String(mechanicSettings.hammerInitiator ?? "any"),
      hammerMaxDepth: String(mechanicSettings.hammerMaxDepth ?? "1"),
      crybaby: Array.isArray(courseDetails.mechanics) && (courseDetails.mechanics as string[]).includes("crybaby"),
      crybabHoles: 3,
      crybabHammerRule: String(mechanicSettings.crybabHammerRule ?? "allowed"),
      birdieBonus: Array.isArray(courseDetails.mechanics) && (courseDetails.mechanics as string[]).includes("birdie_bonus"),
      birdieMultiplier: typeof mechanicSettings.birdieMultiplier === "number" ? mechanicSettings.birdieMultiplier : 2,
      pops: Array.isArray(courseDetails.mechanics) && (courseDetails.mechanics as string[]).includes("pops"),
      noPopsParThree: true,
      carryOverCap: String(mechanicSettings.carryOverCap ?? "∞"),
      handicapPercent: typeof mechanicSettings.handicapPercent === "number" ? mechanicSettings.handicapPercent : 100,
      presses: Array.isArray(courseDetails.mechanics) && (courseDetails.mechanics as string[]).includes("presses"),
      pressType: String(mechanicSettings.pressType ?? "auto"),
    };

    const players: Player[] = rps.map((rp, i) => {
      const cfg = playerConfigs[i] || {};
      return {
        id: rp.id,
        name: rp.guest_name || (cfg.name as string) || `Player ${i + 1}`,
        handicap: typeof cfg.handicap === "number" ? cfg.handicap : 0,
        cart: cfg.cart as string | undefined,
        position: cfg.position as string | undefined,
        color: (cfg.color as string) || "#3B82F6",
        userId: rp.user_id,
      };
    });

    // Build ReplayHoleInput list from merged scores (hammer history not
    // preserved through capture -- treated as zero-depth, no folds; this
    // is a known limitation that matches the post-round-edit behavior
    // of RoundEditScores. Documented in TODOS.md Phase 2 deferrals.)
    const completedHoles = Object.values(nextScoresByPlayer)
      .flatMap(p => Object.keys(p).map(Number))
      .reduce((a, b) => Math.max(a, b), 0);

    // Merge any submitted hammer state into the persisted hammerHistory
    // via translateToLegacy. Holes not present in hammerState keep whatever
    // legacy entry already existed (or default to no-hammer).
    const gameState = (courseDetails.game_state || {}) as Record<string, unknown>;
    const existingLegacyHistory = Array.isArray(gameState.hammerHistory)
      ? (gameState.hammerHistory as Array<{ hole: number; hammerDepth: number; folded: boolean; foldWinnerTeamId?: "A" | "B" }>)
      : [];
    const existingByHole = new Map<number, { hammerDepth: number; folded: boolean; foldWinnerTeamId?: "A" | "B" }>();
    for (const entry of existingLegacyHistory) {
      existingByHole.set(entry.hole, entry);
    }

    // Store the rich hammer state per-hole so we can preserve it across
    // applies (client may submit only a subset of holes; we keep prior
    // rich state for the rest).
    const existingHammerStateByHole = (gameState.hammerStateByHole || {}) as Record<string, HoleHammerState>;
    const mergedHammerStateByHole: Record<string, HoleHammerState> = { ...existingHammerStateByHole };

    if (input.hammerState && input.hammerState.byHole) {
      for (const [holeKey, holeState] of Object.entries(input.hammerState.byHole)) {
        mergedHammerStateByHole[holeKey] = holeState;
        const legacy: LegacyHammerEntry = translateToLegacy(Number(holeKey), holeState);
        existingByHole.set(Number(holeKey), {
          hammerDepth: legacy.hammerDepth,
          folded: legacy.folded,
          foldWinnerTeamId: legacy.foldWinnerTeamId,
        });
      }
    }

    const replayInputs: ReplayHoleInput[] = [];
    for (let h = 1; h <= completedHoles; h++) {
      const scores: Record<string, number> = {};
      let allPresent = true;
      for (const rp of rps) {
        const s = nextScoresByPlayer[rp.id]?.[h];
        if (typeof s !== "number") { allPresent = false; break; }
        scores[rp.id] = s;
      }
      if (!allPresent) continue;
      const legacyEntry = existingByHole.get(h);
      replayInputs.push({
        holeNumber: h,
        scores,
        hammerDepth: legacyEntry?.hammerDepth ?? 0,
        folded: legacyEntry?.folded ?? false,
        foldWinnerTeamId: legacyEntry?.foldWinnerTeamId,
      });
    }

    // Flip-round state lookup.
    //
    // Historical bug: prior to 2026-04-20 this read `gameState.flipTeams`,
    // a field the client never wrote. The client now persists the full
    // per-hole `flipState` (FlipState shape) + `flipConfig` (FlipConfig
    // shape) into game_state on every save. Fall back to the old
    // `flipTeams` field for any legacy rows still carrying it (there are
    // no Flip rounds in prod as of the fix date, but the fallback keeps
    // the replay safe under any future historical surprise).
    let flipTeamsInput: FlipTeamsInput = null;
    let flipConfigInput: FlipConfig | undefined;
    if ((round.game_type as GameMode) === 'flip') {
      const rawFlipState = gameState.flipState as FlipState | undefined;
      const rawFlipConfig = gameState.flipConfig as FlipConfig | undefined;
      const rawLegacyFlipTeams = gameState.flipTeams as TeamInfo | undefined;
      flipTeamsInput = rawFlipState ?? rawLegacyFlipTeams ?? null;
      flipConfigInput = rawFlipConfig;
    }

    const replayStart = Date.now();
    const replay = replayRound(
      (round.game_type as GameMode),
      players,
      pars,
      handicaps,
      holeValue,
      settings,
      replayInputs,
      flipTeamsInput,
      flipConfigInput,
    );
    const replayLatencyMs = Date.now() - replayStart;

    // --- Write player hole_scores + totals ---
    for (const rp of rps) {
      await service
        .from("round_players")
        .update({
          hole_scores: nextScoresByPlayer[rp.id],
          total_score: replay.totals[rp.id] ?? 0,
        })
        .eq("id", rp.id);
    }

    // --- Update course_details.game_state ---
    // Rebuild hammerHistory as the canonical legacy array from existingByHole.
    const updatedHammerHistory: LegacyHammerEntry[] = [];
    for (const [hole, entry] of existingByHole.entries()) {
      updatedHammerHistory.push({
        hole,
        hammerDepth: entry.hammerDepth,
        folded: entry.folded,
        foldWinnerTeamId: entry.foldWinnerTeamId,
      });
    }
    updatedHammerHistory.sort((a, b) => a.hole - b.hole);

    const newGameState = {
      ...gameState,
      currentHole: Math.min(completedHoles + 1, 18),
      totals: replay.totals,
      carryOver: replay.holeResults.length ? replay.holeResults[replay.holeResults.length - 1].carryOver : 0,
      hammerHistory: updatedHammerHistory,
      hammerStateByHole: mergedHammerStateByHole,
      nassauState: (round.game_type === "nassau")
        ? (() => {
            const ns = initNassauState(players);
            for (const hr of replay.holeResults) {
              const wid = hr.winnerIds || [];
              for (const w of wid) {
                if (hr.hole <= 9) ns.frontMatch[w] = (ns.frontMatch[w] || 0) + 1;
                else ns.backMatch[w] = (ns.backMatch[w] || 0) + 1;
                ns.overallMatch[w] = (ns.overallMatch[w] || 0) + 1;
              }
            }
            return ns;
          })()
        : (gameState.nassauState ?? null),
    };
    await service
      .from("rounds")
      .update({ course_details: { ...courseDetails, game_state: newGameState } })
      .eq("id", roundId);

    // --- If round complete, rewrite settlements ---
    if (completedHoles >= 18) {
      await service.from("round_settlements").delete().eq("round_id", roundId).eq("is_manual_adjustment", false);

      // C7: Flip rounds persist a two-component split (base 1-15 +
      // crybaby 16-18) alongside the combined `amount`. Non-Flip rounds
      // leave both columns NULL. All-square Flip rounds
      // (crybabyState.crybaby === "") roll all 18 holes into
      // `base_amount` and set `crybaby_amount = 0` explicitly so the
      // UI can distinguish "no crybaby leg this round" from "data missing".
      const gameMode = round.game_type as GameMode;
      const splitThisRound = roundHasFlipSettlementSplit(gameMode);
      const crybabyStateFromRound = (newGameState.crybabyState || null) as
        | { crybaby?: string }
        | null;
      const crybabyWasPlayed = Boolean(
        crybabyStateFromRound
          && typeof crybabyStateFromRound.crybaby === "string"
          && crybabyStateFromRound.crybaby !== "",
      );

      const settlements = rps.map(rp => {
        const base: {
          round_id: string;
          user_id: string | null;
          guest_name: string | null;
          amount: number;
          is_manual_adjustment: boolean;
          notes: string;
          base_amount?: number;
          crybaby_amount?: number;
        } = {
          round_id: roundId,
          user_id: rp.user_id,
          guest_name: rp.user_id ? null : rp.guest_name,
          amount: replay.totals[rp.id] ?? 0,
          is_manual_adjustment: false,
          notes: "",
        };
        if (splitThisRound) {
          const split = computeFlipSettlementSplit(
            replay.holeResults,
            rp.id,
            crybabyWasPlayed,
          );
          base.base_amount = split.baseAmount;
          base.crybaby_amount = split.crybabyAmount;
        }
        return base;
      });
      await service.from("round_settlements").insert(settlements);
    }

    // --- Supersede prior overlapping captures ---
    const holeRangeStart = capture.hole_range_start ?? 1;
    const holeRangeEnd = capture.hole_range_end ?? completedHoles;
    const { data: priorApplied } = await service
      .from("round_captures")
      .select("id")
      .eq("round_id", roundId)
      .not("applied_at", "is", null)
      .is("superseded_by", null)
      .neq("id", input.captureId)
      .lte("hole_range_start", holeRangeEnd)
      .gte("hole_range_end", holeRangeStart);
    const supersededIds: string[] = (priorApplied || []).map(r => (r as { id: string }).id);
    if (supersededIds.length > 0) {
      await service
        .from("round_captures")
        .update({ superseded_by: input.captureId })
        .in("id", supersededIds);
    }

    // --- Debounce feed emits: 30s window per round ---
    // The DB query answers "has there been a published capture_applied
    // for this round in the last 30s"; the decision itself is
    // feedPublishDecision() so client + server test the same rules.
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    const { data: recent } = await service
      .from("round_events")
      .select("id")
      .eq("round_id", roundId)
      .eq("event_type", "capture_applied")
      .gte("created_at", thirtySecondsAgo)
      .not("event_data->>feed_published_at", "is", null)
      .limit(1);
    const hasRecentlyPublished = Boolean(recent && recent.length > 0);

    const feedPublishedAt = feedPublishDecision({
      privacy: String((courseDetails.privacy ?? "public")),
      trigger: String(capture.trigger ?? "ad_hoc"),
      shareToFeed: input.shareToFeed,
      hasRecentlyPublished,
      nowIso: new Date().toISOString(),
    });

    // --- Mark capture applied ---
    await service
      .from("round_captures")
      .update({
        confirmed_extraction: input.confirmedScores,
        applied_at: new Date().toISOString(),
        share_to_feed: input.shareToFeed,
        feed_published_at: feedPublishedAt,
        hammer_state: input.hammerState ?? null,
        confirmed_hammer_state: input.hammerState ?? null,
      })
      .eq("id", input.captureId);

    // --- Emit round_events ---
    const prior_totals: Record<string, number> = {};
    for (const rp of rps) prior_totals[rp.id] = rp.total_score ?? 0;
    const moneyChanged = Object.keys(replay.totals).some(k => (replay.totals[k] ?? 0) !== (prior_totals[k] ?? 0));

    await service.from("round_events").insert({
      round_id: roundId,
      hole_number: completedHoles || 1,
      event_type: "capture_applied",
      event_data: {
        capture_id: input.captureId,
        delta,
        running_totals: replay.totals,
        prior_totals,
        photo_path: capture.photo_path,
        feed_published_at: feedPublishedAt,
      },
    });

    if (moneyChanged) {
      await service.from("round_events").insert({
        round_id: roundId,
        hole_number: completedHoles || 1,
        event_type: "capture_money_shift",
        event_data: {
          capture_id: input.captureId,
          prior_totals,
          new_totals: replay.totals,
          feed_published_at: feedPublishedAt,
        },
      });
    }

    const result: ApplyCaptureResult = {
      captureId: input.captureId,
      applied: true,
      noop: false,
      supersededIds,
      feedPublished: feedPublishedAt !== null,
      totals: replay.totals,
    };

    console.log("[apply-capture] success", {
      ...logCtx,
      deltaPlayerCount: new Set(delta.map(d => d.playerId)).size,
      deltaHoleCount: new Set(delta.map(d => d.hole)).size,
      replayLatencyMs,
      feedPublished: feedPublishedAt !== null,
      superseded: supersededIds.length,
      totalLatencyMs: Date.now() - startedAt,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[apply-capture] unhandled error", { ...logCtx, err: String(e), latencyMs: Date.now() - startedAt });
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
