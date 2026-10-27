// Run only as an authorized maintenance command in the linked Vercel project.
import {createClient} from '@supabase/supabase-js';
import {start} from 'workflow/api';
const runId=process.env.SOCIAL_RECOVERY_RUN_ID;
const deploymentId=process.env.SOCIAL_RECOVERY_DEPLOYMENT_ID;
if(!runId||!deploymentId) throw new Error('Select the recovery job and its deployed workflow first.');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:job,error}=await db.from('social_generation_runs').select('*').eq('id',runId).eq('job_type','media').single();
if(error||!job) throw new Error('Recovery job not found.');
if(job.status!=='generating'||job.workflow_run_id) {
  console.log('Recovery was already started or finished. No new request submitted.');
} else {
  const {count,error:taskError}=await db.from('social_generation_tasks').select('id',{count:'exact',head:true}).eq('run_id',runId).eq('user_id',job.user_id);
  if(taskError||count<1||count>2) throw new Error('Recovery is limited to the two missing artwork items.');
  const run=await start({workflowId:'workflow//./workflows/social-generation//generateSocialJob'},[runId],{deploymentId});
  const {error:saveError}=await db.from('social_generation_runs').update({workflow_run_id:run.runId}).eq('id',runId).eq('user_id',job.user_id);
  if(saveError) throw new Error('Workflow started, but its reference needs checking before retrying.');
  console.log('Started the two-item artwork recovery. Existing saved artwork is kept.');
}
