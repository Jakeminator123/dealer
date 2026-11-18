// One straight line: the text that goes to Runway says each thing once (Jakob 2026-11-18: "för många val som kan leda till
// överlappande instruktioner för att skapa videos"). Built for every combination the line allows, from the same function the
// store writes a draft's text with (promptFor, src/order-prompts.ts): each step with a card, to every card of the plan, with
// the step's one recipe (data/order-methods.json) and every deliberate exception a draft can still say (the other hand,
// handbyte, a closed card, each turn, tur och retur, the minimal text, no reference film, a trial card size). It fails when
// a topic is written twice (the camera, the reference film, the grip, the path, the turn, the lay, the way back, the resting
// hand, where she looks, the card's look), when two sentences say opposite things, or when the same sentence stands twice.
// The plan is a fixture written here, so that the test does not move with what Jakob has saved in placements/default.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FLIP_AXES, MODELS, STEPS, type FlipAxis, type Shape, type StepKey, type TextStyle } from '../src/order-model.ts';
import { readMethods, recipeFor } from '../src/order-methods.ts';
import { TEMPLATE_VERSION, promptFor, type DealMotion } from '../src/order-prompts.ts';

/** Where each card of the plan lies, in bank pixels (the plan of 2026-11-11, rounded): far left to far right, the dealer's own close to her. */
const PLACES: Record<string, { x: number; y: number }> = {
  'P1.C1': { x: 237, y: 980 }, 'P2.C1': { x: 437, y: 1052 }, 'P3.C1': { x: 646, y: 1090 }, 'P4.C1': { x: 857, y: 1101 }, 'P5.C1': { x: 1067, y: 1090 }, 'P6.C1': { x: 1276, y: 1052 }, 'P7.C1': { x: 1476, y: 980 },
  'P4.C2': { x: 907, y: 1090 }, 'D.C1': { x: 850, y: 900 }, 'D.C2': { x: 912, y: 900 },
};
const dealer = { name: 'Paow', look: 'a woman in a black jacket' };
const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);

/**
 * The topics of a film's text, each with the words that say it. A topic may be said at most `max` times in one text (once,
 * but the turn's sentence also names the grip of the hand that turns, so the sentences are counted, not the words).
 */
const TOPICS: { name: string; says: RegExp; max: number }[] = [
  { name: 'kameran', says: /\bcamera\b.*\b(?:shot|take)\b|^Locked camera\.$/i, max: 1 },
  { name: 'referensfilmen', says: /\bvideo 1\b/i, max: 1 },
  { name: 'greppet ur skon', says: /\b(?:draws|slides|strokes|pinches) (?:the|that) (?:same )?(?:yellow |one )?card\b.*\b(?:out of the (?:window|shoe))/i, max: 1 },
  { name: 'vändningen', says: /\bwrist (?:rolls|turns)\b|\bturn(?:s)? (?:it|the card) over\b|\brolls over\b|\bthumb slides under\b|\bend over end\b/i, max: 1 },
  // Where the card ends: laid at its place or stopped there (a closed card laid in front of the shoe and slid is still on its way).
  { name: 'läggningen', says: /\blays (?:it|the card) flat (?:there|at its place)\b|\bstops it there\b|\bHer hand ends at the card\b/i, max: 1 },
  { name: 'vägen tillbaka', says: /\bglides back\b|\bgoes back\b|\bcomes back to its pose\b/i, max: 1 },
  { name: 'den vilande handen', says: /^The other hand rests on the felt\.$|\bsettles back at the shoe\b|^Both hands rest on the felt\.$/i, max: 1 },
  { name: 'blicken', says: /\beyes\b|\bHer head\b/i, max: 1 },
  { name: 'kortets utseende', says: /\bsolid (?:yellow|blue)\b|\bblank\b|\bplain\b|back is yellow/i, max: 1 },
];
/** Pairs that say opposite things: both in one text is a contradiction. */
const AGAINST: { name: string; a: RegExp; b: RegExp }[] = [
  { name: 'vänds på vägen och vid platsen', a: /\bOn the way\b.*\bwrist\b/i, b: /\bClose to its place\b.*\bwrist\b|\bThere her thumb slides under\b/i },
  { name: 'släpper kortet och har fingrarna kvar på det', a: /\blets go of it\b|\blifts her fingertips off it\b/i, b: /\bfingertips (?:come to rest|stay) on it\b|\bHer hand ends at the card\b/i },
  { name: 'ligger gult och ligger blått', a: /\b(?:lays|stops) (?:it|the card)[^.]*\byellow side up\b/i, b: /\b(?:lays|stops) (?:it|the card)[^.]*\bblue side up\b/i },
  { name: 'slutar vid kortet och går tillbaka', a: /\bas in the last frame\b.*$/i, b: /\bglides back low over the felt, palm down, to the shoe\b/i },
  { name: 'ett stängt kort vänds', a: /\byellow side up\b[^.]*\.$/i, b: /\bblue side opens towards the camera\b|\bends with the blue side up\b/i },
];
/** What is wrong with a film's text, in words; empty when each thing is said once and nothing against another. */
function faults(text: string, more: { oneWay: boolean; closed: boolean }): string[] {
  const out: string[] = [], all = sentences(text);
  const seen = new Set<string>();
  for (const s of all) { if (seen.has(s)) out.push(`samma mening två gånger: "${s}"`); seen.add(s); }
  for (const t of TOPICS) { const n = all.filter((s) => t.says.test(s)).length; if (n > t.max) out.push(`${t.name} sägs ${n} gånger: ${all.filter((s) => t.says.test(s)).map((s) => `"${s}"`).join(' | ')}`); }
  const says = (re: RegExp) => all.some((s) => re.test(s));
  for (const pair of AGAINST) {
    // "ends at the card and goes back" is only a contradiction in a deal bara dit; a closed card only where the card is closed.
    if (pair.name === 'slutar vid kortet och går tillbaka' && !more.oneWay) continue;
    if (pair.name === 'ett stängt kort vänds' && !more.closed) continue;
    if (says(pair.a) && says(pair.b)) out.push(`motsägelse: ${pair.name}`);
  }
  if (more.oneWay && says(/\bglides back\b|\btakes the next card\b/i)) out.push('bara dit, men texten för handen tillbaka');
  if (more.closed && says(/\bblue side up\b/i)) out.push('stängt kort, men texten säger blått upp');
  return out;
}

const DEALS = STEPS.filter((s) => s.card && s.start !== 'LAND');
type Case = { step: StepKey; target: string; motion: DealMotion; style: TextStyle; shape: Shape; reference: boolean; cardScale: number; what: string };
async function cases(): Promise<{ recipe: Case[]; exceptions: Case[] }> {
  const { register } = readMethods(JSON.parse(await readFile('data/order-methods.json', 'utf8')));
  assert.ok(register, 'the method register reads');
  const recipe: Case[] = [], exceptions: Case[] = [];
  for (const step of DEALS) for (const target of Object.keys(PLACES)) {
    const r = recipeFor(register, step.key, target);
    assert.ok(r, `${step.key} ${target}: a recipe`);
    // The plan's word where the recipe leaves the turn to Placering; the hole card lands closed.
    const closedByPlan = target === 'D.C2';
    const turns: FlipAxis[] = r.turn ? [r.turn] : [...FLIP_AXES];
    for (const flipAxis of turns) {
      const motion: DealMotion = { grip: step.grip!, hand: 'LH', pass: false, turn: !closedByPlan, flipAxis: closedByPlan ? null : flipAxis, side: closedByPlan ? 'BACK' : 'FRONT' };
      const base: Case = { step: step.key, target, motion, style: r.style, shape: r.shape!, reference: r.reference !== 'ingen' && !!MODELS[r.model].videos, cardScale: 1, what: `receptet (${flipAxis})` };
      recipe.push(base);
      // The exceptions a draft can still say against its recipe, one at a time and the hands with every turn.
      for (const axis of FLIP_AXES) for (const hands of [{ hand: 'LH' as const, pass: false }, { hand: 'RH' as const, pass: false }, { hand: 'LH' as const, pass: true }]) {
        if (step.grip === 'TWO_HANDS' && (hands.hand === 'RH' || hands.pass)) continue; // from 2.3 the hands are the step's own
        for (const side of ['FRONT', 'BACK'] as const) for (const shape of ['ONE_WAY', 'ROUND_TRIP'] as const) for (const reference of [true, false]) {
          const m: DealMotion = { grip: step.grip!, ...hands, turn: side === 'FRONT', flipAxis: side === 'FRONT' ? axis : null, side };
          exceptions.push({ ...base, motion: m, shape, reference, what: `undantag: ${hands.pass ? 'handbyte' : hands.hand} ${side} ${axis} ${shape}${reference ? '' : ' utan referensfilm'}` });
        }
      }
      exceptions.push({ ...base, style: 'MINIMAL', what: 'undantag: minimal text' });
      exceptions.push({ ...base, shape: 'ROUND_TRIP', cardScale: 1.5, what: 'undantag: tur och retur med kortet 150 %' });
    }
  }
  return { recipe, exceptions };
}
const textOf = (c: Case) => promptFor({ dealer, step: c.step, model: 'kling-4', motion: c.motion, place: PLACES[c.target], style: c.style, oneWay: c.shape === 'ONE_WAY', reference: c.reference, cardScale: c.cardScale });

test('the recipe\'s text for every deal says each thing once and nothing against another', async () => {
  const { recipe } = await cases();
  assert.ok(recipe.length >= DEALS.length * Object.keys(PLACES).length, `${recipe.length} texts`);
  for (const c of recipe) {
    const p = textOf(c);
    assert.deepEqual(faults(p.text, { oneWay: c.shape === 'ONE_WAY', closed: c.motion.side === 'BACK' }), [], `${c.step} → ${c.target}, ${c.what}:\n${p.text}`);
    assert.equal(p.template, `film-giv-kort@${TEMPLATE_VERSION}`);
    // Each thing IS said: the camera, the grip, the lay, the card; a reference film where the recipe has one; the turn of an open card.
    const all = sentences(p.text), said = (name: string) => all.filter((s) => TOPICS.find((t) => t.name === name)!.says.test(s)).length;
    for (const name of ['kameran', 'greppet ur skon', 'läggningen', 'kortets utseende']) assert.equal(said(name), 1, `${c.step} → ${c.target}: ${name}\n${p.text}`);
    assert.equal(said('referensfilmen'), c.reference ? 1 : 0, `${c.step} → ${c.target}: referensfilmen`);
    assert.equal(said('vändningen'), c.motion.side === 'FRONT' ? 1 : 0, `${c.step} → ${c.target}: vändningen\n${p.text}`);
    assert.equal(said('vägen tillbaka'), 0, 'bara dit: no way back');
    // Her eyes are in the pictures, not in a deal's text (handbook §5); the deal from 2.3 says where her head turns, as measured.
    assert.equal(said('blicken'), c.motion.grip === 'TWO_HANDS' ? 1 : 0, `${c.step} → ${c.target}: blicken`);
    assert.equal(said('den vilande handen'), 1, `${c.step} → ${c.target}: the hand that does not lay the card\n${p.text}`);
    // Positive statements only, and within the length the trials' text had.
    assert.doesNotMatch(p.text, /\bnot\b|\bnever\b|n't|\bwithout\b/i, p.text);
    // The deal the trials tried is 226 words with its reference sentence; the two-hand deal says two hands and her head, and is longer.
    const words = p.text.split(/\s+/).length, limit = c.motion.grip === 'TWO_HANDS' ? 275 : 240;
    assert.ok(words <= limit, `${c.step} → ${c.target}: ${words} words`);
  }
});

test('every exception a draft can still say against its recipe keeps the text free of repeats and contradictions', async () => {
  const { exceptions } = await cases();
  assert.ok(exceptions.length > 1000, `${exceptions.length} texts`);
  const bad: string[] = [];
  for (const c of exceptions) {
    const p = textOf(c), f = faults(p.text, { oneWay: c.shape === 'ONE_WAY', closed: c.motion.side === 'BACK' });
    if (f.length) bad.push(`${c.step} → ${c.target}, ${c.what}: ${f.join('; ')}\n   ${p.text}`);
  }
  // One example per kind of fault, so that a failure reads as a list of what is wrong and not as two thousand texts.
  const kinds = new Map<string, string>();
  for (const b of bad) {
    const kind = b.slice(b.indexOf(': ', b.indexOf('undantag: ') + 10) + 2, b.indexOf('\n')).replace(/"[^"]*"/g, '…');
    if (!kinds.has(kind)) kinds.set(kind, b);
  }
  assert.deepEqual([...kinds.values()], [], `${bad.length} of ${exceptions.length} texts, ${kinds.size} kinds of fault`);
});

test('the films without a card say each thing once too: the entries (2.3 with them), the ways out, the returns, the hole card, rest', () => {
  const others: { step: StepKey; motion?: DealMotion }[] = [
    ...(['INGANG-2.1', 'INGANG-2.2', 'INGANG-2.3', 'UTGANG', 'UTGANG-2.2', 'HALKORT', 'VILA'] as const).map((step) => ({ step })),
    ...(['RETUR-2.1', 'RETUR-2.2', 'RETUR-1'] as const).flatMap((step) => [{ hand: 'LH' as const, pass: false }, { hand: 'LH' as const, pass: true }].map((h) => ({ step, motion: { grip: 'PINCH' as const, ...h, turn: false, flipAxis: null, side: 'FRONT' as const } }))),
  ];
  for (const o of others) for (const style of ['KORT', 'MINIMAL'] as const) for (const reference of [false, true]) {
    const p = promptFor({ dealer, step: o.step, model: 'kling-4', motion: o.motion ?? null, place: PLACES['D.C2'], style, reference });
    // A return's text is the way back and the hole card's turn ends with one: neither is a deal bara dit.
    assert.deepEqual(faults(p.text, { oneWay: false, closed: false }), [], `${o.step} ${style}:\n${p.text}`);
  }
  // Anchor 2.3: both hands go to the shoe, her eyes stay on the hand at the card, and no hand is said to rest.
  const entry = promptFor({ dealer, step: 'INGANG-2.3', model: 'kling-4', style: 'KORT', reference: true }).text;
  assert.match(entry, /^Locked camera, one continuous shot\. Video 1 shows only the movement[^.]*\. Both her hands rise calmly and go to the shoe: [^.]*as in the last frame\. Her eyes go down to her hand at the card and stay there, as in the last frame\.$/);
  // An entry written with template 10 said the resting hand twice ("Both hands rest on the felt." and "The other hand rests on the felt."); 11 says it once.
  const before = promptFor({ dealer, step: 'INGANG-2.1', model: 'wan3', style: 'KORT', version: 10 }).text, now = promptFor({ dealer, step: 'INGANG-2.1', model: 'wan3', style: 'KORT' }).text;
  assert.equal(now, before.replace('Both hands rest on the felt. ', ''));
  assert.notDeepEqual(faults(before, { oneWay: false, closed: false }), []);
});

test('template 11 writes the deal the trials tried in the words of template 10, word for word', () => {
  // The deal by the hand at the shoe, open: the recipe's own. Nothing of it may change without a new trial.
  for (const grip of ['PINCH', 'DRAG'] as const) for (const flipAxis of FLIP_AXES) for (const oneWay of [true, false]) for (const reference of [true, false]) for (const target of Object.keys(PLACES)) {
    const input = { dealer, step: grip === 'DRAG' ? ('GIV-2.2' as const) : ('GIV-2.1' as const), model: 'kling-4', motion: { grip, hand: 'LH' as const, pass: false, turn: true, flipAxis, side: 'FRONT' as const }, place: PLACES[target], style: 'KORT' as const, oneWay, reference };
    assert.equal(promptFor(input).text, promptFor({ ...input, version: 10 }).text, `${grip} ${flipAxis} ${oneWay ? 'bara dit' : 'tur och retur'} ${target}`);
  }
  // The deal with two hands from anchor 2.3, in the order it was measured on a real dealer: stroked out and slid flat to the
  // other hand, tipped up onto a short end by both, on over that end in one unbroken turn (end over end, as the real dealer), laid palm down with the
  // fingertips on it; the hand from the shoe back at the shoe; her head towards the place. Where the hands meet follows the seat.
  const two = (target: string) => promptFor({ dealer, step: 'GIV-2.3', model: 'kling-4', motion: { grip: 'TWO_HANDS', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT' }, place: PLACES[target], style: 'KORT', oneWay: true, reference: true }).text;
  assert.match(two('P4.C1'), /Her hand at the shoe strokes the yellow card out of the window and slides it flat on the felt, its broad yellow side up, a short way out from the shoe, where her other hand meets it\. There both hands tip the card up onto its short end, and her other hand, palm down, carries it on towards its place in the middle of the picture, where the last frame shows it; on that way the card goes on over the same short end, end over end, in one unbroken turn that begins with the yellow side up and ends with the blue side up\. She lays the card flat at its place, blue side up, with her palm down, and her fingertips come to rest on it, as in the last frame\. The hand from the shoe lets go once the card stands on its end and settles back at the shoe\. Her head stays bowed and turns towards the place where the card will lie\. Only one card moves/);
  assert.match(two('P7.C1'), /just in front of the shoe, where her other hand meets it/);
  assert.match(two('P1.C1'), /to the middle in front of her, where her other hand meets it/);
  for (const flipAxis of FLIP_AXES) assert.equal(promptFor({ dealer, step: 'GIV-2.3', model: 'kling-4', motion: { grip: 'TWO_HANDS', hand: 'LH', pass: false, turn: true, flipAxis, side: 'FRONT' }, place: PLACES['P4.C1'], style: 'KORT', oneWay: true, reference: true }).text, two('P4.C1'), 'the turn is the step\'s own');
  // What 11 changed: a deal bara dit by the other hand or with handbyte, and a closed one, end once (10 said the end twice).
  const other = { dealer, step: 'GIV-2.1' as const, model: 'kling-4', motion: { grip: 'PINCH' as const, hand: 'LH' as const, pass: true, turn: true, flipAxis: 'FREE' as const, side: 'FRONT' as const }, place: PLACES['P1.C1'], style: 'KORT' as const, oneWay: true, reference: true };
  assert.deepEqual(faults(promptFor(other).text, { oneWay: true, closed: false }), []);
  assert.notDeepEqual(faults(promptFor({ ...other, version: 10 }).text, { oneWay: true, closed: false }), [], 'template 10 said the end twice here: the test sees it');
});
