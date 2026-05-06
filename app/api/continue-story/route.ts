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

Return only chapter prose. No notes. No outline. No commentary.

STORY CORE:
Title: ${form.title}
Relationship Type: ${form.relationship}
Subgenre: ${form.subgenre}
Subgenre Detail: ${form.subgenreDetail}
Book Length: ${form.length}
POV: ${form.pov}
Heat Level: ${form.heat}
Ending Style: ${form.ending}
Plot Intensity: ${form.intensity}
Age Bracket: ${form.ageBracket}

ROMANCE ENGINE:
Romance Dynamic: ${form.romanceDynamic}
Attraction Style: ${form.attractionStyle}
Attraction Focus: ${form.attractionFocus}
Sexual Style: ${form.sexualStyle}
Spice Timing: ${form.spiceTiming}
Burn Pacing: ${form.burnPacing}
Tropes: ${form.tropes}

MM / MF NUANCE:
MM Nuance: ${form.mmNuance}
MF Nuance: ${form.mfNuance}

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
Wound: ${form.c1Wound}
Love Language: ${form.c1LoveLanguage}
Attachment Style: ${form.c1Attachment}
Jealousy Style: ${form.c1Jealousy}
Flirting Style: ${form.c1Flirting}
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
Wound: ${form.c2Wound}
Love Language: ${form.c2LoveLanguage}
Attachment Style: ${form.c2Attachment}
Jealousy Style: ${form.c2Jealousy}
Flirting Style: ${form.c2Flirting}
Extra Notes: ${form.c2CustomNotes}

PLOT ARCHITECTURE:
Setting: ${form.setting}
External Conflict: ${form.externalConflict}
Internal Conflict: ${form.internalConflict}
Romantic Conflict: ${form.romanticConflict}
Must-Have Scenes: ${form.mustHave}
Must-Not-Have: ${form.mustNotHave}
Plot Notes: ${form.plot}

VOICE AND STYLE:
Locale: ${form.locale}
Regional Voice: ${form.regionVoice}
Author Flavour: ${form.authorFlavour}
Writing Style: ${form.voiceStyle}
Dialogue Style: ${form.dialogueStyle}
Prose Density: ${form.proseDensity}
Chapter Opener: ${form.chapterOpener}
Ending Glow: ${form.endingGlow}
Real-World Grounding: ${form.grounding}
Avoid Style: ${form.avoidStyle}

PREVIOUS CHAPTERS:
${previousChapter}

TARGET STORY LENGTH ENGINE:
Infer the target total story length from Book Length.

If Book Length is Novella:
- Target 8 to 12 chapters total.
- Chapters 1 to 2 = setup, friction, attraction, central situation.
- Chapters 3 to 5 = escalation, complications, stronger heat, stronger stakes.
- Chapters 6 to 8 = crisis, vulnerability, major turning point or first surrender.
- Final 2 to 3 chapters = resolution, emotional payoff, ending glow.
- Do not keep adding new major subplots after the midpoint.
- Begin steering toward resolution from Chapter 8 onward.

If Book Length is Short Novel:
- Target 16 to 24 chapters total.
- Chapters 1 to 4 = setup.
- Chapters 5 to 10 = escalation.
- Chapters 11 to 16 = crisis and fallout.
- Final 3 to 5 chapters = resolution and ending glow.

If Book Length is Long Novel:
- Target 28 to 40 chapters total.
- Allow more subplot development, but still move every chapter forward.

CURRENT CHAPTER ARC RULE:
Use Chapter ${nextChapterNumber} appropriately within the selected length.
Do not wander.
Do not add filler.
Do not introduce random new problems just to extend the story.
Each chapter must move the relationship, plot, conflict, or heat forward.

STRICT LENGTH:
- If Book Length is Novella, write 1,000 to 1,500 words.
- If Book Length is Short Novel, write 1,600 to 2,400 words.
- If Book Length is Long Novel, write 2,400 to 3,500 words.
- Do not stop mid-sentence.
- End with a clean hook, reveal, conflict beat, sexual tension beat, or emotional turn.

CONTINUITY ENGINE:
Before writing, silently extract and remember:
- who said each memorable line
- who knows each secret
- who touched whom and when
- current relationship status
- current injuries and bruises
- current living situation
- unresolved threats
- promises made
- money problems
- family or child-related responsibilities
- emotional state at the end of the previous chapter

Do not contradict previous chapters.
Do not assign a quote, memory, action, secret, or emotional beat to the wrong character.
Do not repeat the same reveal as if it is new.
Do not forget injuries, living arrangements, relationship tension, or unresolved problems.
If uncertain, avoid referencing the detail rather than making one up.

SCENE FLOW RULE:
Every scene must move the story forward.

Each scene needs:
- a clear purpose
- a conflict beat
- a relationship beat
- a plot beat
- a reason to keep reading

Do not add random setting description unless it affects mood, character, tension, or plot.
Do not describe objects just because they exist.
Avoid repeated environmental details like pipes, radiators, coffee, walls, floors, windows, weather, smells, or light unless they matter in the scene.
The relationship must grow through actions, choices, friction, mistakes, jealousy, restraint, consequences and dialogue.
Do not rely only on internal thoughts or body awareness.

RELATIONSHIP STATE TRACKER:
Internally infer the current romance stage from previous chapters.

Stage 1 = hostility
Stage 2 = reluctant awareness
Stage 3 = begrudging respect
Stage 4 = unwanted attraction
Stage 5 = emotional crack
Stage 6 = first surrender
Stage 7 = intimacy
Stage 8 = commitment

Rules:
- Move the relationship forward by no more than one stage per chapter.
- Do not jump from hostility to emotional caretaking.
- Do not jump from rivalry to couple-like comfort.
- Do not let physical heat automatically create emotional trust.
- Heat can rise faster than trust.
- Conflict and attraction can coexist.
- If enemies-to-lovers is selected, keep irritation, pride and resistance alive even when attraction rises.
- If a vulnerable moment happens early, make the character resist, snap, retreat, deny, deflect or regret being seen.

Hidden sliders:
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

HEAT RULES:
If Heat Level is Fade to black:
- Build attraction and romance normally.
- Keep intimate scenes closed door.

If Heat Level is Mild:
- Include clear attraction, body awareness, lingering looks, charged touch and flirt tension.
- Kissing and sensual moments may happen naturally.
- Keep intimate scenes light and non-graphic.

If Heat Level is Spicy:
- Attraction should feel physical and distracting.
- Include body awareness, charged proximity, jealous reactions, intrusive attraction thoughts and flirt tension.
- Sexual tension should feel present, not absent.
- Characters should notice selected attraction focus naturally: ${form.attractionFocus}.

If Heat Level is Explicit adult:
- Sexual tension must stay present.
- Attraction should feel physical, intrusive, distracting and difficult to ignore.
- Characters should have unwanted attraction thoughts they resist.
- Proximity should sometimes feel charged.
- Jealousy, possessiveness and body awareness should show up.
- Dialogue may carry flirt tension, dirty humour or sharp chemistry.
- For Medium burn:
  Chapter 1 = noticeable attraction and sexual tension.
  Chapter 2 = stronger tension.
  Chapter 3 = obvious charged chemistry or near moments.
  Chapter 4+ = escalating physical payoff.
- Do not make them emotionally soft too quickly.
- Keep conflict high while heat rises.
- Attraction should annoy, unsettle or inconvenience them.
- Heat can rise faster than trust.

SEXUAL STYLE RULE:
Use the selected sexual style as flavour, not as a random checklist.
Selected sexual style: ${form.sexualStyle}

If selected style includes Teasing:
- Use verbal sparring, baiting, restraint and charged humour.

If selected style includes Jealous heat:
- Let jealousy show through reaction, tension, silence, sharp comments or possessive awareness.

If selected style includes Rough edge:
- Make tension physical and sharp, but always consensual and adult.

If selected style includes Tender:
- Save tenderness until the relationship stage earns it.

If selected style includes Filthy talk:
- Use sparingly and naturally.
- Do not force explicit dialogue unless the scene genuinely supports it.

TROPE RULES:
If Tropes includes "Enemies to lovers":
- Maintain genuine friction for several chapters.
- Attraction may intensify, but trust should build slowly.
- Do not soften them too quickly.
- Do not make them behave like comfortable partners too early.
- Make clashes, pride, rivalry, resentment, distrust or opposing choices affect their behaviour.
- If a kiss has not happened and Burn Pacing is Slow burn or Agonising slow burn, delay it.
- If a kiss already happened too early, treat it as a problem, mistake or source of conflict, not instant romance.
- Do not let a kiss solve anything.
- Keep emotional vulnerability reluctant and costly.

If Tropes includes "Forced proximity":
- Use proximity to create inconvenience, tension, temptation and conflict.
- Do not let shared space become cosy too quickly.

If Tropes includes "Second chance":
- Track old wounds accurately.
- Do not resolve past hurt too soon.

If Tropes includes "Slow burn" or Burn Pacing is Slow burn or Agonising slow burn:
- Keep emotional and physical escalation restrained.
- Use denial, longing, avoidance, jealousy and charged moments.
- Do not rush into sex or confessions.

CHARACTER DEPTH RULE:
Characters must behave from their wounds, fears, desires, attachment style, jealousy style, flirting style and love language.
Do not dump backstory.
Reveal wounds through behaviour, avoidance, reactions, choices and conflict.
Make their connection grow through earned moments, not sudden emotional speeches.

MM / MF CALIBRATION:
If Relationship Type is MM Romance:
- Honour the selected MM nuance.
- Do not make either character a stereotype.
- Masculinity, softness, vulnerability, dominance and tenderness should be character-led.
- Queer identity themes should only be central if selected.
- If "No homophobia plot" is selected, do not create a homophobia subplot.

If Relationship Type is MF Romance:
- Honour the selected MF nuance.
- Do not make the heroine weak unless specifically requested.
- Protective behaviour must not erase the heroine's agency.
- Modern or traditional gender dynamics should follow the selected nuance.

NATURAL SPEECH RULE:
Write like real modern people.

Use natural contractions:
- I'm
- I've
- I'd
- I'll
- you're
- you've
- you'll
- we're
- we've
- he's
- she's
- it's
- that's
- there's
- don't
- doesn't
- didn't
- can't
- couldn't
- won't
- wouldn't
- isn't
- aren't
- wasn't
- weren't

Avoid stiff constructions unless a character is intentionally formal.

Avoid:
- I do not
- I am not
- It is
- He is
- She is
- They are
- That is
- There is
- I cannot
- I will not

Prefer:
- I don't
- I'm not
- it's
- he's
- she's
- they're
- that's
- there's
- I can't
- I won't

Narration should sound modern, not formal, literary, robotic, or old-fashioned.

PHRASE REPETITION RULE:
Avoid repeating emotional check-in lines.

Do not overuse:
- You good?
- You okay?
- Are you okay?
- Fine.
- Nothing.
- Good.

If concern is shown, vary the wording.

Examples:
- You look wrecked.
- That shoulder's ugly.
- You look tired.
- You limping?
- You're quiet tonight.
- What's eating you?
- You look like hell.
- Stop grimacing.

STYLE RULES:
- Natural commercial romance prose.
- Distinct character voices.
- Natural dialogue with subtext.
- No em dashes.
- No therapy-speak.
- No fake profound lines.
- No impossible physical actions.
- No purple prose.
- No over-described rooms.
- No random object descriptions.
- No repeated symbolic closing lines.
- No “electric touch”, “storm in his eyes”, “second heartbeat”, “his breath hitched”, unless rare and genuinely needed.
- Use the selected locale consistently.
- Honour the selected POV exactly.
`;

  try {
    const draftResponse = await openai.responses.create({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      input: draftPrompt,
      max_output_tokens: 8000,
    });

    const draft = draftResponse.output_text;

    const editorPrompt = `
You are NovelForge's strict human-style romance editor.

Rewrite and clean this draft Chapter ${nextChapterNumber} into the FINAL version.

Return only final Chapter ${nextChapterNumber} prose. No notes.

USER STORY SETTINGS:
Relationship Type: ${form.relationship}
Subgenre: ${form.subgenre}
Subgenre Detail: ${form.subgenreDetail}
Tropes: ${form.tropes}
Romance Dynamic: ${form.romanceDynamic}
Attraction Style: ${form.attractionStyle}
Attraction Focus: ${form.attractionFocus}
Heat Level: ${form.heat}
Sexual Style: ${form.sexualStyle}
Spice Timing: ${form.spiceTiming}
Burn Pacing: ${form.burnPacing}
Book Length: ${form.length}
POV: ${form.pov}
Locale: ${form.locale}
Regional Voice: ${form.regionVoice}
Author Flavour: ${form.authorFlavour}
Writing Style: ${form.voiceStyle}
Dialogue Style: ${form.dialogueStyle}
Prose Density: ${form.proseDensity}
Must-Not-Have: ${form.mustNotHave}
Avoid Style: ${form.avoidStyle}
MM Nuance: ${form.mmNuance}
MF Nuance: ${form.mfNuance}

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
8. Strengthen the selected trope.
9. Keep the chapter ending complete and clean.
10. Do not stop mid-sentence.
11. Do not add notes, headings, bullet points, or commentary.
12. Make heat level actually match the selected heat setting.
13. If Spicy or Explicit adult is selected, increase sexual tension naturally.
14. For Medium burn, make chemistry escalate steadily, not slowly stall.
15. Add charged looks, body awareness, jealousy, flirt tension, proximity and resisted attraction where appropriate.
16. Keep conflict and heat rising together.
17. Cut random setting description.
18. Make every scene move the story forward.
19. Make the relationship progression clear and logical.
20. Ensure the chapter fits the selected MM or MF nuance.
21. Ensure Chapter ${nextChapterNumber} fits the target story phase for ${form.length}.
22. Do not introduce random new subplots unless the selected length has room for them.

STORY FLOW EDIT:
Cut decorative description that does not affect character, tension, plot or mood.
Make every paragraph earn its place.
Make the relationship progression clear and logical.
Ensure each scene changes something.
If nothing changes in a scene, rewrite or cut it.
Do not describe objects just because they exist.
Avoid repeated environmental details like pipes, radiators, coffee, walls, floors, windows, weather, smells, or light unless they matter in the scene.

CONTINUITY EDIT:
Do not contradict previous chapters.
Do not assign a line, memory, secret, injury, object, relationship status, or emotional beat to the wrong character.
Do not repeat a reveal as if it is new.
If uncertain, keep the reference vague rather than making up a false detail.
Respect current injuries, living arrangements, emotional fallout, money problems, responsibilities and unresolved threats.

RELATIONSHIP STATE EDIT:
- Infer current stage from previous chapters.
- Move the romance forward by no more than one stage.
- Do not let heat create sudden emotional trust.
- Do not turn rivalry into comfort too early.
- If the chapter becomes too soft too early, add resistance, pride, awkwardness, irritation or denial.
- If a vulnerable moment happens early, make the character resist, snap, retreat, deny, deflect or regret being seen.
- Heat can rise faster than trust.
- Attraction should not erase conflict.

ENEMIES TO LOVERS EDIT:
If "Enemies to lovers" is selected:
- Increase friction if the chapter feels too soft.
- Make softness feel reluctant, unwanted or resisted.
- Add conflict through behaviour, competition, pride, suspicion, resentment or emotional defence.
- Remove anything that makes them feel too couple-like too early.
- Attraction should feel inconvenient, irritating or unwanted.
- Do not let a kiss, touch, or vulnerable moment solve the conflict.

HEAT EDIT:
If Heat Level is Spicy:
- Ensure attraction feels physical and noticeable.
- Add body awareness, charged proximity, jealous reactions, intrusive attraction thoughts and flirt tension where appropriate.
- Use the selected attraction focus naturally: ${form.attractionFocus}.

If Heat Level is Explicit adult:
- Ensure sexual tension stays present.
- Make attraction feel physical, intrusive, distracting and resisted.
- Add charged proximity, body awareness, jealousy, dirty humour, sharp chemistry or unwanted attraction where appropriate.
- For Medium burn, chemistry must escalate steadily.
- Do not make the scene emotionally soft just to make it hot.
- Keep all attraction consensual and adult.

SEXUAL STYLE EDIT:
Use selected sexual style naturally: ${form.sexualStyle}
Do not force the sexual style into every scene.
If tenderness appears too early, convert it into tension, restraint, irritation or resisted awareness.
If spice timing is ${form.spiceTiming}, respect that timing while still building sexual tension.

TARGET LENGTH / ENDING EDIT:
If Book Length is Novella:
- Keep the story on an 8 to 12 chapter path.
- If Chapter ${nextChapterNumber} is 1 to 2, keep setting up central tension.
- If Chapter ${nextChapterNumber} is 3 to 5, escalate heat, conflict and stakes.
- If Chapter ${nextChapterNumber} is 6 to 8, move toward crisis, vulnerability, major turn or first surrender.
- If Chapter ${nextChapterNumber} is 9 or later, begin resolution and ending payoff.
- Do not add major new subplots after the midpoint.

If Book Length is Short Novel:
- Keep the story on a 16 to 24 chapter path.
- Do not rush final payoff too early.

If Book Length is Long Novel:
- Keep the story on a 28 to 40 chapter path.
- Allow subplots, but every subplot must affect the main romance or main conflict.

NATURAL SPEECH EDIT:
Rewrite stiff formal phrasing into natural modern phrasing.
Use contractions naturally.
Avoid:
- I do not
- I am not
- It is
- He is
- She is
- They are
- That is
- There is
- I cannot
- I will not

Prefer:
- I don't
- I'm not
- it's
- he's
- she's
- they're
- that's
- there's
- I can't
- I won't

PHRASE REPETITION EDIT:
Avoid repeated check-in lines.

Do not overuse:
- You good?
- You okay?
- Are you okay?
- Fine.
- Nothing.
- Good.

Vary concern through character-specific language.

LENGTH EDIT:
- If Book Length is Novella, final chapter should be 1,000 to 1,500 words.
- If Book Length is Short Novel, final chapter should be 1,600 to 2,400 words.
- If Book Length is Long Novel, final chapter should be 2,400 to 3,500 words.
- If too long, cut repetition, random description and over-explaining.
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
- random object descriptions
- repeated environmental details

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
