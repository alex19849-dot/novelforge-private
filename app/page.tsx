"use client";

import { useState } from "react";

export default function Home() {
  const [form, setForm] = useState({
    title: "",
    relationship: "MM Romance",
    subgenre: "Contemporary",
    tropes: "",
    tone: "Emotional",
    heat: "Spicy",
    pov: "Third person",
    ending: "Happy ending",

    c1Name: "",
    c1Age: "",
    c1Appearance: "",
    c1Job: "",
    c1Personality: "",
    c1Flaws: "",
    c1Desire: "",
    c1Fear: "",
    c1Secret: "",

    c2Name: "",
    c2Age: "",
    c2Appearance: "",
    c2Job: "",
    c2Personality: "",
    c2Flaws: "",
    c2Desire: "",
    c2Fear: "",
    c2Secret: "",

    setting: "",
    plot: "",
    conflict: "",
    keepsApart: "",
    mustHave: "",
    mustNotHave: "",
    length: "Short novel",
  });

  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function generateBible() {
    setLoading(true);
    setResult("");

    const res = await fetch("/api/generate-bible", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setResult(data.result || "Something went wrong.");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-stone-950 to-rose-950 text-white px-6 py-12">
      <section className="mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <p className="text-rose-300 text-sm tracking-[0.3em] uppercase mb-4">
            Private Romance Story Builder
          </p>

          <h1 className="text-6xl font-black tracking-tight mb-6">
            NovelForge
          </h1>

          <p className="text-zinc-300 text-lg max-w-2xl mx-auto">
            Build romance stories from characters, tropes, heat level, plot
            ideas and emotional arcs.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-8">Create New Story</h2>

          <div className="grid gap-8">
            <Section title="Story Setup">
              <Input label="Story Title" field="title" form={form} updateField={updateField} />

              <div className="grid md:grid-cols-2 gap-4">
                <Select label="Relationship Type" field="relationship" value={form.relationship} updateField={updateField} options={["MM Romance", "MF Romance"]} />
                <Select label="Subgenre" field="subgenre" value={form.subgenre} updateField={updateField} options={["Contemporary", "Small Town", "Sports Romance", "Dark Romance", "Workplace", "Celebrity", "Paranormal", "Billionaire", "Second Chance"]} />
                <Select label="Tone" field="tone" value={form.tone} updateField={updateField} options={["Emotional", "Funny", "Dark", "Soft", "Gritty", "Angsty", "Sweet", "Filthy but heartfelt"]} />
                <Select label="Heat Level" field="heat" value={form.heat} updateField={updateField} options={["Fade to black", "Mild", "Spicy", "Explicit adult"]} />
                <Select label="POV" field="pov" value={form.pov} updateField={updateField} options={["First person", "Third person", "Dual POV", "Alternating POV"]} />
                <Select label="Ending" field="ending" value={form.ending} updateField={updateField} options={["Happy ending", "Happy for now", "Bittersweet", "Cliffhanger"]} />
              </div>

              <TextArea label="Tropes" field="tropes" form={form} updateField={updateField} placeholder="Enemies to lovers, forced proximity, slow burn..." />
              <Select label="Length" field="length" value={form.length} updateField={updateField} options={["Novella", "Short novel", "Full novel"]} />
            </Section>

            <Section title="Character 1">
              <div className="grid md:grid-cols-2 gap-4">
                <Input label="Name" field="c1Name" form={form} updateField={updateField} />
                <Input label="Age" field="c1Age" form={form} updateField={updateField} />
              </div>
              <TextArea label="Appearance" field="c1Appearance" form={form} updateField={updateField} />
              <Input label="Job / Role" field="c1Job" form={form} updateField={updateField} />
              <TextArea label="Personality" field="c1Personality" form={form} updateField={updateField} />
              <TextArea label="Flaws" field="c1Flaws" form={form} updateField={updateField} />
              <TextArea label="Biggest Desire" field="c1Desire" form={form} updateField={updateField} />
              <TextArea label="Biggest Fear" field="c1Fear" form={form} updateField={updateField} />
              <TextArea label="Secret" field="c1Secret" form={form} updateField={updateField} />
            </Section>

            <Section title="Character 2">
              <div className="grid md:grid-cols-2 gap-4">
                <Input label="Name" field="c2Name" form={form} updateField={updateField} />
                <Input label="Age" field="c2Age" form={form} updateField={updateField} />
              </div>
              <TextArea label="Appearance" field="c2Appearance" form={form} updateField={updateField} />
              <Input label="Job / Role" field="c2Job" form={form} updateField={updateField} />
              <TextArea label="Personality" field="c2Personality" form={form} updateField={updateField} />
              <TextArea label="Flaws" field="c2Flaws" form={form} updateField={updateField} />
              <TextArea label="Biggest Desire" field="c2Desire" form={form} updateField={updateField} />
              <TextArea label="Biggest Fear" field="c2Fear" form={form} updateField={updateField} />
              <TextArea label="Secret" field="c2Secret" form={form} updateField={updateField} />
            </Section>

            <Section title="Plot">
              <TextArea label="Setting" field="setting" form={form} updateField={updateField} />
              <TextArea label="Basic Plot Idea" field="plot" form={form} updateField={updateField} />
              <TextArea label="Main Conflict" field="conflict" form={form} updateField={updateField} />
              <TextArea label="What Keeps Them Apart?" field="keepsApart" form={form} updateField={updateField} />
              <TextArea label="Must-Have Scene" field="mustHave" form={form} updateField={updateField} />
              <TextArea label="Must-Not-Have" field="mustNotHave" form={form} updateField={updateField} />
            </Section>

            <button
              onClick={generateBible}
              className="w-full bg-rose-500 hover:bg-rose-400 rounded-2xl py-4 font-bold text-lg"
            >
              {loading ? "Generating..." : "Generate Story Bible"}
            </button>
          </div>
        </div>

        {result && (
          <div className="max-w-4xl mx-auto mt-10 bg-black/30 rounded-3xl p-8 border border-white/10 whitespace-pre-wrap leading-8 text-zinc-200">
            {result}
          </div>
        )}
      </section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/10 rounded-3xl p-6 bg-black/20">
      <h3 className="text-2xl font-bold mb-5 text-rose-200">{title}</h3>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function Input({ label, field, form, updateField }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        value={form[field]}
        onChange={(e) => updateField(field, e.target.value)}
        className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none"
      />
    </label>
  );
}

function TextArea({ label, field, form, updateField, placeholder = "" }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <textarea
        value={form[field]}
        onChange={(e) => updateField(field, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none min-h-[100px]"
      />
    </label>
  );
}

function Select({ label, field, value, updateField, options }: any) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <select
        value={value}
        onChange={(e) => updateField(field, e.target.value)}
        className="w-full rounded-2xl bg-zinc-950/70 border border-white/10 px-5 py-4 outline-none"
      >
        {options.map((option: string) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
