import { getAdminClient } from "./supabase.ts";

export async function requireAdmin(req: Request) {
  const admin = getAdminClient();

  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    throw new Error("Missing Authorization");
  }

  const token = authHeader.replace("Bearer ", "");

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role,status")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    throw new Error("Profile not found");
  }

  if (profile.status !== "active") {
    throw new Error("Inactive user");
  }

  if (profile.role !== "admin") {
    throw new Error("Permission denied");
  }

  return {
    admin,
    user: data.user,
    profile,
  };
}