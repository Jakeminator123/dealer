// The text that goes to Runway with an order: scene(dealer) + action(step, motion) + bans, per kind of step and for the
// stills an anchor is made from. Pure; the dealer's look comes from data/dealers.json, the card's place from the plan
// (where the last picture draws the card). Every text ends with what must not happen. A deal's text is built as parts,
// each marked with the choices it comes from (hand, how the card lands and turns, the place, the free addition, the
// bans), so that the studio can show which words a choice made; the text is the parts joined, and the studio's sheet and
// the stored draft both get it from promptFor, so the preview cannot drift from what is sent.
//
// A deal follows the hand chosen: the left hand all the way, the right hand all the way, or handbyte (the left hand takes
// the card and gives it to the right hand low in front of her body; the right lays it). Every sentence that names a hand
// follows that choice, the bans too. The turn: at the place after the carry in Jakob's six steps of 2026-11-13 (nyp, dra,
// för fram, vrid, vänd upp, lägg; a closed card goes nyp, dra, för fram, lägg), free on the way (a turn a human hand can
// make, with a card that keeps its size; Jakob 2026-11-12), or rolled about the long side on the way as the bank's films
// do. The pose picture of a still is a cut-out: only the dealing forearm, its hand, the shoe and the card of another
// dealer, the rest of her filled with green (tools/order-images.ts cutFigure), so that only the hand's place and grip can
// be taken from it. Tests: tools/order-prompts.test.ts.
import type { FlipAxis, StepKey } from './order-model.ts';

export const TEMPLATE_VERSION = 3;
export type Dealer = { name: string; look: string };
export type DealMotion = { grip: 'PINCH' | 'DRAG'; hand?: 'LH' | 'RH'; pass?: boolean; turn: boolean; flipAxis: FlipAxis; side: 'FRONT' | 'BACK' };
export type PromptInput = {
  dealer: Dealer;
  step: StepKey;
  model: string;
  /** For a deal: the grip, the hand that takes the card and whether it is handed over, the turn, and the side it lands with. */
  motion?: DealMotion | null;
  /** Where the card lands in the picture (bank pixels, 1764 × 1174). */
  place?: { x: number; y: number } | null;
  /** Jakob's own addition, put before the bans. */
  extra?: string | null;
};
/** What a part of the text comes from: a choice in the sheet, Jakob's addition, or the bans. */
export type Choice = 'hand' | 'side' | 'turn' | 'place' | 'extra' | 'bans';
export type Part = { text: string; from: Choice[] };
export type Prompt = { template: string; text: string; parts: Part[] };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LEFT = 'her left hand, at the right of the picture';
const RIGHT = 'her right hand, at the left of the picture';
const joined = (parts: Part[]) => parts.filter((p) => p.text).map((p) => p.text).join(' ');

/** Who does what in a deal: the hand that takes the card, the one that turns and lays it, and whether it is handed over. */
export function handsIn(m: Pick<DealMotion, 'hand' | 'pass'> | null | undefined): { takes: 'LH' | 'RH'; lays: 'LH' | 'RH'; pass: boolean } {
  const pass = !!m?.pass, takes = pass ? 'LH' : (m?.hand ?? 'LH');
  return { takes, lays: pass ? 'RH' : takes, pass };
}
const handWord = (h: 'LH' | 'RH') => (h === 'LH' ? 'left' : 'right');

/** The turn, one sentence per choice and per grip; the hand that holds the card while it turns follows the hand chosen. */
export function turnSentence(axis: FlipAxis, grip: 'PINCH' | 'DRAG' = 'PINCH', hands: Pick<DealMotion, 'hand' | 'pass'> | null = null): string {
  const { lays, pass } = handsIn(hands);
  if (axis === 'AT_PLACE') {
    const start = grip === 'DRAG' && !pass ? 'At the place her fingertips tip the card up onto its long edge and her thumb and fingers take hold of it; her wrist rolls it on' : `At the place the wrist of her ${handWord(lays)} hand rolls: the card tilts up onto its long edge, held between thumb and fingers, and the roll goes on`;
    return `${start} until its blue face is up, one edge staying near the felt; it is one card turned over once, keeping its size.`;
  }
  if (axis === 'LONG_EDGE') {
    const lift = grip === 'DRAG' && !pass ? 'On the way she lifts the card from the felt and rolls it' : 'On the way she rolls the card';
    return `${lift} over about its long side: she turns her wrist once, the yellow back narrows to a thin pale edge along the card's long side, then the blue face comes up; ${pass ? 'her right hand' : 'the same hand'} holds the card the whole time.`;
  }
  const from = pass ? 'from its grip on the card' : grip === 'DRAG' ? 'once she has lifted it from the felt with her fingertips' : 'from this pinch';
  return `On the way ${pass ? 'her right hand turns' : 'she turns'} the card over once, the way a real hand can ${from}: one natural movement of fingers and wrist that a human hand can actually make, the card held firmly the whole time and keeping its size, until its blue face is up.`;
}

/** What must not happen in a film that deals no card (an entrance, a rest). */
export const BANS_FILM =
  'Nothing of this happens: a second card appears, a finger passes through the card, the card grows or shrinks on its way, a hand hovers in the air without holding or laying anything, the shoe changes, the picture cuts or the camera moves.';
/** What must not happen in a deal: the film bans, with what the chosen hand and side must not do. */
export function bansFor(m: Pick<DealMotion, 'hand' | 'pass' | 'side' | 'flipAxis' | 'turn'> | null | undefined): string {
  const { takes, pass } = handsIn(m);
  const own: string[] = [];
  if (m) {
    if (pass) own.push('the card is handed over high in front of her chest', 'the card is tossed or dropped between the hands', 'each hand holds a card of its own', 'the left hand lays the card on the table');
    else if (takes === 'LH') own.push('her right hand lifts from the table or touches the card');
    else own.push('her left hand carries the card');
    if (m.side === 'BACK') own.push('the card shows its blue face');
    else if (m.flipAxis === 'AT_PLACE') own.push('the card is turned in the air on the way');
  }
  return `Nothing of this happens: ${['a second card appears', ...own, 'a finger passes through the card', 'the card grows or shrinks on its way', 'a hand hovers in the air without holding or laying anything', 'the shoe changes', 'the picture cuts or the camera moves'].join(', ')}.`;
}
export const BANS_STILL =
  "Nothing of this happens: the fingers rest on the shoe instead of on the card, a second card appears, a finger passes through the card, the card has another size or shape than the card in the shoe's window, a hand floats in the air without holding anything, a second shoe appears, the framing changes.";

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

/** What @pose is, said before it is used: a cut-out of a hand at the shoe, nothing of a person. */
export const POSE_IS =
  '@pose is a cut-out on plain green: it shows only a left forearm in a black sleeve, cut off at the elbow, its hand, the card shoe and the yellow card; nothing else of that person is in it.';

function stillText(input: PromptInput): Prompt {
  const look = input.dealer.look;
  const pose =
    input.step === 'ANKARE-2.1'
      ? "she reaches to the shoe and holds the yellow card itself between thumb and forefinger at its upper edge: the fingertips are on the card, not on the shoe's rim, and she has drawn the card a little out of the window so that her grip on it is plain to see; the card may bend slightly in the pinch. Her hand is placed and shaped as the hand in @pose."
      : "her hand lies over the yellow card in the shoe's window, the fingertips resting flat on the card itself, not on the shoe, ready to slide it out along the felt; her hand is placed and shaped as the hand in @pose. The shoe in @pose has an open front: do not copy it.";
  const parts: Part[] = [
    { text: 'This is an edit of the picture @anchor.', from: [] },
    { text: `Keep everything in @anchor exactly as it is: the framing and camera, the flat pure chroma-green background and green table surface with no visible edge, the black card shoe at the right with the yellow card in its window, and the woman herself, ${look}: her face, hair, clothes and build, the place and size of her head and body, and her right hand, at the left of the picture, lying flat on the felt.`, from: [] },
    { text: `Change only her left arm and hand, at the right of the picture: ${pose}`, from: [] },
    { text: `${POSE_IS} Take from @pose only where the hand is and how the wrist and fingers hold the card. Her own sleeve, skin and hand stay as they are in @anchor, and her forearm goes up to her own elbow and shoulder as her body in @anchor allows; the shoe and the yellow card in its window keep exactly the look, size and shape they have in @anchor.`, from: [] },
    { text: STANDARD_STILL, from: [] },
    { text: input.extra?.trim() || '', from: ['extra'] },
    { text: BANS_STILL, from: ['bans'] },
  ];
  return { template: `bild-ankare@${TEMPLATE_VERSION}`, text: joined(parts), parts };
}

/**
 * A deal, sentence by sentence in the order the hand works: the scene; the take (nyp, dra); the carry (för fram), with
 * the handover when the card changes hands; the turn (vrid, vänd upp) or that it is not turned; the lay (lägg); the way
 * back; what the other hand does; the end; Jakob's addition; the bans.
 */
function dealText(input: PromptInput): Prompt {
  const m: DealMotion = input.motion ?? { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT' };
  const { takes, lays, pass } = handsIn(m);
  const kling = input.model === 'kling-4';
  const look = input.dealer.look;
  const drag = m.grip === 'DRAG';
  const open = m.side === 'FRONT';
  // Jakob's steps keep the card back up and low along the felt until the place: a closed card, or one turned at the place.
  const alongFelt = !open || m.flipAxis === 'AT_PLACE';
  const colour = open ? 'blue' : 'yellow';
  const sideWords = open ? 'blue face' : 'yellow back';
  const where = input.place ? `${placeWords(input.place)}, ` : '';
  const scene = kling
    ? `One continuous take with a locked-off camera and no cuts. The woman in the first frame is ${look}; she sits at a green table, seen from the front, with the black card shoe fixed at the right of the picture and a yellow card in its window. She deals one card and comes back to the pose she started in.`
    : `Locked camera. ${cap(look)} sits at a green table with a black card shoe fixed at the right of the picture. One continuous, calm and natural movement from the exact first pose.`;

  // Nyp and dra: the first frame always shows the left hand on the card (anchor 2.1 or 2.2).
  const out = alongFelt ? ' down onto the felt, its yellow back up' : '';
  const pinch = "pinches the yellow card in the shoe's window between thumb and forefinger, the fingertips on the card's own upper edge and not on the shoe's rim";
  const pinched = `and draws it out of the shoe${out}: the card looks as it does in the shoe, the same size and shape, one plain rigid card.`;
  const slid = 'slides that one card straight out of the shoe, and it lies flat on the felt, yellow back up, the same size and shape as it was in the shoe.';
  const take =
    takes === 'LH'
      ? drag
        ? `${cap(LEFT)}, lies over the yellow card in the shoe's window, fingertips on the card. With the fingertips she ${slid}`
        : `${cap(LEFT)}, ${pinch}, as in the first frame, ${pinched}`
      : `${cap(LEFT)}, lets go of the yellow card and rests on the felt beside the shoe. ${cap(RIGHT)}, reaches over to the shoe and ${drag ? `lays its fingertips on the same yellow card and ${slid}` : `${pinch.replace('the yellow card', 'the same yellow card')}, ${pinched}`}`;

  // För fram, with the handover when the card changes hands.
  const toPlace = alongFelt ? `, still yellow back up, to the place where it will lie${open ? '; it is not turned in the air on the way' : ''}.` : ' towards the place where it will lie.';
  const carry = pass
    ? `The left hand ${drag ? 'slides it along the felt' : 'brings it low over the felt'} to the middle of the table in front of her body. There, low over the felt, ${RIGHT}, comes to meet it and takes the same card by its edges between thumb and fingers; the left hand lets go, and there is still only one card. The left hand goes back to the shoe, and the right hand brings the card on low over the felt${toPlace}`
    : drag
      ? `She slides it along the felt in one smooth movement${alongFelt ? `, the fingertips on top of it${toPlace}` : ` towards the place where it will lie, the fingertips on top of it.`}`
      : alongFelt
        ? `The same hand brings it forward low along the felt${toPlace}`
        : 'The same hand carries it low over the table towards the place where it will lie.';

  // Vrid and vänd upp, or not turned.
  const turn = m.turn && open ? turnSentence(m.flipAxis, m.grip, m) : 'She keeps its yellow back up all the way; the card is not turned.';

  // Lägg: a closed card slid along the felt is let go where it stops; any other card is laid flat.
  const by = ` with her ${handWord(lays)} hand`;
  const land =
    drag && !open && !pass
      ? `She stops it${by}, yellow back up, exactly where the yellow card lies in the last frame, ${where}at the same size and angle, lifts her fingertips off it, and the card stays there.`
      : `She lays it flat${by}, ${sideWords} up, exactly where the ${colour} card lies in the last frame, ${where}at the same size and angle, lets go of it, and the card stays there.`;

  const next = drag ? "comes to rest over the next yellow card in the shoe's window" : 'pinches the next yellow card';
  const back =
    takes === 'LH' && !pass
      ? drag
        ? "Then her left hand goes back the same way and comes to rest over the next yellow card in the shoe's window, exactly as in the first frame."
        : 'Then her left hand returns to the shoe and pinches the next yellow card, exactly as in the first frame.'
      : `Then her right hand goes back to rest on the table where it lay in the first frame, and her left hand, ${pass ? 'already back at the shoe' : 'at the shoe'}, ${next}, exactly as in the first frame.`;
  const other =
    pass
      ? 'Her right hand, at the left of the picture, rests on the table until it comes to take the card; the card passes from one hand to the other once, low in front of her.'
      : takes === 'LH'
        ? 'Her right hand, at the left of the picture, rests on the table the whole time.'
        : 'Her left hand waits by the shoe and holds no card while her right hand deals.';
  const card = open ? 'Only one card moves; it is solid yellow on its back and solid blue on its face.' : 'Only one card moves; its back is solid yellow, and its face never shows.';
  const end = kling ? 'She ends exactly as in the last frame.' : 'The clip ends in exactly the pose of the last image, which is the first pose again with the card lying on the table.';

  const parts: Part[] = [
    { text: scene, from: [] },
    { text: take, from: ['hand'] },
    { text: carry, from: [...(pass ? (['hand'] as Choice[]) : []), ...(alongFelt ? ([open ? 'turn' : 'side'] as Choice[]) : [])] },
    { text: turn, from: open ? ['turn'] : ['side'] },
    { text: land, from: ['side', 'place', 'hand'] },
    { text: back, from: ['hand'] },
    { text: other, from: ['hand'] },
    { text: card, from: ['side'] },
    { text: end, from: [] },
    { text: input.extra?.trim() || '', from: ['extra'] },
    { text: bansFor(m), from: ['bans'] },
  ];
  return { template: `film-giv@${TEMPLATE_VERSION}`, text: joined(parts), parts };
}

function entryText(input: PromptInput, to: '2.1' | '2.2'): Prompt {
  const reach =
    to === '2.1'
      ? "She calmly lifts her left hand, at the right of the picture, reaches to the shoe and pinches the top of the yellow card in the shoe's window between thumb and forefinger, settling exactly into the pose of the last image."
      : "She calmly lifts her left hand, at the right of the picture, reaches to the shoe and lays it over the yellow card in the shoe's window, fingertips resting flat on the card, settling exactly into the pose of the last image.";
  const parts: Part[] = [
    { text: `Locked camera. ${cap(input.dealer.look)} sits at a green table with a black card shoe fixed at the right of the picture, a yellow card in its window. One continuous, calm and natural movement from the exact first pose, both hands resting on the felt.`, from: [] },
    { text: reach, from: [] },
    { text: 'The yellow card stays seated in the shoe; nothing is dealt. Her right hand, at the left of the picture, rests on the table the whole time.', from: [] },
    { text: input.extra?.trim() || '', from: ['extra'] },
    { text: BANS_FILM, from: ['bans'] },
  ];
  return { template: `film-ingang@${TEMPLATE_VERSION}`, text: joined(parts), parts };
}

function restText(input: PromptInput): Prompt {
  const parts: Part[] = [
    { text: `Locked camera. ${cap(input.dealer.look)} sits at a green table with a black card shoe fixed at the right of the picture, both hands resting on the felt.`, from: [] },
    { text: 'She waits calmly at her table: she breathes, blinks and looks gently around, and ends exactly in the pose she started in, as in the last image. Her hands stay where they are; nothing is dealt and the yellow card stays seated in the shoe.', from: [] },
    { text: input.extra?.trim() || '', from: ['extra'] },
    { text: BANS_FILM, from: ['bans'] },
  ];
  return { template: `film-vila@${TEMPLATE_VERSION}`, text: joined(parts), parts };
}

/** The text for an order, the template it came from ("film-giv@3") and its parts with the choices they come from. */
export function promptFor(input: PromptInput): Prompt {
  switch (input.step) {
    case 'ANKARE-2.1':
    case 'ANKARE-2.2':
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

/**
 * The text of a stored order from its own choices: the place where its last picture drew the card, else the plan's point
 * for the card (`planPlace`). The store writes it with this; "Det här skickas" marks its parts with it.
 */
export function orderPrompt(
  order: { step: { key: StepKey }; motion: (DealMotion & { target?: string | null }) | null; generation: { model: string }; pictures: readonly { goesAs: string; drawn?: { centre: [number, number] } | null }[]; prompt: { extra: string | null } },
  dealer: Dealer,
  planPlace: { x: number; y: number } | null,
): Prompt {
  const drawn = order.pictures.find((p) => p.goesAs === 'endFrame')?.drawn ?? null;
  const place = drawn ? { x: drawn.centre[0], y: drawn.centre[1] } : planPlace;
  const m = order.motion;
  return promptFor({
    dealer, step: order.step.key, model: order.generation.model,
    motion: m ? { grip: m.grip, hand: m.hand, pass: !!m.pass, turn: m.turn, flipAxis: m.flipAxis, side: m.side } : null,
    place, extra: order.prompt.extra,
  });
}
