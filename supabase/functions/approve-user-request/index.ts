import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { request_id, email, full_name, role } = await req.json();

    if (!request_id || !email || !full_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: request_id, email, full_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client using service role key (only available server-side in edge functions)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create the user account (email_confirm: true skips the confirmation email)
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name,
        role: role || "staff",
      },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send a password-reset / magic link so the user can set their own password
    const { error: resetError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: Deno.env.get("SITE_URL") || "https://elitetrucking-dashboard.netlify.app",
      },
    });

    if (resetError) {
      console.warn("Password reset link failed:", resetError.message);
      // Non-fatal — account was still created
    }

    // Mark the request as approved
    await adminClient
      .from("user_requests")
      .update({ status: "approved" })
      .eq("id", request_id);

    return new Response(
      JSON.stringify({ success: true, user_id: userData.user?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
