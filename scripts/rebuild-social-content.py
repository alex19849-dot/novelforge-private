"""Rebuild the approved November campaign locally, without paid AI calls.
Produces media and an optimistic update manifest; does not publish or mutate data.
"""
import argparse,concurrent.futures,hashlib,json,re,subprocess,urllib.request,textwrap
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FFMPEG=ROOT/'node_modules/@ffmpeg-installer/linux-x64/ffmpeg'
def fetch(url,dest):
 if dest.exists():return
 req=urllib.request.Request(url,headers={'User-Agent':'NovelForge-content-revision/1'})
 with urllib.request.urlopen(req,timeout=60) as src:dest.write_bytes(src.read())
def wrap(draw,text,font,width):
 lines=[];line=''
 for word in text.split():
  candidate=(line+' '+word).strip()
  if draw.textlength(candidate,font=font)>width and line:lines.append(line);line=word
  else:line=candidate
 if line:lines.append(line)
 return lines
def card(width,height,index,kind,idea,book,cover,out):
 themes=[((9,13,24),(245,75,140)),((18,18,21),(240,83,119)),((9,25,30),(86,218,201)),((27,18,32),(237,141,189))]
 bg,accent=themes[index%len(themes)];im=Image.new('RGB',(width,height),bg);d=ImageDraw.Draw(im)
 # Generous interface-safe areas: all key text stays above the lower 20%.
 margin=90;usable=width-2*margin-45
 d.rectangle((margin,150,margin+110,159),fill=accent)
 d.text((margin,190),'MARLOW QUINN',font=ImageFont.truetype(BOLD,30),fill=(215,218,227))
 d.line((width-90,330,width-90,height-350),fill=tuple(int(x*.5) for x in accent),width=2)
 if kind in ('hook','beat'):
  text=idea[kind];size=86 if kind=='hook' else 64
  while True:
   font=ImageFont.truetype(BOLD if kind=='hook' else FONT,size);lines=wrap(d,text,font,usable)
   if len(lines)*(size+24)<height*.45 or size<=48:break
   size-=2
  y=int(height*.34) if kind=='hook' else int(height*.31)
  for n,line in enumerate(lines):d.text((margin,y+n*(size+24)),line,font=font,fill=(246,245,241))
  bottom=int(height*.74)
  d.text((margin,bottom),'MM ROMANCE',font=ImageFont.truetype(BOLD,31),fill=accent)
  font=ImageFont.truetype(FONT,34)
  for n,line in enumerate(wrap(d,book['title'],font,usable)):d.text((margin,bottom+52+n*44),line,font=font,fill=(220,221,226))
 else:
  art=Image.open(cover).convert('RGB');art.thumbnail((int(width*.52),int(height*.46)),Image.Resampling.LANCZOS)
  x=(width-art.width)//2-20;y=int(height*.16)
  d.rectangle((x-2,y-2,x+art.width+2,y+art.height+2),fill=accent);im.paste(art,(x,y))
  y+=art.height+54;font=ImageFont.truetype(BOLD,43)
  for line in wrap(d,book['title'],font,usable):d.text((margin,y),line,font=font,fill=(246,245,241));y+=57
  d.text((margin,int(height*.76)),'Find it on Amazon',font=ImageFont.truetype(BOLD,39),fill=accent)
  d.text((margin,int(height*.76)+58),'Search the title + Marlow Quinn',font=ImageFont.truetype(FONT,27),fill=(220,221,226))
 im.save(out,quality=95)
def main():
 a=argparse.ArgumentParser();a.add_argument('--source',required=True);a.add_argument('--catalogue',required=True);a.add_argument('--out',required=True);a.add_argument('--limit',type=int);args=a.parse_args()
 source=json.loads(Path(args.source).read_text());books={b['slug']:b for b in json.loads(Path(args.catalogue).read_text())['books']};ideas={i['date']:i for i in json.loads((ROOT/'content-revisions/2026-11-04/editorial.json').read_text())}
 out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True);cache=out/'sources';cache.mkdir(exist_ok=True)
 videos={p['media_path']:p for p in source if p['media_type']=='video'}
 todo=[]
 for path,p in videos.items():todo.append(('https://rchktrrkwqsazlxmjmog.supabase.co/storage/v1/object/public/social-media/'+path,cache/(hashlib.sha256(path.encode()).hexdigest()[:16]+'.mp4')))
 for slug in {p['book_slug'] for p in source}:todo.append((books[slug]['coverUrl'],cache/(slug+'.cover')))
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
  list(ex.map(lambda pair:fetch(*pair),todo))
 media=[];mapping={};remote=json.loads((out/'remote-verification.json').read_text()) if (out/'remote-verification.json').exists() else []
 for index,(path,p) in enumerate(videos.items()):
  if args.limit is not None and index>=args.limit:break
  day=p['scheduled_at'][:10];idea=ideas[day];book=books[p['book_slug']];assert idea['slug']==book['slug']
  portrait=p['platform']!='facebook';w,h=1080,1920 if portrait else 1350
  key=hashlib.sha256((path+'content-v2'+json.dumps(idea,sort_keys=True)+book['coverUrl']).encode()).hexdigest()[:16];folder=out/key;folder.mkdir(exist_ok=True)
  for kind in ('hook','beat','close'):card(w,h,index,kind,idea,book,cache/(book['slug']+'.cover'),folder/(kind+'.jpg'))
  target=folder/'revised.mp4';original=cache/(hashlib.sha256(path.encode()).hexdigest()[:16]+'.mp4')
  # Keep the existing licensed audio. Use matching TikTok audio for silent FB exports.
  audio=original;audio_path=path
  if p['platform']=='facebook':
   partner=next((q for q in source if q['campaign_id']==p['campaign_id'] and q['platform']=='tiktok'),None)
   if partner:
    audio=cache/(hashlib.sha256(partner['media_path'].encode()).hexdigest()[:16]+'.mp4');audio_path=partner['media_path']
  if not target.exists():
   inputs=[]
   for kind,duration in [('hook','2.4'),('beat','3.6'),('close','3')]:inputs+=['-loop','1','-t',duration,'-i',str(folder/(kind+'.jpg'))]
   # Each card changes immediately; restrained zoom gives movement without hiding words.
   filters=';'.join(f'[{i}:v]scale=1124:{int(h*1124/w)},zoompan=z=\'min(pzoom+0.00025,1.035)\':x=\'iw/2-iw/zoom/2\':y=\'ih/2-ih/zoom/2\':d=1:s={w}x{h}:fps=24,trim=duration={duration},setpts=PTS-STARTPTS,setsar=1[v{i}]' for i,duration in enumerate([2.4,3.6,3]))+';[v0][v1][v2]concat=n=3:v=1:a=0[v]'
   cmd=[str(FFMPEG),'-y',*inputs,'-stream_loop','-1','-i',str(audio),'-filter_complex',filters,'-map','[v]','-map','3:a:0?','-t','9','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','128k','-af','afade=t=in:st=0:d=0.12,afade=t=out:st=8.5:d=0.5','-movflags','+faststart','-threads','2',str(target)]
   run=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
   if run.returncode:raise RuntimeError(run.stderr.decode()[-1800:])
  checksum=hashlib.sha256(target.read_bytes()).hexdigest()
  track=re.search(r'(-music-v1-(?:sun-in-your-eyes|lonerism|better-times))\.mp4$',audio_path)
  assert track, 'Keep the known soundtrack marker for calendar compatibility'
  suffix=track.group(1)
  reusable=next((a for a in remote if a['sha256']==checksum and a['path'].endswith(suffix+'.mp4')),None)
  new_path=reusable['path'] if reusable else f"{p['user_id']}/calendar/content-v2/{key}{suffix}.mp4";mapping[path]=new_path
  media.append({'path':new_path,'local_path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'size':target.stat().st_size})
  print(json.dumps({'rendered':index+1,'total':len(videos),'book':book['title'],'format':'9:16' if portrait else '4:5','bytes':target.stat().st_size}),flush=True)
 updates=[]
 for p in source:
  idea=ideas[p['scheduled_at'][:10]];book=books[p['book_slug']];assert idea['slug']==book['slug']
  core=idea['body'];question=idea.get('question','')
  if p['platform']=='facebook':
   caption=idea['hook']+'\n\n'+core+(('\n\n'+question) if question else '')+'\n\n'+book['title']+((' • Kindle Unlimited' if book['kindleUnlimited'] else ' • MM romance'))+'\n'+book['amazonUrl'];title=idea['hook'];tags=[t for t in p['hashtags'] if t not in ['#ReaderProblems','#BookTok','#MMBookTok']][:3]
  elif p['platform']=='tiktok':
   caption=idea['hook']+'\n\n'+book['title']+': '+core+(('\n\n'+question) if question else '')+'\n\nSearch '+book['title']+' by Marlow Quinn on Amazon.';title=idea['search'];tags=list(dict.fromkeys(['#MMRomance',*p['hashtags']]))[:5]
  else:
   title=(book['title']+' | '+idea['search'])[:100];caption=idea['hook']+'\n\n'+core+(('\n\n'+question) if question else '')+'\n\nRead '+book['title']+' by Marlow Quinn. Books link on my channel profile.';tags=list(dict.fromkeys(['#Shorts','#MMRomance',*[t for t in p['hashtags'] if t not in ['#BookTok','#MMBookTok','#ReaderProblems']]]))[:4]
  if not tags:tags=['#MMRomance']
  media_path=mapping.get(p['media_path'],p['media_path'])
  if p['media_type']=='video' and p['media_path'] not in mapping:continue
  updates.append({'id':p['id'],'user_id':p['user_id'],'expected_version':p['version'],'expected_media_path':p['media_path'],'title':title,'caption':caption,'hashtags':tags,'media_path':media_path,'metadata':{**p.get('content_metadata',{}),'content_revision':'2026-11-04-v2','revision_original_media':p['media_path'],'revision_original_version':p['version'],'revision_hook':idea['hook']}})
 (out/'upload-manifest.json').write_text(json.dumps(media,indent=2));(out/'post-updates.json').write_text(json.dumps(updates,indent=2));(out/'source-backup.json').write_text(json.dumps(source,indent=2))
 print(json.dumps({'prepared_updates':len(updates),'media_exports':len(media)}),flush=True)
if __name__=='__main__':main()
