// The experiment steps the map can draw (Jakob 2026-11-12: "do we have no takes from A1 to A2.2?"): those that run between
// anchors the map already shows, so that A2.2 is no island. Today that is rest ↔ hand over: A1 → A2.2 and A2.2 → A1 (the
// bank writes the rest there as IDLE-B, A1 with the open shoe of A2.2). They are drawn as two dashed lanes in the strip
// between A1 and A2.2's row (above A1's rail and under the exit A2.1 → A1), each with a small label; every other
// experiment stays in the tray only. Pure: the places come from the map's layout (lib/map-layout.ts); tests in
// studio/tests/map-experiments.test.ts.
import type { Box, Dir, MapLayout } from "../../lib/map-layout.ts";

export type ExperimentLine = {
  id: string;
  path: string;
  arrow: { x: number; y: number; dir: Dir };
  /** The label's centre, and its words. */
  label: { x: number; y: number };
  text: string;
  /** What the words leave out ("A1 med den öppna skon"), for the tooltip. */
  detail: string;
  nodes: [string, string];
};

/** The map node an experiment's pose stands at, or null: A1 in either shoe, A2.2. */
const atAnchor = (node: string): "IDLE" | "READY-B" | null => (node === "IDLE" || node === "IDLE-B" ? "IDLE" : node === "READY-B" ? "READY-B" : null);
const r = (n: number) => Math.round(n * 10) / 10;

export function experimentLines(layout: Pick<MapLayout, "nodes">, experiments: readonly { id: string; from: string; to: string }[]): ExperimentLine[] {
  const box = (id: string): Box | null => layout.nodes.find((n) => n.id === id)?.box ?? null;
  const a1 = box("IDLE");
  const a22 = box("READY-B");
  if (!a1 || !a22) return [];
  const bottom = a1.y + a1.h;
  const room = a22.y - bottom;
  if (room < 20 || a22.x < a1.x + a1.w + 40) return [];
  // Two lanes in the strip between A1's bottom and A2.2's top; the lines never cross (A1 → A2.2 runs outside the other).
  const laneOut = bottom + Math.round(room * 0.3);
  const laneBack = bottom + Math.round(room * 0.68);
  const out: ExperimentLine[] = [];
  const taken = new Set<string>();
  for (const e of experiments) {
    const from = atAnchor(e.from);
    const to = atAnchor(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}>${to}`;
    if (taken.has(key)) continue; // one lane each way; a second film of the same pair stays in the tray
    taken.add(key);
    const detail = [e.from === "IDLE-B" || e.to === "IDLE-B" ? "A1 med den öppna skon (IDLE-B)" : "", "experiment utanför modellen"].filter(Boolean).join(", ");
    if (from === "IDLE") {
      const x0 = a1.x + a1.w - 16;
      const x1 = a22.x + a22.w * 0.66;
      out.push({ id: e.id, nodes: ["IDLE", "READY-B"], text: "A1 → A2.2", detail,
        path: `M${r(x0)},${r(bottom)}V${r(laneOut)}H${r(x1)}V${r(a22.y)}`, arrow: { x: x1, y: a22.y, dir: "down" }, label: { x: r(x0 + (x1 - x0) * 0.35), y: laneOut } });
    } else {
      const x0 = a22.x + a22.w * 0.33;
      const x1 = a1.x + a1.w - 36;
      out.push({ id: e.id, nodes: ["READY-B", "IDLE"], text: "A2.2 → A1", detail,
        path: `M${r(x0)},${r(a22.y)}V${r(laneBack)}H${r(x1)}V${r(bottom)}`, arrow: { x: x1, y: bottom, dir: "up" }, label: { x: r(x1 + (x0 - x1) * 0.65), y: laneBack } });
    }
  }
  return out;
}
