// Seat boundary of the local engine: the ONE place that converts between Scout's `box`
// (0–6, used unchanged inside round.ts, core.ts and presentation.ts) and the lab's seats
// 1–7 (seat = box + 1). Seat 1 is camera-left, seat 7 camera-right; the opening deal goes
// seat 7 → seat 1, then the dealer's up-card, then seat 7 → seat 1 again, then the hole card.
// Everything the session returns passes through here and carries `seat`, never `box`.
// New code. It also adds what the overlay must not compute itself: hand totals in the view,
// and on every deal/reveal event the total of the receiving hand's visible cards right after
// that card (computed with the core's handValue), the hand ordinal and the card position, and
// whether a hand is a natural / the dealer has blackjack (the core's isNatural / isBJ: a two-card
// 21 after a split is not a natural).
// `target` is Scout's filmed take target (filmedDealTarget): '1'–'7' (= seat), 'dealer', 'hole', 'flip'.
// `family` is kept verbatim as Scout's clip slot name; its situation suffix `box<n>` is Scout's
// catalogue naming and means seat n + 1.
import { handValue, isBJ, isNatural } from './round.ts';
import type { Action, Card, Hand, Phase, Rank, SideResult, Suit } from './round.ts';
import type { PublicView, ShoeView } from './core.ts';
import { filmedDealTarget } from './presentation.ts';
import type { CardFace, DealAction, IdleEvent, Outcome, SignalEvent, SpeakEvent } from './presentation.ts';
import type { ShoeSource } from './shoe-source.ts';

export const SEAT_COUNT = 7;

export class SeatError extends Error {
  declare code: string;
  constructor(message: string) { super(message); this.name = 'SeatError'; this.code = 'INVALID_SEAT'; }
}

/** Scout box 0–6 → seat 1–7. */
export function seatOf(box: number): number {
  if (!Number.isInteger(box) || box < 0 || box >= SEAT_COUNT) throw new SeatError(`Invalid box ${JSON.stringify(box)}`);
  return box + 1;
}
/** Seat 1–7 → Scout box 0–6. */
export function boxOf(seat: unknown): number {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 1 || seat > SEAT_COUNT) throw new SeatError(`Seat must be an integer 1-${SEAT_COUNT}, got ${JSON.stringify(seat)}`);
  return seat - 1;
}

// ---- seat-numbered shapes returned by the session ----
export interface SeatCard { r: Rank; s: Suit; serial: number; shoeDraw: number }
export interface SeatHand {
  seat: number;
  /** Index in round.hands (Scout's handIndex; changes when a hand to its left splits). */
  handIndex: number;
  /** 0-based ordinal among this seat's hands (0 = the seat's first hand, 1 = the hand split off to its right, …). */
  hand: number;
  /** Seat this hand was split at, or null when it never took part in a split. */
  splitFrom: number | null;
  stake: number; pp: number; tp: number;
  /** In deal order, each with its shoeDraw. */
  cards: SeatCard[];
  total: number; soft: boolean;
  /** The core's isNatural: two cards, 21, and never part of a split (pays 3:2). */
  natural: boolean;
  done: boolean; doubled: boolean; busted: boolean; insured: number;
  /** Total returned on main bet and insurance once settled (stake included), else null. */
  result: number | null;
  sideReturn: number; sideLabels: string[]; sideResults?: { pp?: SideResult; tp?: SideResult };
}
export interface SeatRecord {
  seat: number; inPlay: boolean; pp: number; tp: number; insured: number;
  sideReturn: number; sideLabels: string[]; sideResults?: { pp?: SideResult; tp?: SideResult };
}
export interface SeatRound {
  phase: Phase;
  /** Every playable hand, in Scout's order: seat 1 → 7, a split hand right after the hand it came from. Play goes from the last to the first. */
  hands: SeatHand[];
  /** The seven seats, seat 1 first. */
  seats: SeatRecord[];
  /** The dealer's visible cards (the hole card only after its reveal). */
  dealer: SeatCard[];
  dealerTotal: number; dealerSoft: boolean;
  /** Shoe position of the hole card; its rank and suit are not in the view before the reveal. */
  holeDraw: number | null;
  /** handIndex of the hand to act, -1 when none. */
  active: number;
  activeSeat: number | null;
  legalActions: Action[];
}
export interface SeatShoeView extends ShoeView { source: ShoeSource }
export interface SeatView {
  version: number; roundId: string | null; turnSeq: number;
  shoe: SeatShoeView | null; round: SeatRound | null;
  /** True when this step replaced the shoe before dealing. */
  shuffled: boolean;
}

export interface SeatDealEvent {
  type: 'deal'; to: 'seat' | 'dealer';
  seat: number | null; handIndex: number | null;
  /** Ordinal among the seat's hands right after this card (null for the dealer). */
  hand: number | null;
  /** 0-based position of this card in its hand (dealer: up-card 0, hole card 1, draws 2…). */
  cardIndex: number;
  /** null for the face-down hole card. */
  card: CardFace | null; faceDown: boolean; shoeDraw: number;
  /** handValue of the receiving hand's visible cards right after this card (dealer: never the hole card before its reveal). */
  total: number; soft: boolean;
  /** The receiving player hand is a natural right after this card (core isNatural); always false for the dealer. */
  natural: boolean;
  target: string; clip: { action: DealAction; fallback: 'slide' }; family?: string;
}
export interface SeatRevealEvent {
  type: 'reveal'; to: 'dealer'; card: CardFace; shoeDraw: number;
  /** Dealer cardIndex of the hole card (1). */
  cardIndex: number;
  /** handValue of the dealer's two cards. */
  total: number; soft: boolean;
  /** The dealer's two cards are a blackjack (core isBJ). */
  blackjack: boolean;
  target: string; family?: string;
}
export interface SeatTurnEvent { type: 'turn'; seat: number | null; handIndex: number; legalActions: Action[] }
export interface SeatSettleEvent {
  type: 'settle'; dealerTotal: number; dealerBlackjack: boolean;
  hands: Array<{ seat: number; handIndex: number; stake: number; returned: number; outcome: Outcome }>;
}
export type SeatSignalEvent = SpeakEvent | SeatDealEvent | SeatRevealEvent | SeatTurnEvent | SeatSettleEvent | IdleEvent;

const cardOf = (c: Card): SeatCard => ({ r: c.r, s: c.s, serial: c.serial as number, shoeDraw: c.shoeDraw as number });
const visibleValue = (cards: readonly Card[]) => { const { total, soft } = handValue(cards); return { total, soft }; };

/**
 * Seat-numbers the presentation events of one step and adds totals, using the public view
 * after that step (the view the events lead to). Speak and idle events pass unchanged.
 */
export function seatEvents(events: readonly SignalEvent[], after: PublicView): SeatSignalEvent[] {
  const round = after?.round ?? null, hands = round?.hands ?? [], dealer = round?.dealer ?? [];
  const holeDraw = round?.holeDraw ?? null;
  return events.map((event): SeatSignalEvent => {
    if (event.type === 'deal') {
      const target = filmedDealTarget(event) as string;
      if (event.to === 'dealer') {
        const hole = event.faceDown === true;
        // Visible after this card: dealer cards dealt up to it; the hole card counts only once revealed,
        // and the reveal always comes before any later dealer card (presentationEvents).
        const visible = dealer.filter(c => (c.shoeDraw as number) <= event.shoeDraw && !(hole && c.shoeDraw === holeDraw));
        const before = dealer.filter(c => (c.shoeDraw as number) < event.shoeDraw).length
          + (holeDraw != null && holeDraw < event.shoeDraw && !dealer.some(c => c.shoeDraw === holeDraw) ? 1 : 0);
        return { type: 'deal', to: 'dealer', seat: null, handIndex: null, hand: null, cardIndex: before,
          card: event.card, faceDown: event.faceDown, shoeDraw: event.shoeDraw, ...visibleValue(visible), natural: false,
          target, clip: event.clip, ...(event.family ? { family: event.family } : {}) };
      }
      const owner = hands[event.handIndex as number];
      const visible = (owner?.cards ?? []).filter(c => (c.shoeDraw as number) <= event.shoeDraw);
      return { type: 'deal', to: 'seat', seat: seatOf(event.box as number), handIndex: event.handIndex,
        hand: owner ? hands.filter(h => h.box === owner.box).indexOf(owner) : null,
        cardIndex: (owner?.cards ?? []).findIndex(c => c.shoeDraw === event.shoeDraw),
        card: event.card, faceDown: event.faceDown, shoeDraw: event.shoeDraw, ...visibleValue(visible),
        natural: owner ? isNatural({ ...owner, cards: visible } as Hand) : false,
        target, clip: event.clip, ...(event.family ? { family: event.family } : {}) };
    }
    if (event.type === 'reveal') {
      const visible = dealer.filter(c => (c.shoeDraw as number) <= event.shoeDraw);
      return { type: 'reveal', to: 'dealer', card: event.card, shoeDraw: event.shoeDraw,
        cardIndex: dealer.findIndex(c => c.shoeDraw === event.shoeDraw), ...visibleValue(visible), blackjack: isBJ(visible),
        target: filmedDealTarget(event) as string, ...(event.family ? { family: event.family } : {}) };
    }
    if (event.type === 'turn') return { type: 'turn', seat: event.box == null ? null : seatOf(event.box), handIndex: event.handIndex, legalActions: [...event.legalActions] };
    if (event.type === 'settle') {
      // presentationEvents lists the settled hands with a stake in round order; every playable hand has one.
      const staked = hands.filter(h => h.stake > 0);
      return { type: 'settle', dealerTotal: event.dealerTotal, dealerBlackjack: event.dealerBlackjack,
        hands: event.hands.map((h, i) => ({ seat: seatOf(h.box), handIndex: hands.indexOf(staked[i]), stake: h.stake, returned: h.returned, outcome: h.outcome })) };
    }
    return { ...event };
  });
}

/** Seat-numbers the core's public view and adds hand totals. */
export function seatView(view: PublicView & { shuffled?: boolean }, source: ShoeSource): SeatView {
  const r = view.round;
  let round: SeatRound | null = null;
  if (r) {
    const hands: SeatHand[] = r.hands.map((h, handIndex) => ({
      seat: seatOf(h.box), handIndex, hand: r.hands.filter(x => x.box === h.box).indexOf(h),
      splitFrom: h.splitFrom == null ? null : seatOf(h.splitFrom),
      stake: h.stake, pp: h.pp, tp: h.tp, cards: h.cards.map(cardOf), ...visibleValue(h.cards), natural: isNatural(h),
      done: h.done, doubled: h.doubled, busted: h.busted === true, insured: h.insured, result: h.result,
      sideReturn: h.sideReturn, sideLabels: [...h.sideLabels], ...(h.sideResults ? { sideResults: structuredClone(h.sideResults) } : {}),
    }));
    const seats: SeatRecord[] = r.boxes.map(b => ({
      seat: seatOf(b.box), inPlay: b.stake > 0, pp: b.pp, tp: b.tp, insured: b.insured,
      sideReturn: b.sideReturn, sideLabels: [...b.sideLabels], ...(b.sideResults ? { sideResults: structuredClone(b.sideResults) } : {}),
    }));
    const dealerValue = handValue(r.dealer), activeHand = r.hands[r.active];
    round = { phase: r.phase, hands, seats, dealer: r.dealer.map(cardOf), dealerTotal: dealerValue.total, dealerSoft: dealerValue.soft,
      holeDraw: r.holeDraw ?? null, active: r.active, activeSeat: activeHand && r.phase === 'decisions' ? seatOf(activeHand.box) : null,
      legalActions: [...r.legalActions] };
  }
  return { version: view.version, roundId: view.roundId, turnSeq: view.turnSeq,
    shoe: view.shoe ? { ...view.shoe, source } : null, round, shuffled: view.shuffled === true };
}

export interface SeatBet { seat: number; main: number; pp?: number; tp?: number }
/** The core's seven-entry bets array (index = box) from seat-numbered bets; a seat may appear once. */
export function betsForSeats(bets: unknown): Array<{ main: number; pp: number; tp: number }> {
  if (!Array.isArray(bets) || !bets.length || bets.length > SEAT_COUNT) throw new SeatError(`Bets must list 1-${SEAT_COUNT} seats`);
  const out = Array.from({ length: SEAT_COUNT }, () => ({ main: 0, pp: 0, tp: 0 })), seen = new Set<number>();
  for (const bet of bets as SeatBet[]) {
    const box = boxOf(bet?.seat);
    if (seen.has(box)) throw new SeatError(`Seat ${bet.seat} is listed twice`);
    seen.add(box);
    out[box] = { main: bet.main, pp: bet.pp ?? 0, tp: bet.tp ?? 0 };
  }
  return out;
}
