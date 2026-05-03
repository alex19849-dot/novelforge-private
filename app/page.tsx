"use client";

import { useState } from "react";

const TROPE_OPTIONS = [
  "Enemies to lovers",
  "Friends to lovers",
  "Forced proximity",
  "Fake dating",
  "Second chance",
  "Grumpy / sunshine",
  "Only one bed",
  "Hurt / comfort",
  "Forbidden attraction",
  "Workplace romance",
  "Small town romance",
  "Sports romance",
  "Celebrity romance",
  "Single parent",
  "Secret relationship",
  "Opposites attract",
  "Slow burn",
  "High angst",
  "Protective lead",
  "Found family",
  "Jealousy",
];

const TRAIT_OPTIONS = [
  "Grumpy",
  "Sunshine",
  "Guarded",
  "Confident",
  "Shy",
  "Funny",
  "Sarcastic",
  "Soft-hearted",
  "Hot-headed",
  "Protective",
  "Ambitious",
  "Chaotic",
  "Quiet",
  "Dominant",
  "Nurturing",
  "Flirty",
  "Awkward",
  "Loyal",
  "Broken but trying",
];

const FLAW_OPTIONS = [
  "Trust issues",
  "Commitment issues",
  "Jealous",
  "Emotionally closed off",
  "People pleaser",
  "Impulsive",
  "Workaholic",
  "Self-sabotaging",
  "Afraid of vulnerability",
  "Bad temper",
  "Overprotective",
  "Runs from conflict",
];

const DESIRE_OPTIONS = [
  "To be loved properly",
  "To feel safe",
  "To escape their past",
  "To prove themselves",
  "To build a family",
  "To belong somewhere",
  "To be chosen",
  "To start over",
  "To protect someone",
  "To finally trust",
];

const FEAR_OPTIONS = [
  "Being abandoned",
  "Being rejected",
  "Losing control",
  "Getting hurt again",
  "Being trapped",
  "Being truly known",
  "Letting someone down",
  "Repeating the past",
  "Being vulnerable",
  "Failing the people they love",
];

const SECRET_OPTIONS = [
  "No major secret",
  "Hidden debt",
  "Secret child",
  "Criminal past",
  "Family scandal",
  "Fake identity",
  "Secret illness",
  "Secret inheritance",
  "Hidden heartbreak",
  "Secret engagement",
  "Carrying guilt",
  "Other / custom",
];

const JOB_OPTIONS = [
  "Business owner",
  "Tradesperson",
  "Doctor / Nurse",
  "Teacher",
  "Artist",
  "Musician",
  "Athlete",
  "Writer",
  "Chef",
  "Bar owner",
  "Police / Firefighter",
  "Military",
  "Adult student",
  "Unemployed / rebuilding life",
  "Other / custom",
];

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
    c1Job: "Business owner",
    c1Personality: "",
    c1Flaws: "",
    c1Desire: "",
    c1Fear: "",
    c1Secret: "No major secret",
    c1CustomNotes: "",

    c2Name: "",
    c2Age: "",
    c2Appearance: "",
    c2Job: "Business owner",
    c2Personality: "",
    c2Flaws: "",
    c2Desire: "",
    c2Fear: "",
    c2Secret: "No major secret",
    c2CustomNotes: "",

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

  function generateNames() {
    const mmNames = [
      ["Theo Mercer", "Lucas Hale"],
      ["Elliot Vale", "Ronan Hayes"],
      ["Callum Reed", "Jude Bennett"],
      ["Finn Archer", "Miles Hart"],
    ];

    const mfNames = [
      ["Sophie Bennett", "Ethan Cole"],
      ["Maya Hart", "Logan Reed"],
      ["Clara Vale", "Noah Mercer"],
      ["Ivy Brooks", "Daniel Hayes"],
    ];

    const list = form.relationship === "MF Romance" ? mfNames : mmNames;
    const pair = list[Math.floor(Math.random() * list.length)];

    updateField("c1Name", pair[0]);
    updateField("c2Name", pair[1]);
  }

  async function generateStory() {
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
              <Input
                label="Story Title"
                field="title"
                form={form}
                updateField={updateField}
              />

              <div className="grid md:grid-cols-2 gap-4">
                <Select label="Relationship Type" field="relationship" value={form.relationship} updateField={updateField} options={["MM Romance", "MF Romance"]} />
                <Select label="Subgenre" field="subgenre" value={form.subgenre} updateField={updateField} options={["Contemporary", "Small Town", "Sports Romance", "Dark Romance", "Workplace", "Celebrity", "Paranormal", "Billionaire", "Second Chance"]} />
                <Select label="Tone" field="tone" value={form.tone} updateField={updateField} options={["Emotional", "Funny", "Dark", "Soft", "Gritty", "Angsty", "Sweet", "Filthy but heartfelt"]} />
                <Select label="Heat Level" field="heat" value={form.heat} updateField={updateField} options={["Fade to black", "Mild", "Spicy", "Explicit adult"]} />
                <Select label="POV" field="pov" value={form.pov} updateField={updateField} options={["First person", "Third person", "Dual POV", "Alternating POV"]} />
                <Select label="Ending" field="ending" value={form.ending} updateField={updateField} options={["Happy ending", "Happy for now", "Bittersweet", "Cliffhanger"]} />
              </div>

              <CheckboxGroup label="Tropes" field="tropes" selected={form.tropes} options={TROPE_OPTIONS} updateField={updateField} />

              <Select label="Length" field="length" value={form.length} updateField={updateField} options={["Novella", "Short novel", "Full novel"]} />
            </Section>

            <button
              type="button"
              onClick={generateNames}
              className="w-full bg-zinc-800 hover:bg-zinc-700 rounded-2xl py-3 font-semibold border border-white/10"
            >
              Generate Character Names
            </button>

            <CharacterSection
              title="Character 1"
              prefix="c1"
              form={form}
              updateField={updateField}
            />

            <CharacterSection
              title="Character 2"
              prefix="c2"
              form={form}
              updateField={updateField}
            />

            <Section title="Plot">
              <TextArea label="Setting" field="setting" form={form} updateField={updateField} />
              <TextArea label="Basic Plot Idea" field="plot" form={form} updateField={updateField} />
              <TextArea label="Main Conflict" field="conflict" form={form} updateField={updateField} />
              <TextArea label="What Keeps Them Apart?" field="keepsApart" form={form} updateField={updateField} />
              <TextArea label="Must-Have Scene" field="mustHave" form={form} updateField={updateField} />
              <TextArea label="Must-Not-Have" field="mustNotHave" form={form} updateField={updateField} />
            </Section>

            <button
              onClick={generateStory}
              className="w-full bg-rose-500 hover:bg-rose-400 rounded-2xl py-4 font-bold text-lg"
            >
              {loading ? "Generating your story..." : "Generate Story"}
            </button>
          </div>
        </div>

        {result && (
          <div className="max-w-4xl mx-auto mt-10 bg-black/30 rounded-3xl p-8 border border-white/10 whitespace-pre-wrap leading-8 text-zinc-200">
            <h2 className="text-3xl font-bold text-rose-200 mb-6">
              Chapter 1
            </h2>
            {result}
          </div>
        )}
      </section>
    </main>
  );
}

function CharacterSection({ title, prefix, form, updateField }: any) {
  return (
    <Section title={title}>
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Name" field={`${prefix}Name`} form={form} updateField={updateField} />
        <Input label="Age" field={`${prefix}Age`} form={form} updateField={updateField} />
      </div>

      <TextArea label="Appearance" field={`${prefix}Appearance`} form={form} updateField={updateField} />

      <Select label="Job / Role" field={`${prefix}Job`} value={form[`${prefix}Job`]} updateField={updateField} options={JOB_OPTIONS} />

      <CheckboxGroup label="Personality" field={`${prefix}Personality`} selected={form[`${prefix}Personality`]} options={TRAIT_OPTIONS} updateField={updateField} />

      <CheckboxGroup label="Flaws" field={`${prefix}Flaws`} selected={form[`${prefix}Flaws`]} options={FLAW_OPTIONS} updateField={updateField} />

      <CheckboxGroup label="Biggest Desire" field={`${prefix}Desire`} selected={form[`${prefix}Desire`]} options={DESIRE_OPTIONS} updateField={updateField} />

      <CheckboxGroup label="Biggest Fear" field={`${prefix}Fear`} selected={form[`${prefix}Fear`]} options={FEAR_OPTIONS} updateField={updateField} />

      <Select label="Secret" field={`${prefix}Secret`} value={form[`${prefix}Secret`]} updateField={updateField} options={SECRET_OPTIONS} />

      <TextArea label="Extra Character Notes" field={`${prefix}CustomNotes`} form={form} updateField={updateField} placeholder="Anything specific you want included..." />
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

function CheckboxGroup({
  label,
  field,
  selected,
  options,
  updateField,
}: any) {
  function toggleOption(option: string) {
    const current = selected ? selected.split(", ").filter(Boolean) : [];

    const updated = current.includes(option)
      ? current.filter((item: string) => item !== option)
      : [...current, option];

    updateField(field, updated.join(", "));
  }

  const selectedArray = selected ? selected.split(", ").filter(Boolean) : [];

  return (
    <div className="grid gap-3">
      <span className="text-sm text-zinc-300">{label}</span>

      <div className="flex flex-wrap gap-2">
        {options.map((option: string) => {
          const active = selectedArray.includes(option);

          return (
            <button
              type="button"
              key={option}
              onClick={() => toggleOption(option)}
              className={`rounded-full px-4 py-2 text-sm border transition ${
                active
                  ? "bg-rose-500 border-rose-400 text-white"
                  : "bg-zinc-950/70 border-white/10 text-zinc-300 hover:border-rose-400"
              }`}
            >
              {active ? "✓ " : ""}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
