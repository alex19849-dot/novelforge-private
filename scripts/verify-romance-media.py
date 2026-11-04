"""Verify every cinematic replacement and full queued-artwork coverage."""
import json,subprocess,hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1];out=root.parent/'outputs/romance-rebuild'
assets=json.loads((out/'upload-manifest.json').read_text());source=json.loads((root/'content-revisions/2026-11-04/source-posts.json').read_text())
expected={p['id'] for p in source if p['media_type'] in ['video','image']};ids=[i for a in assets for i in a['post_ids']]
assert len(ids)==len(set(ids)) and set(ids)==expected
assert len(assets)==len({a['path'] for a in assets})==41
videos=0
for a in assets:
 path=Path(a['local_path']);assert path.stat().st_size==a['size'] and hashlib.sha256(path.read_bytes()).hexdigest()==a['sha256']
 assert '/romance-v3/' in a['path']
 if a['media_type']=='video':
  d=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_streams','-show_format','-of','json',str(path)]));v=next(s for s in d['streams'] if s['codec_type']=='video');au=next(s for s in d['streams'] if s['codec_type']=='audio')
  assert (v['width'],v['height']) in [(1080,1920),(1080,1350)]
  assert v['codec_name']=='h264' and v['pix_fmt']=='yuv420p' and v['sample_aspect_ratio']=='1:1'
  assert au['codec_name']=='aac' and au['sample_rate']=='48000' and 11.9<float(d['format']['duration'])<12.2
  assert '-music-v1-' in a['path'];videos+=1
 else:
  im=Image.open(path);assert im.size==(1080,1350) and im.format=='JPEG'
assert videos==26
print(json.dumps({'assets':len(assets),'video_files':videos,'image_files':len(assets)-videos,'posts_covered':len(ids),'all_checks_passed':True}))
