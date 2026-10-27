import sharp from 'sharp';
/** Reserve a central cover region on the AI's 2:3 artwork canvas. */
export function originalCoverLayout(portrait:boolean) {
  const width=1080,height=portrait?1920:1350;
  const coverWidth=portrait?648:464,coverHeight=Math.round(coverWidth*1.5);
  const left=Math.round((width-coverWidth)/2),top=Math.round(height*(portrait?0.5:0.52)-coverHeight/2);
  const scale=Math.max(width/1024,height/1536);
  const cropX=(1024*scale-width)/2,cropY=(1536*scale-height)/2;
  return {left:Math.round((left+cropX)/scale),top:Math.round((top+cropY)/scale),width:Math.round(coverWidth/scale),height:Math.round(coverHeight/scale)};
}
export function originalCoverBackgroundPrompt(brief:string,portrait:boolean,bookTitle:string) {
  const box=originalCoverLayout(portrait);
  return [
    'Create finished background artwork and promotional typography for an adult romance book advertisement. Objects, ice, lighting and typography only. No people, bodies, faces, or intimate imagery.',
    `The book is ${bookTitle}. The final format is ${portrait?'9:16 vertical TikTok':'4:5 Facebook/Instagram feed'}, with your full 1024x1536 canvas fitted inside it without cropping. Keep every word at least 80 pixels away from the edges of that canvas.`,
    `IMPORTANT: The application inserts the genuine book-cover file separately after generation. Do not draw, copy, fetch, recreate or alter any cover. Do not render a blank cover, device, mockup or placeholder box. Leave the central rectangle x=${box.left}, y=${box.top}, width=${box.width}, height=${box.height} on your 1024x1536 canvas free of text and foreground objects. Continue the background naturally behind that region.`,
    'Place the requested main hook above that region and the supporting text / availability line below it. Keep all text legible and away from crop edges. Treat all cover-compositing instructions in the brief as instructions for the application, not for image generation.',
    'Preserve the specific colour, atmosphere, objects and exact promotional wording from this creative brief. Do not invent reviews, prices or release claims. No em or en dashes.',
    brief.replace(/https?:\/\/\S+/g,'[original cover inserted separately]'),
  ].join('\n\n');
}
/** Original uploaded artwork is resized to fit intact, never redrawn or cropped. */
export async function compositeOriginalCover(background:Buffer,cover:Buffer,portrait:boolean) {
  const layout=originalCoverLayout(portrait);
  const image=await sharp(cover,{limitInputPixels:20_000_000}).resize(layout.width,layout.height,{fit:'contain',background:'#07090d'}).png().toBuffer();
  return sharp(background).resize(1024,1536,{fit:'cover'}).composite([{input:image,left:layout.left,top:layout.top}]).jpeg({quality:94}).toBuffer();
}
export async function originalCoverBytes(url:string) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!['marlowquinn.com','www.marlowquinn.com'].includes(parsed.hostname)) throw new Error('The original cover must come from the verified book website.');
  const response=await fetch(parsed,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok) throw new Error('The original cover could not be loaded.');
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length>10*1024*1024) throw new Error('The original cover exceeds the 10 MB limit.');
  return data;
}
