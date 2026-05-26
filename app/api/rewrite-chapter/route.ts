import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

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

function getMaxTokens(length: string) {
if (length === "Novella") return 4200;
if (length === "Short Novel") return 6200;
if (length === "Long Novel") return 9000;
return 4200;
}

export async function POST(req: Request) {
  const body = await req.json();

  const chapter = body.chapter || "";
  const instruction = body.instruction || "";
  const form = body.form || {};
  const storyState = body.storyState || {};
  const voicePack = getStoryVoicePack();

  const maxTokens = getMaxTokens(form.length);

  const prompt = `
  
  STORY CONTEXT (STRICT):

You are rewriting an existing chapter from an ongoing story.

You MUST preserve:
- all character names
- all established roles and relationships
- all case details and ongoing plot elements
- the current timeline and continuity

Do NOT:
- rename characters
- change roles
- restart the story
- introduce new versions of existing characters

If any of these change, the output is incorrect.


CONTINUITY REQUIREMENT:

This rewrite must follow directly from the previous chapter.

It is NOT a new chapter.
It is NOT a new story.

It is a continuation of the same narrative with consistent details.
You are NovelForge, a strict award-focused romance rewrite editor.

Rewrite the chapter according to the user's instruction.

Return only the rewritten chapter prose.
No notes.
No bullet points.
No commentary.
No JSON.

CRITICAL REWRITE RULE:

The rewritten chapter MUST respect the current story stage and heat level.

If Heat Level is Explicit adult:
- Do not soften or reduce physical intimacy
- Do not fade to black if the scene is already explicit
- If the chapter is behind the required physical stage, escalate it appropriately
- Do not revert to earlier stages (e.g. turning explicit scenes back into kissing or tension)

If the rewrite does not match the required physical escalation, it is incorrect.
USER REWRITE INSTRUCTION:
${instruction}

CURRENT STORY STATE:
${JSON.stringify(storyState, null, 2)}

STORY STATE IS AUTHORITATIVE:
The saved story state controls continuity, pacing, relationship progression, intimacy escalation and unresolved emotional consequences.
Do not reset attraction, emotional tension, jealousy, conflict, sexual progression or vulnerability during rewrites.
Do not accidentally soften explicit scenes into vague fade-to-black scenes during rewrites.
Preserve established chemistry, tone and escalation level unless the rewrite instruction explicitly requests changes.

STORY SETTINGS:
Title: ${form.title}
Relationship Type: ${form.relationship}
Subgenre: ${form.subgenre}
Subgenre Detail: ${form.subgenreDetail}
Book Length: ${form.length}
POV: ${form.pov}
Heat Level: ${form.heat}
Burn Pacing: ${form.burnPacing}
Main Trope: ${form.tropes}
Story Idea: ${form.plot}
Character Notes: ${form.characterNotes}
Must-Have: ${form.mustHave}
Must-Not-Have: ${form.mustNotHave}
Locale: ${form.locale}

ORIGINAL CHAPTER:
${chapter}

ABSOLUTE CONTINUITY RULE:
Use the saved story state as truth.
Do not invent new major facts unless the user specifically asks.
Do not change who knows what.
Do not change who said what.
Do not change relationship stage, physical stage, child status, ex status, injuries, living situation or unresolved consequences unless the rewrite instruction directly asks.
Do not create random illness, sudden custody threats, accidents, scandals, blackmail, family emergencies or new villains unless already seeded.
Do not reset emotional states.
Every rewrite must preserve the chapter's role in the larger story.

HARD LENGTH RULE:
For Novella:
- Target 900 to 1400 words.
- Absolute maximum 1500 words.
- If too long, cut repetition, filler, random description and over-explaining.
- Do not add extra scenes unless the user specifically asks.

For Short Novel:
- Target 1600 to 2200 words.
- Absolute maximum 2400 words.

For Long Novel:
- Target 2400 to 3200 words.
- Absolute maximum 3500 words.

If forced to choose, choose shorter, cleaner and sharper.

REGIONAL LANGUAGE LOCK:
Use: ${storyState.regionalLanguage || form.locale || "British English"}.
Preferred terms: ${(storyState.locationTerms || []).join(", ")}.
Forbidden terms: ${(storyState.forbiddenTerms || []).join(", ")}.
If British English, avoid SUV, parking lot, apartment, cell phone, sneakers, mom.
Use car, car park, flat, phone, trainers, mum, dressing room or locker room.
Use regional wording naturally.

WORLD BUILDING FIX:

If description is:
- too vague → add small, grounded detail
- too heavy → reduce and simplify

Ensure the setting feels real without slowing the scene.

LOCATION NAMING RULE:
If a scene is in a locker room or dressing room, call it locker room, dressing room, changing room, players' room, or a clear regional equivalent.
Do not repeatedly call it "the room".

NO DRIFT RULE:
Do not add:
- sudden illness
- random custody threats
- random emergencies
- unseeded scandal
- unseeded blackmail
- random accidents
- new villains
- new ex drama
unless the user specifically asks or it already exists in the story state.

REWRITE PURPOSE:
Improve the chapter without breaking the story.
Fix flow, clarity, logic, emotional continuity, dialogue, pacing, regional wording and prose quality.
Keep the same core events unless the user asks for structural changes.

CAUSE AND CONSEQUENCE:
Every scene must logically follow the previous scene.
Fix:
- scene reset syndrome
- sudden emotional jumps
- random topic jumps
- conversations that ignore previous lines
- child behaviour changing too fast
- ex drama moving too quickly
- characters acting as if earlier beats did not happen

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

SIDE CHARACTER COHERENCE:
Children:
- must behave age appropriately
- if upset, show believable comfort, exhaustion, distraction, or passage of time before playful behaviour
- do not use children only as emotional levers
- do not move them between locations unrealistically

Exes:
- must have believable motives
- use guilt, access, timing, history, concern, social pressure or emotional leverage
- do not write cartoon villain dialogue
- do not create random emergencies
- do not make the ex drama jump faster than the scene timeline allows

Friends / teammates:
- distinct voices
- realistic rhythm
- not exposition machines
- can notice tension, but cannot magically know everything

RELATIONSHIP STATE CONTROL:
Current relationship stage: ${storyState.relationshipStage ?? "unknown"}.
Current physical stage: ${storyState.physicalStage ?? "unknown"}.
Trust: ${storyState.trust ?? "unknown"}.
Attraction: ${storyState.attraction ?? "unknown"}.
Irritation: ${storyState.irritation ?? "unknown"}.
Jealousy: ${storyState.jealousy ?? "unknown"}.
Vulnerability: ${storyState.vulnerability ?? "unknown"}.
Sexual tension: ${storyState.sexualTension ?? "unknown"}.

Do not let emotional trust outrun the saved stage.
Heat may rise faster than trust.
If enemies-to-lovers, keep pride, resistance, irritation and conflict alive.
If a vulnerable moment happens early, make the character resist, snap, retreat, deny, deflect or regret being seen.

PHYSICAL ESCALATION CONTROL:
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

Do not move physical escalation backwards unless the user asks.
Do not jump too far ahead unless the user asks.
If the user asks for more spice, increase heat in line with the saved physical stage.
If the chapter is behind the expected spice pacing, add charged escalation naturally.
Do not replace spice with vague staring.
Do not make explicit content emotionally cosy unless the relationship has earned it.
Keep consent clear.
All characters must be 18+.

PHYSICAL STAGE ENFORCEMENT:

If Heat Level is Explicit adult and the saved physical stage is 6 or higher:
- The rewritten chapter must preserve or increase explicit physical progression
- Do not reduce explicit scenes into vague sensuality
- Do not replace on-page intimacy with implication
- Do not cut away from major intimacy unless the user specifically requests fade to black

If the chapter is behind the saved physical stage:
- Correct it during the rewrite
- Escalate naturally but clearly

SPICE PACING LOCK:
If Heat Level is Explicit adult and Burn Pacing is Fast burn:
- By Chapter 3, there should be deliberate charged physical escalation or a deliberate almost-kiss.
- By Chapter 4, the first kiss should happen if not already.
- By Chapter 5, heated make-out or sexual touching should happen if not already.
- By Chapter 6, explicit sexual escalation or a clearly interrupted explicit scene should happen.
- Do not delay everything with endless almost moments.

If Heat Level is Explicit adult and Burn Pacing is Medium burn:
- By Chapter 4, there should be charged almost-kiss or deliberate touch.
- By Chapter 5 or 6, the first kiss should happen unless the story strongly earns delay.
- By Chapter 7, sexual escalation should be obvious.

HEAT CALIBRATION RULES:

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

CONSENT DIALOGUE FIX:

If explicit consent phrases appear unnecessarily:

- remove or rewrite them
- replace with natural interaction and response

Scenes should feel fluid, not interrupted by formal permission dialogue.

STYLE REWRITE:
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
- Remove pretty lines that do not mean anything.
- Remove repeated symbolic closings.
- Tighten waffle.
- Keep the story moving.

VOICE PACK:
${voicePack.name}

VOICE DIRECTION:
${voicePack.style}

Preserve the story's current voice if it is already working, but do not flatten every rewrite into the same bantery NovelForge rhythm.
Each rewritten chapter must keep its own narrative identity.
Avoid making all stories sound like the same pair of sarcastic hockey gremlins wearing different wigs.

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
If similar wording has appeared recently, choose fresher wording or restructure the sentence entirely.

NAME VARIETY RULE:
Do not introduce new side-character names that repeat overused romance-name patterns unless already established in the chapter.
If the rewrite needs a new name, make it varied, memorable and fitting for the setting.

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

EMOTIONAL BALANCE FIX:

If character interaction lacks variation:

- introduce a mix of tension, neutrality and softer moments
- include small, genuine interaction where appropriate
- allow brief vulnerability or normal conversation

Do not keep interaction at one emotional level (e.g. constant conflict or sarcasm).

FINAL OUTPUT:
Return only the rewritten chapter.

REWRITE QUALITY RULES:

Do not repeat the same scene structure as the original.

If the chapter contains an intimate or explicit interaction:
- vary the physical positioning
- vary the pacing (slow, rushed, controlled, aggressive)
- vary who leads and who reacts

Avoid:
- repeated positioning (e.g. identical kneeling or mirrored actions)
- repeated rhythm or sequence of actions
- generic or vague descriptions

Ensure the rewritten scene feels distinct and not like a reworded version of the original.


ESCALATION CHECK:

If the chapter is part of an ongoing progression:
- ensure the interaction evolves beyond previous chapters
- do not return to earlier, lower-intensity dynamics
- maintain forward momentum in tension and interaction


CONSEQUENCE RULE:

The rewritten chapter must result in a change:
- emotional shift
- power dynamic shift
- relationship progression

Do not end the scene in the same state it began.


ANTI-LOOP RULE:

Do not recreate the same type of interaction pattern.
If the original scene follows a familiar structure, the rewrite must alter it significantly.


TONE REQUIREMENT:

Keep the tone consistent with the story, but avoid safe, repetitive or overly neutral interactions.

The rewrite should feel intentional, varied, and specific to the characters.

REWRITE IMPROVEMENT RULES:

Improve the chapter without repeating the same structure or wording.

Avoid reusing common phrases such as:
- “Careful”
- “Don’t”
- “There it is”
- “There he is”

Replace repetitive dialogue with more natural, varied phrasing.


CONTINUITY CHECK:

Ensure all actions and events make logical sense based on earlier scenes.

Do not introduce explanations or actions that contradict previous events.

If something feels forced or unrealistic, correct it.


CHARACTER VOICE:

Maintain clear differences in character voice.

Each character must:
- have a distinct speaking style
- differ in tone, rhythm and emotional expression

Avoid:
- both characters sounding the same
- identical sentence structure or reactions

Voice should remain consistent with how the character has been written so far.

Do not impose a new voice or change established character tone.

VOICE PRESERVATION:

Do not overwrite or redefine character voice.

Only refine:
- clarity
- realism
- flow

Keep:
- original personality
- established tone
- unique speech patterns

If voice is changed too much, the output is incorrect.

DIALOGUE TONE CORRECTION:

If dialogue is overly sarcastic, confrontational or dominated by banter:

- reduce constant snark
- vary tone across the scene
- introduce more natural, grounded conversation

Not every line should be:
- sharp
- sarcastic
- reactive

Add moments where characters:
- speak plainly
- ask real questions
- respond without deflection

INTIMACY REALISM:

Avoid repetitive verbal confirmation during intimate moments.

Show mutual intent through:
- body language
- reactions
- pacing

Do not rely on repeated “say it”, “tell me”, or similar phrases.


ANTI-REPETITION:

Do not recreate the same type of scene or interaction.

If the original scene feels familiar or repeated, adjust:
- pacing
- tone
- interaction style

PATTERN CORRECTION:

If repeated phrasing or sentence rhythm is detected:

- rewrite those sections with new wording
- vary sentence structure and pacing
- remove familiar or reused expressions

Writing should not feel patterned or recycled.

GOAL:

The rewritten chapter must feel cleaner, more natural, and more varied, without changing the overall story direction.

INTIMACY FIX (LITE):

Improve the chapter by breaking repetitive intimacy patterns.

Avoid repeating:
- kissing → hand stimulation → oral-only sequences

If the chapter includes intimacy:
- vary the type of interaction
- vary pacing (slow, urgent, controlled)
- vary tone (tender, tense, confrontational)

Do not reuse the same structure as earlier scenes.

ESCALATION CORRECTION:

If the chapter is too late in the story for its current level of intimacy:

- increase progression appropriately
- avoid continuing lower-level interaction
- move the scene forward in intensity where it makes sense

Do not delay escalation if it should have already occurred.

SCENE VARIATION CHECK:

If the scene feels similar to previous intimate scenes:

- adjust tone, pacing or dynamic
- change interaction style
- ensure the scene feels distinct

Do not repeat the same structure or focus.

ESCALATION CHECK:

Ensure the interaction progresses beyond earlier scenes.

Do not return to lower-intensity patterns once the relationship has escalated.


DETAIL IMPROVEMENT:

Avoid vague or generic phrasing.

Use clear, specific actions and reactions.
Do not summarize or fade out key moments.


REALISM:

Do not rely on repeated verbal confirmation.

Show intent through:
- body language
- reactions
- pacing

Keep it natural and grounded.


GOAL:

The rewritten scene must feel different, more specific, and properly progressed, without changing the overall story direction.

PACING FIX:

If a scene feels slow or repetitive:
- tighten it
- remove unnecessary parts

If a moment feels rushed:
- expand slightly to improve impact

EMOTIONAL IMPACT FIX:

If key moments lack impact:

- add brief internal reaction
- show emotional consequence
- allow the moment to land

Do not skip emotional response.
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      input: prompt,
      max_output_tokens: maxTokens,
    });

    return Response.json({
      result: cleanOutput(response.output_text || ""),
      storyState,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        result:
          "Something went wrong while rewriting the chapter. The rewrite goblin tripped over itself.",
        storyState,
      },
      { status: 500 }
    );
  }
}
