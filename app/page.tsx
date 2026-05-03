export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-5xl font-bold mb-4 text-center">NovelForge</h1>

        <p className="text-zinc-300 text-center text-lg mb-12">
          Private Romance Story Builder
        </p>

        <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800">
          <h2 className="text-2xl font-semibold mb-6">Create New Story</h2>

          <input
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none mb-4"
            placeholder="Story Title"
          />

          <select className="w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none mb-4">
            <option>Choose Relationship Type</option>
            <option>MM Romance</option>
            <option>MF Romance</option>
          </select>

          <textarea
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none min-h-[140px] mb-4"
            placeholder="Basic plot idea..."
          />

          <button className="w-full bg-pink-600 hover:bg-pink-500 transition rounded-xl py-3 font-semibold">
            Generate Story Bible
          </button>
        </div>
      </div>
    </main>
  );
}
