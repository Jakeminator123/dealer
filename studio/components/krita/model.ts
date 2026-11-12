// The pen's shapes: pen strokes, arrows, frames and text, kept as a list in the picture's own pixels and drawn again on
// every change, so the picture itself is never touched and undo is one step back in a list of lists. Pure: no DOM;
// tests in studio/tests/krita-model.test.ts.

export type Point = { x: number; y: number };
export type Tool = "pen" | "arrow" | "rect" | "text";
export type Colour = "red" | "brass" | "white" | "green";
export type Weight = "tunn" | "tjock";

/** The four colours, from the studio's tokens (globals.css): underkänd red, brass, ink white, godkänd green. */
export const COLOURS: Record<Colour, { hex: string; label: string }> = {
  red: { hex: "#e06c6c", label: "Röd" },
  brass: { hex: "#d9b96a", label: "Mässing" },
  white: { hex: "#f2f5f3", label: "Vit" },
  green: { hex: "#4fb27f", label: "Grön" },
};
export const COLOUR_ORDER: readonly Colour[] = ["red", "brass", "white", "green"];

type Common = { colour: Colour; weight: Weight };
export type Shape =
  | (Common & { kind: "pen"; points: Point[] })
  | (Common & { kind: "arrow"; from: Point; to: Point })
  | (Common & { kind: "rect"; from: Point; to: Point })
  | (Common & { kind: "text"; at: Point; text: string });

// ── History ─────────────────────────────────────────────────────────────────
export type History = { past: Shape[][]; present: Shape[]; future: Shape[][] };
export const emptyHistory = (present: Shape[] = []): History => ({ past: [], present, future: [] });

const commit = (h: History, present: Shape[]): History => ({ past: [...h.past, h.present], present, future: [] });
export const addShape = (h: History, shape: Shape): History => commit(h, [...h.present, shape]);
export const clearShapes = (h: History): History => (h.present.length ? commit(h, []) : h);
export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

// ── Sizes in the picture's pixels ───────────────────────────────────────────
const longSide = (w: number, h: number) => Math.max(1, w, h);
/** A stroke's width: thin and thick, as a share of the picture's long side so a mark looks the same on any picture. */
export const strokeWidth = (weight: Weight, w: number, h: number) =>
  Math.max(weight === "tunn" ? 2 : 4, Math.round(longSide(w, h) * (weight === "tunn" ? 0.0032 : 0.0072) * 10) / 10);
/** Text height in the picture's pixels. */
export const textSize = (weight: Weight, w: number, h: number) => Math.max(12, Math.round(longSide(w, h) * (weight === "tunn" ? 0.024 : 0.034)));

// ── Geometry ────────────────────────────────────────────────────────────────
/** A point on screen in the picture's pixels, kept inside the picture. */
export function toPicture(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, w: number, h: number): Point {
  const x = ((clientX - rect.left) / Math.max(1, rect.width)) * w;
  const y = ((clientY - rect.top) / Math.max(1, rect.height)) * h;
  return { x: Math.min(w, Math.max(0, x)), y: Math.min(h, Math.max(0, y)) };
}

/** Adds a point to a stroke unless it lies too close to the last one (a still hand makes no extra points). */
export function extendStroke(points: readonly Point[], p: Point, minStep = 1.5): Point[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < minStep) return points as Point[];
  return [...points, p];
}

/** Whether a finished shape is worth keeping: a click without a drag makes no arrow, no frame and no stroke. */
export function isMark(shape: Shape, min = 4): boolean {
  if (shape.kind === "text") return shape.text.trim().length > 0;
  if (shape.kind === "pen") return shape.points.length > 1 && shape.points.some((p) => Math.hypot(p.x - shape.points[0].x, p.y - shape.points[0].y) >= min / 2);
  return Math.abs(shape.to.x - shape.from.x) >= min || Math.abs(shape.to.y - shape.from.y) >= min;
}

/** An arrow's head at its tip: the tip and two corners, sized by the stroke. */
export function arrowHead(from: Point, to: Point, width: number): { tip: Point; left: Point; right: Point; base: Point } {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.min(Math.max(width * 4.2, 12), Math.hypot(to.x - from.x, to.y - from.y) * 0.6 || width * 4.2);
  const spread = (27 * Math.PI) / 180;
  const corner = (side: number): Point => ({ x: to.x - length * Math.cos(angle + side * spread), y: to.y - length * Math.sin(angle + side * spread) });
  const back = length * Math.cos(spread) * 0.82;
  return { tip: to, left: corner(-1), right: corner(1), base: { x: to.x - back * Math.cos(angle), y: to.y - back * Math.sin(angle) } };
}

/** A frame from two corners, whatever way it was dragged. */
export const normalRect = (a: Point, b: Point) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

/** A size that fits inside a box, keeping the aspect; never larger than the picture unless up is allowed. */
export function fitInside(w: number, h: number, boxW: number, boxH: number, up = false): { w: number; h: number; scale: number } {
  const scale = Math.min(boxW / Math.max(1, w), boxH / Math.max(1, h), up ? Infinity : 1);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale };
}

/** The exported picture's size: at most `max` pixels on its long side. */
export function exportSize(w: number, h: number, max = 1600): { w: number; h: number; scale: number } {
  return fitInside(w, h, max, max);
}

/** Bytes a data URL carries. */
export const dataUrlBytes = (url: string) => Math.floor(((url.length - url.indexOf(",") - 1) * 3) / 4);
