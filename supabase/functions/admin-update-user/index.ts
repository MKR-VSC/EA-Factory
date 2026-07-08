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
    const username = String(body.username || "").trim().toUpperCase();
    const display_name = String(body.display_name || username).trim();
    const full_name = String(body.full_name || display_name || username).trim();
    const department = String(body.department || "").trim().toUpperCase();
    const department_code = String(body.department_code || department).trim().toUpperCase();
    const role = String(body.role || "staff").trim().toLowerCase();
    const status = String(body.status || "active").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!userId) return fail("ไม่พบ user_id");
    if (!username) return fail("กรุณาระบุ Username");

    if (user.id === userId && status !== "active") {
      return fail("ไม่สามารถปิดใช้งาน User ที่กำลัง Login อยู่ได้");
    }

    const email = String(body.email || `${username.toLowerCase()}@pvt.local`)
      .trim()
      .toLowerCase();

    const { data: duplicateUser, error: duplicateError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", userId)
      .maybeSingle();

    if (duplicateError) return fail(duplicateError.message);
    if (duplicateUser) return fail(`Username ${username} มีอยู่แล้ว`);

    const authPayload: Record<string, unknown> = {
      email,
      user_metadata: {
        username,
        display_name,
        full_name,
        role,
        department,
        department_code,
        status,
      },
    };

    if (password) {
      if (password.length < 6) {
        return fail("Password ต้องมีอย่างน้อย 6 ตัวอักษร");
      }

      authPayload.password = password;
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      userId,
      authPayload
    );

    if (authError) return fail(authError.message);

    const profilePayload: Record<string, unknown> = {
      username,
      email,
      display_name,
      full_name,
      department,
      department_code,
      role,
      status,
      
    };

    if (password) {
      
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update(profilePayload)
      .eq("id", userId);

    if (profileError) return fail(profileError.message);

    return ok({
      message: "แก้ไขผู้ใช้งานสำเร็จ",
      user: {
        id: userId,
        username,
        email,
        display_name,
        full_name,
        department,
        department_code,
        role,
        status,
      },
    });
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "เกิดข้อผิดพลาด",
      500
    );
  }
});