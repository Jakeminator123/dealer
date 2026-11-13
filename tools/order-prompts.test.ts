// Offline tests for the order texts (src/order-prompts.ts): the long text (Utförlig, template 3: scene + action + bans,
// the three turns, the hand chosen in every sentence that names a hand, the bans too, closed to closed for both grips, the
// place words), the short and minimal texts of template 4 (no look, no bans, no negations, the turn said once, every
// choice still shaping the short text), returns from the landing picture, a deal bara dit, the reference sentence, the
// parts a choice made, the stills made as edits of the dealer's own picture, the place words of template 5 and the card's
// two sides by colour of template 6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { BANS_FILM, BANS_STILL, LONG_VERSION, SAY, TEMPLATE_VERSION, bansFor, handsIn, orderPrompt, placeWords, promptFor, turnSentence, whereShort, wordCount, type DealMotion } from '../src/order-prompts.ts';
import { STEPS, TEXT_STYLES, type StepKey, type TextStyle } from '../src/order-model.ts';

const paow = { name: 'Paow', look: 'a young, slim woman in a black blazer' };
const deal = (step: 'GIV-2.1' | 'GIV-2.2', m: Partial<DealMotion>, place = { x: 856.6, y: 1101.4 }, extra: string | null = null) => {
  const motion: DealMotion = { grip: step === 'GIV-2.1' ? 'PINCH' : 'DRAG', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT', ...m };
  motion.turn = motion.side === 'FRONT';
  return promptFor({ dealer: paow, step, model: step === 'GIV-2.1' ? 'kling-4' : 'wan3', place, motion, extra, style: 'UTFÖRLIG' });
};
const sentences = (text: string) => text.split(/(?<=\.) (?=[A-Z])/);

test('every Utförlig text ends with what must not happen, a short or minimal one has no ban and no look; the parts make the text', () => {
  for (const step of STEPS) for (const style of TEXT_STYLES) {
    if (step.styles && !step.styles.includes(style)) continue; // a step made after template 3 has no long text
    const motion = step.card ? { grip: step.grip ?? 'PINCH', hand: 'LH' as const, pass: false, turn: true, flipAxis: 'FREE' as const, side: 'FRONT' as const } : null;
    const { text, template, parts, style: written } = promptFor({ dealer: paow, step: step.key as StepKey, model: step.model, place: { x: 852, y: 1101 }, motion, style });
    const at = `${step.key} ${style} (${template})`;
    assert.equal(parts.filter((p) => p.text).map((p) => p.text).join(' '), text, `${at}: the parts are the text`);
    if (style === 'UTFÖRLIG') {
      assert.equal(written, 'UTFÖRLIG', at);
      const bans = step.kind === 'STILL' ? BANS_STILL : step.card && step.start !== 'LAND' ? bansFor(motion) : BANS_FILM;
      assert.ok(text.endsWith(bans), at);
      assert.deepEqual(parts.filter((p) => p.text).at(-1)!.from, ['bans']);
      assert.match(template, step.start === 'LAND' ? new RegExp(`^film-retur@${TEMPLATE_VERSION}$`) : new RegExp(`@${LONG_VERSION}$`), `${at}: template 3's own text where there is one`);
    } else {
      const expected = step.kind === 'STILL' ? 'KORT' : style; // a still has no minimal text
      assert.equal(written, expected, at);
      assert.equal(template.split('@')[1], String(TEMPLATE_VERSION));
      assert.match(template, new RegExp(`-${expected === 'KORT' ? 'kort' : 'minimal'}@${TEMPLATE_VERSION}$`), at);
      assert.doesNotMatch(text, /Nothing of this happens|\bnot\b|\bno\b|\bnever\b|n't|without/i, `${at}: positive statements only`);
      assert.doesNotMatch(text, /blonde|blazer|black blazer|young/, `${at}: nothing of her look`);
    }
  }
  assert.equal(TEMPLATE_VERSION, 8);
  assert.equal(LONG_VERSION, 3);
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
  const extra = promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', extra: '  She smiles. ', motion, style: 'UTFÖRLIG' }).text;
  assert.ok(extra.endsWith(`She smiles. ${bansFor(motion)}`), 'the free addition goes before the bans');
});

test('a stored order gets its text from the same function as the sheet: the drawn card\'s place, else the plan\'s', () => {
  const motion = { grip: 'DRAG' as const, hand: 'LH' as const, pass: true, turn: true, flipAxis: 'FREE' as const, side: 'FRONT' as const, target: 'P1.C1' };
  const order = { step: { key: 'GIV-2.2' as const }, motion, generation: { model: 'wan3' }, pictures: [{ goesAs: 'endFrame', drawn: null }], prompt: { extra: null } };
  const sheet = promptFor({ dealer: paow, step: 'GIV-2.2', model: 'wan3', motion, place: { x: 236.4, y: 979.8 }, style: 'UTFÖRLIG' });
  assert.equal(orderPrompt(order, paow, { x: 236.4, y: 979.8 }).text, sheet.text);
  const drawn = { ...order, pictures: [{ goesAs: 'endFrame', drawn: { centre: [236.4, 979.8] as [number, number] } }] };
  assert.equal(orderPrompt(drawn, paow, null).text, sheet.text);
  assert.equal(orderPrompt({ ...order, motion: { ...motion, pass: undefined as unknown as boolean } }, paow, null).text.includes('takes the same card by its edges'), false, 'an older order without pass is read as left all the way');
});

test('the stills: an edit of @anchor, only the left arm and hand change, @pose a cut-out of a hand, the pinch on the card itself', () => {
  const a21 = promptFor({ dealer: paow, step: 'ANKARE-2.1', model: 'nano-banana-pro', style: 'UTFÖRLIG' }).text;
  assert.match(a21, /^This is an edit of the picture @anchor\./);
  assert.match(a21, /Change only her left arm and hand/);
  assert.match(a21, /holds the yellow card itself between thumb and forefinger at its upper edge: the fingertips are on the card, not on the shoe's rim/);
  assert.match(a21, /drawn the card a little out of the window so that her grip on it is plain to see/);
  assert.match(a21, /@pose is a cut-out on plain green: it shows only a left forearm in a black sleeve, cut off at the elbow, and its hand at the yellow card of the black card shoe, the same window shoe that stands at the right in @anchor/);
  assert.match(a21, /Take from @pose only where the hand is and how the wrist and fingers hold the card/);
  assert.match(a21, /elbows hang free/);
  assert.doesNotMatch(a21, /Pamela|in exactly the pose of the dealer's left hand/);
  // 2.2: the pose is a forearm and hand laid on the dealer's own shoe; its little finger rests on the shoe beside the window.
  const a22 = promptFor({ dealer: paow, step: 'ANKARE-2.2', model: 'nano-banana-pro', style: 'UTFÖRLIG' }).text;
  assert.match(a22, /the tips of her index, middle and ring fingers resting flat on the card itself, not on the gold frame of the window, and her little finger on the shoe beside the window/);
  assert.match(a22, /the same window shoe that stands at the right in @anchor/);
  for (const text of [a21, a22]) assert.doesNotMatch(text, /open front|do not copy/, 'nothing is said of another shoe');
});

test('place words follow the script the bank was ordered with', () => {
  assert.equal(placeWords({ x: 852, y: 1101 }), 'in the middle of the picture');
  assert.equal(placeWords({ x: 1468, y: 951 }), 'close to her body, far to the right of the picture');
  assert.equal(placeWords({ x: 669, y: 1045 }), 'to the left of the middle of the picture');
});

test('the short text: the movement in order, the turn said once with the wrist, the thumb and the edge on the felt; every choice shapes it', () => {
  const kort = (step: 'GIV-2.1' | 'GIV-2.2', m: Partial<DealMotion>, extra: Partial<Parameters<typeof promptFor>[0]> = {}) => {
    const motion: DealMotion = { grip: step === 'GIV-2.1' ? 'PINCH' : 'DRAG', hand: 'LH', pass: false, turn: true, flipAxis: 'AT_PLACE', side: 'FRONT', ...m };
    motion.turn = motion.side === 'FRONT';
    return promptFor({ dealer: paow, step, model: 'kling-4', motion, style: 'KORT', ...extra });
  };
  const a = kort('GIV-2.1', {});
  assert.equal(a.text, [SAY.camera, `${SAY.handAtShoe} ${SAY.pinchOut} and ${SAY.carryBack}.`, SAY.turnAtPlace, SAY.backPinch, SAY.otherRests, SAY.oneCardMoves].join(' '));
  assert.ok(wordCount(a.text) < 140, `short: ${wordCount(a.text)} words`);
  // The turn, once: the wrist's direction, the thumb before and after, the long edge that stays on the felt.
  assert.match(SAY.turnAtPlace, /thumb slides under the long edge nearest it/);
  assert.match(SAY.turnAtPlace, /wrist turns thumb side up/);
  assert.match(SAY.turnAtPlace, /opposite long edge, which stays on the felt/);
  assert.match(SAY.turnAtPlace, /thumb comes over onto the blue face\.$/);
  assert.equal(a.text.split(/turns|rolls over/).length - 1, 2, 'one sentence turns the card: its wrist and its roll');
  // Closed: no turn sentence at all; a slid card is let go where it stops.
  const closed = kort('GIV-2.2', { side: 'BACK' }).text;
  assert.doesNotMatch(closed, /turn|roll|blue side/);
  assert.match(closed, /drags it flat along the felt under its fingertips, yellow side up, to its place\. She stops it there, yellow side up, and lifts her fingertips off it\./);
  assert.match(closed, /rests over the next card in the window\./);
  // On the way: free or rolled about the long side.
  assert.match(kort('GIV-2.1', { flipAxis: 'FREE' }).text, /carries it low over the felt towards its place\. On the way her hand turns the card over once, holding it the whole time, and lays it flat at its place/);
  assert.match(kort('GIV-2.1', { flipAxis: 'LONG_EDGE' }).text, /rolls over once about its long side/);
  // The hand: the other hand reaches across; handbyte gives it over in front of her.
  const right = kort('GIV-2.1', { hand: 'RH' }).text;
  assert.match(right, /Her hand at the shoe lets go of the card and waits beside the shoe, and her other hand reaches across to the shoe/);
  assert.match(right, /the hand that laid it glides back/);
  assert.doesNotMatch(right, /The other hand rests/);
  assert.match(kort('GIV-2.2', { pass: true, flipAxis: 'FREE' }).text, /where her other hand takes it by its edges and carries it on low over the felt towards its place/);
  // Bara dit: it ends at the card on the landing picture.
  const oneWay = kort('GIV-2.1', {}, { oneWay: true });
  assert.match(oneWay.text, /Her hand ends at the card, as in the last frame\./);
  assert.doesNotMatch(oneWay.text, /glides back/);
  assert.deepEqual(oneWay.parts.find((p) => p.text === SAY.endAtCard)!.from, ['shape']);
  // A reference film: one sentence, in every style.
  for (const style of TEXT_STYLES) {
    const p = promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', motion: { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'AT_PLACE', side: 'FRONT' }, style, reference: true });
    assert.equal(p.text.split(SAY.reference).length, 2, style);
    assert.deepEqual(p.parts.find((x) => x.text === SAY.reference)!.from, ['reference']);
  }
});

test('the minimal text, the returns, the entry and the rest in the new styles', () => {
  const m: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'AT_PLACE', side: 'FRONT' };
  const min = promptFor({ dealer: paow, step: 'GIV-2.1', model: 'wan3', motion: m, style: 'MINIMAL' });
  assert.equal(min.text, "Locked camera. The card's back is yellow and its face is blue. One card goes from the shoe to where the last frame shows it, and the hand comes back to its pose in the first frame.");
  assert.equal(promptFor({ dealer: paow, step: 'GIV-2.1', model: 'wan3', motion: { ...m, hand: 'RH', flipAxis: 'FREE' }, style: 'MINIMAL' }).text, min.text, 'nothing about how');
  assert.match(promptFor({ dealer: paow, step: 'GIV-2.1', model: 'wan3', motion: m, style: 'MINIMAL', oneWay: true }).text, /shows it\.$/);
  // Returns: from the landing picture, low and open, to the pinch, over the shoe, or to rest.
  const back = (step: StepKey, style: TextStyle, motion: DealMotion = m) => promptFor({ dealer: paow, step, model: 'wan3', motion, style });
  assert.equal(back('RETUR-2.1', 'KORT').text, `${SAY.camera} ${SAY.liftOff('blue')} ${SAY.glideTo['2.1']} ${SAY.otherRests}`);
  assert.match(back('RETUR-2.2', 'KORT').text, /comes to rest over the next yellow card, fingertips flat on it/);
  assert.match(back('RETUR-1', 'KORT', { ...m, side: 'BACK' }).text, /lift off the yellow card.*comes to rest flat on the felt/);
  assert.match(back('RETUR-2.1', 'KORT', { ...m, hand: 'RH' }).text, /her other hand, at the shoe, takes the top edge of the next yellow card/);
  assert.match(back('RETUR-2.1', 'UTFÖRLIG').text, /^Locked camera\. A young, slim woman.*Her left hand, at the right of the picture, lifts off the blue card.*Nothing of this happens/);
  assert.equal(back('RETUR-2.1', 'MINIMAL').text, `${SAY.cameraMinimal} ${SAY.colours} ${SAY.leaveCard}`);
  // The entry: the forefinger touches only the card's upper edge.
  const entry = promptFor({ dealer: paow, step: 'INGANG-2.1', model: 'wan3', style: 'KORT' }).text;
  assert.match(entry, /the forefinger touching only that edge/);
  assert.match(entry, /Her eyes follow her hand down to the shoe and come back up\./, 'her eyes move (Jakob: hon rör inte blicken)');
  assert.doesNotMatch(entry, /rim|frame of the window/);
  // The rest: the fixed part only starts and ends in the first picture; the addition says what happens.
  const nod = promptFor({ dealer: paow, step: 'VILA', model: 'wan3', style: 'KORT', extra: 'She nods once.' });
  assert.equal(nod.text, `${SAY.camera} ${SAY.rest} She nods once.`);
  assert.doesNotMatch(nod.text, /looks gently around|hands stay where they are/);
});

test('every order on disk keeps reproducing its text and template: the long text is Utförlig and unchanged', async () => {
  const { dealers } = JSON.parse(await readFile('data/dealers.json', 'utf8'));
  for (const name of (await readdir('data/orders')).filter((f) => f.endsWith('.json'))) {
    const order = JSON.parse(await readFile(`data/orders/${name}`, 'utf8'));
    if (order.kind === 'STILL' && order.approval) continue; // a still approved on an older wording keeps its frozen text
    const dealer = dealers.find((d: { id: string }) => d.id === order.dealer);
    const p = orderPrompt(order, dealer, null, { asStored: true }); // with the version it was written with (template 4, 5 or 6)
    assert.equal(p.template, order.prompt.template, `${order.id}: template`);
    assert.equal(p.style, order.prompt.style ?? 'UTFÖRLIG', `${order.id}: style`);
    // The place words come from the drawn card; a deal without one (bara dit) is checked in the studio's test with the plan.
    if (order.pictures.some((x: { drawn?: unknown }) => x.drawn) || !order.motion || order.prompt.style !== 'UTFÖRLIG' && order.prompt.style) assert.equal(p.text, order.prompt.text, `${order.id}: text`);
  }
});

test('the dealers named in the register of dealers have a look for the texts', async () => {
  const { dealers } = JSON.parse(await readFile('data/dealers.json', 'utf8'));
  assert.deepEqual(dealers.map((d: { id: string }) => d.id), ['pamela', 'paow']);
  for (const d of dealers) assert.ok(d.look.length > 40 && !/[.]$/.test(d.look), d.id);
  assert.match(dealers[1].look, /black tailored blazer/);
});

test('a card drawn larger than the plan: no sentence says it keeps its size; the long text says it lands at the size of the last frame', () => {
  const m: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'AT_PLACE', side: 'FRONT' };
  for (const flipAxis of ['AT_PLACE', 'FREE'] as const) for (const grip of ['PINCH', 'DRAG'] as const) {
    const long = promptFor({ dealer: paow, step: grip === 'PINCH' ? 'GIV-2.1' : 'GIV-2.2', model: 'kling-4', motion: { ...m, grip, flipAxis }, style: 'UTFÖRLIG', cardScale: 1.5 });
    assert.doesNotMatch(long.text, /same size and shape|as it does in the shoe|keeping its size|grows or shrinks/, `${grip} ${flipAxis}`);
    assert.match(long.text, /lands at the size shown in the last frame/);
    assert.equal(long.template, `film-giv@${TEMPLATE_VERSION}`, 'not template 3\'s own text');
    assert.ok(long.text.endsWith(bansFor({ ...m, grip, flipAxis }, false)));
  }
  const plain = promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', motion: m, style: 'UTFÖRLIG', cardScale: 1 });
  assert.equal(plain.text, promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', motion: m, style: 'UTFÖRLIG' }).text, 'the plan\'s size: template 3 as it was');
  for (const style of ['KORT', 'MINIMAL'] as const) assert.doesNotMatch(promptFor({ dealer: paow, step: 'GIV-2.1', model: 'kling-4', motion: m, style, cardScale: 2 }).text, /size/, style);
});

test('template 5: the short deal says where the place is, with words of its own for every seat; a template 4 order is reproduced without them', () => {
  const dealer = { name: 'Paow', look: 'x' };
  const motion: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT' };
  const at = (x: number, version?: number) => promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', motion, place: { x, y: 1000 }, style: 'KORT', version });
  // The seven seats of the plan in bank pixels (P1 … P7), and the dealer's own card close to her.
  const seats = [237, 437, 643, 856, 1073, 1283, 1488];
  assert.equal(new Set(seats.map((x) => whereShort({ x, y: 1000 }))).size, 7, 'no two seats share their words');
  assert.match(at(237).text, /towards its place at the far left of the picture, where the last frame shows it\./);
  assert.match(at(856).text, /its place in the middle of the picture, where the last frame shows it/);
  assert.match(at(1488).text, /its place at the far right of the picture, in front of the shoe, where the last frame shows it/);
  assert.match(whereShort({ x: 850, y: 927 }), /^close in front of her, in the middle of the picture/);
  const closed = promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', motion: { ...motion, turn: false, flipAxis: null, side: 'BACK' }, place: { x: 237, y: 1000 }, style: 'KORT' });
  assert.match(closed.text, /flat and yellow side up, to its place at the far left of the picture, where the last frame shows it\. She stops it there/);
  assert.equal(at(237).template, `film-giv-kort@${TEMPLATE_VERSION}`);
  // Rounds 2 and 3 were written with template 4 ("to its place" alone): reproduced as they were, under their own name.
  const old = at(237, 4);
  assert.doesNotMatch(old.text, /far left|last frame shows/);
  assert.match(old.text, /towards its place\./);
  assert.equal(old.template, 'film-giv-kort@4');
});

test('the steps a round needs that Beställ could not order before: the way out and the hole card\'s turn, short and minimal only', () => {
  const dealer = { name: 'Paow', look: 'a young, slim woman in a black blazer' };
  const out = promptFor({ dealer, step: 'UTGANG', model: 'wan3', style: 'KORT' });
  assert.equal(out.text, "Locked camera, one continuous shot. Her thumb and forefinger let the yellow card settle back into the shoe's window, and her hand comes back low over the felt, palm down, and rests flat on the felt, as in the last frame. Her eyes come up from the shoe towards the players. The other hand rests on the felt.");
  assert.equal(out.template, `film-utgang-kort@${TEMPLATE_VERSION}`);
  // The hole card lies where the plan lays D.C2 (x 912, y 927 in bank pixels): close in front of her, in the middle.
  const turn = promptFor({ dealer, step: 'HALKORT', model: 'wan3', style: 'KORT', place: { x: 912.9, y: 927.3 } });
  assert.equal(turn.text, `Locked camera, one continuous shot. Her hand nearest the shoe goes low over the felt to the yellow card lying close in front of her, in the middle of the picture, where the last frame shows it. ${SAY.turnAtPlace} Her open hand glides back low over the felt, palm down, and comes to rest flat on the felt. The other hand rests on the felt. Only one card moves; its back is yellow and its face is blue.`);
  assert.equal(turn.template, `film-halkort-kort@${TEMPLATE_VERSION}`);
  assert.deepEqual(turn.parts.filter((p) => p.text).map((p) => p.from), [[], ['place'], ['turn'], [], [], []]);
  for (const p of [out, turn]) {
    assert.ok(wordCount(p.text) <= 120, `${p.template}: ${wordCount(p.text)} words`);
    assert.equal(sentences(p.text).filter((s) => /turns|rolls over/.test(s)).length, p === turn ? 1 : 0, 'one turn, said once');
  }
  const minimal = promptFor({ dealer, step: 'HALKORT', model: 'wan3', style: 'MINIMAL', place: { x: 912.9, y: 927.3 } });
  assert.equal(minimal.text, "Locked camera. The card's back is yellow and its face is blue. One card in front of her turns from yellow to blue, as in the last frame, and her hand goes back to rest.");
  assert.equal(promptFor({ dealer, step: 'UTGANG', model: 'wan3', style: 'MINIMAL' }).text, 'Locked camera. Her hand goes from the yellow card in the shoe back to the table, as in the last frame.');
  // No long text: asked for one, they are written short.
  assert.equal(promptFor({ dealer, step: 'UTGANG', model: 'wan3', style: 'UTFÖRLIG' }).style, 'KORT');
  assert.deepEqual(STEPS.find((s) => s.key === 'HALKORT')!.styles, ['KORT', 'MINIMAL']);
  // The hole card's deal is a deal like any other: it lands closed, said with its place. From template 7 a closed card
  // from the pinch is laid on the felt in front of the shoe and slid (round 6: carried, it tilted and changed size).
  const closedM: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: false, flipAxis: null, side: 'BACK' };
  const hole = promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', style: 'KORT', motion: closedM, place: { x: 912.9, y: 927.3 } });
  assert.ok(hole.text.startsWith(`${SAY.camera} Her hand at the shoe draws the yellow card out of the window, lays it flat on the felt in front of the shoe and slides it under her fingertips, flat and yellow side up, to its place close in front of her, in the middle of the picture, where the last frame shows it. She stops it there and lifts her fingertips off it. ${SAY.backPinch} ${SAY.otherRests} ${SAY.oneCardMoves}`), hole.text);
  assert.doesNotMatch(hole.text, /carries|lifts it off the felt|turns the card|blue face up/);
  assert.deepEqual(hole.parts.filter((p) => p.text).map((p) => p.from).slice(1, 3), [['hand', 'place', 'side'], ['side']]);
  // The other hand reaching across slides it the same way; a handover and the slid grip keep their words; template 6 carried it.
  assert.match(promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', style: 'KORT', motion: { ...closedM, hand: 'RH' }, place: { x: 912.9, y: 927.3 } }).text, /reaches across to the shoe, draws the yellow card out of the window, lays it flat on the felt in front of the shoe and slides it/);
  assert.doesNotMatch(promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', style: 'KORT', motion: { ...closedM, pass: true }, place: { x: 912.9, y: 927.3 } }).text, /in front of the shoe and slides/);
  assert.match(promptFor({ dealer, step: 'GIV-2.2', model: 'wan3', style: 'KORT', motion: { ...closedM, grip: 'DRAG' }, place: { x: 912.9, y: 927.3 } }).text, /drags it flat along the felt under its fingertips, yellow side up, to its place .*\. She stops it there, yellow side up, and lifts her fingertips off it\./);
  assert.match(promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', style: 'KORT', motion: closedM, place: { x: 912.9, y: 927.3 }, version: 6 }).text, /carries it low over the felt, yellow side up, to its place close in front of her, in the middle of the picture, where the last frame shows it\. She lays it flat there, yellow side up\./);
});

test('template 6 alone: the card\'s two sides said by colour and by which one is up, never back or face; before and after, back and face', async () => {
  const dealer = { name: 'Paow', look: 'x' };
  const motion: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'AT_PLACE', side: 'FRONT' };
  const closedMotion: DealMotion = { ...motion, turn: false, flipAxis: null, side: 'BACK' };
  const write = (m: DealMotion, style: TextStyle, extra: Partial<Parameters<typeof promptFor>[0]> = {}) => promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', motion: m, place: { x: 1073, y: 1000 }, style, version: 6, ...extra });
  // Jakob 2026-11-13: "Baksida kan betyda olika saker, som baksidan på ett kort, men det kan också referera till undersidan."
  // ("in front of her", "in front of the shoe" say a place, "frontal studio light" the still's light, not a side.)
  const aboutTheCard = /\b(its|card's) (back|face|front)\b|\b(blue|yellow) (back|face|front)\b|\bfront\b(?! of)|underside|reverse/i;
  const open = write(motion, 'KORT');
  assert.ok(open.text.endsWith('Only one card moves. It is yellow on one side and blue on the other: yellow side up when it leaves the shoe, blue side up when it lies at its place.'), open.text);
  assert.match(open.text, /her thumb comes over onto the blue side\./);
  assert.equal(open.template, 'film-giv-kort@6');
  assert.deepEqual(open.parts.find((p) => p.text.startsWith('Only one card moves.'))!.from, ['side'], 'which colour ends up follows the side it lands with');
  const closed = write(closedMotion, 'KORT');
  assert.ok(closed.text.endsWith('Only one card moves. It is yellow on one side and blue on the other, and it stays yellow side up the whole way.'), closed.text);
  assert.match(closed.text, /carries it low over the felt, yellow side up, to its place .*\. She lays it flat there, yellow side up\./, 'carried, as template 6 said it');
  const minOpen = write(motion, 'MINIMAL'), minClosed = write(closedMotion, 'MINIMAL');
  assert.match(minOpen.text, /^Locked camera\. The card is yellow on one side and blue on the other: yellow side up when it leaves the shoe, blue side up when it lies at its place\. One card goes/);
  assert.match(minClosed.text, /^Locked camera\. The card is yellow on one side and blue on the other, and it stays yellow side up the whole way\. One card goes/);
  assert.equal(minOpen.template, 'film-giv-minimal@6');
  const reveal = promptFor({ dealer, step: 'HALKORT', model: 'wan3', style: 'KORT', place: { x: 912.9, y: 927.3 }, version: 6 });
  assert.ok(reveal.text.endsWith('Only one card moves. It is yellow on one side and blue on the other: it lies yellow side up, and after the turn it lies blue side up.'));
  assert.equal(promptFor({ dealer, step: 'RETUR-2.1', model: 'wan3', motion, style: 'MINIMAL', version: 6 }).text, `${SAY.cameraMinimal} The card is yellow on one side and blue on the other: it lies blue side up. ${SAY.leaveCard}`);
  // Every template-6 text in Kort and Minimal, of every step, says nothing of a back or a face of the card.
  for (const step of STEPS) for (const style of ['KORT', 'MINIMAL'] as const) for (const m of [motion, closedMotion]) {
    const p = promptFor({ dealer, step: step.key as StepKey, model: step.model, motion: step.card ? m : null, place: { x: 1073, y: 1000 }, style, version: 6 });
    assert.doesNotMatch(p.text, aboutTheCard, `${step.key} ${style}`);
    assert.match(p.template, /@6$/, `${step.key} ${style}`);
  }
  for (const p of [open, closed, minOpen, minClosed, write(motion, 'KORT', { reference: true }), write({ ...motion, flipAxis: 'FREE' }, 'KORT', { oneWay: true })]) assert.doesNotMatch(p.text, aboutTheCard);
  // The long text (template 3) is left as it was.
  assert.match(write(motion, 'UTFÖRLIG').text, /solid yellow on its back and solid blue on its face/);
  // Template 5 and template 7 on say back and face: one two-sided object (round 6: template 6 failed at the turn).
  for (const version of [5, undefined]) {
    const p = write(motion, 'KORT', { version });
    assert.ok(p.text.endsWith('Only one card moves; its back is yellow and its face is blue.'), String(version));
    assert.match(p.text, /onto the blue face\./);
    assert.deepEqual(p.parts.find((x) => x.text === SAY.oneCardMoves)!.from, []);
    assert.equal(write(motion, 'MINIMAL', { version }).text.split(SAY.colours).length, 2);
  }
  assert.equal(write(motion, 'KORT', { version: 5 }).template, 'film-giv-kort@5');
  // A stored one, word for word: round 5c's P1 deal (Kling 4 with a reference film), stored with template 5.
  const { dealers } = JSON.parse(await readFile('data/dealers.json', 'utf8'));
  const order = JSON.parse(await readFile('data/orders/paow-giv-2-1-p1-08.json', 'utf8'));
  assert.equal(order.prompt.template, 'film-giv-kort@5');
  const again = orderPrompt(order, dealers.find((d: { id: string }) => d.id === order.dealer), null, { asStored: true });
  assert.equal(again.text, order.prompt.text);
  assert.equal(again.template, 'film-giv-kort@5');
  const today = orderPrompt(order, dealers.find((d: { id: string }) => d.id === order.dealer), null);
  assert.deepEqual([today.text, today.template], [order.prompt.text, `film-giv-kort@${TEMPLATE_VERSION}`], 'an open deal turned at the place: template 8 says it as template 5 did');
  // The five stored on template 6 keep their words.
  for (const id of ['paow-giv-2-1-p5-04', 'paow-giv-2-1-p6-04', 'paow-giv-2-1-d-c2-01', 'paow-giv-2-1-d-c2-02', 'paow-halkort-01']) {
    const o = JSON.parse(await readFile(`data/orders/${id}.json`, 'utf8'));
    const p = orderPrompt(o, dealers.find((d: { id: string }) => d.id === o.dealer), null, { asStored: true });
    assert.deepEqual([p.text, p.template, p.template.endsWith('@6')], [o.prompt.text, o.prompt.template, true], id);
  }
});

test('template 7: she moved a little as she dealt (template 7 alone); after two hands the arm out at the card comes back; older orders keep their words', async () => {
  const dealer = { name: 'Paow', look: 'x' };
  const m: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT' };
  const kort = (motion: DealMotion, extra: Partial<Parameters<typeof promptFor>[0]> = {}) => promptFor({ dealer, step: motion.grip === 'DRAG' ? 'GIV-2.2' : 'GIV-2.1', model: 'wan3', motion, place: { x: 1073, y: 1000 }, style: 'KORT', version: 7, ...extra });
  // Her own hand out and back: she moves a little, and the other hand is no longer held still.
  const own = kort(m);
  assert.ok(own.text.includes(`${SAY.backPinch} ${SAY.moveOwn} ${SAY.oneCardMoves}`), own.text);
  assert.doesNotMatch(own.text, /The other hand rests on the felt\./);
  assert.deepEqual(own.parts.find((p) => p.text === SAY.moveOwn)!.from, ['hand']);
  assert.equal(own.template, 'film-giv-kort@7');
  // A handover: the right hand laid it and goes back to where it lay; the left, which gave it, goes back to the shoe.
  for (const drag of [false, true]) {
    const pass = kort({ ...m, pass: true, grip: drag ? 'DRAG' : 'PINCH' });
    assert.ok(pass.text.includes(`${SAY.backPass(drag)} ${SAY.moveBoth} ${SAY.oneCardMoves}`), pass.text);
    assert.match(pass.text, /Then the hand that laid it glides back low over the felt, palm down, to where it lay in the first frame, and the hand that gave it goes back to the shoe and (takes the next card|rests over the next card in the window)\./);
    assert.doesNotMatch(pass.text, /her hand at the shoe (takes|rests)|her other hand shifts/);
  }
  // Her other hand reaches across and lays it: it goes back to where it lay, the hand waiting at the shoe takes the next card.
  const right = kort({ ...m, hand: 'RH' });
  assert.ok(right.text.includes(`${SAY.backOther(false)} ${SAY.moveBoth}`), right.text);
  // Bara dit: the end on the landing picture, with her body as she deals.
  assert.ok(kort(m, { oneWay: true }).text.includes(`${SAY.endAtCard} ${SAY.moveOwn}`));
  // The minimal deal says nothing of how; the rest, the entry and the way out keep their texts.
  assert.doesNotMatch(promptFor({ dealer, step: 'GIV-2.1', model: 'wan3', motion: m, style: 'MINIMAL' }).text, /As she deals/);
  // A return to rest after her right hand laid the card: the left comes from the shoe to rest as well.
  const ret = (motion: DealMotion, step: StepKey, version?: number) => promptFor({ dealer, step, model: 'wan3', motion, style: 'KORT', version }).text;
  for (const hand of [{ hand: 'RH' as const, pass: false }, { hand: 'LH' as const, pass: true }]) {
    assert.ok(ret({ ...m, ...hand }, 'RETUR-1').endsWith(`${SAY.glideTo['1']} ${SAY.otherFromShoe}`), JSON.stringify(hand));
    assert.ok(ret({ ...m, ...hand }, 'RETUR-2.1').endsWith(SAY.glideOther('2.1')));
    assert.ok(ret({ ...m, ...hand }, 'RETUR-1', 6).endsWith(`${SAY.glideTo['1']} ${SAY.otherRests}`), 'template 6 as it was');
  }
  assert.ok(ret(m, 'RETUR-1').endsWith(`${SAY.glideTo['1']} ${SAY.otherRests}`), 'after her left hand the right still rests');
  assert.ok(ret(m, 'RETUR-2.2').endsWith(`${SAY.glideTo['2.2']} ${SAY.otherRests}`));
  // Template 6 and older: the other hand rests, a handover goes back as before, under the order's own name.
  const six = kort(m, { version: 6 });
  assert.ok(six.text.includes(`${SAY.backPinch} ${SAY.otherRests} Only one card moves.`));
  assert.equal(six.template, 'film-giv-kort@6');
  assert.ok(kort({ ...m, pass: true }, { version: 6 }).text.includes(`${SAY.backOther(false)} Only one card moves.`));
  // Stored ones, word for word: round 6's P5 deal (template 6) and round 5c's P1 deal (template 5).
  const { dealers } = JSON.parse(await readFile('data/dealers.json', 'utf8'));
  for (const [id, template] of [['paow-giv-2-1-p5-04', 'film-giv-kort@6'], ['paow-giv-2-1-p1-08', 'film-giv-kort@5']]) {
    const order = JSON.parse(await readFile(`data/orders/${id}.json`, 'utf8'));
    assert.equal(order.prompt.template, template, id);
    const again = orderPrompt(order, dealers.find((d: { id: string }) => d.id === order.dealer), null, { asStored: true });
    assert.equal(again.text, order.prompt.text, id);
    assert.equal(again.template, template, id);
  }
});

test('template 8: a deal by the hand at the shoe ends on the other hand resting again; everything else of template 7 stays', async () => {
  const dealer = { name: 'Paow', look: 'x' };
  const m: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT' };
  const kort = (motion: DealMotion, extra: Partial<Parameters<typeof promptFor>[0]> = {}) => promptFor({ dealer, step: motion.grip === 'DRAG' ? 'GIV-2.2' : 'GIV-2.1', model: 'wan3', motion, place: { x: 1283, y: 1000 }, style: 'KORT', ...extra });
  // Template 7's sentence moved her, but the card went wrong in 15 of 18 takes and in three her other hand dealt it.
  const open = kort(m);
  assert.ok(open.text.includes(`${SAY.backPinch} ${SAY.otherRests} ${SAY.oneCardMoves}`), open.text);
  assert.doesNotMatch(open.text, /As she deals|shoulders|shifts a little/);
  assert.deepEqual(open.parts.find((p) => p.text === SAY.otherRests)!.from, ['hand']);
  assert.equal(open.template, 'film-giv-kort@8');
  const closed = kort({ ...m, turn: false, flipAxis: null, side: 'BACK' });
  assert.ok(closed.text.includes(`lays it flat on the felt in front of the shoe and slides it`), 'the closed card is still slid (template 7)');
  assert.ok(closed.text.includes(`${SAY.stopFlat} ${SAY.backPinch} ${SAY.otherRests} ${SAY.oneCardMoves}`), closed.text);
  // The other hand or a handover: no movement sentence, as before template 7; the way back after a handover stays.
  for (const drag of [false, true]) {
    const pass = kort({ ...m, pass: true, grip: drag ? 'DRAG' : 'PINCH' });
    assert.ok(pass.text.includes(`${SAY.backPass(drag)} ${SAY.oneCardMoves}`), pass.text);
  }
  assert.ok(kort({ ...m, hand: 'RH' }).text.includes(`${SAY.backOther(false)} ${SAY.oneCardMoves}`));
  assert.ok(kort(m, { oneWay: true }).text.includes(`${SAY.endAtCard} ${SAY.otherRests}`));
  for (const p of [open, closed, kort({ ...m, pass: true }), kort({ ...m, hand: 'RH' })]) assert.doesNotMatch(p.text, /As she deals/);
  assert.ok(promptFor({ dealer, step: 'RETUR-1', model: 'wan3', motion: { ...m, hand: 'RH' }, style: 'KORT' }).text.endsWith(SAY.otherFromShoe), 'the return to rest after the other hand stays');
  // Back to the bound a deal had before template 7.
  assert.ok(wordCount(open.text) < 140, `${wordCount(open.text)} words`);
  // Stored with template 7, word for word, under its own name: round 7's P6 deal.
  const { dealers } = JSON.parse(await readFile('data/dealers.json', 'utf8'));
  const order = JSON.parse(await readFile('data/orders/paow-giv-2-1-p6-05.json', 'utf8'));
  assert.equal(order.prompt.template, 'film-giv-kort@7');
  assert.match(order.prompt.text, /As she deals/);
  const again = orderPrompt(order, dealers.find((d: { id: string }) => d.id === order.dealer), null, { asStored: true });
  assert.deepEqual([again.text, again.template], [order.prompt.text, 'film-giv-kort@7']);
  const today = orderPrompt(order, dealers.find((d: { id: string }) => d.id === order.dealer), null);
  assert.deepEqual([today.text.includes(SAY.otherRests), today.text.includes('As she deals'), today.template], [true, false, 'film-giv-kort@8']);
});
