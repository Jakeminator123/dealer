// Blackjack hand rules of the local engine (one Round = one deal, decisions, dealer play and settlement).
// Ported from scoutgaming services/game/games/blackjack/round.mjs at commit 0fe56ace3
// (git blob 3be88ff2e2395ad3038c3c76c187c770ece95d66). Logic unchanged; only types added.
// Class fields are `declare`d so the runtime object keeps exactly the JavaScript shape
// (no field initialisers run before the constructor), and draw() has one type-only `!`.
// One lab deviation: isBJ and isNatural are exported (seats.ts reports naturals with them).
//
// Scout's header, kept: ported from Kevin's vendor/croupier/public/blackjack.mjs @ 5aa7ed1.
// Changes: the shuffle (and its crypto randomness) lives in core.mjs behind an explicit
// input port, and Round requires a draw source instead of defaulting to a fresh shoe.
// Rules: eight-deck cut-card shoe, S17, American
// hole card with peek, blackjack 3:2, insurance 2:1, double any two, split to
// 4 hands (aces get one card each), double after split, no surrender, up to
// 7 boxes. Side bets, settled at deal time: Perfect Pairs
// (perfect 25:1 / colored 12:1 / mixed 6:1) and 21+3 (suited trips 100:1 /
// straight flush 40:1 / trips 30:1 / straight 10:1 / flush 5:1).
//
// `box` is Scout's seat index 0–6 (0 = camera-left). Outside round/core/presentation the
// lab speaks seats 1–7; seats.ts is the only place that converts.

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type Suit = '♠' | '♥' | '♦' | '♣';
export type Action = 'hit' | 'stand' | 'double' | 'split';
export type Phase = 'dealing' | 'insurance' | 'decisions' | 'dealer' | 'settled';
/** A card. `serial` (1–416) is the physical card of the unshuffled shoe; `shoeDraw` is its draw position (1 = burn). */
export interface Card { r: Rank; s: Suit; serial?: number; shoeDraw?: number }
export interface SideResult { stake: number; returned: number; profit: number; label: string; draws: Array<number | undefined> }
export interface Hand {
  box: number; splitFrom: number | null;
  stake: number; pp: number; tp: number;
  cards: Card[]; done: boolean; doubled: boolean; insured: number; result: number | null;
  sideReturn: number; sideLabels: string[];
  sideResults?: { pp?: SideResult; tp?: SideResult };
  busted?: boolean;
}
export interface RoundEvent { e: string; box?: number; seat?: number; stake?: number; card?: Card }
/** What Round draws from: the core's numbering adapter ({draw}) or, in rule tests, a plain array (pop from the end). */
export interface DrawSource { draw?(): Card; pop?(): Card | undefined }
export type BoxBet = number | { main: number; pp?: number; tp?: number };

export const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const SUITS: Suit[] = ['♠','♥','♦','♣'];

export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { aces++; total += 11; }
    else total += ['J','Q','K','10'].includes(c.r) ? 10 : Number(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const soft = aces > 0;
  return { total, soft };
}
// Exported (lab deviation: Scout keeps isBJ and isNatural module-private) so seats.ts can tell
// the overlay "blackjack" with the core's own test instead of the overlay deciding it.
export const isBJ = (cards: readonly Card[]) => cards.length === 2 && handValue(cards).total === 21;
// A natural pays 3:2. A two-card 21 on a hand that came out of a split does
// NOT: it is an ordinary 21 and pays 1:1.
export const isNatural = (hand: Hand) => hand.splitFrom === null && isBJ(hand.cards);
const MAX_HANDS_PER_BOX = 4; // 3 splits
const tenVal = (c: Card) => ['10','J','Q','K'].includes(c.r);
const isRed = (c: Card) => c.s === '♥' || c.s === '♦';
const rankOrd = (c: Card) => RANKS.indexOf(c.r) + 1; // A=1, 2..10, J=11, Q=12, K=13

// Perfect Pairs: player's first two cards. Returns {name, pays} or null.
function perfectPairsHit(c1: Card, c2: Card) {
  if (c1.r !== c2.r) return null;
  if (c1.s === c2.s) return { name: 'Perfect Pair', pays: 25 };
  if (isRed(c1) === isRed(c2)) return { name: 'Colored Pair', pays: 12 };
  return { name: 'Mixed Pair', pays: 6 };
}

// 21+3: player's first two cards + dealer upcard. Returns {name, pays} or null.
// Straights: ace high or low (A-2-3 and Q-K-A valid, no K-A-2 wraparound).
function isStraight3(cards: readonly Card[]) {
  const v = cards.map(rankOrd).sort((a, b) => a - b);
  if (v[0] === v[1] || v[1] === v[2]) return false; // needs 3 distinct ranks
  if (v[0] + 1 === v[1] && v[1] + 1 === v[2]) return true; // ace low / no ace
  return v[0] === 1 && v[1] === 12 && v[2] === 13;          // ace high: Q-K-A
}
function twentyOnePlusThreeHit(cards: readonly Card[]) {
  const suited = cards.every(c => c.s === cards[0].s);
  if (cards.every(c => c.r === cards[0].r))
    return suited ? { name: 'Suited Three of a Kind', pays: 100 } : { name: 'Three of a Kind', pays: 30 };
  const straight = isStraight3(cards);
  if (straight && suited) return { name: 'Straight Flush', pays: 40 };
  if (straight) return { name: 'Straight', pays: 10 };
  if (suited) return { name: 'Flush', pays: 5 };
  return null;
}

export class Round {
  declare shoe: DrawSource;
  declare boxes: Hand[];
  declare hands: Hand[];
  declare dealer: Card[];
  declare holeCard: Card;
  declare phase: Phase;
  declare active: number;
  declare events: RoundEvent[];
  // boxes: array of stakes, e.g. [25] or [25, 0, 100] (0 = empty box), or of
  // objects {main, pp, tp} (numbers, 0 = not placed). A box is live when
  // main > 0; pp/tp without main are ignored.
  //
  // boxes[i] is the SEAT record and doubles as that seat's FIRST hand.
  // this.hands (== live()) is the flat, ordered list of playable hands: it
  // starts as one hand per live box and grows as boxes are split. Every hand
  // carries `box` (its index into this.boxes) and `splitFrom` (null until the
  // hand takes part in a split, then the box index).
  constructor(boxes: BoxBet[], shoe: DrawSource) {
    this.shoe = shoe;
    this.boxes = boxes.map((box, i) => {
      const o = typeof box === 'object' && box !== null ? box : { main: box };
      return {
        box: i, splitFrom: null,
        stake: o.main || 0, pp: o.pp || 0, tp: o.tp || 0,
        cards: [], done: false, doubled: false, insured: 0, result: null,
        sideReturn: 0, sideLabels: [],
      };
    });
    this.hands = this.boxes.filter(b => b.stake > 0);
    this.dealer = [];
    this.phase = 'dealing';
    this.active = -1;
    this.events = [];
  }
  emit(e: string, data?: Omit<RoundEvent, 'e'>) { this.events.push({ e, ...data }); }
  draw(): Card {
    const card = this.shoe.draw ? this.shoe.draw() : this.shoe.pop!();
    if (!card) throw new Error('Shoe exhausted');
    return card;
  }

  deal() {
    // right-to-left off the shoe: the rightmost seat receives first
    const order = [...this.live()].reverse();
    for (const b of order) b.cards.push(this.draw());
    this.dealer.push(this.draw());             // upcard
    for (const b of order) b.cards.push(this.draw());
    this.holeCard = this.draw();               // face down, dealt but hidden
    this.settleSideBets();
    this.emit('round.dealt');
    const up = this.dealer[0];
    if (up.r === 'A') { this.phase = 'insurance'; this.emit('insurance.offered'); return; }
    this.afterInsurance();
  }

  // Every playable hand, left to right, split hands sitting next to the hand
  // they came from. Indices shift when a box splits, so re-read it after act().
  live() { return this.hands; }

  // Side bets settle off the first two player cards + dealer upcard, right at
  // the deal. "pays N:1" => total return = stake * (N + 1); loss = 0.
  settleSideBets() {
    const up = this.dealer[0];
    for (const b of this.live()) {
      b.sideResults={};
      if (b.pp > 0) {
        b.sideResults.pp={stake:b.pp,returned:0,profit:-b.pp,label:'Perfect Pairs lost',draws:b.cards.slice(0,2).map(c=>c.shoeDraw)};
        const hit = perfectPairsHit(b.cards[0], b.cards[1]);
        if (hit) {
          const returned=b.pp*(hit.pays+1);
          b.sideResults.pp={stake:b.pp,returned,profit:returned-b.pp,label:hit.name,draws:b.cards.slice(0,2).map(c=>c.shoeDraw)};
          b.sideReturn += returned;
          b.sideLabels.push(`${hit.name} ${hit.pays}:1`);
        }
      }
      if (b.tp > 0) {
        b.sideResults.tp={stake:b.tp,returned:0,profit:-b.tp,label:'21+3 lost',draws:[...b.cards.slice(0,2),up].map(c=>c.shoeDraw)};
        const hit = twentyOnePlusThreeHit([b.cards[0], b.cards[1], up]);
        if (hit) {
          const returned=b.tp*(hit.pays+1);
          b.sideResults.tp={stake:b.tp,returned,profit:returned-b.tp,label:hit.name,draws:[...b.cards.slice(0,2),up].map(c=>c.shoeDraw)};
          b.sideReturn += returned;
          b.sideLabels.push(`${hit.name} ${hit.pays}:1`);
        }
      }
    }
  }

  // insuranceTaken: array of booleans matching live() order
  resolveInsurance(insuranceTaken: boolean[] = []) {
    this.live().forEach((b, i) => {
      if (insuranceTaken[i]) b.insured = b.stake / 2;
    });
    this.afterInsurance();
  }

  afterInsurance() {
    const up = this.dealer[0];
    if (up.r === 'A' || tenVal(up)) {
      this.emit('dealer.peek');
      if (isBJ([up, this.holeCard])) {
        this.dealer.push(this.holeCard);
        this.emit('dealer.blackjack');
        this.settle();
        return;
      }
    }
    this.phase = 'decisions';
    this.advance();
  }

  advance() {
    const hands = this.live();
    this.active = hands.findLastIndex(b => !b.done);
    if (this.active === -1) { this.dealerPlay(); return; }
    const b = hands[this.active];
    if (handValue(b.cards).total >= 21) { b.done = true; this.advance(); return; }
    this.emit('hand.thinking', { box: this.active });
  }

  // Same rank, or any two ten-valued cards; first two cards only (a hit hand
  // holds three); and the box is not already at its 4-hand cap. Split aces are
  // marked done the moment they are dealt, so they never reach here.
  canSplit(b: Hand) {
    if (b.cards.length !== 2) return false;
    if (this.hands.filter(h => h.box === b.box).length >= MAX_HANDS_PER_BOX) return false;
    const [c1, c2] = b.cards;
    return c1.r === c2.r || (tenVal(c1) && tenVal(c2));
  }

  legal(): Action[] {
    const b = this.live()[this.active];
    if (!b) return [];
    const acts: Action[] = ['hit', 'stand'];
    if (b.cards.length === 2 && !b.doubled) acts.push('double');
    if (this.canSplit(b)) acts.push('split');
    return acts;
  }

  act(action: string) {
    const b = this.live()[this.active];
    if (!b || !(this.legal() as string[]).includes(action)) throw new Error(`illegal action ${action}`);
    if (action === 'hit') {
      b.cards.push(this.draw());
      this.emit('card.dealt', { box: this.active, card: b.cards.at(-1) });
      const tot = handValue(b.cards).total;
      if (tot >= 21) b.done = true;
      if (tot > 21) b.busted = true;
    } else if (action === 'double') {
      b.doubled = true; b.stake *= 2;
      b.cards.push(this.draw());
      this.emit('card.dealt', { box: this.active, card: b.cards.at(-1) });
      b.done = true;
      if (handValue(b.cards).total > 21) b.busted = true;
    } else if (action === 'split') {
      this.split(b);
      return;
    } else b.done = true;
    if (b.done) this.advance();
  }

  // The second card moves to a new hand that costs another bet of the same
  // size and sits immediately to the right of its parent, so a box's hands
  // stay contiguous and still play right to left. Side bets and insurance
  // belong to the box and stay on the parent hand: they are never duplicated.
  split(b: Hand) {
    const i = this.active;
    const aces = b.cards[0].r === 'A';
    const moved = b.cards.pop() as Card;
    const nh: Hand = {
      box: b.box, splitFrom: b.box,
      stake: b.stake, pp: 0, tp: 0,
      cards: [moved], done: false, doubled: false, insured: 0, result: null,
      sideReturn: 0, sideLabels: [],
    };
    b.splitFrom = b.box;
    this.hands.splice(i + 1, 0, nh);
    this.emit('hand.split', { box: this.active, seat: b.box, stake: nh.stake });
    b.cards.push(this.draw());
    this.emit('card.dealt', { box: i, card: b.cards.at(-1) });
    nh.cards.push(this.draw());
    this.emit('card.dealt', { box: i + 1, card: nh.cards.at(-1) });
    if (aces) { b.done = true; nh.done = true; }  // one card each, no further action
    this.advance();
  }

  dealerPlay() {
    this.phase = 'dealer';
    this.dealer.push(this.holeCard);
    this.emit('dealer.reveal');
    // true if ANY hand on ANY box can still be beaten or beaten by a draw
    const anyLive = this.live().some(b => !b.busted && handValue(b.cards).total <= 21 && !isNatural(b));
    if (anyLive) {
      // S17: stand on ALL 17s including soft
      while (handValue(this.dealer).total < 17) {
        this.dealer.push(this.draw());
        this.emit('dealer.draw', { card: this.dealer.at(-1) });
      }
    }
    this.settle();
  }

  settle() {
    this.phase = 'settled';
    const d = handValue(this.dealer).total;
    const dealerBJ = isBJ(this.dealer);
    for (const b of this.live()) {
      const p = handValue(b.cards).total;
      let payout = 0; // total returned to player (stake included when won/pushed)
      if (b.insured) payout += dealerBJ ? b.insured * 3 : 0;
      // A busted hand NEVER collects on the main bet, even if the dealer also
      // goes over. Player acts first; busting is an immediate loss.
      if (p > 21 || b.busted) {
        b.busted = true;
      } else if (isNatural(b)) {
        payout += dealerBJ ? b.stake : b.stake * 2.5;
      } else if (dealerBJ) {
        payout += 0;
      } else if (d > 21 || p > d) {
        payout += b.stake * 2;
      } else if (p === d) {
        payout += b.stake;
      }
      b.result = payout;
    }
    this.emit('round.settled');
  }
}
