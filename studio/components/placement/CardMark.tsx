// The marks on a drawn card's blue side (src/placement-model.ts cardMark, CARD_RGB): a small pink cross in its middle and a
// small red circle in one corner, as the last picture of an order carries them (tools/order-images.ts layCard). Drawn on
// top of every filled blue card in Scen & bord; the yellow side carries nothing.
import { MARK_COLOUR, cardMark } from "../../../src/placement-model.ts";

type Corner = { x: number; y: number } | readonly [number, number];
const xy = (p: Corner) => ("x" in p ? p : { x: p[0], y: p[1] });
const points = (q: readonly { x: number; y: number }[]) => q.map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(" ");

/** Inside an SVG in the picture's pixels; `quad` is the card's four corners, far left, far right, near right, near left. */
export function CardMark({ quad }: { quad: readonly Corner[] }) {
  if (quad.length !== 4) return null;
  const mark = cardMark(quad.map(xy));
  return (
    <g pointerEvents="none" aria-hidden>
      {mark.cross.map((arm, i) => (
        <polygon key={i} points={points(arm)} fill={MARK_COLOUR.cross} />
      ))}
      <polygon points={points(mark.dot)} fill={MARK_COLOUR.dot} />
    </g>
  );
}
