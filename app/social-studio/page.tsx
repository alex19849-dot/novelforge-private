"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabaseClient";

type CatalogueBook = {
  slug: string;
  title: string;
  subgenre: string;
  blurb: string;
  tropes: string[];
  heat: string;
  length: string;
  ending: string;
  contentWarnings: string[];
  kindleUnlimited: boolean;
  asin: string | null;
  amazonUrl: string;
  coverUrl: string;
  bookPageUrl: string;
};

type CatalogueResponse = {
  schemaVersion: number;
  source: string;
  count: number;
  books: CatalogueBook[];
};

type CampaignType =
  | "book-spotlight"
  | "trope-hook"
  | "quote-post"
  | "kindle-unlimited"
  | "backlist-revival";

type SocialPlatform = "facebook" | "instagram" | "tiktok";

type GeneratedPost = {
  platform: SocialPlatform;
  title: string;
  caption: string;
  hashtags: string[];
  visualDirection: string;
};

const CAMPAIGN_OPTIONS: Array<{
  id: CampaignType;
  title: string;
  description: string;
}> = [
  {
    id: "book-spotlight",
    title: "Book Spotlight",
    description: "A strong general promotion using the cover, blurb and main hooks.",
  },
  {
    id: "trope-hook",
    title: "Trope Hook",
    description: "Lead with the tropes readers search for and build the post around them.",
  },
  {
    id: "quote-post",
    title: "Quote Post",
    description: "Create a visual and caption around a genuine quote you provide.",
  },
  {
    id: "kindle-unlimited",
    title: "Kindle Unlimited",
    description: "Promote the book as available to Kindle Unlimited readers.",
  },
  {
    id: "backlist-revival",
    title: "Backlist Revival",
    description: "Give an older title a fresh angle without pretending it is a new release.",
  },
];

const PLATFORM_OPTIONS: Array<{
  id: SocialPlatform;
  label: string;
}> = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

const CATALOGUE_URL = "https://www.marlowquinn.com/api/books";

export default function SocialStudioPage() {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedBook, setSelectedBook] = useState<CatalogueBook | null>(null);
  const [campaignType, setCampaignType] = useState<CampaignType>(
    "book-spotlight",
  );
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([
    "facebook",
    "instagram",
    "tiktok",
  ]);
  const [quote, setQuote] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [copiedPlatform, setCopiedPlatform] = useState<SocialPlatform | null>(
    null,
  );

  function chooseBook(book: CatalogueBook) {
    setSelectedBook(book);
    setCampaignType("book-spotlight");
    setPlatforms(["facebook", "instagram", "tiktok"]);
    setQuote("");
    setInstructions("");
    setGeneratedPosts([]);
    setGenerationError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseCampaignType(value: CampaignType) {
    setCampaignType(value);
    setGeneratedPosts([]);
    setGenerationError("");
  }

  function togglePlatform(platform: SocialPlatform) {
    setGeneratedPosts([]);
    setGenerationError("");
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  async function generateContent() {
    if (!selectedBook || platforms.length === 0) return;

    if (campaignType === "quote-post" && !quote.trim()) {
      setGenerationError("Paste a genuine quote for the quote campaign.");
      return;
    }

    setIsGenerating(true);
    setGenerationError("");
    setGeneratedPosts([]);

    try {
      const response = await fetch("/api/social-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book: selectedBook,
          campaignType,
          platforms,
          quote: quote.trim(),
          instructions: instructions.trim(),
        }),
      });
      const result = (await response.json()) as {
        posts?: GeneratedPost[];
        error?: string;
      };

      if (!response.ok || !result.posts) {
        throw new Error(result.error || "The campaign could not be generated.");
      }

      setGeneratedPosts(result.posts);
    } catch (contentError) {
      setGenerationError(
        contentError instanceof Error
          ? contentError.message
          : "The campaign could not be generated.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyPost(post: GeneratedPost) {
    const text = [
      post.title,
      post.caption,
      post.hashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");

    await navigator.clipboard.writeText(text);
    setCopiedPlatform(post.platform);
    window.setTimeout(() => setCopiedPlatform(null), 1800);
  }

  useEffect(() => {
    let active = true;

    async function loadCatalogue() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.replace("/story-chat");
        return;
      }

      try {
        const response = await fetch(CATALOGUE_URL, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`The website catalogue returned ${response.status}.`);
        }

        const result = (await response.json()) as CatalogueResponse;

        if (!Array.isArray(result.books)) {
          throw new Error("The website catalogue returned invalid book data.");
        }

        if (active) {
          setCatalogue(result);
        }
      } catch (catalogueError) {
        if (active) {
          setError(
            catalogueError instanceof Error
              ? catalogueError.message
              : "The website catalogue could not be loaded.",
          );
        }
      }
    }

    void loadCatalogue();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <a
            href="/story-chat"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl transition hover:bg-white/10"
            aria-label="Back to NovelForge"
          >
            ←
          </a>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-500">
              NovelForge
            </p>
            <h1 className="truncate text-2xl font-semibold">Social Studio</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-8 rounded-2xl border border-white/10 bg-neutral-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">
            Website catalogue
          </p>
          <h2 className="mt-2 text-2xl font-bold">Choose a book to promote</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            This catalogue is read directly from marlowquinn.com. Book changes made
            on the website will appear here automatically.
          </p>
        </div>

        {selectedBook && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-pink-500/30 bg-neutral-900 shadow-2xl">
            <div className="flex flex-col gap-5 border-b border-white/10 p-5 sm:flex-row">
              <img
                src={selectedBook.coverUrl}
                alt={`${selectedBook.title} book cover`}
                className="h-44 w-28 shrink-0 self-center rounded-lg object-cover shadow-xl sm:self-start"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">
                      Campaign setup
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">{selectedBook.title}</h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      {selectedBook.subgenre}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedBook(null)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl text-neutral-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close campaign setup"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedBook.tropes.map((trope) => (
                    <span
                      key={trope}
                      className="rounded-full bg-pink-500/10 px-3 py-1 text-xs text-pink-200"
                    >
                      {trope}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5">
              <h3 className="font-semibold">What are we promoting?</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {CAMPAIGN_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseCampaignType(option.id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      campaignType === option.id
                        ? "border-pink-500 bg-pink-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className="block font-semibold text-white">
                      {option.title}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-neutral-400">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              <h3 className="mt-6 font-semibold">Platforms</h3>
              <div className="mt-3 flex flex-wrap gap-3">
                {PLATFORM_OPTIONS.map((platform) => {
                  const selected = platforms.includes(platform.id);

                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        selected
                          ? "border-pink-500 bg-pink-500 text-white"
                          : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"
                      }`}
                    >
                      {selected ? "✓ " : ""}
                      {platform.label}
                    </button>
                  );
                })}
              </div>

              {campaignType === "quote-post" && (
                <div className="mt-6">
                  <label
                    htmlFor="campaign-quote"
                    className="block font-semibold"
                  >
                    Genuine book quote
                  </label>
                  <textarea
                    id="campaign-quote"
                    value={quote}
                    onChange={(event) => {
                      setQuote(event.target.value);
                      setGeneratedPosts([]);
                      setGenerationError("");
                    }}
                    rows={4}
                    placeholder="Paste the exact quote from the book..."
                    className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500"
                  />
                </div>
              )}

              <div className="mt-6">
                <label
                  htmlFor="campaign-instructions"
                  className="block font-semibold"
                >
                  Anything specific? <span className="text-neutral-500">Optional</span>
                </label>
                <textarea
                  id="campaign-instructions"
                  value={instructions}
                  onChange={(event) => {
                    setInstructions(event.target.value);
                    setGeneratedPosts([]);
                    setGenerationError("");
                  }}
                  rows={3}
                  placeholder="For example: focus on the jealousy and forced proximity..."
                  className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-pink-500"
                />
              </div>

              {generationError && (
                <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  {generationError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void generateContent()}
                disabled={isGenerating || platforms.length === 0}
                className="mt-6 w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:bg-pink-500/30 disabled:text-pink-100/60"
              >
                {isGenerating
                  ? "Creating platform content..."
                  : platforms.length === 0
                    ? "Choose at least one platform"
                    : "Generate Content"}
              </button>

              {generatedPosts.length > 0 && (
                <div className="mt-8 space-y-5 border-t border-white/10 pt-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-400">
                      Generated campaign
                    </p>
                    <h3 className="mt-2 text-xl font-bold">
                      Platform-specific content
                    </h3>
                  </div>

                  {generatedPosts.map((post) => (
                    <article
                      key={post.platform}
                      className="rounded-2xl border border-white/10 bg-neutral-950 p-5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <h4 className="text-lg font-bold capitalize">
                          {post.platform}
                        </h4>
                        <button
                          type="button"
                          onClick={() => void copyPost(post)}
                          className="rounded-lg border border-pink-500/40 bg-pink-500/10 px-3 py-2 text-sm font-semibold text-pink-200 transition hover:bg-pink-500/20"
                        >
                          {copiedPlatform === post.platform ? "Copied" : "Copy post"}
                        </button>
                      </div>

                      {post.title && (
                        <div className="mt-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Title or hook
                          </p>
                          <p className="mt-1 font-semibold text-white">
                            {post.title}
                          </p>
                        </div>
                      )}

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                          Caption
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-200">
                          {post.caption}
                        </p>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-pink-300">
                        {post.hashtags.join(" ")}
                      </p>

                      <div className="mt-4 rounded-xl bg-white/5 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                          Visual direction
                        </p>
                        <p className="mt-2 text-sm leading-6 text-neutral-300">
                          {post.visualDirection}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {!catalogue && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-neutral-400">
            Loading your books...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <p className="font-semibold text-red-200">Catalogue unavailable</p>
            <p className="mt-2 text-sm text-red-100/80">{error}</p>
          </div>
        )}

        {catalogue && (
          <>
            <p className="mb-4 text-sm text-neutral-500">
              {catalogue.count} {catalogue.count === 1 ? "book" : "books"} found
            </p>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {catalogue.books.map((book) => (
                <article
                  key={book.slug}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-xl"
                >
                  <div className="aspect-[16/11] bg-neutral-800 p-4">
                    <img
                      src={book.coverUrl}
                      alt={`${book.title} book cover`}
                      className="h-full w-full object-contain drop-shadow-2xl"
                      loading="lazy"
                    />
                  </div>

                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-pink-400">
                      {book.subgenre}
                    </p>
                    <h2 className="mt-2 text-xl font-bold">{book.title}</h2>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {book.tropes.map((trope) => (
                        <span
                          key={trope}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300"
                        >
                          {trope}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm">
                      <span className="text-amber-300" aria-label="Heat level">
                        {book.heat}
                      </span>
                      {book.kindleUnlimited && (
                        <span className="font-semibold text-neutral-300">
                          Kindle Unlimited
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => chooseBook(book)}
                      className="mt-5 w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-400"
                    >
                      Create Campaign
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
