"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import StudioNav from "./StudioNav";
import SocialCalendar from "./SocialCalendar";
import StudioCreator from "./StudioCreator";
import type { StudioBook } from "../../lib/social-creative-directions";
import type { StudioView, StudioCounts } from "../../lib/social-workspace";
export default function SocialStudioPage() {
  const [view, setView] = useState<StudioView>("scheduled"),
    [counts, setCounts] = useState<StudioCounts>({
      scheduled: 0,
      drafts: 0,
      issues: 0,
      history: 0,
    }),
    [books, setBooks] = useState<StudioBook[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/story-chat");
          return;
        }
        const response = await fetch("https://www.marlowquinn.com/api/books", {
          cache: "no-store",
        });
        const catalogue = await response.json();
        if (!response.ok || !Array.isArray(catalogue.books))
          throw Error("Your book catalogue could not be loaded.");
        if (active) {
          setBooks(catalogue.books);
          setLoaded(true);
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Your books could not be loaded.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="min-h-[100dvh] bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <a
            href="/story-chat"
            aria-label="Back to NovelForge"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-xl hover:bg-white/5"
          >
            ←
          </a>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.3em] text-pink-500">
              NovelForge
            </p>
            <h1 className="text-2xl font-semibold">Social Studio</h1>
          </div>
        </div>
      </header>
      <StudioNav view={view} counts={counts} onChange={setView} />
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <SocialCalendar
          books={books}
          seed={null}
          onSeedUsed={() => {}}
          view={view}
          onNavigate={setView}
          onCounts={setCounts}
          refreshKey={refresh}
        />
        <div hidden={view !== "create"}>
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-200"
            >
              {error}
            </p>
          )}
          {!loaded && !error ? (
            <p role="status" className="py-12 text-center text-neutral-400">
              Loading your books…
            </p>
          ) : (
            <StudioCreator
              books={books}
              onSaved={() => setRefresh((n) => n + 1)}
              onNavigate={setView}
            />
          )}
        </div>
      </section>
    </main>
  );
}
