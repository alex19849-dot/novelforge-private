import {sleep} from 'workflow';
import {registerRepair,submitBackground,pollBackground,saveBackground,recordRepairFailure,finishRepair} from './romance-background-steps';

export async function generateRomanceBackgrounds(runId:string){
  'use workflow';
  const tasks=await registerRepair(runId);
  console.log('Starting queued romance artwork',{count:tasks.length});
  for(let offset=0;offset<tasks.length;offset+=3){
    await Promise.all(tasks.slice(offset,offset+3).map(async taskId=>{
      try{
        const response=await submitBackground(runId,taskId);
        if(!response)return;
        let ready=false;
        for(let attempt=0;attempt<120;attempt++){
          const status=await pollBackground(runId,taskId,response);
          if(status==='completed'){ready=true;break;}
          if(!['queued','in_progress'].includes(status))throw Error('The provider did not complete this background.');
          await sleep('15s');
        }
        if(!ready)throw Error('The background has not completed within 30 minutes.');
        await saveBackground(runId,taskId,response);
      }catch(error){await recordRepairFailure(runId,taskId,error instanceof Error?error.message:'Background needs attention.');}
    }));
  }
  await finishRepair(runId);
}
