import { sleep } from 'workflow';
import { describeJob, prepareTask, submitTask, rememberResponse, pollResponse, persistTask, finishJob, failTask, renderMusicTask } from './social-generation-steps';

export async function generateSocialJob(runId:string) {
  'use workflow';
  const tasks=await describeJob(runId);
  for(const taskId of tasks) {
    const next=await prepareTask(runId,taskId);
    if(next==='stop') { await finishJob(runId,true); return; }
    if(next==='skip') continue;
    try {
      if(next==='music') { await renderMusicTask(runId,taskId); continue; }
      // Each submitted response is checkpointed before another step saves its ID.
      // Provider generation keeps running while this workflow sleeps.
      const responseId=await submitTask(runId,taskId);
      if(responseId) {
        await rememberResponse(runId,taskId,responseId);
        let complete=false;
        for(let poll=0;poll<120;poll++) {
          const status=await pollResponse(runId,taskId,responseId);
          if(status==='completed') { complete=true; break; }
          if(status!=='queued'&&status!=='in_progress') throw new Error('The AI could not finish this item. Saved items are kept; retry missing items.');
          await sleep('15s');
        }
        if(!complete) throw new Error('The AI took over 30 minutes for this item. Saved items are kept.');
        await persistTask(runId,taskId,responseId);
      }
    } catch(error) {
      await failTask(runId,taskId,error instanceof Error?error.message:'This item could not be generated.');
    }
  }
  await finishJob(runId,false);
}
