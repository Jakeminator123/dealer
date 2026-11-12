// The cards on the picture, drawn by the playback's own code: src/card-overlay-view.ts, the card layer the lab's clip bank and
// the 3D scene's canvas method draw rendered cards with (createCardOverlay). Each card is laid as a card that already lies on
// the table ("placed"): the card material study's card, its print and paper, on the quad the plan gives. So what Jakob places
// here is what lies there when the films play. The module is read from the lab server at run time (lib/lab.ts labModule), as
// the scene is: it brings its own three.js.
//
// The overlay keeps a film's hand in front of a lying card, and it tells hand from table by the films' bright green felt
// (src/card-track.ts is.table). Over a green film the film itself is what it reads, as in playback. The V6 pictures and the
// composed films have a dark felt that the rule takes for a sleeve, and would cut every card away; under those the overlay
// reads a plain green table instead, so the cards lie whole. The picture itself is never drawn here: only the cards are.
//
// The layer draws into one canvas per gloss value (the overlay takes one gloss per draw; the plan has one per card, and in
// practice they are all the same), stacked in `host`.
import type { PlacementPlan, View } from "../../../src/placement-model.ts";
import { is } from "../../../src/card-track.ts";
import { planQuad, VIEWS } from "../../../src/placement-model.ts";
import { labModule } from "../../lib/lab.ts";

type OverlayModule = typeof import("../../../src/card-overlay-view.ts");
type Overlay = ReturnType<OverlayModule["createCardOverlay"]>;
export type Face = { rank: string; suit: string };
/** What the overlay reads: a <video>, or a canvas that says its size as a video would (tableSource). */
export type Source = HTMLVideoElement;

/** A plain table of the films' own green felt (the overlay's ground colour), `width` × `height`, as the overlay's source. */
export function tableSource(width: number, height: number): Source {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgb(20,150,60)";
  ctx.fillRect(0, 0, width, height);
  Object.defineProperties(canvas, { videoWidth: { value: width }, videoHeight: { value: height } });
  return canvas as unknown as Source;
}
/** A still picture as the overlay's source: under it lies the plain table (see above), of the picture's size. */
export const stillSource = (image: HTMLImageElement): Source => tableSource(image.naturalWidth, image.naturalHeight);

/** Whether a film's frame has the films' green felt: at least a fifth of a small copy of it passes the tracker's table rule. */
export function greenFelt(video: Source): boolean {
  const w = 64;
  const h = Math.max(1, Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (is.table(d[i], d[i + 1], d[i + 2])) n++;
  return n > 0.2 * w * h;
}

/**
 * The cards of a plan as the overlay lays them, in the source's pixels: the plan's quad in the view's pixels, carried to the
 * source's size (the films are 1764 px wide where the plan's Dator view is 1762, the game's FILM_X; a still of the view's own
 * size is unchanged).
 */
export function laidCards(plan: PlacementPlan, view: View, ids: readonly string[], width: number, height: number) {
  const v = VIEWS[view];
  const sx = (width - 1) / (v.width - 1);
  const sy = (height - 1) / (v.height - 1);
  return ids.map((id) => {
    const t = plan.targets[id];
    return { quad: planQuad(plan, id, view).map((p) => ({ x: p.x * sx, y: p.y * sy })), back: t.intent.endSide === "BACK", target: id, gloss: t.material.gloss };
  });
}

export type CardLayer = {
  /** Draws the cards over `source`; resolves false when the playback's card could not be drawn here (no WebGL, no module). */
  draw(source: Source, plan: PlacementPlan, view: View, ids: readonly string[], face: Face): Promise<boolean>;
  clear(): void;
  dispose(): void;
};

export function createCardLayer(host: HTMLElement): CardLayer {
  let module: Promise<OverlayModule> | null = null;
  const groups = new Map<string, { canvas: HTMLCanvasElement; overlay: Overlay }>();
  let disposed = false;
  // per film: whether it has the green felt (then the overlay reads the film), and the plain table for one that has not
  const felt = new Map<string, boolean>();
  let plain: Source | null = null;
  const reading = (source: Source): Source => {
    if (!(source instanceof HTMLVideoElement)) return source;
    const key = source.currentSrc || source.src;
    let green = felt.get(key);
    if (green === undefined) {
      green = greenFelt(source);
      felt.set(key, green);
    }
    if (green) return source;
    if (!plain || plain.videoWidth !== source.videoWidth || plain.videoHeight !== source.videoHeight) plain = tableSource(source.videoWidth, source.videoHeight);
    return plain;
  };
  const group = (m: OverlayModule, key: string) => {
    let g = groups.get(key);
    if (!g) {
      const canvas = document.createElement("canvas");
      canvas.className = "absolute inset-0 size-full pointer-events-none";
      canvas.dataset.gloss = key;
      host.append(canvas);
      g = { canvas, overlay: m.createCardOverlay(canvas) };
      groups.set(key, g);
    }
    return g;
  };
  return {
    async draw(source, plan, view, ids, face) {
      try {
        module ??= labModule<OverlayModule>("card-overlay-view");
        const m = await module;
        if (disposed) return false;
        const read = reading(source);
        const cards = laidCards(plan, view, ids, source.videoWidth, source.videoHeight);
        const byGloss = new Map<string, typeof cards>();
        for (const card of cards) {
          const key = String(card.gloss);
          byGloss.set(key, [...(byGloss.get(key) ?? []), card]);
        }
        for (const [key, g] of groups) if (!byGloss.has(key)) g.overlay.clear();
        for (const [key, list] of byGloss) {
          const options = {
            scale: 1, split: false, side: "TRACK" as const, bend: 0, gloss: Number(key), inFront: false,
            card: face as Parameters<Overlay["draw"]>[4]["card"],
            placed: list.map(({ quad, back, target }) => ({ quad, back, target })),
          };
          group(m, key).overlay.draw(read, 0, null, null, options);
        }
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      for (const g of groups.values()) g.overlay.clear();
    },
    dispose() {
      disposed = true;
      for (const g of groups.values()) g.canvas.remove();
      groups.clear();
    },
  };
}
