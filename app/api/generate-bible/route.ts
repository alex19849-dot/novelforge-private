import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

function getTargetChapters(length: string) {
  if (length === "Novella") return 10;
  if (length === "Short Novel") return 20;
  if (length === "Long Novel") return 34;
  return 10;
}

function getWordTarget(length: string) {
  if (length === "Novella") return "900-1400";
  if (length === "Short Novel") return "1600-2200";
  if (length === "Long Novel") return "2400-3200";
  return "900-1400";
}

function getMaxTokens(length: string) {
 if (length === "Novella") return 4200;
if (length === "Short Novel") return 6200;
if (length === "Long Novel") return 9000;
return 4200;
}

function getRegionalTerms(locale: string) {
  if (locale === "British English") {
    return {
      regionalLanguage: "British English",
      locationTerms: ["car park", "flat", "phone", "trainers", "dressing room", "locker room", "rink"],
      forbiddenTerms: ["SUV", "parking lot", "apartment", "cell phone", "sneakers", "mom"],
    };
  }

  if (locale === "American English") {
    return {
      regionalLanguage: "American English",
      locationTerms: ["parking lot", "apartment", "cell phone", "sneakers", "locker room", "rink"],
      forbiddenTerms: ["car park", "flat", "trainers", "mum"],
    };
  }

  if (locale === "Canadian English") {
    return {
      regionalLanguage: "Canadian English",
      locationTerms: ["parking lot", "apartment", "phone", "locker room", "rink"],
      forbiddenTerms: ["car park", "flat", "mum"],
    };
  }

  return {
    regionalLanguage: locale || "Neutral International",
    locationTerms: ["phone", "home", "rink", "locker room"],
    forbiddenTerms: [],
  };
}

export async function POST(req: Request) {
  const body = await req.json();

  const targetChapters = getTargetChapters(body.length);
  const wordTarget = getWordTarget(body.length);
  const maxTokens = getMaxTokens(body.length);
  const regional = getRegionalTerms(body.locale);

  const openingStoryState = {
    chapter: 1,
    targetChapters,
    wordTarget,
    relationshipStage: 1,
    physicalStage: body.heat === "Explicit adult" ? 1 : 0,
    trust: 5,
    attraction: body.heat === "Explicit adult" ? 35 : 18,
    irritation: body.tropes?.includes("Enemies to lovers") ? 78 : 45,
    jealousy: 0,
    vulnerability: 2,
   sexualTension:
  body.heat === "Explicit adult"
    ? 40
    : body.heat === "Spicy"
    ? 30
    : body.heat === "Mild"
    ? 18
    : 8,

eroticProgressionStage: 1,
sexualMilestones: [],
usedTouchBeats: [],

nextRequiredEroticBeat:
  body.heat === "Fade to black"
    ? "Focus on emotional intimacy, romantic tension, yearning, affection and meaningful kisses without graphic sexual detail."

    : body.heat === "Mild"
    ? "Build attraction steadily through touching, kissing, longing, emotional closeness and sensual tension without heavy explicit detail."

    : body.heat === "Spicy" &&
      body.burnPacing === "Slow burn"
    ? "Build strong unresolved sexual tension, loaded touches, possessiveness, jealousy and escalating kissing before explicit intimacy."

    : body.heat === "Spicy" &&
      body.burnPacing === "Fast burn"
    ? "Escalate physical intimacy early through heated kissing, roaming hands, body worship, desperation and strong chemistry without stalling repeatedly."

    : body.heat === "Explicit adult" &&
      body.burnPacing === "Slow burn"
    ? "Delay full sexual payoff while heavily escalating tension, obsession, physical awareness, possessiveness and emotionally loaded intimacy."

    : body.heat === "Explicit adult" &&
      body.burnPacing === "Medium burn"
    ? "Escalate physical intimacy steadily with clear progression, stronger touching, heated make-outs and emotional consequences."

    : body.heat === "Explicit adult" &&
      body.burnPacing === "Fast burn"
    ? "Escalate physical intimacy confidently. Do not stall with endless almost-kisses. Progress naturally from touching to heated intimacy with emotional and relational consequences."

    : "Build romance and attraction naturally.",

intimacyAftermath: "",
endingPhase: "opening",
shouldWriteEpilogue: false,
epilogueWritten: false,

lastMajorBeat:
  "story opening and central romantic conflict introduced",
    lastMajorBeat: "story opening and central romantic conflict introduced",
    nextRequiredConsequence: "carry forward the tension, attraction, conflict and practical consequences from Chapter 1",
    activeConflict: body.romanticConflict || body.tropes || "romantic conflict",
    subConflict: body.externalConflict || "",
    childStatus: body.tropes?.includes("Secret child") || body.plot?.toLowerCase().includes("child") ? "child exists only if established clearly and must behave age appropriately" : null,
    exStatus: body.plot?.toLowerCase().includes("ex") ? "ex may create pressure only through believable, seeded behaviour" : null,
    regionalLanguage: regional.regionalLanguage,
    locationTerms: regional.locationTerms,
    forbiddenTerms: regional.forbiddenTerms,
    forbiddenDrift: [
      "random illness",
      "random custody threat",
      "sudden family emergency",
      "unseeded scandal",
      "unseeded blackmail",
      "random accident",
      "American wording if story is British English",
      "calling a locker room only 'the room'",
      "repeating previous generated story beats",
      "inventing major new subplots without setup",
    ],
    storyFingerprint: {
      relationship: body.relationship,
      subgenre: body.subgenre,
      subgenreDetail: body.subgenreDetail,
      trope: body.tropes,
      heat: body.heat,
      burn: body.burnPacing,
      coreIdea: body.plot,
      characterNotes: body.characterNotes,
      mustAvoid: body.mustNotHave,
    },
    endingRunway: "far",
  };

  const prompt = `
You are NovelForge, a private award-focused romance fiction engine.

Write Chapter 1 only.

Return only polished Chapter 1 prose.
Do not return notes.
Do not return the story state.
Do not return headings other than the chapter title and POV headings if required by the selected POV.

STORY INPUTS:
Title: ${body.title}
Relationship Type: ${body.relationship}
Subgenre: ${body.subgenre}
Subgenre Detail: ${body.subgenreDetail}
Book Length: ${body.length}
Target Total Chapters: ${targetChapters}
Chapter Word Target: ${wordTarget}
POV: ${body.pov}
Heat Level: ${body.heat}
Burn Pacing: ${body.burnPacing}
Main Trope: ${body.tropes}
Ending Style: ${body.ending}
Story Idea: ${body.plot}
Character Notes: ${body.characterNotes}
Must-Have: ${body.mustHave}
Must-Not-Have: ${body.mustNotHave}

HIDDEN OPENING STORY STATE:
${JSON.stringify(openingStoryState, null, 2)}

REGIONAL LANGUAGE LOCK:
Use ${regional.regionalLanguage}.
Preferred terms: ${regional.locationTerms.join(", ")}.
Avoid these terms unless a character specifically would use them: ${regional.forbiddenTerms.join(", ")}.
If the setting is British English, prefer car, car park, flat, phone, trainers, mum, dressing room or locker room.
If the setting is American English, prefer parking lot, apartment, cell phone, sneakers, mom, locker room.
If the setting is Canadian English, use natural Canadian wording and hockey vocabulary.

HARD LENGTH RULE:
For Novella:
- Absolute target is 900 to 1400 words.
- Do not exceed 1500 words.
- If approaching the limit, end the chapter cleanly with a hook or emotional turn.
- Do not add another scene just to round things off.

For Short Novel:
- Target 1600 to 2200 words.
- Do not exceed 2400 words.

For Long Novel:
- Target 2400 to 3200 words.
- Do not exceed 3500 words.

If forced to choose between length and extra detail, choose shorter and cleaner.

UNIQUENESS RULE:
This story must feel specific to the user's Story Idea and Character Notes.
Do not default to generic previous romance openings.
Do not reuse stock beats unless the user requested them.
Do not write a recycled version of another rival hockey / secret child / manipulative ex story unless those details are clearly in the current Story Idea.
Prioritise the user's unique premise over trope autopilot.

CHAPTER 1 PURPOSE:
- Open with a strong hook.
- Establish both main leads clearly.
- Establish genre, setting and central conflict quickly.
- Establish the main relationship dynamic.
- Establish attraction if heat is Spicy or Explicit adult.
- Establish friction, resistance or complication.
- Do not reveal every secret.
- Do not solve the emotional conflict.
- Do not create couple-like comfort too soon.
- End with a clean hook, reveal, conflict beat, sexual tension beat, or emotional turn.

CAUSE AND CONSEQUENCE:
Every scene must follow logically from the previous beat.
Before writing each scene, silently check:
1. What just happened?
2. What would each character realistically do next?
3. What emotional state carries forward?
4. What practical consequence follows?
5. Why is this scene necessary?

No random tonal jumps.
No sudden illness.
No unseeded emergencies.
No convenient custody drama.
No random scandal.
No scene drift.

SIDE CHARACTER COHERENCE:
Children:
- behave age appropriately
- do not teleport emotionally
- if upset, show comfort, distraction, exhaustion, or passage of time before playful behaviour
- never use a child only as a lever

Exes:
- must have believable motives
- can use guilt, history, timing, access, concern, or emotional pressure
- do not write cartoon villains
- do not create random threats unless seeded

Friends / teammates:
- should sound distinct
- should not explain the plot for the reader

LOCATION NAMING:
If in a locker room or dressing room, call it locker room, dressing room, changing room, players' room, or another clear regional term.
Do not repeatedly call it "the room".

RELATIONSHIP STATE:
Start at Stage 1 or Stage 2 only.
Stage 1 = hostility
Stage 2 = reluctant awareness
Stage 3 = begrudging respect
Stage 4 = unwanted attraction
Stage 5 = emotional crack
Stage 6 = first surrender
Stage 7 = intimacy
Stage 8 = commitment

Chapter 1 may move no more than one stage.
Trust must stay low.
Attraction may be obvious.
Irritation, pride, denial or resistance should stay alive.
Do not allow emotional safety too early.

PHYSICAL ESCALATION:
Stage 0 = awareness only
Stage 1 = charged proximity
Stage 2 = accidental contact lingers
Stage 3 = deliberate touch
Stage 4 = first kiss
Stage 5 = heated make-out
Stage 6 = sexual touching
Stage 7 = oral / mutual release / explicit play
Stage 8 = penetrative sex / full consummation
Stage 9 = comfortable sexual intimacy

For Chapter 1:
- Fade to black or Mild: Stage 0 to 1.
- Spicy: Stage 1 to 2.
- Explicit adult: Stage 1 to 2.
- If Fast burn + Explicit adult: Stage 2 is allowed, but no full sexual scene in Chapter 1 unless the user explicitly requested it.
- Do not stack first kiss, sexual touching and emotional confession in Chapter 1.

SPICE PACING LOCK:
If Heat Level is Explicit adult and Burn Pacing is Fast burn:
- Chapter 1 must include obvious sexual tension.
- The attraction should feel intrusive, physical and inconvenient.
- Do not delay all heat into vague internal thoughts.
- Do not turn heat into emotional softness.
- Conflict and lust must coexist.

If Heat Level is Explicit adult and Burn Pacing is Medium burn:
- Chapter 1 must include noticeable sexual tension.
- Do not make the chapter feel cold.

If Heat Level is Spicy:
- Include physical awareness, charged proximity and flirt tension.

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

DIALOGUE:
Dialogue must respond logically to the previous line.
Each reply should answer, dodge, challenge, deflect, joke, refuse or escalate.
No random replies to a different conversation.
No endless "You good?" / "Fine." loops.
No over-polished banter every line.

STYLE:
- Natural commercial romance prose.
- Human, readable, emotionally grounded.
- Distinct character voices.
- No em dashes.
- No en dashes.
- No long dash interruptions.
- No therapy-speak.
- No fake profound lines.
- No random object descriptions.
- No over-described rooms.
- No purple prose.
- No repeated symbolic closing lines.
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

    const storyState = {
      ...openingStoryState,
      chapter: 1,
      lastMajorBeat: "Chapter 1 introduced the leads, central conflict, attraction, and opening consequence.",
      nextRequiredConsequence:
        "Chapter 2 must directly follow the emotional and practical fallout from Chapter 1. Do not reset the characters.",
      endingRunway: "far",
    };

    return Response.json({
      result: chapter,
      storyState,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        result:
          "Something went wrong while generating Chapter 1. The app has thrown its toys out of the pram.",
        storyState: openingStoryState,
      },
      { status: 500 }
    );
  }
}
