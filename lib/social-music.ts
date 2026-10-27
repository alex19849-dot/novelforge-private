// Metadata only: safe to import in the calendar. Audio stays on the server.
export const MUSIC_VERSION = 1;
export const SOCIAL_TRACKS = [
  { id: 'sun-in-your-eyes', title: 'Sun in Your Eyes', artist: 'Alejandro Magaña (A. M.)', file: 'sun-in-your-eyes.m4a', source: 'https://assets.mixkit.co/music/131/131.mp3' },
  { id: 'lonerism', title: 'Lonerism', artist: 'Alejandro Magaña (A. M.)', file: 'lonerism.m4a', source: 'https://assets.mixkit.co/music/159/159.mp3' },
  { id: 'better-times', title: 'Better Times are Coming', artist: 'Alejandro Magaña (A. M.)', file: 'better-times.m4a', source: 'https://assets.mixkit.co/music/173/173.mp3' },
] as const;
export type SocialTrack = typeof SOCIAL_TRACKS[number];
export const MUSIC_LICENSE = 'https://mixkit.co/license/#musicFree';
export function musicForPath(path: string | null | undefined): SocialTrack | undefined {
  return SOCIAL_TRACKS.find(track => path?.endsWith(`-music-v${MUSIC_VERSION}-${track.id}.mp4`));
}
export function chooseSocialTrack(key: string, postType: string): SocialTrack {
  // A stable rotation means retries never change the soundtrack.
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const offset = postType === 'humour' || postType === 'reader_engagement' ? 2 : postType === 'character_conflict' ? 1 : 0;
  return SOCIAL_TRACKS[(hash + offset) % SOCIAL_TRACKS.length];
}
