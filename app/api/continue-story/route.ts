import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

function getMaxTokens(length: string) {
 if (length === "Novella") return 4200;
if (length === "Short Novel") return 6200;
if (length === "Long Novel") return 9000;
return 4200;
}

function nextPhysicalStage(current: number, form: any, chapter: number) {
  const heat = form.heat || "";
  const burn = form.burnPacing || "";

  if (heat !== "Explicit adult") return Math.min(current + 1, 4);

  if (burn === "Fast burn") {
    if (chapter >= 6) return Math.max(current, 6);
    if (chapter >= 5) return Math.max(current, 5);
    if (chapter >= 4) return Math.max(current, 4);
    if (chapter >= 3) return Math.max(current, 3);
    return Math.max(current, 2);
  }

  if (burn === "Medium burn") {
    if (chapter >= 7) return Math.max(current, 6);
    if (chapter >= 6) return Math.max(current, 5);
    if (chapter >= 5) return Math.max(current, 4);
    if (chapter >= 4) return Math.max(current, 3);
    return Math.max(current, 2);
  }

  return Math.min(current + 1, 4);
}

function nextRelationshipStage(current: number, chapter: number) {
  if (chapter <= 2) return Math.min(current + 1, 2);
  if (chapter <= 4) return Math.min(current + 1, 4);
  if (chapter <= 6) return Math.min(current + 1, 5);
  if (chapter <= 8) return Math.min(current + 1, 6);
  return Math.min(current + 1, 8);
}

export async function POST(req: Request) {
  const body = await req.json();

  const form = body.form || {};
  const previousChapter = body.previousChapter || "";
  const nextChapterNumber = body.nextChapterNumber || 2;
  const incomingState = body.storyState || {};

  const maxTokens = getMaxTokens(form.length);

  const targetPhysicalStage = nextPhysicalStage(
    incomingState.physicalStage || 1,
    form,
    nextChapterNumber
  );

  const targetRelationshipStage = nextRelationshipStage(
    incomingState.relationshipStage || 1,
    nextChapterNumber
  );

  const updatedStoryState = {
    ...incomingState,
    chapter: nextChapterNumber,
    relationshipStage: targetRelationshipStage,
    physicalStage: targetPhysicalStage,
    trust: Math.min((incomingState.trust || 5) + 6, 100),
    attraction: Math.min((incomingState.attraction || 35) + 10, 100),
    irritation:
      form.tropes?.includes("Enemies to lovers")
        ? Math.max((incomingState.irritation || 75) - 6, 35)
        : Math.max((incomingState.irritation || 45) - 8, 10),
    jealousy: Math.min((incomingState.jealousy || 0) + 6, 100),
    vulnerability: Math.min((incomingState.vulnerability || 2) + 5, 100),
    sexualTension: Math.min((incomingState.sexualTension || 35) + 12, 100),

eroticProgressionStage: targetPhysicalStage,
sexualMilestones: incomingState.sexualMilestones || [],
usedTouchBeats: incomingState.usedTouchBeats || [],

nextRequiredEroticBeat:
  form.heat === "Fade to black"
    ? "Build romantic intimacy, longing, affection and meaningful kisses without graphic sexual detail."
    : form.heat === "Mild"
    ? "Build sensual tension through kissing, closeness, touch and emotional intimacy without heavy explicit detail."
    : form.heat === "Spicy"
    ? "Escalate with stronger kissing, roaming hands, body awareness, jealousy and sensual payoff while keeping the detail spicy but not fully explicit."
    : form.heat === "Explicit adult" && form.burnPacing === "Fast burn"
    ? "Escalate clearly beyond kissing if the story has reached the right stage. Use character-specific desire, bolder touching, ass grabbing, tasting, grinding, dirty talk, restraint, and consequence. Do not loop endless ribs, waist, sides and almost moments."
    : form.heat === "Explicit adult" && form.burnPacing === "Medium burn"
    ? "Escalate steadily through deeper kissing, roaming hands, bolder physical contact and emotional fallout. Do not let the story feel cold."
    : form.heat === "Explicit adult"
    ? "Build intense erotic tension with clear physical progression, restraint, hunger and emotional consequence."
    : "Build attraction naturally.",

intimacyAftermath:
  targetPhysicalStage >= 5
    ? "Physical intimacy must affect behaviour afterwards through awkwardness, possessiveness, tenderness, panic, jealousy, confidence, guilt, or emotional fallout."
    : incomingState.intimacyAftermath || "",

endingPhase:
  nextChapterNumber >= (incomingState.targetChapters || 10) - 1
    ? "epilogue-ready"
    : nextChapterNumber >= (incomingState.targetChapters || 10) - 3
    ? "resolution-runway"
    : "middle-build",

shouldWriteEpilogue:
  nextChapterNumber >= (incomingState.targetChapters || 10) &&
  incomingState.epilogueWritten !== true,

epilogueWritten: incomingState.epilogueWritten || false,

lastMajorBeat:
      incomingState.nextRequiredConsequence ||
      "carry forward the previous chapter consequence",
    nextRequiredConsequence:
      "The next chapter must directly echo the emotional, physical and practical fallout from this chapter. Do not reset.",
  };

  const prompt = `
You are NovelForge, an award-focused romance continuation engine.

Write Chapter ${nextChapterNumber} only.

Return only polished chapter prose.
No notes.
No outline.
No commentary.
No JSON.

STORY INPUTS:
Title: ${form.title}
Relationship Type: ${form.relationship}
Subgenre: ${form.subgenre}
Subgenre Detail: ${form.subgenreDetail}
Book Length: ${form.length}
POV: ${form.pov}
Heat Level: ${form.heat}
Burn Pacing: ${form.burnPacing}
Main Trope: ${form.tropes}
Ending Style: ${form.ending}
Story Idea: ${form.plot}
Character Notes: ${form.characterNotes}
Must-Have: ${form.mustHave}
Must-Not-Have: ${form.mustNotHave}

CURRENT SAVED STORY STATE:
${JSON.stringify(incomingState, null, 2)}

TARGET UPDATED STATE FOR THIS CHAPTER:
${JSON.stringify(updatedStoryState, null, 2)}

PREVIOUS CHAPTERS:
${previousChapter}

ABSOLUTE CONTINUITY RULE:
Use the saved story state as truth.
Do not invent new major facts unless they directly follow from saved state or previous chapters.
Do not create random illness, sudden custody threats, accidents, scandals, blackmail, family emergencies or new villains unless seeded.
Do not make children emotionally teleport.
Do not make the ex create drama that contradicts timing or location.
Do not reset the characters emotionally at the start of a new chapter.
Every chapter must carry the fallout from the previous chapter.

HARD LENGTH RULE:
For Novella:
- Target 900 to 1400 words.
- Absolute maximum 1500 words.
- If near 1400 words, stop cleanly.
- Do not add another scene.

For Short Novel:
- Target 1600 to 2200 words.
- Absolute maximum 2400 words.

For Long Novel:
- Target 2400 to 3200 words.
- Absolute maximum 3500 words.

If forced to choose, choose shorter, cleaner and sharper.

REGIONAL LANGUAGE LOCK:
Use: ${incomingState.regionalLanguage || form.locale || "British English"}.
Preferred terms: ${(incomingState.locationTerms || []).join(", ")}.
Forbidden terms: ${(incomingState.forbiddenTerms || []).join(", ")}.
If British English, avoid SUV, parking lot, apartment, cell phone, sneakers, mom.
Use car, car park, flat, phone, trainers, mum, dressing room or locker room.
Use regional vocabulary naturally, not as a gimmick.

LOCATION NAMING RULE:
If a scene is in a locker room or dressing room, call it locker room, dressing room, changing room, players' room, or a clear regional equivalent.
Do not repeatedly call it "the room".

UNIQUENESS RULE:
Prioritise the user's Story Idea and Character Notes.
Do not recycle previous generated story beats.
Do not default to generic rival hockey, secret child, ex drama patterns unless this specific story already established them.
Each story must feel specific, not template-based.

CHAPTER ARC RULE:
Use Chapter ${nextChapterNumber} correctly for ${form.length}.

If Novella:
- Chapters 1 to 2: setup, friction, attraction, central situation.
- Chapters 3 to 5: escalation, heat, complications, stakes.
- Chapters 6 to 8: crisis, vulnerability, first surrender or major turn.
- Chapters 9 to 10: resolution and emotional payoff.
Do not keep delaying payoff.
Do not keep adding new subplots.
EROTIC ENGINE V2:
Use the saved erotic state and nextRequiredEroticBeat.

Current erotic progression stage:
${updatedStoryState.eroticProgressionStage}

Next required erotic beat:
${updatedStoryState.nextRequiredEroticBeat}

Intimacy aftermath:
${updatedStoryState.intimacyAftermath}

Rules:
- Erotic scenes must feel character-specific, not generic.
- Do not repeat the same touch beats over and over.
- Avoid looping ribs, waist, sides, hip, breath, almost-kiss, stop.
- Physical escalation should involve varied, natural contact when appropriate: hair, jaw, throat, nape, chest, lower back, arse, thighs, hands, mouth, skin, clothing, pressure, taste, heat, restraint.
- Use desire through action, dialogue, physical response and emotional consequence.
- Do not write clinical mechanics.
- Do not write porn without story.
- Do not make intimacy emotionally cosy before the relationship earns it.
- If the scene is explicit, it must still reveal character, conflict, power shift, trust, fear, need, shame, confidence, vulnerability, or possession.
- If someone says stop, wait, not yet, too much, or no, respect it immediately.
- Consent must be clear.
- All sexual content must involve adults only.
- Keep child scenes, family scenes and sexual scenes clearly separated in time, space and tone.
- If a child has appeared recently in the chapter, do not transition immediately into explicit sexual content without a clear scene break, time shift, privacy and tonal reset.
SPICE PACING LOCK:
If Heat Level is Explicit adult and Burn Pacing is Fast burn:
- By Chapter 3, there must be deliberate charged physical escalation or a deliberate almost-kiss.
- By Chapter 4, the first kiss must happen if it has not already.
- By Chapter 5, heated make-out or sexual touching must happen if not already.
- By Chapter 6, there must be explicit sexual escalation or a clearly interrupted explicit scene.
- Do not delay everything with endless almost moments.
- Do not replace spice with vague staring.
- Keep consent clear.
- Keep conflict alive after physical escalation.

If Heat Level is Explicit adult and Burn Pacing is Medium burn:
- By Chapter 4, there must be a charged almost-kiss or deliberate touch.
- By Chapter 5 or 6, the first kiss should happen unless the plot makes delay necessary.
- By Chapter 7, sexual escalation should be obvious.
- Do not make the book feel cold.

ATTRACTION VARIETY RULE:

Do not repeatedly focus on mouths, lips, or staring at mouths as the default attraction beat.

Rotate attraction cues naturally.

Physical attraction may focus on:
- throat movement while swallowing
- neck
- jaw tension
- hands, fingers, knuckles, veins, wrists
- forearms
- shoulders
- chest
- waist
- hips
- thighs
- back
- height difference
- scent
- warmth
- body heat
- breath on skin
- voice dropping lower
- rough voice
- laugh
- smirk
- bruises
- tattoos
- freckles
- scars
- sweat
- wet hair
- flushed skin
- visible tension in muscles
- proximity
- accidental touch lingering
- jealousy reaction
- possessive instinct
- noticing someone else looking at them
- noticing competence
- noticing tenderness
- noticing exhaustion
- noticing protective behaviour
- noticing vulnerability

Attraction should also rotate between:
- physical noticing
- emotional noticing
- admiration
- jealousy
- protectiveness
- curiosity
- resentment mixed with desire
- shame
- confusion
- possessiveness
- frustration
- fascination

Do not repeat the same attraction beat within close succession.
Vary sensory focus.
Vary emotional reaction.
Keep attraction surprising and character specific.

Avoid repetitive patterns like:
- eyes dropped to mouth
- stared at lips
- watched his mouth
- looked at his lips

Use sparingly, not repeatedly.

PHYSICAL STAGE TARGET:
Current target physical stage for this chapter: ${targetPhysicalStage}.

Stage meanings:
0 = awareness only
1 = charged proximity
2 = accidental contact lingers
3 = deliberate touch
4 = first kiss
5 = heated make-out
6 = sexual touching
7 = oral / mutual release / explicit play
8 = penetrative sex / full consummation
9 = comfortable sexual intimacy

This chapter must respect the target physical stage.
If the story is behind target, catch up naturally.
If the story is ahead, show consequence, fallout, awkwardness, denial or emotional complication.

RELATIONSHIP STAGE TARGET:
Current target relationship stage for this chapter: ${targetRelationshipStage}.

Stage meanings:
1 = hostility
2 = reluctant awareness
3 = begrudging respect
4 = unwanted attraction
5 = emotional crack
6 = first surrender
7 = intimacy
8 = commitment

Do not let emotional trust outrun the stage.
Heat may rise faster than trust.
If enemies-to-lovers, keep pride, resistance, irritation and conflict alive.

CAUSE AND CONSEQUENCE:
Every scene must logically follow the previous scene.
Before writing each scene, silently check:
1. What just happened?
2. What emotional state carries forward?
3. What practical consequence follows?
4. Why is this scene necessary?
5. What changes by the end?

No scene reset syndrome.
No random phone drama.
No sudden illness.
No unexplained child distress.
No ex drama that jumps too fast.
No filler.

SIDE CHARACTER COHERENCE:
Children:
- behave age appropriately
- if upset, show comfort, exhaustion, distraction, or passage of time before playful behaviour
- do not use children only as emotional levers
- do not move them between locations unrealistically

Exes:
- use believable pressure only if seeded
- use guilt, access, timing, history, concern, social pressure or emotional leverage
- do not write cartoon villain dialogue
- do not create random emergencies

Friends / teammates:
- distinct voices
- realistic rhythm
- not exposition machines
- can notice tension, but cannot magically know everything

DIALOGUE FLOW:
Every reply must answer, dodge, challenge, deflect, joke, refuse, or escalate the previous line.
Do not make characters respond to the wrong conversation.
Do not use banter to dodge every emotional beat.
Avoid repetitive check-ins:
- You good?
- You okay?
- Fine.
- Nothing.
- Good.

STYLE:
- Natural commercial romance prose.
- Human, readable, emotionally grounded.
- Distinct voices.
- No em dashes.
- No en dashes.
- No long dash interruptions.
- No therapy-speak.
- No fake profound lines.
- No random object descriptions.
- No over-described rooms.
- No purple prose.
- No stiff formal narration like "I do not" unless intentional.
- Use natural contractions.
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      input: prompt,
      max_output_tokens: maxTokens,
    });

    const chapter = cleanOutput(response.output_text || "");

    return Response.json({
      result: chapter,
      storyState: updatedStoryState,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        result:
          "Something went wrong while continuing the story. The app is sulking in a corner.",
        storyState: incomingState,
      },
      { status: 500 }
    );
  }
}
