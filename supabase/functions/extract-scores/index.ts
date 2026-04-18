// ============================================================
// extract-scores — Claude Opus 4.5 vision OCR for scorecard photos
//
// Input: base64 photo + round context (players, holes, pars, handicaps,
//        last-known scores as priors).
// Output: per-player per-hole scores, per-cell confidence 0..1, list of
//         unreadable cells, optional notes.
//
// Auth: Bearer JWT. Verifies the caller is the round's scorekeeper via
// the is_round_scorekeeper SECURITY DEFINER helper BEFORE calling
// Anthropic -- prevents unauthorized API spend.
//
// Mirrors analyze-scorecard/index.ts for CORS / auth / error shapes.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

// ---- Typed I/O shapes (kept local; not exported because Deno edge fns
//      don't import each other in this project) --------------------------

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/heic", "image/webp"] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

interface RoundContext {
  players: Array<{ id: string; name: string; position?: string }>;
  holes: number[];
  pars: number[];
  handicaps: number[];
  lastKnownScores: Record<string, Record<number, number>>;
}

interface ExtractScoresInput {
  image: string;
  mimeType: AllowedMime;
  roundId: string;
  roundContext: RoundContext;
}

interface ExtractScoresOutput {
  scores: Record<string, Record<number, number>>;
  cellConfidence: Record<string, Record<number, number>>;
  unreadable: Array<{ player_id: string; hole: number }>;
  notes?: string;
}

// ---- Validation -----------------------------------------------------------

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateInput(body: unknown): ExtractScoresInput | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.image !== "string" || b.image.length === 0) return "image: required base64 string";
  if (typeof b.mimeType !== "string" || !ALLOWED_MIME.includes(b.mimeType as AllowedMime)) {
    return `mimeType: must be one of ${ALLOWED_MIME.join(", ")}`;
  }
  if (typeof b.roundId !== "string" || b.roundId.length === 0) return "roundId: required";

  const ctx = b.roundContext as Record<string, unknown> | undefined;
  if (!ctx || typeof ctx !== "object") return "roundContext: required";
  if (!Array.isArray(ctx.players) || ctx.players.length === 0) return "roundContext.players: required non-empty array";
  if (!Array.isArray(ctx.holes) || ctx.holes.length === 0) return "roundContext.holes: required non-empty array";
  if (!Array.isArray(ctx.pars) || ctx.pars.length !== 18) return "roundContext.pars: must be length 18";
  if (!Array.isArray(ctx.handicaps) || ctx.handicaps.length !== 18) return "roundContext.handicaps: must be length 18";
  if (typeof ctx.lastKnownScores !== "object" || ctx.lastKnownScores === null) {
    return "roundContext.lastKnownScores: required object";
  }
  for (const p of ctx.players as unknown[]) {
    const pp = p as Record<string, unknown>;
    if (typeof pp.id !== "string" || typeof pp.name !== "string") return "players: each must have id+name strings";
  }

  return b as unknown as ExtractScoresInput;
}

// ---- System prompt --------------------------------------------------------

function buildSystemPrompt(ctx: RoundContext, holes: number[]): string {
  const playerList = ctx.players.map(p => `  - ${p.id}: ${p.name}${p.position ? ` (${p.position})` : ""}`).join("\n");
  const priors = Object.entries(ctx.lastKnownScores)
    .map(([pid, perHole]) => {
      const list = Object.entries(perHole).map(([h, s]) => `h${h}=${s}`).join(", ");
      return `  - ${pid}: ${list || "(no scores yet)"}`;
    })
    .join("\n");

  return `You are a golf scorecard OCR assistant. Extract per-player per-hole GROSS scores from the photo. Return valid JSON ONLY -- no markdown fences, no prose, no commentary.

PLAYERS in this round:
${playerList}

HOLES to extract (ignore all other holes): ${holes.join(", ")}

PAR (hole 1..18): ${ctx.pars.join(", ")}

LAST-KNOWN SCORES (strong priors; only return changes or new entries you can read with high confidence -- if a cell matches the last-known value, still return it so the client can confirm):
${priors}

OUTPUT SCHEMA (strict):
{
  "scores": { "<player_id>": { "<hole>": <integer gross score>, ... }, ... },
  "cellConfidence": { "<player_id>": { "<hole>": <float 0..1>, ... }, ... },
  "unreadable": [{ "player_id": "<id>", "hole": <integer> }, ...],
  "notes": "<optional string>"
}

RULES:
- Only include the player IDs listed above. Use EXACTLY those ids as keys.
- Only include holes in the requested list.
- If a cell is smudged, ambiguous, or missing: OMIT it from "scores" and add it to "unreadable". Do NOT guess.
- Confidence 0.85+ = crisp print. 0.60-0.84 = readable but any doubt. <0.60 = treat as unreadable.
- Gross scores are integers 1-15 (realistic range). Anything outside is almost certainly a misread.
- Return ONLY the JSON object. No explanation, no markdown, no wrappers.`;
}

// ---- Main handler ---------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let logCtx: Record<string, unknown> = {};

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userRes.user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    // --- Parse + validate body ---
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("body must be valid JSON");
    }
    const input = validateInput(body);
    if (typeof input === "string") return badRequest(input);

    logCtx = { roundId: input.roundId, userId, players: input.roundContext.players.length };

    // --- Authorization: scorekeeper gate (before any Anthropic spend) ---
    const { data: isSk, error: skErr } = await supabase.rpc("is_round_scorekeeper", {
      _user_id: userId,
      _round_id: input.roundId,
    });
    if (skErr) {
      console.error("[extract-scores] is_round_scorekeeper rpc failed", { ...logCtx, err: skErr });
      return new Response(JSON.stringify({ error: "Authorization check failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isSk) {
      console.warn("[extract-scores] non-scorekeeper request rejected", logCtx);
      return new Response(JSON.stringify({ error: "Forbidden: not the scorekeeper for this round" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Anthropic call ---
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.error("[extract-scores] ANTHROPIC_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildSystemPrompt(input.roundContext, input.roundContext.holes);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: input.mimeType,
                  data: input.image,
                },
              },
              {
                type: "text",
                text: "Extract the scores per the system schema. JSON only.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[extract-scores] Anthropic error", { ...logCtx, status: response.status, errText });
      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify({ error: response.status === 429 ? "Rate limited" : "AI credits exhausted" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const rawText: string = aiData.content?.[0]?.text || "";
    const usage = aiData.usage as { input_tokens?: number; output_tokens?: number } | undefined;

    // --- Parse the JSON ---
    let parsed: ExtractScoresOutput;
    try {
      const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const maybe = JSON.parse(cleaned) as unknown;
      if (typeof maybe !== "object" || maybe === null) throw new Error("not an object");
      const m = maybe as Record<string, unknown>;
      if (typeof m.scores !== "object" || m.scores === null) throw new Error("missing scores");
      if (typeof m.cellConfidence !== "object" || m.cellConfidence === null) throw new Error("missing cellConfidence");
      if (!Array.isArray(m.unreadable)) throw new Error("missing unreadable");
      parsed = maybe as unknown as ExtractScoresOutput;
    } catch (parseErr) {
      console.error("[extract-scores] JSON parse failed", { ...logCtx, parseErr: String(parseErr), rawLen: rawText.length });
      return new Response(
        JSON.stringify({ error: "Could not parse scorecard data", raw: rawText }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Compute observability counters ---
    let extractedCellCount = 0;
    let lowConfidenceCount = 0;
    for (const pid of Object.keys(parsed.scores)) {
      for (const hole of Object.keys(parsed.scores[pid])) {
        extractedCellCount++;
        const conf = parsed.cellConfidence[pid]?.[hole as unknown as number] ?? 0;
        if (conf < 0.60) lowConfidenceCount++;
      }
    }

    console.log("[extract-scores] success", {
      ...logCtx,
      latencyMs: Date.now() - startedAt,
      tokensIn: usage?.input_tokens ?? null,
      tokensOut: usage?.output_tokens ?? null,
      extractedCellCount,
      lowConfidenceCount,
      unreadableCount: parsed.unreadable.length,
      parseSuccess: true,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[extract-scores] unhandled error", { ...logCtx, err: String(e), latencyMs: Date.now() - startedAt });
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
