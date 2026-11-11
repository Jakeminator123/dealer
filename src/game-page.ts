// Page code of game.html: blackjack on top of Pamela's film in the 3D scene.
//
// Three parts meet here and stay apart. The engine (game/, in the lab server behind /api/game) owns rules, shuffle, card
// values and money. The 3D scene (src/scene3d-*.ts) owns the picture and the film queue. This page owns the bets in progress
// and the order of things: it sends a command, turns the answer into film beats, lets the film play, and shows each total
// when its card has landed. Seats are 1–7, seat 1 at camera left.
import {buildGraph} from './clip-graph.ts';
import {createScene} from './scene3d-view.ts';
import {filmToScene, sceneToSpot, type FilmCamera} from './scene3d-geometry.ts';
import {createLayout, slotOf} from './game-table.ts';
import {planBeats, cardRecords} from './game-director.ts';
import {createFilm, type FilmPlayers} from './game-film.ts';
import {mountOverlay, type Action, type Anchors} from './game-overlay.ts';
import {tableView, tableCards, cardFaces, shownBy, lineOf, betTotal, handKey, DEALER_KEY, type PageState, type Settled} from './game-view.ts';
import type {Snapshot} from '../game/session.ts';

const $ = (id: string) => document.getElementById(id)!, stage = $('stage'), canvas = $('view') as HTMLCanvasElement, failBox = $('fail');
const fail = (message: string): never => { failBox.textContent = message; throw Error(message); };
const read = async (url: string, what: string) => { const res = await fetch(url).catch(() => null); if (!res?.ok) fail(`${what} kunde inte läsas (${url}).`); return res!.json(); };
const query = new URLSearchParams(location.search);

const [contract, placements, bank, first] = await Promise.all([read('data/scene-contract.json', 'Scenkontraktet'), read('api/placements', 'Placeringsplanen'), read('api/clip-bank', 'Klippbanken'), read('api/game', 'Spelet')]);
const plan = placements.plan ?? placements, graph = buildGraph(bank), layout = createLayout(plan);

// ── the picture: the 3D scene, seen a little from above so that all seven bet rings and the bar have room ──
const scene = createScene(canvas, stage, {contract, plan, urls: {plate: 'assets/scene/room.png', panorama: 'assets/scene/panorama-vegas.jpg', la: 'assets/scene/panorama-la.jpg', skog: 'assets/scene/panorama-skog.jpg'}, onChange: () => {}, onMissingRoom: () => {}});
scene.set({format: 'fill', room: (query.get('room') ?? 'panorama') as never, tray: true, cards: true, pitch: Number(query.get('pitch') ?? -8), zoom: Number(query.get('zoom') ?? 0.84)});
scene.rebuild(); scene.start();
new ResizeObserver(() => scene.resize()).observe(stage);
const film = createFilm(scene.players as unknown as FilmPlayers, graph, layout, path => fetch(path).then(res => res.ok ? res.json() : null));

// ── state ──
let snapshot: Snapshot = first, paid: Snapshot | null = null; // snapshot: the round on the table. paid: the engine's state after that round was collected.
const page: PageState = {stage: 'BETTING', busy: false, dealerPlays: false, bets: {}, last: null, chip: 25, balance: snapshot.balance, shown: {}, settled: null, line: null, error: null};
// A round found in progress when the page opens (the server keeps the session): its cards are laid out without film.
if (snapshot.view.round && snapshot.view.round.phase !== 'settled') { page.stage = 'ROUND'; const table = tableCards(snapshot); film.set({table, records: cardRecords(table, cardFaces(snapshot)), lying: [...table.hands.flatMap(h => h.cards), ...table.dealer]}); }
else if (snapshot.view.round) { page.stage = 'SETTLED'; const table = tableCards(snapshot); film.set({table, records: cardRecords(table, cardFaces(snapshot)), lying: [...table.hands.flatMap(h => h.cards), ...table.dealer]}); }
else film.rest();

// ── commands to the engine ──
async function send(command: Record<string, unknown>): Promise<Snapshot | null> {
  page.error = null;
  try {
    const res = await fetch('api/game/command', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...command, requestId: crypto.randomUUID(), expectedVersion: (paid ?? snapshot).ver})});
    const data = await res.json(); if (!res.ok) throw Error(data.error?.message ?? 'Spelet svarade inte.');
    return data as Snapshot;
  } catch (error) { page.error = (error as Error).message; render(); return null; }
}
// Plays one answered step: film first, the totals as the cards land, then the engine's state as it is.
async function present(next: Snapshot, dealerPlays: boolean) {
  const table = tableCards(next), beats = planBeats(table, film.lying, next.events);
  const settle = next.events.find(e => e.type === 'settle') as Settled | undefined;
  // The stakes leave the balance at once; what the round pays back shows when its film has played.
  if (page.stage === 'BETTING') { page.balance -= betTotal(page.bets); page.stage = 'ROUND'; }
  snapshot = next; page.busy = true; page.dealerPlays = dealerPlays;
  render();
  await film.play(beats, {table, records: cardRecords(table, cardFaces(next))}, beat => {
    if (beat.kind !== 'DEAL' && beat.kind !== 'REVEAL') return;
    const event = next.events.find(e => (e.type === 'deal' || e.type === 'reveal') && e.shoeDraw === beat.own!.shoeDraw), shown = event && shownBy(event);
    if (shown) { page.shown[shown.key] = shown; render(); }
  });
  page.busy = false; page.balance = next.balance; page.line = lineOf(next.events) ?? page.line;
  if (settle || next.view.round?.phase === 'settled') {
    page.stage = 'SETTLED'; page.settled = settle ?? page.settled; render();
    // What the round pays back reaches the balance when it is collected; the cards stay on the table until the next round.
    paid = await send({op: 'collect', roundId: next.view.roundId}); if (paid) page.balance = paid.balance;
  }
  render();
}

const round = () => snapshot.view.round;
const overlay = mountOverlay(stage, {
  chip(value) { page.chip = value; render(); },
  bet(seat, value = page.chip) {
    if (page.stage !== 'BETTING' || page.busy) return;
    const now = (page.bets[seat] ?? []).reduce((a, b) => a + b, 0);
    if (now + value > snapshot.limits.max || betTotal(page.bets) + value > page.balance) return;
    page.bets[seat] = [...(page.bets[seat] ?? []), value]; order.push(seat); render();
  },
  undo() { const seat = order.pop(); if (seat === undefined) return; page.bets[seat] = page.bets[seat].slice(0, -1); if (!page.bets[seat].length) delete page.bets[seat]; render(); },
  clear() { page.bets = {}; order.length = 0; render(); },
  rebet() { if (!page.last) return; page.bets = Object.fromEntries(Object.entries(page.last).map(([seat, chips]) => [seat, [...chips]])); order.length = 0; for (const [seat, chips] of Object.entries(page.bets)) for (const _ of chips) order.push(Number(seat)); render(); },
  async deal() {
    if (page.busy || !betTotal(page.bets)) return;
    const bets = Object.entries(page.bets).map(([seat, chips]) => ({seat: Number(seat), main: chips.reduce((a, b) => a + b, 0)}));
    page.busy = true; render();
    const next = await send({op: 'start', bets}); if (!next) { page.busy = false; render(); return; }
    page.last = page.bets; page.shown = {}; page.settled = null; page.line = null;
    await present(next, false);
  },
  async act(action: Action) {
    const r = round(); if (page.busy || !r || r.activeSeat === null) return;
    page.busy = true; render();
    const next = await send({op: 'act', seat: r.activeSeat, handIndex: r.active, action, roundId: snapshot.view.roundId, turnSeq: snapshot.view.turnSeq}); if (!next) { page.busy = false; render(); return; }
    await present(next, next.view.round?.phase === 'settled' || next.view.round?.phase === 'dealer');
  },
  async insurance(take: boolean) {
    if (page.busy) return; page.busy = true; render();
    const next = await send({op: 'insurance', roundId: snapshot.view.roundId, take}); if (!next) { page.busy = false; render(); return; }
    await present(next, next.view.round?.phase === 'settled');
  },
  async next() {
    if (page.busy) return; page.busy = true; render();
    const next = paid ?? await send({op: 'collect', roundId: snapshot.view.roundId}); page.busy = false; if (!next) { render(); return; }
    snapshot = next; paid = null; Object.assign(page, {stage: 'BETTING', bets: {}, shown: {}, settled: null, line: null, balance: next.balance}); order.length = 0;
    film.set({table: {hands: [], dealer: []}, records: [], lying: []}); render();
  },
});
const order: number[] = []; // the seats the chips were laid on, in order, for Ångra
const render = () => overlay.render(tableView(snapshot, page));

// ── where things are in the picture ──
// A film pixel on the felt as the scene's own table point (dealer metres: x across, s from the dealer's edge).
const TOTAL_LEFT = 0.036; // dealer metres from the first card's centre to the total, a little more than a card's width
const spotOf = (camera: FilmCamera, px: number, py: number) => { const p = filmToScene(camera, px, py); return sceneToSpot(camera, p[0], p[2]); };
function anchors(): Anchors {
  const camera = scene.status().camera, out: Anchors = {bets: {}, hands: {}}, table = tableCards(snapshot);
  for (const spot of scene.spots().bets) { const at = scene.project(spot.x, spot.s); if (at.visible) out.bets[Number(spot.id.slice(1))] = {x: at.x, y: at.y, ring: spot.radius * 2 * at.pxPerM}; }
  // A hand's total stands just left of its first card: the cards fan out to the right, so it is never under them.
  const pin = (key: string, shoeDraw: number | undefined) => {
    const slot = shoeDraw === undefined ? null : slotOf(table, shoeDraw), centre = slot && layout.centre(slot), spot = centre && spotOf(camera, centre.x, centre.y), at = spot && scene.project(spot.x - TOTAL_LEFT, spot.s);
    if (at?.visible) out.hands[key] = {x: at.x, y: at.y};
  };
  const counts = new Map<number, number>();
  for (const hand of table.hands) { const n = counts.get(hand.seat) ?? 0; counts.set(hand.seat, n + 1); pin(handKey(hand.seat, n), hand.cards[0]); }
  pin(DEALER_KEY, table.dealer[0]);
  return out;
}
scene.onFrame(() => {
  const host = stage.getBoundingClientRect(), box = scene.canvas.getBoundingClientRect();
  overlay.place({left: box.left - host.left, top: box.top - host.top, width: box.width, height: box.height}, anchors());
});
render();
Object.assign(window, {game: {scene, film, page, state: () => snapshot}}); // for the proof recorder and the console; not an interface
