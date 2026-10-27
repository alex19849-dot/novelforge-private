/** Keep provider failures distinct from a successful response with no image. */
type OutputItem = {type:string;status?:string;result?:string|null;error?:{code?:string;message?:string};content?:{type:string;refusal?:string;text?:string}[]};
export type ImageResponse = {status?:string;error?:unknown;output:unknown[]};
export function completedImage(response:ImageResponse) {
  return (response.output as OutputItem[]).find(item=>item.type==='image_generation_call'&&typeof item.result==='string'&&item.result.length>0);
}
export function isImageModerationFailure(response:{output?:unknown[]}) {
  return (response.output as OutputItem[]|undefined)?.some(item=>item.type==='image_generation_call'&&item.error?.code==='moderation_blocked')??false;
}
export function imageDiagnostic(response:ImageResponse) {
  return {status:response.status,error:response.error,output:(response.output as OutputItem[]).map(item=>({type:item.type,status:item.status,error:item.error,hasImage:Boolean(item.result),content:item.type==='message'?item.content?.map(c=>({type:c.type,text:(c.refusal??c.text??'').slice(0,1000)})):undefined}))};
}
export function noImageMessage(response:ImageResponse) {
  if(isImageModerationFailure(response)) return 'The image service blocked this artwork. The original cover may need to be kept as a separate asset; repeated unchanged retries will not resolve it.';
  const reason=(response.output as OutputItem[]).find(item=>item.type==='image_generation_call'&&item.error)?.error?.message;
  return reason?`The image service could not create this artwork: ${reason.slice(0,300)}`:'The AI completed its response without an image. Review this item before trying again.';
}
