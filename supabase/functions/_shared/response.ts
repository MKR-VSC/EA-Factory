import { corsHeaders } from "./cors.ts";

export function ok(data: unknown = {}) {
  return new Response(
    JSON.stringify({
      ok: true,
      ...data,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

export function fail(message: string, status = 400) {
  return new Response(
    JSON.stringify({
      ok: false,
      message,
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}