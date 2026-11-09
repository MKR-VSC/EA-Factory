import { HttpError } from "./auth.ts";

/** role ที่ระบบรองรับ (ตรงกับ core/roleConfig.js) */
export const VALID_ROLES = ["admin", "management", "accounting", "supervisor", "staff"];
export const VALID_STATUSES = ["active", "inactive"];

export function normalizeRole(value: unknown): string {
  const role = String(value || "staff").trim().toLowerCase();
  if (!VALID_ROLES.includes(role)) {
    throw new HttpError(`Role ไม่ถูกต้อง: ${role}`, 400);
  }
  return role;
}

export function normalizeStatus(value: unknown): string {
  const status = String(value || "active").trim().toLowerCase();
  if (!VALID_STATUSES.includes(status)) {
    throw new HttpError(`Status ไม่ถูกต้อง: ${status}`, 400);
  }
  return status;
}

/**
 * รหัสแผนก — ค่าว่างต้องเป็น null
 * (profiles.department_code มี foreign key ไป master_departments
 *  ถ้าส่ง "" ไป จะบันทึกไม่ได้ เช่น ผู้ใช้ admin / บัญชี ที่ไม่มีแผนก)
 */
export function normalizeDept(value: unknown): string | null {
  const code = String(value || "").trim().toUpperCase();
  return code || null;
}

/** อ่าน JSON body — ถ้า body ผิดรูปแบบตอบ 400 แทน 500 */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    throw new HttpError("ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง", 400);
  }
}
