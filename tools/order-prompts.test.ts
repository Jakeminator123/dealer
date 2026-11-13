// Offline tests for the order texts (src/order-prompts.ts): scene + action + bans, the three turns (at the place in
// Jakob's six steps, free on the way, rolled about the long side), the hand chosen in every sentence that names a hand
// (the bans too), closed to closed for both grips, the place words, the parts a choice made, and the stills made as edits
// of the dealer's own picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BANS_FILM, BANS_STILL, TEMPLATE_VERSION, bansFor, handsIn, orderPrompt, placeWords, promptFor, turnSentence, type DealMotion } from '../src/order-prompts.ts';
import { STEPS, type StepKey } from '../src/order-model.ts';

const paow = { name: 'Paow', look: 'a young, slim woman in a black blazer' };
const deal = (step: 'GIV-2.1' | 'GIV-2.2', m: Partial<DealMotion>, place = { x: 856.6, y: 1101.4 }, extra: string | null = null) => {
  const motion: DealMotion = { grip: step === 'GIV-2.1' ? 'PINCH' : 'DRAG', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT', ...m };
  motion.turn = motion.side === 'FRONT';
  return promptFor({ dealer: paow, step, model: step === 'GIV-2.1' ? 'kling-4' : 'wan3', place, motion, extra });
};
const sentences = (text: string) => text.split(/(?<=\.) (?=[A-Z])/);

test('every template ends with what must not happen, and its parts make the text', () => {
  for (const step of STEPS) {
    const motion = step.card ? { grip: step.grip ?? 'PINCH', hand: 'LH' as const, pass: false, turn: true, flipAxis: 'FREE' as const, side: 'FRONT' as const } : null;
    const { text, template, parts } = promptFor({ dealer: paow, step: step.key as StepKey, model: step.model, place: { x: 852, y: 1101 }, motion });
    const bans = step.kind === 'STILL' ? BANS_STILL : step.card ? bansFor(motion) : BANS_FILM;
    assert.ok(text.endsWith(bans), `${step.key} (${template})`);
    assert.equal(template.split('@')[1], String(TEMPLATE_VERSION));
    assert.equal(parts.filter((p) => p.text).map((p) => p.text).join(' '), text, `${step.key}: the parts are the text`);
    assert.deepEqual(parts[parts.length - 1].from, ['bans']);
  }
  assert.equal(TEMPLATE_VERSION, 3);
  for (const ban of ['a second card', 'a finger passes through the card', 'grows or shrinks', 'hovers in the air', 'the picture cuts']) assert.ok(BANS_FILM.includes(ban), ban);
  assert.equal(bansFor(null), BANS_FILM, 'without a motion the bans are the film bans');
  assert.ok(BANS_STILL.startsWith('Nothing of this happens: the fingers rest on the shoe instead of on the card'));
});

test('the turn: at the place in Jakob\'s steps, free on the way without a fixed edge, or rolled about the long side', () => {
  const free = turnSentence('FREE');
  assert.match(free, /^On the way she turns the card over once/);
  assert.match(free, /human hand can actually make/);
  assert.match(free, /keeping its size/);
  assert.doesNotMatch(free, /long side|short edge|edge/);
  assert.match(turnSentence('LONG_EDGE'), /about its long side/);
  assert.match(turnSentence('FREE', 'DRAG'), /lifted it from the felt with her fingertips/);
  const place = turnSentence('AT_PLACE');
  assert.match(place, /^At the place the wrist of her left hand rolls: the card tilts up onto its long edge, held between thumb and fingers, and the roll goes on until its blue face is up, one edge staying near the felt/);
  assert.match(turnSentence('AT_PLACE', 'PINCH', { hand: 'LH', pass: true }), /the wrist of her right hand rolls/, 'after handbyte the right hand turns it');
  assert.match(turnSentence('LONG_EDGE', 'PINCH', { hand: 'LH', pass: true }), /her right hand holds the card the whole time/);
  assert.deepEqual(handsIn({ hand: 'LH', pass: true }), { takes: 'LH', lays: 'RH', pass: true });
  assert.deepEqual(handsIn({ hand: 'RH', pass: false }), { takes: 'RH', lays: 'RH', pass: false });
});

test('Jakob\'s six steps from 2.1: nyp, dra, för fram, vrid, vänd upp, lägg, in that order; closed goes nyp, dra, för fram, lägg', () => {
  const open = deal('GIV-2.1', { flipAxis: 'AT_PLACE' }).text;
  const at = (re: RegExp) => { const m = re.exec(open); assert.ok(m, String(re)); return m.index; };
  const steps = [
    at(/pinches the yellow card in the shoe's window between thumb and forefinger, the fingertips on the card's own upper edge and not on the shoe's rim/),
    at(/draws it out of the shoe down onto the felt, its yellow back up/),
    at(/brings it forward low along the felt, still yellow back up, to the place where it will lie; it is not turned in the air on the way/),
    at(/At the place the wrist of her left hand rolls: the card tilts up onto its long edge/),
    at(/until its blue face is up, one edge staying near the felt/),
    at(/She lays it flat with her left hand, blue face up/),
  ];
  assert.deepEqual([...steps].sort((a, b) => a - b), steps, 'the sentences follow the steps');
  assert.match(open, /the card is turned in the air on the way/, 'and the bans say so');
  for (const grip of ['GIV-2.1', 'GIV-2.2'] as const) {
    const closed = deal(grip, { side: 'BACK', flipAxis: 'AT_PLACE' }).text;
    assert.match(closed, /yellow back up, to the place where it will lie\./, `${grip}: brought forward back up`);
    assert.match(closed, /She keeps its yellow back up all the way; the card is not turned\./);
    assert.match(closed, /exactly where the yellow card lies in the last frame/);
    assert.match(closed, /its face never shows/);
    assert.match(closed, /the card shows its blue face/, `${grip}: the bans keep it closed`);
    assert.doesNotMatch(closed, /blue face (up|comes up)|turns the card over|rolls|tilts up|wrist turns/, `${grip}: nothing turns it`);
  }
  assert.match(deal('GIV-2.2', { side: 'BACK' }).text, /She stops it with her left hand, yellow back up, .* lifts her fingertips off it/, 'a slid card is let go where it stops');
});

test('the hand chosen: every sentence that names a hand follows it, the bans too', () => {
  const left = deal('GIV-2.1', {}).text;
  assert.match(left, /Her right hand, at the left of the picture, rests on the table the whole time/);
  assert.match(left, /She lays it flat with her left hand/);
  assert.match(left, /her right hand lifts from the table or touches the card/);
  assert.doesNotMatch(left, /takes the same card by its edges/);

  const pass = deal('GIV-2.2', { pass: true }, { x: 236, y: 980 });
  for (const s of [
    /There, low over the felt, her right hand, at the left of the picture, comes to meet it and takes the same card by its edges between thumb and fingers; the left hand lets go, and there is still only one card\./,
    /On the way her right hand turns the card over once/,
    /She lays it flat with her right hand, blue face up, exactly where the blue card lies in the last frame, far to the left of the picture/,
    /Then her right hand goes back to rest on the table where it lay in the first frame, and her left hand, already back at the shoe, comes to rest over the next yellow card/,
    /rests on the table until it comes to take the card; the card passes from one hand to the other once, low in front of her/,
    /the card is handed over high in front of her chest, the card is tossed or dropped between the hands, each hand holds a card of its own, the left hand lays the card on the table/,
  ]) assert.match(pass.text, s);
  assert.doesNotMatch(pass.text, /rests on the table the whole time|with her left hand,|right hand lifts from the table/);

  const right = deal('GIV-2.1', { hand: 'RH' }).text;
  assert.match(right, /Her left hand, at the right of the picture, lets go of the yellow card and rests on the felt beside the shoe\. Her right hand, at the left of the picture, reaches over to the shoe and pinches the same yellow card/);
  assert.match(right, /She lays it flat with her right hand/);
  assert.match(right, /Her left hand waits by the shoe and holds no card while her right hand deals/);
  assert.match(right, /her left hand carries the card/);
  assert.doesNotMatch(right, /rests on the table the whole time/);

  // Every sentence that names a hand names the one chosen for what it does.
  for (const [text, lays] of [[left, 'left'], [pass.text, 'right'], [right, 'right']] as const)
    for (const s of sentences(text).filter((x) => /^She lays it flat/.test(x))) assert.match(s, new RegExp(`with her ${lays} hand`));
});

test('the parts say which choice made them', () => {
  const { parts } = deal('GIV-2.2', { pass: true, side: 'FRONT' }, { x: 236, y: 980 }, 'She smiles.');
  const of = (re: RegExp) => parts.find((p) => re.test(p.text))!.from;
  assert.ok(of(/takes the same card by its edges/).includes('hand'));
  assert.deepEqual(of(/turns the card over once/), ['turn']);
  assert.deepEqual(of(/^She lays it flat/), ['side', 'place', 'hand']);
  assert.deepEqual(of(/^She smiles\.$/), ['extra']);
  const closed = deal('GIV-2.1', { side: 'BACK' }).parts;
  assert.deepEqual(closed.find((p) => /the card is not turned/.test(p.text))!.from, ['side']);
});

test('a deal: the card is taken as it looks in the shoe, lands where the last frame shows; the addition goes before the bans', () => {
  const kling = deal('GIV-2.1', {}).text;
  assert.match(kling, /^One continuous take with a locked-off camera/);
  assert.match(kling, /a young, slim woman in a black blazer/);
  assert.match(kling, /looks as it does in the shoe, the same size and shape/);
  assert.match(kling, /exactly where the blue card lies in the last frame, in the middle of the picture, at the same size and angle/);
  assert.doesNotMatch(kling, /reference picture|short edge|long side/);
  const wan = deal('GIV-2.2', { side: 'BACK' }, { x: 220, y: 997 }).text;
  assert.match(wan, /^Locked camera\. A young, slim woman/);
  assert.match(wan, /slides that one card straight out of the shoe/);
  assert.match(wan, /far to the left of the picture/);
  const motion: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT' };
  const extra = promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', extra: '  She smiles. ', motion }).text;
  assert.ok(extra.endsWith(`She smiles. ${bansFor(motion)}`), 'the free addition goes before the bans');
});

test('a stored order gets its text from the same function as the sheet: the drawn card\'s place, else the plan\'s', () => {
  const motion = { grip: 'DRAG' as const, hand: 'LH' as const, pass: true, turn: true, flipAxis: 'FREE' as const, side: 'FRONT' as const, target: 'P1.C1' };
  const order = { step: { key: 'GIV-2.2' as const }, motion, generation: { model: 'wan3' }, pictures: [{ goesAs: 'endFrame', drawn: null }], prompt: { extra: null } };
  const sheet = promptFor({ dealer: paow, step: 'GIV-2.2', model: 'wan3', motion, place: { x: 236.4, y: 979.8 } });
  assert.equal(orderPrompt(order, paow, { x: 236.4, y: 979.8 }).text, sheet.text);
  const drawn = { ...order, pictures: [{ goesAs: 'endFrame', drawn: { centre: [236.4, 979.8] as [number, number] } }] };
  assert.equal(orderPrompt(drawn, paow, null).text, sheet.text);
  assert.equal(orderPrompt({ ...order, motion: { ...motion, pass: undefined as unknown as boolean } }, paow, null).text.includes('takes the same card by its edges'), false, 'an older order without pass is read as left all the way');
});

test('the stills: an edit of @anchor, only the left arm and hand change, @pose a cut-out of a hand, the pinch on the card itself', () => {
  const a21 = promptFor({ dealer: paow, step: 'ANKARE-2.1', model: 'nano-banana-pro' }).text;
  assert.match(a21, /^This is an edit of the picture @anchor\./);
  assert.match(a21, /Change only her left arm and hand/);
  assert.match(a21, /holds the yellow card itself between thumb and forefinger at its upper edge: the fingertips are on the card, not on the shoe's rim/);
  assert.match(a21, /drawn the card a little out of the window so that her grip on it is plain to see/);
  assert.match(a21, /@pose is a cut-out on plain green: it shows only a left forearm/);
  assert.match(a21, /Take from @pose only where the hand is and how the wrist and fingers hold the card/);
  assert.match(a21, /elbows hang free/);
  assert.doesNotMatch(a21, /Pamela|in exactly the pose of the dealer's left hand/);
  const a22 = promptFor({ dealer: paow, step: 'ANKARE-2.2', model: 'nano-banana-pro' }).text;
  assert.match(a22, /the fingertips resting flat on the card itself, not on the shoe/);
  assert.match(a22, /The shoe in @pose has an open front: do not copy it/);
});

test('place words follow the script the bank was ordered with', () => {
  assert.equal(placeWords({ x: 852, y: 1101 }), 'in the middle of the picture');
  assert.equal(placeWords({ x: 1468, y: 951 }), 'close to her body, far to the right of the picture');
  assert.equal(placeWords({ x: 669, y: 1045 }), 'to the left of the middle of the picture');
});

test('the dealers named in the register of dealers have a look for the texts', async () => {
  const { dealers } = JSON.parse(await readFile('data/dealers.json', 'utf8'));
  assert.deepEqual(dealers.map((d: { id: string }) => d.id), ['pamela', 'paow']);
  for (const d of dealers) assert.ok(d.look.length > 40 && !/[.]$/.test(d.look), d.id);
  assert.match(dealers[1].look, /black tailored blazer/);
});
