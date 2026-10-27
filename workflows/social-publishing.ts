import { sleep } from 'workflow';
import { start } from 'workflow/api';
import { registerPublisher, publishingTick, advancePublisher } from './social-publishing-steps';
export async function publishSocialCalendar(owner:string,lease:string,generation=0) {
  'use workflow';
  for(;;) {
    try {if(!await registerPublisher(owner,lease,generation)) return;break;}
    catch {await sleep('5m');}
  }
  // Bounded runs keep replay small. The next run continues without browser activity.
  for(let iteration=0;iteration<144;iteration++) {
    let next;
    try {next=await publishingTick(owner,lease,generation);}
    catch {await sleep('5m');continue;}
    if(next.stop) return;
    await sleep(`${next.delay}s`);
  }
  let next;
  for(;;) {
    try {next=await advancePublisher(owner,lease,generation);break;}
    catch {await sleep('5m');}
  }
  if(next!==null) await start(publishSocialCalendar,[owner,lease,next],{deploymentId:'latest'});
}
