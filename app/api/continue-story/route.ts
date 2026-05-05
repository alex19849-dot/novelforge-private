import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const form = body.form;
  const previousChapter = body.previousChapter;
  const nextChapterNumber = body.nextChapterNumber;

  const draftPrompt = `
You are NovelForge, a romance novel continuation engine.

Write a DRAFT of Chapter ${nextChapterNumber}.

Return only chapter prose. No notes. No outline.

STORY CONTROLS:
Title: ${form.title}
Relationship Type: ${form.relationship}
Subgenre: ${form.subgenre}
Subgenre Detail: ${form.subgenreDetail}
Locale: ${form.locale}
Regional Voice: ${form.regionVoice}
Writing Style: ${form.voiceStyle}
Dialogue Style: ${form.dialogueStyle}
Prose Density: ${form.proseDensity}
Burn Pacing: ${form.burnPacing}
Tropes: ${form.tropes}
Tone: ${form.tone}
Heat Level: ${form.heat}
POV: ${form.pov}
Book Length: ${form.length}
Plot Intensity: ${form.intensity}

CHARACTER 1:
Name: ${form.c1Name}
Age: ${form.c1Age}
Appearance: ${form.c1Appearance}
Job / Role: ${form.c1Job}
Personality: ${form.c1Personality}
Speech Quirks: ${form.c1Speech}
Flaws: ${form.c1Flaws}
Biggest Desire: ${form.c1Desire}
Biggest Fear: ${form.c1Fear}
Secret: ${form.c1Secret}
Extra Notes: ${form.c1CustomNotes}

CHARACTER 2:
Name: ${form.c2Name}
Age: ${form.c2Age}
Appearance: ${form.c2Appearance}
Job / Role: ${form.c2Job}
Personality: ${form.c2Personality}
Speech Quirks: ${form.c2Speech}
Flaws: ${form.c2Flaws}
Biggest Desire: ${form.c2Desire}
Biggest Fear: ${form.c2Fear}
Secret: ${form.c2Secret}
Extra Notes: ${form.c2CustomNotes}

PLOT:
Setting: ${form.setting}
Optional Plot Notes: ${form.plot}
Main Conflict: ${form.conflict}
What Keeps Them Apart: ${form.keepsApart}
Must-Have Scenes: ${form.mustHave}
Must-Not-Have: ${form.mustNotHave}

PREVIOUS CHAPTERS:
${previousChapter}

STRICT LENGTH:
- If Book Length is Novella, write 1,000 to 1,500 words.
- If Book Length is Short Novel, write 1,600 to 2,400 words.
- If Book Length is Long Novel, write 2,400 to 3,500 words.
- Do not stop mid-sentence.
- End with a clean hook, reveal, conflict beat, or emotional turn.

ENEMIES TO LOVERS RULE:
If Tropes includes "Enemies to lovers":
- Keep genuine friction alive.
- They must clash through pride, distrust, rivalry, resentment, or opposing choices.
- Attraction can exist, but it should annoy, confuse, or unsettle them.
- Do not make them emotionally cosy too quickly.
- Do not make them act like comfortable partners too early.
- If softness appears, undercut it with conflict, denial, pride, or avoidance.
- Do not resolve romantic tension too early.
- If they have kissed already, make it create awkwardness, conflict, denial, or fallout.

CONTINUITY RULES:
- Continue from previous chapters exactly.
- Do not forget who said what.
- Do not assign a quote to the wrong person.
- Do not repeat old reveals as if new.
- Track secrets, injuries, relationships, money problems, threats, living arrangements and emotional states.
- Do not contradict previous events.

STYLE RULES:
- Natural commercial romance prose.
- Distinct character voices.
- Natural dialogue with subtext.
- No em dashes.
- No therapy-speak.
- No fake profound lines.
- No impossible physical actions.
- No purple prose.
- No repeated symbolic closing lines.
- No “electric touch”, “storm in his eyes”, “second heartbeat”, “his breath hitched”, unless rare and genuinely needed.
`;

  try {
    const draftResponse = await openai.responses.create({
      model: "gpt-5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      input: draftPrompt,
      max_output_tokens: 8000,
    });

    const draft = draftResponse.output_text;

    const editorPrompt = `
You are NovelForge's strict human-style romance editor.

Your job:
Rewrite and clean this draft chapter into the FINAL version.

Return only the final chapter prose. No notes.

USER STORY SETTINGS:
Tropes: ${form.tropes}
Burn Pacing: ${form.burnPacing}
Book Length: ${form.length}
POV: ${form.pov}
Locale: ${form.locale}
Regional Voice: ${form.regionVoice}
Writing Style: ${form.voiceStyle}
Dialogue Style: ${form.dialogueStyle}
Prose Density: ${form.proseDensity}
Must-Not-Have: ${form.mustNotHave}

PREVIOUS CHAPTERS FOR CONTINUITY:
${previousChapter}

DRAFT CHAPTER:
${draft}

EDITOR TASKS:
1. Fix continuity.
2. Fix quote ownership.
3. Fix dialogue that does not logically answer the previous line.
4. Fix impossible or weird physical actions.
5. Remove pretty-but-meaningless lines.
6. Tighten bloated paragraphs.
7. Remove repeated phrases and repeated emotional beats.
8. Strengthen enemies-to-lovers tension if selected.
9. Keep the chapter ending complete and clean.
10. Do not stop mid-sentence.
11. Do not add notes, headings, bullet points, or commentary.

ENEMIES TO LOVERS EDIT:
If "Enemies to lovers" is selected:
- Increase friction.
- Make softness feel reluctant, unwanted, or resisted.
- Add conflict through behaviour, competition, pride, suspicion, or emotional defence.
- Remove anything that makes them feel too couple-like too early.
- If attraction appears, make it inconvenient and irritating.
- If one helps the other, make it grudging, practical, or tense, not openly tender too soon.

LENGTH EDIT:
- If Book Length is Novella, final chapter should be 1,000 to 1,500 words.
- If Book Length is Short Novel, final chapter should be 1,600 to 2,400 words.
- If Book Length is Long Novel, final chapter should be 2,400 to 3,500 words.
- If too long, cut repetition and over-explaining.
- If near the limit, end cleanly rather than adding another scene.

ANTI-AI EDIT:
Remove or rewrite:
- fake profound sentences
- therapy-speak
- melodramatic inner monologue
- body-part clichés
- impossible actions
- repeated “I don’t know” style closings
- lines that sound poetic but mean nothing
- over-polished banter
- long decorative descriptions

FINAL OUTPUT:
Return only the polished final Chapter ${nextChapterNumber}.
`;

    const finalResponse = await openai.responses.create({
      model: "gpt-5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      input: editorPrompt,
      max_output_tokens: 8000,
    });

    return Response.json({
      result: finalResponse.output_text,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        result:
          "Something went wrong while continuing the story. The app is sulking in a corner.",
      },
      { status: 500 }
    );
  }
}
