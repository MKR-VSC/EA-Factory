import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("PROJECT_URL");
    const SERVICE_ROLE_KEY =Deno.env.get("SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse(
        { ok: false, message: "Missing Supabase environment variables" },
        500
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ตรวจว่าคนที่เรียก Function login อยู่จริงไหม
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(
        { ok: false, message: "ไม่พบ Authorization token" },
        401
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const { data: callerData, error: callerError } =
      await admin.auth.getUser(token);

    if (callerError || !callerData?.user) {
      return jsonResponse(
        { ok: false, message: "ไม่สามารถตรวจสอบผู้ใช้งานได้" },
        401
      );
    }

    // ตรวจว่าคนเรียกเป็น admin หรือไม่
    const callerId = callerData.user.id;

    const { data: callerProfile, error: callerProfileError } = await admin
      .from("profiles")
      .select("id, username, role, status")
      .eq("id", callerId)
      .maybeSingle();

    if (callerProfileError) {
      return jsonResponse(
        { ok: false, message: callerProfileError.message },
        400
      );
    }

    if (!callerProfile) {
      return jsonResponse(
        { ok: false, message: "ไม่พบข้อมูลผู้ใช้งานใน profiles" },
        403
      );
    }

    const callerRole = String(callerProfile.role || "").toLowerCase();
    const callerStatus = String(callerProfile.status || "").toLowerCase();

    if (callerStatus !== "active") {
      return jsonResponse(
        { ok: false, message: "บัญชีผู้ใช้งานถูกปิดใช้งาน" },
        403
      );
    }

    if (callerRole !== "admin") {
      return jsonResponse(
        { ok: false, message: "อนุญาตเฉพาะผู้ดูแลระบบเท่านั้น" },
        403
      );
    }

    const body = await req.json();

    const username = String(body.username || "").trim().toUpperCase();
    const password = String(body.password || "").trim();
    const role = String(body.role || "staff").trim().toLowerCase();

    const department = String(body.department || "").trim();
    const department_code = String(body.department_code || "")
      .trim()
      .toUpperCase();

    const display_name = String(body.display_name || "").trim();
    const full_name = String(body.full_name || display_name || username).trim();
    const status = String(body.status || "active").trim().toLowerCase();

    const email = String(body.email || `${username.toLowerCase()}@pvt.local`)
      .trim()
      .toLowerCase();

    if (!username) {
      return jsonResponse({ ok: false, message: "กรุณาระบุ Username" }, 400);
    }

    if (!password) {
      return jsonResponse({ ok: false, message: "กรุณาระบุ Password" }, 400);
    }

    if (password.length < 4) {
      return jsonResponse(
        { ok: false, message: "Password ต้องมีอย่างน้อย 4 ตัวอักษร" },
        400
      );
    }

    if (!role) {
      return jsonResponse({ ok: false, message: "กรุณาระบุ Role" }, 400);
    }

    // กัน username ซ้ำใน profiles
    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("id, username, email")
      .eq("username", username)
      .maybeSingle();

    if (existingProfileError) {
      return jsonResponse(
        { ok: false, message: existingProfileError.message },
        400
      );
    }

    if (existingProfile) {
      return jsonResponse(
        { ok: false, message: `Username ${username} มีอยู่แล้ว` },
        409
      );
    }

    // สร้าง user ใน Authentication
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
      return jsonResponse(
        {
          ok: false,
          message: authError?.message || "สร้าง Auth User ไม่สำเร็จ",
        },
        400
      );
    }

    const userId = authData.user.id;

    // สร้าง profiles โดยใช้ id เดียวกับ Authentication UID
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      email,
      username,
      password,
      role,
      department,
      department_code,
      display_name,
      full_name,
      status,
      created_at: new Date().toISOString(),
    });

    // ถ้า profiles สร้างไม่สำเร็จ ให้ลบ Auth User ทิ้ง ป้องกันข้อมูลค้าง
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);

      return jsonResponse({ ok: false, message: profileError.message }, 400);
    }

    return jsonResponse({
      ok: true,
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
    return jsonResponse(
      {
        ok: false,
        message: err instanceof Error ? err.message : "เกิดข้อผิดพลาด",
      },
      500
    );
  }
});