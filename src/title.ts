// Lays out the opening title on a transparent, output-sized canvas. FFmpeg
// overlays the PNG, so what is drawn here is exactly what gets exported.
import type { Title, TitleWeight } from "./api";

const WIDTH = 1080;
const HEIGHT = 1920;
/** Text never runs wider than this share of the frame. */
const MAX_TEXT_WIDTH = WIDTH * 0.86;
const SUBTITLE_SCALE = 0.62;

/** CSS font weights for [title, subtitle]; "regular" is the original look. */
const WEIGHTS: Record<TitleWeight, [number, number]> = {
  light: [300, 300],
  regular: [600, 500],
  bold: [800, 700],
};

// Fonts without Chinese glyphs fall back to PingFang for those characters.
const fontSpec = (weight: number, size: number, family: string) =>
  `${weight} ${size}px "${family}", "PingFang SC", -apple-system, sans-serif`;

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string) {
  let fitted = size;
  do {
    ctx.font = fontSpec(weight, fitted, family);
    fitted -= 2;
  } while (ctx.measureText(text).width > MAX_TEXT_WIDTH && fitted > 12);
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

function drawLine(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, title: Title) {
  const halo = isDark(title.color) ? "255, 255, 255" : "0, 0, 0";
  ctx.fillStyle = title.color;
  if (title.textStyle === "outline") {
    // Half the stroke hides under the fill, so the visible outline is
    // about 5% of the font size.
    ctx.lineWidth = Math.max(4, size * 0.1);
    ctx.strokeStyle = `rgba(${halo}, 0.8)`;
    ctx.lineJoin = "round";
    ctx.strokeText(text, WIDTH / 2, y);
  } else if (title.textStyle === "shadow") {
    ctx.shadowColor = `rgba(${halo}, 0.55)`;
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.03;
  }
  ctx.fillText(text, WIDTH / 2, y);
  ctx.shadowColor = "transparent";
}

export async function renderTitlePng(title: Title): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const [titleWeight, subtitleWeight] = WEIGHTS[title.weight];
  const lines: { text: string; weight: number; size: number }[] = [];
  if (title.text.trim())
    lines.push({ text: fixApostrophes(title.text.trim()), weight: titleWeight, size: title.fontSize });
  if (title.subtitle.trim())
    lines.push({
      text: fixApostrophes(title.subtitle.trim()),
      weight: subtitleWeight,
      size: Math.round(title.fontSize * SUBTITLE_SCALE),
    });

  for (const line of lines) line.size = fitFont(ctx, line.text, line.weight, line.size, title.font);
  const gap = title.lineGap;
  const blockHeight = lines.reduce((sum, line) => sum + line.size, 0) + gap * (lines.length - 1);
  const centre = title.position === "top" ? HEIGHT * 0.2 : title.position === "bottom" ? HEIGHT * 0.8 : HEIGHT / 2;

  let y = centre - blockHeight / 2;
  for (const line of lines) {
    ctx.font = fontSpec(line.weight, line.size, title.font);
    drawLine(ctx, line.text, y + line.size / 2, line.size, title);
    y += line.size + gap;
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode title"))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
