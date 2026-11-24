// The marks on a drawn card (src/placement-model.ts CARD_MARK, CARD_RGB), so that every card of a side is one kind of card
// (Jakob 2026-11-24). The blue side: a small pink cross in its middle and a small red circle in one corner, as the last
// picture of an order carries them (cardMark; tools/order-images.ts layCard). The yellow side, the opposite: a filled red
// circle in its middle and a pink cross near its near end, as A2.3 has them on the card in the shoe's window.
import { MARK_COLOUR, cardMark, type Side } from "../../../src/placement-model.ts";

type Pt = { x: number; y: number };
type Corner = Pt | readonly [number, number];
const xy = (p: Corner) => ("x" in p ? p : { x: p[0], y: p[1] });
const points = (q: readonly Pt[]) => q.map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(" ");

/** Inside an SVG in the picture's pixels; `quad` is the card's four corners, far left, far right, near right, near left; `side` is the side that shows (the blue one where it is left out). */
export function CardMark({ quad, side = "FRONT" }: { quad: readonly Corner[]; side?: Side }) {
  if (quad.length !== 4) return null;
  const mark = cardMark(quad.map(xy), side);
  return (
    <g pointerEvents="none" aria-hidden>
      {mark.cross.map((arm, i) => (
        <polygon key={i} points={points(arm)} fill={MARK_COLOUR.cross} />
      ))}
      <polygon points={points(mark.dot)} fill={MARK_COLOUR.dot} />
    </g>
  );
}
