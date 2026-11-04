import json,subprocess,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root.parent/'outputs/social-rebuild';assets=json.loads((out/'upload-manifest.json').read_text());updates=json.loads((out/'post-updates.json').read_text());before={p['id']:p for p in json.loads((out/'source-backup.json').read_text())}
assert len(updates)==68 and len({p['id'] for p in updates})==68
assert len(assets)==26 and len({a['path'] for a in assets})==26
for asset in assets:
 p=Path(asset['local_path']);assert p.stat().st_size==asset['size'] and hashlib.sha256(p.read_bytes()).hexdigest()==asset['sha256']
 data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
 v=next(s for s in data['streams'] if s['codec_type']=='video');a=next(s for s in data['streams'] if s['codec_type']=='audio')
 assert (v['width'],v['height']) in [(1080,1920),(1080,1350)]
 assert v['codec_name']=='h264' and v['pix_fmt']=='yuv420p' and v['sample_aspect_ratio']=='1:1'
 assert a['codec_name']=='aac' and a['sample_rate']=='48000'
 assert 8.9<=float(data['format']['duration'])<=9.1
for p in updates:
 source=before[p['id']];assert p['expected_version']==source['version']
 assert p['title'].strip() and len(p['title'])<=(100 if source['platform']=='youtube' else 240)
 assert len(p['caption'])<1600 and p['caption'].strip() and '\\n' not in p['caption'] and '\u2014' not in p['caption'] and '\u2013' not in p['caption']
 assert source['book_title'] in p['caption']
 if source['platform']=='facebook':assert 'https://www.amazon.' in p['caption']
 if source['platform']=='tiktok':assert 'on Amazon.' in p['caption'] and 'http' not in p['caption']
 if source['platform']=='youtube':assert 'channel profile' in p['caption'] and 'http' not in p['caption']
 if source['book_slug']=='call-my-bluff':assert 'Kindle Unlimited' not in p['caption']
 if source['media_type']=='video':assert p['media_path']!=source['media_path'] and p['media_path'] in {a['path'] for a in assets}
 else:assert p['media_path']==source['media_path']
print(json.dumps({'posts_checked':len(updates),'video_files_checked':len(assets),'video_posts_replaced':sum(before[p['id']]['media_type']=='video' for p in updates),'all_checks_passed':True}))
