import sharp from "sharp";
import { join } from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StudioBook } from "./social-creative-directions";
import { SCENE_STYLES } from "./social-scene-design";
import { sceneSeconds } from "./social-scene-slides";
const run = promisify(execFile);
const xml = (s: string) =>
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
export async function sceneText(text: string, maxHeight = 510, size = 68, design = 0, ink?:string) {
  const style=SCENE_STYLES[design]??SCENE_STYLES[0];
  for (let s = size; s >= 52; s -= 2) {
    const bytes = await sharp({
      text: {
        text: `<span foreground="${ink??style.ink}">${xml(text)}</span>`,
        font: `${style.font} ${s}`,
        fontfile: join(process.cwd(), "assets/social-fonts", style.file),
        width: 850,
        align: style.align === "centre" ? "centre" : "left",
        rgba: true,
        spacing: 12,
      },
    })
      .png()
      .toBuffer();
    const m = await sharp(bytes).metadata();
    if (m.height! <= maxHeight) return { bytes, height: m.height! };
  }
  throw Error(
    "This scene has too much text to read on a phone. Shorten the slide before generating images.",
  );
}
export async function composeSceneFrame(image: Buffer, text: string, design = 0) {
  const style=SCENE_STYLES[design]??SCENE_STYLES[0];
  const lettering = await sceneText(text,510,68,design);
  const y = 1510 - lettering.height;
  // Solid contrast field with a softened top edge, inside each platform's UI-safe area.
  const shade = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect x="40" y="${y - 30}" width="950" height="${lettering.height + 65}" rx="12" fill="${style.panel}"/><rect x="75" y="${y - 47}" width="95" height="5" fill="${style.accent}"/></svg>`;
  return sharp(image)
    .resize(1080, 1920, { fit: "cover" })
    .composite([
      { input: Buffer.from(shade) },
      { input: lettering.bytes, left: 75, top: y },
    ])
    .jpeg({ quality: 94 })
    .toBuffer();
}
export async function composeSceneCover(cover: Buffer, book: StudioBook, design = 0) {
  const style=SCENE_STYLES[design]??SCENE_STYLES[0];
  const screen = await sharp(cover)
    .resize(516, 774, { fit: "contain", background: "#171719" })
    .png()
    .toBuffer();
  const title = await sceneText(book.title, 200, 80, design, "#fff8ef"),
    cta = await sceneText(
      book.kindleUnlimited ? "Read on Kindle Unlimited" : "Read on Kindle",
      110,
      62, design, "#fff8ef",
    );
  const backdrop = Buffer.from(
    `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g"><stop stop-color="${style.backdrop}"/><stop offset="1" stop-color="#100f17"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><rect x="260" y="450" width="560" height="860" rx="30" fill="#222226" stroke="#777" stroke-width="3"/><text x="540" y="1282" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#ccc">kindle</text></svg>`,
  );
  return sharp(backdrop)
    .composite([
      { input: title.bytes, left: 75, top: 200 },
      { input: screen, left: 282, top: 472 },
      { input: cta.bytes, left: 75, top: 1420 },
    ])
    .jpeg({ quality: 94 })
    .toBuffer();
}
export async function renderSceneVideo(
  frames: Buffer[],
  texts: string[],
  audio?: Buffer,
) {
  if (frames.length !== 3 || texts.length !== 2)
    throw Error(
      "A scene video needs exactly two story slides and a cover slide.",
    );
  const seconds = [sceneSeconds(texts[0]), sceneSeconds(texts[1]), 4],
    dir = await mkdtemp(join(tmpdir(), "studio-scenes-"));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const file = join(dir, `slide-${i}.jpg`);
      await writeFile(file, frames[i]);
      inputs.push("-loop", "1", "-t", String(seconds[i]), "-i", file);
    }
    if (audio) {
      const file = join(dir, "audio.m4a");
      await writeFile(file, audio);
      inputs.push("-stream_loop", "-1", "-i", file);
    }
    const filters =
      seconds
        .map(
          (d, i) =>
            `[${i}:v]fps=30,setsar=1,format=yuv420p,fade=t=in:d=0.15,fade=t=out:st=${d - 0.15}:d=0.15[v${i}]`,
        )
        .join(";") + ";[v0][v1][v2]concat=n=3:v=1:a=0[v]";
    const output = join(dir, "scene-slides.mp4"),
      total = seconds.reduce((a, b) => a + b, 0);
    await run(
      join(process.cwd(), "node_modules/@ffmpeg-installer/linux-x64/ffmpeg"),
      [
        "-y",
        ...inputs,
        "-filter_complex",
        filters,
        "-map",
        "[v]",
        ...(audio
          ? [
              "-map",
              "3:a:0",
              "-af",
              `afade=t=in:d=0.3,afade=t=out:st=${total - 0.6}:d=0.6`,
              "-c:a",
              "aac",
              "-b:a",
              "128k",
            ]
          : ["-an"]),
        "-t",
        String(total),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-threads",
        "2",
        output,
      ],
      { timeout: 180000, maxBuffer: 1024 * 1024 },
    );
    return { bytes: await readFile(output), seconds, total };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
