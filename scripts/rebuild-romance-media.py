"""Assemble book-specific cinematic artwork and mobile-safe social video.
Uses approved copy and separate object-only background plates, never AI people.
Does not change any caption, schedule, approval or database row.
"""
import argparse,json,hashlib,re,subprocess,concurrent.futures
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT.parent/'outputs/romance-rebuild';BASE=ROOT.parent/'outputs/social-rebuild'
SANS='/usr/share/fonts/opentype/urw-base35/NimbusSansNarrow-Bold.otf'
SERIF='/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf'
ITALIC='/usr/share/fonts/opentype/urw-base35/NimbusRoman-Italic.otf'
SMALL='/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf'
FFMPEG=ROOT/'node_modules/@ffmpeg-installer/linux-x64/ffmpeg'
SPORT={'under-pressure','house-rules','the-captains-rule','break-my-guard','cold-as-puck'}
def lines(draw,text,font,width):
 result=[];line=''
 for word in text.split():
  s=(line+' '+word).strip()
  if draw.textlength(s,font=font)>width and line:result.append(line);line=word
  else:line=s
 if line:result.append(line)
 return result

def lettering(im,text,y,maxsize,maxheight,fontpath,accent,highlight=True):
 d=ImageDraw.Draw(im);width=im.width-210
 size=maxsize
 while True:
  f=ImageFont.truetype(fontpath,size);rows=lines(d,text,f,width);step=int(size*1.15)
  if len(rows)*step<=maxheight or size<=42:break
  size-=2
 assert len(rows)*step<=maxheight,(text,rows,size)
 for i,row in enumerate(rows):
  x=(im.width-d.textlength(row,font=f))/2
  # Tight shadow protects readability without a corporate panel or opaque block.
  d.text((x+2,y+i*step+3),row,font=f,fill=(0,0,0),stroke_width=3,stroke_fill=(0,0,0))
  d.text((x,y+i*step),row,font=f,fill=accent if highlight and i==len(rows)-1 else (248,245,241))
 return y+len(rows)*step

def frame(slug,idea,book,w,h,kind,path):
 bg=OUT/'backgrounds'/(slug+'.png')
 if not bg.exists():bg=bg.with_suffix('.jpg')
 im=ImageOps.fit(Image.open(bg).convert('RGB'),(w,h),Image.Resampling.LANCZOS,centering=(.5,.55))
 accent=(241,43,135) if slug!='cold-as-puck' else (126,214,250)
 font=SANS if slug in SPORT else SERIF
 if kind in ('hook','still'):
  lettering(im,idea['hook'],int(h*.155),106 if h>1500 else 91,int(h*.32),font,accent)
 elif kind=='beat':
  lettering(im,idea['beat'],int(h*.155),79 if h>1500 else 67,int(h*.33),SERIF,accent)
 else:
  lettering(im,book['title'],int(h*.17),112 if h>1500 else 94,int(h*.30),font,accent)
  lettering(im,'Marlow Quinn',int(h*.43),48,int(h*.08),ITALIC,(248,245,241),False)
  lettering(im,'Find it on Amazon',int(h*.69),54,int(h*.07),SERIF,(248,245,241),False)
  lettering(im,'Search the title + Marlow Quinn',int(h*.745),32,int(h*.045),SMALL,accent,False)
 if kind in ('hook','beat','still'):
  lettering(im,book['title'],int(h*.715),61 if h>1500 else 49,int(h*.09),font,(248,245,241),False)
  lettering(im,'MARLOW QUINN',int(h*.80)-30,29,int(h*.035),SMALL,accent,False)
 if kind=='still':lettering(im,'Find it on Amazon',int(h*.85),34,int(h*.045),ITALIC,(248,245,241),False)
 im.save(path,quality=96)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--available',action='store_true');a=ap.parse_args()
 source=json.loads((ROOT/'content-revisions/2026-11-04/source-posts.json').read_text());ideas={x['date']:x for x in json.loads((ROOT/'content-revisions/2026-11-04/editorial.json').read_text())};books={x['slug']:x for x in json.loads((ROOT/'content-revisions/2026-11-04/catalogue-facts.json').read_text())['books']}
 posts=[p for p in source if p['media_type'] in ('video','image')]
 groups={}
 for p in posts:
  if a.available and not any((OUT/'backgrounds'/(p['book_slug']+s)).exists() for s in ['.png','.jpg']):continue
  key=(p['book_slug'],p['scheduled_at'][:10],'video' if p['media_type']=='video' else 'still',p['platform']=='facebook')
  groups.setdefault(key,[]).append(p)
 def render(item):
  (slug,date,kind,feed),ps=item;idea=ideas[date];book=books[slug];w,h=1080,1350 if feed else 1920
  plate=next(p for p in [OUT/'backgrounds'/(slug+'.png'),OUT/'backgrounds'/(slug+'.jpg')] if p.exists());seed=json.dumps([idea,kind,feed,hashlib.sha256(plate.read_bytes()).hexdigest(),'romance-v3-design2'])
  key=hashlib.sha256(seed.encode()).hexdigest()[:16];folder=OUT/key;folder.mkdir(exist_ok=True)
  audio_post=next((q for q in source if q['campaign_id']==ps[0]['campaign_id'] and q['platform']=='tiktok'),ps[0]);audio=BASE/'sources'/(hashlib.sha256(audio_post['media_path'].encode()).hexdigest()[:16]+'.mp4') if kind=='video' else None
  if kind=='still':
   target=folder/'revised.jpg';frame(slug,idea,book,w,h,'still',target);suffix='.jpg'
  else:
   for stage in ['hook','beat','close']:frame(slug,idea,book,w,h,stage,folder/(stage+'.jpg'))
   target=folder/'revised.mp4';suffix=re.search(r'(-music-v1-(?:sun-in-your-eyes|lonerism|better-times))\.mp4$',audio_post['media_path']).group(1)+'.mp4'
   if not target.exists():
    inputs=[]
    for stage in ['hook','beat','close']:inputs+=['-loop','1','-t','4','-i',str(folder/(stage+'.jpg'))]
    fs=[]
    for i in range(3):
     z=1+i*.018
     fs.append(f'[{i}:v]scale=1124:{int(h*1124/w)},zoompan=z=\'min({z}+on*0.00018,{z+.018})\':x=\'iw/2-iw/zoom/2\':y=\'ih/2-ih/zoom/2\':d=1:s={w}x{h}:fps=24,trim=duration=4,setpts=PTS-STARTPTS,setsar=1[v{i}]')
    fs.append('[v0][v1][v2]concat=n=3:v=1:a=0[v]')
    cmd=[str(FFMPEG),'-y',*inputs,'-stream_loop','-1','-i',str(audio),'-filter_complex',';'.join(fs),'-map','[v]','-map','3:a:0','-t','12','-c:v','libx264','-crf','21','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','128k','-af','afade=t=out:st=11.4:d=0.6','-movflags','+faststart','-threads','2',str(target)]
    run=subprocess.run(cmd,capture_output=True,timeout=200)
    if run.returncode:raise RuntimeError(run.stderr.decode()[-1800:])
  asset={'path':ps[0]['user_id']+'/calendar/romance-v3/'+key+suffix,'local_path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'size':target.stat().st_size,'book_slug':slug,'date':date,'media_type':'video' if kind=='video' else 'image','post_ids':[p['id'] for p in ps]}
  print(json.dumps({'ready':slug,'date':date,'format':kind,'feed':feed}),flush=True);return asset
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:assets=list(pool.map(render,groups.items()))
 (OUT/'upload-manifest.json').write_text(json.dumps(assets,indent=2));print(json.dumps({'assets':len(assets),'posts':sum(len(x['post_ids']) for x in assets)}))
if __name__=='__main__':main()
