// What this lane adds to the table's lens: what a lens makes of a length in the picture, for the fit that chooses the
// lens (world.ts). The camera itself, the lens as numbers and the family of lenses that give the card at seat 4 its
// film size and shape (drawnCard, lensForFocal) are src/table-lens.ts, and everything of it is handed on from here.
// Pure: no I/O and no three.js.
export * from '../../src/table-lens.ts';
import {filmEye, length, onPlane, sub, type FilmCard, type Lens, type Pixel} from '../../src/table-lens.ts';

/**
 * What the film shows of real things of known size: a card lying flat with its short side across the picture (its centre
 * pixel, its near edge and its depth on screen) and a length lying near the felt between two pixels.
 */
export type Anchors = {card: FilmCard; span: {a: Pixel; b: Pixel; metres: number; lift: number}};
/** The span of `anchors` as a lens reads it, in metres. */
export function readSpan(l: Lens, span: Anchors['span']): number | null {
  const eye = filmEye(l), a = onPlane(eye, span.a.x, span.a.y, span.lift), b = onPlane(eye, span.b.x, span.b.y, span.lift);
  return a && b ? length(sub(a, b)) : null;
}
