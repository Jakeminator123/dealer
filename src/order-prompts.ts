// The text that goes to Runway with an order: scene(dealer) + action(step, motion) + bans, per kind of step and for the
// stills an anchor or an in-between picture is made from. Pure; the dealer's look comes from data/dealers.json, the
// card's place from the plan as drawn on the last picture. Every text ends with what must not happen. The turn has no
// fixed side: the default asks for a natural turn a human hand can make, and two variants say a side (Jakob 2026-11-12:
// "variation ... but only if it follows the laws of nature and the anatomy of a human hand"). Tests: tools/order-prompts.test.ts.
import type { FlipAxis, StepKey } from './order-model.ts';

export const TEMPLATE_VERSION = 1;
export type Dealer = { name: string; look: string };
export type PromptInput = {
  dealer: Dealer;
  step: StepKey;
  model: string;
  /** For a deal: the card's grip, whether it turns, which way, the side it lands with, and where it lands in the picture. */
  motion?: { grip: 'PINCH' | 'DRAG'; turn: boolean; flipAxis: FlipAxis; side: 'FRONT' | 'BACK' } | null;
  place?: { x: number; y: number } | null;
  /** An in-between picture goes along (Kling 4). */
  middle?: boolean;
  /** Jakob's own addition, put before the bans. */
  extra?: string | null;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The turn, one sentence per choice. */
export function turnSentence(axis: FlipAxis, grip: 'PINCH' | 'DRAG' = 'PINCH'): string {
  if (axis === 'LONG_EDGE')
    return "On the way she rolls the card over about its long side: she turns her wrist once, the yellow back narrows to a thin pale edge along the card's long side, then the blue face comes up; the same hand holds the card the whole time.";
  if (axis === 'SHORT_EDGE')
    return 'She holds the card by its near short end between thumb and fingers and folds it over that held short edge: the far end lifts, for a moment the card stands upright on its short edge, then it comes down blue face up. The card turns about its short edge, never about its long side; the same hand keeps it the whole time.';
  return `On the way she turns the card over once, the way a real hand can from ${grip === 'DRAG' ? 'the fingertips on the card' : 'this pinch'}: one natural movement of fingers and wrist that a human hand can actually make, the card held firmly the whole time, until its blue face is up.`;
}

export const BANS_FILM =
  'Nothing of this happens: a second card appears, a finger passes through the card, the card grows or shrinks on its way, a hand hovers in the air without holding or laying anything, the shoe changes, the picture cuts or the camera moves.';
export const BANS_STILL =
  "Nothing of this happens: a second card appears, a finger passes through the card, the card has another size or shape than the card in the shoe's window, a hand floats in the air without holding anything, a second shoe appears, the framing changes.";

/** Where the card lies in the picture, in words a model can find (bank pixels, 1764 × 1174). */
export function placeWords(place: { x: number; y: number }): string {
  const near = place.y < 960 ? 'close to her body, ' : '';
  const x = place.x;
  const across = x < 450 ? 'far to the left of the picture' : x < 800 ? 'to the left of the middle of the picture' : x > 1310 ? 'far to the right of the picture' : x > 960 ? 'to the right of the middle of the picture' : 'in the middle of the picture';
  return near + across;
}

/** What the dealer's standard says about the body, for a still made as an edit of @anchor. */
export const STANDARD_STILL =
  "She sits on a chair that is not in the picture: her elbows hang free at her sides and her forearms come down to the felt; nothing supports her elbows or forearms. Her jacket continues down to the same straight horizontal line where her body is cut off in @anchor, with no green between the jacket and that line. The green is one even colour everywhere, right up to her outline: no shadows under or beside her arms, her hands, the card or the shoe. Soft, even frontal studio light; natural skin with fine texture, sharp eyes, matte black cloth with soft folds.";

function stillText(input: PromptInput): { template: string; text: string } {
  const look = input.dealer.look;
  const pose =
    input.step === 'ANKARE-2.1'
      ? "she reaches to the shoe and holds the top of the yellow card in the shoe's window between thumb and forefinger, in exactly the pose of the dealer's left hand in @pose."
      : input.step === 'ANKARE-2.2'
        ? "her hand lies over the yellow card in the shoe's window, fingertips resting flat on the card, ready to slide it out along the felt, in the pose of the dealer's left hand in @pose. The shoe in @pose has an open front: do not copy it."
        : "she has drawn the yellow card out of the shoe and carries it low over the table, halfway between the shoe and the place in front of her, her arm in the pose of the dealer's left arm in @pose. She holds the card between thumb and forefinger by its near short end, and the card stands upright on that short edge: one rigid card, upright between her fingers, the same size and shape as the card in the shoe's window. The next yellow card waits in the shoe's window, as in @anchor.";
  const text = [
    'This is an edit of the picture @anchor.',
    `Keep everything in @anchor exactly as it is: the framing and camera, the flat pure chroma-green background and green table surface with no visible edge, the black card shoe at the right with the yellow card in its window, and the woman herself, ${look}: her face, hair, clothes and build, the place and size of her head and body, and her right hand, at the left of the picture, lying flat on the felt.`,
    `Change only her left arm and hand, at the right of the picture: ${pose}`,
    "Take only the pose of the arm and hand from @pose, not the person, her clothes, the shoe or the card: the shoe and the yellow card in its window keep exactly the look, size and shape they have in @anchor.",
    STANDARD_STILL,
    input.extra?.trim() || '',
    BANS_STILL,
  ].filter(Boolean).join(' ');
  return { template: `${input.step === 'MELLANBILD' ? 'bild-mellanbild' : 'bild-ankare'}@${TEMPLATE_VERSION}`, text };
}

function dealText(input: PromptInput): { template: string; text: string } {
  const m = input.motion ?? { grip: 'PINCH', turn: true, flipAxis: 'FREE', side: 'FRONT' };
  const kling = input.model === 'kling-4';
  const look = input.dealer.look;
  const colour = m.side === 'FRONT' ? 'blue' : 'yellow';
  const sideWords = m.side === 'FRONT' ? 'blue face' : 'yellow back';
  const where = input.place ? `${placeWords(input.place)}, ` : '';
  const scene = kling
    ? `One continuous take with a locked-off camera and no cuts. The woman in the first frame is ${look}; she sits at a green table, seen from the front, with the black card shoe fixed at the right of the picture and a yellow card in its window. She deals one card and comes back to the pose she started in.`
    : `Locked camera. ${cap(look)} sits at a green table with a black card shoe fixed at the right of the picture. One continuous, calm and natural movement from the exact first pose.`;
  const take =
    m.grip === 'DRAG'
      ? "Her left hand, at the right of the picture, lies over the yellow card in the shoe's window, fingertips on the card. With the fingertips she slides that one card straight out of the shoe, and it lies flat on the felt, the same size and shape as it was in the shoe."
      : "Her left hand, at the right of the picture, pinches the yellow card in the shoe's window between thumb and forefinger, as in the first frame, and draws it out: the card looks as it does in the shoe, the same size and shape, one plain rigid card.";
  const carry =
    m.grip === 'DRAG'
      ? 'She drags it along the felt in one smooth sweep, the fingertips on top of it; her wrist turns naturally as the arm sweeps across in front of her.'
      : 'The same hand carries it low over the table towards the place where it will lie.';
  const turn = m.turn ? turnSentence(m.flipAxis, m.grip) : "She keeps its yellow back up all the way; the card is not turned.";
  const middle = input.middle ? 'Halfway there, her hand and the card look exactly as in the reference picture.' : '';
  const land = `She lays it flat, ${sideWords} up, exactly where the ${colour} card lies in the last frame, ${where}at the same size and angle, lets go of it, and the card stays there.`;
  const back =
    m.grip === 'DRAG'
      ? "Then the hand goes back the same way and comes to rest over the next yellow card in the shoe's window, exactly as in the first frame."
      : 'Then the hand returns to the shoe and pinches the next yellow card, exactly as in the first frame.';
  const rest = 'Her right hand, at the left of the picture, rests on the table the whole time. Only one card moves; it is solid yellow on its back and solid blue on its face.';
  const end = kling ? 'She ends exactly as in the last frame.' : 'The clip ends in exactly the pose of the last image, which is the first pose again with the card lying on the table.';
  const text = [scene, take, carry, turn, middle, land, back, rest, end, input.extra?.trim() || '', BANS_FILM].filter(Boolean).join(' ');
  return { template: `film-giv@${TEMPLATE_VERSION}`, text };
}

function entryText(input: PromptInput, to: '2.1' | '2.2'): { template: string; text: string } {
  const reach =
    to === '2.1'
      ? "She calmly lifts her left hand, at the right of the picture, reaches to the shoe and pinches the top of the yellow card in the shoe's window between thumb and forefinger, settling exactly into the pose of the last image."
      : "She calmly lifts her left hand, at the right of the picture, reaches to the shoe and lays it over the yellow card in the shoe's window, fingertips resting flat on the card, settling exactly into the pose of the last image.";
  const text = [
    `Locked camera. ${cap(input.dealer.look)} sits at a green table with a black card shoe fixed at the right of the picture, a yellow card in its window. One continuous, calm and natural movement from the exact first pose, both hands resting on the felt.`,
    reach,
    'The yellow card stays seated in the shoe; nothing is dealt. Her right hand, at the left of the picture, rests on the table the whole time.',
    input.extra?.trim() || '',
    BANS_FILM,
  ].filter(Boolean).join(' ');
  return { template: `film-ingang@${TEMPLATE_VERSION}`, text };
}

function restText(input: PromptInput): { template: string; text: string } {
  const text = [
    `Locked camera. ${cap(input.dealer.look)} sits at a green table with a black card shoe fixed at the right of the picture, both hands resting on the felt.`,
    'She waits calmly at her table: she breathes, blinks and looks gently around, and ends exactly in the pose she started in, as in the last image. Her hands stay where they are; nothing is dealt and the yellow card stays seated in the shoe.',
    input.extra?.trim() || '',
    BANS_FILM,
  ].filter(Boolean).join(' ');
  return { template: `film-vila@${TEMPLATE_VERSION}`, text };
}

/** The text for an order, and the template it came from ("film-giv@1"). */
export function promptFor(input: PromptInput): { template: string; text: string } {
  switch (input.step) {
    case 'ANKARE-2.1':
    case 'ANKARE-2.2':
    case 'MELLANBILD':
      return stillText(input);
    case 'GIV-2.1':
    case 'GIV-2.2':
    case 'RETUR-2.1':
    case 'RETUR-1':
      return dealText(input);
    case 'INGANG-2.1':
      return entryText(input, '2.1');
    case 'INGANG-2.2':
      return entryText(input, '2.2');
    case 'VILA':
      return restText(input);
  }
}
