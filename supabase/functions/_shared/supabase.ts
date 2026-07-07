import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getAdminClient() {
  const url = Deno.env.get("PROJECT_URL");
  const key = Deno.env.get("SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
  }

  return createClient(url, key);
}