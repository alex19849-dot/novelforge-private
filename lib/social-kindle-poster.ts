import sharp from "sharp";
import { join } from "node:path";
import type { StudioBook, CreativeRecipe } from "./social-creative-directions";
const xml = (value: string) => value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
export function wrapPosterText(value: string, max: number) {
  const lines: string[] = [];
  for (const word of value.split(/\s+/)) {
    if (!lines.length || lines.at(-1)!.length + word.length + 1 > max) lines.push(word);
    else lines[lines.length - 1] += " " + word;
  }
  return lines;
}
/** Cover scale is intentional: the screen occupies almost half the feed width.
 * Centre layouts reserve a separate, full-width trope band below the device. */
export function kindleScreen(portrait: boolean, layout: number) {
  const width = layout === 2 ? (portrait ? 550 : 440) : 500;
  const x = layout === 0 ? 64 : layout === 2 ? (1080-width)/2 : (portrait ? 950 : 1016)-width;
  const y = portrait ? (layout === 2 ? 550 : layout === 3 ? 690 : 600) : (layout === 3 ? 470 : 405);
  const frame = 22;
  const screenWidth = width-frame*2, screenHeight = Math.round(screenWidth*1.5);
  return {x,y,width,height:screenHeight+frame*2+36,screenX:x+frame,screenY:y+frame,screenWidth,screenHeight};
}
type Lettering = {value:string;x:number;y:number;width:number;size:number;colour:string;romantic?:boolean;serif?:boolean;centre?:boolean;style?:"hook"|"accent"|"body";maxHeight?:number};
async function textLayer(t: Lettering) {
  const accent = t.style === "accent" || t.romantic;
  const family = accent ? "Lobster Two Bold Italic" : t.serif ? "DM Serif Display" : "DM Sans Bold";
  let size = t.size;
  while (true) {
    const input = await sharp({text:{
      text:`<span foreground="${t.colour}">${xml(t.value)}</span>`,
      font:`${family} ${size}`,
      fontfile:join(process.cwd(),"assets","social-fonts",accent?"LobsterTwo-BoldItalic.ttf":t.serif?"DMSerifDisplay-Regular.ttf":"DMSans.ttf"),
      width:t.width,align:t.centre?"centre":"left",rgba:true,spacing:Math.round(size*.12),
    }}).png().toBuffer();
    const metadata = await sharp(input).metadata();
    if (!t.maxHeight || metadata.height! <= t.maxHeight) return {input,left:Math.round(t.centre?t.x-metadata.width!/2:t.x),top:Math.round(t.y)};
    // Never silently shrink important text into unreadable small print.
    if (size <= (t.style === "hook" ? 76 : 42)) throw Error("Shorten this text so it stays readable on a phone.");
    size-=2;
  }
}
export async function composeKindlePoster(background:Buffer,cover:Buffer,book:StudioBook,recipe:CreativeRecipe,hook:string,portrait:boolean) {
  const height=portrait?1920:1350, device=kindleScreen(portrait,recipe.layout);
  const screen=await sharp(cover,{limitInputPixels:20_000_000}).resize(device.screenWidth,device.screenHeight,{fit:"contain",background:"#111"}).png().toBuffer();
  const centre=recipe.layout===2, hookY=portrait?210:64;
  // Real measured Pango bounds control fitting, rather than character-count guesses.
  const hookLayer=await textLayer({value:hook,x:centre?540:68,y:hookY,width:944,size:hook.length>65?88:102,colour:"#fff5e8",romantic:recipe.fontStyle === "script" || (!recipe.fontStyle && /christmas|holiday|festive/i.test(book.subgenre)),serif:recipe.fontStyle === "serif",centre,style:"hook",maxHeight:portrait?340:300});
  const type:Lettering[]=[];
  if (centre) {
    const y=device.y+device.height+30;
    book.tropes.slice(0,4).forEach((trope,i)=>type.push({value:trope,x:i%2?780:300,y:y+Math.floor(i/2)*66,width:440,size:44,colour:"#fff5e8",centre:true,style:"body",maxHeight:58}));
  } else {
    const tx=recipe.layout===0?610:68, tw=portrait?340:recipe.layout===0?400:390;
    let ty=device.y+(portrait?140:115);
    for (const trope of book.tropes.slice(0,4)) {
      const item=await textLayer({value:trope,x:tx,y:ty,width:tw,size:48,colour:"#fff5e8",style:"body",maxHeight:116});
      const meta=await sharp(item.input).metadata();
      type.push({value:trope,x:tx,y:ty,width:tw,size:48,colour:"#fff5e8",style:"body",maxHeight:116});
      ty+=meta.height!+34;
    }
  }
  const ctaY=portrait?1580:1254;
  type.push({value:book.kindleUnlimited?"Read on Kindle Unlimited":"Read on Kindle",x:540,y:ctaY,width:944,size:48,colour:"#fff5e8",centre:true,style:"accent",maxHeight:64});
  // Local contrast behind lettering; preserve the scene's colour and light.
  // No global navy wash, cards, pill labels or brochure-style title/author repeats.
  const veil=`<svg width="1080" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="top" x2="0" y2="1"><stop stop-color="#14090d" stop-opacity=".75"/><stop offset="1" stop-color="#14090d" stop-opacity="0"/></linearGradient><linearGradient id="bottom" x2="0" y2="1"><stop stop-color="#14090d" stop-opacity="0"/><stop offset="1" stop-color="#14090d" stop-opacity=".9"/></linearGradient><radialGradient id="side"><stop stop-color="#14090d" stop-opacity=".75"/><stop offset="1" stop-color="#14090d" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="${portrait?640:420}" fill="url(#top)"/><rect y="${portrait?1410:1050}" width="1080" height="${portrait?510:300}" fill="url(#bottom)"/>${!centre?`<ellipse cx="${recipe.layout===0?810:260}" cy="${device.y+340}" rx="390" ry="470" fill="url(#side)"/>`:""}<rect x="${device.x-10}" y="${device.y-5}" width="${device.width+20}" height="${device.height+20}" rx="28" fill="#080609" opacity=".55"/><rect x="${device.x}" y="${device.y}" width="${device.width}" height="${device.height}" rx="24" fill="#171719" stroke="#69615b" stroke-width="2"/><text x="${device.x+device.width/2}" y="${device.y+device.height-15}" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#bfb7ae">kindle</text></svg>`;
  const lettering=await Promise.all(type.map(textLayer));
  return sharp(background).resize(1080,height,{fit:"cover"}).composite([{input:Buffer.from(veil)},{input:screen,left:device.screenX,top:device.screenY},hookLayer,...lettering]).jpeg({quality:94}).toBuffer();
}

/** Compare scene structure before adding the shared cover or typography. */
export async function sceneFingerprint(source: Buffer) {
  const pixels = await sharp(source)
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits += pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? "1" : "0";
  return bits
    .match(/.{4}/g)!
    .map((value) => parseInt(value, 2).toString(16))
    .join("");
}
export function sceneIsTooSimilar(a: string, b: string) {
  if (!/^[a-f0-9]{16}$/i.test(a) || !/^[a-f0-9]{16}$/i.test(b)) return false;
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let value = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (value) {
      bits += value & 1;
      value >>= 1;
    }
  }
  return bits <= 5;
}
