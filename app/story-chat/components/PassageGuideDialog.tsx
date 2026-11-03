"use client";

import { useEffect, useRef } from "react";

export default function PassageGuideDialog({ passage, instruction, onInstruction, busy, error, onApply, onClose }: {
  passage: string;
  instruction: string;
  onInstruction: (value: string) => void;
  busy: boolean;
  error: string;
  onApply: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); };
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby="passage-guide-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="m-auto max-h-[85dvh] w-[calc(100%-24px)] max-w-xl overflow-y-auto rounded-2xl border border-white/15 bg-neutral-950 p-5 text-white shadow-2xl backdrop:bg-black/60">
      <form onSubmit={event => { event.preventDefault(); if (!busy && instruction.trim()) onApply(); }}>
        <h2 id="passage-guide-title" className="text-lg font-semibold">Guide this passage</h2>
        <blockquote className="my-4 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm leading-6 text-neutral-300">{passage}</blockquote>
        <label className="block text-sm font-medium" htmlFor="selection-rewrite-guidance">How should it change?</label>
        <textarea id="selection-rewrite-guidance" autoFocus value={instruction}
          onChange={event => onInstruction(event.target.value)} disabled={busy} rows={4}
          placeholder="Tell NovelForge what to change. You can start with AION: to choose Aion."
          className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 p-3 text-base outline-none focus:border-pink-500 disabled:opacity-50" />
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-white/20 px-4 disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={busy || !instruction.trim()} className="min-h-11 rounded-lg bg-pink-500 px-4 font-semibold text-white disabled:opacity-40">{busy ? "Rewriting..." : "Rewrite selection"}</button>
        </div>
      </form>
    </dialog>
  );
}
