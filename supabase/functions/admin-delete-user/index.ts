import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405);

    const PROJECT_URL = Deno.env.get("PROJECT_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ ok: false, message: "Missing environment variables" }, 500);
    }

    const admin = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ ok: false, message: "ไม่พบ Authorization token" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: callerData, error: callerError } = await admin.auth.getUser(token);

    if (callerError || !callerData?.user) {
      return jsonResponse({ ok: false, message: "ตรวจสอบผู้ใช้งานไม่สำเร็จ" }, 401);
    }

    const callerId = callerData.user.id;

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, status")
      .eq("id", callerId)
      .maybeSingle();

    if (
      String(callerProfile?.role || "").toLowerCase() !== "admin" ||
      String(callerProfile?.status || "").toLowerCase() !== "active"
    ) {
      return jsonResponse({ ok: false, message: "อนุญาตเฉพาะ Admin เท่านั้น" }, 403);
    }

    const body = await req.json();
    const userId = String(body.user_id || "").trim();

    if (!userId) {
      return jsonResponse({ ok: false, message: "ไม่พบ user_id" }, 400);
    }

    if (userId === callerId) {
      return jsonResponse({ ok: false, message: "ไม่สามารถลบ User ที่กำลัง Login อยู่ได้" }, 400);
    }

    await admin.from("user_departments").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      return jsonResponse({ ok: false, message: authDeleteError.message }, 400);
    }

    return jsonResponse({ ok: true, message: "ลบ User สำเร็จ" });
  } catch (err) {
    return jsonResponse(
      { ok: false, message: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" },
      500
    );
  }
});