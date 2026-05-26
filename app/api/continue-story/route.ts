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

  if (heat === "Fade to black") return Math.min(current + 1, 3);

  if (heat === "Mild") {
    if (chapter <= 2) return 1;
    if (chapter <= 4) return 2;
    return 3;
  }

  if (heat === "Spicy") {
    if (chapter <= 2) return 2;
    if (chapter === 3) return 3;
    if (chapter === 4) return 4;
    if (chapter === 5) return 5;
    return 6;
  }

  if (heat === "Explicit adult" && burn === "Fast burn") {
    if (chapter <= 2) return 2;
    if (chapter === 3) return 4;
    if (chapter === 4) return 5;
    if (chapter === 5) return 6;
    return 7;
  }

  if (heat === "Explicit adult" && burn === "Medium burn") {
    if (chapter <= 2) return 2;
    if (chapter === 3) return 3;
    if (chapter === 4) return 4;
    if (chapter === 5) return 5;
    if (chapter === 6) return 6;
    return 7;
  }

  if (heat === "Explicit adult") {
    if (chapter <= 3) return 2;
    if (chapter === 4) return 3;
    if (chapter === 5) return 4;
    if (chapter === 6) return 5;
    return 6;
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
  nextChapterNumber >= (incomingState.targetChapters || 10)
    ? "epilogue"
    : nextChapterNumber >= (incomingState.targetChapters || 10) - 2
    ? "resolution-runway"
    : "middle-build",

shouldWriteEpilogue:
  nextChapterNumber === (incomingState.targetChapters || 10) + 1,

epilogueWritten:
  nextChapterNumber >= (incomingState.targetChapters || 10)
    ? true
    : incomingState.epilogueWritten || false,
};
  const prompt = `
  Maintain the established narrative voice, tone and character dynamics from earlier chapters.

Do not shift into a different writing style, tone or dialogue rhythm.

Character voices must remain consistent and distinct.
You are NovelForge, an award-focused romance continuation engine.

EPILOGUE MODE:
If shouldWriteEpilogue is true and epilogueWritten is false:
- Write an Epilogue instead of a numbered chapter
- Title it exactly: Epilogue
- Do not label it as Chapter ${nextChapterNumber}
- Shift tone to emotional payoff, softness, stability and resolution
- Show relationship after conflict is resolved
- Do not introduce new major problems

Otherwise:
Write Chapter ${nextChapterNumber} only.

Return only polished chapter prose.
No notes.
No outline.
No commentary.
No JSON.

CHAPTER TITLE RULE:

- Do not duplicate the chapter label
- If POV format is used, format like:
  Chapter ${nextChapterNumber}
  NOAH

- Do NOT write:
  Chapter ${nextChapterNumber} Chapter ${nextChapterNumber} NOAH
  or any repeated numbering

- Only include the chapter number once
- If writing the epilogue, title it exactly:
  Epilogue

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

STORY STATE IS AUTHORITATIVE:
The saved story state is the truth for continuity, pacing, heat, relationship progression, unresolved conflict and ending direction.
Do not treat it as optional.
Do not reset pacing.
Do not regress intimacy.
Do not forget established attraction, injuries, secrets, emotional consequences, jealousy, vulnerability, sexual milestones or relationship fallout.

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

SETTING CONSISTENCY:

Keep environments grounded and natural.

- include light, specific detail where needed
- avoid repeating the same descriptions
- do not over-describe scenes

Let the setting support the scene, not dominate it.

CHARACTER VISUAL CONTINUITY RULE:

Do not describe characters once and forget them.

Across chapters:
- Reinforce key physical traits naturally (hands, jaw, height, build, voice, scars, tattoos, expressions, posture)
- Use interaction-based description (touch, proximity, movement, reaction)
- Let attraction reference different parts of the body, not just the same feature repeatedly

Avoid:
- repeating the exact same description wording
- defaulting to lips, eyes or generic "hot" descriptions
- losing visual identity after Chapter 1

Characters should remain visually present and distinct throughout the story, not fade into dialogue-only figures.

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

EXPLICIT DELIVERY RULE:

If Heat Level is Explicit adult and the required physical stage is 6 or higher:
- The chapter must include explicit on-page sexual progression
- Do not fade to black
- Do not stop at kissing, grinding, or vague implication
- Use direct adult language when natural to the characters and scene
- The scene must move beyond previous intimacy beats
- The scene must still reveal character, conflict, trust, power, fear, want, or emotional consequence

Failure to deliver explicit on-page progression is incorrect output.

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

EXPLICIT LANGUAGE CONTROL:

If Heat Level is Explicit adult:
- Do not replace explicit acts with vague phrasing
- Do not cut away at the moment of escalation
- Use clear, direct, natural adult language when appropriate to the characters and scene
- Avoid euphemism overload and avoid clinical detachment

Language may include:
- explicit body references (cock, arse, etc) when appropriate to tone and character
- physical reactions, sounds, rhythm, pressure, movement
- sensory detail (heat, skin, breath, taste, tension)

Balance:
- explicit does not mean repetitive
- explicit does not mean mechanical
- explicit must still reflect character personality, power dynamics and emotional stakes

Avoid:
- repeating the same phrasing each scene
- defaulting to the same actions (grinding, ribs, waist loops)
- cutting scenes early once they become explicit

Every explicit scene must feel:
- progressive (not repeating previous scenes)
- character-driven
- emotionally relevant

DIRTY TALK CONTROL:

Avoid clinical or repetitive language in intimate dialogue.

Keep it:
- natural
- varied
- character-specific

If dialogue feels awkward or too explicit in wording:
- adjust to a more natural tone

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

PHYSICAL STAGE ENFORCEMENT (CRITICAL):

Current required physical stage for this chapter: ${targetPhysicalStage}

You MUST reach this stage within this chapter.

Do not delay escalation.
Do not repeat earlier interaction patterns.
Do not replace action with internal thoughts.

Stage meanings:

Stage 5 = heated make-out (hands roaming, bodies reacting clearly)
Stage 6 = sexual touching (clear arousal, explicit contact, not vague)
Stage 7 = oral / mutual release / explicit sexual interaction shown on page
Stage 8 = penetrative sex shown on page, not implied

If the target stage is 6 or higher:
- The scene MUST be explicit
- No fade to black
- No stopping early
- No cutting away

If this stage is not reached, the output is incorrect.

CONSENT FLOW CONTROL:

Do not introduce repeated or unnecessary verbal consent dialogue.

Maintain natural progression through:
- mutual action
- physical response
- escalating interaction

Avoid interrupting scenes with explicit permission requests unless context demands it.

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

CONSENT ENFORCEMENT:

Do not include or reintroduce any consent-related dialogue or phrasing.

Do not reference:
- permission
- checking behaviour
- hesitation framed as consent

If it appears, remove it and continue the scene naturally.

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
ENDING AND EPILOGUE ENGINE:
Current ending phase:
${updatedStoryState.endingPhase}

Should write epilogue:
${updatedStoryState.shouldWriteEpilogue}

Epilogue already written:
${updatedStoryState.epilogueWritten}

Rules:
- Do not write an epilogue until the main romantic conflict, external conflict and emotional arc are resolved.
- If shouldWriteEpilogue is true and epilogueWritten is false, write an epilogue instead of another normal chapter.
- The epilogue should show earned payoff, not new drama.
- Epilogue may show relationship security, family integration, career stability, domestic intimacy, future promise, emotional safety, or a final spicy afterglow if it fits the heat level.
- Do not introduce a new villain, new breakup, new illness, new custody threat, new scandal or major new conflict in the epilogue.
- If the story is not resolved yet, do not write the epilogue. Instead write the chapter that resolves the remaining conflict.
- For novella, begin steering strongly toward resolution once endingPhase is resolution-runway.
- For novella, do not keep extending the middle with repeated jealousy, repeated almost moments, repeated ex pressure, or repeated emotional avoidance.
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

ANTI-PATTERN RULE:

Do not reuse:
- identical sentence rhythm
- repeated scene framing
- repeated escalation beats

Each scene must feel newly constructed, not generated from a template.

If the structure feels familiar, change it.

INTIMACY PROGRESSION & VARIETY (MANDATORY):

This is a FAST BURN, EXPLICIT adult romance.

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

DIALOGUE BALANCE (CONTINUE):

Do not default to constant sarcasm, banter or insulting dialogue.

Maintain a mix of:
- tension and conflict
- normal conversation
- genuine interaction
- quieter or more sincere moments

Not every exchange should be sharp or confrontational.

If dialogue becomes repetitive in tone:
- shift the dynamic
- introduce more natural interaction

EMOTIONAL RANGE (CONTINUE):

Characters must not rely on one communication style.

Ensure variation between:
- conflict
- humour
- neutral interaction
- vulnerability

If interactions become one-note (e.g. constant sarcasm or tension):
- correct it
- introduce more grounded, real conversation

PACING & PAYOFF (CONTINUE):

Maintain steady progression.

- each scene must move something forward
- avoid repeating the same type of scene

After key moments:
- allow brief emotional reaction
- do not move on too quickly

Ensure scenes have impact, not just action.
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
