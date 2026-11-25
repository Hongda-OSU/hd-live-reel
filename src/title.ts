// Lays out the opening title, the captions over single clips and the
// watermark on transparent output-sized canvases. FFmpeg overlays the PNGs, so what is
// drawn here is exactly what gets exported.
import type { Caption, MarkStyle, Output, Title, TitlePosition, TitleWeight, Watermark } from "./api";
import { FRAME } from "./project";

/** Text never runs wider than this share of the frame. */
const MAX_TEXT_SHARE = 0.86;
const SUBTITLE_SCALE = 0.62;
/** Captions are one line, smaller than the title they take their look from. */
const CAPTION_SCALE = 0.75;

/** CSS font weights for [title, subtitle]; "regular" is the original look. */
const WEIGHTS: Record<TitleWeight, [number, number]> = {
  light: [300, 300],
  regular: [600, 500],
  bold: [800, 700],
};

// Fonts without Chinese glyphs fall back to PingFang for those characters.
const fontSpec = (weight: number, size: number, family: string) =>
  `${weight} ${size}px "${family}", "PingFang SC", -apple-system, sans-serif`;

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  family: string,
  maxWidth: number,
) {
  let fitted = size;
  do {
    ctx.font = fontSpec(weight, fitted, family);
    fitted -= 2;
  } while (ctx.measureText(text).width > maxWidth && fitted > 12);
  return fitted + 2;
}

/** "Devil's" with a typewriter quote, or with the ‘ a Chinese input method
 * types for the first quote, becomes "Devil’s". Only quotes between Latin
 * letters change, so Chinese ‘…’ pairs are left alone. */
function fixApostrophes(text: string) {
  return text.replace(/(?<=[A-Za-z0-9])['‘](?=[A-Za-z])/g, "’");
}

/** True for colours dark enough to need a light outline or shadow. */
function isDark(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

function drawLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, title: Title) {
  const halo = isDark(title.color) ? "255, 255, 255" : "0, 0, 0";
  ctx.fillStyle = title.color;
  if (title.textStyle === "outline") {
    // Half the stroke hides under the fill, so the visible outline is
    // about 5% of the font size.
    ctx.lineWidth = Math.max(4, size * 0.1);
    ctx.strokeStyle = `rgba(${halo}, 0.8)`;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
  } else if (title.textStyle === "shadow") {
    ctx.shadowColor = `rgba(${halo}, 0.55)`;
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.03;
  }
  ctx.fillText(text, x, y);
  ctx.shadowColor = "transparent";
}

interface Line {
  text: string;
  weight: number;
  size: number;
}

export function renderTitlePng(title: Title, aspect: Output["aspect"]): Promise<Uint8Array> {
  const [titleWeight, subtitleWeight] = WEIGHTS[title.weight];
  const lines: Line[] = [];
  if (title.text.trim())
    lines.push({ text: fixApostrophes(title.text.trim()), weight: titleWeight, size: title.fontSize });
  if (title.subtitle.trim())
    lines.push({
      text: fixApostrophes(title.subtitle.trim()),
      weight: subtitleWeight,
      size: Math.round(title.fontSize * SUBTITLE_SCALE),
    });
  return renderLines(lines, title, title.position, aspect);
}

/** One line in the title's font, colour and outline, at `caption.position`. */
export function renderCaptionPng(caption: Caption, title: Title, aspect: Output["aspect"]): Promise<Uint8Array> {
  const line = {
    text: fixApostrophes(caption.text.trim()),
    weight: WEIGHTS[title.weight][0],
    size: Math.round(title.fontSize * CAPTION_SCALE),
  };
  return renderLines([line], title, caption.position, aspect);
}

/** Gap between the watermark and the frame's edges, as a share of the
 * short side. */
const WATERMARK_MARGIN = 0.04;

/** How each watermark style sets the app's name: the font, how big
 * against the chosen size (scripts run small, spaced capitals wide), and
 * the spelling. Text other than the name keeps its own spelling. */
export const MARK_LOOKS: Record<
  MarkStyle,
  { label: string; family: string; weight: number; italic: boolean; spacing: number; scale: number; name: string }
> = {
  script: {
    label: "手写签名",
    family: "Snell Roundhand",
    weight: 700,
    italic: false,
    spacing: 0,
    scale: 1.45,
    name: "HD Live Reel",
  },
  spaced: {
    label: "宽字距大写",
    family: "Avenir Next",
    weight: 600,
    italic: false,
    spacing: 0.32,
    scale: 0.72,
    name: "HD LIVE REEL",
  },
  italic: {
    label: "杂志斜体",
    family: "Didot",
    weight: 400,
    italic: true,
    spacing: 0,
    scale: 1.2,
    name: "HD Live Reel",
  },
  credits: {
    label: "片尾字幕",
    family: "Didot",
    weight: 400,
    italic: false,
    spacing: 0.24,
    scale: 0.82,
    name: "HD LIVE REEL",
  },
  plain: {
    label: "苹方",
    family: "PingFang SC",
    weight: 600,
    italic: false,
    spacing: 0,
    scale: 1,
    name: "hd-live-reel",
  },
};

/** The watermark's text as `style` writes it. */
export function markText(text: string, style: MarkStyle): string {
  const trimmed = fixApostrophes(text.trim());
  const look = MARK_LOOKS[style];
  if (trimmed === MARK_NAME) return look.name;
  return look.spacing > 0 ? trimmed.toUpperCase() : trimmed;
}

/** The text the watermark switch turns on; matches the Rust default. */
export const MARK_NAME = "hd-live-reel";

/** White text with a soft shadow, so it reads on bright and dark frames
 * alike; the opacity is applied when the video is composed. */
export function renderWatermarkPng(watermark: Watermark, aspect: Output["aspect"]): Promise<Uint8Array> {
  const [width, height] = FRAME[aspect];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const look = MARK_LOOKS[watermark.style];
  const text = markText(watermark.text, watermark.style);
  const spec = (size: number) =>
    `${look.italic ? "italic " : ""}${look.weight} ${size}px "${look.family}", "PingFang SC", -apple-system, sans-serif`;
  // Shrunk until it fits in 60% of the width, like the other text.
  let size = watermark.size * look.scale;
  for (;;) {
    ctx.font = spec(size);
    ctx.letterSpacing = `${size * look.spacing}px`;
    if (ctx.measureText(text).width <= width * 0.6 || size <= 12) break;
    size -= 2;
  }
  const margin = Math.min(width, height) * WATERMARK_MARGIN;
  const left = watermark.position.endsWith("Left");
  const top = watermark.position.startsWith("top");
  ctx.textAlign = left ? "left" : "right";
  ctx.textBaseline = top ? "top" : "bottom";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = size * 0.25;
  ctx.shadowOffsetY = size * 0.06;
  ctx.fillStyle = "#ffffff";
  // Letter spacing trails the last letter too; keep the margin to the ink.
  const trail = left ? 0 : size * look.spacing;
  ctx.fillText(text, left ? margin : width - margin + trail, top ? margin : height - margin);
  return encode(canvas);
}

/** Draws `lines` centred around `position` and encodes them as a PNG. */
async function renderLines(
  lines: Line[],
  style: Title,
  position: TitlePosition,
  aspect: Output["aspect"],
): Promise<Uint8Array> {
  const [width, height] = FRAME[aspect];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // Centred by hand: WebKit's textAlign "center" misplaces lines with an
  // emoji variation selector ("🏀 ☁️" landed 89 px right), though
  // measureText gets their width right.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (const line of lines)
    line.size = fitFont(ctx, line.text, line.weight, line.size, style.font, width * MAX_TEXT_SHARE);
  const gap = style.lineGap;
  const blockHeight = lines.reduce((sum, line) => sum + line.size, 0) + gap * (lines.length - 1);
  const centre = position === "top" ? height * 0.2 : position === "bottom" ? height * 0.8 : height / 2;

  let y = centre - blockHeight / 2;
  for (const line of lines) {
    ctx.font = fontSpec(line.weight, line.size, style.font);
    const left = (width - ctx.measureText(line.text).width) / 2;
    drawLine(ctx, line.text, left, y + line.size / 2, line.size, style);
    y += line.size + gap;
  }
  return encode(canvas);
}

async function encode(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode text"))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
