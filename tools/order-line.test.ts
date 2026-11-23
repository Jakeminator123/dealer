// One straight line: the text that goes to Runway says each thing once (Jakob 2026-11-18: "för många val som kan leda till
// överlappande instruktioner för att skapa videos"; 2026-11-20: "så att det inte blir dubbla typer av meningar"). Built for
// every combination the line allows, from the same function the store writes a draft's text with (promptFor,
// src/order-prompts.ts): each step with a card, to every card of the plan, with the step's one recipe
// (data/order-methods.json, its own addition with it) and every deliberate exception a draft can still say (the other hand,
// handbyte, a closed card, each turn, tur och retur, the minimal text, no reference film, a trial card size, the marks on
// the blue side), and every other recipe of the register: the films without a card and the stills. It fails when a topic is
// written twice (the camera, the reference film, the grip, the path, the turn, the lay, the way back, the resting hand, where
// she looks, the card's look, what is taken from @pose), when a state is said in two clauses (which side is up, the palm,
// "as in the last frame"), when five words or more stand twice in one text, when two sentences say opposite things, or when
// the same sentence stands twice.
// The plan is a fixture written here, so that the test does not move with what Jakob has saved in placements/default.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FLIP_AXES, MODELS, STEPS, type FlipAxis, type Shape, type StepKey, type TextStyle } from '../src/order-model.ts';
import { readMethods, recipeFor } from '../src/order-methods.ts';
import { TEMPLATE_CHOICES, TEMPLATE_VERSION, promptFor, withoutLastFrame, type DealMotion } from '../src/order-prompts.ts';

/** Where each card of the plan lies, in bank pixels (the plan of 2026-11-11, rounded): far left to far right, the dealer's own close to her. */
const PLACES: Record<string, { x: number; y: number }> = {
  'P1.C1': { x: 237, y: 980 }, 'P2.C1': { x: 437, y: 1052 }, 'P3.C1': { x: 646, y: 1090 }, 'P4.C1': { x: 857, y: 1101 }, 'P5.C1': { x: 1067, y: 1090 }, 'P6.C1': { x: 1276, y: 1052 }, 'P7.C1': { x: 1476, y: 980 },
  'P4.C2': { x: 907, y: 1090 }, 'D.C1': { x: 850, y: 900 }, 'D.C2': { x: 912, y: 900 },
};
const dealer = { name: 'Paow', look: 'a woman in a black jacket' };
// A still's sentence about the pose picture begins with its tag, "@pose is …".
const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z@])/).filter(Boolean);

/**
 * The topics of a text, each with the words that say it. A topic may be said at most `max` times in one text (once,
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
  { name: 'den vilande handen', says: /^The other hand rests on the felt\.$|\bsettles back at the shoe\b|\bstays at the shoe\b|^Both hands rest on the felt\.$/i, max: 1 },
  { name: 'blicken', says: /\beyes\b|\bHer head\b/i, max: 1 },
  { name: 'kortets utseende', says: /\bsolid (?:yellow|blue)\b|\bblank\b|\bplain\b|back is yellow/i, max: 1 },
  // A still: what its hand takes from the pose picture.
  { name: 'vad som tas ur posebilden', says: /\bas the hand in @pose\b|\btake from (?:it|@pose)\b/i, max: 1 },
];
/**
 * A state said in a clause, which may stand once in a whole text: the sentence-by-sentence topics above do not see it when
 * the carry says "yellow side up" and the lay says it again (template 11 did, in a closed deal and in the deal with two
 * hands). The palm is counted apart, once on the way there and once on the way back (faults).
 */
const ONCE: RegExp[] = [/\bas in the last frame\b/gi, /\bas in the first frame\b/gi, /\bblue side up\b/gi, /\byellow side up\b/gi, /\bher left hand\b/gi];
/**
 * Word sequences of five words or more that may stand twice in one text, each because the same thing is NAMED twice, not
 * said twice. Anything else that long standing twice is a repeat.
 */
const TWICE_OK = [
  'from edge to edge on its', // the plain card's two sides, in one sentence
  'the next card in the window', // where the hand comes to rest after the way back, and how that card looks
  'the yellow card in the window', // the card the hand goes to or leaves, and how it looks (the addition of the recipes from 2.2)
  'the last frame shows it', // the place, and the marks on the blue side
  'her hand at the shoe', // the hand that gives the card up, named again where it takes the next one
  'in front of the shoe where', // a seat beside the shoe: where the hands meet, and where the card lies
];
const wordsOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9@' ]+/g, ' ').split(/\s+/).filter(Boolean);
function repeats(text: string, n = 5): string[] {
  const w = wordsOf(text), first = new Map<string, number>(), out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) {
    const g = w.slice(i, i + n).join(' '), at = first.get(g);
    if (at === undefined) first.set(g, i);
    else if (i >= at + n && !TWICE_OK.some((ok) => ok.includes(g))) out.add(g);
  }
  return [...out];
}
/** Pairs that say opposite things: both in one text is a contradiction. */
const AGAINST: { name: string; a: RegExp; b: RegExp }[] = [
  { name: 'vänds på vägen och vid platsen', a: /\bOn the way\b.*\bwrist\b/i, b: /\bClose to its place\b.*\bwrist\b|\bThere her thumb slides under\b/i },
  { name: 'släpper kortet och har fingrarna kvar på det', a: /\blets go of it\b|\blifts her fingertips off it\b/i, b: /\bfingertips (?:come to rest|stay) on it\b|\bHer hand ends at the card\b/i },
  { name: 'ligger gult och ligger blått', a: /\b(?:lays|stops) (?:it|the card)[^.]*\byellow side up\b/i, b: /\b(?:lays|stops) (?:it|the card)[^.]*\bblue side up\b/i },
  { name: 'slutar vid kortet och går tillbaka', a: /\bas in the last frame\b.*$/i, b: /\bglides back low over the felt, palm down, to the shoe\b/i },
  { name: 'ett stängt kort vänds', a: /\byellow side up\b[^.]*\.$/i, b: /\bblue side opens towards the camera\b|\bends with the blue side up\b/i },
];
/** What is wrong with a text, in words; empty when each thing is said once and nothing against another. */
function faults(text: string, more: { oneWay: boolean; closed: boolean }): string[] {
  const out: string[] = [], all = sentences(text);
  const seen = new Set<string>();
  for (const s of all) { if (seen.has(s)) out.push(`samma mening två gånger: "${s}"`); seen.add(s); }
  for (const t of TOPICS) { const n = all.filter((s) => t.says.test(s)).length; if (n > t.max) out.push(`${t.name} sägs ${n} gånger: ${all.filter((s) => t.says.test(s)).map((s) => `"${s}"`).join(' | ')}`); }
  for (const phrase of ONCE) { const n = text.match(phrase)?.length ?? 0; if (n > 1) out.push(`"${phrase.source.replace(/\\b/g, '')}" står ${n} gånger`); }
  // The palm: once on the way there, once on the way back.
  const back = TOPICS.find((t) => t.name === 'vägen tillbaka')!.says;
  for (const part of [all.filter((s) => !back.test(s)), all.filter((s) => back.test(s))]) { const n = part.join(' ').match(/\bpalm down\b/gi)?.length ?? 0; if (n > 1) out.push(`"palm down" står ${n} gånger i samma del av rörelsen`); }
  for (const g of repeats(text)) out.push(`samma ordföljd två gånger: "${g}"`);
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
type Case = { step: StepKey; target: string; motion: DealMotion; style: TextStyle; shape: Shape; reference: boolean; cardScale: number; extra: string | null; faceMark: boolean; what: string; version?: number };
const registerOf = async () => {
  const { register } = readMethods(JSON.parse(await readFile('data/order-methods.json', 'utf8')));
  assert.ok(register, 'the method register reads');
  return register;
};
async function cases(): Promise<{ recipe: Case[]; exceptions: Case[] }> {
  const register = await registerOf();
  const recipe: Case[] = [], exceptions: Case[] = [];
  for (const step of DEALS) for (const target of Object.keys(PLACES)) {
    const r = recipeFor(register, step.key, target);
    assert.ok(r, `${step.key} ${target}: a recipe`);
    // The plan's word where the recipe leaves the turn to Placering; the hole card lands closed.
    const closedByPlan = target === 'D.C2';
    const turns: FlipAxis[] = r.turn ? [r.turn] : [...FLIP_AXES];
    for (const flipAxis of turns) {
      const motion: DealMotion = { grip: step.grip!, hand: 'LH', pass: false, turn: !closedByPlan, flipAxis: closedByPlan ? null : flipAxis, side: closedByPlan ? 'BACK' : 'FRONT' };
      const base: Case = { step: step.key, target, motion, style: r.style, shape: r.shape!, reference: r.reference !== 'ingen' && !!MODELS[r.model].videos, cardScale: 1, extra: r.extra, faceMark: false, what: `receptet (${flipAxis})` };
      recipe.push(base);
      // The exceptions a draft can still say against its recipe, one at a time and the hands with every turn.
      for (const axis of FLIP_AXES) for (const hands of [{ hand: 'LH' as const, pass: false }, { hand: 'RH' as const, pass: false }, { hand: 'LH' as const, pass: true }]) {
        if (step.grip === 'TWO_HANDS' && (hands.hand === 'RH' || hands.pass)) continue; // from 2.3 the hands are the step's own
        for (const side of ['FRONT', 'BACK'] as const) for (const shape of ['ONE_WAY', 'ROUND_TRIP'] as const) for (const reference of [true, false]) {
          const m: DealMotion = { grip: step.grip!, ...hands, turn: side === 'FRONT', flipAxis: side === 'FRONT' ? axis : null, side };
          const what = `undantag: ${hands.pass ? 'handbyte' : hands.hand} ${side} ${axis} ${shape}${reference ? '' : ' utan referensfilm'}`;
          exceptions.push({ ...base, motion: m, shape, reference, what });
          // An open card with the marks in its last picture says them whatever the hands and the turn (Bordet's review
          // 2026-11-21: the handbyte, the other hand and the turn at the place said a blank blue side before).
          if (side === 'FRONT') exceptions.push({ ...base, motion: m, shape, reference, faceMark: true, what: `${what}, märken på den blå sidan` });
        }
      }
      exceptions.push({ ...base, style: 'MINIMAL', what: 'undantag: minimal text' });
      exceptions.push({ ...base, shape: 'ROUND_TRIP', cardScale: 1.5, what: 'undantag: tur och retur med kortet 150 %' });
      // The last picture carries the blue side's marks: the card's look is then said as the picture shows it, in both styles.
      for (const style of [r.style, 'MINIMAL'] as const) exceptions.push({ ...base, style, faceMark: true, what: `undantag: märken på den blå sidan, ${style}` });
    }
  }
  return { recipe, exceptions };
}
const textOf = (c: Case) => promptFor({ dealer, step: c.step, model: 'kling-4', motion: c.motion, place: PLACES[c.target], style: c.style, oneWay: c.shape === 'ONE_WAY', reference: c.reference, cardScale: c.cardScale, extra: c.extra, faceMark: c.faceMark, version: c.version });

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
    // Which side is up is said: once for a closed card (it stays yellow), and an open card's turn or lay says blue.
    assert.match(p.text, c.motion.side === 'BACK' ? /\byellow side up\b/ : /\bblue side\b/, `${c.step} → ${c.target}: the side that is up\n${p.text}`);
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
    ...(['INGANG-2.1', 'INGANG-2.2', 'INGANG-2.3', 'UTGANG', 'UTGANG-2.2', 'UTGANG-2.3', 'HALKORT', 'VILA'] as const).map((step) => ({ step })),
    ...(['RETUR-2.1', 'RETUR-2.2', 'RETUR-2.3', 'RETUR-1'] as const).flatMap((step) => [{ hand: 'LH' as const, pass: false }, { hand: 'LH' as const, pass: true }].map((h) => ({ step, motion: { grip: 'PINCH' as const, ...h, turn: false, flipAxis: null, side: 'FRONT' as const } }))),
  ];
  // A return whose first picture shows the marks says them (Bordet's review 2026-11-21), and still says each thing once.
  for (const o of others) for (const style of ['KORT', 'MINIMAL'] as const) for (const reference of [false, true]) for (const faceMark of o.step.startsWith('RETUR-') ? [false, true] : [false]) {
    const p = promptFor({ dealer, step: o.step, model: 'kling-4', motion: o.motion ?? null, place: PLACES['D.C2'], style, reference, faceMark });
    // A return's text is the way back and the hole card's turn ends with one: neither is a deal bara dit.
    assert.deepEqual(faults(p.text, { oneWay: false, closed: false }), [], `${o.step} ${style}:\n${p.text}`);
  }
  // Anchor 2.3: both hands go to the shoe, her eyes stay on the hand at the card, and no hand is said to rest. The reach
  // ends on the last frame; the eyes' sentence does not say the last frame again (template 11 did).
  const entry = promptFor({ dealer, step: 'INGANG-2.3', model: 'kling-4', style: 'KORT', reference: true }).text;
  assert.match(entry, /^Locked camera, one continuous shot\. Video 1 shows only the movement[^.]*\. Both her hands rise calmly and go to the shoe: [^.]*as in the last frame\. Her eyes go down to her hand at the card and stay there\.$/);
  // An entry written with template 10 said the resting hand twice ("Both hands rest on the felt." and "The other hand rests on the felt."); 11 says it once.
  const before = promptFor({ dealer, step: 'INGANG-2.1', model: 'wan3', style: 'KORT', version: 10 }).text, now = promptFor({ dealer, step: 'INGANG-2.1', model: 'wan3', style: 'KORT' }).text;
  assert.equal(now, before.replace('Both hands rest on the felt. ', ''));
  assert.notDeepEqual(faults(before, { oneWay: false, closed: false }), []);
});

test('every other recipe of the register says each thing once with its own addition: the films without a card and the stills', async () => {
  const register = await registerOf();
  const seen: string[] = [];
  for (const m of register.methods) {
    const step = STEPS.find((s) => s.key === m.step)!;
    if (DEALS.includes(step)) continue; // the deals are the first test's, with their additions
    const target = step.card ? (m.step === 'HALKORT' ? 'D.C2' : 'P4.C1') : null, r = recipeFor(register, m.step, target);
    if (!r) continue; // no method yet: nothing is ordered with it
    const p = promptFor({ dealer, step: m.step, model: r.model, place: target ? PLACES[target] : null, style: r.style, reference: r.reference !== 'ingen' && !!MODELS[r.model].videos, extra: r.extra });
    assert.deepEqual(faults(p.text, { oneWay: false, closed: false }), [], `${m.id}:\n${p.text}`);
    assert.match(p.template, new RegExp(`@${TEMPLATE_VERSION}$`), m.id);
    if (r.extra) assert.ok(p.text.endsWith(r.extra), `${m.id}: the recipe's addition is in its text`);
    seen.push(m.step);
  }
  for (const step of ['INGANG-2.3', 'RETUR-2.3', 'VILA', 'ANKARE-2.1', 'ANKARE-2.2'] as const) assert.ok(seen.includes(step), `${step} has a recipe that is read here`);
});

test('a deal with no last picture (round two, 2026-11-21): the two-hand deal from 2.3 in 12, 13 and 14 names no last frame and still says each thing once', async () => {
  const { recipe } = await cases();
  const twoHand = recipe.filter((c) => c.step === 'GIV-2.3' && c.shape === 'ONE_WAY' && c.motion.side === 'FRONT' && c.reference);
  assert.ok(twoHand.length >= 7, `${twoHand.length} two-hand deals with a reference film`);
  for (const c of twoHand) for (const version of TEMPLATE_CHOICES) {
    // The marks are said: the seat's A3 is made afterwards with the plan's card drawn on it, marks and all.
    const p = withoutLastFrame(textOf({ ...c, faceMark: true, version }));
    assert.doesNotMatch(p.text, /last frame|last picture/i, `${c.target} @${version}:\n${p.text}`);
    assert.match(p.text, /Video 1/, `${c.target} @${version}: the reference film shows the way`);
    assert.deepEqual(faults(p.text, { oneWay: true, closed: false }), [], `${c.target} @${version}:\n${p.text}`);
    assert.equal(p.text, p.parts.filter((x) => x.text).map((x) => x.text).join(' '), 'the parts are the text');
  }
});

test('templates 13 and 14 say each thing once in every case the line allows, as 12 does', async () => {
  const { recipe, exceptions } = await cases();
  for (const version of TEMPLATE_CHOICES.filter((v) => v !== TEMPLATE_VERSION)) {
    const bad: string[] = [];
    for (const c of [...recipe, ...exceptions].map((c) => ({ ...c, version }))) {
      const p = textOf(c), f = faults(p.text, { oneWay: c.shape === 'ONE_WAY', closed: c.motion.side === 'BACK' });
      if (f.length) bad.push(`${c.step} → ${c.target}, ${c.what}: ${f.join('; ')}\n   ${p.text}`);
      assert.match(p.template, new RegExp(`@${version}$`));
    }
    assert.deepEqual(bad.slice(0, 5), [], `template ${version}: ${bad.length} texts`);
  }
});
