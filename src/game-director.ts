// From the engine's signals to film: which clip-bank edges one step of the game plays, in order. Pure, no DOM.
//
// The engine (game/) answers every command with an ordered list of signals. Only two of them move the dealer's hands: `deal`
// (a card to a seat or to the dealer) and `reveal` (the hole card is turned). This file turns them into beats, each one edge
// of the clip bank (src/clip-graph.ts), and says for each beat which card the film carries and which cards already lie on
// the table. Which take is played and where it is cut is still the clip bank's business (resolveRound).
//
// Rules of the chain, the same as the lab's round builder: the hand goes from rest to the shoe once (IDLE>READY), deals card
// after card with a return to the shoe between them, and goes back to rest after the last card of the run. The hole card is
// turned from rest. Nothing here knows rules, values or outcomes.
//
// A return to rest the bank has no film for is played as the return to the shoe and the shoe's exit (READY>IDLE), so the hand never
// jumps from the card to rest; where the exit has no film either, the cut is from the shoe to rest, between two anchors.
import {dealersOf, parseEdge, type BankData, type Step} from './clip-graph.ts';
import {slotOf, slotFilm, slotLabel, type Slot, type TableCards} from './game-table.ts';

// The signals this file reads; everything else in the engine's list is for the overlay.
export type FilmSignal = {type: string; shoeDraw?: number | null};
export type BeatKind = 'ENTRY' | 'DEAL' | 'RETURN' | 'EXIT' | 'REVEAL' | 'PLACE';
// step: the edge to play. own: the card the film itself carries (null on the way to the shoe). lying: the cards at rest on
// the table while the beat plays, by draw number, without the film's own card. PLACE is a card that has no film to deal
// it (none made yet, or the only one rejected): it has no step and is simply laid on its place when its turn comes.
export type Beat = {kind: BeatKind; step: Step | null; own: {shoeDraw: number; slot: Slot; label: string} | null; lying: number[]};

// The hole card has no model edge for its turn yet; the clip bank holds the film as an experiment under this name.
export const REVEAL_NODE = 'REVEAL(D.C2)';

// STOPGAP (huvudagenten 2026-11-13, for showing Paow's round): a card whose own deal has no film that can be played is dealt with
// the film named here, the drawn card laid at its own place. The hole card: when READY>D.C2 has no film, the dealer's second card is
// dealt with the film of her first (READY>D.C1 and its return), the card laid closed at D.C2, 63 px (about a card's width) right of
// where the film's hand lays its card, the same compromise as a seat's second card; the film's card turns on the way as the first
// card's does, and the card drawn on it shows its back on both sides (a closed card wins over the film's side, src/card-overlay.ts
// cardFace), so no value is shown. It gives way by itself when the bank has a playable film of D.C2 (planBeats).
// NOT D.C3 (and so not D.C4 and later, which play the D.C3 film): with the first card's film the drawn card would lie 219 px (D.C3)
// and 243 px (D.C4) right of her hand, measured for Paow 2026-11-13; that is a hand laying a card somewhere else, which Jakob calls
// cheating with the card. Those cards are laid without a hand until a film of their own exists (the plan has no place for them yet).
// Per dealer: Paow's only. Pamela is paused (Jakob 2026-11-12), and her game stays as he saw it: her hole card is laid without a hand.
export const STAND_IN_FILM: Readonly<Record<string, Readonly<Record<string, string>>>> = {paow: {'D.C2': 'D.C1'}};

/**
 * The beats of one step of the game.
 * table: the cards on the table after the step (the engine's view). lying: draw numbers that lay there before it.
 * signals: the step's signals in the engine's order. A card the table does not know is an error, not a guess.
 * filmless(target): true for a placement key whose deal has no film that can be played; such a card is laid without a
 * hand, and the hand goes to rest before it instead of waiting at the shoe.
 * toRest(film): false for a seat film whose return to rest has no film that can be played; the hand then goes back to the shoe
 * and from there to rest (EXIT, READY>IDLE).
 * standIn: films played for a card whose own has none (STAND_IN_FILM), when the stand-in itself can be played.
 */
export function planBeats(table: TableCards, lying: number[], signals: FilmSignal[], filmless: (target: string) => boolean = () => false, toRest: (film: string) => boolean = () => true, standIn: Readonly<Record<string, string>> = {}): Beat[] {
  const moves = signals.filter(s => (s.type === 'deal' || s.type === 'reveal') && typeof s.shoeDraw === 'number') as {type: 'deal' | 'reveal'; shoeDraw: number}[];
  const beats: Beat[] = [], rest = [...lying];
  const slots = moves.map(move => { const slot = slotOf(table, move.shoeDraw); if (!slot) throw Error(`Kortet med dragnummer ${move.shoeDraw} finns inte på bordet.`); return slot; });
  // The film a card is dealt with: its own, or its stand-in when its own has none and the stand-in has.
  const filmOf = (slot: Slot) => { const own = slotFilm(slot), other = standIn[own]; return filmless(own) && other && !filmless(other) ? other : own; };
  const filmed = (i: number) => moves[i]?.type === 'deal' && !filmless(filmOf(slots[i])); // a deal the hand really makes
  let atShoe = false;
  moves.forEach((move, i) => {
    const slot = slots[i];
    const own = {shoeDraw: move.shoeDraw, slot, label: slotLabel(slot)}, others = () => rest.filter(n => n !== move.shoeDraw);
    if (move.type === 'reveal') {
      beats.push({kind: 'REVEAL', step: {from: 'IDLE', to: REVEAL_NODE}, own, lying: others()});
      if (!rest.includes(move.shoeDraw)) rest.push(move.shoeDraw);
      return;
    }
    if (!filmed(i)) { beats.push({kind: 'PLACE', step: null, own, lying: others()}); rest.push(move.shoeDraw); return; }
    const film = filmOf(slot), last = !filmed(i + 1);
    if (!atShoe) beats.push({kind: 'ENTRY', step: {from: 'IDLE', to: 'READY'}, own: null, lying: [...rest]});
    beats.push({kind: 'DEAL', step: {from: 'READY', to: film}, own, lying: others()});
    const viaShoe = last && !toRest(film);
    beats.push({kind: 'RETURN', step: {from: film, to: last && !viaShoe ? 'IDLE' : 'READY'}, own, lying: others()});
    rest.push(move.shoeDraw); atShoe = !last;
    if (viaShoe) beats.push({kind: 'EXIT', step: {from: 'READY', to: 'IDLE'}, own: null, lying: [...rest]});
  });
  return beats;
}

/** The draw numbers that lie on the table once the beats have played. */
export const lyingAfter = (lying: number[], beats: Beat[]): number[] => [...new Set([...lying, ...beats.filter(b => b.own).map(b => b.own!.shoeDraw)])];

// The engine writes suits as symbols; the card printer names them.
const SUIT: Record<string, string> = {'♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs'};
export type CardFace = {shoeDraw: number; r?: string | null; s?: string | null; faceDown?: boolean};
/** One record per card in the shape the lab's card layer takes: {shoeDraw, target, r, s, faceDown}. A card not on the table is left out. */
export function cardRecords(table: TableCards, faces: CardFace[]): {shoeDraw: number; target: string; r: string | null; s: string | null; faceDown: boolean}[] {
  return faces.flatMap(face => { const slot = slotOf(table, face.shoeDraw); return slot ? [{shoeDraw: face.shoeDraw, target: slotLabel(slot), r: face.r ?? null, s: face.s ? SUIT[face.s] ?? face.s : null, faceDown: face.faceDown === true || !face.r || !face.s}] : []; });
}

// ── What the game may play ──────────────────────────────────────────────────
// The game plays what has a verdict: Jakob's, or a provisional one given in his place (it plays as its decision says and waits for
// him in Granska). A take without one (decision PENDING, or in the inbox) is left out of the game's bank, so no step can fall back
// on it, with one exception: a rest take played on request only (motion.idle.onRequest, a talk film), which chance never picks and
// the game plays only when the dealer says its line. Rejected takes stay: the clip bank never plays them, and says so.
// A stopgap (its record says motion.stopgap: a film made of another, as her entry played backwards for the exit) gives way by
// itself: it is left out wherever the same dealer has another judged take, not rejected, on the same edge.
const unjudged = (review: {decision?: string; inbox?: boolean} | undefined) => review?.inbox === true || String(review?.decision ?? 'PENDING').toUpperCase() === 'PENDING';
const onRequest = (motion: {motion?: {idle?: {onRequest?: boolean}}} | undefined) => motion?.motion?.idle?.onRequest === true;
const stopgap = (record: unknown) => (record as {motion?: {stopgap?: unknown}} | undefined)?.motion?.stopgap === true;
/** The bank as the game reads it: every take without a verdict left out, except takes played on request; a stopgap only where nothing judged stands beside it. */
export function judgedBank(bank: BankData): BankData {
  const motions = bank.motions ?? {}, keep = (item: {id?: unknown} | null | undefined) => { const m = motions[String(item?.id)]; return !unjudged(m?.review) || onRequest(m); };
  const kept = {jobs: (bank.jobs ?? []).filter(keep), derived: (bank.derived ?? []).filter(keep), edits: (bank.edits ?? []).filter(keep)}, owner = dealersOf(bank);
  const edgeOf = (t: {id: string; from?: string; to?: string}) => `${owner[t.id]}|${parseEdge(`${t.from}>${t.to}`)?.base ?? `${t.from}>${t.to}`}`;
  const real = new Set([...kept.jobs, ...kept.derived].filter(t => !stopgap(motions[t.id]) && String(motions[t.id]?.review?.decision ?? '').toUpperCase() !== 'REJECTED').map(edgeOf));
  const gives = (t: {id: string; from?: string; to?: string}) => !(stopgap(motions[t.id]) && real.has(edgeOf(t)));
  return {...bank, jobs: kept.jobs.filter(gives), derived: kept.derived.filter(gives), edits: kept.edits};
}
/** The ids judgedBank leaves out, for the page to say. */
export const unjudgedTakes = (bank: BankData): string[] => { const kept = new Set([...(judgedBank(bank).jobs ?? []), ...(judgedBank(bank).derived ?? []), ...(judgedBank(bank).edits ?? [])].map(x => x.id));
  return [...(bank.jobs ?? []), ...(bank.derived ?? []), ...(bank.edits ?? [])].map(x => x.id).filter(id => !kept.has(id)); };

// ── What she says ───────────────────────────────────────────────────────────
// The engine's speak signals (game/presentation.ts) in a step come before its first card (goodluck, double) or after its last
// (insurance, the outcome). A talk film is played at rest, so it is played before the chain of cards or after it, never inside.
export type SpeakSignal = {type: 'speak'; line: string};
export function speakMoments(signals: FilmSignal[]): {before: string[]; after: string[]} {
  const moves = signals.map((s, i) => s.type === 'deal' || s.type === 'reveal' ? i : -1).filter(i => i >= 0), first = moves[0] ?? Infinity;
  const lines = signals.flatMap((s, i) => s.type === 'speak' && typeof (s as SpeakSignal).line === 'string' ? [{line: (s as SpeakSignal).line, i}] : []);
  return {before: lines.filter(l => l.i < first).map(l => l.line), after: lines.filter(l => l.i > first).map(l => l.line)};
}

// ── The switch for her lines ────────────────────────────────────────────────
// Which talk film says a line is src/speech-lines.ts's (spokenFilm, chatReply); the page asks it. The look key tal (src/game-look.ts):
// 'av' keeps her silent, and the module is never asked; anything else ('repliker', the default) lets the films play.
export const talkOn = (word: unknown) => word !== 'av';
