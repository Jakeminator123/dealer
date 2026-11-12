// Drawing the pen's shapes on a 2D canvas, in the picture's pixels (the caller sets the transform), and exporting the
// picture with its marks as one PNG of at most 1600 px on the long side and about 1,5 MB. Every mark has a thin dark
// edge so it reads on a light and a dark picture alike.
import { PICTURE_LIMIT } from "../../lib/bot-client.ts";
import { COLOURS, arrowHead, dataUrlBytes, exportSize, normalRect, strokeWidth, textSize, type Shape } from "./model.ts";

const FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif';
const EDGE = "rgba(5, 8, 7, 0.55)";

function penPath(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]) {
  ctx.beginPath();
  if (points.length === 1) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[0].x + 0.01, points[0].y);
    return;
  }
  ctx.moveTo(points[0].x, points[0].y);
  // Through the middle of each pair: a smooth line without a library.
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** One shape, in the picture's pixels; w and h are the picture's size (strokes and text scale with it). */
export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, w: number, h: number) {
  const colour = COLOURS[shape.colour].hex;
  const width = strokeWidth(shape.weight, w, h);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (shape.kind === "text") {
    const size = textSize(shape.weight, w, h);
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.textBaseline = "middle";
    const lines = shape.text.split("\n");
    lines.forEach((line, i) => {
      const y = shape.at.y + i * size * 1.25;
      ctx.lineWidth = Math.max(2, size * 0.2);
      ctx.strokeStyle = EDGE;
      ctx.strokeText(line, shape.at.x, y);
      ctx.fillStyle = colour;
      ctx.fillText(line, shape.at.x, y);
    });
    ctx.restore();
    return;
  }
  const trace = () => {
    if (shape.kind === "pen") penPath(ctx, shape.points);
    else if (shape.kind === "rect") {
      const r = normalRect(shape.from, shape.to);
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(width * 1.6, r.w / 2, r.h / 2));
    } else {
      const head = arrowHead(shape.from, shape.to, width);
      ctx.beginPath();
      ctx.moveTo(shape.from.x, shape.from.y);
      ctx.lineTo(head.base.x, head.base.y);
    }
  };
  const head = shape.kind === "arrow" ? arrowHead(shape.from, shape.to, width) : null;
  const tracehead = () => {
    if (!head) return;
    ctx.beginPath();
    ctx.moveTo(head.tip.x, head.tip.y);
    ctx.lineTo(head.left.x, head.left.y);
    ctx.lineTo(head.right.x, head.right.y);
    ctx.closePath();
  };
  // The dark edge first, a little wider, then the colour on top.
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = width + Math.max(1.5, width * 0.55);
  trace();
  ctx.stroke();
  if (head) {
    tracehead();
    ctx.lineWidth = Math.max(1.5, width * 0.55);
    ctx.stroke();
  }
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  trace();
  ctx.stroke();
  if (head) {
    tracehead();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = Math.max(1, width * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawShapes(ctx: CanvasRenderingContext2D, shapes: readonly Shape[], w: number, h: number) {
  for (const shape of shapes) drawShape(ctx, shape, w, h);
}

/**
 * The picture with its marks as a PNG data URL: at most `max` px on the long side, and smaller in steps until it is under
 * the limit (a photograph-like scene in PNG can be large). Returns the URL and its size.
 */
export function exportPicture(source: CanvasImageSource, w: number, h: number, shapes: readonly Shape[], max = 1600, limit = PICTURE_LIMIT): { url: string; w: number; h: number } {
  let size = exportSize(w, h, max);
  for (let round = 0; ; round++) {
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, size.w, size.h);
    ctx.setTransform(size.w / w, 0, 0, size.h / h, 0, 0);
    drawShapes(ctx, shapes, w, h);
    const url = canvas.toDataURL("image/png");
    if (dataUrlBytes(url) <= limit || round >= 6 || size.w < 480) return { url, w: size.w, h: size.h };
    size = exportSize(w, h, Math.round(Math.max(size.w, size.h) * 0.82));
  }
}
