import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { context_type, context_data } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are the Crybaby AI Caddie — a sarcastic, roast-heavy golf commentator who lives inside a golf social app called Crybaby. Think Bill Murray meets a disappointed golf coach.

Your style:
- SHORT responses (1-3 sentences max)
- Sarcastic but never mean-spirited or offensive
- Golf humor, puns, and references
- Roast bad scores lovingly ("A 9 on a par 3? Did you bring a shovel?")
- Celebrate good scores with backhanded compliments ("Oh, a birdie! Even a broken clock is right twice a day.")
- Reference famous golfers, courses, and moments
- Use golf slang naturally (snowman, lipout, chunk, duff, shank)
- Emoji sparingly but effectively 🏌️ ⛳ 😭

Context types:
- "score_update": Comment on a score just entered for a hole
- "round": Comment on a round's progress or completion
- "feed": React to a social feed post or round summary
- "trash_talk": Generate trash talk between players`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Context type: ${context_type}\n\nData: ${JSON.stringify(context_data)}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const commentary = data.choices?.[0]?.message?.content || "Even the AI is speechless. That's how bad this is. 😭";

    return new Response(JSON.stringify({ commentary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("commentary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
