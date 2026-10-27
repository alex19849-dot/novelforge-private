"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PublishingPanel from './PublishingPanel';
import { musicForPath } from '../../lib/social-music';
import { readyForApproval } from '../../lib/social-approval';
import { addDays, calendarDays, calendarError, londonDate, londonSchedule, londonTime, POST_LABELS, POST_TYPES, SOCIAL_PLATFORMS } from '../../lib/social-calendar';
import type { CalendarPost, CalendarSeed, SocialPlatform } from '../../lib/social-calendar';

type BackgroundJob = { id:string; start_date:string; job_type:'plan'|'media'; operation?:string; status:'generating'|'completed'|'failed'|'paused'; completed_tasks:number; total_tasks:number; created_count:number; error_message:string; cancel_requested:boolean };

type Book = { slug: string; title: string };
type Editor = {
  id: string; existing: CalendarPost | null; campaignId: string; bookSlug: string; bookTitle: string;
  platform: SocialPlatform; postType: string; title: string; caption: string; hashtags: string;
  date: string; time: string; source?: string; mediaType: 'image' | 'video' | null; mimeType?: string;
  file?: File; mediaBlob?: Blob; removeMedia: boolean;
  creativeBrief: string; plannedMediaType: 'image' | 'video' | '';
};
const inputClass = 'mt-1 w-full rounded-xl border border-white/15 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-pink-500';
const buttonClass = 'rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40';
const editable = (post: CalendarPost) => ['draft', 'approved'].includes(post.status);

export default function SocialCalendar({ books, seed, onSeedUsed }: { books: Book[]; seed: CalendarSeed | null; onSeedUsed: () => void }) {
  const [publishingEnabled,setPublishingEnabled] = useState(false);
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [start, setStart] = useState(() => londonDate());
  const [selected, setSelected] = useState(() => londonDate());
  const [platform, setPlatform] = useState('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approve'|'undo'|null>(null);
  const [undoBatch, setUndoBatch] = useState<CalendarPost[]>([]);
  const [planStart, setPlanStart] = useState(() => londonDate());
  const [planBook, setPlanBook] = useState('all');
  const [planPlatforms, setPlanPlatforms] = useState<SocialPlatform[]>([...SOCIAL_PLATFORMS]);
  const [planGuidance, setPlanGuidance] = useState('');
  const [planning, setPlanning] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [job, setJob] = useState<BackgroundJob | null>(null);
  const generatingRef = useRef(false);
  const savingRef = useRef(false);
  const accountRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const initialRangeRef = useRef(false);
  const writeRevisionRef = useRef(0);
  const days = useMemo(() => calendarDays(start), [start]);
  const visiblePosts = useMemo(() => posts.filter(post => platform === 'all' || post.platform === platform), [posts, platform]);
  const postsByDate = useMemo(() => {
    const groups = new Map<string, CalendarPost[]>();
    for (const post of visiblePosts) {
      if (!post.scheduled_at) continue;
      const date = londonDate(post.scheduled_at);
      groups.set(date, [...(groups.get(date) ?? []), post]);
    }
    return groups;
  }, [visiblePosts]);
  const approvalDrafts = visiblePosts.filter(post => post.status === 'draft' && (!post.scheduled_at || Date.parse(post.scheduled_at) > Date.now()));
  const readyPosts = approvalDrafts.filter(post => readyForApproval(post));
  const musicNeeded = posts.filter(post=>post.platform==='tiktok' && ['draft','approved'].includes(post.status) && post.media_path && post.scheduled_at && Date.parse(post.scheduled_at)>Date.now() && !musicForPath(post.media_path)).length;
  const blockedDrafts = approvalDrafts.length - readyPosts.length;
  const reviewArtworkCount = new Set(posts.filter(post => post.quality_notes?.trim()).map(post => post.media_path || post.id)).size;
  const reviewGroups = useMemo(() => {
    const flaggedAssets = new Set(posts.filter(post => post.quality_notes?.trim()).map(post => post.media_path || post.id));
    const groups = new Map<string, CalendarPost[]>();
    for(const post of visiblePosts) {
      const key = post.media_path || post.id;
      if(flaggedAssets.has(key)) groups.set(key,[...(groups.get(key) ?? []),post]);
    }
    return groups;
  },[posts,visiblePosts]);
  const reviewPosts = [...reviewGroups.values()].map(group => group.find(post => post.quality_notes?.trim()) ?? group[0]);
  const selectedPosts = postsByDate.get(selected) ?? [];
  const drafts = useMemo(() => visiblePosts.filter(post => !post.scheduled_at), [visiblePosts]);
  const missingMediaGroups = useMemo(() => new Set(posts.filter(post => post.status === 'draft' && post.planned_media_type && !post.media_path && post.scheduled_at && londonDate(post.scheduled_at) >= start && londonDate(post.scheduled_at) < addDays(start, 30)).map(post => `${post.campaign_id}:${post.platform === 'tiktok' ? 'portrait' : 'feed'}:${post.planned_media_type}:${post.creative_brief}`)).size, [posts, start]);

  async function load(silent = false) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const readRevision = writeRevisionRef.current;
    if (!silent) { setLoading(true); setError(''); }
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sign in to NovelForge to load your calendar.');
      accountRef.current = data.user.id;
      const { data: rows, error: queryError } = await supabase.from('social_posts').select('*').eq('user_id', data.user.id).order('scheduled_at', { ascending: true, nullsFirst: false });
      if (queryError) throw new Error(calendarError(queryError));
      if (accountRef.current === data.user.id && readRevision === writeRevisionRef.current) setPosts(rows ?? []);
      const { data: session } = await supabase.auth.getSession();
      if (session.session) {
        const response = await fetch('/api/social-studio/jobs', { headers: {Authorization:`Bearer ${session.session.access_token}`}, cache:'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Background progress could not be loaded.');
        if (accountRef.current === data.user.id) {
          const current = result.job as BackgroundJob | null;
          setJob(current);
          if(!initialRangeRef.current) {
            initialRangeRef.current = true;
            if(current?.start_date && addDays(current.start_date,30) > londonDate()) {
              setStart(current.start_date); setSelected(current.start_date > londonDate() ? current.start_date : londonDate());
            }
          }
          if(current && current.status !== 'generating') setNotice(previous => previous.startsWith('Generation started in the background.') ? '' : previous);
          const active = current?.status === 'generating';
          generatingRef.current = active;
          setPlanning(active && current?.job_type === 'plan');
          setMediaBusy(active && current?.job_type === 'media');
        }
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Your calendar could not be loaded.'); }
    finally { loadingRef.current = false; if (!silent) setLoading(false); }
  }
  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session || (accountRef.current && accountRef.current !== session.user.id)) {
        setPosts([]); setEditor(null); setJob(null); setUndoBatch([]); setReviewOnly(false); initialRangeRef.current = false; setPlanning(false); setMediaBusy(false); generatingRef.current = false; accountRef.current = null;
      }
    });
    const interval = window.setInterval(() => { void load(true); }, 10000);
    const onFocus = () => { void load(true); };
    window.addEventListener('focus', onFocus);
    return () => { data.subscription.unsubscribe(); window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, []);

  async function notifyPublisher() {
    try {const {data}=await supabase.auth.getSession();if(data.session) await fetch('/api/social-studio/publishing',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'wake'}),signal:AbortSignal.timeout(8000)});}catch{/* The background publisher also checks for missed notifications. */}
  }

  function fresh(date = selected, initial?: CalendarSeed): Editor {
    return {
      id: crypto.randomUUID(), existing: null, campaignId: crypto.randomUUID(), bookSlug: initial?.book_slug ?? '', bookTitle: initial?.book_title ?? '',
      platform: initial?.platform ?? 'facebook', postType: initial?.media_type === 'video' ? 'video' : 'premise_hook',
      title: initial?.title ?? '', caption: initial?.caption ?? '', hashtags: initial?.hashtags.join(' ') ?? '', date, time: '19:00',
      source: initial?.mediaSource, mediaBlob: initial?.mediaBlob, mediaType: initial?.media_type ?? null, mimeType: initial?.mimeType, removeMedia: false,
      creativeBrief: '', plannedMediaType: initial?.media_type ?? '',
    };
  }
  useEffect(() => {
    if (!seed || generatingRef.current) return;
    // Do not silently replace an editor that contains unsaved work.
    if (editor) return;
    setEditor(fresh(selected, seed)); setNotice(''); setError(''); onSeedUsed();
    document.getElementById('social-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [seed, editor, planning, mediaBusy]);

  function edit(post: CalendarPost) {
    if (editor || savingRef.current || generatingRef.current) return;
    setEditor({
      id: post.id, existing: post, campaignId: post.campaign_id, bookSlug: post.book_slug, bookTitle: post.book_title,
      platform: post.platform, postType: post.post_type, title: post.title, caption: post.caption, hashtags: post.hashtags.join(' '),
      date: post.scheduled_at ? londonDate(post.scheduled_at) : '', time: post.scheduled_at ? londonTime(post.scheduled_at) : '19:00',
      mediaType: post.media_type, removeMedia: false,
      creativeBrief: post.creative_brief ?? '', plannedMediaType: post.planned_media_type ?? '',
    });
    setError(''); setNotice(''); setConfirmDelete(false);
  }
  function field<K extends keyof Editor>(key: K, value: Editor[K]) { setEditor(current => current ? { ...current, [key]: value } : null); }

  async function save(approve: boolean) {
    if (!editor || savingRef.current || generatingRef.current) return;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    let uploadedPath: string | null = null;
    let databaseAttempted = false;
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error('Sign in again before saving your post.');
      const scheduledAt = editor.date ? londonSchedule(editor.date, editor.time) : null;
      if (approve && (!scheduledAt || Date.parse(scheduledAt) <= Date.now())) throw new Error('Choose a future date and time before approving.');
      if (approve && !editor.caption.trim()) throw new Error('Add a caption before approving.');
      if (editor.title.length > 240 || editor.caption.length > 10000) throw new Error('Keep the title within 240 characters and caption within 10,000.');
      const hashtags = [...new Set(editor.hashtags.split(/\s+/).filter(Boolean).map(tag => tag.startsWith('#') ? tag : `#${tag}`))];
      const captionLength = [editor.caption, hashtags.join(' ')].join('\n\n').length;
      if (approve && captionLength > (editor.platform === 'instagram' ? 2196 : editor.platform === 'tiktok' && editor.mediaType === 'video' ? 2200 : editor.platform === 'tiktok' ? 4000 : 5000)) throw new Error('The caption and hashtags are too long for this platform. Shorten them before approving.');
      let mediaPath = editor.removeMedia ? null : editor.existing?.media_path ?? null;
      let mediaType = editor.removeMedia ? null : editor.mediaType;
      if (editor.file || editor.mediaBlob || editor.source) {
        const blob = editor.file ?? editor.mediaBlob ?? await (await fetch(editor.source!)).blob();
        const mime = editor.file?.type || editor.mimeType || blob.type;
        if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(mime)) throw new Error('Use JPG, PNG, WebP or MP4. Rebuild WebM animations as MP4 before saving.');
        if (blob.size > 50 * 1024 * 1024) throw new Error('Use a media file smaller than 50 MB.');
        const extension = mime === 'video/mp4' ? 'mp4' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        uploadedPath = `${data.user.id}/calendar/${editor.id}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('social-media').upload(uploadedPath, blob, { contentType: mime, upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        mediaPath = uploadedPath; mediaType = mime.startsWith('video/') ? 'video' : 'image';
      }
      if (approve && editor.platform !== 'facebook' && !mediaPath) throw new Error('Instagram and TikTok need an image or video before approval.');
      const values = {
        book_slug: editor.bookSlug, book_title: editor.bookTitle, platform: editor.platform, post_type: editor.postType,
        title: editor.title.trim(), caption: editor.caption.trim(), hashtags, media_path: mediaPath, media_type: mediaType,
        scheduled_at: scheduledAt, status: approve ? 'approved' : 'draft',
        creative_brief: editor.creativeBrief.trim(), planned_media_type: editor.plannedMediaType || null,
      };
      databaseAttempted = true;
      const result = editor.existing
        ? await supabase.from('social_posts').update(values).eq('id', editor.id).eq('user_id', data.user.id).eq('version', editor.existing.version).in('status', ['draft', 'approved']).select().single()
        : await supabase.from('social_posts').insert({ ...values, id: editor.id, campaign_id: editor.campaignId, user_id: data.user.id }).select().single();
      if (result.error) throw new Error(result.error.code === 'PGRST116' ? 'This post changed in another tab. Close the editor and refresh the calendar before editing again.' : calendarError(result.error));
      const post = result.data as CalendarPost;
      setPosts(current => [...current.filter(item => item.id !== post.id), post]);
      if (editor.date) { setSelected(editor.date); if (!days.includes(editor.date)) setStart(editor.date); }
      setEditor(null); setNotice(approve ? `Approved and saved.${publishingEnabled?' It will publish automatically at the saved time.':' Enable automatic publishing when ready.'}` : 'Draft saved to your calendar.');
      void notifyPublisher();
    } catch (failure) {
      // A database timeout may have committed successfully. Keep its media rather than risk breaking that post.
      if (uploadedPath && !databaseAttempted) await supabase.storage.from('social-media').remove([uploadedPath]);
      setError(failure instanceof Error ? failure.message : 'Your post could not be saved.');
    } finally { savingRef.current = false; setSaving(false); }
  }
  async function setBatchApproval(approve:boolean) {
    if(savingRef.current || generatingRef.current || editor) return;
    const batch = approve ? readyPosts.filter(post => readyForApproval(post)) : undoBatch;
    if(!batch.length) return;
    writeRevisionRef.current += 1;
    savingRef.current = true; setSaving(true); setBulkAction(approve?'approve':'undo'); setError(''); setNotice('');
    try {
      const {data:auth} = await supabase.auth.getUser();
      if(!auth.user) throw new Error('Sign in again before approving posts.');
      const accountId = auth.user.id;
      const {data,error:batchError} = await supabase.rpc('social_set_ready_posts_approval', {
        p_posts:batch.map(post=>({id:post.id,version:post.version})),p_approve:approve,
      });
      if(batchError) throw new Error(batchError.code==='PGRST202'?'Bulk approval is being deployed. Refresh in a moment.':calendarError(batchError));
      if(accountRef.current !== accountId) return;
      writeRevisionRef.current += 1;
      const changed = (data ?? []) as CalendarPost[];
      const byId = new Map(changed.map(post=>[post.id,post]));
      setPosts(current=>current.map(post=>byId.get(post.id) ?? post));
      setUndoBatch(approve ? changed : []);
      const skipped = batch.length - changed.length;
      setNotice(approve
        ? `${changed.length} posts approved in one go.${skipped ? ` ${skipped} changed or were not ready and were left untouched.` : ''} You can still edit them.${publishingEnabled?' They will publish automatically at their saved times.':' Enable automatic publishing when ready.'}`
        : `${changed.length} posts returned to drafts.${skipped ? ` ${skipped} changed since approval and were left untouched.` : ''}`);
      void notifyPublisher();
      if(skipped) await load(true);
    } catch(failure) { setError(failure instanceof Error ? failure.message : 'The posts could not be updated.'); }
    finally { savingRef.current = false; setSaving(false); setBulkAction(null); }
  }

  async function remove() {
    if (!editor?.existing || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const { data, error: deleteError } = await supabase.from('social_posts').delete().eq('id', editor.id).eq('version', editor.existing.version).in('status', ['draft', 'approved']).select('id').single();
      if (deleteError || !data) throw new Error('This post could not be deleted. It may have changed in another tab. Refresh the calendar.');
      setPosts(current => current.filter(post => post.id !== editor.id)); setEditor(null); setNotice('Draft deleted.'); setConfirmDelete(false); void notifyPublisher();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Deletion failed.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function startGeneration(kind:'plan'|'media'|'music', onlyPost?:CalendarPost) {
    if (generatingRef.current || savingRef.current || editor) return;
    generatingRef.current = true; setError(''); setNotice('');
    if (kind === 'plan') setPlanning(true); else setMediaBusy(true);
    const firstDay = kind === 'plan' ? planStart : start;
    let accepted = false;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sign in again before starting generation.');
      const storageKey = `novelforge-background:${data.session.user.id}:${kind}:${firstDay}:${onlyPost?.id ?? 'all'}`;
      const runId = localStorage.getItem(storageKey) || crypto.randomUUID();
      localStorage.setItem(storageKey, runId);
      const response = await fetch(`/api/social-studio/${kind}`, {
        method:'POST', headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify({runId,start:firstDay,platforms:planPlatforms,books:planBook === 'all' ? [] : [planBook],guidance:planGuidance,postId:onlyPost?.id}),
        signal:AbortSignal.timeout(55000),
      });
      const result = await response.json();
      if (!response.ok) { if(response.status !== 504) localStorage.removeItem(storageKey); throw new Error(result.error || 'The job could not be started.'); }
      localStorage.removeItem(storageKey);
      accepted = result.status === 'generating';
      if (kind === 'plan') { setStart(firstDay); setSelected(firstDay); }
      setNotice(result.message || (accepted ? 'Generation started in the background. You can leave NovelForge or close this tab. Your progress and completed posts are saved automatically.' : 'This job has already finished. Refresh to see its saved results.'));
      await load(true);
    } catch(failure) {
      setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'The start request timed out. Refresh to check whether your background job started before pressing Generate again.');
    } finally {
      if (!accepted) { generatingRef.current = false; setPlanning(false); setMediaBusy(false); }
    }
  }
  const generateMonth = () => startGeneration('plan');
  const generateMedia = (post?:CalendarPost) => startGeneration('media',post);
  async function pauseGeneration() {
    if (!job) return;
    try {
      const {data} = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sign in to pause this job.');
      const response = await fetch('/api/social-studio/jobs',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({runId:job.id})});
      const result = await response.json();
      if(!response.ok) throw new Error(result.error);
      await load(true); setNotice('Pausing after the current item. Completed posts and media will be kept.');
    } catch(failure) { setError(failure instanceof Error ? failure.message : 'The job could not be paused.'); }
  }

  function card(post: CalendarPost) {
    const url = post.media_path ? supabase.storage.from('social-media').getPublicUrl(post.media_path).data.publicUrl : null;
    const related = reviewOnly ? (reviewGroups.get(post.media_path || post.id) ?? [post]) : [post];
    return <article key={post.id} className="rounded-xl border border-white/10 bg-neutral-950 p-4">
      {reviewOnly && <p className="mb-2 text-sm font-semibold text-amber-200">{post.scheduled_at ? new Date(post.scheduled_at).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}) : 'Undated draft'}</p>}
      <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold capitalize">{post.platform} · {post.scheduled_at ? londonTime(post.scheduled_at) : 'No date'}</span><span className="rounded-full bg-white/10 px-2 py-1 text-xs capitalize">{post.status==='approved'&&publishingEnabled?'Scheduled':post.status}</span></div>
      <p className="mt-2 text-sm text-pink-300">{post.book_title || 'General reader post'} · {POST_LABELS[post.post_type]}</p>
      {reviewOnly && related.length > 1 && <p className="mt-2 text-sm text-neutral-400">Shared artwork: {related.map(item=>item.platform).join(', ')}. Each platform caption is listed below.</p>}
      {post.title && <h4 className="mt-2 font-semibold">{post.title}</h4>}
      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{post.caption || 'Caption to write'}</p>
      <p className="mt-2 break-words text-sm text-pink-300">{post.hashtags.join(' ')}</p>
      {url && (post.media_type === 'video' ? <video src={url} controls preload="none" className="mt-3 max-h-64 rounded-lg" /> : <img src={url} loading="lazy" alt={post.title || 'Post artwork'} className="mt-3 max-h-64 rounded-lg" />)}
      {musicForPath(post.media_path) && <p className="mt-2 text-xs text-emerald-300">Music included: {musicForPath(post.media_path)!.title} · Licensed backing track</p>}
      {post.quality_notes && <p className="mt-3 text-sm text-amber-200">Artwork review: {post.quality_notes}</p>}
      {reviewOnly && related.filter(item=>item.id!==post.id).map(item=><details key={item.id} className="mt-3 rounded-lg border border-white/10 p-3 text-sm">
        <summary className="cursor-pointer font-semibold capitalize">{item.platform} · {item.scheduled_at ? new Date(item.scheduled_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Europe/London'})+' · '+londonTime(item.scheduled_at) : 'No date'}</summary>
        <p className="mt-2 font-semibold">{item.title}</p><p className="mt-2 whitespace-pre-wrap text-neutral-300">{item.caption}</p><p className="mt-2 text-pink-300">{item.hashtags.join(' ')}</p>
        {item.quality_notes && item.quality_notes!==post.quality_notes && <p className="mt-2 text-amber-200">Artwork review: {item.quality_notes}</p>}
        {editable(item) && <button type="button" disabled={Boolean(editor) || saving || planning || mediaBusy} onClick={()=>edit(item)} className={`${buttonClass} mt-3`}>Edit {item.platform} post</button>}
      </details>)}
      {post.creative_brief && <details className="mt-3 text-sm text-neutral-400"><summary className="cursor-pointer">AI creative brief</summary><p className="mt-2 whitespace-pre-wrap">{post.creative_brief}</p></details>}
      {post.status === 'draft' && post.planned_media_type && !post.media_path && <button type="button" disabled={Boolean(editor) || saving || planning || mediaBusy} onClick={() => void generateMedia(post)} className={`${buttonClass} mt-3 mr-3 bg-violet-600`}>AI: create {post.planned_media_type === 'video' ? 'video' : 'artwork'}</button>}
      {editable(post) && <button type="button" disabled={Boolean(editor) || saving || planning || mediaBusy} onClick={() => edit(post)} className={`${buttonClass} mt-3`}>Edit / reschedule</button>}
    </article>;
  }

  return <section id="social-calendar" aria-labelledby="calendar-title" className="mb-7 scroll-mt-28 rounded-2xl border border-pink-500/30 bg-neutral-900 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Plan ahead</p><h2 id="calendar-title" className="mt-1 text-2xl font-bold">Your 30-day calendar</h2><p className="mt-2 text-sm text-neutral-400">Let your AI create the month, then review and approve its posts. Times are UK time. Approved posts publish automatically when automatic publishing is on.</p></div>
      <div className="flex gap-2"><button type="button" disabled={Boolean(editor) || saving || loading || planning || mediaBusy} onClick={() => { setEditor(fresh()); setConfirmDelete(false); setNotice(''); }} className="rounded-xl bg-pink-500 px-4 py-3 font-semibold hover:bg-pink-400 disabled:opacity-40">Manual draft</button><button type="button" disabled={loading || saving || Boolean(editor) || planning || mediaBusy} onClick={() => void load()} className={buttonClass}>Refresh</button></div>
    </div>
    <PublishingPanel posts={posts} onEnabledChange={setPublishingEnabled} onReload={()=>void load(true)} />
    <p className="mt-3 text-xs text-neutral-400">Posting times reviewed 27 October: Facebook and TikTok use the strongest available Metricool timing scores for each weekday. Instagram stays at 7 pm while useful audience data builds. These are starting points, not guaranteed results. You can edit individual times.</p>
    <div className="mt-4 rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
      <h3 className="font-bold">TikTok backing music</h3>
      <p className="mt-2 text-sm text-neutral-300">New AI TikTok posts automatically become short videos with licensed music. Existing posters and silent clips can be prepared together in the background. Captions, dates and approvals are kept.</p>
      <button type="button" disabled={loading || saving || planning || mediaBusy || Boolean(editor) || !musicNeeded} onClick={()=>void startGeneration('music')} className={`${buttonClass} mt-3 bg-violet-600`}>{job?.status==='generating' && job.operation==='music' ? 'Adding music in the background...' : `Add music to all TikTok posts (${musicNeeded})`}</button>
    </div>
    <div className="mt-4 flex flex-wrap gap-3" aria-label="Calendar views">
      <button type="button" aria-pressed={!reviewOnly} disabled={saving || Boolean(editor)} onClick={()=>setReviewOnly(false)} className={`${buttonClass} ${!reviewOnly?'border-pink-400 bg-pink-500/15':''}`}>Calendar</button>
      <button type="button" aria-pressed={reviewOnly} disabled={saving || Boolean(editor)} onClick={()=>{setReviewOnly(true);setPlatform('all');}} className={`${buttonClass} border-amber-400/40 ${reviewOnly?'bg-amber-500/15':''}`}>Needs review ({reviewArtworkCount} {reviewArtworkCount===1?'poster':'posters'})</button>
    </div>
    {!reviewOnly && <div className="mt-5 rounded-2xl border border-pink-500/25 bg-pink-500/5 p-4">
      <h3 className="text-lg font-bold">Let your AI create the month</h3>
      <p className="mt-2 text-sm text-neutral-300">30 book-specific daily ideas, with separate captions and five hashtags for each selected platform. Hooks, tropes, character conflict, humour, reader questions and promotion are mixed automatically.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">First posting day<input type="date" value={planStart} min={londonDate()} onChange={event => setPlanStart(event.target.value)} disabled={planning || mediaBusy} className={inputClass} /></label>
        <label className="text-sm">Books to feature<select value={planBook} onChange={event => setPlanBook(event.target.value)} disabled={planning || mediaBusy} className={inputClass}><option value="all">Rotate all my books</option>{books.map(book => <option key={book.slug} value={book.slug}>{book.title}</option>)}</select></label>
        <fieldset className="flex flex-wrap gap-4 sm:col-span-2" disabled={planning || mediaBusy}><legend className="mb-2 text-sm">Platforms</legend>{SOCIAL_PLATFORMS.map(value => <label className="flex items-center gap-2 text-sm capitalize" key={value}><input type="checkbox" checked={planPlatforms.includes(value)} onChange={event => setPlanPlatforms(current => event.target.checked ? [...current,value] : current.filter(item => item !== value))} />{value}</label>)}</fieldset>
        <label className="text-sm sm:col-span-2">Extra direction (optional)<textarea rows={3} maxLength={3000} value={planGuidance} onChange={event => setPlanGuidance(event.target.value)} disabled={planning || mediaBusy} placeholder="For example, focus on my hockey books, use more jealousy hooks, or promote a specific release..." className={inputClass} /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={planning || mediaBusy || saving || Boolean(editor) || loading || !books.length || !planPlatforms.length} onClick={() => void generateMonth()} className="rounded-xl bg-pink-500 px-5 py-3 font-bold hover:bg-pink-400 disabled:opacity-40">{planning ? 'AI is creating your 30 days...' : 'Generate 30 days'}</button>
        <button type="button" disabled={planning || mediaBusy || saving || Boolean(editor) || loading || !missingMediaGroups} onClick={() => void generateMedia()} className="rounded-xl bg-violet-600 px-5 py-3 font-bold hover:bg-violet-500 disabled:opacity-40">Generate missing artwork/videos ({missingMediaGroups})</button>
        {job?.status === 'generating' && <button type="button" disabled={job.cancel_requested} onClick={() => void pauseGeneration()} className={buttonClass}>{job.cancel_requested ? 'Pausing after current item...' : 'Pause after current item'}</button>}
      </div>
      <p className="mt-3 text-xs text-neutral-400">Uses your existing AI API credits. Copy is saved first; artwork/video generation is a separate paid AI step. The button shows how many media items it will create (up to 60 for a full month across all three networks). Generation runs in the background. You can leave this page or close the tab. Completed content is saved automatically; pause and resume missing items whenever you like. Existing dates are kept, and nothing is published automatically yet.</p>
      {job && <div role="status" className="mt-3 rounded-xl border border-white/15 p-3 text-sm">
        <p className="font-semibold">{job.operation === 'music' ? 'Adding backing music' : job.job_type === 'plan' ? '30-day content' : 'Artwork / videos'}: {job.status === 'generating' ? 'running in the background' : job.status}</p>
        <p className="mt-1 text-neutral-300">{job.completed_tasks} of {job.total_tasks} {job.operation === 'music' ? 'soundtracks' : job.job_type === 'plan' ? 'batches' : 'media items'} saved{job.job_type === 'plan' ? ` · ${job.created_count} platform drafts` : ''}.</p>
        {job.status === 'generating' && <p className="mt-1 text-emerald-300">You can close NovelForge. Come back later to review the results.</p>}
        {job.error_message && <p className="mt-2 text-amber-200">{job.error_message} {!job.error_message.includes('image service blocked') && 'Use Generate again to fill missing dates or media.'}</p>}
        {job.status === 'paused' && <p className="mt-2 text-neutral-300">Saved items are kept. Use Generate again to fill missing dates or media.</p>}
      </div>}
    </div>}
    <div aria-live="polite">{error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}{notice && <p className="mt-4 text-sm text-emerald-300">{notice}</p>}{seed && editor && <p className="mt-3 text-sm text-amber-200">A generated post is waiting. Save or close your current editor to open it.</p>}</div>
    {!reviewOnly && <>
    <div className="mt-5 flex flex-wrap items-end gap-3">
      <label className="text-sm">Calendar starts<input aria-label="Calendar start date" type="date" value={start} onChange={event => { if (event.target.value) { setStart(event.target.value); setSelected(event.target.value); } }} className={inputClass} /></label>
      <button type="button" className={buttonClass} onClick={() => { const date = addDays(start, -30); setStart(date); setSelected(date); }}>Previous 30 days</button>
      <button type="button" className={buttonClass} onClick={() => { const date = londonDate(); setStart(date); setSelected(date); }}>Today</button>
      <button type="button" className={buttonClass} onClick={() => { const date = addDays(start, 30); setStart(date); setSelected(date); }}>Next 30 days</button>
      <label className="text-sm">Platform<select value={platform} onChange={event => setPlatform(event.target.value)} className={inputClass}><option value="all">All platforms</option>{SOCIAL_PLATFORMS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={loading || saving || planning || mediaBusy || Boolean(editor) || !readyPosts.length} onClick={() => void setBatchApproval(true)} className="rounded-xl bg-emerald-600 px-5 py-3 font-bold hover:bg-emerald-500 disabled:opacity-40">{bulkAction==='approve' ? 'Approving your posts...' : `Approve all ready posts (${readyPosts.length})`}</button>
        {undoBatch.length > 0 && <button type="button" disabled={saving || planning || mediaBusy || Boolean(editor)} onClick={() => void setBatchApproval(false)} className={buttonClass}>{bulkAction==='undo' ? 'Undoing approval...' : 'Undo last bulk approval'}</button>}
      </div>
      <p className="mt-2 text-sm text-neutral-300">Approves all ready future drafts{platform==='all'?' across all platforms':` for ${platform}`}. Individual posts can still be edited.</p>
      {blockedDrafts > 0 && <p className="mt-2 text-sm text-amber-200">{blockedDrafts} draft{blockedDrafts===1?' needs':'s need'} a future time, a valid caption or missing media before approval.</p>}
    </div>
    </>}
    {loading ? <p className="mt-5 text-neutral-400">Loading your saved posts...</p> : reviewOnly ? <div id="social-review-list" className="mt-5" aria-labelledby="review-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h3 id="review-title" className="text-xl font-bold">Posts needing artwork review</h3><p className="mt-2 text-sm text-neutral-400">All dates together. Shared Facebook/Instagram artwork appears once, with both captions available.</p></div>
        <label className="text-sm">Platform<select value={platform} onChange={event=>setPlatform(event.target.value)} className={inputClass}><option value="all">All platforms</option>{SOCIAL_PLATFORMS.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{reviewPosts.map(card)}{!reviewPosts.length && <p className="text-sm text-neutral-300">No artwork review notes for these platforms.</p>}</div>
    </div> : <>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        {days.map(date => { const count = postsByDate.get(date)?.length ?? 0; return <button type="button" key={date} aria-pressed={selected === date} onClick={() => setSelected(date)} className={`min-h-24 rounded-xl border p-3 text-left ${selected === date ? 'border-pink-400 bg-pink-500/15' : 'border-white/10 bg-neutral-950 hover:border-white/30'}`}><span className="block text-xs text-neutral-400">{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', timeZone: 'UTC' })}</span><span className="mt-1 block text-lg font-bold">{Number(date.slice(-2))}</span><span className="mt-1 block text-xs text-pink-300">{count ? `${count} post${count === 1 ? '' : 's'}` : 'Empty'}</span></button>; })}
      </div>
      <h3 className="mt-6 font-semibold">{new Date(`${selected}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{selectedPosts.map(card)}{!selectedPosts.length && <p className="text-sm text-neutral-400">No posts planned for this day. Add a draft or save a generated poster here.</p>}</div>
      {drafts.length > 0 && <details className="mt-5"><summary className="cursor-pointer font-semibold">Undated drafts ({drafts.length})</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{drafts.map(card)}</div></details>}
    </>}
    {editor && <form onSubmit={event => { event.preventDefault(); void save(false); }} className="mt-6 space-y-4 rounded-2xl border border-pink-400/30 bg-neutral-950 p-4 sm:p-5">
      <h3 className="text-xl font-bold">{editor.existing ? 'Edit calendar post' : 'New calendar post'}</h3>
      <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Book<select value={editor.bookSlug} onChange={event => { const book = books.find(item => item.slug === event.target.value); setEditor(current => current ? { ...current, bookSlug: book?.slug ?? '', bookTitle: book?.title ?? '' } : null); }} className={inputClass}><option value="">General reader post</option>{editor.bookSlug && !books.some(book => book.slug === editor.bookSlug) && <option value={editor.bookSlug}>{editor.bookTitle}</option>}{books.map(book => <option key={book.slug} value={book.slug}>{book.title}</option>)}</select></label>
        <label className="text-sm">Platform<select value={editor.platform} onChange={event => field('platform', event.target.value as SocialPlatform)} className={inputClass}>{SOCIAL_PLATFORMS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-sm">Post type<select value={editor.postType} onChange={event => field('postType', event.target.value)} className={inputClass}>{POST_TYPES.map(type => <option key={type} value={type}>{POST_LABELS[type]}</option>)}</select></label>
        <label className="text-sm">Date (leave blank for an undated draft)<input type="date" value={editor.date} onChange={event => field('date', event.target.value)} className={inputClass} /></label>
        <label className="text-sm">Time (UK)<input type="time" value={editor.time} onChange={event => field('time', event.target.value)} className={inputClass} /></label>
        <label className="text-sm">Title / TikTok photo title<input maxLength={240} value={editor.title} onChange={event => field('title', event.target.value)} className={inputClass} /></label>
        <label className="text-sm sm:col-span-2">Caption<textarea rows={6} maxLength={10000} value={editor.caption} onChange={event => field('caption', event.target.value)} className={inputClass} /></label>
        <label className="text-sm sm:col-span-2">Hashtags<input value={editor.hashtags} onChange={event => field('hashtags', event.target.value)} className={inputClass} /></label>
        <label className="text-sm">AI media format<select value={editor.plannedMediaType} onChange={event => field('plannedMediaType', event.target.value as Editor['plannedMediaType'])} className={inputClass}><option value="">Text only</option><option value="image">Image</option><option value="video">Animated video</option></select></label>
        <label className="text-sm sm:col-span-2">AI creative brief<textarea rows={4} maxLength={5000} value={editor.creativeBrief} onChange={event => field('creativeBrief', event.target.value)} className={inputClass} /></label>
        <label className="text-sm sm:col-span-2">Image or MP4 video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={event => { const file = event.target.files?.[0]; if (file) setEditor(current => current ? { ...current, file, mediaBlob: undefined, source: undefined, removeMedia: false, mediaType: file.type.startsWith('video/') ? 'video' : 'image' } : null); }} className={inputClass} /></label>
        <div className="text-sm text-neutral-400 sm:col-span-2">{editor.file ? editor.file.name : editor.source ? 'Generated media will be saved with this draft.' : editor.existing?.media_path && !editor.removeMedia ? 'Existing media is attached.' : 'No media attached.'}{(editor.source || editor.file || editor.existing?.media_path) && !editor.removeMedia && <button type="button" className="ml-3 underline" onClick={() => setEditor(current => current ? { ...current, file: undefined, mediaBlob: undefined, source: undefined, mediaType: null, removeMedia: true } : null)}>Remove attachment</button>}</div>
      </fieldset>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={saving} className={buttonClass}>{saving ? 'Saving...' : 'Save draft'}</button><button type="button" disabled={saving} onClick={() => void save(true)} className="rounded-xl bg-pink-500 px-4 py-2 font-semibold disabled:opacity-40">Save and approve</button><button type="button" disabled={saving} onClick={() => { setEditor(null); setConfirmDelete(false); }} className={buttonClass}>Cancel</button>{editor.existing && <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className={`${buttonClass} text-red-300`}>Delete draft</button>}</div>
      {confirmDelete && <div className="rounded-xl border border-red-400/30 p-3"><p className="text-sm">Delete this saved post?</p><div className="mt-2 flex gap-3"><button type="button" disabled={saving} onClick={() => void remove()} className={`${buttonClass} text-red-300`}>Delete post</button><button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className={buttonClass}>Keep post</button></div></div>}
      <p className="text-xs text-neutral-500">Approval makes this post eligible for automatic publishing at its saved time when automatic publishing is on.</p>
    </form>}
  </section>;
}
