"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { addDays, calendarDays, calendarError, londonDate, londonSchedule, londonTime, POST_LABELS, POST_TYPES, SOCIAL_PLATFORMS } from '../../lib/social-calendar';
import type { CalendarPost, CalendarSeed, SocialPlatform } from '../../lib/social-calendar';

type Book = { slug: string; title: string };
type Editor = {
  id: string; existing: CalendarPost | null; campaignId: string; bookSlug: string; bookTitle: string;
  platform: SocialPlatform; postType: string; title: string; caption: string; hashtags: string;
  date: string; time: string; source?: string; mediaType: 'image' | 'video' | null; mimeType?: string;
  file?: File; mediaBlob?: Blob; removeMedia: boolean;
};
const inputClass = 'mt-1 w-full rounded-xl border border-white/15 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-pink-500';
const buttonClass = 'rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40';
const editable = (post: CalendarPost) => ['draft', 'approved'].includes(post.status);

export default function SocialCalendar({ books, seed, onSeedUsed }: { books: Book[]; seed: CalendarSeed | null; onSeedUsed: () => void }) {
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [start, setStart] = useState(() => londonDate());
  const [selected, setSelected] = useState(() => londonDate());
  const [platform, setPlatform] = useState('all');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savingRef = useRef(false);
  const accountRef = useRef<string | null>(null);
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
  const selectedPosts = postsByDate.get(selected) ?? [];
  const drafts = useMemo(() => visiblePosts.filter(post => !post.scheduled_at), [visiblePosts]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Sign in to NovelForge to load your calendar.');
      accountRef.current = data.user.id;
      const { data: rows, error: queryError } = await supabase.from('social_posts').select('*').eq('user_id', data.user.id).order('scheduled_at', { ascending: true, nullsFirst: false });
      if (queryError) throw new Error(calendarError(queryError));
      if (accountRef.current === data.user.id) setPosts(rows ?? []);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Your calendar could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session || (accountRef.current && accountRef.current !== session.user.id)) {
        setPosts([]); setEditor(null); accountRef.current = null;
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function fresh(date = selected, initial?: CalendarSeed): Editor {
    return {
      id: crypto.randomUUID(), existing: null, campaignId: crypto.randomUUID(), bookSlug: initial?.book_slug ?? '', bookTitle: initial?.book_title ?? '',
      platform: initial?.platform ?? 'facebook', postType: initial?.media_type === 'video' ? 'video' : 'premise_hook',
      title: initial?.title ?? '', caption: initial?.caption ?? '', hashtags: initial?.hashtags.join(' ') ?? '', date, time: '19:00',
      source: initial?.mediaSource, mediaBlob: initial?.mediaBlob, mediaType: initial?.media_type ?? null, mimeType: initial?.mimeType, removeMedia: false,
    };
  }
  useEffect(() => {
    if (!seed) return;
    // Do not silently replace an editor that contains unsaved work.
    if (editor) return;
    setEditor(fresh(selected, seed)); setNotice(''); setError(''); onSeedUsed();
    document.getElementById('social-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [seed, editor]);

  function edit(post: CalendarPost) {
    if (editor || savingRef.current) return;
    setEditor({
      id: post.id, existing: post, campaignId: post.campaign_id, bookSlug: post.book_slug, bookTitle: post.book_title,
      platform: post.platform, postType: post.post_type, title: post.title, caption: post.caption, hashtags: post.hashtags.join(' '),
      date: post.scheduled_at ? londonDate(post.scheduled_at) : '', time: post.scheduled_at ? londonTime(post.scheduled_at) : '19:00',
      mediaType: post.media_type, removeMedia: false,
    });
    setError(''); setNotice(''); setConfirmDelete(false);
  }
  function field<K extends keyof Editor>(key: K, value: Editor[K]) { setEditor(current => current ? { ...current, [key]: value } : null); }

  async function save(approve: boolean) {
    if (!editor || savingRef.current) return;
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
      };
      databaseAttempted = true;
      const result = editor.existing
        ? await supabase.from('social_posts').update(values).eq('id', editor.id).eq('user_id', data.user.id).eq('version', editor.existing.version).in('status', ['draft', 'approved']).select().single()
        : await supabase.from('social_posts').insert({ ...values, id: editor.id, campaign_id: editor.campaignId, user_id: data.user.id }).select().single();
      if (result.error) throw new Error(result.error.code === 'PGRST116' ? 'This post changed in another tab. Close the editor and refresh the calendar before editing again.' : calendarError(result.error));
      const post = result.data as CalendarPost;
      setPosts(current => [...current.filter(item => item.id !== post.id), post]);
      if (editor.date) { setSelected(editor.date); if (!days.includes(editor.date)) setStart(editor.date); }
      setEditor(null); setNotice(approve ? 'Approved and saved. Automatic publishing is not enabled yet.' : 'Draft saved to your calendar.');
    } catch (failure) {
      // A database timeout may have committed successfully. Keep its media rather than risk breaking that post.
      if (uploadedPath && !databaseAttempted) await supabase.storage.from('social-media').remove([uploadedPath]);
      setError(failure instanceof Error ? failure.message : 'Your post could not be saved.');
    } finally { savingRef.current = false; setSaving(false); }
  }
  async function remove() {
    if (!editor?.existing || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const { data, error: deleteError } = await supabase.from('social_posts').delete().eq('id', editor.id).eq('version', editor.existing.version).in('status', ['draft', 'approved']).select('id').single();
      if (deleteError || !data) throw new Error('This post could not be deleted. It may have changed in another tab. Refresh the calendar.');
      setPosts(current => current.filter(post => post.id !== editor.id)); setEditor(null); setNotice('Draft deleted.'); setConfirmDelete(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Deletion failed.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function card(post: CalendarPost) {
    const url = post.media_path ? supabase.storage.from('social-media').getPublicUrl(post.media_path).data.publicUrl : null;
    return <article key={post.id} className="rounded-xl border border-white/10 bg-neutral-950 p-4">
      <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold capitalize">{post.platform} · {post.scheduled_at ? londonTime(post.scheduled_at) : 'No date'}</span><span className="rounded-full bg-white/10 px-2 py-1 text-xs capitalize">{post.status}</span></div>
      <p className="mt-2 text-sm text-pink-300">{post.book_title || 'General reader post'} · {POST_LABELS[post.post_type]}</p>
      {post.title && <h4 className="mt-2 font-semibold">{post.title}</h4>}
      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{post.caption || 'Caption to write'}</p>
      <p className="mt-2 break-words text-sm text-pink-300">{post.hashtags.join(' ')}</p>
      {url && (post.media_type === 'video' ? <video src={url} controls preload="none" className="mt-3 max-h-64 rounded-lg" /> : <img src={url} loading="lazy" alt={post.title || 'Post artwork'} className="mt-3 max-h-64 rounded-lg" />)}
      {editable(post) && <button type="button" disabled={Boolean(editor) || saving} onClick={() => edit(post)} className={`${buttonClass} mt-3`}>Edit / reschedule</button>}
    </article>;
  }

  return <section id="social-calendar" aria-labelledby="calendar-title" className="mb-7 scroll-mt-28 rounded-2xl border border-pink-500/30 bg-neutral-900 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Plan ahead</p><h2 id="calendar-title" className="mt-1 text-2xl font-bold">Your 30-day calendar</h2><p className="mt-2 text-sm text-neutral-400">Save, edit and approve posts here. Times are UK time. Automatic publishing is not enabled yet.</p></div>
      <div className="flex gap-2"><button type="button" disabled={Boolean(editor) || saving || loading} onClick={() => { setEditor(fresh()); setConfirmDelete(false); setNotice(''); }} className="rounded-xl bg-pink-500 px-4 py-3 font-semibold hover:bg-pink-400 disabled:opacity-40">New draft</button><button type="button" disabled={loading || saving || Boolean(editor)} onClick={() => void load()} className={buttonClass}>Refresh</button></div>
    </div>
    <div aria-live="polite">{error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}{notice && <p className="mt-4 text-sm text-emerald-300">{notice}</p>}{seed && editor && <p className="mt-3 text-sm text-amber-200">A generated post is waiting. Save or close your current editor to open it.</p>}</div>
    <div className="mt-5 flex flex-wrap items-end gap-3">
      <label className="text-sm">Calendar starts<input aria-label="Calendar start date" type="date" value={start} onChange={event => { if (event.target.value) { setStart(event.target.value); setSelected(event.target.value); } }} className={inputClass} /></label>
      <button type="button" className={buttonClass} onClick={() => { const date = addDays(start, -30); setStart(date); setSelected(date); }}>Previous 30 days</button>
      <button type="button" className={buttonClass} onClick={() => { const date = londonDate(); setStart(date); setSelected(date); }}>Today</button>
      <button type="button" className={buttonClass} onClick={() => { const date = addDays(start, 30); setStart(date); setSelected(date); }}>Next 30 days</button>
      <label className="text-sm">Platform<select value={platform} onChange={event => setPlatform(event.target.value)} className={inputClass}><option value="all">All platforms</option>{SOCIAL_PLATFORMS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {loading ? <p className="mt-5 text-neutral-400">Loading your saved posts...</p> : <>
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
        <label className="text-sm sm:col-span-2">Image or MP4 video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={event => { const file = event.target.files?.[0]; if (file) setEditor(current => current ? { ...current, file, mediaBlob: undefined, source: undefined, removeMedia: false, mediaType: file.type.startsWith('video/') ? 'video' : 'image' } : null); }} className={inputClass} /></label>
        <div className="text-sm text-neutral-400 sm:col-span-2">{editor.file ? editor.file.name : editor.source ? 'Generated media will be saved with this draft.' : editor.existing?.media_path && !editor.removeMedia ? 'Existing media is attached.' : 'No media attached.'}{(editor.source || editor.file || editor.existing?.media_path) && !editor.removeMedia && <button type="button" className="ml-3 underline" onClick={() => setEditor(current => current ? { ...current, file: undefined, mediaBlob: undefined, source: undefined, mediaType: null, removeMedia: true } : null)}>Remove attachment</button>}</div>
      </fieldset>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={saving} className={buttonClass}>{saving ? 'Saving...' : 'Save draft'}</button><button type="button" disabled={saving} onClick={() => void save(true)} className="rounded-xl bg-pink-500 px-4 py-2 font-semibold disabled:opacity-40">Save and approve</button><button type="button" disabled={saving} onClick={() => { setEditor(null); setConfirmDelete(false); }} className={buttonClass}>Cancel</button>{editor.existing && <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className={`${buttonClass} text-red-300`}>Delete draft</button>}</div>
      {confirmDelete && <div className="rounded-xl border border-red-400/30 p-3"><p className="text-sm">Delete this saved post?</p><div className="mt-2 flex gap-3"><button type="button" disabled={saving} onClick={() => void remove()} className={`${buttonClass} text-red-300`}>Delete post</button><button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className={buttonClass}>Keep post</button></div></div>}
      <p className="text-xs text-neutral-500">Approval saves your chosen content and date. It does not publish or send it to Buffer yet.</p>
    </form>}
  </section>;
}
