import 'server-only';
import { jobAdmin } from './social-job-db';
import { SCENE_MOODS, inferSceneMusicMood, chooseSceneTrack, type SceneMusicMood } from './social-music';

/** Read only this owner's history. The returned choice is previewed before a render starts. */
export async function recommendSceneMusic(owner: string, body: any) {
  if (!body.plan || JSON.stringify(body.plan).length > 12000)
    throw Error('Choose a scene plan before matching its music.');
  const mood: SceneMusicMood = body.mood === 'auto' || !body.mood
    ? inferSceneMusicMood(body.plan)
    : body.mood;
  if (!SCENE_MOODS.some(m => m.id === mood)) throw Error('Choose an available music mood.');
  const found = await jobAdmin().from('social_creative_prompts')
    .select('id,poster_result').eq('user_id', owner).eq('recipe->>format', 'scene-slides')
    .order('created_at', {ascending:false}).limit(40);
  if (found.error) throw Error('Recent music could not be checked. Try matching again.');
  const history = (found.data ?? []).map(row => row.poster_result?.trackId ?? row.poster_result?.slidesRecovery?.trackId).filter(Boolean);
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((v:unknown) => typeof v === 'string').slice(-30) : [];
  const track = chooseSceneTrack(mood, String(body.promptId ?? JSON.stringify(body.plan)), history, exclude);
  return {trackId:track.id, mood};
}
