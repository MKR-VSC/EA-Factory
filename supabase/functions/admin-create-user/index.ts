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

    const { admin } = await requireAdmin(req);
    const body = await req.json();

    const username = String(body.username || "").trim().toUpperCase();
    const password = String(body.password || "").trim();
    const role = String(body.role || "staff").trim().toLowerCase();

    const department = String(body.department || "").trim().toUpperCase();
    const department_code = String(body.department_code || department)
      .trim()
      .toUpperCase();

    const display_name = String(body.display_name || username).trim();
    const full_name = String(body.full_name || display_name || username).trim();
    const status = String(body.status || "active").trim().toLowerCase();

    const email = String(body.email || `${username.toLowerCase()}@pvt.local`)
      .trim()
      .toLowerCase();

    if (!username) return fail("กรุณาระบุ Username", 400);
    if (!password) return fail("กรุณาระบุ Password", 400);
    if (password.length < 6) {
      return fail("Password ต้องมีอย่างน้อย 6 ตัวอักษร", 400);
    }

    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("id, username, email")
      .eq("username", username)
      .maybeSingle();

    if (existingProfileError) {
      return fail(existingProfileError.message, 400);
    }

    if (existingProfile) {
      return fail(`Username ${username} มีอยู่แล้ว`, 409);
    }

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          display_name,
          full_name,
          role,
          department,
          department_code,
        },
      });

    if (authError || !authData?.user) {
      return fail(authError?.message || "สร้าง Auth User ไม่สำเร็จ", 400);
    }

    const userId = authData.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      email,
      username,
      
      role,
      department,
      department_code,
      display_name,
      full_name,
      status,
      created_at: new Date().toISOString(),
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return fail(profileError.message, 400);
    }

    return ok({
      message: "สร้างผู้ใช้สำเร็จ",
      user: {
        id: userId,
        email,
        username,
        role,
        department,
        department_code,
        display_name,
        full_name,
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