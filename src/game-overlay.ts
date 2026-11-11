// The game overlay: bet rings, chip stacks, totals, results and the bar with chips and buttons, as HTML over the picture.
// It only shows what it is given (a TableView) and reports what was pressed. It holds no rules, no values and no money:
// totals, legal actions and results come from the engine (game/), bets in progress from the page. Seats are 1–7.
export type Phase = 'BETTING' | 'DEALING' | 'INSURANCE' | 'TURN' | 'DEALER' | 'SETTLED';
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose';
export type Action = 'hit' | 'stand' | 'double' | 'split';
export type HandView = {key: string; total: number | null; soft: boolean; state: 'BUST' | 'BLACKJACK' | null; active: boolean; outcome: Outcome | null; net: number | null};
export type SeatView = {seat: number; chips: number[]; amount: number; hands: HandView[]; turn: boolean};
export type TableView = {
  phase: Phase; balance: number; staked: number; seats: SeatView[]; dealer: HandView | null;
  chipValues: number[]; chip: number; canDeal: boolean; canUndo: boolean; canRebet: boolean; actions: Action[]; message: string;
};
export type Handlers = {
  chip(value: number): void; bet(seat: number, value?: number): void; undo(): void; clear(): void; rebet(): void; deal(): void;
  act(action: Action): void; insurance(take: boolean): void; next(): void;
};
// Where things are in the picture, in CSS pixels of the overlay box. ring: width of a bet ring. A missing key is hidden.
export type Anchors = {bets: Record<number, {x: number; y: number; ring: number} | undefined>; hands: Record<string, {x: number; y: number} | undefined>};

const ACTION_LABEL: Record<Action, string> = {hit: 'Kort', stand: 'Stanna', double: 'Dubbla', split: 'Dela'};
const RESULT_LABEL: Record<Outcome, string> = {blackjack: 'Blackjack', win: 'Vinst', push: 'Lika', lose: 'Förlust'};
const money = (n: number) => n.toLocaleString('sv-SE', {maximumFractionDigits: 1});
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
const chipFace = (value: number) => { const c = el('span', 'go-chip'); c.dataset.v = String(value); c.append(el('span', '', value >= 1000 ? `${value / 1000}k` : String(value))); return c; };
/** The fewest chips that make an amount, largest first; what cannot be made with the values is left out. */
export function chipsFor(amount: number, values: number[]): number[] {
  const out: number[] = []; let left = amount;
  for (const v of [...values].sort((a, b) => b - a)) while (left >= v && out.length < 40) { out.push(v); left -= v; }
  return out;
}
/** How a total is written: 17, or 7/17 while an ace still counts both ways. */
export const totalText = (hand: {total: number | null; soft: boolean}) => hand.total === null ? '' : hand.soft && hand.total <= 21 && hand.total > 11 ? `${hand.total - 10}/${hand.total}` : String(hand.total);

export function mountOverlay(host: HTMLElement, on: Handlers) {
  const root = el('div', 'go'), status = el('div', 'go-status'), table = el('div'), bar = el('div', 'go-bar');
  root.append(status, table, bar); host.append(root);

  // ── bar ──
  const wallet = el('dl', 'go-wallet'), balance = el('dd'), staked = el('dd');
  wallet.append(el('dt', '', 'Saldo'), balance, el('dt', '', 'Insats'), staked);
  const group = (...kids: Node[]) => { const g = el('div', 'go-group'); g.append(...kids); return g; };
  const button = (text: string, className: string, click: () => void) => { const b = el('button', `go-btn ${className}`, text); b.type = 'button'; b.addEventListener('click', click); return b; };
  const rail = group(); rail.classList.add('go-rail');
  const undo = button('Ångra', 'small', () => on.undo()), clear = button('Rensa', 'small', () => on.clear()), rebet = button('Samma igen', 'small', () => on.rebet()), deal = button('Dela ut', 'primary', () => on.deal());
  const betting = group(rail, undo, clear, rebet, deal);
  const acts = Object.fromEntries((['hit', 'stand', 'double', 'split'] as Action[]).map(a => [a, button(ACTION_LABEL[a], a === 'hit' ? 'act primary' : 'act', () => on.act(a))])) as Record<Action, HTMLButtonElement>;
  const playing = group(acts.hit, acts.stand, acts.double, acts.split);
  const insuring = group(el('span', 'go-note', 'Försäkring mot blackjack?'), button('Ja', 'act', () => on.insurance(true)), button('Nej', 'act primary', () => on.insurance(false)));
  const settled = group(button('Ny runda', 'primary', () => on.next()));
  const waiting = group(el('span', 'go-note'));
  bar.append(wallet, betting, playing, insuring, settled, waiting);

  // ── chips in the rail: press to choose, or drag one onto a ring ──
  let railValues = '', drag: {value: number; ghost: HTMLElement | null; x: number; y: number; ring: Element | null} | null = null;
  const ringUnder = (x: number, y: number) => document.elementsFromPoint(x, y).find(n => n.classList.contains('go-ring')) ?? null;
  function buildRail(values: number[]) {
    rail.replaceChildren(...values.map(value => {
      const b = el('button'); b.type = 'button'; b.dataset.value = String(value); b.title = `Marker ${value}`; b.append(chipFace(value));
      b.addEventListener('pointerdown', e => { if (b.disabled) return; drag = {value, ghost: null, x: e.clientX, y: e.clientY, ring: null}; b.setPointerCapture(e.pointerId); });
      b.addEventListener('pointermove', e => {
        if (!drag) return;
        if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.ghost = chipFace(value); drag.ghost.classList.add('go-ghost'); drag.ghost.style.fontSize = getComputedStyle(root).fontSize; document.body.append(drag.ghost); }
        if (!drag.ghost) return;
        drag.ghost.style.setProperty('--x', `${e.clientX}px`); drag.ghost.style.setProperty('--y', `${e.clientY}px`);
        const ring = ringUnder(e.clientX, e.clientY); if (ring !== drag.ring) { drag.ring?.classList.remove('drop'); ring?.classList.add('drop'); drag.ring = ring; }
      });
      const end = (e: PointerEvent, cancelled: boolean) => {
        if (!drag) return; const d = drag; drag = null; d.ghost?.remove(); d.ring?.classList.remove('drop');
        if (cancelled) return;
        if (!d.ghost) { on.chip(value); return; } // a press without a drag chooses the chip
        const seat = Number((ringUnder(e.clientX, e.clientY) as HTMLElement | null)?.dataset.seat); if (seat) on.bet(seat, value);
      };
      b.addEventListener('pointerup', e => end(e, false)); b.addEventListener('pointercancel', e => end(e, true));
      return b;
    }));
  }

  // ── things on the table ──
  const seats = new Map<number, {pin: HTMLElement; ring: HTMLButtonElement; stack: HTMLElement; amount: HTMLElement; chips: string}>(), totals = new Map<string, {pin: HTMLElement; sum: HTMLElement; result: HTMLElement}>();
  function seatNode(seat: number) {
    let node = seats.get(seat);
    if (!node) {
      const pin = el('div', 'go-pin'), ring = el('button', 'go-ring'), stack = el('span', 'go-stack'), amount = el('span', 'go-amount');
      ring.type = 'button'; ring.dataset.seat = String(seat); ring.append(stack, amount, el('span')); ring.addEventListener('click', () => on.bet(seat));
      pin.append(ring); pin.hidden = true; table.append(pin); node = {pin, ring, stack, amount, chips: ''}; seats.set(seat, node);
    }
    return node;
  }
  function totalNode(key: string) {
    let node = totals.get(key);
    if (!node) { const pin = el('div', 'go-pin go-total'), sum = el('span', 'go-sum'), result = el('span', 'go-result'); pin.append(sum, result); pin.hidden = true; table.append(pin); node = {pin, sum, result}; totals.set(key, node); }
    return node;
  }
  let anchors: Anchors = {bets: {}, hands: {}};
  const put = (pin: HTMLElement, at: {x: number; y: number} | undefined, show = true) => { pin.hidden = !at || !show; if (at) pin.style.transform = `translate(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px)`; };
  function place() {
    for (const [seat, node] of seats) { const at = anchors.bets[seat]; put(node.pin, at); if (at) node.ring.style.setProperty('--ring', `${at.ring.toFixed(1)}px`); }
    for (const [key, node] of totals) put(node.pin, anchors.hands[key], node.sum.textContent !== '' || node.result.textContent !== '');
  }

  function render(view: TableView) {
    root.dataset.phase = view.phase; status.innerHTML = view.message;
    balance.textContent = money(view.balance); staked.textContent = money(view.staked);
    if (railValues !== view.chipValues.join()) { railValues = view.chipValues.join(); buildRail(view.chipValues); }
    const bettingNow = view.phase === 'BETTING';
    rail.querySelectorAll('button').forEach(b => { const value = Number(b.dataset.value); b.setAttribute('aria-pressed', String(value === view.chip)); b.disabled = !bettingNow || value > view.balance - view.staked; });
    betting.hidden = !bettingNow; playing.hidden = view.phase !== 'TURN'; insuring.hidden = view.phase !== 'INSURANCE'; settled.hidden = view.phase !== 'SETTLED';
    waiting.hidden = view.phase !== 'DEALING' && view.phase !== 'DEALER'; waiting.firstElementChild!.textContent = view.phase === 'DEALER' ? 'Dealern spelar …' : 'Korten delas ut …';
    undo.disabled = !view.canUndo; clear.disabled = !view.canUndo; rebet.disabled = !view.canRebet; deal.disabled = !view.canDeal;
    for (const a of Object.keys(acts) as Action[]) acts[a].disabled = !view.actions.includes(a); // all four stay in place, so a button never moves under the finger
    const live = new Set<string>();
    for (const s of view.seats) {
      const node = seatNode(s.seat), chips = s.chips.join();
      node.ring.classList.toggle('turn', s.turn); node.ring.disabled = !bettingNow; node.amount.textContent = s.amount ? money(s.amount) : '';
      if (node.chips !== chips) { // only the chips that are new drop in
        const had = node.stack.children.length, shown = s.chips.slice(-8);
        node.stack.replaceChildren(...shown.map((value, i) => { const c = chipFace(value); c.style.setProperty('--i', String(i)); if (i < had && chips.startsWith(node!.chips)) c.style.animation = 'none'; return c; }));
        node.chips = chips;
      }
      for (const h of s.hands) { live.add(h.key); paintHand(h); }
    }
    if (view.dealer) { live.add(view.dealer.key); paintHand(view.dealer); }
    for (const [key, node] of totals) if (!live.has(key)) { node.pin.remove(); totals.delete(key); }
    place();
  }
  function paintHand(h: HandView) {
    const node = totalNode(h.key), text = h.state === 'BLACKJACK' ? 'BJ' : totalText(h);
    if (node.sum.textContent !== text) node.sum.textContent = text;
    node.sum.hidden = !text; node.pin.classList.toggle('active', h.active); node.pin.dataset.state = h.state ?? '';
    const result = h.outcome ? `${RESULT_LABEL[h.outcome]}${h.net ? ` ${h.net > 0 ? '+' : '−'}${money(Math.abs(h.net))}` : ''}` : '';
    if (node.result.textContent !== result) { node.result.textContent = result; node.result.dataset.o = h.outcome ?? ''; }
  }
  return {
    root, render,
    /** Called whenever the picture moves: the overlay box (CSS pixels within the host) and where things are in it. */
    place(box: {left: number; top: number; width: number; height: number}, next: Anchors) { Object.assign(root.style, {left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`}); anchors = next; place(); },
    destroy() { drag?.ghost?.remove(); root.remove(); },
  };
}
