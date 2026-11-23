import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { join } from "node:path";
import type { StudioBook, CreativeRecipe } from "./social-creative-directions";
import { posterDesign, colourContrast } from "./social-poster-design";
const escape = (s: string) =>
  s.replace(
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
export function collageDevice(portrait: boolean, layout: number) {
  const central = layout === 1 || layout === 4,
    width = central ? 420 : 480;
  const x = central
    ? (1080 - width) / 2
    : layout === 2 || layout === 5
      ? 56
      : 544;
  const y =
      (layout === 4 ? 300 : layout === 1 ? 390 : 345) + (portrait ? 150 : 0),
    frame = 22;
  const screenWidth = width - frame * 2,
    screenHeight = Math.round(screenWidth * 1.5);
  return {
    x,
    y,
    width,
    height: screenHeight + frame * 2 + 36,
    screenX: x + frame,
    screenY: y + frame,
    screenWidth,
    screenHeight,
  };
}
export type DesignBox = { x: number; y: number; width: number; height: number };
export function collageBoxes(layout: number) {
  if (layout === 1)
    return [
      { x: 38, y: 390, width: 270, height: 180 },
      { x: 772, y: 390, width: 270, height: 180 },
      { x: 38, y: 800, width: 270, height: 180 },
      { x: 772, y: 800, width: 270, height: 180 },
    ];
  if (layout === 4)
    return [
      { x: 50, y: 975, width: 470, height: 120 },
      { x: 560, y: 975, width: 470, height: 120 },
      { x: 50, y: 1105, width: 470, height: 120 },
      { x: 560, y: 1105, width: 470, height: 120 },
    ];
  const left = layout === 2 || layout === 5 ? 582 : 56;
  return [0, 1, 2, 3].map((i) => ({
    x: left + (layout === 3 ? (i % 2 ? 12 : -6) : 0),
    y: 365 + i * 180,
    width: 434,
    height: 142,
  }));
}
function writingSurface(w: number, h: number, fill: string, motif: string) {
  if (motif === "torn")
    return `<path d="M 10 4 L ${w - 15} 7 L ${w - 4} 18 L ${w - 13} 30 L ${w - 5} 46 L ${w - 13} 65 L ${w - 5} 85 L ${w - 12} ${h - 16} L ${w - 23} ${h - 5} L 12 ${h - 9} L 4 ${h - 25} L 11 ${h - 42} L 3 ${h - 62} L 10 ${h - 78} L 2 24 Z" fill="${fill}"/>`;
  if (motif === "marker")
    return `<path d="M 12 13 L ${w - 25} 4 L ${w - 7} 15 L ${w - 18} 30 L ${w - 3} ${h - 24} L ${w - 18} ${h - 8} L 22 ${h - 3} L 7 ${h - 16} L 17 ${h - 32} L 4 35 Z" fill="${fill}"/>`;
  if (motif === "ribbons")
    return `<path d="M 0 5 L ${w} 5 L ${w - 22} ${h / 2} L ${w} ${h - 5} L 0 ${h - 5} L 22 ${h / 2} Z" fill="${fill}"/>`;
  return `<path d="M 7 6 L ${w - 10} 3 L ${w - 4} ${h - 10} L 13 ${h - 4} Z" fill="${fill}"/>`;
}
async function lettering(
  value: string,
  w: number,
  h: number,
  font: string,
  file: string,
  size: number,
  minimum: number,
  ink: string,
) {
  for (let current = size; current >= minimum; current -= 2) {
    const input = await sharp({
      text: {
        text: `<span foreground="${ink}">${escape(value)}</span>`,
        font: `${font} ${current}`,
        fontfile: join(process.cwd(), "assets/social-fonts", file),
        width: w,
        align: "centre",
        rgba: true,
        spacing: 4,
      },
    })
      .png()
      .toBuffer();
    const meta = await sharp(input).metadata();
    if (meta.height! <= h)
      return { input, width: meta.width!, height: meta.height!, size: current };
  }
  throw Error(
    "This wording is too long to remain readable. Shorten the hook or trope before generating a poster.",
  );
}
async function label(
  value: string,
  box: DesignBox,
  motif: string,
  fill: string,
  ink: string,
  font: string,
  file: string,
  headline = false,
) {
  if (colourContrast(fill, ink) < 7)
    throw Error("The selected ink and paper do not have enough contrast.");
  const padding = headline ? 24 : 24;
  const text = await lettering(
    value,
    box.width - padding * 2,
    box.height - padding * 2,
    font,
    file,
    headline ? 94 : 54,
    headline ? 64 : 40,
    ink,
  );
  if (motif === "outline") {
    const x = Math.round((box.width - text.width) / 2),
      y = Math.round((box.height - text.height) / 2);
    const svg = `<svg width="${box.width}" height="${box.height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><filter id="halo" x="-10%" y="-20%" width="120%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="5" result="edge"/><feFlood flood-color="${fill}" result="paper"/><feComposite in="paper" in2="edge" operator="in" result="keyline"/><feMerge><feMergeNode in="keyline"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><image x="${x}" y="${y}" width="${text.width}" height="${text.height}" xlink:href="data:image/png;base64,${text.input.toString("base64")}" filter="url(#halo)"/></svg>`;
    return {
      input: await sharp(Buffer.from(svg)).png().toBuffer(),
      left: box.x,
      top: box.y,
    };
  }
  const shape = `<svg width="${box.width}" height="${box.height}" xmlns="http://www.w3.org/2000/svg">${writingSurface(box.width, box.height, fill, motif)}</svg>`;
  const bytes = await sharp(Buffer.from(shape))
    .composite([
      {
        input: text.input,
        left: Math.round((box.width - text.width) / 2),
        top: Math.round((box.height - text.height) / 2),
      },
    ])
    .png()
    .toBuffer();
  return { input: bytes, left: box.x, top: box.y };
}
/** Measure every string before any paid background request. */
export async function assertCollageTypography(
  book: StudioBook,
  recipe: CreativeRecipe,
  hook: string,
) {
  const { palette: p, fonts } = posterDesign(recipe),
    boxes = collageBoxes(recipe.layout);
  await lettering(hook, 932, 192, fonts.hook, fonts.hookFile, 94, 64, p.ink);
  for (const [i, trope] of book.tropes.slice(0, 4).entries())
    await lettering(
      trope,
      boxes[i].width - 48,
      boxes[i].height - 48,
      fonts.trope,
      fonts.tropeFile,
      54,
      40,
      p.ink,
    );
  await lettering(
    book.kindleUnlimited ? "Read on Kindle Unlimited" : "Read on Kindle",
    702,
    42,
    fonts.trope,
    fonts.tropeFile,
    54,
    40,
    p.ink,
  );
}
export async function composeCollagePoster(
  background: Buffer,
  cover: Buffer,
  book: StudioBook,
  recipe: CreativeRecipe,
  hook: string,
  portrait: boolean,
) {
  const { palette: p, fonts, layout } = posterDesign(recipe),
    h = portrait ? 1920 : 1350,
    dy = portrait ? 150 : 0;
  const ink = colourContrast(p.light, p.accent) >= 7 ? p.accent : p.ink;
  const device = collageDevice(portrait, recipe.layout),
    boxes = collageBoxes(recipe.layout);
  const screen = await sharp(cover)
    .resize(device.screenWidth, device.screenHeight, {
      fit: "contain",
      background: "#111",
    })
    .png()
    .toBuffer();
  const shell = `<svg width="1080" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="${device.x - 9}" y="${device.y + 7}" width="${device.width + 18}" height="${device.height + 10}" rx="29" fill="#08080c" opacity=".22"/><rect x="${device.x}" y="${device.y}" width="${device.width}" height="${device.height}" rx="25" fill="#18181a" stroke="#666" stroke-width="3"/><text x="${device.x + device.width / 2}" y="${device.y + device.height - 15}" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#bbb">kindle</text>${recipe.layout === 1 ? `<g fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"><path d="M 286 ${620 + dy} Q 330 ${650 + dy} 325 ${705 + dy} l -15 -14 m 15 14 l 8 -20"/><path d="M 790 ${620 + dy} Q 748 ${650 + dy} 754 ${705 + dy} l -10 -19 m 10 19 l 18 -13"/></g>` : ""}</svg>`;
  const layers: OverlayOptions[] = [
    { input: Buffer.from(shell) },
    { input: screen, left: device.screenX, top: device.screenY },
  ];
  layers.push(
    await label(
      hook,
      { x: 50, y: 42 + dy, width: 980, height: 240 },
      [1, 4].includes(recipe.layout) ? "outline" : layout.motif,
      p.light,
      ink,
      fonts.hook,
      fonts.hookFile,
      true,
    ),
  );
  for (const [i, trope] of book.tropes.slice(0, 4).entries()) {
    const box = { ...boxes[i], y: boxes[i].y + dy };
    // Alternate solid ink/paper surfaces in collage layouts, with contrast checked both ways.
    const inverse = (recipe.layout === 3 || recipe.layout === 5) && i % 2 === 1;
    const item = await label(
      trope,
      box,
      recipe.layout === 1 ? "outline" : layout.motif,
      inverse ? p.ink : p.light,
      inverse ? p.light : ink,
      fonts.trope,
      fonts.tropeFile,
    );
    if (recipe.layout === 3) {
      const angle = i % 2 ? 2 : -2,
        rotated = await sharp(item.input)
          .rotate(angle, { background: "#0000" })
          .png()
          .toBuffer();
      const meta = await sharp(rotated).metadata();
      item.input = rotated;
      item.left -= Math.round((meta.width! - box.width) / 2);
      item.top -= Math.round((meta.height! - box.height) / 2);
    }
    layers.push(item);
  }
  layers.push(
    await label(
      book.kindleUnlimited ? "Read on Kindle Unlimited" : "Read on Kindle",
      { x: 165, y: 1240 + dy, width: 750, height: 90 },
      [1, 4].includes(recipe.layout) ? "outline" : "ribbons",
      p.light,
      p.ink,
      fonts.trope,
      fonts.tropeFile,
    ),
  );
  return sharp(background)
    .resize(1080, h, { fit: "cover" })
    .composite(layers)
    .jpeg({ quality: 94 })
    .toBuffer();
}
