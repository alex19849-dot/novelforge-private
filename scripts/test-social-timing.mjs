import assert from 'node:assert/strict';
import {testingPostingHours,TESTING_HOURS} from '../lib/social-posting-times.ts';
import {addDays,londonSchedule,londonDate,londonTime} from '../lib/social-calendar.ts';
for(const platform of Object.keys(TESTING_HOURS)){
 const counts=new Map(),weekday=new Map();let winner=0;
 for(let day=0;day<30;day++){
  const date=addDays('2026-10-31',day),hour=testingPostingHours(date,platform)[0];counts.set(hour,(counts.get(hour)??0)+1);
  const wd=new Date(date+'T12:00:00Z').getUTCDay();weekday.set(wd,new Set([...(weekday.get(wd)??[]),hour]));
  const value=londonSchedule(date,String(hour).padStart(2,'0')+':00');assert.equal(londonDate(value),date);assert.equal(Number(londonTime(value).slice(0,2)),hour);
  if(testingPostingHours(date,platform,[18])[0]===18)winner++;
 }
 assert.equal(counts.size,3);assert.ok([...counts.values()].every(n=>n>=8&&n<=12));assert.ok([...weekday.values()].every(hours=>hours.size===3));assert.ok(winner>=20&&winner<30);
}
for(const date of ['2027-03-28','2027-10-31'])for(const platform of Object.keys(TESTING_HOURS)){const hour=testingPostingHours(date,platform)[0];assert.equal(Number(londonTime(londonSchedule(date,String(hour).padStart(2,'0')+':00')).slice(0,2)),hour);}
console.log('PASS: balanced 30-day time trials, each weekday tests all slots, qualified winners retain exploration, UK times and clock changes.');
