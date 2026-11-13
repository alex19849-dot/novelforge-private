"""Upload only checksum-allowlisted immutable revision assets, then verify bytes."""
import json,hashlib,urllib.request,urllib.error,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parents[1];scratch=root.parent;out=scratch/'outputs/serif-refresh';assets=json.loads((out/'manifest.json').read_text());token=(scratch/'serif-upload.key').read_text();endpoint='https://rchktrrkwqsazlxmjmog.supabase.co/functions/v1/social-serif-assets';origin='https://rchktrrkwqsazlxmjmog.supabase.co/storage/v1/object/public/social-media/'
try:
 urllib.request.urlopen(urllib.request.Request(endpoint,data=b'no',method='POST'),timeout=30);raise AssertionError('Missing upload token accepted')
except urllib.error.HTTPError as e:assert e.code==401,e.code
try:
 urllib.request.urlopen(urllib.request.Request(endpoint,data=b'no',method='POST',headers={'x-upload-token':token,'x-upload-path':'not-permitted'}),timeout=30);raise AssertionError('Unlisted asset accepted')
except urllib.error.HTTPError as e:assert e.code==403,e.code

def upload(a):
 data=Path(a['local_path']).read_bytes();assert hashlib.sha256(data).hexdigest()==a['sha256']
 request=urllib.request.Request(endpoint,data=data,method='POST',headers={'x-upload-token':token,'x-upload-path':a['path'],'Content-Type':'video/mp4' if a['media_type']=='video' else 'image/jpeg'})
 try:
  with urllib.request.urlopen(request,timeout=90) as response:assert json.loads(response.read())['ok']
 except urllib.error.HTTPError as e:
  if e.code!=409:raise RuntimeError('Upload failed HTTP '+str(e.code)+': '+e.read().decode()[:100])
 for attempt in range(3):
  try:
   with urllib.request.urlopen(origin+a['path'],timeout=45) as response:remote=response.read()
   assert hashlib.sha256(remote).hexdigest()==a['sha256'],'Remote checksum mismatch';break
  except (urllib.error.URLError,TimeoutError):
   if attempt==2:raise
 print(json.dumps({'verified':a['slug'],'date':a['date'],'format':a['media_type'],'feed':a['feed']}),flush=True)
 return {k:a[k] for k in ['path','sha256','size','post_ids','hook','slug','date','media_type']}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:verified=list(pool.map(upload,assets))
(root/'content-revisions/2026-11-13/assets.json').write_text(json.dumps(verified,indent=2))
print(json.dumps({'uploaded_and_checksum_verified':len(verified),'posts':sum(len(a['post_ids']) for a in verified)}))
