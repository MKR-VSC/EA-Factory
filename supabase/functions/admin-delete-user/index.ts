import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/response.ts";
import { requireAdmin } from "../_shared/auth.ts";

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return fail("Method not allowed", 405);
    }

    const { admin, user } = await requireAdmin(req);

    const body = await req.json();
    const userId = String(body.user_id || "").trim();

    if (!userId) {
      return fail("ไม่พบ user_id");
    }

    // ห้ามลบตัวเอง
    if (user.id === userId) {
      return fail("ไม่สามารถลบ User ที่กำลัง Login อยู่ได้");
    }

    // ตรวจสอบว่ามี User นี้จริงหรือไม่
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      return fail(profileError.message);
    }

    if (!profile) {
      return fail("ไม่พบผู้ใช้งาน");
    }

    // ลบสิทธิ์แผนก (ถ้ามี)
    await admin
      .from("user_departments")
      .delete()
      .eq("user_id", userId);

    // ลบ profile
    const { error: deleteProfileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (deleteProfileError) {
      return fail(deleteProfileError.message);
    }

    // ลบ Authentication
    const { error: authError } =
      await admin.auth.admin.deleteUser(userId);

    if (authError) {
      return fail(authError.message);
    }

    return ok({
      message: "ลบผู้ใช้งานสำเร็จ",
    });

  } catch (err) {
    return fail(
      err instanceof Error
        ? err.message
        : "เกิดข้อผิดพลาด",
      500
    );
  }
});