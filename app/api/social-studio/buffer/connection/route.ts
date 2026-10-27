import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { BufferConnectionError, checkBufferConnection } from "../../../../../lib/buffer";

export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to NovelForge before checking Buffer." }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return json({ error: "NovelForge authentication is not configured on this deployment." }, 503);
  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return json({ error: "Your NovelForge session has expired. Sign in again." }, 401);
    if(data.user.id!==process.env.SOCIAL_STUDIO_OWNER_ID) return json({error:'Use the Social Studio owner account to check this Buffer connection.'},403);
    return json(await checkBufferConnection());
  } catch (error) {
    if (error instanceof BufferConnectionError) return json({ error: error.message }, error.status);
    return json({ error: "The connection check could not be completed. Try again shortly." }, 502);
  }
}
