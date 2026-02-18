import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: userError } = await supabase.auth.getUser();
    if (userError || !caller) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = caller.id;

    const { emails, inviter_name } = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(
        JSON.stringify({ error: "emails array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit to 20 invites at a time
    const validEmails = emails
      .filter((e: string) => typeof e === "string" && e.includes("@"))
      .slice(0, 20);

    if (validEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid emails provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to send invite emails
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const signupUrl = "https://crybabygolf.lovable.app/auth";
    const senderName = inviter_name || "Your friend";

    let sentCount = 0;
    const errors: string[] = [];

    for (const email of validEmails) {
      try {
        // Check if user already exists
        const { data: existingUsers } = await adminSupabase.auth.admin.listUsers();
        const exists = existingUsers?.users?.some(u => u.email === email);

        if (exists) {
          errors.push(`${email}: already on Crybaby`);
          continue;
        }

        // Send magic link invite (creates account if doesn't exist)
        const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
          redirectTo: signupUrl,
          data: {
            invited_by: callerUserId,
            invited_by_name: senderName,
          },
        });

        if (inviteError) {
          errors.push(`${email}: ${inviteError.message}`);
        } else {
          sentCount++;
        }
      } catch (e) {
        errors.push(`${email}: failed`);
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
