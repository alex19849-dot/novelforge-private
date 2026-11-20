import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { writeFile, readFile } from "node:fs/promises";
const authShim =
  "data:text/javascript," +
  encodeURIComponent(
    `export async function jobUser(request){return request.headers.get('authorization')==='Bearer fixture-owner'?{id:'fixture-owner'}:null;} export function jobAdmin(){return globalThis.studioTestDb;} export function jobJson(value,status=200){return Response.json(value,{status});}`,
  );
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/social-job-server"))
      return { url: authShim, shortCircuit: true };
    if (specifier === "next/server") return next("next/server.js", context);
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (
        !/\.[a-z]+$/i.test(url.pathname) &&
        existsSync(fileURLToPath(url) + ".ts")
      )
        return next(specifier + ".ts", context);
    }
    return next(specifier, context);
  },
});
process.env.OPENAI_API_KEY = "fixture-no-live-calls";
const { nextCreativeDirection, validatePlatformCopies, buildCreativePrompt } =
  await import("../lib/social-creative-directions.ts");
const {
  kindleScreen,
  composeKindlePoster,
  sceneFingerprint,
  sceneIsTooSimilar,
} = await import("../lib/social-kindle-poster.ts");
const { readyForApproval } = await import("../lib/social-approval.ts");
const { londonSchedule } = await import("../lib/social-calendar.ts");
const { musicForPath } = await import("../lib/social-music.ts");
const history = [];
for (let i = 0; i < 90; i++) {
  const recipe = nextCreativeDirection(history, i * 1237);
  assert.ok(!history.some((h) => h.concept_key === recipe.key));
  if (history.length) {
    assert.notEqual(recipe.sceneMode, history[0].recipe.sceneMode);
    assert.notEqual(recipe.layout, history[0].recipe.layout);
    assert.notEqual(recipe.palette, history[0].recipe.palette);
  }
  history.unshift({ concept_key: recipe.key, recipe });
}
const book = {
  slug: "fixture-book",
  title: "A Real Romance",
  blurb: "Two adult rivals fall in love in a winter town.",
  tropes: ["Rivals to lovers", "Forced proximity", "Found family"],
  subgenre: "MM winter romance",
  kindleUnlimited: true,
  amazonUrl: "https://amazon.example/real-book",
  coverUrl: "https://www.marlowquinn.com/fixture-cover.png",
};
const platforms = ["facebook", "tiktok", "youtube", "instagram"];
const copies = [
  {
    platform: "facebook",
    title: "A Real Romance",
    caption:
      "Would you risk your heart for your rival? A Real Romance by Marlow Quinn brings two adult rivals together. Read it here: " +
      book.amazonUrl,
    hashtags: ["#MMRomance", "#RivalsToLovers", "#WinterRomance"],
  },
  {
    platform: "instagram",
    title: "A Real Romance | Marlow Quinn",
    caption:
      "Winter outside. A very different kind of warmth inside. Meet your next rivals to lovers romance, A Real Romance by Marlow Quinn. Link in bio.",
    hashtags: [
      "#MMBooks",
      "#RivalsToLovers",
      "#Bookstagram",
      "#RomanceBooks",
      "#ForcedProximity",
    ],
  },
  {
    platform: "tiktok",
    title: "Rivals to lovers MM romance | A Real Romance",
    caption:
      "Sharing a winter town was awkward enough. Falling for his rival? Find A Real Romance by Marlow Quinn through the link on my profile.",
    hashtags: [
      "#BookTok",
      "#MMRomance",
      "#ForcedProximity",
      "#GayRomance",
      "#RivalsToLovers",
    ],
  },
  {
    platform: "youtube",
    title: "A Real Romance by Marlow Quinn | MM rivals to lovers romance",
    caption:
      "Discover A Real Romance by Marlow Quinn, a winter MM romance about two adult rivals whose lives become closer than either expected. If rivals to lovers and forced proximity are your kind of story, find the book through the link on my channel profile.",
    hashtags: ["#Shorts", "#MMRomance", "#RivalsToLovers"],
  },
];
assert.equal(validatePlatformCopies(copies, platforms, book).length, 4);
assert.throws(
  () =>
    validatePlatformCopies(
      copies.map((p) =>
        p.platform === "instagram"
          ? {
              ...p,
              hashtags: copies.find((p) => p.platform === "tiktok").hashtags,
            }
          : p,
      ),
      platforms,
      book,
    ),
  /repeated|does not match/,
);
assert.throws(
  () =>
    validatePlatformCopies(
      copies.map((p) => ({
        ...p,
        caption: p.caption + " Available on Kindle Unlimited.",
      })),
      platforms,
      { ...book, kindleUnlimited: false },
    ),
  /not verified/,
);
const recipe = nextCreativeDirection([], 31),
  hook = "His rival is starting to feel like home.";
const promptText = buildCreativePrompt(
  book,
  recipe,
  hook,
  "An empty winter street glowing with warm window light.",
  "Expressive readable serif",
);
assert.match(promptText, /ORIGINAL supplied book cover intact on a Kindle/);
assert.match(promptText, /Available on Kindle Unlimited/);
assert.ok(
  !buildCreativePrompt(
    { ...book, kindleUnlimited: false },
    recipe,
    hook,
    "A winter scene",
    "Clear type",
  ).includes("Availability line: Available on Kindle Unlimited"),
);
const background = await sharp({
  create: { width: 1080, height: 1920, channels: 3, background: "#304752" },
})
  .jpeg()
  .toBuffer();
const cover = await sharp({
  create: { width: 600, height: 900, channels: 3, background: "#e6bd72" },
})
  .png()
  .toBuffer();
for (let layout = 0; layout < 4; layout++)
  for (const portrait of [false, true]) {
    const poster = await composeKindlePoster(
      background,
      cover,
      book,
      { ...recipe, layout },
      hook,
      portrait,
    );
    const metadata = await sharp(poster).metadata();
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, portrait ? 1920 : 1350);
    const screen = kindleScreen(portrait, layout);
    await writeFile(
      `/tmp/studio-layout-${layout}-${portrait ? "portrait" : "feed"}.jpg`,
      poster,
    );
    const crop = await sharp(poster)
      .extract({
        left: screen.screenX + 30,
        top: screen.screenY + 30,
        width: 80,
        height: 80,
      })
      .toBuffer();
    const stats = await sharp(crop).stats();
    assert.ok(
      Math.abs(stats.channels[0].mean - 230) < 4 &&
        Math.abs(stats.channels[1].mean - 189) < 4,
      `Original cover colours, layout ${layout}/${portrait}: ${JSON.stringify(stats.channels.map((c) => c.mean))}`,
    );
    await writeFile(
      `/tmp/studio-layout-${layout}-${portrait ? "portrait" : "feed"}.jpg`,
      poster,
    );
  }
const fingerprint = await sceneFingerprint(background);
assert.ok(
  sceneIsTooSimilar(
    fingerprint,
    await sceneFingerprint(
      await sharp(background).resize(500).jpeg({ quality: 70 }).toBuffer(),
    ),
  ),
);
assert.equal(sceneIsTooSimilar("0000000000000000", "ffffffffffffffff"), false);
const rows = new Map(),
  uploads = new Map();
let modelCalls = 0,
  rejectBackground = false,
  freshHook = "Winter has a way of bringing rivals closer.",
  freshScene = "A warm window overlooking the snowy town.";
class Query {
  constructor() {
    this.filters = [];
    this.operation = "select";
  }
  select() {
    return this;
  }
  eq(k, v) {
    this.filters.push([k, v, true]);
    return this;
  }
  neq(k, v) {
    this.filters.push([k, v, false]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  insert(value) {
    this.operation = "insert";
    this.value = value;
    return this;
  }
  update(value) {
    this.operation = "update";
    this.value = value;
    return this;
  }
  async execute(single = false) {
    let selected = [...rows.values()].filter((r) =>
      this.filters.every(([k, v, e]) => (e ? r[k] === v : r[k] !== v)),
    );
    if (this.operation === "insert") {
      const row = {
        status: "pending",
        poster_state: "idle",
        poster_request_id: null,
        ...this.value,
      };
      rows.set(row.id, row);
      selected = [row];
    }
    if (this.operation === "update")
      selected = selected.map((r) => {
        const row = { ...r, ...this.value };
        rows.set(r.id, row);
        return row;
      });
    return { data: single ? (selected[0] ?? null) : selected, error: null };
  }
  maybeSingle() {
    return this.execute(true);
  }
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}
globalThis.studioTestDb = {
  from() {
    return new Query();
  },
  storage: {
    from() {
      return {
        async upload(path, bytes) {
          assert.ok(!uploads.has(path));
          uploads.set(path, bytes);
          return { error: null };
        },
        getPublicUrl(path) {
          return { data: { publicUrl: "https://fixture.invalid/" + path } };
        },
      };
    },
  },
};
const oldFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://www.marlowquinn.com/api/books")
    return Response.json({ books: [book] });
  if (url === book.coverUrl) return new Response(cover);
  assert.equal(
    url,
    "https://api.openai.com/v1/responses",
    "Unexpected network request blocked by fixture",
  );
  modelCalls++;
  const body = JSON.parse(init.body);
  if (body.text?.format?.name === "fresh_romance_concept")
    return Response.json({
      id: "concept",
      output_text: JSON.stringify({
        hook: freshHook,
        scene: freshScene,
        typography: "Clear expressive serif",
        factAnchors: ["Two adult rivals fall in love"],
      }),
      output: [],
    });
  if (body.text?.format?.name === "platform_specific_romance_copy")
    return Response.json({
      id: "copy",
      output_text: JSON.stringify({
        posts: copies.filter((p) => platforms.includes(p.platform)),
      }),
      output: [],
    });
  if (body.model === "gpt-5.6-terra")
    return Response.json({
      id: "check",
      output_text: JSON.stringify({
        decision: rejectBackground ? "reject" : "pass",
        reason: rejectBackground
          ? "A fabricated paperback was detected."
          : "Clean scene.",
      }),
      output: [],
    });
  return Response.json({
    id: "image",
    output: [
      { type: "image_generation_call", result: background.toString("base64") },
    ],
    output_text: "",
  });
};
try {
  const api = await import("../app/api/social-studio/poster/route.ts");
  const promptId = randomUUID(),
    requestId = randomUUID();
  rows.set(promptId, {
    id: promptId,
    user_id: "fixture-owner",
    book_slug: book.slug,
    status: "ready",
    poster_state: "idle",
    recipe,
    hook,
    prompt: promptText,
  });
  const request = (auth = true, id = promptId, receipt = requestId) =>
    new Request("https://fixture.invalid/api/social-studio/poster", {
      method: "POST",
      headers: auth
        ? {
            authorization: "Bearer fixture-owner",
            "Content-Type": "application/json",
          }
        : {},
      body: JSON.stringify({
        promptId: id,
        requestId: receipt,
        prompt: promptText,
        platforms,
      }),
    });
  let response = await api.POST(request(false));
  assert.equal(response.status, 401);
  assert.equal(modelCalls, 0);
  response = await api.POST(request());
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.posts.length, 4);
  assert.equal(
    result.posts.find((p) => p.platform === "youtube").mediaType,
    "video",
  );
  assert.ok(
    result.posts
      .find((p) => p.platform === "youtube")
      .videoUrl.endsWith(".mp4"),
  );
  assert.ok(
    musicForPath(result.posts.find((p) => p.platform === "youtube").mediaPath),
  );
  assert.equal(
    uploads.size,
    3,
    "One feed poster, one portrait poster and one MP4 are shared across platform variants",
  );
  for (const [i, p] of result.posts.entries()) {
    const scheduled_at = londonSchedule("2027-01-10", `${18 + i}:00`);
    assert.ok(
      readyForApproval(
        {
          status: "draft",
          scheduled_at,
          caption: p.caption,
          platform: p.platform,
          planned_media_type: p.mediaType,
          media_path: p.mediaPath,
          media_type: p.mediaType,
          title: p.title,
          hashtags: p.hashtags,
        },
        Date.parse("2027-01-09T12:00Z"),
      ),
    );
  }
  const callsBefore = modelCalls;
  response = await api.POST(request());
  assert.equal(response.status, 200);
  assert.equal(
    modelCalls,
    callsBefore,
    "Retrying a completed receipt does not pay for new images or copy",
  );
  rows.set(promptId, {
    ...rows.get(promptId),
    poster_state: "generating",
    poster_request_id: randomUUID(),
  });
  response = await api.POST(request());
  assert.equal(response.status, 409);
  assert.equal(
    modelCalls,
    callsBefore,
    "A running poster cannot be submitted twice",
  );
  rows.set(promptId, {
    ...rows.get(promptId),
    poster_state: "idle",
    poster_request_id: null,
  });
  rejectBackground = true;
  const uploadsBefore = uploads.size;
  response = await api.POST(request(true, promptId, randomUUID()));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Background rejected/);
  assert.equal(
    uploads.size,
    uploadsBefore,
    "A rejected background is not saved as usable media",
  );
  const previousId = randomUUID();
  rows.set(previousId, {
    id: previousId,
    user_id: "fixture-owner",
    book_slug: book.slug,
    status: "ready",
    poster_state: "ready",
    recipe,
    hook,
    prompt: promptText,
    poster_result: {
      ...result,
      posts: result.posts.map((p) => ({
        ...p,
        caption:
          "A completely different earlier opening about this story and its romance.",
      })),
    },
  });
  rows.set(promptId, {
    ...rows.get(promptId),
    poster_state: "idle",
    poster_request_id: null,
  });
  rejectBackground = false;
  response = await api.POST(request(true, promptId, randomUUID()));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /too similar/);
  assert.equal(uploads.size, uploadsBefore);
  const promptApi = await import("../app/api/social-studio/prompts/route.ts");
  const conceptRequest = (auth = true) =>
    new Request("https://fixture.invalid/api/social-studio/prompts", {
      method: "POST",
      headers: auth
        ? {
            authorization: "Bearer fixture-owner",
            "Content-Type": "application/json",
          }
        : {},
      body: JSON.stringify({
        bookSlug: book.slug,
        notes:
          "Use the actual cover inside a Kindle, with verified tropes and KU.",
      }),
    });
  response = await promptApi.POST(conceptRequest(false));
  assert.equal(response.status, 401);
  response = await promptApi.POST(conceptRequest());
  assert.equal(response.status, 200);
  const concept = await response.json();
  assert.match(
    concept.prompt,
    /ORIGINAL supplied book cover intact on a Kindle/,
  );
  assert.equal(rows.get(concept.id).status, "ready");
  response = await promptApi.POST(conceptRequest());
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /too similar/);
  freshHook = "He never planned to fall for his rival.";
  freshScene = "Deep blue frost on a high arched doorway in the winter town.";
  response = await promptApi.POST(conceptRequest());
  assert.equal(response.status, 200);
  assert.notEqual((await response.json()).recipe.key, concept.recipe.key);
  console.log(
    "PASS: 90 non-repeating directions; real prompt handler persists new ideas and rejects semantic repeats; distinct platform copy and hashtags; verified KU; original cover insertion in 8 layouts; authenticated poster flow; real MP4/music rendering; independent UK schedules; idempotent retries; duplicate-run rejection; failed scene inspection and near-duplicate backgrounds block storage. No paid API calls.",
  );
} finally {
  globalThis.fetch = oldFetch;
  delete globalThis.studioTestDb;
}
