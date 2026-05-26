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
  const voicePack = getStoryVoicePack();

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
function getStoryVoicePack() {
  const packs = [
    {
      name: "Sharp Commercial",
      style:
        "Fast-moving commercial romance voice with sharp banter, punchy dialogue, sexual tension and emotional momentum.",
    },
    {
      name: "Emotional Contemporary",
      style:
        "Emotionally immersive romance voice with deeper introspection, slower emotional beats and stronger vulnerability.",
    },
    {
      name: "Dark Intense",
      style:
        "Moodier romance voice with heavier tension, darker emotional atmosphere, sharper conflict and less humour.",
    },
    {
      name: "Playful Sexy",
      style:
        "Flirty, sexy, playful romance voice with stronger chemistry, teasing dialogue and lighter emotional rhythm.",
    },
    {
      name: "Lyrical Intimate",
      style:
        "More intimate and atmospheric prose with emotional detail, sensory immersion and softer pacing.",
    },
  ];

  return packs[Math.floor(Math.random() * packs.length)];
}
  const bannedNames = [
  "Asher",
  "Mason",
  "Rafe",
  "Rafael",
  "Eli",
  "Luca",
  "Nate",
  "Noah",
];
  const prompt = `
You are NovelForge, a private award-focused romance fiction engine.

Write Chapter 1 only.

Return only polished Chapter 1 prose.
Do not return notes.
Do not return the story state.
Do not return headings other than the chapter title and POV headings if required by the selected POV.

CHAPTER TITLE RULE:

- Do not duplicate the chapter label
- If POV format is used, format like:
  Chapter 1
  NOAH

- Do NOT write:
  Chapter 1 Chapter 1 NOAH
  or any repeated numbering

- Only include the chapter number once

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

REALISTIC WORLD BUILDING:

Settings must feel natural and grounded without over-description.

Do:
- include small, specific details (sounds, movement, background activity)
- show environment through character interaction
- vary locations so scenes don’t feel repetitive

Avoid:
- long descriptive paragraphs
- listing details without purpose
- repeating the same setting descriptions

The environment should feel lived-in, not explained.

If description does not add atmosphere or context, remove it.

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

CHARACTER VISUAL IMMERSION RULE:

When introducing main characters:
- Give a clear, specific visual impression within their first appearance
- Combine physical traits with movement, posture, clothing, and presence
- Avoid vague descriptions like "attractive" or "good looking"
- Use concrete, memorable details (height, build, hair texture, skin tone, scars, tattoos, expressions, voice, mannerisms)
- Show how they carry themselves, not just how they look
- Anchor attraction to specific physical details, not generic statements

Do not dump full description in one block.
Layer details naturally through action, dialogue and interaction.

ENDING STRUCTURE RULE:
Stories must naturally progress toward a final chapter and epilogue.
Do not continue endlessly once the emotional and romantic arcs are complete.

Final chapters should:
- resolve the central emotional conflict
- resolve the romantic arc
- deliver payoff and consequence
- reduce introduction of major new conflicts

Epilogues should:
- feel softer and emotionally rewarding
- show relationship stability, future promise, healing, domestic intimacy, success or emotional closure
- clearly feel like an ending
- be labelled "Epilogue" automatically

FINAL STRUCTURE LOCK:

When the story approaches its final chapters:

- Do NOT restart the story
- Do NOT generate new "Chapter 1"
- Do NOT repeat epilogues
- Do NOT introduce new major plotlines

Final structure must be:

- Final Chapter → resolves main conflict and relationship
- Epilogue → optional, softer, future-facing closure

Only ONE epilogue is allowed.

Once the epilogue is written:
- the story must end
- no further chapters should be generated

If the story is complete, stop.

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

EMOTIONAL INTIMACY REQUIREMENT:

The story must include meaningful non-sexual intimacy between the main characters.

This includes:
- conversations where they learn about each other
- personal questions that are avoided, deflected or partially answered
- moments of vulnerability (small, not dramatic)
- quiet scenes (car rides, late night talks, post-case decompression, shared space)
- noticing habits, routines, reactions

Do NOT rely only on:
- tension
- arguments
- sexual interaction

Characters must:
- become curious about each other
- notice details beyond physical attraction
- learn things they didn’t expect

These moments must feel natural, not forced or overly emotional.

If the relationship progresses without emotional familiarity, the output is incorrect.

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

- Fade to black or Mild: Stage 0 to 1
- Spicy: Stage 1 to 2

- Explicit adult:
  - Stage 2 MUST be reached (charged proximity and lingering contact)
  - Attraction must feel physical, intrusive and noticeable
  - Do not keep attraction purely internal

- Explicit adult + Fast burn:
  - Stage 3 is allowed (deliberate touch)
  - Do not stall with only looks or thoughts
  - Include at least one clear physical interaction (touch, grab, contact, or deliberate proximity)

Do not stack kiss + full escalation in Chapter 1, but do not keep it passive.

SPICE PACING LOCK:
If Heat Level is Explicit adult and Burn Pacing is Fast burn:

- Chapter 1 must include clear physical awareness and at least one deliberate or lingering contact
- Chapter 2 must escalate physical interaction beyond the previous chapter (more deliberate touch, tension that is acted on, not just thought about)
- Chapter 3 MUST include a kiss or clearly interrupted kiss
- Chapter 4 MUST include a kiss if it has not already happened

Do not delay escalation with repeated tension, staring, or internal thoughts.

Do not repeat:
- almost-kiss loops
- touch → stop → repeat cycles

Each chapter must move further physically than the previous one.

Failure to escalate is incorrect output.

ESCALATION TIMING ENFORCEMENT:

Escalation must occur within a realistic timeframe based on burn pacing and book length.

For Short Novel + Medium Burn:
- clear physical escalation must occur by 30–40% of the story
- penetrative or full sexual intimacy must occur before 65% of the story

For Fast Burn:
- penetrative or full intimacy must occur no later than 50% of the story

If the story progresses beyond these points without escalation:
- correct immediately
- do not delay further
- do not continue lower-level interaction

Delaying escalation beyond this point is incorrect output.

HEAT CALIBRATION RULES:
- Explicit adult means the story must show sexual intimacy on page once the physical stage reaches 6 or higher.
- Do not fade to black during major intimacy scenes.
- Do not rely on vague phrases like "they lost themselves", "things went further", or "the rest was heat".
- Use direct adult language naturally when the scene calls for it.
- Physical intimacy must progress beyond kissing and grinding in a fast-burn novella.
Fade to black:
- Focus on romance, attraction, emotional intimacy and unresolved tension.
- Fade out before explicit sexual detail.
- Do not describe explicit sexual acts in detail.

Mild:
- Allow sensual scenes, kissing, touching, partial undressing, heated make-outs and implied intimacy.
- Sexual scenes may be partially shown but should not become graphically explicit.
- Prioritise emotional intimacy and sensuality over graphic detail.

Spicy:
- Include fully shown sexual scenes with clear physical progression and direct adult language.
- Allow explicit body part references, oral sex, manual stimulation, possessiveness, desperation and stronger physical detail.
- Sex scenes should feel immersive, emotionally charged and physically specific.
- Do not fade away from major intimacy scenes.

Explicit adult:
- Sexual scenes should be graphic, immersive, emotionally intense and physically detailed.
- Use confident erotic prose rather than vague implication.
- Physical intimacy should escalate naturally across the story.
- Once characters become sexually active, do not repeatedly stall progression with endless interruptions or near-misses.
- Allow explicit body part language, explicit sexual acts, varied sexual dynamics and descriptive physical reactions when natural to the scene.
- Sex scenes should still remain character-driven, emotionally grounded and connected to relationship progression.

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

DIALOGUE VARIETY AND BALANCE:

Do not default to constant sarcasm, banter or insulting dialogue.

Balance dialogue between:
- tension and conflict
- normal conversation
- genuine interaction
- quieter, more sincere moments

Not every exchange should be:
- sarcastic
- confrontational
- sharp or cutting

Characters must:
- occasionally speak plainly
- ask real questions
- respond without deflection
- show curiosity about each other

If dialogue becomes repetitive in tone (e.g. constant snark or banter):
- shift the dynamic
- soften the interaction
- introduce variation

Dialogue must feel human and varied, not one-note.

EMOTIONAL RANGE IN INTERACTION:

Characters must not rely on a single communication style.

Across the story, include:
- tension and friction
- humour and lightness
- quiet or neutral interaction
- moments of vulnerability

If characters only communicate through conflict or sarcasm:
- correct immediately
- introduce more grounded and real conversation

Emotional variation is required for believable connection.

DIALOGUE REALISM RULE:

Dialogue must sound like real people speaking, not written lines.

Avoid:
- overly structured responses
- perfectly phrased comebacks every line
- constant sharp banter
- characters always having the “right” reply

Include:
- interruptions
- unfinished thoughts
- short replies
- overlapping intention (what they say vs what they mean)
- moments where characters don’t respond directly

Characters should:
- deflect
- avoid questions
- change subject
- say the wrong thing
- hesitate

Not every line needs impact.

Silence, avoidance and awkwardness are valid and important.

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

 NAME VARIETY RULE:
Avoid repeatedly generating overused modern romance names.
Prioritise varied, memorable, culturally appropriate names that fit the setting and characters.
Avoid defaulting to the same popular hockey romance names repeatedly.
Recently overused names:
${bannedNames.join(", ")}
VOICE PACK:
${voicePack.name}

VOICE DIRECTION:
${voicePack.style}

Each story must develop its own narrative identity.
Do not default to the same dialogue cadence, humour rhythm, banter style, sentence structure or emotional pacing as previous stories.
Some stories should feel sharper, softer, darker, funnier, moodier, more introspective, more erotic or more emotionally vulnerable depending on the premise.

 WORD REPETITION RULE:
Avoid repeatedly using the same emotional filler words, adverbs or descriptive phrasing across scenes.

Strongly limit repetition of:
- emotionally
- softly
- quietly
- gently
- carefully
- warmly
- breathlessly
- tension
- heat
- ache
- pulse
- shiver
- silently

Avoid repetitive sentence structures and emotional phrasing.
If similar wording has appeared recently, choose fresher language or restructure the sentence entirely.

PATTERN DETECTION RULE:

Before writing a sentence, check for recent phrasing patterns.

If similar wording, rhythm or phrasing has appeared in the last few paragraphs:
- restructure the sentence
- change wording completely
- vary sentence length and flow

Do not reuse:
- identical emotional phrasing
- repeated sentence openings
- repeated rhythm patterns

If writing feels familiar or repeated, rewrite it.

GLOBAL LENGTH CONTROL:

Target total story length:

- Novella: 20,000 to 40,000 words MAX (including epilogue)
- Short Novel: 40,000 to 70,000 words MAX
- Long Novel: 70,000 to 110,000 words MAX

The story MUST remain within this total range.

If the story is approaching the upper limit:
- Begin accelerating resolution
- Reduce filler scenes
- Increase plot progression and payoff

Do not continue adding new chapters once the story has reached its intended length.

ESCALATION LOOP PREVENTION:

Do not repeat the same escalation pattern.

The following loop is forbidden:
- tension → physical contact → partial release → reset → repeat

If a similar interaction has already occurred:
- the next interaction MUST escalate beyond it
- the emotional or power dynamic MUST change

If escalation does not change, the output is incorrect.

SCENE VARIETY ENFORCEMENT:

Each explicit or intimate scene must be structurally different.

You MUST vary:
- physical positioning
- pacing (slow, rushed, aggressive, controlled)
- emotional tone (anger, need, jealousy, vulnerability, control)
- location and context
- who initiates and who leads

Do not repeat:
- identical body positioning
- identical scene rhythm
- identical initiation pattern

If two scenes feel similar in structure, the output is incorrect.

SCENE PROGRESSION STRUCTURE:

Each major intimate interaction must follow a progression:

1. First release → messy, impulsive, uncontrolled
2. Second → more controlled, testing boundaries
3. Third → clear power shift between characters
4. Fourth → confrontation mixed with intimacy (emotion + conflict)
5. Fifth → full loss of control, emotional and physical consequences

Do not repeat the same type of scene twice.

Each stage must feel different in:
- control
- tone
- intention

CONSEQUENCE RULE:

Every intimate scene must change something:

- relationship dynamic
- emotional state
- power balance
- trust or conflict level

If a scene ends and nothing changes, it is incorrect.

Do not return to neutral after intimacy.

INTENSITY REQUIREMENT:

Do not default to safe, repetitive or softened interactions.

Avoid:
- vague descriptions
- repeated soft escalation
- emotional neutrality

Scenes must feel:
- specific to the characters
- varied in tone
- driven by tension and consequence

Do not reduce intensity once escalation has begun.

PROGRESSION LOCK:

Once the story reaches a higher level of intimacy:
- it must not revert to earlier stages

Do not return to:
- only tension
- only minor contact
- early-stage interactions

Progression must move forward or deepen, never reset.

DIALOGUE VARIATION RULE:

Avoid repeating signature phrases or verbal beats across chapters.

Do not reuse phrases such as:
- “Careful”
- “Don’t”
- “There it is”
- “There he is”

If a phrase or tone has already been used, replace it with:
- different wording
- different sentence structure
- or remove it entirely

Dialogue must feel natural, character-specific, and varied. Repetition signals weak writing and must be avoided.

CONTINUITY RULE:

All scenes must logically follow previous events.

Before writing a scene, check:
- character location
- recent interactions
- established actions

Do not introduce actions that contradict earlier events.

If a detail has already been established (e.g. a character already met earlier), do not create a new reason that conflicts with it.

Scenes must feel grounded, not patched together.

CHARACTER VOICE DIFFERENTIATION:

Each main character must have a clearly distinct voice.

For every story:
- define how each character speaks, thinks and reacts
- ensure their tone, rhythm and vocabulary differ

Characters should differ in:
- sentence length (short vs longer phrasing)
- emotional expression (controlled vs reactive)
- directness (blunt vs evasive)
- humour style (dry, sarcastic, playful, none)
- confidence level (dominant, uncertain, defensive, quiet)

Do not allow both characters to:
- speak with the same rhythm
- use the same phrasing patterns
- respond in the same emotional way

Dialogue and internal narration must reflect personality differences at all times.

If both characters sound similar, the output is incorrect.

STORY-LEVEL VOICE IDENTITY:

Each story must establish a distinct narrative voice early.

This includes:
- sentence rhythm (short, sharp vs longer, smoother)
- tone (gritty, emotional, sarcastic, restrained, intense)
- dialogue style (minimal, reactive, playful, blunt)

Do not reuse:
- the same narration style
- the same dialogue cadence
- the same emotional pacing from previous stories

Each book should feel like it was written in a slightly different voice.

If the tone feels similar to a previous story, adjust it.

VOICE ANCHOR:

Early in the story, establish each character’s speaking style through dialogue.

Once established:
- maintain that voice consistently
- do not shift tone or style unless the character is emotionally affected

Voice must feel stable and recognisable across chapters.

INTIMACY REALISM RULE:

Do not rely on repeated explicit verbal consent phrases.

Instead:
- show mutual intent through body language
- show awareness through reaction and response
- use tension, hesitation, and choice

Avoid repetitive lines such as:
- “tell me you want this”
- “is this okay”
- “say it”

Consent should be clear through context and character behaviour, not constant verbal repetition.

Interactions must feel natural, not scripted or overly formal.

INTIMACY DEPTH RULE:

Intimate scenes must feel varied, specific and character-driven.

Avoid:
- repeating the same sequence of actions
- defaulting to the same type of interaction
- vague or generic phrasing

Each scene must:
- feel physically distinct
- reflect the current emotional dynamic
- include clear escalation in intensity or control

Include variation in:
- pacing (slow, controlled, urgent, rough, hesitant)
- tone (tender, possessive, frustrated, curious, dominant, reactive)
- focus (who is in control, who is reacting)

Intimacy must feel:
- intentional
- reactive to previous scenes
- emotionally and physically connected

If scenes feel similar to previous ones, they must be changed.

INTIMACY TYPE ROTATION:

Do not repeat the same type of sexual interaction across multiple scenes.

Scenes must rotate between:
- slower, exploratory intimacy
- urgent or impulsive encounters
- dominant or controlled dynamics
- emotionally driven or vulnerable scenes

If a previous scene focused on one type (e.g. oral-focused or passive interaction):
- the next must shift type

Repeated focus on the same act or structure is incorrect.

ANTI-PATTERN RULE:

Do not reuse:
- identical sentence rhythm
- repeated scene framing
- repeated escalation beats

Each scene must feel newly constructed, not generated from a template.

If the structure feels familiar, change it.

INTIMACY PROGRESSION & VARIETY (MANDATORY):

If this is a FAST BURN, EXPLICIT adult romance.

By early-to-mid story, the relationship must progress beyond:
- kissing
- hand stimulation
- oral-only interactions

These may occur, but must NOT be the dominant or repeated pattern.

The story MUST include a range of distinct intimate scenes across the narrative, including:
- slower, emotionally grounded intimacy
- urgent, impulsive encounters
- more intense, dominant/controlled dynamics
- varied physical interaction styles

Each scene must differ in:
- pacing (slow, rushed, controlled, aggressive)
- tone (tender, tense, confrontational, possessive)
- initiation (who leads and how)
- emotional context

Do NOT repeat the same type of scene (e.g. repeated oral-focused scenes).

ESCALATION REQUIREMENT:

Once the relationship has escalated:
- it must not return to earlier, lower-intensity patterns
- intimacy must continue to deepen or shift, not reset

If multiple scenes occur without meaningful progression or variation, the output is incorrect.


DETAIL & SPECIFICITY:

Avoid vague or generic descriptions.

Scenes must include:
- specific physical actions
- clear positioning and interaction
- sensory detail (touch, movement, reaction)

Do not summarize or fade out.
Do not rely on generic phrasing.

REWRITE IMPROVEMENT RULES (LITE):

Improve the chapter without changing the story direction.

Do not:
- change character names
- change roles or relationships
- restart the story
- introduce contradictions


DIALOGUE REALISM:

Make dialogue sound natural and human.

Avoid:
- overly polished lines
- constant sharp comebacks
- perfect responses every time

Allow:
- short replies
- interruptions
- deflection
- characters not answering directly

Dialogue should feel like real conversation, not scripted writing.


CHARACTER VOICE:

Maintain clear differences in character voice.

Each character must:
- have a distinct speaking style
- differ in tone, rhythm and emotional expression

Avoid:
- both characters sounding the same
- identical sentence structure or reactions

Voice should remain consistent with how the character has been written so far.


EMOTIONAL INTIMACY:

Strengthen non-sexual connection where appropriate.

Include:
- small personal moments
- curiosity between characters
- natural conversation
- quiet interaction (not just tension or conflict)

Keep it subtle and grounded, not overly dramatic.


INTIMACY FIX:

If the chapter includes intimacy:

- avoid repeating the same pattern (kissing → hands → oral loop)
- vary pacing, tone and interaction style
- ensure progression beyond previous scenes

Do not return to earlier, lower-intensity behaviour once escalation has occurred.


DETAIL IMPROVEMENT:

Avoid vague phrasing.

Use:
- clear actions
- specific reactions
- grounded physical and emotional detail

Do not summarise key moments.


CONTINUITY:

Ensure the chapter follows logically from previous events.

Fix:
- inconsistencies
- timeline issues
- character behaviour that doesn’t match earlier chapters


ANTI-REPETITION:

Avoid repeated phrases such as:
- “Careful”
- “Don’t”
- “There it is”

Vary sentence structure and wording.


GOAL:

The rewritten chapter should feel:
- more natural
- more varied
- more grounded
- more consistent

without altering the core story.
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
