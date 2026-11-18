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
  // While the deal is sent and its answer awaited (betting, busy) the chips stay as they were sent: Ångra and Rensa wait too.
  return {phase, balance: page.balance, staked, seats, dealer, chipValues: CHIP_VALUES, chip: page.chip, canDeal: betting && !page.busy && affordable(page.bets), canUndo: betting && !page.busy && betTotal(page.bets) > 0,
    canRebet: betting && !page.busy && !!page.last && betTotal(page.bets) === 0 && affordable(page.last), actions: phase === 'TURN' ? [...snapshot.legalActions] as Action[] : [], message};
}

/** The stage of a page opened on the engine's state (a reload, a second tab): a round under way, a settled round not yet collected, or bets. */
export const stageOf = (snapshot: Snapshot): Stage => !snapshot.view.round ? 'BETTING' : snapshot.view.round.phase === 'settled' ? 'SETTLED' : 'ROUND';

// ── What the page may ask, and when ──
// The page's controls (src/game-page.ts) are the overlay's buttons, and also window.game.controls, which the proof recorder presses.
// Each control asks here first, so a press that comes another way than its button (the recorder, a press that lands after the picture
// changed) can do nothing the player could not: before 2026-11-18 each control had its own check, and a deal pressed on a settled
// round started a new one with the old round's bets while the page still showed the old one, Ångra and Rensa changed the bets of a
// round under way, and insurance or Ny runda were sent in any phase for the engine to refuse.
export type Ask = 'bet' | 'take' | 'undo' | 'clear' | 'rebet' | 'deal' | 'insurance' | 'next' | Action;
/** True when the overlay offers the control now: the chips while bets are laid and nothing is sent, the rest exactly as their buttons. */
export function mayAsk(snapshot: Snapshot, page: PageState, ask: Ask): boolean {
  const view = tableView(snapshot, page), chips = view.phase === 'BETTING' && !page.busy;
  if (ask === 'bet' || ask === 'take' || ask === 'clear') return chips;
  if (ask === 'undo') return view.canUndo;
  if (ask === 'rebet') return view.canRebet;
  if (ask === 'deal') return view.canDeal;
  if (ask === 'insurance') return view.phase === 'INSURANCE';
  if (ask === 'next') return view.phase === 'SETTLED';
  return view.actions.includes(ask);
}

/**
 * The totals the film has shown, carried from one step into the next (before: the engine's answer the page held, after: the new one).
 * A total stays with its hand, found by the hand's first card (a split leaves a hand its first card and gives the new hand the
 * other), and only while every card it was shown with still lies in that hand in the same order. A split takes a hand's second card
 * away (8♠ 8♥ had shown 16 and now holds 8♠ alone), and a split to the left of other hands moves them one key along: before
 * 2026-11-18 the keys were kept as they were, and during the split's film a hand showed the total of the hand that had held its key.
 * A hand without a total shows none until a card of its own lands (shownBy); nothing here counts a card.
 */
export function shownFor(shown: Shown, before: Snapshot, after: Snapshot): Shown {
  const out: Shown = shown[DEALER_KEY] ? {[DEALER_KEY]: shown[DEALER_KEY]} : {}; // the dealer's cards are only ever added to
  const was = before.view.round?.hands ?? [];
  for (const hand of after.view.round?.hands ?? []) {
    const old = was.find(h => h.seat === hand.seat && h.cards[0]?.shoeDraw === hand.cards[0]?.shoeDraw), total = old && shown[handKey(old.seat, old.hand)];
    if (old && total && old.cards.every((c, i) => hand.cards[i]?.shoeDraw === c.shoeDraw)) out[handKey(hand.seat, hand.hand)] = total;
  }
  return out;
}

/**
 * The collect of a settled round, sent once however often it is asked for: the page asks when the round is settled, and Ny runda asks
 * again when that answer has not come yet. Before 2026-11-18 Ny runda sent a second collect at the same version; the engine refused
 * it as stale (it never paid twice) and the page showed the refusal. A collect that came back without an answer (null) is sent again.
 */
export function collector(send: (command: Record<string, unknown>) => Promise<Snapshot | null>): (roundId: string | null) => Promise<Snapshot | null> {
  let asked: {roundId: string | null; answer: Promise<Snapshot | null>} | null = null;
  return roundId => {
    if (asked?.roundId !== roundId) { const answer = send({op: 'collect', roundId}).then(out => { if (out === null && asked?.answer === answer) asked = null; return out; }); asked = {roundId, answer}; }
    return asked!.answer;
  };
}
