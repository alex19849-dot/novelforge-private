import type { CreativeRecipe } from "./social-creative-directions";
// Each palette has an intentionally opaque writing surface and contrasting ink.
// The scene remains visible around it, never underneath essential lettering.
export const DESIGN_PALETTES = [
  {
    name: "hot pink fabric and pale blush paper",
    family: "pink",
    dark: "#9f174d",
    light: "#ffe3ef",
    accent: "#b80f55",
    ink: "#401127",
  },
  {
    name: "turquoise water and butter-yellow notes",
    family: "cyan",
    dark: "#087e91",
    light: "#fff1b8",
    accent: "#007b88",
    ink: "#142b30",
  },
  {
    name: "snow white and Christmas scarlet",
    family: "red",
    dark: "#b32127",
    light: "#fffaf4",
    accent: "#b32127",
    ink: "#931b22",
  },
  {
    name: "lavender linen and deep violet ink",
    family: "purple",
    dark: "#654786",
    light: "#f1e6ff",
    accent: "#614090",
    ink: "#361e56",
  },
  {
    name: "sunshine yellow and charcoal marker",
    family: "yellow",
    dark: "#e2ac11",
    light: "#ffe268",
    accent: "#9e2717",
    ink: "#24201b",
  },
  {
    name: "mint cotton and raspberry lettering",
    family: "green",
    dark: "#067a70",
    light: "#d6f4e7",
    accent: "#af1451",
    ink: "#83123e",
  },
  {
    name: "cobalt satin and crisp white labels",
    family: "blue",
    dark: "#144da4",
    light: "#f9fcff",
    accent: "#1349a4",
    ink: "#123775",
  },
  {
    name: "apricot linen and ink-black script",
    family: "orange",
    dark: "#bc5632",
    light: "#ffe0c3",
    accent: "#8a311d",
    ink: "#33201c",
  },
  {
    name: "emerald velvet and warm ivory ribbons",
    family: "green",
    dark: "#134c39",
    light: "#fff5da",
    accent: "#9f252e",
    ink: "#12402f",
  },
  {
    name: "cherry red fabric and pale blue paper",
    family: "red",
    dark: "#a81632",
    light: "#deefff",
    accent: "#b01836",
    ink: "#142d4c",
  },
  {
    name: "rose-pink silk and chocolate ink",
    family: "pink",
    dark: "#834c5d",
    light: "#fce3e6",
    accent: "#902b53",
    ink: "#47232d",
  },
  {
    name: "midnight plum and bright golden notes",
    family: "purple",
    dark: "#352341",
    light: "#ffe18a",
    accent: "#842854",
    ink: "#352341",
  },
] as const;
export const FONT_PAIRS = [
  {
    name: "Kalam bold handwritten hook with DM Sans trope labels",
    hook: "Kalam",
    hookFile: "Kalam-Bold.ttf",
    trope: "DM Sans Bold",
    tropeFile: "DMSans.ttf",
    style: "script",
  },
  {
    name: "Bebas Neue tall display hook with Caveat handwritten notes",
    hook: "Bebas Neue",
    hookFile: "BebasNeue-Regular.ttf",
    trope: "Caveat Bold",
    tropeFile: "Caveat.ttf",
    style: "sans",
  },
  {
    name: "DM Serif Display romantic hook with Kalam marker labels",
    hook: "DM Serif Display",
    hookFile: "DMSerifDisplay-Regular.ttf",
    trope: "Kalam Bold",
    tropeFile: "Kalam-Bold.ttf",
    style: "serif",
  },
  {
    name: "Lobster Two bold italic hook with DM Sans bold notes",
    hook: "Lobster Two Bold Italic",
    hookFile: "LobsterTwo-BoldItalic.ttf",
    trope: "DM Sans Bold",
    tropeFile: "DMSans.ttf",
    style: "script",
  },
  {
    name: "DM Sans bold statement hook with Caveat handwritten tropes",
    hook: "DM Sans Bold",
    hookFile: "DMSans.ttf",
    trope: "Caveat Bold",
    tropeFile: "Caveat.ttf",
    style: "sans",
  },
  {
    name: "Caveat bold handwritten hook with Kalam bold trope notes",
    hook: "Caveat Bold",
    hookFile: "Caveat.ttf",
    trope: "Kalam Bold",
    tropeFile: "Kalam-Bold.ttf",
    style: "script",
  },
] as const;
export const DESIGN_LAYOUTS = [
  {
    name: "Torn-paper trope strips beside a right-hand Kindle",
    scene:
      "a richly coloured tactile fabric flat lay, with a story-specific detail at the edge",
    motif: "torn",
  },
  {
    name: "Hand-drawn trope arrows around a central Kindle",
    scene:
      "a pale matte paper or fabric surface with small story-specific seasonal details around the perimeter",
    motif: "arrows",
  },
  {
    name: "Bright marker swashes beside a left-hand Kindle",
    scene:
      "a vivid textured surface with a single evocative story-world detail, like a romance reading journal",
    motif: "marker",
  },
  {
    name: "Scattered colourful note slips beside a right-hand Kindle",
    scene:
      "a relaxed overhead reading flat lay with cotton or satin folds and generous colour",
    motif: "notes",
  },
  {
    name: "Romantic ribbon labels around a central Kindle",
    scene:
      "a light, airy romantic setting texture with book-specific atmosphere and soft natural light",
    motif: "ribbons",
  },
  {
    name: "Bold cut-paper collage beside a left-hand Kindle",
    scene:
      "a playful asymmetric romance mood board with tactile layered paper and a story-specific decorative edge",
    motif: "collage",
  },
] as const;
export function posterDesign(recipe: CreativeRecipe) {
  return {
    palette: DESIGN_PALETTES[recipe.palette % DESIGN_PALETTES.length],
    fonts: FONT_PAIRS[(recipe.fontPair ?? 0) % FONT_PAIRS.length],
    layout: DESIGN_LAYOUTS[recipe.layout % DESIGN_LAYOUTS.length],
  };
}
export function colourContrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = hex
      .replace("#", "")
      .match(/../g)!
      .map((n) => parseInt(n, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
