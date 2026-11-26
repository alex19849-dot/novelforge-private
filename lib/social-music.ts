// Metadata only. Licensed audio excerpts stay on the server, for finished video exports.
export const MUSIC_VERSION = 1;
export const SCENE_MOODS = [
  {id:'romantic', label:'Romantic and emotional'},
  {id:'sensual', label:'Sensual and intimate'},
  {id:'tension', label:'Slow burn and tension'},
  {id:'playful', label:'Playful and flirty'},
] as const;
export type SceneMusicMood = typeof SCENE_MOODS[number]['id'];
export type SocialTrack = {
  id:string; title:string; artist:string; file:string; source:string;
  mood:SceneMusicMood; description:string; start:number; seconds:number; legacy?:boolean;
};
export const SOCIAL_TRACKS: readonly SocialTrack[] = [
  {
    "id": "old-letter",
    "title": "Old Letter",
    "artist": "Michael Ramir C.",
    "file": "old-letter.m4a",
    "source": "https://assets.mixkit.co/music/854/854.mp3",
    "mood": "romantic",
    "description": "Emotional acoustic and electric guitar, for intimate romantic moments.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "we-ll-be-okay",
    "title": "We'll Be Okay",
    "artist": "Michael Ramir C.",
    "file": "we-ll-be-okay.m4a",
    "source": "https://assets.mixkit.co/music/1081/1081.mp3",
    "mood": "romantic",
    "description": "Reflective piano, for vulnerability and emotional reveals.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "true-love",
    "title": "True Love",
    "artist": "Ahjay Stelino",
    "file": "true-love.m4a",
    "source": "https://assets.mixkit.co/music/43/43.mp3",
    "mood": "romantic",
    "description": "Soul with bass and drums, for longing and romantic tension.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "skyline",
    "title": "Skyline",
    "artist": "Eugenio Mininni",
    "file": "skyline.m4a",
    "source": "https://assets.mixkit.co/music/601/601.mp3",
    "mood": "romantic",
    "description": "Cinematic cello and piano, for heartfelt romance.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "j-b-r-b-music",
    "title": "J.B. R&B Music",
    "artist": "Arulo",
    "file": "j-b-r-b-music.m4a",
    "source": "https://assets.mixkit.co/music/227/227.mp3",
    "mood": "sensual",
    "description": "Sensual R&B and pop, with bass and drums.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "thinking-about-you",
    "title": "Thinking About You",
    "artist": "Arulo",
    "file": "thinking-about-you.m4a",
    "source": "https://assets.mixkit.co/music/234/234.mp3",
    "mood": "sensual",
    "description": "Chilled, sensual backing for attraction and an almost-kiss.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "baileys",
    "title": "Baileys",
    "artist": "Diego Nava",
    "file": "baileys.m4a",
    "source": "https://assets.mixkit.co/music/476/476.mp3",
    "mood": "sensual",
    "description": "Contemporary R&B for charged romantic scenes.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "babe",
    "title": "Babe",
    "artist": "Michael Ramir C.",
    "file": "babe.m4a",
    "source": "https://assets.mixkit.co/music/783/783.mp3",
    "mood": "sensual",
    "description": "Contemporary R&B for flirting and chemistry.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "river-flow",
    "title": "River Flow",
    "artist": "Eugenio Mininni",
    "file": "river-flow.m4a",
    "source": "https://assets.mixkit.co/music/594/594.mp3",
    "mood": "tension",
    "description": "Electronic tension for a charged encounter.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "moon-walk",
    "title": "Moon Walk",
    "artist": "Eugenio Mininni",
    "file": "moon-walk.m4a",
    "source": "https://assets.mixkit.co/music/609/609.mp3",
    "mood": "tension",
    "description": "Electronic suspense for a slow-burn reveal.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "slow-rain",
    "title": "Slow Rain",
    "artist": "Alejandro Magaña (A. M.)",
    "file": "slow-rain.m4a",
    "source": "https://assets.mixkit.co/music/122/122.mp3",
    "mood": "tension",
    "description": "Moody electronica for unresolved attraction.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "gummies",
    "title": "Gummies",
    "artist": "Michael Ramir C.",
    "file": "gummies.m4a",
    "source": "https://assets.mixkit.co/music/1142/1142.mp3",
    "mood": "playful",
    "description": "Playful synthpop for teasing and cheeky banter.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "music-and-life",
    "title": "Music and Life",
    "artist": "Michael Ramir C.",
    "file": "music-and-life.m4a",
    "source": "https://assets.mixkit.co/music/852/852.mp3",
    "mood": "playful",
    "description": "Light folk pop for warm, playful scenes.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "that-s-the-way-of-life",
    "title": "That's the Way of Life",
    "artist": "Michael Ramir C.",
    "file": "that-s-the-way-of-life.m4a",
    "source": "https://assets.mixkit.co/music/840/840.mp3",
    "mood": "playful",
    "description": "Playful folk pop for a lighter romantic moment.",
    "start": 8,
    "seconds": 40
  },
  {
    "id": "sun-in-your-eyes",
    "title": "Sun in Your Eyes",
    "artist": "Alejandro Magaña (A. M.)",
    "file": "sun-in-your-eyes.m4a",
    "source": "https://assets.mixkit.co/music/131/131.mp3",
    "mood": "romantic",
    "legacy": true,
    "description": "Previous backing track, kept for existing exports.",
    "start": 16,
    "seconds": 12
  },
  {
    "id": "lonerism",
    "title": "Lonerism",
    "artist": "Alejandro Magaña (A. M.)",
    "file": "lonerism.m4a",
    "source": "https://assets.mixkit.co/music/159/159.mp3",
    "mood": "romantic",
    "legacy": true,
    "description": "Previous backing track, kept for existing exports.",
    "start": 16,
    "seconds": 12
  },
  {
    "id": "better-times",
    "title": "Better Times are Coming",
    "artist": "Alejandro Magaña (A. M.)",
    "file": "better-times.m4a",
    "source": "https://assets.mixkit.co/music/173/173.mp3",
    "mood": "romantic",
    "legacy": true,
    "description": "Previous backing track, kept for existing exports.",
    "start": 16,
    "seconds": 12
  }
];
export const MUSIC_LICENSE = 'https://mixkit.co/license/#musicFree';
export function musicForPath(path: string | null | undefined): SocialTrack | undefined {
  return SOCIAL_TRACKS.find(track => path?.endsWith(`-music-v${MUSIC_VERSION}-${track.id}.mp4`));
}

function hashKey(key:string) {
  let hash = 2166136261;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
/** Scene copy drives the mood, not the book's generic genre tags or wardrobe. */
export function inferSceneMusicMood(plan: {hook?:string; slides?:{text?:string}[]}):SceneMusicMood {
  const text = [plan.hook, ...(Array.isArray(plan.slides) ? plan.slides.map(s => s.text) : [])].join(' ').toLowerCase();
  const scores:Record<SceneMusicMood,number> = {
    romantic: 0,
    sensual: (text.match(/\b(kiss(?:es|ing|ed)?|lips|touch(?:es|ing|ed)?|desire|bed|breathless|hungry|bare|skin|heat)\b/g) ?? []).length,
    tension: (text.match(/\b(rival(?:s|ry)?|jealous(?:y)?|enemy|enemies|forbidden|secret|secrets|danger(?:ous)?|risk|betray(?:al)?|hate|tension|confront(?:ation)?)\b/g) ?? []).length,
    playful: (text.match(/\b(banter|teas(?:e|es|ing)|flirt(?:s|ing)?|laugh(?:s|ing|ed)?|jok(?:e|es|ing)|grin(?:s|ning)?|smirk(?:s|ing)?|mischief|playful|ridiculous)\b/g) ?? []).length,
  };
  return (Object.keys(scores) as SceneMusicMood[]).sort((a,b) => scores[b]-scores[a])[0];
}
/** Avoid recent choices, then rotate the least recently used within this mood. */
export function chooseSceneTrack(mood:SceneMusicMood, key:string, recent:string[]=[], excluded:string[]=[]):SocialTrack {
  const pool = SOCIAL_TRACKS.filter(t => !t.legacy && t.mood === mood);
  if (!pool.length) throw Error('No soundtrack is available for this mood.');
  let candidates = pool.filter(t => !excluded.includes(t.id));
  if (!candidates.length) candidates = pool.filter(t => t.id !== excluded.at(-1));
  if (!candidates.length) candidates = pool;
  const recency = (id:string) => {const i=recent.indexOf(id); return i<0 ? recent.length+1 : i;};
  const oldest = Math.max(...candidates.map(t => recency(t.id)));
  candidates = candidates.filter(t => recency(t.id) === oldest);
  return candidates[hashKey(key + ':' + excluded.join(',')) % candidates.length];
}
export function chooseSocialTrack(key:string, postType:string):SocialTrack {
  const mood:SceneMusicMood = postType === 'humour' || postType === 'reader_engagement' ? 'playful' : postType === 'character_conflict' ? 'tension' : 'romantic';
  return chooseSceneTrack(mood,key);
}
