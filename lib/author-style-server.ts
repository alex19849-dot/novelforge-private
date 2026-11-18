import { createClient } from '@supabase/supabase-js';
import { jobAdmin } from './social-job-db';
import { EMPTY_STYLE, cleanStyleRules, styleContext, type StyleProfile } from './author-style';
export async function styleUser(request: Request) {
  const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  return error ? null : data.user;
}
export async function loadStyleProfile(userId: string): Promise<StyleProfile> {
  const {data,error}=await jobAdmin().from('author_style_profiles').select('enabled,rules,revision').eq('user_id',userId).maybeSingle();
  if(error) throw new Error('Your writing style profile could not be loaded.');
  return data ? {...data,rules:cleanStyleRules(data.rules)} : {...EMPTY_STYLE,rules:[]};
}
export async function approvedStyleFor(userId: string) {
  try { return styleContext(await loadStyleProfile(userId)); }
  catch { console.warn('Author preferences unavailable; continuing with existing writing instructions.'); return ''; }
}
export async function requestStyleContext(request: Request, fallback: unknown = '') {
  const user=await styleUser(request);
  if(user) return approvedStyleFor(user.id);
  // Internal workflow calls carry an account-scoped snapshot obtained when the job is queued.
  return typeof fallback==='string' ? fallback.slice(0,6500) : '';
}
