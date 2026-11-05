import { runManuscriptReview, failManuscriptReview } from './manuscript-review-steps';
export async function reviewManuscriptJob(jobId: string) {
  'use workflow';
  console.log('Manuscript review started', jobId);
  try { await runManuscriptReview(jobId); }
  catch (error) { await failManuscriptReview(jobId, error instanceof Error ? error.message : 'The review worker stopped.'); }
}
