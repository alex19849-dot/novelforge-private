import { sleep } from 'workflow';
import {queueAnalyticsRefresh} from './social-analytics-steps';
import { start } from 'workflow/api';
import { registerPublisher, publishingTick, advancePublisher, reportPublisherHandoffFailure } from './social-publishing-steps';
export async function publishSocialCalendar(owner:string,lease:string,generation=0) {
  'use workflow';
  for(;;) {
    try {if(!await registerPublisher(owner,lease,generation)) return;break;}
    catch {await sleep('5m');}
  }
  // Bounded runs keep replay small. The next run continues without browser activity.
  // Exercise continuation immediately on enable, rather than discovering a
  // deployment/permission problem after the first twelve hours.
  for(let iteration=0;iteration<(generation===0?1:144);iteration++) {
    let next;
    try {next=await publishingTick(owner,lease,generation);}
    catch {await sleep('5m');continue;}
    if(next.stop) return;
    try{if(iteration%12===0)await queueAnalyticsRefresh(owner);}catch{/* Analytics cannot stop publishing. */}
    await sleep(`${generation===0?Math.min(next.delay,5):next.delay}s`);
  }
  let next;
  for(;;) {
    try {next=await advancePublisher(owner,lease,generation);break;}
    catch {await sleep('5m');}
  }
  if(next===null) return;
  for(;;) {
    try {
      // Default start pins the child to this deployment. "latest" can cross
      // preview/production boundaries and lose permission to read its run key.
      // Duplicate starts after an ambiguous error are fenced at registration.
      await start(publishSocialCalendar,[owner,lease,next]);
      return;
    }catch {
      try {await reportPublisherHandoffFailure(owner,lease,next);}catch {}
      await sleep('5m');
    }
  }
}
