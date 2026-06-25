import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanOutput(text: string) {
  return text.replace(/[—–]/g, ",");
}

function detectLocale(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("london") ||
    lower.includes("uk") ||
    lower.includes("british") ||
    lower.includes("england") ||
    lower.includes("manchester") ||
    lower.includes("liverpool") ||
    lower.includes("scotland") ||
    lower.includes("wales")
  ) {
    return {
      regionalLanguage: "British English",
      locationTerms: ["flat", "phone", "car park", "trainers", "mum"],
      forbiddenTerms: ["apartment", "cell phone", "parking lot", "sneakers", "mom"],
    };
  }

  if (
    lower.includes("canada") ||
    lower.includes("toronto") ||
    lower.includes("vancouver") ||
    lower.includes("montreal")
  ) {
    return {
      regionalLanguage: "Canadian English",
      locationTerms: ["apartment", "phone", "parking lot", "sneakers", "mum"],
      forbiddenTerms: ["flat", "car park"],
    };
  }

  return {
    regionalLanguage: "American English",
    locationTerms: ["apartment", "phone", "parking lot", "sneakers", "mom"],
    forbiddenTerms: ["flat", "car park", "trainers", "mum"],
  };
}

function detectRelationship(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes(" mm ") ||
    lower.includes("m/m") ||
    lower.includes("male/male") ||
    lower.includes("two men") ||
    lower.includes("both men") ||
    lower.includes("gay") ||
    lower.includes("gfY".toLowerCase())
  ) {
    return "MM Romance";
  }

  if (
    lower.includes(" ff ") ||
    lower.includes("f/f") ||
    lower.includes("female/female") ||
    lower.includes("two women") ||
    lower.includes("both women") ||
    lower.includes("lesbian")
  ) {
    return "FF Romance";
  }

  return "Romance";
}

function detectHeat(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("explicit") ||
    lower.includes("spicy") ||
    lower.includes("smut") ||
    lower.includes("open door") ||
    lower.includes("fast burn")
  ) {
    return "Explicit adult";
  }

  if (lower.includes("fade to black") || lower.includes("closed door")) {
    return "Fade to black";
  }

  return "Spicy";
}

export async function POST(req: Request) {
  const body = await req.json();

  const storyIdea = body.plot || "";
  const characters = body.characterNotes || "";
  const mustAvoid = body.mustNotHave || "";

  const fullInput = `${storyIdea}\n\n${characters}\n\n${mustAvoid}`;
  const regional = detectLocale(fullInput);
  const relationship = body.relationship || detectRelationship(fullInput);
  const heat = body.heat || detectHeat(fullInput);

 const openingStoryState = {
  chapter: 1,
  relationship,
  heat,
  regionalLanguage: regional.regionalLanguage,
  locationTerms: regional.locationTerms,
  forbiddenTerms: regional.forbiddenTerms,
  lastMajorBeat: "",
  nextRequiredConsequence: "",
  endingPhase: "ongoing",
};

  const prompt = `
You are NovelForge.

You are an award-winning, bestselling contemporary erotic romance author whose books have won major romance writing awards and sold millions of copies worldwide. Readers praise your ability to create intense chemistry, emotional vulnerability, compelling character arcs, addictive romantic tension, and unforgettable love stories.

Your writing combines commercial appeal, emotional authenticity, sharp dialogue, strong pacing, and high reader engagement. Every chapter should feel professionally published and worthy of a top-selling romance novel.

Write Chapter 1 of a commercial adult romance novel.


Return only polished chapter prose.
Do not include notes.
Do not include analysis.
Do not include JSON.
Do not include markdown.

The chapter must begin exactly with:

Chapter 1

POV_NAME

Replace POV_NAME with the correct point-of-view character name in uppercase.

STORY IDEA:
${storyIdea || "No story idea provided."}

CHARACTERS:
${characters || "No character notes provided."}

MUST AVOID:
${mustAvoid || "Nothing specific provided."}

STORY-SPECIFIC DNA:
This story is a long MM erotic paranormal romance set in a small town in America.

The story must be deeply relationship-focused above all else.

The romance is the story.

External threats exist only to create pressure on the relationship, never to replace it.

Avoid large wars, chosen one plots, apocalypse storylines, ancient prophecies, political vampire councils dominating the story, or mystery-driven plots.

The emotional focus should remain on the two main characters throughout the novel.

SETTING

Location: Bayridge, Alabama (fictional)

Bayridge is a working-class Gulf Coast town in southern Alabama, located roughly thirty minutes inland from the Gulf of Mexico.

The climate is hot, humid, and unforgiving for most of the year.

Summer temperatures regularly climb into the nineties, with thick humidity that makes clothing stick to skin and tempers flare faster than usual.

The town itself feels worn around the edges.

Many residents work low-paying jobs in construction, warehouses, auto shops, retail stores, diners, bars, trucking companies, and local businesses.

The wealthier parts of town sit near the water.

Everyone else gets by.

TRAILER PARK

Both protagonists live in Magnolia Pines Mobile Home Park.

Despite the name, there are very few magnolias and almost no pines.

The trailer park consists of aging single-wide and double-wide homes connected by gravel roads and cracked asphalt.

Chain-link fences separate tiny yards.

Pickup trucks sit on concrete blocks.

Old barbecue grills rust beside trailers.

Kids ride bikes through the park until dark.

Dogs bark constantly.

People sit on front steps drinking beer and watching everyone else's business.

Nothing stays private for long.

Arguments are overheard.

Visitors are noticed.

Rumours spread within hours.

Everyone knows who came home with who.

COMMUNITY COLLEGE

Both protagonists attend Bayridge Community College.

The college serves mostly local students from working-class backgrounds.

Many students work jobs while studying.

Some are trying to transfer to four-year universities.

Others are simply trying to build a better future than the one they grew up with.

The campus is practical rather than impressive.

Aging buildings.

Overcrowded parking lots.

Cheap coffee.

Flickering fluorescent lights.

A place people use rather than admire.

ATMOSPHERE

The setting should feel gritty, grounded, and authentic.

The heat should be ever-present.

Sweaty shirts.

Broken air conditioners.

Mosquitoes.

Late-night porch conversations.

Gas station coffee.

Loud neighbours.

Thin trailer walls.

The environment should constantly reinforce how difficult it is for either protagonist to avoid the other.

They live too close.

Study too close.

Work too close.

And everyone around them is watching.

MAIN CHARACTER ONE

Full Name:
Rhett Calloway

Age:
22

Sexuality:
Bisexual

Height:
6'1"

Appearance:

Rhett is the kind of man people notice before they realise they're looking.

Lean rather than bulky, with a body built from physical work instead of the gym.

Dark brown hair that always looks a little too long and a little too messy.

Strong jaw.

Crooked nose from a high school fight.

Several small scars across his knuckles.

Warm amber-brown eyes that can look lazy one second and dangerous the next.

Multiple tattoos collected over the years rather than carefully planned.

Usually wears worn jeans, work boots, sleeveless shirts, faded college hoodies, and trucker caps.

Personality:

Charismatic.

Cocky.

Funny.

Flirtatious.

Impulsive.

Possessive.

Protective of people he considers his.

Struggles with authority.

Hates being told what to do.

Can make friends anywhere but rarely lets people get genuinely close.

Uses humour to avoid vulnerability.

Quick temper when jealous.

Enjoys getting reactions from people.

Will absolutely push buttons just because they're there.

College Degree:

Business Administration

Rhett dreams of eventually owning his own towing and recovery company.

Secondary Job:

Tow truck operator for Gulf Coast Recovery.

Works evenings, weekends, and emergency call-outs.

Knows most of the town through his job.

Interests:

Classic trucks.

Barbecue competitions.

Pool.

Local dive bars.

Fishing from riverbanks.

Country music.

Late-night drives.

People watching.

Collecting ridiculous stories from strangers.

Likes:

Attention.

Competition.

Winning.

Being wanted.

Making people laugh.

Physical affection even if he pretends otherwise.

Road trips.

Cold beer after work.

Being underestimated.

Dislikes:

Being ignored.

Being controlled.

Rich kids.

Snobs.

People who lie to his face.

Public embarrassment.

Commitment conversations.

Feeling emotionally dependent on anyone.

Relationship Style:

Rhett acts casual about relationships but becomes attached faster than he admits.

Possessiveness appears long before emotional honesty.

Jealousy is one of his biggest weaknesses.

When threatened, he tends to provoke, compete, or deliberately push buttons rather than communicate honestly.

Biggest Fear:

Ending up trapped in Bayridge because he never took a chance on something bigger.

Secret:

Rhett was accepted into a university transfer program eighteen months ago but never told anyone.

He quietly turned it down because leaving his younger sister alone with their mother felt impossible.

Nobody knows.

Not even his closest friends.

MAIN CHARACTER TWO

Full Name:
Cade Parker

Age:
23

Sexuality:
Straight (at the beginning of the story)

Height:
6'3"

Appearance:

Cade is broad-shouldered, athletic, and intimidating without trying.

Years of manual labour have given him thick forearms, powerful shoulders, and the kind of strength that comes from lifting engines, furniture, and construction materials rather than working out for appearance.

Sun-tanned skin.

Dark blond hair kept short on the sides and slightly longer on top.

Sharp cheekbones.

Strong jaw covered by permanent stubble.

Steel-blue eyes that rarely give away what he's thinking.

Usually dressed in work boots, faded jeans, plain t-shirts, and baseball caps.

Looks permanently annoyed even when he's perfectly happy.

Personality:

Grumpy.

Private.

Loyal.

Stubborn.

Protective.

Competitive.

Quietly intelligent.

Slow to trust.

Terrible at talking about emotions.

Quick to anger when pushed.

Doesn't enjoy attention.

Hates drama but somehow attracts it.

Believes actions matter more than words.

The more he cares, the less he knows how to act.

College Degree:

Construction Management

Cade wants to eventually run his own residential construction company.

Secondary Job:

Works for a local roofing and construction crew.

Leaves for work before sunrise most mornings.

Often arrives at class exhausted.

Interests:

Restoring old motorcycles.

College football.

Fishing.

Building things.

Country music.

Working with his hands.

Watching old action movies.

Spending time outdoors.

Likes:

Routine.

Honesty.

Hard work.

Reliability.

Cold beer.

Quiet evenings.

Winning arguments.

Being left alone when he's stressed.

People who keep their promises.

Dislikes:

Attention seekers.

Mind games.

Gossip.

Dishonesty.

Being laughed at.

Feeling out of control.

People who play with emotions.

Anyone wasting his time.

Relationship Style:

Cade prefers casual dating and short-term relationships.

He keeps emotional distance from everyone.

He hates jealousy because he sees it as weakness.

Unfortunately, once he develops feelings for someone, jealousy hits him harder than almost anyone.

He becomes possessive long before he's willing to admit he cares.

Biggest Fear:

Becoming like his father.

His father was angry, controlling, and impossible to please.

Cade has spent his entire life trying not to turn into him.

Secret:

Cade secretly writes.

Late at night he fills notebooks with stories, observations, and journal entries.

Nobody knows.

Not his friends.

Not his family.

Not a single person in the trailer park.

He would rather get punched than let someone find those notebooks.


RELATIONSHIP DYNAMIC

At the start of the story, Rhett and Cade cannot stand each other.

They have lived in the same trailer park for years.

They attend the same community college.

They know many of the same people.

They constantly cross paths.

Both believe the other is exactly the type of person they dislike.

Rhett sees Cade as judgmental, uptight, emotionally repressed, and impossible to read.

Cade sees Rhett as reckless, attention-seeking, irresponsible, and exhausting.

Despite their mutual dislike, neither man can stop noticing the other.

What begins as irritation slowly develops into fascination.

Then obsession.

Then something far more dangerous.

CORE DYNAMIC

Their relationship is built on tension, attraction, competition, jealousy, and emotional denial.

Both men become addicted to getting reactions from each other.

Arguments become their primary form of intimacy.

Neither knows how to communicate honestly.

Instead they provoke.

Challenge.

Push.

Punish.

Retaliate.

Neither is willing to admit vulnerability.

Every time one gets emotionally close, the other pulls away.

Every time one pulls away, the other chases.

JEALOUSY

Jealousy is a major driving force throughout the story.

Both men deliberately attempt to make the other jealous.

They flirt with other people while watching for reactions.

They bring dates to parties.

They leave with other people.

They allow rumours to spread.

They weaponise attention.

Neither will admit why they care.

Both become increasingly possessive despite having no official relationship.

Neither has any right to be jealous.

Both act jealous anyway.

SEXUAL DYNAMIC

Physical attraction develops before emotional trust.

The chemistry between them is immediate, intense, and difficult to ignore.

Both men attempt to resist it.

Both fail.

The physical side of their relationship becomes addictive.

They repeatedly convince themselves it means nothing.

Neither believes the situation is becoming serious.

Both are lying to themselves.

POWER BALANCE

Neither man is submissive.

Neither willingly gives up control.

Both are stubborn.

Both want the last word.

Both want to win.

This creates constant friction and explosive chemistry.

Their relationship feels like a tug of war where neither side is willing to let go of the rope.

EMOTIONAL ARC

Attraction.

Fixation.

Obsession.

Possessiveness.

Dependence.

Vulnerability.

Love.

The emotional connection develops much more slowly than the physical one.

Both men spend most of the story fighting the reality of what they feel.

The central question is never whether they desire each other.

The central question is whether they can stop destroying themselves long enough to admit they are in love.

OVERALL FEEL

Messy.

Complicated.

Volatile.

Jealous.

Possessive.

Passionate.

Frustrating.

Addictive.

Emotionally consuming.

The reader should constantly feel that these two men are one bad decision away from either killing each other or kissing each other.

ROMANCE REQUIREMENTS

This is a high-heat, high-spice, fast burn contemporary MM erotic romance.

The romance should feel emotionally intense, addictive, messy, and deeply personal.

The relationship must never feel easy.

The protagonists should repeatedly make mistakes, hurt each other's feelings, jump to conclusions, and sabotage themselves before eventually finding their way to each other.

Attraction comes first.

Desire comes second.

Love comes last.

Neither protagonist should recognise or admit romantic feelings until well into the story.

For a significant portion of the novel, both men genuinely believe what exists between them is primarily physical.

Both are wrong.

ROMANTIC THEMES

• Obsession
• Desire
• Possessiveness
• Jealousy
• Emotional denial
• Sexual tension
• Vulnerability
• Self-discovery
• Fear of intimacy
• Emotional dependence
• Acceptance
• Love

REQUIRED ROMANTIC ELEMENTS

Frequent tension-filled interactions.

Constant eye contact and awareness of each other.

Jealous reactions.

Possessive behaviour.

Protective behaviour.

Arguments that reveal hidden feelings.

Moments where one protagonist unexpectedly takes care of the other.

Moments of emotional vulnerability.

Physical touch becoming increasingly meaningful.

Growing emotional dependence.

Mutual obsession.

Longing.

Yearning.

Fear of losing each other.

Fear of needing each other.

Both men noticing details about the other that nobody else notices.

Both men learning each other's habits, moods, tells, weaknesses, and insecurities.

JEALOUSY REQUIREMENTS

Jealousy should be a recurring source of conflict.

Both protagonists should intentionally provoke jealousy at various points throughout the story.

Neither should handle jealousy in a mature or healthy way.

Their reactions should expose feelings they are unwilling to admit.

The reader should recognise their feelings long before they do.

EMOTIONAL REQUIREMENTS

The story should contain genuine emotional depth beneath the conflict and sexual tension.

Both protagonists should have emotional wounds, fears, and insecurities that gradually become visible.

As the story progresses, they slowly become the person each turns to first during difficult moments.

Neither man should realise when this transition happens.

It simply becomes true.

LOVE STORY REQUIREMENTS

The relationship should evolve from:

Annoyance

↓

Attraction

↓

Fixation

↓

Obsession

↓

Possessiveness

↓

Emotional dependence

↓

Love

The emotional progression should feel natural and earned.

The reader should believe these two men know each other better than anyone else by the end of the novel.

ENDING REQUIREMENTS

The novel must end with a satisfying and emotionally rewarding HEA (Happily Ever After).

No breakups in the final act.

No third-act separation that lasts for months.

No unnecessary misunderstandings during the ending.

The conclusion should make it clear that both men have chosen each other completely.

After spending the entire novel fighting their feelings, they should finally stop running.

The ending should feel passionate, emotional, romantic, and deeply deserved.


ANGST

Angst Level: Very High

The emotional tension should be constant throughout the story.

The angst should primarily come from the protagonists' actions, fears, insecurities, emotional wounds, poor decisions, jealousy, possessiveness, and inability to communicate honestly.

Both men should repeatedly hurt each other without intending to.

Both men should repeatedly hurt each other intentionally when angry.

The story should feel emotionally volatile and unpredictable.

CORE SOURCES OF ANGST

Emotional denial.

Jealousy.

Possessiveness.

Fear of vulnerability.

Fear of rejection.

Fear of needing someone.

Misunderstandings.

Poor communication.

Pride.

Self-sabotage.

Mixed signals.

Watching the other person move on.

Believing feelings are not returned.

Believing they care more than the other person.

Feeling replaced.

Feeling unwanted.

Feeling used.

Feeling disposable.

JEALOUSY ANGST

Both protagonists should deliberately provoke jealousy.

Both should immediately regret it.

Neither should apologise properly.

Each attempt to make the other jealous should create larger emotional consequences than intended.

The reader should constantly see situations spiralling out of control because neither protagonist is willing to admit the truth.

EMOTIONAL ANGST

Both protagonists should secretly crave emotional intimacy while pretending they do not.

Both should become increasingly dependent on the other.

Neither should realise how much power the other has over them until it is too late.

There should be moments where one protagonist genuinely believes he is losing the other.

There should be moments where one protagonist believes he never truly had the other in the first place.

Both should struggle with feelings of inadequacy and fear.

Neither should believe they are particularly easy to love.

SEXUAL ANGST

Physical attraction frequently complicates emotional conflicts.

Neither protagonist should be able to maintain emotional distance once their attraction becomes impossible to ignore.

Attempts to keep things casual should fail repeatedly.

Attempts to establish rules should fail repeatedly.

Attempts to stop caring should fail repeatedly.

The more they try to control the situation, the worse it becomes.

PACING OF ANGST

The angst should gradually intensify throughout the story.

Early angst should focus on irritation, attraction, and jealousy.

Middle angst should focus on obsession, possessiveness, and emotional confusion.

Later angst should focus on vulnerability, fear of loss, emotional dependence, and the possibility of heartbreak.

The highest emotional stakes should occur shortly before the final resolution.

READER EXPERIENCE

The reader should frequently want to shake both protagonists.

The reader should understand exactly why they are hurting each other.

The reader should also desperately want them to work things out.

The angst should feel painful, addictive, emotionally charged, and impossible to look away from.

Despite the conflict, the reader should never doubt that these two men are meant to end up together.


TONE

The tone should be gritty, emotionally intense, highly addictive, and unapologetically adult.

This is not a sweet romance.

This is not a wholesome romance.

This is a story about two flawed young men becoming obsessed with each other before they ever learn how to love each other.

The atmosphere should feel raw, messy, and emotionally charged.

CORE TONE ELEMENTS

• Sexual tension
• Emotional intensity
• Obsession
• Possessiveness
• Jealousy
• Longing
• Frustration
• Vulnerability
• Humour
• Passion
• Emotional chaos
• Hope

The story should feel grounded and realistic despite the heightened emotions.

The characters should behave like real people making bad decisions rather than romance archetypes following a formula.

EMOTIONAL FEEL

The emotional tone should constantly balance:

Desire and frustration.

Anger and attraction.

Resentment and longing.

Pride and vulnerability.

Fear and hope.

The protagonists should frequently experience conflicting emotions.

Neither should fully understand what they are feeling.

Both should spend much of the story fighting themselves as much as they fight each other.

HUMOUR

Humour should be present throughout the story.

The humour should feel natural, character-driven, and often sarcastic.

Trailer park gossip.

Neighbour drama.

College life.

Workplace banter.

Friends making terrible observations at exactly the wrong moment.

The humour should provide relief from the heavier emotional moments without undermining them.

GRIT

The setting should feel lived-in and authentic.

Sweaty summer nights.

Loud neighbours.

Cheap beer.

Broken air conditioners.

Late-night arguments on porches.

Gravel roads.

Flickering streetlights.

The world should feel slightly rough around the edges.

Nothing should feel glamorous.

PASSION

The emotional and physical connection between the protagonists should feel powerful and consuming.

Every interaction should carry weight.

Even casual conversations should contain tension once their attraction begins to grow.

Small moments should feel significant.

A glance.

A touch.

A jealous reaction.

A careless comment.

Everything should matter.

OVERALL READER EXPERIENCE

The reader should feel addicted to the relationship.

The reader should constantly wonder what disastrous decision the protagonists will make next.

The reader should feel frustration, anticipation, jealousy, excitement, heartbreak, and satisfaction alongside the characters.

The story should feel emotionally messy, intensely romantic, highly charged, and impossible to stop reading.

Think:

Hot summer nights.

Thin trailer walls.

Bad decisions.

Sharp banter.

Explosive chemistry.

Too much pride.

Not enough communication.

And two idiots slowly ruining each other's lives before eventually becoming the best thing that ever happened to each other.


STYLE RULES

DIALOGUE

Avoid repetitive contemporary romance dialogue patterns.

Avoid overusing phrases such as:

• "You good?"
• "Fair."
• "Jesus Christ."
• "Christ."
• "Emotionally."
• "Spiritually."
• "I'm fine."
• "You're impossible."
• "You're an idiot."
• "Shut up."
• Excessive one-word responses.

Characters should have distinct voices.

Every major character should speak differently based on:

• Personality
• Age
• Education
• Social background
• Occupation
• Emotional state

No two characters should sound interchangeable.

HUMOUR

Avoid repetitive humour patterns.

Not every character should be sarcastic.

Not every character should tease in the same way.

Not every conversation should become banter.

Different characters should create humour through different methods:

• Dry observations
• Storytelling
• Self-deprecation
• Deadpan delivery
• Situational comedy
• Accidental humour
• Genuine wit

SIDE CHARACTERS

Avoid the common romance trope where everyone constantly notices the chemistry between the protagonists.

Friends should not repeatedly:

• Point out attraction.
• Comment on sexual tension.
• Suggest they are secretly in love.
• Act as relationship detectives.

Most people are focused on their own lives.

When side characters notice something, it should feel earned and occasional.

The protagonists should not feel like they are performing on a stage for an audience.

SCENE VARIETY

No duplicate scenes.

No scenes that accomplish the same emotional purpose repeatedly.

Each scene must introduce at least one of the following:

• New information
• New conflict
• Character growth
• Relationship progression
• Plot progression
• Emotional escalation

If a scene can be removed without affecting the story, it should not exist.

Avoid writing the same argument multiple times with different wording.

Avoid writing the same jealousy scene multiple times with different participants.

Avoid writing the same emotional breakthrough repeatedly.

EMOTIONAL VARIETY

Avoid repeating the same emotional beats.

Do not rely on:

• Constant jealousy
• Constant anger
• Constant sexual frustration

Create emotional range through:

• Humour
• Tenderness
• Fear
• Vulnerability
• Regret
• Hope
• Relief
• Pride
• Loneliness
• Comfort

CHARACTER REACTIONS

Avoid repetitive body language.

Do not repeatedly rely on:

• Smirks
• Raised eyebrows
• Growls
• Teeth showing
• Breath catching
• Eyes darkening
• Jaw ticking
• Rolling eyes
• Shrugging

Use fresh physical and emotional reactions that fit the individual character and moment.

INTIMACY SCENE VARIETY

Each intimate scene must serve a unique emotional purpose.

No two scenes should feel interchangeable.

Different scenes should explore different emotional states such as:

• Curiosity
• Competition
• Frustration
• Vulnerability
• Comfort
• Celebration
• Reconciliation
• Trust
• Emotional dependence
• Fear of loss

Avoid repeating the same emotional outcome after every intimate encounter.

The relationship should evolve because of these moments.

PACING

The second half of the novel must continue introducing meaningful conflict, emotional development, and relationship evolution.

Avoid the common romance problem where the protagonists become a couple and the story begins repeating itself.

The relationship should continue changing until the final chapter.

OVERALL OBJECTIVE

Every chapter should feel necessary.

Every scene should feel distinct.

Every major interaction should reveal something new about the characters, the relationship, or the story.

The reader should never feel they have already read a scene simply because a similar emotion appeared earlier in the novel.


STORY SETTINGS:
Relationship type: ${relationship}
Heat level: ${heat}
Regional language: ${regional.regionalLanguage}
Preferred terms: ${regional.locationTerms.join(", ")}
Forbidden terms: ${regional.forbiddenTerms.join(", ")}

CHAPTER 1 JOB:

* Open with a strong hook.
* Introduce the main character immediately.
* Introduce the romantic interest as early as possible.
* The romantic interest MUST appear within the first 1,000 words.
* The first meaningful interaction between the romantic leads MUST occur before the midpoint of the chapter.
* Focus on the primary romantic storyline over side characters, club politics, workplace politics, worldbuilding or secondary plots.
* Introduce only the supporting characters absolutely necessary for Chapter 1.
* Keep descriptions concise and purposeful.
* Ground the setting through action and character interaction.
* Establish the central romantic dynamic.
* Establish attraction, friction, curiosity, chemistry, tension or conflict between the leads.
* Make names, ages, jobs, genders, locations and relationships clear through natural storytelling.
* Do not reveal every secret.
* Do not solve the central conflict.
* Do not spend multiple paragraphs introducing minor characters.
* Do not spend excessive time explaining the setting before the romantic storyline begins.
* End on a clean hook, emotional turn, complication, charged moment, revelation or decision that makes the reader want Chapter 2 immediately.


STYLE:
- Natural commercial romance prose.
- First person if the story idea or characters imply it, otherwise use the most natural romance POV.
- Keep the prose readable, grounded, emotionally alive and character-led.
- Use distinct character voices.
- Dialogue should sound human, not over-polished.
- Keep humour and banter natural, not constant.
- Avoid therapy-speak.
- Avoid purple prose.
- Avoid random object descriptions.
- Avoid over-described rooms.
- Avoid fake profound lines.
- Avoid repeating the same phrase or sentence rhythm.
- Do not use em dashes or en dashes. Use commas, full stops, colons or parentheses instead.

Physical Intimacy & Relationship Progression

Physical intimacy is an important part of romantic storytelling and should be treated as meaningful character and relationship development rather than a brief event or transition.

When intimate scenes occur:
* Write them graphic and erotic.
* Write them fully on-page descriptive and detailed.
* Do not fade to black.
* Do not skip directly from anticipation to aftermath.
* Allow intimacy to occupy substantial page space when earned by the story.
* Build tension and anticipation before physical intimacy begins.
* Allow scenes to unfold naturally rather than rushing through major moments.

Physical intimacy should feel:

* Emotional.
* Romantic.
* Passionate.
* Character-driven.
* Personal.
* Relationship-specific.

Avoid:

* Clinical descriptions.
* Mechanical sequences of actions.
* Generic intimacy that could belong to any characters.
* Abrupt scene endings.
* Repetitive language and phrasing.
* Overly brief intimacy scenes that fail to satisfy narrative expectations.

Each intimate scene should reveal character, deepen emotional connection, and advance the relationship.

Physical intimacy should never feel separate from the emotional story.

# Spice Level Guidance

When the story's selected heat level allows explicit content:
* Detail intimacy fully on page.
* Show intimacy fully on-page.
* Allow scenes to be detailed and immersive.
* Use dirty talk.
* Include anticipation, build-up, physical intimacy, emotional interaction, and meaningful aftermath.
* Allow important intimacy scenes to occupy a significant portion of a chapter when appropriate.

Major romantic milestones should receive narrative weight equal to other major story events.

# Emotional Aftermath

After intimate scenes:

* Include emotional reactions.
* Include relationship development.
* Include vulnerability, humour, affection, conversation, or reflection where appropriate.
* Show how intimacy changes the emotional dynamic between the characters.

Readers should leave intimate scenes feeling that the relationship has evolved, not simply that a physical act occurred.

# Character-Specific Intimacy

Physical intimacy should always reflect the personalities, emotional states, histories, fears, desires, and relationship dynamics of the characters involved.

No two intimate scenes should feel interchangeable.

The emotional and physical experience should feel unique to the specific characters and their stage of relationship development.


CONTINUITY RULES:
- Follow the story idea and character notes above.
- Do not invent random illnesses, family emergencies, scandals, accidents, custody threats or villains unless the user seeded them.
- Do not change character genders, names, roles or relationships.
- Do not include anything from the must avoid section.

LENGTH:
- Write one complete chapter with a clear beginning, middle and end.
- Keep the chapter focused and do not over-expand setup, backstory, description or internal reflection.
- Reach the main emotional beat or story turn by the middle of the chapter.
- The final 20 percent of the chapter must resolve the current scene and land the chapter ending.
- Prioritise a finished chapter over length.
- If running short on space, compress description and reflection, not the ending.
- Do not cut off mid-scene.
- Do not stop during dialogue.
- Do not stop during a confrontation.
- Do not introduce a new scene, new conflict or new location near the end unless it is the final hook.
- Finish the final scene fully.
- End with a proper chapter ending: an emotional beat, decision, reveal, complication, romantic turn or hook.
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      text: { verbosity: "medium" },
      input: prompt,
      max_output_tokens: 12000,
    });

  if (response.status === "incomplete") {
  const partialChapter = cleanOutput(response.output_text || "");

  return Response.json(
    {
      result:
        partialChapter ||
        "Chapter generation stopped before finishing, but no partial text was returned.",
      storyState: openingStoryState,
      warning:
        "The chapter may be incomplete because the model hit the output limit."
    },
    { status: 200 }
  );
}

    const chapter = cleanOutput(response.output_text || "");

    if (!chapter.trim()) {
      return Response.json(
        {
          result: "No chapter text was returned.",
          storyState: openingStoryState,
        },
        { status: 500 }
      );
    }

  const storyState = {
  ...openingStoryState,
  chapter: 1,
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
          "Something went wrong while generating Chapter 1. The app is sulking in a corner.",
        storyState: openingStoryState,
      },
      { status: 500 }
    );
  }
}
