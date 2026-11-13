"""Apply the approved serif identity using verified book plates and exact copy.
Renders typography deterministically, preserves licensed music, writes immutable exports.
"""
import json,hashlib,subprocess,concurrent.futures,re
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT.parent/'outputs/serif-refresh'
SERIF='/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf'
BOLD='/usr/share/fonts/opentype/urw-base35/NimbusRoman-Bold.otf'
SMALL='/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf'
ACCENT=(245,91,162);IVORY=(251,247,240)
HOOKS={'the-captains-rule':'His rival. His roommate. His problem.','under-pressure':'One night. Same team. Too much to lose.','off-limits':'His rules. His control. Then Asher.','house-rules':'His stepbrother. His house. His undoing.','mine':'He wants freedom. The bond wants him.'}

def wrap(d,text,font,width):
 rows=[];line=''
 for word in text.split():
  trial=(line+' '+word).strip()
  if d.textlength(trial,font=font)>width and line:rows.append(line);line=word
  else:line=trial
 if line:rows.append(line)
 return rows

def label(im,text,y,size,height,font=SERIF,emphasis=False):
 d=ImageDraw.Draw(im);width=im.width-230
 while size>=40:
  f=ImageFont.truetype(font,size);phrases=[t.strip() for t in re.split(r'(?<=[.!?])\s+',text) if t.strip()];rows=phrases if 1<len(phrases)<=3 and all(d.textlength(t,font=f)<=width for t in phrases) else wrap(d,text,f,width);step=round(size*1.14)
  if len(rows)*step<=height and all(d.textlength(t,font=f)<=width for t in rows):break
  size-=2
 assert size>=40 and len(rows)*step<=height,('Text cannot fit',text)
 for i,line in enumerate(rows):
  x=round((im.width-d.textlength(line,font=f))/2)
  color=ACCENT if emphasis and i==len(rows)-1 else IVORY
  d.text((x,y+i*step),line,font=f,fill=color,stroke_width=3,stroke_fill=(8,7,10))
 return {'text':text,'size':size,'lines':rows,'top':y,'bottom':y+len(rows)*step,'safe_left':115,'safe_right':im.width-115}

def stage(slug,idea,title,w,h,kind,file):
 plate=OUT/'backgrounds'/(slug+'.jpg')
 im=ImageOps.fit(Image.open(plate).convert('RGB'),(w,h),Image.Resampling.LANCZOS,centering=(.5,.55))
 # Smooth shadows behind lettering are integrated light, never a panel.
 shade=Image.new('RGBA',im.size);pixels=shade.load()
 for y in range(h):
  top=max(0,1-y/(h*.5));bottom=max(0,(y/h-.64)/.36);alpha=int(max(top*.48,bottom*.66)*255)
  for x in range(w):pixels[x,y]=(5,4,8,alpha)
 im=Image.alpha_composite(im.convert('RGBA'),shade).convert('RGB')
 boxes=[]
 if kind in ['hook','still']:
  boxes.append(label(im,HOOKS.get(slug,idea['hook']),round(h*.12),110 if h>1500 else 91,round(h*.29),BOLD,True))
 elif kind=='beat':boxes.append(label(im,idea['beat'],round(h*.13),86 if h>1500 else 73,round(h*.32),SERIF,False))
 else:
  boxes.append(label(im,title,round(h*.17),110 if h>1500 else 92,round(h*.28),SERIF))
  boxes.append(label(im,'Marlow Quinn',round(h*.45),46,round(h*.06),SERIF))
  boxes.append(label(im,'Find it on Amazon',round(h*.69),52,round(h*.065),SERIF))
  boxes.append(label(im,'Search the title + Marlow Quinn',round(h*.76),40,round(h*.06),SERIF))
 if kind in ['hook','beat','still']:
  boxes.append(label(im,title.upper(),round(h*.745),64 if h>1500 else 54,round(h*.09),SERIF))
  boxes.append(label(im,'Marlow Quinn',round(h*.825),43,round(h*.055),SERIF))
 if kind=='still':boxes.append(label(im,'Find it on Amazon',round(h*.875),40,round(h*.055),SERIF))
 im.save(file,quality=95);return boxes

def main():
 posts=json.loads((ROOT/'content-revisions/2026-11-13/source-posts.json').read_text());ideas={i['date']:i for i in json.loads((ROOT/'content-revisions/2026-11-04/editorial.json').read_text())}
 groups={}
 for p in posts:
  kind='video' if p['platform'] in ['tiktok','youtube'] or p['media_type']=='video' else 'image'
  groups.setdefault((p['book_slug'],p['scheduled_at'][:10],kind,p['platform']=='facebook'),[]).append(p)
 def render(item):
  (slug,date,kind,feed),ps=item;idea=ideas[date];w,h=1080,1350 if feed else 1920
  key=hashlib.sha256(json.dumps([slug,date,kind,feed,'serif-romance-v1']).encode()).hexdigest()[:18]
  folder=OUT/'exports'/key;folder.mkdir(parents=True,exist_ok=True);boxes=[]
  master=OUT/'masters'/(slug+'.png')
  if master.exists():
   # Fit the complete master inside each format. No letters are cropped.
   base=Image.open(master).convert('RGB');im=ImageOps.contain(base,(w,h),Image.Resampling.LANCZOS)
   fitted=Image.new('RGB',(w,h),(6,5,8));fitted.paste(im,((w-im.width)//2,(h-im.height)//2));fitted.save(folder/'hook.jpg',quality=95)
  else:boxes=stage(slug,idea,ps[0]['book_title'],w,h,'still' if kind=='image' else 'hook',folder/'hook.jpg')
  if kind=='image':
   target=folder/'hook.jpg';suffix='.jpg'
  else:
   from glob import glob
   audio_post=next((p for p in ps if p['media_path']),None)
   match=re.search(r'-music-v1-(sun-in-your-eyes|lonerism|better-times)\.mp4$',audio_post['media_path']) if audio_post else None
   track=match.group(1) if match else 'better-times';music=ROOT/'assets/social-music'/(track+'.m4a');suffix='-music-v1-'+track+'.mp4';target=folder/'revised.mp4'
   inputs=['-loop','1','-t','8' if master.exists() else '3','-i',str(folder/'hook.jpg')]
   filters=[]
   if not master.exists():
    for name in ['beat','close']:
     boxes+=stage(slug,idea,ps[0]['book_title'],w,h,name,folder/(name+'.jpg'))
     inputs+=['-loop','1','-t','3','-i',str(folder/(name+'.jpg'))]
    for i in range(3):filters.append(f"[{i}:v]scale=1124:{round(h*1124/w)},zoompan=z='1.025+0.012*sin(PI*on/72)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps=24,trim=duration=3,setpts=PTS-STARTPTS,setsar=1[v{i}]")
    filters.append('[v0][v1][v2]concat=n=3:v=1:a=0[v]');duration=9;audio_index='3:a:0'
   else:
    filters=[f"[0:v]scale=1124:{round(h*1124/w)},zoompan=z='1.025+0.012*sin(PI*on/192)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps=24,trim=duration=8,setpts=PTS-STARTPTS,setsar=1[v]"];duration=8;audio_index='1:a:0'
   ffmpeg=ROOT/'node_modules/@ffmpeg-installer/linux-x64/ffmpeg'
   command=[str(ffmpeg),'-y',*inputs,'-stream_loop','-1','-i',str(music),'-filter_complex',';'.join(filters),'-map','[v]','-map',audio_index,'-t',str(duration),'-c:v','libx264','-crf','21','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','128k','-af',f'afade=t=out:st={duration-.6}:d=0.6','-movflags','+faststart','-threads','2',str(target)]
   run=subprocess.run(command,capture_output=True,timeout=180)
   if run.returncode:raise RuntimeError(run.stderr.decode()[-1500:])
  asset={'path':ps[0]['user_id']+'/calendar/serif-romance-v1/'+key+suffix,'local_path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'size':target.stat().st_size,'media_type':kind,'post_ids':[p['id'] for p in ps],'slug':slug,'date':date,'feed':feed,'hook':HOOKS.get(slug,idea['hook']),'typography':boxes,'preview':str(folder/'hook.jpg')}
  print(json.dumps({'ready':slug,'date':date,'format':kind,'feed':feed}),flush=True);return asset
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:assets=list(pool.map(render,groups.items()))
 (OUT/'manifest.json').write_text(json.dumps(assets,indent=2));print(json.dumps({'assets':len(assets),'posts':sum(len(a['post_ids']) for a in assets)}))
if __name__=='__main__':main()
