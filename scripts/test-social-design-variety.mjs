import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
registerHooks({
  resolve(s, c, next) {
    if (
      s.startsWith(".") &&
      c.parentURL &&
      existsSync(new URL(s + ".ts", c.parentURL))
    )
      return next(s + ".ts", c);
    return next(s, c);
  },
});
const { nextCreativeDirection, buildCreativePrompt, reviewedPosterBrief } =
  await import("../lib/social-creative-directions.ts");
const { DESIGN_PALETTES, FONT_PAIRS, DESIGN_LAYOUTS, colourContrast } =
  await import("../lib/social-poster-design.ts");
const { composeKindlePoster, kindleScreen } = await import(
  "../lib/social-kindle-poster.ts"
);
const { collageBoxes } = await import("../lib/social-poster-collage.ts");
for (const p of DESIGN_PALETTES)
  assert.ok(colourContrast(p.light, p.ink) >= 7, p.name);
const history = [],
  globalStyles = [];
for (let i = 0; i < 200; i++) {
  const r = nextCreativeDirection(
    history,
    i * 173,
    { subgenre: "Christmas MM romance" },
    globalStyles,
  );
  assert.ok(!history.some((h) => h.concept_key === r.key));
  for (const previous of globalStyles.slice(0, 2)) {
    assert.notEqual(
      DESIGN_PALETTES[r.palette].family,
      DESIGN_PALETTES[previous.palette].family,
    );
    assert.notEqual(r.layout, previous.layout);
    assert.notEqual(r.fontPair, previous.fontPair);
  }
  for (const previous of globalStyles.slice(0, 3))
    assert.notEqual(r.palette, previous.palette);
  if (globalStyles[0])
    assert.notEqual(r.layout % 3, globalStyles[0].layout % 3);
  globalStyles.unshift(r);
  history.unshift({ concept_key: r.key, recipe: r });
}
const crossBook = nextCreativeDirection([], 77, undefined, globalStyles);
assert.notEqual(crossBook.layout, globalStyles[0].layout);
assert.notEqual(crossBook.palette, globalStyles[0].palette);
assert.notEqual(crossBook.fontPair, globalStyles[0].fontPair);
const book = {
  slug: "fixture",
  title: "A Real Romance",
  subgenre: "MM Christmas Romance",
  blurb: "Two rivals share a winter cabin.",
  tropes: [
    "Grumpy / Sunshine",
    "Enemies to Lovers",
    "Forced Proximity",
    "Christmas Fling",
  ],
  kindleUnlimited: true,
  amazonUrl: "https://example.com/book",
  coverUrl: "https://example.com/cover",
};
const bg = await sharp({
  create: { width: 1080, height: 1920, channels: 3, background: "#a6c2c0" },
})
  .jpeg()
  .toBuffer();
const cover = await sharp({
  create: { width: 600, height: 900, channels: 3, background: "#e6bd72" },
})
  .png()
  .toBuffer();
for (let layout = 0; layout < DESIGN_LAYOUTS.length; layout++)
  for (let fontPair = 0; fontPair < FONT_PAIRS.length; fontPair++)
    for (const portrait of [false, true]) {
      const r = {
        designVersion: 3,
        key: "fixture",
        sceneMode: 0,
        layout,
        palette: (layout * 2 + fontPair) % 12,
        fontPair,
        hookAngle: 0,
        fontStyle: FONT_PAIRS[fontPair].style,
      };
      const prompt = buildCreativePrompt(
        book,
        r,
        "His Christmas plans never included falling for him.",
        "A textured romantic flat lay.",
        FONT_PAIRS[fontPair].name,
      );
      const reviewed = reviewedPosterBrief(book, r, prompt, "fallback");
      assert.equal(reviewed.recipe.layout, layout);
      assert.equal(reviewed.recipe.fontPair, fontPair);
      const result = await composeKindlePoster(
        bg,
        cover,
        book,
        r,
        "His Christmas plans never included falling for him.",
        portrait,
      );
      const screen = kindleScreen(portrait, layout, 3);
      const crop = await sharp(result)
        .extract({
          left: screen.screenX + 30,
          top: screen.screenY + 30,
          width: 60,
          height: 60,
        })
        .toBuffer();
      const stats = await sharp(crop).stats();
      assert.ok(
        Math.abs(stats.channels[0].mean - 230) < 4,
        JSON.stringify({
          layout,
          fontPair,
          portrait,
          screen,
          mean: stats.channels.map((c) => c.mean),
        }),
      );
      assert.ok(Math.abs(stats.channels[1].mean - 189) < 4);
      for (const box of collageBoxes(layout))
        assert.ok(box.x + box.width <= 1080 && box.y + box.height <= 1240);
      if (fontPair === layout)
        await writeFile(
          `/tmp/studio-design-v3-${layout}-${portrait ? "portrait" : "feed"}.jpg`,
          result,
        );
    }
console.log(
  "PASS: 200 fresh designs and cross-book rotation; no recent font, palette or trope-layout repeats; all 12 ink/paper pairs exceed 7:1; 72 actual font/layout/format renders preserve the original cover, obey reviewed typography and fit their label bounds. No paid image requests.",
);
