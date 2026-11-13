import {createHmac,timingSafeEqual} from 'node:crypto';
export function validMaintenanceSignature(at:string|null,signature:string|null,secret:string|undefined,now=Date.now()){
 if(!secret||!at||!/^\d{10}$/.test(at)||!signature||! /^[a-f0-9]{64}$/.test(signature))return false;
 if(Math.abs(now/1000-Number(at))>300)return false;
 const expected=createHmac('sha256',secret).update(`${at}:social-maintenance-v1`).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
