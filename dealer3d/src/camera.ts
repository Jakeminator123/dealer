// The fitting side of the table's lens: the family of lenses under which the card lying at seat 4 has its film size and
// shape, and what a lens makes of a length in the picture. The camera itself (frame, projection, the chosen lens as
// numbers) is src/table-lens.ts, and everything of it is handed on from here. Pure: no I/O and no three.js.
export * from '../../src/table-lens.ts';
import {FILM, cardCorners, filmEye, length, onPlane, quadMeasure, see, sub, type Lens, type Pixel} from '../../src/table-lens.ts';

/**
 * What the film shows of real things of known size: a card lying flat with its short side across the picture (its centre
 * pixel, its near edge and its depth on screen) and a length lying near the felt between two pixels.
 */
export type Anchors = {card: {centre: Pixel; nearPx: number; depthPx: number}; span: {a: Pixel; b: Pixel; metres: number; lift: number}};
/** The card of `anchors` as a lens draws it. */
export function drawnCard(l: Lens, centre: Pixel) {
  const eye = filmEye(l), at = onPlane(eye, centre.x, centre.y); if (!at) return null;
  const q = cardCorners(at).map(p => see(eye, p)); return q.every(Boolean) ? quadMeasure(q as Pixel[]) : null;
}
/** The span of `anchors` as a lens reads it, in metres. */
export function readSpan(l: Lens, span: Anchors['span']): number | null {
  const eye = filmEye(l), a = onPlane(eye, span.a.x, span.a.y, span.lift), b = onPlane(eye, span.b.x, span.b.y, span.lift);
  return a && b ? length(sub(a, b)) : null;
}
/**
 * The one lens of a given focal length under which the flat card has its film size and shape: the shape on screen (depth
 * over near edge) fixes the pitch and the size fixes the height, each by bisection. The focal length stays free: the card's
 * size and shape alone leave a family of lenses, from a wide one close by to a long one far away.
 */
export function lensForFocal(card: Anchors['card'], focalPx: number): Lens {
  const want = card.depthPx / card.nearPx, cy = (FILM.height - 1) / 2;
  const sized = (pitch: number): Lens => { // the height at which the near edge has its film length
    let lo = 0.05, hi = 8; for (let i = 0; i < 60; i++) { const h = (lo + hi) / 2, m = drawnCard({focalPx, pitch, height: h}, card.centre); if (!m || m.near > card.nearPx) lo = h; else hi = h; }
    return {focalPx, pitch, height: (lo + hi) / 2};
  };
  let lo = -Math.atan((card.centre.y - cy) / focalPx) + 0.02, hi = 1.4; // from just under the card's own line of sight to steeply down
  for (let i = 0; i < 60; i++) { const pitch = (lo + hi) / 2, m = drawnCard(sized(pitch), card.centre); if (!m || m.depth / m.near < want) lo = pitch; else hi = pitch; }
  return sized((lo + hi) / 2);
}
