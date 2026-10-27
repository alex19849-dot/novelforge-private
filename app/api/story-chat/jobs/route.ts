import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { start, getRun } from 'workflow/api';
import { jobAdmin } from '../../../../lib/social-job-db';
import { chapterSourceFingerprint, type ChapterJobInput } from '../../../../lib/chapter-job';
import { generateChapterJob } from '../../../../workflows/chapter-generation';
import type { StoryWorkspace } from '../../../story-chat/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function userFor(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export async function POST(request: Request) {
  const user = await userFor(request);
  if (!user) return json({ error: 'Sign in to NovelForge first.' }, 401);
  let ownedJob: string | undefined;
  try {
    const body = await request.json();
    const input = body.input as ChapterJobInput;
    if (!uuid(body.id) || !input || !uuid(input.story?.id) || !['generate', 'write', 'complete'].includes(input.operation) || !Array.isArray(input.story.messages) || !Array.isArray(input.story.chapters) || !input.story.storyBible || !input.story.storyState || typeof body.sourceFingerprint !== 'string') return json({ error: 'The chapter background request is incomplete.' }, 400);
    if (input.operation !== 'generate' && (!input.pending || input.pending.storyId !== input.story.id || typeof input.pending.chapterBrief !== 'string' || typeof input.pending.draft !== 'string')) return json({ error: 'A valid saved chapter draft is required.' }, 400);
    if (input.action && !['start', 'continue', 'rewrite'].includes(input.action)) return json({ error: 'Invalid chapter action.' }, 400);
    const db = jobAdmin();
    const { data: duplicate, error: duplicateError } = await db.from('story_generation_jobs').select('id,status').eq('id', body.id).eq('user_id', user.id).maybeSingle();
    if (duplicateError) throw new Error('Background jobs could not be checked.');
    if (duplicate) return json({ job: duplicate }, 202);
    const { data: active, error: activeError } = await db.from('story_generation_jobs').select('id,status').eq('story_id', input.story.id).eq('user_id', user.id).eq('status', 'generating').maybeSingle();
    if (activeError) throw new Error('Chapter progress could not be checked.');
    if (active) return json({ job: active, existing: true }, 202);
    const { data: saved, error } = await db.from('stories').select('*').eq('id', input.story.id).eq('user_id', user.id).single();
    if (error || !saved) return json({ error: 'This story could not be found in your account. Save it before generating.' }, 404);
    const remote = { storyBible: saved.form, chapters: saved.chapters ?? [], storyState: saved.story_state ?? {} } as StoryWorkspace;
    if (chapterSourceFingerprint(remote) !== body.sourceFingerprint) return json({ error: 'This story changed on another device. Reopen it before generating so newer edits are preserved.' }, 409);
    const { error: insertError } = await db.from('story_generation_jobs').insert({ id: body.id, story_id: input.story.id, user_id: user.id, input, source_updated_at: saved.updated_at, status: 'generating' });
    if (insertError) return json({ error: insertError.code === '23505' ? 'This story already has a chapter job starting. Reopen it to see progress.' : 'The chapter job could not be saved.' }, 409);
    ownedJob = body.id;
    const run = await start(generateChapterJob, [body.id]);
    const { error: linkError } = await db.from('story_generation_jobs').update({ workflow_run_id: run.runId }).eq('id', body.id).eq('user_id', user.id);
    if (linkError) console.error('Chapter workflow ID could not be linked', body.id);
    return json({ job: { id: body.id, status: 'generating' } }, 202);
  } catch (error) {
    if (ownedJob) await jobAdmin().from('story_generation_jobs').update({ status: 'failed', error_message: 'The chapter worker could not be started. No automatic retry was started.' }).eq('id', ownedJob).eq('user_id', user.id).is('workflow_run_id', null);
    return json({ error: error instanceof Error ? error.message : 'Background generation could not be started.' }, 503);
  }
}

export async function GET(request: Request) {
  const user = await userFor(request);
  if (!user) return json({ error: 'Sign in to NovelForge first.' }, 401);
  const url = new URL(request.url);
  const storyId = url.searchParams.get('storyId');
  if (!uuid(storyId)) return json({ error: 'Choose a valid story.' }, 400);
  try {
    const db = jobAdmin();
    let query = db.from('story_generation_jobs').select('id,status,stage,error_message,result,checkpoint,workflow_run_id,created_at,updated_at').eq('story_id', storyId).eq('user_id', user.id);
    const id = url.searchParams.get('id');
    if (id) {
      if (!uuid(id)) return json({ error: 'Invalid chapter job.' }, 400);
      query = query.eq('id', id);
    }
    const { data: job, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error('Chapter progress could not be loaded.');
    if (job?.status === 'generating' && job.workflow_run_id) {
      const status = await getRun(job.workflow_run_id).status;
      if (['failed', 'cancelled'].includes(status)) {
        job.status = 'failed';
        job.error_message = 'The background worker stopped. Saved progress is kept. No model call was automatically repeated.';
        job.result ??= job.checkpoint?.story ? { story: job.checkpoint.story, pending: job.checkpoint.pending ?? null } : null;
        await db.from('story_generation_jobs').update({ status: job.status, error_message: job.error_message, result: job.result }).eq('id', job.id).eq('user_id', user.id).eq('status', 'generating');
      }
    }
    if (job?.status === 'generating' && !job.workflow_run_id && Date.now() - Date.parse(job.created_at) > 120000) {
      job.status = 'failed'; job.error_message = 'The background chapter could not be started. Your original draft is kept.';
      await db.from('story_generation_jobs').update({ status: job.status, error_message: job.error_message }).eq('id', job.id).eq('user_id', user.id).eq('status', 'generating').is('workflow_run_id', null);
    }
    const { checkpoint: _checkpoint, workflow_run_id: _run, ...summary } = job ?? {};
    return json({ job: job ? summary : null });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Chapter progress could not be loaded.' }, 503); }
}
