import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' } });
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ error: 'Sign in again to load your saved stories.' }, 401);
  const id = new URL(request.url).searchParams.get('storyId');
  if (id && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return json({ error: 'Choose a valid saved story.' }, 400);
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return json({ error: 'Your sign-in could not be verified. Sign in again; your saved stories are unchanged.' }, 401);
    const account = { id: data.user.id, email: data.user.email ?? '' };
    if (id) {
      const { data: story, error: readError } = await client.from('stories').select('*').eq('user_id', data.user.id).eq('id', id).maybeSingle();
      if (readError) return json({ error: 'The saved story could not be read. Your local copy has not replaced it.' }, 503);
      if (!story) return json({ error: 'This story is not available in the signed-in account.' }, 404);
      return json({ account, story });
    }
    const { data: stories, error: readError } = await client.from('stories').select('id,title,created_at,updated_at').eq('user_id', data.user.id).order('updated_at', { ascending: false });
    if (readError) return json({ error: 'Your saved story list could not be loaded. Retry the connection; your stories have not been deleted.' }, 503);
    return json({ account, stories: stories ?? [] });
  } catch { return json({ error: 'The saved-story connection failed. Retry without clearing app storage.' }, 503); }
}
