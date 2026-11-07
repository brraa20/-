import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedPermissions = new Set([
  "reports",
  "analytics",
  "questions",
  "interventions",
  "support",
]);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response({ error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response({ error: "Authentication required." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "Server-side Supabase secrets are not configured." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return response({ error: "Invalid or expired session." }, 401);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify the teacher account.", profileError);
    return response({ error: "Could not verify account permissions." }, 500);
  }
  if (profile?.role !== "owner" || !profile.active) {
    return response({ error: "Only the active platform owner can invite teachers." }, 403);
  }

  let input: { email?: string; displayName?: string; permissions?: string[]; redirectTo?: string };
  try {
    input = await request.json();
  } catch {
    return response({ error: "Invalid JSON request." }, 400);
  }

  const email = input.email?.trim().toLowerCase();
  const displayName = input.displayName?.trim();
  const permissions = input.permissions;
  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !displayName ||
    displayName.length > 120 ||
    !Array.isArray(permissions) ||
    permissions.some((permission) => !allowedPermissions.has(permission)) ||
    !permissions.some((permission) =>
      ["reports", "questions", "interventions", "support"].includes(permission)
    )
  ) {
    return response({ error: "Teacher details or permissions are invalid." }, 400);
  }

  const requestOrigin = request.headers.get("Origin");
  let redirectTo: string;
  try {
    const origin = new URL(requestOrigin ?? "");
    const isLocalDevelopment = origin.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(origin.hostname);
    if (origin.protocol !== "https:" && !isLocalDevelopment) {
      return response({ error: "Teacher invitation requires a secure site origin." }, 400);
    }
    const invitationUrl = new URL(input.redirectTo ?? "");
    if (
      invitationUrl.origin !== origin.origin ||
      !invitationUrl.pathname.endsWith("/create-password.html") ||
      invitationUrl.search ||
      invitationUrl.hash
    ) {
      return response({ error: "The teacher invitation redirect URL is invalid." }, 400);
    }
    redirectTo = invitationUrl.toString();
  } catch {
    return response({ error: "Could not determine the teacher invitation redirect URL." }, 400);
  }

  const { data: invitation, error: inviteError } = await adminClient.auth.admin
    .inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo,
    });
  if (inviteError || !invitation.user) {
    console.error("Could not invite the teacher.", inviteError);
    return response({ error: inviteError?.message ?? "Teacher invitation failed." }, 400);
  }

  const { data: teacherProfile, error: updateError } = await adminClient
    .from("profiles")
    .upsert({
      id: invitation.user.id,
      email,
      display_name: displayName,
      role: "teacher",
      active: false,
      invitation_accepted: false,
      permissions,
    }, { onConflict: "id" })
    .select("id, permissions")
    .single();
  if (updateError || !teacherProfile) {
    console.error("Could not assign teacher permissions.", updateError);
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    return response({ error: "The invitation could not be assigned teacher permissions." }, 500);
  }

  return response({ invited: true, redirectTo });
});
