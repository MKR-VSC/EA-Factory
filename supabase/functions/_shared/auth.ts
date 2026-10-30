import { getAdminClient } from "./supabase.ts";

/** error ที่มี HTTP status (401/403) เพื่อให้หน้าเว็บแยกได้ว่า "ยังไม่ login" หรือ "ไม่มีสิทธิ์" */
export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireAdmin(req: Request) {
  const admin = getAdminClient();

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new HttpError("Missing Authorization", 401);
  }

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError("Unauthorized", 401);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role,status,is_system_owner")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    throw new HttpError("Profile not found", 403);
  }

  // status ว่าง/null ถือว่าใช้งานได้ (ให้ตรงกับหน้า Login และ authGuard.js)
  const status = String(profile.status || "").trim().toLowerCase();
  if (status && status !== "active") {
    throw new HttpError("Inactive user", 403);
  }

  // role เทียบแบบไม่สนตัวพิมพ์ และอนุญาต system owner เหมือนหน้า Admin Panel
  const role = String(profile.role || "").trim().toLowerCase();
  if (role !== "admin" && profile.is_system_owner !== true) {
    throw new HttpError("Permission denied", 403);
  }

  return {
    admin,
    user: data.user,
    profile,
  };
}
