// The cut frame as a last picture (src/order-model.ts cutFrameOf): the picture check of the frame before it is used, and
// the shoe put back from the dealer's anchor 1 where the card in the shoe's window is printed (trial 2A of 2026-11-17:
// frame 126 of paow-giv-2-2-p4-01-01 had an emblem on the window's card; the shoe and its card were taken from
// paow-vila-ung-2 inside the shoe's box, every pixel that is not green in either picture, grown and feathered).
// Pure: pictures in, measures and a new picture out (RGB, 3 bytes a pixel, the bank's 1764 x 1174). The tools take the
// frame out of the film with FFmpeg and write last.png.
import { cardBlobs, dilate, gaussianBlur } from './film-after.ts';

/** The shoe's box in the bank's frame (trial 2A): wide enough for the shoe and its window, right of the dealer's arms. */
export const SHOE_BOX: [number, number, number, number] = [1195, 680, 1764, 1010];
const green = (d: Uint8Array, i: number) => d[i + 1] > 150 && d[i + 1] > d[i] * 1.6 && d[i + 1] > d[i + 2] * 1.6;
const toBgr = (rgb: Uint8Array) => { const out = new Uint8Array(rgb.length); for (let i = 0; i < rgb.length; i += 3) { out[i] = rgb[i + 2]; out[i + 1] = rgb[i + 1]; out[i + 2] = rgb[i]; } return out; };

/**
 * The picture check of a cut frame: the laid card (blue for an open deal) lies within `tolerance` px of the plan's card on
 * the edges the fingers leave free (the third worst of its four box edges), and the card in the shoe's window is plain
 * (no more than `printed` of its box's inner half is other than yellow). A printed window card does not fail the frame:
 * the shoe is put back from anchor 1 (patchShoe).
 */
export function checkCutFrame(rgb: Uint8Array, w: number, h: number, planBox: [number, number, number, number], options: { side?: 'FRONT' | 'BACK'; tolerance?: number; printed?: number } = {}) {
  const tolerance = options.tolerance ?? 5, printedShare = options.printed ?? 0.1, bgr = toBgr(rgb), blobs = cardBlobs(bgr, w, h);
  const laid = blobs.filter((b) => b.c === (options.side === 'BACK' ? 'Y' : 'B') && !b.inShoe).sort((a, b) => b.area - a.area)[0] ?? null;
  const off = laid?.box ? laid.box.map((v, i) => Math.abs(v - planBox[i])).sort((a, b) => a - b)[2] : null;
  const windowCard = blobs.filter((b) => b.c === 'Y' && b.inShoe).sort((a, b) => b.area - a.area)[0] ?? null;
  let other = 0, inner = 0;
  if (windowCard?.box) {
    const [x0, y0, x1, y1] = windowCard.box, qx = (x1 - x0) / 4, qy = (y1 - y0) / 4;
    for (let y = Math.round(y0 + qy); y <= Math.round(y1 - qy); y++) for (let x = Math.round(x0 + qx); x <= Math.round(x1 - qx); x++) {
      const i = (y * w + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      inner++; if (!(r > 95 && g > 95 && g > 0.82 * r && r > 0.6 * g && b < 0.45 * Math.min(r, g))) other++;
    }
  }
  const printed = inner ? other / inner > printedShare : false;
  const problems = [...(!laid ? ['inget lagt kort'] : off !== null && off > tolerance ? [`kortet ligger ${off} px från planens`] : [])];
  return { holds: problems.length === 0, problems, laid: laid ? { box: laid.box!, centre: [laid.x, laid.y] as [number, number], area: laid.area } : null, offFromPlan: off, windowPrinted: printed, windowOtherShare: inner ? Math.round((other / inner) * 1000) / 1000 : null };
}

/** The shoe and its card from `anchor` into `frame` inside `box`: every pixel that is not green in either, grown by 4 px and feathered. */
export function patchShoe(frame: Uint8Array, anchor: Uint8Array, w: number, h: number, box: [number, number, number, number] = SHOE_BOX): Uint8Array {
  const [x0, y0, x1, y1] = box, mask = new Uint8Array(w * h);
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) { const p = y * w + x, i = p * 3; if (!green(frame, i) || !green(anchor, i)) mask[p] = 1; }
  const grown = dilate(mask, w, h, 9, 9), soft = gaussianBlur(Float32Array.from(grown), w, h, 1, 2.5), out = frame.slice();
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
    const p = y * w + x, k = Math.min(1, Math.max(0, soft[p])); if (!k) continue;
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(frame[p * 3 + c] * (1 - k) + anchor[p * 3 + c] * k);
  }
  return out;
}
