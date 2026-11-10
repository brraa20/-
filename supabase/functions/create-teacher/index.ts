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
  "manage_teachers",
]);

function normalizeAssignments(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > 100)
  ) {
    return null;
  }
  const assignments = value.map((item) => item.trim());
  return new Set(assignments).size === assignments.length ? assignments : null;
}

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
    .select("role, active, invitation_accepted, permissions, school_name, assigned_grades, assigned_subjects")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify the teacher account.", profileError);
    return response({ error: "Could not verify account permissions." }, 500);
  }
  const isOwner = profile?.role === "owner" && profile.active;
  const isSchoolManager = profile?.role === "school_manager" &&
    profile.active &&
    profile.invitation_accepted &&
    profile.permissions.includes("manage_teachers");
  if (!isOwner && !isSchoolManager) {
    return response({ error: "An active owner or authorized school manager is required." }, 403);
  }

  let input: {
    email?: string;
    displayName?: string;
    role?: string;
    schoolName?: string;
    grades?: unknown;
    subjects?: unknown;
    permissions?: string[];
    redirectTo?: string;
  };
  try {
    input = await request.json();
  } catch {
    return response({ error: "Invalid JSON request." }, 400);
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const role = input.role ?? "teacher";
  const schoolName = typeof input.schoolName === "string" ? input.schoolName.trim() : "";
  const grades = normalizeAssignments(input.grades);
  const subjects = normalizeAssignments(input.subjects);
  const permissions = input.permissions;
  if (Array.isArray(permissions) && permissions.length === 0) {
    return response({ error: "اختر صلاحية واحدة على الأقل قبل إرسال الدعوة." }, 400);
  }
  if (
    Array.isArray(permissions) &&
    permissions.some((permission) => ["reports", "analytics"].includes(permission)) &&
    (!grades || grades.length === 0)
  ) {
    return response({ error: "أدخل صفًا واحدًا على الأقل عند تفعيل التقارير أو تحليلات المدرسة." }, 400);
  }
  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !displayName ||
    displayName.length > 120 ||
    !schoolName ||
    schoolName.length > 160 ||
    !["teacher", "school_manager"].includes(role) ||
    (role === "school_manager" && !isOwner) ||
    !grades ||
    !subjects ||
    !Array.isArray(permissions) ||
    permissions.length === 0 ||
    new Set(permissions).size !== permissions.length ||
    permissions.some((permission) => !allowedPermissions.has(permission)) ||
    (role === "teacher" && permissions.includes("manage_teachers"))
  ) {
    return response({ error: "Teacher details or permissions are invalid." }, 400);
  }
  if (isSchoolManager && profile) {
    const managerPermissions = profile.permissions.filter((permission: string) => permission !== "manage_teachers");
    if (
      role !== "teacher" ||
      !profile.school_name.trim() ||
      schoolName.toLocaleLowerCase() !== profile.school_name.trim().toLocaleLowerCase() ||
      permissions.some((permission) => !managerPermissions.includes(permission)) ||
      grades.some((grade) => !profile.assigned_grades.includes(grade)) ||
      subjects.some((subject) => !profile.assigned_subjects.includes(subject))
    ) {
      return response({ error: "The invitation exceeds the manager's school or assigned access." }, 403);
    }
  }
  if (isOwner && profile) {
    const ownerSchool = profile.school_name.trim();
    if (ownerSchool && ownerSchool.toLocaleLowerCase() !== schoolName.toLocaleLowerCase()) {
      return response({ error: "All accounts in this Supabase project must belong to its configured school." }, 403);
    }

    if (!ownerSchool) {
      const { data: savedOwner, error: saveSchoolError } = await adminClient
        .from("profiles")
        .update({ school_name: schoolName })
        .eq("id", userData.user.id)
        .eq("school_name", "")
        .select("school_name")
        .maybeSingle();
      if (saveSchoolError) {
        console.error("Could not set the platform school.", saveSchoolError);
        return response({ error: "Could not set the platform school." }, 500);
      }
      let persistedOwnerSchool: string | null = savedOwner?.school_name ?? null;
      if (!persistedOwnerSchool) {
        const { data: currentOwner, error: currentOwnerError } = await adminClient
          .from("profiles")
          .select("school_name")
          .eq("id", userData.user.id)
          .single();
        if (currentOwnerError || !currentOwner) {
          console.error("Could not verify the platform school.", currentOwnerError);
          return response({ error: "Could not verify the platform school." }, 500);
        }
        persistedOwnerSchool = currentOwner.school_name;
      }
      if (persistedOwnerSchool.trim().toLocaleLowerCase() !== schoolName.toLocaleLowerCase()) {
        return response({ error: "All accounts in this Supabase project must belong to its configured school." }, 403);
      }
    }
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
      role,
      school_name: schoolName,
      assigned_grades: grades,
      assigned_subjects: subjects,
      active: false,
      invitation_accepted: false,
      permissions,
    }, { onConflict: "id" })
    .select("id, role, permissions")
    .single();
  if (updateError || !teacherProfile) {
    console.error("Could not assign teacher permissions.", updateError);
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    return response({ error: "The invitation could not be assigned teacher permissions." }, 500);
  }

  return response({ invited: true, redirectTo });
});
