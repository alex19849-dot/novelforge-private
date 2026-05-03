"use client";

import { useState } from "react";

export default function Home() {
  const [title, setTitle] = useState("");
  const [relationship, setRelationship] = useState("MM Romance");
  const [heat, setHeat] = useState("Spicy");
  const [plot, setPlot] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateBible() {
    setLoading(true);
    setResult("");

    const res = await fetch("/api/generate-bible", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        relationship,
        heat,
        plot,
      }),
    });

    const data = await res.json();
    setResult(data.result);
    setLoading(false);
  }

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

          <div className="grid gap-5 mt-8">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none"
              placeholder="Story Title"
            />

            <div className="grid md:grid-cols-2 gap-5">
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none"
              >
                <option>MM Romance</option>
                <option>MF Romance</option>
              </select>

              <select
                value={heat}
                onChange={(e) => setHeat(e.target.value)}
                className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none"
              >
                <option>Fade to black</option>
                <option>Mild</option>
                <option>Spicy</option>
                <option>Explicit adult</option>
              </select>
            </div>

            <textarea
              value={plot}
              onChange={(e) => setPlot(e.target.value)}
              className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none min-h-[160px]"
              placeholder="Basic plot idea..."
            />

            <button
              onClick={generateBible}
              className="w-full bg-rose-500 hover:bg-rose-400 rounded-2xl py-4 font-bold text-lg"
            >
              {loading ? "Generating..." : "Generate Story Bible"}
            </button>
          </div>
        </div>

        {result && (
          <div className="max-w-3xl mx-auto mt-10 bg-black/30 rounded-3xl p-8 border border-white/10 whitespace-pre-wrap leading-8 text-zinc-200">
            {result}
          </div>
        )}
      </section>
    </main>
  );
}
