import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "Method not allowed." });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return respond(401, { error: "Sign in is required." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { error: "The account invitation function is not configured." });
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return respond(401, { error: "The sign-in session is invalid or expired." });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", userData.user.id)
      .single();
    if (profileError) return respond(403, { error: "Unable to verify administrator access." });
    if (profile.role !== "admin" || !profile.is_active) return respond(403, { error: "Active administrator access is required." });

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.fullName ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(400, { error: "Enter a valid email address." });
    if (!fullName || fullName.length > 120) return respond(400, { error: "Enter a name between 1 and 120 characters." });

    const appSiteUrl = Deno.env.get("APP_SITE_URL");
    const requestedRedirect = typeof body.redirectTo === "string" ? body.redirectTo : "";
    const allowedRedirects = new Set([
      "https://system-cargo.vercel.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ]);
    const redirectTo = appSiteUrl || (allowedRedirects.has(requestedRedirect) ? requestedRedirect : "https://system-cargo.vercel.app");
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo
    });
    if (inviteError) {
      const status = /email|smtp|provider/i.test(inviteError.message) ? 502 : 400;
      return respond(status, { error: inviteError.message });
    }
    return respond(200, { invited: true, userId: invited.user.id });
  } catch (error) {
    return respond(400, { error: error instanceof Error ? error.message : "The account invitation request failed." });
  }
});
