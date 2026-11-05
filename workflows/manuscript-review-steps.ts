import { jobAdmin } from '../lib/social-job-db';
import { requestManuscriptReview } from '../lib/manuscript-review-provider';
import type { ReviewInput } from '../lib/manuscript-review';

export async function runManuscriptReview(id: string) {
  'use step';
  console.log('Reviewing saved manuscript', id);
  const db = jobAdmin();
  const { data: job, error } = await db.from('manuscript_review_jobs').select('id,status,input,approved_budget_usd,model_call_in_flight').eq('id',id).single();
  if (error || !job) throw new Error('The saved review input could not be loaded.');
  if (job.status !== 'generating') return;
  const { data: claimed, error: claimError } = await db.from('manuscript_review_jobs').update({ model_call_in_flight: true, updated_at: new Date().toISOString() }).eq('id',id).eq('status','generating').eq('model_call_in_flight',false).select('id').maybeSingle();
  if (claimError || !claimed) throw new Error('The earlier model call could not be confirmed after an interruption. It was not submitted again.');
  const outcome = await requestManuscriptReview(job.input as ReviewInput, Number(job.approved_budget_usd));
  const patch = 'error' in outcome ? { status: 'failed', diagnostic: outcome.diagnostic, error_message: outcome.error } : { status: 'completed', report: outcome.report, diagnostic: outcome.diagnostic, error_message: '' };
  const { data: saved, error: saveError } = await db.from('manuscript_review_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id',id).eq('status','generating').select('id').maybeSingle();
  if (saveError || !saved) throw new Error('The model call finished but the report could not be saved. It was not repeated automatically.');
  console.log('Manuscript review finished', id, patch.status);
}
runManuscriptReview.maxRetries = 0;
export async function failManuscriptReview(id: string, message: string) {
  'use step';
  console.error('Manuscript review stopped', id);
  const { error } = await jobAdmin().from('manuscript_review_jobs').update({ status: 'failed', error_message: `${message} Your manuscript is unchanged. No automatic retry was started.`, updated_at: new Date().toISOString() }).eq('id',id).eq('status','generating');
  if (error) throw new Error('The stopped review could not be recorded.');
}
