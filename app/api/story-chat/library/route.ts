import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' } });
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json({ error: 'Sign in again to load your saved stories.' }, 401);
  const id = new URL(request.url).searchParams.get('storyId');
  if (id && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return json({ error: 'Choose a valid saved story.' }, 400);
  const trace = crypto.randomUUID();
  const started = Date.now();
  let stage: 'sign-in' | 'story-read' = 'sign-in';
  const log = (event: string) => console.info('Saved-story connection', { trace, stage, event, elapsedMs: Date.now() - started, singleStory: Boolean(id) });
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !key) throw new Error('Missing saved-story connection configuration.');
    const headers = { apikey: key, Authorization: `Bearer ${token}`, Accept: 'application/json' };
    log('started');
    // Explicit verified-user requests avoid a second SDK session lookup before
    // each read. The public key and user JWT retain the existing RLS boundary.
    const auth = await fetch(new URL('/auth/v1/user', base), { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const user = await auth.json() as { id?: string; email?: string };
    if (!auth.ok || !user.id) { log('sign-in-rejected'); return json({ error: 'Your sign-in could not be verified. Sign in again; your saved stories are unchanged.' }, 401); }
    stage = 'story-read'; log('started');
    const url = new URL('/rest/v1/stories', base);
    url.searchParams.set('select', id ? '*' : 'id,title,created_at,updated_at');
    url.searchParams.set('user_id', `eq.${user.id}`);
    if (id) { url.searchParams.set('id', `eq.${id}`); url.searchParams.set('limit', '1'); }
    else url.searchParams.set('order', 'updated_at.desc');
    const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) { log('read-rejected'); return json({ error: `Saved stories could not be read (connection status ${response.status}). Your local copy has not replaced them.` }, 503); }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Incomplete saved-story response.');
    const account = { id: user.id, email: user.email ?? '' };
    log('completed');
    if (id) return rows[0] ? json({ account, story: rows[0] }) : json({ error: 'This story is not available in the signed-in account.' }, 404);
    return json({ account, stories: rows });
  } catch (error) {
    log('failed');
    const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return json({ error: timedOut ? `${stage === 'sign-in' ? 'The sign-in service' : 'The saved-story read'} did not respond in time. Your saved stories and local copy are kept.` : `The ${stage} connection failed. Your saved stories and local copy are kept.` }, 503);
  }
}
