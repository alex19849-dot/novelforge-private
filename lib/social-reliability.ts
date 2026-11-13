export const PUBLISHER_VERSION='2026-11-13-reliability-v1';
export const STALE_PUBLISHER_MS=8*60_000;
export const CATCH_UP_MS=6*3600_000;
export function publisherNeedsRecovery(settings:{enabled:boolean;worker_version?:string;heartbeat_at?:string|null;updated_at?:string},now=Date.now()){
 if(!settings.enabled)return false;
 if(settings.worker_version!==PUBLISHER_VERSION)return true;
 const checked=Date.parse(settings.heartbeat_at??settings.updated_at??'');
 return !Number.isFinite(checked)||now-checked>STALE_PUBLISHER_MS;
}
export function publicationTooLate(scheduled:string,cutover:string|null|undefined,now=Date.now()){
 const scheduledAt=Date.parse(scheduled),from=Date.parse(cutover??'');
 const grace=Number.isFinite(from)&&scheduledAt>=from?CATCH_UP_MS:30*60_000;
 return !Number.isFinite(scheduledAt)||scheduledAt<now-grace;
}
export function reconciliationExpired(submitted:string,polls:number,now=Date.now()){
 return polls>=120||now-Date.parse(submitted)>24*3600_000;
}
