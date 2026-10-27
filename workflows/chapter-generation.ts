import { advanceChapterJob, finishChapterJob, failChapterJob } from './chapter-generation-steps';

export async function generateChapterJob(jobId: string) {
  'use workflow';
  console.log('Chapter background job started', jobId);
  try {
    // Each model call is a separately checkpointed step. No browser request
    // must stay alive for the next stage to start.
    for (let stage = 0; stage < 100; stage++) {
      if (await advanceChapterJob(jobId)) {
        await finishChapterJob(jobId);
        return;
      }
    }
    throw new Error('The chapter exceeded its background stage limit. Saved progress is kept.');
  } catch (error) {
    await failChapterJob(jobId, error instanceof Error ? error.message : 'The background worker stopped.');
  }
}
