import sharp from 'sharp';
export const SHOT_FRAMING=['wide','medium','close','detail'] as const;
export const SHOT_ACTION=['standing_or_smiling','approach','touch','nearly_kissing','kissing','embracing','detail'] as const;
export type SceneVisualReview={identityConsistent:boolean;anatomyNatural:boolean;romanticCharge:number;shot1:{framing:string;action:string};shot2:{framing:string;action:string};reason:string};
export function sceneVisualIssues(v:SceneVisualReview,nearDuplicate=false) {
  const issues:string[]=[];
  if(!v?.identityConsistent)issues.push('The characters do not keep their distinct identities');
  if(!v?.anatomyNatural)issues.push('The people or hands do not look natural');
  if(!(v?.romanticCharge>=8&&v.romanticCharge<=10))issues.push('The visible romantic connection is too weak');
  if(!v?.shot1||!v.shot2||v.shot1.framing===v.shot2.framing||!['close','detail'].includes(v.shot2.framing))issues.push('The second image needs a genuinely closer, different composition');
  if(!v?.shot1||!v.shot2||v.shot1.action===v.shot2.action||v.shot2.action==='standing_or_smiling')issues.push('The second image does not develop the romantic action');
  if(nearDuplicate)issues.push('The photographs repeat the same composition');
  return issues;
}
/** A structural duplicate guard independent of the model's prose verdict. */
export async function scenePhotosRepeat(a:Buffer,b:Buffer) {
  const fingerprint=async(bytes:Buffer)=>{
    const stats=await sharp(bytes).stats();
    if(stats.channels.every(c=>c.stdev<8))return null; // Featureless test/corrupt images belong to the visual reviewer.
    const pixels=await sharp(bytes).resize(9,8,{fit:'fill'}).greyscale().raw().toBuffer();
    return Array.from({length:64},(_,i)=>pixels[Math.floor(i/8)*9+i%8]>pixels[Math.floor(i/8)*9+i%8+1]);
  };
  const [x,y]=await Promise.all([fingerprint(a),fingerprint(b)]);
  return !!x&&!!y&&x.filter((v,i)=>v!==y[i]).length<=10;
}
/** Remove the full scene layout from the reference; retain faces and upper wardrobe. */
export async function sceneIdentityReference(source:Buffer) {
  const meta=await sharp(source).metadata();
  return sharp(source).extract({left:0,top:0,width:meta.width!,height:Math.round(meta.height!*.64)})
    .resize(1024,960,{fit:'contain',background:'#2a2429'}).jpeg({quality:94}).toBuffer();
}
