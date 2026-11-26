import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const owner = "fixture-owner",
  rows = new Map(),
  uploads = new Map(),
  queued = [];
const dbShim =
  "data:text/javascript," +
  encodeURIComponent(
    `export function jobAdmin(){return globalThis.sceneDb;}export async function jobUser(r){return r.headers.get('authorization')==='Bearer fixture'?{id:'fixture-owner'}:null;}export function jobJson(v,status=200){return Response.json(v,{status});}`,
  );
const queueShim =
  "data:text/javascript," +
  encodeURIComponent(
    `export async function startBackground(kind,args,user_id){globalThis.sceneQueued.push({kind,args,user_id});return {runId:'queue:'+args[2]};}export async function recoverBackgroundDispatches(){}`,
  );
registerHooks({
  resolve(s, c, n) {
    if (s === "server-only")
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (s.endsWith("/social-job-db") || s.endsWith("/social-job-server"))
      return { url: dbShim, shortCircuit: true };
    if (s.endsWith("/background-queue"))
      return { url: queueShim, shortCircuit: true };
    if (
      s.startsWith(".") &&
      c.parentURL &&
      existsSync(fileURLToPath(new URL(s + ".ts", c.parentURL)))
    )
      return n(s + ".ts", c);
    return n(s, c);
  },
});
class Q {
  constructor() {
    this.filters = [];
    this.op = "select";
  }
  select() {
    return this;
  }
  eq(k, v) {
    this.filters.push([k, v]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  insert(v) {
    this.op = "insert";
    this.v = v;
    return this;
  }
  update(v) {
    this.op = "update";
    this.v = v;
    return this;
  }
  async execute(single = false) {
    let data = [...rows.values()].filter((r) =>
      this.filters.every(
        ([k, v]) => (k === "recipe->>format" ? r.recipe?.format : r[k]) === v,
      ),
    );
    if (this.op === "insert") {
      data = [{ poster_state: "idle", ...this.v }];
      rows.set(this.v.id, data[0]);
    }
    if (this.op === "update")
      data = data.map((r) => {
        const next = { ...r, ...this.v };
        rows.set(r.id, next);
        return next;
      });
    return { error: null, data: single ? (data[0] ?? null) : data };
  }
  maybeSingle() {
    return this.execute(true);
  }
  then(a, b) {
    return this.execute().then(a, b);
  }
}
globalThis.sceneQueued = queued;
globalThis.sceneDb = {
  from() {
    return new Q();
  },
  storage: {
    from() {
      return {
        async upload(p, b) {
          assert.ok(
            !uploads.has(p),
            "Never overwrite a completed media receipt",
          );
          uploads.set(p, b);
          return { error: null };
        },
        async download(p) {
          return {
            data: uploads.has(p) ? new Blob([uploads.get(p)]) : null,
            error: null,
          };
        },
        getPublicUrl(p) {
          return { data: { publicUrl: "https://fixture.invalid/" + p } };
        },
      };
    },
  },
};
process.env.OPENAI_API_KEY = "fixture-no-paid-calls";
const { validateScenePlan, sceneSeconds, scenePhotoPrompt, sceneTimings, SCENE_CHANNELS, scenePlatformList } = await import(
  "../lib/social-scene-slides.ts"
);
const { readyForApproval } = await import("../lib/social-approval.ts");
const { bufferPayload } = await import("../lib/buffer-publishing.ts");
const plan = {
  format: "scene-slides",
  sourceMode: "premise",
  hook: "His rival just got closer.",
  cast: [
    "A fictional adult man, 26, short dark curls, square jaw, lean build, red wool sweater.",
    "A fictional adult man, 32, longer blond hair, narrow nose, broad build, navy shirt.",
  ],
  slides: [
    {
      text: "He came to the cabin to be alone. Sharing it with his rival was never part of the plan.",
      imagePrompt:
        "Two distinct adult men face each other across a small cabin table in warm winter light.",
      sourceQuote: "",
    },
    {
      text: "Now his rival is standing a little too close. And leaving is the last thing on his mind.",
      imagePrompt:
        "The same two men and clothing, now standing near the window with charged eye contact and natural expressions.",
      sourceQuote: "",
    },
  ],
};
assert.equal(validateScenePlan(plan, "").slides.length, 2);
assert.throws(
  () =>
    validateScenePlan(
      { ...plan, slides: [...plan.slides, plan.slides[0]] },
      "",
    ),
  /incomplete/,
);
assert.ok(sceneSeconds(plan.slides[0].text) >= 4);
assert.equal(sceneTimings(plan.slides.map(s=>s.text)).reduce((a,b)=>a+b,0),15);
assert.match(scenePhotoPrompt(plan, 1), /same two men/);
assert.notEqual(plan.cast[0], plan.cast[1]);
const excerpt = "He opened the door. His rival was there. Neither man moved.";
const exact = {
  ...plan,
  sourceMode: "excerpt",
  slides: [
    {
      ...plan.slides[0],
      text: "He opened the door.",
      sourceQuote: "He opened the door.",
    },
    {
      ...plan.slides[1],
      text: "His rival was there. Neither man moved.",
      sourceQuote: "His rival was there. Neither man moved.",
    },
  ],
};
assert.equal(validateScenePlan(exact, excerpt).sourceMode, "excerpt");
assert.throws(
  () =>
    validateScenePlan(
      {
        ...exact,
        slides: [
          { ...exact.slides[0], text: "Invented dialogue." },
          exact.slides[1],
        ],
      },
      excerpt,
    ),
  /original manuscript/,
);
const book = {
  slug: "fixture-book",
  title: "A Real Romance",
  subgenre: "MM romance",
  blurb: "Two adult rivals share a winter cabin and fall in love.",
  tropes: ["Rivals to lovers", "Forced proximity"],
  kindleUnlimited: true,
  amazonUrl: "https://www.amazon.com/dp/FIXTURE",
  coverUrl: "https://www.marlowquinn.com/covers/fixture.jpg",
};
const image = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: "#436b80" },
  })
    .jpeg()
    .toBuffer(),
  cover = await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#e6bd72" },
  })
    .jpeg()
    .toBuffer();
assert.ok(SCENE_CHANNELS.includes('facebook'));
assert.deepEqual(scenePlatformList(['facebook']),['facebook']);
const copies = [
  {platform:'facebook',title:'A Real Romance by Marlow Quinn',caption:'Would you stay in a cabin with the rival you cannot stop wanting? A Real Romance by Marlow Quinn brings two adult rivals closer, with winter chemistry and an attraction neither expected. Read on Kindle Unlimited: '+book.amazonUrl,hashtags:['#MMRomance','#GayBooks','#ForcedProximity']},
  {
    platform: "tiktok",
    title: "A Real Romance MM rivals romance",
    caption:
      "His rival is getting closer. A Real Romance by Marlow Quinn. Find it through my profile.",
    hashtags: [
      "#BookTok",
      "#MMRomance",
      "#RivalsToLovers",
      "#GayRomance",
      "#ForcedProximity",
    ],
  },
  {
    platform: "instagram",
    title: "A Real Romance by Marlow Quinn",
    caption:
      "A cabin and the man he wants to avoid. A Real Romance by Marlow Quinn. Link in bio.",
    hashtags: [
      "#Bookstagram",
      "#MMBooks",
      "#RivalsToLovers",
      "#RomanceReaders",
      "#ForcedProximity",
    ],
  },
  {
    platform: "youtube",
    title: "A Real Romance | MM rivals to lovers",
    caption:
      "Discover A Real Romance by Marlow Quinn, a cabin romance between two adult rivals. Find the book through the channel profile link.",
    hashtags: ["#Shorts", "#MMRomance", "#RivalsToLovers"],
  },
];
let planCalls = 0;
let generations = 0,
  edits = 0,
  copyCalls = 0,
  checks = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = String(input instanceof Request ? input.url : input);
  if (u === "https://www.marlowquinn.com/api/books")
    return Response.json({ books: [book] });
  if (u === book.coverUrl) return new Response(cover);
  if (u.endsWith("/images/generations") || u.endsWith("/images/edits")) {
    if (u.endsWith("/edits")) {
      edits++;
      assert.ok(
        init.body instanceof FormData,
        "Continuity image is sent as a real multipart image edit",
      );
    } else {
      generations++;
      assert.match(JSON.parse(init.body).prompt, /different faces/);
    }
    return Response.json(
      { data: [{ b64_json: image.toString("base64") }] },
      { headers: { "x-request-id": "fixture-" + (generations + edits) } },
    );
  }
  assert.equal(u, "https://api.openai.com/v1/responses");
  const b = JSON.parse(init.body);
  let output;
  if (b.text.format.name === "romantic_scene_slides") {
    const evidence=JSON.parse(b.input.find(x=>x.role==='user').content);
    assert.equal(evidence.savedStory.kind,'manuscript','Automatic planning reads the saved book without supplied descriptions');
    assert.ok(evidence.savedStory.passage.includes('rival'));
    assert.deepEqual(evidence.savedStory.bible.characters,plan.cast);
    if (!evidence.proposed) {planCalls++; assert.ok(evidence.creativeTreatment.shotDirection);}
    else assert.deepEqual(evidence.proposed.cast,plan.cast,"Editor preserves the cast");
    output = plan;
  }
  else if (b.text.format.name === "scene_identity_check") {
    checks++;
    output = checks === 1 ? {decision:"reject",reason:"The same men are present but the second shot looks like a business conversation. Add source-supported romantic eye contact."} : { decision: "pass", reason: "Fixture cast continuity and romantic chemistry check." };
  } else {
    assert.equal(b.text.format.name, "platform_specific_romance_copy");
    copyCalls++;
    output = { posts: copies.filter(p=>b.text.format.schema.properties.posts.items.properties.platform.enum.includes(p.platform)) };
  }
  return Response.json({
    id: "fixture",
    status: "completed",
    output_text: JSON.stringify(output),
    output: [],
  });
};
rows.set('owned-story',{id:'owned-story',user_id:owner,title:book.title,form:{premise:book.blurb,characters:plan.cast},chapters:[{id:'opening',number:1,content:('The two adult rivals share a cabin. He notices his rival looking at him. ').repeat(12)}]});
try {
  const api = await import("../app/api/social-studio/slides/route.ts"),
    server = await import("../lib/social-scene-slides-server.ts");
  const req = (body, auth = true) =>
    new Request("https://fixture/slides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer fixture" } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal((await api.POST(req({ action: "plan" }, false))).status, 401);
  const planned = await api.POST(req({ action: "plan", bookSlug: book.slug }));
  assert.equal(planned.status, 200);
  const saved = await planned.json(),
    receipt = randomUUID();
  assert.equal(
    (
      await api.POST(
        req({
          action: "generate",
          promptId: randomUUID(),
          requestId: receipt,
          plan,
          platforms: ["tiktok"],
        }),
      )
    ).status,
    400,
  );
  let start = await api.POST(
    req({
      action: "generate",
      promptId: saved.id,
      requestId: receipt,
      plan,
      platforms: ["facebook", "tiktok", "instagram", "youtube"],
      delivery: "native",
    }),
  );
  assert.equal(start.status, 202);
  assert.equal(queued.length, 1);
  await api.POST(
    req({
      action: "generate",
      promptId: saved.id,
      requestId: randomUUID(),
      plan,
      platforms: ["tiktok"],
      delivery: "native",
    }),
  );
  assert.equal(
    queued.length,
    1,
    "Concurrent generation does not enqueue a second charged task",
  );
  const run = { ...queued[0], checkpoint: {} };
  for (let i = 0; i < 7; i++) {
    const step = await server.advanceSceneSlides(run);
    if (i === 0) {
      const visible = await api.GET(
        new Request("https://fixture/slides?promptId=" + saved.id, {
          headers: { Authorization: "Bearer fixture" },
        }),
      );
      assert.equal(visible.status, 200);
      const progress = await visible.json();
      assert.equal(progress.previewUrls.length, 1);
      assert.ok(progress.previewUrls[0].includes(owner + "/creations/"));
    }
    if (i < 6) assert.ok(!step.done);
    else assert.equal(step.done, true);
  }
  const finished = rows.get(saved.id);
  assert.equal(finished.poster_state, "ready");
  assert.equal(finished.poster_result.posts.length, 4);
  assert.equal(finished.poster_result.slideUrls.length, 3);
  assert.equal(finished.poster_result.delivery, "native");
  assert.equal(finished.poster_result.duration,15,"Standard scene sequences run for 15 seconds");
  const fb=finished.poster_result.posts.find(p=>p.platform==='facebook');
  assert.ok(fb.caption.includes(book.amazonUrl));
  assert.equal(fb.hashtags.length,3);
  assert.equal(generations, 1);
  assert.equal(edits, 2);
  assert.equal(copyCalls, 1);
  assert.equal(finished.poster_result.slidesRecovery.repairCount,1);
  assert.ok(finished.poster_result.slidesRecovery.images[1].includes("-repair-1"));
  assert.ok(finished.poster_result.slidesRecovery.previousImages.length===1,"Earlier image is kept for recovery");
  assert.equal(checks, 2);
  assert.deepEqual(await server.advanceSceneSlides(run), { done: true });
  assert.equal(
    generations + edits,
    3,
    "Redelivery never repeats completed image calls",
  );
  const videoPath = finished.poster_result.posts[0].mediaPath,
    dir = await mkdtemp(join(tmpdir(), "scene-video-test-"));
  try {
    const file = join(dir, "video.mp4");
    await writeFile(file, uploads.get(videoPath));
    let meta = "";
    try {
      execFileSync(
        "node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
        ["-hide_banner", "-i", file],
        { stdio: "pipe" },
      );
    } catch (e) {
      meta = e.stderr.toString();
    }
    assert.match(meta, /1080x1920/);
    assert.match(meta, /Video: h264/);
    assert.ok(
      !meta.includes("Audio:"),
      "Clean native export has no baked-in random music",
    );
    assert.match(
      meta,
      new RegExp(
        "Duration: 00:00:" +
          String(finished.poster_result.duration).padStart(2, "0"),
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  assert.equal(saved.source,"manuscript");
  assert.ok(Number.isInteger(saved.plan.design));
  const post = {
    id: randomUUID(),
    user_id: owner,
    platform: "tiktok",
    status: "draft",
    scheduled_at: "2030-12-01T19:00:00Z",
    caption: "A Real Romance by Marlow Quinn",
    title: "A Real Romance",
    hashtags: ["#BookTok"],
    media_path: videoPath,
    media_type: "video",
    planned_media_type: "video",
    content_metadata: { native_audio_required: true },
  };
  assert.equal(readyForApproval(post), false);
  assert.throws(
    () =>
      bufferPayload(post, { id: "tt" }, "https://fixture.invalid/video.mp4"),
    /platform audio/,
  );
  const automatic = {
    ...post,
    content_metadata: { format: "scene-slides", ai_generated: true },
  };
  assert.equal(readyForApproval(automatic), true);
  assert.equal(
    bufferPayload(automatic, { id: "tt" }, "https://fixture.invalid/video.mp4")
      .metadata.tiktok.isAiGenerated,
    true,
  );
  assert.equal(
    rows
      .get(saved.id)
      .poster_result.posts.every((p) =>
        p.mediaPath.startsWith(owner + "/creations/"),
      ),
    true,
  );
  const editedPlan = {
    ...plan,
    slides: [
      { ...plan.slides[0], text: plan.slides[0].text + " He stays." },
      plan.slides[1],
    ],
  };
  const secondReceipt = randomUUID();
  await server.queueSceneSlides(owner, {
    promptId: saved.id,
    requestId: secondReceipt,
    plan: editedPlan,
    platforms: ["facebook", "tiktok", "instagram", "youtube"],
    delivery: "automatic",
    trackId: "none",
  });
  assert.equal(
    rows.get(saved.id).poster_result.slidesRecovery.images.length,
    2,
    "Text and soundtrack edits retain both completed images",
  );
  const secondRun = { ...queued[1], checkpoint: {} };
  await server.advanceSceneSlides(secondRun);
  assert.equal(generations + edits, 3);
  await server.failSceneSlides(owner, saved.id, receipt, "Stale task error");
  assert.equal(
    rows.get(saved.id).poster_state,
    "generating",
    "An old receipt cannot fail a newer sequence",
  );
  await server.failSceneSlides(
    owner,
    saved.id,
    secondReceipt,
    "Fixture interruption",
  );
  assert.equal(
    rows.get(saved.id).poster_result.slidesRecovery.images.length,
    2,
  );
  const musicDenied = await api.POST(new Request('https://fixture/slides',{method:'POST',body:JSON.stringify({action:'music',plan:editedPlan})}));
  assert.equal(musicDenied.status,401);
  rows.set('foreign-music',{id:'foreign-music',user_id:'different-owner',recipe:{format:'scene-slides'},poster_result:{trackId:'babe'}});
  const matchedResponse = await api.POST(req({action:'music',plan:editedPlan,mood:'sensual',promptId:saved.id,exclude:['j-b-r-b-music','thinking-about-you','baileys']}));
  assert.equal(matchedResponse.status,200);
  assert.equal((await matchedResponse.json()).trackId,'babe','Music matching reads only the owner history');
  const badMusic = await api.POST(req({action:'music',plan:editedPlan,mood:'invented'}));
  assert.equal(badMusic.status,400);
  const thirdReceipt = randomUUID();
  await server.queueSceneSlides(owner, {
    promptId: saved.id,
    requestId: thirdReceipt,
    plan: editedPlan,
    platforms: ["facebook", "tiktok", "instagram", "youtube"],
    delivery: "automatic",
    trackId: "babe",
  });
  await server.advanceSceneSlides({ ...queued[2], checkpoint: {} });
  assert.equal(
    generations + edits,
    3,
    "A deliberate soundtrack retry does not pay for new pictures",
  );
  const audioResult = rows.get(saved.id).poster_result;
  const fbReady=audioResult.posts.find(p=>p.platform==='facebook');
  assert.ok(fbReady,'Facebook is retained in the completed automatic sequence');
  const fbPost={...post,id:fbReady.id,platform:'facebook',caption:fbReady.caption,title:fbReady.title,hashtags:fbReady.hashtags,media_path:fbReady.mediaPath,content_metadata:{native_audio_required:false,ai_generated:true}};
  assert.ok(readyForApproval(fbPost,Date.parse('2029-01-01T00:00:00Z')),'Facebook video can be approved on its own UK schedule');
  const fbPayload=bufferPayload(fbPost,{id:'facebook-channel'},'https://fixture.invalid/scene.mp4');
  assert.equal(fbPayload.channelId,'facebook-channel');
  assert.equal(fbPayload.assets[0].video.url,'https://fixture.invalid/scene.mp4');
  assert.ok(fbPayload.text.includes(book.amazonUrl));
  assert.equal(audioResult.delivery, "automatic");
  assert.equal(audioResult.trackId, "babe");
  const audioDir = await mkdtemp(join(tmpdir(), "scene-audio-test-"));
  try {
    const file = join(audioDir, "with-audio.mp4");
    await writeFile(file, uploads.get(audioResult.posts[0].mediaPath));
    let metadata = "";
    try {
      execFileSync(
        "node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
        ["-hide_banner", "-i", file],
        { stdio: "pipe" },
      );
    } catch (e) {
      metadata = e.stderr.toString();
    }
    assert.match(metadata, /Audio: aac/);
    assert.match(metadata, /1080x1920/);
  } finally {
    await rm(audioDir, { recursive: true, force: true });
  }
  const defaultMusicReceipt = randomUUID();
  await server.queueSceneSlides(owner, {promptId:saved.id, requestId:defaultMusicReceipt, plan:editedPlan, platforms:['tiktok','youtube']});
  const auto = rows.get(saved.id).poster_result.slidesRecovery;
  assert.equal(auto.delivery,'automatic','New scene exports default to automatic publishing');
  assert.ok(auto.trackId && auto.trackId !== 'sun-in-your-eyes','Default automatically selects a new mood-matched track');
  await server.advanceSceneSlides({...queued[3],checkpoint:{}});
  const kept=rows.get(saved.id).poster_result.slidesRecovery.copies;
  const beforeAdd=copyCalls;
  const addFacebook=randomUUID();
  await server.queueSceneSlides(owner,{promptId:saved.id,requestId:addFacebook,plan:editedPlan,platforms:['facebook','tiktok','youtube'],delivery:'automatic',trackId:'babe'});
  const addRun={...queued[4],checkpoint:{}};
  await server.advanceSceneSlides(addRun);
  assert.equal(copyCalls,beforeAdd+1,'Adding Facebook requests only its missing platform copy');
  const expanded=rows.get(saved.id).poster_result.slidesRecovery.copies;
  for(const c of kept) assert.deepEqual(expanded.find(p=>p.platform===c.platform),c,'Existing channel copy stays unchanged');
  assert.ok(expanded.find(p=>p.platform==='facebook').caption.includes(book.amazonUrl));
  await server.advanceSceneSlides(addRun);
  assert.equal(rows.get(saved.id).poster_state,'ready');
  assert.equal(generations+edits,3,'Restoring Facebook reuses the existing photographs');
  const beforeChannelAdd=rows.get(saved.id).poster_result;
  const originalPosts=structuredClone(beforeChannelAdd.posts);
  const dropReceipt=randomUUID();
  await server.queueSceneSlides(owner,{promptId:saved.id,requestId:dropReceipt,plan:editedPlan,platforms:['tiktok','youtube'],delivery:'automatic',trackId:'babe'});
  assert.equal((await server.advanceSceneSlides({...queued[5],checkpoint:{}})).done,true,'Channel-only changes reuse the existing video');
  const restoreReceipt=randomUUID(), uploadCount=uploads.size;
  await server.queueSceneSlides(owner,{promptId:saved.id,requestId:restoreReceipt,plan:editedPlan,platforms:['facebook','tiktok','youtube'],delivery:'automatic',trackId:'babe'});
  const restoreRun={...queued[6],checkpoint:{}};
  await server.advanceSceneSlides(restoreRun);
  await server.advanceSceneSlides(restoreRun);
  const restored=rows.get(saved.id).poster_result;
  for(const p of originalPosts.filter(p=>p.platform!=='facebook')) {
    const keptPost=restored.posts.find(x=>x.platform===p.platform);
    assert.equal(keptPost.id,p.id,'Adding Facebook preserves existing scheduled-post IDs');
    assert.equal(keptPost.mediaPath,p.mediaPath,'Existing scheduled media is unchanged');
  }
  assert.equal(uploads.size,uploadCount,'Adding Facebook needs no new image or video uploads');
  const planCallsBeforeRepeat=planCalls, imagesBeforeRepeat=generations+edits;
  const repeated=await api.POST(req({action:'plan',bookSlug:book.slug}));
  assert.equal(repeated.status,400,'Repeated sequence cannot proceed to images');
  assert.equal(planCalls-planCallsBeforeRepeat,2,'One bounded text-only correction is attempted automatically');
  assert.equal(generations+edits,imagesBeforeRepeat,'Repeated plan requests do not request new paid images');
  console.log(
    "PASS: authenticated scene planning and exact-excerpt validation; owned durable queue claims; one generated shot plus reference edit; cast check; four platform captions including Facebook; actual three-slide 1080x1920 H264 video; clean export without audio; duplicate prevention; native-audio approval and provider fences; generated-human AI metadata. Cached photos survive text changes and soundtrack retries; AAC backing audio export verified. No paid API calls or published posts.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
