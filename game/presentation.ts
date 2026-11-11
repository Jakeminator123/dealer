// Presentation signals of the local engine: turns a committed step (public view before and
// after, op, action) into the ordered list of events a client plays (speak, deal, reveal,
// turn, settle, idle), plus each event's clip slot family and filmed take target.
// Ported at scoutgaming commit 0fe56ace3, logic unchanged, only types added:
// - settlementLine, presentationEvents: services/game/presentation/partner-presentation.mjs
//   (git blob d7cd10f2758cd6a1e55de7f7ad336f1bb45fa5c0). withMovingOpening (moving speech) is not ported.
// - catalogueEventId and the family join (withFamily): services/game/games/blackjack/presentation/
//   outbox-presentation.mjs (git blob 207a5fef1dbdd15fce4c94cbf33a8db9f42d5e07). Outbox rows, line ids not ported.
// - mediaSituationForEvent: packages/presentation/runtime/media-family-resolver.mjs
//   (git blob e2055293255bcb47cdf931573678294fe68c3836); resolver/inventory functions not ported.
// - filmedDealTarget: packages/presentation/contracts/filmed-profile.mjs (git blob 93a688025460c5c18b8a3c483af0e28b3061cf49).
// Events here still carry Scout's `box` 0–6; seats.ts converts them to seats 1–7.
import type { Action, Rank, Suit } from './round.ts';

export type SpeakLine = 'goodluck' | 'insurance' | 'double' | 'placebets' | 'blackjack' | 'dealerblackjack' | 'dealerbust' | 'win' | 'push' | 'lose';
export type DealAction = 'deal-left' | 'deal-centre' | 'deal-right' | 'deal-dealer';
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose';
export interface CardFace { r: Rank; s: Suit }
export interface SpeakEvent { type: 'speak'; line: SpeakLine; blocking?: true; family?: string }
export interface DealEvent {
  type: 'deal'; to: 'box' | 'dealer'; box: number | null; handIndex: number | null;
  /** null for the face-down hole card. */
  card: CardFace | null; faceDown: boolean; shoeDraw: number;
  clip: { action: DealAction; fallback: 'slide' }; family?: string;
}
export interface RevealEvent { type: 'reveal'; to: 'dealer'; card: CardFace; shoeDraw: number; family?: string }
export interface TurnEvent { type: 'turn'; box: number | null; handIndex: number; legalActions: Action[] }
export interface SettleEvent {
  type: 'settle'; dealerTotal: number; dealerBlackjack: boolean;
  hands: Array<{ box: number; stake: number; returned: number; outcome: Outcome }>;
}
export interface IdleEvent { type: 'idle'; family?: string }
export type SignalEvent = SpeakEvent | DealEvent | RevealEvent | TurnEvent | SettleEvent | IdleEvent;

// The view shape the generator reads (core publicView, or an older stored view).
type ViewCard = { r?: Rank | null; s?: Suit; shoeDraw?: number };
type ViewHand = { box: number; stake: number; cards?: ViewCard[]; result?: number | null; busted?: boolean; split?: boolean; splitFrom?: number | null };
type ViewRound = { hands?: ViewHand[]; dealer?: ViewCard[]; phase?: string; active?: number; holeDraw?: number | null; legalActions?: Action[] };
export type PresentationView = { round?: ViewRound | null } | null | undefined;

// ---------------------------------------------------------------- partner-presentation.mjs
// Ordered presentation cues shared by native, preview, shared-table and Partner
// clients. The server owns the game facts; the registered package owns footage.
const DEAL_ACTION = (box: number | null): DealAction => box == null ? 'deal-dealer' : box <= 1 ? 'deal-left' : box >= 5 ? 'deal-right' : 'deal-centre';
const handTotal = (cards: ViewCard[] | undefined) => { let t = 0, aces = 0; for (const c of cards ?? []) { if (c.r == null) continue; if (c.r === 'A') { aces++; t += 11; } else t += ['K','Q','J'].includes(c.r) ? 10 : Number(c.r); } while (t > 21 && aces--) t -= 10; return t; };
// result = total returned (stake included). win: > stake, push: == stake, lose: 0 (or busted). The core's natural: two
// cards, 21, and a hand that never took part in a split (splitFrom null; older views carry `split`).
const handOutcome = (h: ViewHand): Outcome => h.busted || !((h.result as number) > 0) ? 'lose' : (h.result as number) > h.stake ? (h.cards?.length === 2 && handTotal(h.cards) === 21 && !h.split && (h.splitFrom ?? null) === null ? 'blackjack' : 'win') : 'push';

// The settlement line: one line for the whole table, chosen by the server from the settled round, never by a client.
// A line is never said when it is false for most of the hands it speaks to. Busted hands were lost when their card
// landed and are not spoken to, unless every hand busted (lose). In this order:
// 1. The dealer's own outcome, when it holds for every hand: dealerblackjack when no hand pushes on its own blackjack;
//    dealerbust when no hand busted (its text says the whole table wins).
// 2. The common outcome of the standing hands: all win: blackjack when a winning hand is a natural, else win; all push:
//    push; all lose: lose.
// 3. Mixed: the outcome of more than half of the standing hands (blackjack counts as a win).
// 4. Otherwise silence (null).
export function settlementLine(round: ViewRound | null | undefined): SpeakLine | null {
  const hands = (round?.hands ?? []).filter(h => h.stake > 0);
  if (!hands.length) return null;
  const dealerTotal = handTotal(round!.dealer), dealerBJ = round!.dealer?.length === 2 && dealerTotal === 21;
  const busted = (h: ViewHand) => h.busted === true || handTotal(h.cards) > 21;
  const standing = hands.filter(h => !busted(h));
  if (!standing.length) return 'lose';
  const outs = standing.map(handOutcome), kind = (o: Outcome) => o === 'blackjack' ? 'win' : o;
  if (dealerBJ && !outs.includes('push')) return 'dealerblackjack';
  if (dealerTotal > 21 && standing.length === hands.length && outs.every(o => kind(o) === 'win')) return 'dealerbust';
  const lineFor = (k: 'win' | 'push' | 'lose'): SpeakLine => k === 'win' ? (outs.includes('blackjack') ? 'blackjack' : 'win') : k;
  for (const k of ['win', 'push', 'lose'] as const) if (outs.filter(o => kind(o) === k).length * 2 > outs.length) return lineFor(k);
  return null;
}

// Turn a table response into an ordered list of presentation events a client should play.
export function presentationEvents(prevView: PresentationView, view: PresentationView, op: string, extra: { action?: string } = {}): SignalEvent[] {
  const ev: SignalEvent[] = []; const r = view?.round; const pr = prevView?.round;
  type Placed = { where: 'box' | 'dealer'; box?: number; handIndex?: number; card: ViewCard };
  const cardsOf = (v: PresentationView) => { const out: Placed[] = []; if (!v?.round) return out; v.round.hands?.forEach((h, hi) => h.cards?.forEach(c => out.push({ where: 'box', box: h.box, handIndex: hi, card: c }))); v.round.dealer?.forEach(c => out.push({ where: 'dealer', card: c })); return out; };
  const before = new Set(cardsOf(prevView).map(c => c.card.shoeDraw));
  // The dealer's hole card is dealt face down at start (present in the view without rank) and revealed at settle: emit `reveal`, not a second `deal`.
  const holeDraw = prevView?.round?.holeDraw ?? view?.round?.holeDraw ?? null, prevDealerHidden = holeDraw != null && !(prevView?.round?.dealer ?? []).some(c => c.shoeDraw === holeDraw);
  const fresh = cardsOf(view).filter(c => !before.has(c.card.shoeDraw) && !(c.where === 'dealer' && prevDealerHidden && c.card.shoeDraw === holeDraw)).sort((a, b) => (a.card.shoeDraw as number) - (b.card.shoeDraw as number));
  if (op === 'start') ev.push({ type: 'speak', line: 'goodluck', blocking: true });
  const holeAtStart: DealEvent | null = op === 'start' && view?.round?.holeDraw != null ? { type: 'deal', to: 'dealer', box: null, handIndex: null, card: null, faceDown: true, shoeDraw: view.round.holeDraw, clip: { action: 'deal-dealer', fallback: 'slide' } } : null;
  const dealQueue: Array<{ c?: Placed; hole?: DealEvent; draw: number }> = fresh.map(c => ({ c, draw: c.card.shoeDraw as number })); if (holeAtStart) dealQueue.push({ hole: holeAtStart, draw: holeAtStart.shoeDraw }); dealQueue.sort((a, b) => a.draw - b.draw);
  for (const item of dealQueue) { if (item.hole) { ev.push(item.hole); continue; } const c = item.c as Placed; const box = c.where === 'dealer' ? null : c.box as number; const action = DEAL_ACTION(box); ev.push({ type: 'deal', to: c.where, box, handIndex: c.handIndex ?? null, card: { r: c.card.r as Rank, s: c.card.s as Suit }, faceDown: c.card.r == null, shoeDraw: c.card.shoeDraw as number, clip: { action, fallback: 'slide' } }); }
  if (r?.phase === 'insurance' && pr?.phase !== 'insurance') ev.push({ type: 'speak', line: 'insurance' });
  if (op === 'act' && extra.action === 'double') ev.push({ type: 'speak', line: 'double' });
  if (r?.phase === 'settled' && pr?.phase !== 'settled') {
    const hands = (r.hands ?? []).filter(h => h.stake > 0);
    const dealerTotal = handTotal(r.dealer); const dealerBJ = (r.dealer?.length === 2 && dealerTotal === 21);
    const outs = hands.map(handOutcome), line = settlementLine(r);
    // The reveal follows the card that triggered it (the player's last card, or the initial hidden deal) and comes before any
    // extra dealer card (draw after the hole), never ahead of the whole instruction list.
    const hole = r.dealer?.find(c => c.shoeDraw === holeDraw);
    if (prevDealerHidden && hole) {
      const extra = ev.findIndex(e => e.type === 'deal' && e.to === 'dealer' && e.shoeDraw > (hole.shoeDraw as number));
      const at = extra >= 0 ? extra : ev.reduce((last, e, i) => e.type === 'deal' ? i + 1 : last, 0);
      ev.splice(at, 0, { type: 'reveal', to: 'dealer', card: { r: hole.r as Rank, s: hole.s as Suit }, shoeDraw: hole.shoeDraw as number });
    }
    ev.push({ type: 'settle', dealerTotal, dealerBlackjack: dealerBJ, hands: hands.map((h, i) => ({ box: h.box, stake: h.stake, returned: h.result ?? 0, outcome: outs[i] })) });
    if (line) ev.push({ type: 'speak', line });
  }
  if (r?.phase === 'decisions') ev.push({ type: 'turn', box: r.hands?.[r.active as number]?.box ?? null, handIndex: r.active as number, legalActions: r.legalActions ?? [] });
  if (r?.phase === 'insurance' && pr?.phase !== 'insurance') { /* speak already queued above */ }
  if (op === 'collect') ev.push({ type: 'speak', line: 'placebets' }, { type: 'idle' });
  return ev;
}

// ---------------------------------------------------------------- outbox-presentation.mjs
const DEDICATED_SPEECH = new Set(['goodluck', 'insurance', 'double']);
// Main's catalogue event id for an instruction (clip-naming.mjs / studio-contract events).
export function catalogueEventId(event: SignalEvent): string | null {
  if (event.type === 'speak') return `speak.${DEDICATED_SPEECH.has(event.line) ? event.line : 'other'}`;
  if (event.type === 'reveal') return 'reveal.dealer';
  if (event.type === 'idle') return 'idle.ready';
  if (event.type === 'deal') return event.to === 'dealer' ? 'deal.dealer' : `deal.player.${(event.box as number) < 2 ? 'left' : (event.box as number) < 5 ? 'centre' : 'right'}`;
  return null; // settle and turn are game facts, not media slots
}

// The family `<eventId>/<situation>` is the clip slot name used by Scout's clip map.
export const withFamily = <E extends SignalEvent>(event: E): E => {
  const eventId = catalogueEventId(event), situation = eventId ? mediaSituationForEvent(eventId, event) : null;
  return eventId && situation ? { ...event, family: `${eventId}/${situation}` } : { ...event };
};

// ---------------------------------------------------------------- media-family-resolver.mjs
export function mediaSituationForEvent(eventId: string | null, event: any): string | null {
  if (!event || typeof event !== 'object') return null;
  if (eventId?.startsWith('speak.') && event.type === 'speak' && typeof event.line === 'string') return event.line;
  if (eventId === 'deal.dealer' && event.type === 'deal' && event.to === 'dealer') return event.faceDown === false ? 'dealer-up' : event.faceDown === true ? 'dealer-hole' : null;
  if (eventId === 'reveal.dealer' && event.type === 'reveal' && event.to === 'dealer') return 'dealer-hole';
  if (eventId?.startsWith('deal.player.') && event.type === 'deal' && event.to === 'box' && Number.isInteger(event.box) && event.box >= 0 && event.box <= 6) return `box${event.box}`;
  if (eventId === 'idle.ready' && event.type === 'idle') return 'ready';
  if (eventId === 'transition.shoe' && (event.pose === 'to-shoe' || event.pose === 'from-shoe')) return event.pose;
  return null;
}

// ---------------------------------------------------------------- filmed-profile.mjs
// The filmed take target of a deal or reveal: '1'–'7' (box + 1), 'dealer', 'hole' or 'flip'.
export function filmedDealTarget(event: any): string | null {
  if (event?.type === 'reveal') return event.to === 'dealer' ? 'flip' : null;
  if (event?.type !== 'deal') return null;
  if (event.to === 'dealer') return event.faceDown === true ? 'hole' : event.faceDown === false ? 'dealer' : null;
  return event.to === 'box' && Number.isInteger(event.box) && event.box >= 0 && event.box < 7 ? String(event.box + 1) : null;
}

