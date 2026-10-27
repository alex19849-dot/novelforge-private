import { jobAdmin, jobJson, jobUser } from '../../../../lib/social-job-server';
export const runtime='nodejs';
export async function POST(request:Request) {
  const user=await jobUser(request);
  if(!user) return jobJson({error:'Sign in first.'},401);
  try {
    const {runId}=await request.json();
    const {data,error}=await jobAdmin().from('social_generation_runs').update({cancel_requested:true}).eq('id',runId).eq('user_id',user.id).eq('status','generating').select('id').maybeSingle();
    if(error||!data) return jobJson({error:'This job is no longer running.'},409);
    return jobJson({ok:true});
  }catch { return jobJson({error:'The job could not be paused.'},503); }
}

export async function GET(request:Request) {
  const user=await jobUser(request);
  if(!user) return jobJson({error:'Sign in first.'},401);
  try {
    const db=jobAdmin();
    const {data:job,error}=await db.from('social_generation_runs').select('id,start_date,job_type,status,completed_tasks,total_tasks,created_count,error_message,cancel_requested,workflow_run_id,created_at,config').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error) throw new Error('Background progress could not be loaded.');
    if(job?.status==='generating'&&job.workflow_run_id) {
      const {getRun}=await import('workflow/api');
      const status=await getRun(job.workflow_run_id).status;
      if(['failed','cancelled'].includes(status)) {
        job.status='failed'; job.error_message='The background worker stopped. Saved items are kept. Start again to generate missing items.';
        const {error:updateError}=await db.from('social_generation_runs').update({status:job.status,error_message:job.error_message}).eq('id',job.id).eq('user_id',user.id).eq('status','generating');
        if(updateError) throw new Error('The worker status could not be updated.');
      }
    }
    if(job?.status==='generating'&&!job.workflow_run_id&&Date.now()-Date.parse(job.created_at)>120000) {
      job.status='failed';job.error_message='The background job could not be started. Please try again.';
      await db.from('social_generation_runs').update({status:job.status,error_message:job.error_message}).eq('id',job.id).eq('user_id',user.id).eq('status','generating').is('workflow_run_id',null);
    }
    const {config,...summary}=job??{};
    return jobJson({job:job?{...summary,operation:config?.operation}:null});
  }catch(error){ return jobJson({error:error instanceof Error?error.message:'Progress could not be loaded.'},503); }
}
