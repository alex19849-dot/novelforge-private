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
const { validateScenePlan, sceneSeconds, scenePhotoPrompt } = await import(
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
assert.ok(sceneSeconds(plan.slides[0].text) >= 6);
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
const copies = [
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
  if (b.text.format.name === "romantic_scene_slides") output = plan;
  else if (b.text.format.name === "scene_identity_check") {
    checks++;
    output = { decision: "pass", reason: "Fixture cast continuity check." };
  } else {
    assert.equal(b.text.format.name, "platform_specific_romance_copy");
    copyCalls++;
    output = { posts: copies };
  }
  return Response.json({
    id: "fixture",
    status: "completed",
    output_text: JSON.stringify(output),
    output: [],
  });
};
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
      platforms: ["tiktok", "instagram", "youtube"],
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
  for (let i = 0; i < 5; i++) {
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
    if (i < 4) assert.ok(!step.done);
    else assert.equal(step.done, true);
  }
  const finished = rows.get(saved.id);
  assert.equal(finished.poster_state, "ready");
  assert.equal(finished.poster_result.posts.length, 3);
  assert.equal(finished.poster_result.slideUrls.length, 3);
  assert.equal(finished.poster_result.delivery, "native");
  assert.equal(generations, 1);
  assert.equal(edits, 1);
  assert.equal(copyCalls, 1);
  assert.equal(checks, 1);
  assert.deepEqual(await server.advanceSceneSlides(run), { done: true });
  assert.equal(
    generations + edits,
    2,
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
    platforms: ["tiktok", "instagram", "youtube"],
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
  assert.equal(generations + edits, 2);
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
    platforms: ["tiktok", "instagram", "youtube"],
    delivery: "automatic",
    trackId: "babe",
  });
  await server.advanceSceneSlides({ ...queued[2], checkpoint: {} });
  assert.equal(
    generations + edits,
    2,
    "A deliberate soundtrack retry does not pay for new pictures",
  );
  const audioResult = rows.get(saved.id).poster_result;
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
  console.log(
    "PASS: authenticated scene planning and exact-excerpt validation; owned durable queue claims; one generated shot plus reference edit; cast check; three platform captions; actual three-slide 1080x1920 H264 video; clean export without audio; duplicate prevention; native-audio approval and provider fences; generated-human AI metadata. Cached photos survive text changes and soundtrack retries; AAC backing audio export verified. No paid API calls or published posts.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
