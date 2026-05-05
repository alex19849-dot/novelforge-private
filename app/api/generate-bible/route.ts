import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const draftPrompt = `
You are NovelForge, a private romance fiction engine.

Write a DRAFT of Chapter 1.

Internally create:
- story bible
- relationship arc
- trope plan
- continuity plan

Do not show any of that planning.

Return only Chapter 1 prose.

SAFETY RULES:
- All characters must be 18+.
- Do not sexualise minors.
- Do not include illegal sexual content.
- Explicit adult content is allowed only between consenting adults.
- Do not include incest.
- Do not frame coercion, stalking, abuse, or manipulation as romantic.

STORY CONTROLS:
Title: ${body.title}
Relationship Type: ${body.relationship}
Subgenre: ${body.subgenre}
Subgenre Detail: ${body.subgenreDetail}
Locale: ${body.locale}
Regional Voice: ${body.regionVoice}
Writing Style: ${body.voiceStyle}
Dialogue Style: ${body.dialogueStyle}
Prose Density: ${body.proseDensity}
Burn Pacing: ${body.burnPacing}
Chapter Opener: ${body.chapterOpener}
Age Bracket: ${body.ageBracket}
Avoid Style: ${body.avoidStyle}
Real-World Grounding: ${body.grounding}
Tropes: ${body.tropes}
Tone: ${body.tone}
Heat Level: ${body.heat}
POV: ${body.pov}
Ending Style: ${body.ending}
Book Length: ${body.length}
Plot Intensity: ${body.intensity}

CHARACTER 1:
Name: ${body.c1Name}
Age: ${body.c1Age}
Appearance: ${body.c1Appearance}
Job / Role: ${body.c1Job}
Personality: ${body.c1Personality}
Speech Quirks: ${body.c1Speech}
Flaws: ${body.c1Flaws}
Biggest Desire: ${body.c1Desire}
Biggest Fear: ${body.c1Fear}
Secret: ${body.c1Secret}
Extra Notes: ${body.c1CustomNotes}

CHARACTER 2:
Name: ${body.c2Name}
Age: ${body.c2Age}
Appearance: ${body.c2Appearance}
Job / Role: ${body.c2Job}
Personality: ${body.c2Personality}
Speech Quirks: ${body.c2Speech}
Flaws: ${body.c2Flaws}
Biggest Desire: ${body.c2Desire}
Biggest Fear: ${body.c2Fear}
Secret: ${body.c2Secret}
Extra Notes: ${body.c2CustomNotes}

PLOT:
Setting: ${body.setting}
Optional Plot Notes: ${body.plot}
Main Conflict: ${body.conflict}
What Keeps Them Apart: ${body.keepsApart}
Must-Have Scenes: ${body.mustHave}
Must-Not-Have: ${body.mustNotHave}

STRICT LENGTH:
- If Book Length is Novella, write 1,000 to 1,500 words.
- If Book Length is Short Novel, write 1,600 to 2,400 words.
- If Book Length is Long Novel, write 2,400 to 3,500 words.
- Do not stop mid-sentence.
- End with a clean hook, reveal, conflict beat, or emotional turn.

CHAPTER 1 PURPOSE:
- Introduce the story world clearly.
- Establish both main characters.
- Establish the central friction.
- Establish the romantic tension without resolving it.
- Do not reveal every secret.
- Do not write a complete story arc.
- Do not resolve the main conflict.

ENEMIES TO LOVERS RULE:
If Tropes includes "Enemies to lovers":
- Chapter 1 must feel like genuine friction.
- They should clash through pride, distrust, rivalry, resentment, competition, or opposing choices.
- Attraction can exist, but it should annoy, confuse, or unsettle them.
- Do not make them emotionally safe with each other too early.
- Do not make them immediately domestic, gentle, or openly supportive.
- Do not include a kiss in Chapter 1.
- Do not include intimate touching beyond accidental or conflict-driven contact.
- End with unresolved tension, not romantic comfort.

OTHER TROPE RULES:
If Tropes includes "Friends to lovers":
- Establish familiarity and buried longing.
- Do not make them feel like strangers.

If Tropes includes "Second chance":
- Establish shared history and old hurt.
- Do not resolve the wound in Chapter 1.

If Tropes includes "Forced proximity":
- Make the forced situation clear.
- Proximity must create inconvenience, tension, or conflict.

If Tropes includes "Slow burn" or Burn Pacing is Slow burn or Agonising slow burn:
- Keep physical escalation restrained.
- Focus on tension, denial, irritation, longing, and small charged moments.
- Do not rush kissing, sex, or emotional confession.

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
- Use the selected locale consistently.
- Honour the selected POV exactly.
RELATIONSHIP STATE TRACKER:
Internally track the romance stage.

Stage 1 = hostility
Stage 2 = reluctant awareness
Stage 3 = begrudging respect
Stage 4 = unwanted attraction
Stage 5 = emotional crack
Stage 6 = first surrender
Stage 7 = intimacy
Stage 8 = commitment

Rule:
- Move the relationship forward by no more than one stage per chapter.
- Do not jump from hostility to emotional caretaking.
- Do not jump from rivalry to couple-like comfort.
- Do not let physical heat automatically create emotional trust.
- Heat can rise faster than trust.
- Conflict and attraction can coexist.
- If enemies-to-lovers is selected, keep irritation, pride and resistance alive even when attraction rises.

Hidden chapter sliders:
- Trust
- Attraction
- Irritation
- Jealousy
- Vulnerability
- Sexual tension
- Physical escalation

For enemies-to-lovers:
- Trust should rise slowly.
- Irritation should stay high early.
- Attraction and sexual tension may rise before trust.
- Vulnerability should stay low until earned.
- Jealousy can appear before emotional honesty.
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

Rewrite and clean this draft Chapter 1 into the FINAL version.

Return only final Chapter 1 prose. No notes.

USER STORY SETTINGS:
Tropes: ${body.tropes}
Burn Pacing: ${body.burnPacing}
Book Length: ${body.length}
POV: ${body.pov}
Locale: ${body.locale}
Regional Voice: ${body.regionVoice}
Writing Style: ${body.voiceStyle}
Dialogue Style: ${body.dialogueStyle}
Prose Density: ${body.proseDensity}
Chapter Opener: ${body.chapterOpener}
Must-Not-Have: ${body.mustNotHave}

DRAFT CHAPTER:
${draft}

EDITOR TASKS:
1. Fix logic issues.
2. Fix dialogue that does not logically answer the previous line.
3. Fix impossible or weird physical actions.
4. Remove pretty-but-meaningless lines.
5. Tighten bloated paragraphs.
6. Remove repeated phrases and repeated emotional beats.
7. Strengthen the selected trope.
8. Make the opening hook stronger.
9. Keep the chapter ending complete and clean.
10. Do not stop mid-sentence.
11. Do not add notes, headings, bullet points, or commentary.

ENEMIES TO LOVERS EDIT:
If "Enemies to lovers" is selected:
- Increase friction.
- Make softness feel reluctant, unwanted, or resisted.
- Add conflict through behaviour, competition, pride, suspicion, resentment, or emotional defence.
- Remove anything that makes them feel too couple-like too early.
- Attraction should feel inconvenient, irritating, or unwanted.
- Do not include a kiss in Chapter 1.
- Do not make them emotionally cosy in Chapter 1.

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
Return only the polished final Chapter 1.
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
          "Something went wrong while generating the chapter. The app has thrown its toys out of the pram.",
      },
      { status: 500 }
    );
  }
}
