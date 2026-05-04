import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = `
You are NovelForge, a private romance novel generation engine.

Your job:
Create a hidden story bible, hidden chapter plan, then write ONLY Chapter 1.

Do not show:
- story bible
- outline
- planning notes
- bullet points
- analysis
- spoilers

Only return the finished Chapter 1 prose.

Safety rules:
- All characters must be 18+.
- Do not sexualise minors.
- Do not include illegal sexual content.
- Explicit adult content is allowed only between consenting adults.
- Do not include incest.
- Do not frame coercion or abuse as romantic.
- If a user-selected setup risks unsafe content, age up characters and make the relationship legal, consensual and adult.

Story controls:
Title: ${body.title}
Relationship Type: ${body.relationship}
Subgenre: ${body.subgenre}
Subgenre Detail: ${body.subgenreDetail}
Locale / Language Flavour: ${body.locale}
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

Chapter length guide:
- If Book Length is Novella, Chapter 1 should be around 2,000 to 3,000 words.
- If Book Length is Short Novel, Chapter 1 should be around 3,500 to 5,000 words.
- If Book Length is Long Novel, Chapter 1 should be around 5,000 to 7,000 words.
- Do not mention the target word count.

Character 1:
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

Character 2:
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

Plot:
Setting: ${body.setting}
Optional Plot Notes: ${body.plot}
Main Conflict: ${body.conflict}
What Keeps Them Apart: ${body.keepsApart}
Must-Have Scenes: ${body.mustHave}
Must-Not-Have: ${body.mustNotHave}

Core writing rules:
- Write like polished commercial romance fiction, but keep it natural and human.
- Use the selected locale and regional voice consistently.
- Do not mix British, American, Canadian, Australian or Irish vocabulary unless the story setup naturally requires it.
- If Canadian English is selected, use natural Canadian/North American hockey language where relevant.
- If British English is selected, use British vocabulary and rhythm consistently.
- Keep character voices distinct.
- Honour the selected POV exactly.
- Do not rush the romance.
- Do not reveal every secret immediately.
- Chapter 1 should hook the reader and end with a reason to continue.
- Use the selected Chapter Opener style.
- Use the selected Burn Pacing structurally, not vaguely.

Dialogue rules:
- Dialogue must sound like real people speaking.
- Use contractions naturally: can't, don't, isn't, it's, I've, you're, we're, they've, he'll, she'll.
- Avoid stiff phrasing like "I cannot", "I do not", "I am", "it is", "we are", unless a specific character is intentionally formal.
- Avoid speech that sounds theatrical, robotic, old-fashioned or over-explained.
- Let characters interrupt, dodge, joke, deflect and leave things unsaid.
- If the dialogue style is blunt, clipped or gritty, keep sentences shorter.
- If the character speech quirks include swearing, sarcasm, bluntness or guardedness, reflect that naturally.
- Do not make every line witty. Real people are not all comedy writers, sadly.

Anti-AI style rules:
- Do not use em dashes.
- Do not use long dash interruptions.
- Avoid repeated sentence openings, especially "Like..." or "As if...".
- Avoid stacked similes.
- Avoid purple prose.
- Avoid poetic object descriptions.
- Avoid therapy-speak.
- Avoid characters explaining their feelings too neatly.
- Avoid overly polished banter every line.
- Avoid constant body-part descriptions.
- Avoid phrases like "his jaw clenched", "his breath hitched", "something in his chest", "his heart hammered", "electric touch", "second heartbeat", "storm in his eyes", unless genuinely needed and rare.
- Keep metaphors rare.
- If a metaphor appears, make it plain and natural.
- Do not make every paragraph sound profound.
- Keep the prose varied, grounded and readable.

Voice handling:
- If Writing Style is Raw / gritty, write leaner, rougher and more direct.
- If Prose Density is Lean, use simple, clean sentences and avoid decorative phrasing.
- If Prose Density is Balanced, allow some texture but keep restraint.
- If Prose Density is Rich but controlled, allow more sensory writing, but do not become flowery.
- If Real-World Grounding includes mundane detail, work stress, money worries, exhaustion or awkwardness, include those details naturally.
- If Avoid Style includes a specific issue, avoid that issue completely.

Burn pacing guide:
- Instant attraction: obvious attraction from the first meeting, but still keep emotional stakes believable.
- Fast burn: attraction and tension are clear early, with meaningful romantic escalation soon.
- Medium burn: chemistry is noticeable in Chapter 1, but emotional trust and physical escalation build over several chapters.
- Slow burn: attraction is buried under conflict and denial, with subtle but clear tension.
- Agonising slow burn: tension is intense but restrained, with longing, denial and delayed payoff.

Important continuity rules:
- If the subgenre is Sports Romance and Subgenre Detail is a specific sport, keep that sport consistent.
- For example, if Subgenre Detail is Ice hockey, do not change it to wrestling, football, rugby or another sport.
- If the user selected things they do not want, avoid them completely.
- Do not write a complete story arc in Chapter 1.
- Do not resolve the main conflict in Chapter 1.
- Write Chapter 1 only.
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    return Response.json({
      result: response.output_text,
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
}- Make it emotionally grounded and human.
- Use natural dialogue with subtext.
- Keep character voices distinct.
- Honour the selected POV exactly.
- Do not rush the romance.
- Do not reveal every secret immediately.
- Chapter 1 should hook the reader and end with a reason to continue.
- Target length: 4,000 to 6,000 words.
- Use UK spelling unless the setting clearly requires otherwise.

Anti-AI style rules:
- Do not use em dashes.
- Do not use long dash interruptions.
- Do not overuse similes.
- Avoid repeated sentence openings, especially "Like..." or "As if...".
- Avoid stacked metaphors.
- Avoid purple prose.
- Avoid therapy-speak.
- Avoid characters explaining their feelings too neatly.
- Avoid overly polished banter every line.
- Avoid constant body-part descriptions.
- Avoid phrases like "his jaw clenched", "his breath hitched", "something in his chest", unless genuinely needed.
- Do not make every paragraph sound poetic or dramatic.
- Keep the prose varied, grounded and readable.
- Let tension come from behaviour, dialogue, conflict and withheld information.

Tone handling:
- If tone is gritty, write leaner, rawer and more direct.
- Gritty does not mean poetic misery.
- Gritty should feel physical, lived-in, tense and believable.
- Use shorter sentences when tension rises.
- Use humour sparingly and naturally.
- Keep emotional moments restrained, not overwritten.
- Avoid fancy comparisons unless they feel natural to the narrator.

POV handling:
- If POV is first person, keep the voice intimate and natural.
- If POV is first person dual POV, Chapter 1 may use one POV character only, or clearly labelled sections if both are needed.
- Do not switch POV mid-scene without a clear section break.
- Do not write repeated "Chapter One / Character Name" headers unless useful. Use one clean chapter title.

Story inputs:

Title: ${body.title}
Relationship Type: ${body.relationship}
Subgenre: ${body.subgenre}
Subgenre Detail: ${body.subgenreDetail}
Tropes: ${body.tropes}
Tone: ${body.tone}
Heat Level: ${body.heat}
POV: ${body.pov}
Ending Style: ${body.ending}
Book Length: ${body.length}

Character 1:
Name: ${body.c1Name}
Age: ${body.c1Age}
Appearance: ${body.c1Appearance}
Job / Role: ${body.c1Job}
Personality: ${body.c1Personality}
Flaws: ${body.c1Flaws}
Biggest Desire: ${body.c1Desire}
Biggest Fear: ${body.c1Fear}
Secret: ${body.c1Secret}
Extra Notes: ${body.c1CustomNotes}

Character 2:
Name: ${body.c2Name}
Age: ${body.c2Age}
Appearance: ${body.c2Appearance}
Job / Role: ${body.c2Job}
Personality: ${body.c2Personality}
Flaws: ${body.c2Flaws}
Biggest Desire: ${body.c2Desire}
Biggest Fear: ${body.c2Fear}
Secret: ${body.c2Secret}
Extra Notes: ${body.c2CustomNotes}

Plot:
Setting: ${body.setting}
Optional Plot Notes: ${body.plot}
Main Conflict: ${body.conflict}
What Keeps Them Apart: ${body.keepsApart}
Must-Have Scenes: ${body.mustHave}
Must-Not-Have: ${body.mustNotHave}
Pacing: ${body.pacing}
Plot Intensity: ${body.intensity}

Important:
- If the subgenre is Sports Romance and Subgenre Detail is a specific sport, keep that sport consistent.
- For example, if Subgenre Detail is Ice hockey, do not change it to wrestling, football, rugby or another sport.
- If the user selected things they do not want, avoid them completely.
- Write Chapter 1 only.
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    return Response.json({
      result: response.output_text,
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
