import sharp from "sharp";
import { join } from "node:path";
import { PALETTES } from "./social-creative-directions";
import type { StudioBook, CreativeRecipe } from "./social-creative-directions";
const xml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function wrapPosterText(value: string, max: number) {
  const lines: string[] = [];
  for (const word of value.split(/\s+/)) {
    if (!lines.length || lines.at(-1)!.length + word.length + 1 > max)
      lines.push(word);
    else lines[lines.length - 1] += " " + word;
  }
  return lines;
}
export function kindleScreen(portrait: boolean, layout: number) {
  const width = layout === 2 ? (portrait ? 490 : 402) : portrait ? 440 : 385;
  const x =
    layout === 0
      ? 100
      : layout === 1 || layout === 3
        ? 1080 - width - 100
        : (1080 - width) / 2;
  const y = portrait ? (layout === 3 ? 670 : 560) : layout === 3 ? 440 : 370;
  const frame = Math.round(width * 0.055);
  const screenWidth = width - frame * 2,
    screenHeight = Math.round(screenWidth * 1.5);
  return {
    x,
    y,
    width,
    height: screenHeight + frame * 2 + 44,
    screenX: x + frame,
    screenY: y + frame,
    screenWidth,
    screenHeight,
  };
}
type Lettering = {
  value: string;
  x: number;
  y: number;
  width: number;
  size: number;
  colour: string;
  centre?: boolean;
  serif?: boolean;
};
async function textLayer(t: Lettering) {
  const family = t.serif ? "DM Serif Display" : "DM Sans";
  const input = await sharp({
    text: {
      text: `<span foreground="${t.colour}">${xml(t.value)}</span>`,
      font: `${family} ${t.size}`,
      fontfile: join(
        process.cwd(),
        "assets",
        "social-fonts",
        t.serif ? "DMSerifDisplay-Regular.ttf" : "DMSans.ttf",
      ),
      width: t.width,
      align: t.centre ? "centre" : "left",
      rgba: true,
      spacing: 8,
    },
  })
    .png()
    .toBuffer();
  const metadata = await sharp(input).metadata();
  return {
    input,
    left: Math.round(t.centre ? t.x - (metadata.width ?? t.width) / 2 : t.x),
    top: Math.round(t.y),
  };
}
export async function composeKindlePoster(
  background: Buffer,
  cover: Buffer,
  book: StudioBook,
  recipe: CreativeRecipe,
  hook: string,
  portrait: boolean,
) {
  const width = 1080,
    height = portrait ? 1920 : 1350,
    p = PALETTES[recipe.palette],
    device = kindleScreen(portrait, recipe.layout);
  // Only code creates the device. Original cover bytes are fitted intact into its
  // screen after scene generation, never sent to an image model for redrawing.
  const screen = await sharp(cover, { limitInputPixels: 20_000_000 })
    .resize(device.screenWidth, device.screenHeight, {
      fit: "contain",
      background: "#111111",
    })
    .png()
    .toBuffer();
  const hookSize = hook.length > 75 ? 60 : portrait ? 76 : 68;
  const hookLines = wrapPosterText(
    hook,
    Math.floor(900 / (hookSize * 0.56)),
  ).length;
  if (hookLines > 3)
    throw Error("Shorten the opening hook to fit three readable lines.");
  const type: Lettering[] = [
    {
      value: hook,
      x: 540,
      y: portrait ? 140 : 70,
      width: 900,
      size: hookSize,
      colour: p.light,
      centre: true,
      serif: recipe.fontStyle
        ? recipe.fontStyle === "serif"
        : recipe.palette % 2 === 0,
    },
    {
      value: book.title,
      x: 540,
      y: (portrait ? 140 : 70) + hookLines * hookSize * 1.2 + 25,
      width: 880,
      size: 34,
      colour: p.accent,
      centre: true,
    },
  ];
  const side = recipe.layout !== 2,
    tx = recipe.layout === 0 ? 600 : 100,
    tw = 380;
  let ty = side ? device.y + 70 : device.y + device.height + 35;
  if (side) {
    for (const trope of book.tropes.slice(0, 4)) {
      const size = 32,
        lines = wrapPosterText(trope, Math.floor(tw / (size * 0.56))).length;
      type.push({
        value: trope,
        x: tx,
        y: ty,
        width: tw,
        size,
        colour: p.light,
      });
      ty += lines * size * 1.25 + 25;
    }
  } else {
    type.push({
      value: book.tropes.slice(0, 4).join("  •  "),
      x: 540,
      y: ty,
      width: 900,
      size: 28,
      colour: p.light,
      centre: true,
    });
  }
  type.push(
    {
      value: "MARLOW QUINN",
      x: 540,
      y: portrait ? 1570 : 1130,
      width: 900,
      size: 27,
      colour: p.accent,
      centre: true,
    },
    {
      value: book.kindleUnlimited
        ? "Available on Kindle Unlimited"
        : "Available on Kindle",
      x: 540,
      y: portrait ? 1630 : 1190,
      width: 900,
      size: 35,
      colour: p.light,
      centre: true,
    },
  );
  const shell = `<svg width="1080" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.dark}" stop-opacity=".9"/><stop offset=".5" stop-color="${p.dark}" stop-opacity=".12"/><stop offset="1" stop-color="${p.dark}" stop-opacity=".94"/></linearGradient></defs><rect width="1080" height="${height}" fill="url(#shade)"/><rect x="${device.x - 8}" y="${device.y - 8}" width="${device.width + 16}" height="${device.height + 16}" rx="30" fill="#08090b" opacity=".4"/><rect x="${device.x}" y="${device.y}" width="${device.width}" height="${device.height}" rx="24" fill="#222427" stroke="#5c5c5c" stroke-width="2"/><text x="${device.x + device.width / 2}" y="${device.y + device.height - 18}" text-anchor="middle" font-family="sans-serif" font-size="19" fill="#aaa">kindle</text></svg>`;
  const lettering = await Promise.all(type.map(textLayer));
  return sharp(background)
    .resize(width, height, { fit: "cover" })
    .composite([
      { input: Buffer.from(shell) },
      { input: screen, left: device.screenX, top: device.screenY },
      ...lettering,
    ])
    .jpeg({ quality: 94 })
    .toBuffer();
}

/** Compare scene structure before adding the shared cover or typography. */
export async function sceneFingerprint(source: Buffer) {
  const pixels = await sharp(source)
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits += pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? "1" : "0";
  return bits
    .match(/.{4}/g)!
    .map((value) => parseInt(value, 2).toString(16))
    .join("");
}
export function sceneIsTooSimilar(a: string, b: string) {
  if (!/^[a-f0-9]{16}$/i.test(a) || !/^[a-f0-9]{16}$/i.test(b)) return false;
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let value = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (value) {
      bits += value & 1;
      value >>= 1;
    }
  }
  return bits <= 5;
}
