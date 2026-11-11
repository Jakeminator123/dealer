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
import type {Step} from './clip-graph.ts';
import {slotOf, slotFilm, slotLabel, type Slot, type TableCards} from './game-table.ts';

// The signals this file reads; everything else in the engine's list is for the overlay.
export type FilmSignal = {type: string; shoeDraw?: number | null};
export type BeatKind = 'ENTRY' | 'DEAL' | 'RETURN' | 'REVEAL';
// step: the edge to play. own: the card the film itself carries (null on the way to the shoe). lying: the cards at rest on
// the table while the beat plays, by draw number, without the film's own card.
export type Beat = {kind: BeatKind; step: Step; own: {shoeDraw: number; slot: Slot; label: string} | null; lying: number[]};

// The hole card has no model edge for its turn yet; the clip bank holds the film as an experiment under this name.
export const REVEAL_NODE = 'REVEAL(D.C2)';

/**
 * The beats of one step of the game.
 * table: the cards on the table after the step (the engine's view). lying: draw numbers that lay there before it.
 * signals: the step's signals in the engine's order. A card the table does not know is an error, not a guess.
 */
export function planBeats(table: TableCards, lying: number[], signals: FilmSignal[]): Beat[] {
  const moves = signals.filter(s => (s.type === 'deal' || s.type === 'reveal') && typeof s.shoeDraw === 'number') as {type: 'deal' | 'reveal'; shoeDraw: number}[];
  const beats: Beat[] = [], rest = [...lying];
  let atShoe = false;
  moves.forEach((move, i) => {
    const slot = slotOf(table, move.shoeDraw);
    if (!slot) throw Error(`Kortet med dragnummer ${move.shoeDraw} finns inte på bordet.`);
    const own = {shoeDraw: move.shoeDraw, slot, label: slotLabel(slot)}, others = () => rest.filter(n => n !== move.shoeDraw);
    if (move.type === 'reveal') {
      beats.push({kind: 'REVEAL', step: {from: 'IDLE', to: REVEAL_NODE}, own, lying: others()});
      if (!rest.includes(move.shoeDraw)) rest.push(move.shoeDraw);
      return;
    }
    const film = slotFilm(slot), last = moves[i + 1]?.type !== 'deal';
    if (!atShoe) beats.push({kind: 'ENTRY', step: {from: 'IDLE', to: 'READY'}, own: null, lying: [...rest]});
    beats.push({kind: 'DEAL', step: {from: 'READY', to: film}, own, lying: others()});
    beats.push({kind: 'RETURN', step: {from: film, to: last ? 'IDLE' : 'READY'}, own, lying: others()});
    rest.push(move.shoeDraw); atShoe = !last;
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
