import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getRun, start } from 'workflow/api';
import { jobAdmin } from '../../../../lib/social-job-db';
import { prepareManuscriptReview, reviewCostQuote, reviewSourceKey, type ReviewSnapshot, type SavedReview } from '../../../../lib/manuscript-review';
import { reviewManuscriptJob } from '../../../../workflows/manuscript-review';

export const runtime = 'nodejs';
export const maxDuration = 60;
const fields = 'id,story_id,status,source_key,report,dismissed_ids,diagnostic,error_message,created_at,updated_at';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
async function owner(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}
export async function POST(request: Request) {
  const user = await owner(request);
  if (!user) return json({ error: 'Sign in to NovelForge first.' }, 401);
  let insertedId: string | null = null;
  try {
    const body = await request.json();
    if (!uuid(body.storyId) || !['estimate','start'].includes(body.action) || typeof body.sourceKey !== 'string') return json({ error: 'Choose a saved manuscript to review.' }, 400);
    if (body.action === 'start' && !uuid(body.id)) return json({ error: 'A review request ID is required.' }, 400);
    const db = jobAdmin();
    if (body.action === 'start') {
      const { data: duplicate, error } = await db.from('manuscript_review_jobs').select(fields).eq('id', body.id).eq('user_id', user.id).eq('story_id', body.storyId).maybeSingle();
      if (error) throw new Error('Saved reviews could not be checked.');
      if (duplicate) return json({ job: duplicate }, 202);
    }
    const { data: saved, error } = await db.from('stories').select('id,title,form,chapters').eq('id', body.storyId).eq('user_id', user.id).maybeSingle();
    if (error) throw new Error('The saved manuscript could not be loaded.');
    if (!saved) return json({ error: 'This manuscript could not be found in your account.' }, 404);
    const snapshot: ReviewSnapshot = { title: saved.title, storyBible: saved.form ?? {}, chapters: saved.chapters ?? [] };
    const sourceKey = await reviewSourceKey(snapshot);
    if (sourceKey !== body.sourceKey) return json({ error: 'The saved manuscript differs from this screen. Wait for saving to finish or reopen the story, then prepare the review again.' }, 409);
    const input = prepareManuscriptReview(snapshot);
    const quote = reviewCostQuote(input, sourceKey);
    if (body.action === 'estimate') return json({ quote });
    if (typeof body.approvedBudgetUsd !== 'number' || body.approvedBudgetUsd !== quote.maximumUsd) return json({ error: 'Approve the current review cost before starting.' }, 400);
    const { data: active, error: activeError } = await db.from('manuscript_review_jobs').select(fields).eq('story_id', body.storyId).eq('user_id', user.id).eq('status', 'generating').maybeSingle();
    if (activeError) throw new Error('Review progress could not be checked.');
    if (active) return json({ job: active, existing: true }, 202);
    const { error: insertError } = await db.from('manuscript_review_jobs').insert({ id: body.id, story_id: body.storyId, user_id: user.id, source_key: sourceKey, input, approved_budget_usd: body.approvedBudgetUsd });
    if (insertError) return json({ error: insertError.code === '23505' ? 'A review is already starting. Refresh saved reviews to check progress.' : 'The review could not be saved. No model call was started.' }, 409);
    insertedId = body.id;
    const run = await start(reviewManuscriptJob, [body.id]);
    const { error: linkError } = await db.from('manuscript_review_jobs').update({ workflow_run_id: run.runId }).eq('id', body.id).eq('user_id', user.id);
    if (linkError) console.error('Review run could not be linked', body.id);
    const { data: job } = await db.from('manuscript_review_jobs').select(fields).eq('id', body.id).eq('user_id', user.id).single();
    return json({ job }, 202);
  } catch (error) {
    if (insertedId) await jobAdmin().from('manuscript_review_jobs').update({ status: 'failed', error_message: 'The review worker could not be confirmed. No automatic retry was started.', updated_at: new Date().toISOString() }).eq('id', insertedId).eq('user_id', user.id).eq('status','generating').eq('model_call_in_flight',false).is('workflow_run_id', null);
    return json({ error: error instanceof Error ? error.message : 'The review could not be started.' }, 503);
  }
}
export async function GET(request: Request) {
  const user = await owner(request);
  if (!user) return json({ error: 'Sign in to NovelForge first.' }, 401);
  const url = new URL(request.url), storyId = url.searchParams.get('storyId');
  if (!uuid(storyId)) return json({ error: 'Choose a valid manuscript.' }, 400);
  try {
    const db = jobAdmin();
    const { data: jobs, error } = await db.from('manuscript_review_jobs').select(`${fields},workflow_run_id,model_call_in_flight`).eq('story_id', storyId).eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
    if (error) throw new Error('Saved reviews could not be loaded.');
    for (const job of jobs ?? []) {
      if (job.status !== 'generating') continue;
      let stopped = !job.workflow_run_id && Date.now() - Date.parse(job.created_at) > 600000;
      if (job.workflow_run_id) {
        const state = await getRun(job.workflow_run_id).status;
        stopped = ['failed','cancelled'].includes(state);
      }
      if (stopped) {
        const patch = { status: 'failed', error_message: 'The background review stopped. A model charge may have occurred; it was not submitted again automatically.', updated_at: new Date().toISOString() };
        const { data: changed, error: patchError } = await db.from('manuscript_review_jobs').update(patch).eq('id',job.id).eq('user_id',user.id).eq('status','generating').select('id').maybeSingle();
        if (patchError) throw new Error('Stopped review progress could not be saved.');
        if (changed) Object.assign(job, patch);
      }
    }
    return json({ jobs: (jobs ?? []).map(({ workflow_run_id: _run, model_call_in_flight: _flight, ...job }) => job) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Saved reviews could not be loaded.' }, 503); }
}
export async function PATCH(request: Request) {
  const user = await owner(request);
  if (!user) return json({ error: 'Sign in to NovelForge first.' }, 401);
  try {
    const body = await request.json();
    if (!uuid(body.id) || typeof body.findingId !== 'string' || typeof body.dismissed !== 'boolean') return json({ error: 'Choose a review finding.' }, 400);
    const db = jobAdmin();
    const { data: job, error } = await db.from('manuscript_review_jobs').select(fields).eq('id',body.id).eq('user_id',user.id).eq('status','completed').maybeSingle();
    if (error) throw new Error('The saved review could not be loaded.');
    if (!job) return json({ error: 'This review could not be found in your account.' }, 404);
    if (!(job as SavedReview).report?.findings.some(f => f.id === body.findingId)) return json({ error: 'This finding does not belong to the review.' }, 400);
    const next = (job.dismissed_ids as string[]).filter(id => id !== body.findingId);
    if (body.dismissed) next.push(body.findingId);
    const { data: updated, error: updateError } = await db.from('manuscript_review_jobs').update({ dismissed_ids: next, updated_at: new Date().toISOString() }).eq('id',body.id).eq('user_id',user.id).eq('updated_at',job.updated_at).select(fields).maybeSingle();
    if (updateError) throw new Error('The finding decision could not be saved.');
    if (!updated) return json({ error: 'The review changed on another device. Refresh saved reviews and try again.' }, 409);
    return json({ job: updated });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'The finding decision could not be saved.' }, 503); }
}
