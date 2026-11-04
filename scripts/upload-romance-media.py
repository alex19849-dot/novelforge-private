"""Upload checked immutable exports through the expiring maintenance endpoint.
The local auth file is never committed. Verify every uploaded public object.
"""
import concurrent.futures,json,hashlib,urllib.request,urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[1];scratch=root.parent;out=scratch/'outputs/romance-rebuild'
auth=json.loads((scratch/'content-upload-auth.local.json').read_text());anon=json.loads((scratch/'content-public-key.local.json').read_text())['key'];assets=json.loads((out/'upload-manifest.json').read_text())
origin='https://rchktrrkwqsazlxmjmog.supabase.co';endpoint=origin+'/functions/v1/social-content-revision-upload'
def upload(a):
 data=Path(a['local_path']).read_bytes();assert hashlib.sha256(data).hexdigest()==a['sha256']
 req=urllib.request.Request(endpoint,data=data,method='POST',headers={'Authorization':'Bearer '+anon,'Content-Type':('image/jpeg' if a['path'].endswith('.jpg') else 'video/mp4'),'x-content-token':auth['token'],'x-content-path':a['path']})
 try:
  with urllib.request.urlopen(req,timeout=90) as response:result=json.loads(response.read());assert result['ok']
 except urllib.error.HTTPError as e:
  if e.code!=409:raise RuntimeError('Upload failed: HTTP '+str(e.code))
 with urllib.request.urlopen(origin+'/storage/v1/object/public/social-media/'+a['path'],timeout=90) as response:published=response.read()
 assert hashlib.sha256(published).hexdigest()==a['sha256'],'Remote checksum mismatch'
 print(json.dumps({'verified':a['path'].split('/')[-1],'bytes':len(published)}),flush=True)
 return {k:a[k] for k in ['path','sha256','size']}
# The gateway may allow public project credentials, but the handler must also
# reject requests without the scoped maintenance token.
try:
 urllib.request.urlopen(urllib.request.Request(endpoint,data=b'x',method='POST',headers={'Authorization':'Bearer '+anon,'Content-Type':'application/octet-stream'}),timeout=30)
 raise AssertionError('Unauthenticated handler accepted a request')
except urllib.error.HTTPError as e:assert e.code==401
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(upload,assets))
(out/'remote-verification.json').write_text(json.dumps(results,indent=2));print(json.dumps({'all_uploads_verified':len(results)}),flush=True)
