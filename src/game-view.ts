// What the overlay shows, worked out from what the engine said and how far the film has come. Pure, no DOM.
//
// The engine answers a command at once with the whole step, but the player must not see a total before the card has landed
// in the film. So the page keeps `shown`: what each hand's total was when its latest card landed (the engine sends that
// total with every deal signal), and this file puts it together with the bets in progress into one TableView. Nothing here
// adds card values or decides an outcome; every number comes from the engine (game/).
import type {Snapshot} from '../game/session.ts';
import type {SeatSignalEvent} from '../game/seats.ts';
import type {Action, HandView, Outcome, Phase, SeatView, TableView} from './game-overlay.ts';
import {chipsFor} from './game-overlay.ts';
import type {TableCards} from './game-table.ts';
import type {CardFace} from './game-director.ts';

export const CHIP_VALUES = [5, 25, 100, 500, 1000];
export const DEALER_KEY = 'D';
export const handKey = (seat: number, hand: number) => `${seat}:${hand}`;
// A hand's total as the film has shown it so far.
export type Shown = Record<string, {total: number; soft: boolean; natural: boolean}>;
export type Settled = {dealerTotal: number; dealerBlackjack: boolean; hands: {seat: number; handIndex: number; stake: number; returned: number; outcome: Outcome}[]} | null;
export type Stage = 'BETTING' | 'ROUND' | 'SETTLED';
// bets: the chips laid on each seat before the deal, in the order they were laid. busy: a step's film is playing.
export type PageState = {stage: Stage; busy: boolean; dealerPlays: boolean; bets: Record<number, number[]>; last: Record<number, number[]> | null; chip: number; balance: number; shown: Shown; settled: Settled; line: string | null; error: string | null};

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
export const betTotal = (bets: Record<number, number[]>) => sum(Object.values(bets).map(sum));

/** The cards on the table by draw number, for the director and the layout. The hole card lies second in the dealer's hand whether it is open or not. */
export function tableCards(snapshot: Snapshot): TableCards {
  const round = snapshot.view.round; if (!round) return {hands: [], dealer: []};
  const dealer = round.dealer.map(c => c.shoeDraw);
  if (round.holeDraw !== null && !dealer.includes(round.holeDraw)) dealer.splice(1, 0, round.holeDraw);
  return {hands: round.hands.map(h => ({seat: h.seat, cards: h.cards.map(c => c.shoeDraw)})), dealer};
}
/** Every card's face as the view knows it; the hole card has none before its reveal. */
export function cardFaces(snapshot: Snapshot): CardFace[] {
  const round = snapshot.view.round; if (!round) return [];
  const open = [...round.hands.flatMap(h => h.cards), ...round.dealer].map(c => ({shoeDraw: c.shoeDraw, r: c.r, s: c.s}));
  return round.holeDraw !== null && !open.some(c => c.shoeDraw === round.holeDraw) ? [...open, {shoeDraw: round.holeDraw, faceDown: true}] : open;
}
/** What a landed card showed: the hand it belongs to and that hand's total, as the engine sent it with the signal. */
export function shownBy(event: SeatSignalEvent): {key: string; total: number; soft: boolean; natural: boolean} | null {
  if (event.type === 'reveal') return {key: DEALER_KEY, total: event.total, soft: event.soft, natural: event.blackjack === true};
  if (event.type !== 'deal') return null;
  if (event.to === 'dealer') return {key: DEALER_KEY, total: event.total, soft: event.soft, natural: false};
  return event.seat === null || event.hand === null ? null : {key: handKey(event.seat, event.hand), total: event.total, soft: event.soft, natural: event.natural === true};
}

const LINE: Record<string, string> = {dealerbust: 'Dealern spricker', dealerblackjack: 'Dealern har <b>blackjack</b>', blackjack: '<b>Blackjack!</b>', win: 'Du vinner', push: 'Lika', lose: 'Dealern vinner'};
/** The last thing the dealer would say in a step, as the status line; null when the step says nothing worth showing. */
export const lineOf = (events: SeatSignalEvent[]): string | null => { const said = events.filter(e => e.type === 'speak').map(e => LINE[(e as {line: string}).line]).filter(Boolean); return said[said.length - 1] ?? null; };

export function tableView(snapshot: Snapshot, page: PageState): TableView {
  const round = snapshot.view.round, betting = page.stage === 'BETTING', staked = betting ? betTotal(page.bets) : sum((round?.hands ?? []).map(h => h.stake + h.insured));
  const phase: Phase = betting ? 'BETTING' : page.busy ? (page.dealerPlays ? 'DEALER' : 'DEALING') : page.stage === 'SETTLED' ? 'SETTLED' : round?.phase === 'insurance' ? 'INSURANCE' : round?.phase === 'decisions' ? 'TURN' : 'DEALING';
  const hand = (key: string, engine: {total: number; soft: boolean; natural: boolean; busted: boolean} | null, active: boolean, result: {outcome: Outcome; net: number} | null): HandView => {
    // While the film plays, a hand shows what its landed cards came to; afterwards the engine's own figures.
    const now = page.busy ? page.shown[key] ?? null : engine ?? page.shown[key] ?? null;
    return {key, total: now ? now.total : null, soft: !!now?.soft, state: !now ? null : now.natural ? 'BLACKJACK' : !page.busy && engine?.busted ? 'BUST' : null, active, outcome: result?.outcome ?? null, net: result?.net ?? null};
  };
  const seats: SeatView[] = [];
  for (let seat = 1; seat <= 7; seat++) {
    const own = (round?.hands ?? []).filter(h => h.seat === seat), amount = betting ? sum(page.bets[seat] ?? []) : sum(own.map(h => h.stake));
    // In the round the chips that were laid stay as they lie; what a double or a split adds comes on top of them.
    const laid = page.bets[seat] ?? [], had = sum(laid), chips = betting || amount === had ? [...laid] : amount > had && had > 0 ? [...laid, ...chipsFor(amount - had, CHIP_VALUES)] : chipsFor(amount, CHIP_VALUES);
    seats.push({seat, amount, chips, turn: phase === 'TURN' && round?.activeSeat === seat,
      hands: betting ? [] : own.map(h => { const paid = page.settled?.hands.find(s => s.seat === seat && s.handIndex === h.handIndex);
        return hand(handKey(seat, h.hand), {total: h.total, soft: h.soft, natural: h.natural === true, busted: h.busted}, phase === 'TURN' && round!.active === h.handIndex, paid && page.stage === 'SETTLED' && !page.busy ? {outcome: paid.outcome, net: paid.returned - paid.stake} : null); })});
  }
  const dealer = betting || !round ? null : hand(DEALER_KEY, {total: round.dealerTotal, soft: round.dealerSoft, natural: page.settled?.dealerBlackjack === true, busted: false}, false, null);
  const affordable = (bets: Record<number, number[]>) => betTotal(bets) > 0 && betTotal(bets) <= page.balance && Object.values(bets).every(chips => !sum(chips) || (sum(chips) >= snapshot.limits.min && sum(chips) <= snapshot.limits.max));
  const message = page.error ?? (phase === 'BETTING' ? `Tryck på en ring eller dra en marker dit · ${snapshot.limits.min}–${snapshot.limits.max} per plats` : phase === 'TURN' ? `Din tur · <b>plats ${round!.activeSeat}</b>` : phase === 'INSURANCE' ? 'Dealern visar <b>ess</b>'
    : phase === 'SETTLED' ? `${page.line ?? 'Rundan är klar'}${page.settled && !page.settled.dealerBlackjack ? ` · dealern ${page.settled.dealerTotal}` : ''}` : '');
  return {phase, balance: page.balance, staked, seats, dealer, chipValues: CHIP_VALUES, chip: page.chip, canDeal: betting && !page.busy && affordable(page.bets), canUndo: betting && betTotal(page.bets) > 0,
    canRebet: betting && !!page.last && betTotal(page.bets) === 0 && affordable(page.last), actions: phase === 'TURN' ? [...snapshot.legalActions] as Action[] : [], message};
}
