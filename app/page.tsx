export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-stone-950 to-rose-950 text-white px-6 py-12">
      <section className="mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <p className="text-rose-300 text-sm tracking-[0.3em] uppercase mb-4">
            Private Romance Story Builder
          </p>

          <h1 className="text-6xl font-black tracking-tight mb-6">
            NovelForge
          </h1>

          <p className="text-zinc-300 text-lg max-w-2xl mx-auto">
            Build full romance stories from characters, tropes, heat level,
            plot ideas and emotional arcs.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-2">Create New Story</h2>
          <p className="text-zinc-400 mb-8">
            Start with the basics. We’ll make it clever later, obviously.
          </p>

          <div className="grid gap-5">
            <input
              className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none focus:border-rose-400"
              placeholder="Story Title"
            />

            <div className="grid md:grid-cols-2 gap-5">
              <select className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none focus:border-rose-400">
                <option>MM Romance</option>
                <option>MF Romance</option>
              </select>

              <select className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none focus:border-rose-400">
                <option>Spicy</option>
                <option>Fade to black</option>
                <option>Mild</option>
                <option>Explicit adult</option>
              </select>
            </div>

            <textarea
              className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none min-h-[160px] focus:border-rose-400"
              placeholder="Basic plot idea..."
            />

            <button className="w-full bg-rose-500 hover:bg-rose-400 text-white transition rounded-2xl py-4 font-bold text-lg shadow-lg shadow-rose-950/40">
              Generate Story Bible
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
