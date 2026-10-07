// Lays out the opening title on a transparent, output-sized canvas. FFmpeg
// overlays the PNG, so what is drawn here is exactly what gets exported.
import type { Title } from "./api";

const WIDTH = 1080;
const HEIGHT = 1920;
/** Text never runs wider than this share of the frame. */
const MAX_TEXT_WIDTH = WIDTH * 0.86;
const SUBTITLE_SCALE = 0.62;

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string) {
  let fitted = size;
  do {
    ctx.font = `${weight} ${fitted}px "${family}", -apple-system, sans-serif`;
    fitted -= 2;
  } while (ctx.measureText(text).width > MAX_TEXT_WIDTH && fitted > 12);
  return fitted + 2;
}

function drawLine(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, color: string) {
  // Thin dark outline keeps white text readable on bright skies.
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineJoin = "round";
  ctx.strokeText(text, WIDTH / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(text, WIDTH / 2, y);
}

export async function renderTitlePng(title: Title): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines: { text: string; weight: number; size: number }[] = [];
  if (title.text.trim()) lines.push({ text: title.text.trim(), weight: 600, size: title.fontSize });
  if (title.subtitle.trim())
    lines.push({ text: title.subtitle.trim(), weight: 500, size: Math.round(title.fontSize * SUBTITLE_SCALE) });

  for (const line of lines) line.size = fitFont(ctx, line.text, line.weight, line.size, title.font);
  const gap = title.fontSize * 0.25;
  const blockHeight = lines.reduce((sum, line) => sum + line.size, 0) + gap * (lines.length - 1);
  const centre = title.position === "top" ? HEIGHT * 0.2 : title.position === "bottom" ? HEIGHT * 0.8 : HEIGHT / 2;

  let y = centre - blockHeight / 2;
  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px "${title.font}", -apple-system, sans-serif`;
    drawLine(ctx, line.text, y + line.size / 2, line.size, title.color);
    y += line.size + gap;
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode title"))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
