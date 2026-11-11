// Page code of game.html: blackjack on top of Pamela's film in the 3D scene.
//
// Three parts meet here and stay apart. The engine (game/, in the lab server behind /api/game) owns rules, shuffle, card
// values and money. The 3D scene (src/scene3d-*.ts) owns the picture and the film queue. This page owns the bets in progress
// and the order of things: it sends a command, turns the answer into film beats, lets the film play, and shows each total
// when its card has landed. Seats are 1–7, seat 1 at camera left.
import {buildGraph} from './clip-graph.ts';
import {createScene} from './scene3d-view.ts';
import {filmToScene, sceneToSpot, solveCamera, type FilmCamera} from './scene3d-geometry.ts';
import {createLayout, slotOf} from './game-table.ts';
import {cardRecords} from './game-director.ts';
import {createFilm, type FilmPlayers} from './game-film.ts';
import {chipsFor, mountOverlay, type Action, type Anchors} from './game-overlay.ts';
import {tableView, tableCards, cardFaces, shownBy, lineOf, betTotal, handKey, CHIP_VALUES, DEALER_KEY, type PageState, type Settled} from './game-view.ts';
import type {Snapshot} from '../game/session.ts';

const $ = (id: string) => document.getElementById(id)!, stage = $('stage'), canvas = $('view') as HTMLCanvasElement, failBox = $('fail');
const fail = (message: string): never => { failBox.textContent = message; throw Error(message); };
const read = async (url: string, what: string) => { const res = await fetch(url).catch(() => null); if (!res?.ok) fail(`${what} kunde inte läsas (${url}).`); return res!.json(); };
const query = new URLSearchParams(location.search);
// The server keeps one session per table name; a second tab or a test opens game.html?table=<name> and plays its own.
const table = /^[a-z0-9-]{1,40}$/.test(query.get('table') ?? '') ? `?table=${query.get('table')}` : '';

const [contract, placements, bank, first] = await Promise.all([read('data/scene-contract.json', 'Scenkontraktet'), read('api/placements', 'Placeringsplanen'), read('api/clip-bank', 'Klippbanken'), read(`api/game${table}`, 'Spelet')]);
const plan = placements.plan ?? placements, graph = buildGraph(bank), layout = createLayout(plan, {fan: query.has('fan') && Number.isFinite(Number(query.get('fan'))) ? Math.max(0, Math.min(80, Number(query.get('fan')))) : null}); // ?fan=<px>: one fan step for every seat, for trying values

// ── the picture: the 3D scene, seen a little from above so that all seven bet rings and the bar have room ──
const scene = createScene(canvas, stage, {contract, plan, urls: {plate: 'assets/scene/room.png', panorama: 'assets/scene/panorama-vegas.jpg', la: 'assets/scene/panorama-la.jpg', skog: 'assets/scene/panorama-skog.jpg'}, onChange: () => {}, onMissingRoom: () => {}});
// Two framings, both by turning and zooming from the film camera's own place (exact for a flat film). Lying: the whole table
// with all seven rings. Standing (a phone): the film's width is locked to the screen's, so the view is zoomed in on seats 3–5
// and turns toward the seat in play.
const FRAMING = {wide: {pitch: -8, zoom: 0.84}, tall: {pitch: -10, zoom: 1.9}, tallBelow: 0.8, turnShare: 0.6, turnLimit: 40};
const fixed = query.has('pitch') || query.has('zoom');
let tall = false, aimed = 0; // aimed: the yaw the view is easing toward, degrees
function frame() {
  const box = stage.getBoundingClientRect(), now = box.width / Math.max(1, box.height) < FRAMING.tallBelow;
  if (now !== tall || !framed) { tall = now; framed = true; stage.classList.toggle('tall', tall); if (!fixed) scene.set(tall ? FRAMING.tall : FRAMING.wide); if (!tall) { aimed = 0; scene.set({yaw: 0}); } }
  scene.resize();
}
let framed = false;
scene.set({format: 'fill', room: (query.get('room') ?? 'panorama') as never, tray: true, cards: true, pitch: Number(query.get('pitch') ?? FRAMING.wide.pitch), zoom: Number(query.get('zoom') ?? FRAMING.wide.zoom)});
scene.rebuild(); scene.start();
new ResizeObserver(frame).observe(stage); frame();
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
    const res = await fetch(`api/game/command${table}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...command, requestId: crypto.randomUUID(), expectedVersion: (paid ?? snapshot).ver})});
    const data = await res.json(); if (!res.ok) throw Error(data.error?.message ?? 'Spelet svarade inte.');
    return data as Snapshot;
  } catch (error) { page.error = (error as Error).message; render(); return null; }
}
// Plays one answered step: film first, the totals as the cards land, then the engine's state as it is.
async function present(next: Snapshot, dealerPlays: boolean) {
  const table = tableCards(next);
  const settle = next.events.find(e => e.type === 'settle') as Settled | undefined;
  // The stakes leave the balance at once; what the round pays back shows when its film has played.
  if (page.stage === 'BETTING') { page.balance -= betTotal(page.bets); page.stage = 'ROUND'; }
  snapshot = next; page.busy = true; page.dealerPlays = dealerPlays;
  render();
  await film.play(next.events, {table, records: cardRecords(table, cardFaces(next))}, beat => {
    if (beat.kind !== 'DEAL' && beat.kind !== 'REVEAL' && beat.kind !== 'PLACE') return;
    const event = next.events.find(e => (e.type === 'deal' || e.type === 'reveal') && e.shoeDraw === beat.own!.shoeDraw), shown = event && shownBy(event);
    if (shown) { page.shown[shown.key] = shown; render(); }
  });
  page.busy = false; page.balance = next.balance; page.line = lineOf(next.events) ?? page.line;
  if (settle || next.view.round?.phase === 'settled') {
    page.stage = 'SETTLED'; page.settled = settle ?? page.settled; render();
    // What the round pays back reaches the balance when it is collected; the cards stay on the table until the next round.
    if (settle) settleChips(settle);
    paid = await send({op: 'collect', roundId: next.view.roundId}); if (paid) page.balance = paid.balance;
  }
  render();
}

const round = () => snapshot.view.round;
// A chip let go over the felt lands in the nearest bet ring: past the rail the player only has to throw it roughly right.
function nearestSeat(clientX: number, clientY: number): number | null {
  const at = scene.pick(clientX, clientY); if (!at) return null;
  let best: {seat: number; distance: number} | null = null;
  for (const spot of scene.spots().bets) { const distance = Math.hypot(spot.x - at.x, spot.s - at.s); if (!best || distance < best.distance) best = {seat: Number(spot.id.slice(1)), distance}; }
  return best?.seat ?? null;
}
const overlay = mountOverlay(stage, {
  aim: nearestSeat,
  chip(value) { page.chip = value; render(); },
  bet(seat, value = page.chip) {
    if (page.stage !== 'BETTING' || page.busy) return;
    const now = (page.bets[seat] ?? []).reduce((a, b) => a + b, 0);
    if (now + value > snapshot.limits.max || betTotal(page.bets) + value > page.balance) return;
    page.bets[seat] = [...(page.bets[seat] ?? []), value]; order.push(seat); render();
  },
  // A chip picked up from a ring: the last one laid there. It leaves the order of laying too, so that Ångra still takes the latest.
  take(seat) {
    if (page.stage !== 'BETTING' || page.busy || !page.bets[seat]?.length) return;
    page.bets[seat] = page.bets[seat].slice(0, -1); if (!page.bets[seat].length) delete page.bets[seat];
    const at = order.lastIndexOf(seat); if (at >= 0) order.splice(at, 1); render();
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
    snapshot = next; paid = null; Object.assign(page, {stage: 'BETTING', bets: {}, shown: {}, settled: null, line: null, balance: next.balance}); order.length = 0; taken.clear(); chips?.clearWinnings();
    film.set({table: {hands: [], dealer: []}, records: [], lying: []}); render();
  },
});
const order: number[] = []; // the seats the chips were laid on, in order, for Ångra
// Jakob's chip tray (assets/props/tray.glb, local media) takes the place of the built tray when it can be read; game.html?tray=built keeps the built one.
// A trial, game.html?bricka=hus: the tray holds the house's own chips (src/game3d-tray.ts), a lost bet is carried into it and winnings out of it.
type HouseTray = {mouth(value: number, taking: boolean): {x: number; y: number; s: number}; add(value: number): boolean; remove(value: number): boolean};
let houseTray: HouseTray | null = null; const taken = new Set<number>(); // the seats whose chips the house has taken this round
if (query.get('bricka') === 'hus') void import('./game3d-tray.ts').then(m => { const tray = m.createHouseTray(scene); scene.notch(tray.notch); scene.addProp(tray); houseTray = tray; }).catch(() => {});
else if (query.get('tray') !== 'built') void import('./game3d-props.ts').then(async m => { const tray = await m.loadTray(scene); scene.notch(tray.notch); scene.addProp(tray); }).catch(() => {});
// When a round is settled: a seat that got back less than it staked loses its chips to the tray, and what a seat got back
// beyond its stake is carried out of the tray and set down beside the bet. Only in the trial with the house's tray.
function settleChips(settle: Settled) {
  const tray = houseTray; if (!tray || !chips) return;
  const seats = new Map<number, {stake: number; returned: number}>();
  for (const hand of settle.hands) { const s = seats.get(hand.seat) ?? {stake: 0, returned: 0}; s.stake += hand.stake; s.returned += hand.returned; seats.set(hand.seat, s); }
  const now = seconds(), into = (value: number) => tray.mouth(value, false), outOf = (value: number) => tray.mouth(value, true);
  for (const [seat, s] of seats) {
    if (s.returned < s.stake) { taken.add(seat); chips.send(seat, into, now, value => { tray.add(value); }); if (s.returned > 0) chips.pay(seat, chipsFor(s.returned, [...CHIP_VALUES]), outOf, now + 0.7, value => { tray.remove(value); }); }
    else if (s.returned > s.stake) chips.pay(seat, chipsFor(s.returned - s.stake, [...CHIP_VALUES]), outOf, now, value => { tray.remove(value); });
  }
}
// The chips in the rings are 3D objects on the table when the module can be read; until then, and if it cannot, the overlay draws them flat.
type Spot3 = {x: number; y: number; s: number};
type Chips = {set(bets: Record<number, number[]>, now: number): void; update(now: number): boolean; send(seat: number, to: (value: number) => Spot3, now: number, arrive: (value: number) => void): void;
  pay(seat: number, values: number[], from: (value: number) => Spot3, now: number, leave: (value: number) => void): void; clearWinnings(): void};
let chips: Chips | null = null;
const seconds = () => performance.now() / 1000;
void import('./game3d-chips.ts').then(m => { const made = m.createChips(scene); scene.addProp(made); chips = made; stage.classList.add('chips3d'); render(); }).catch(() => {});
const render = () => { const view = tableView(snapshot, page); chips?.set(Object.fromEntries(view.seats.map(s => [s.seat, taken.has(s.seat) ? [] : s.chips])), seconds()); if (view.phase === 'TURN' || view.phase === 'BETTING') { if (view.phase === 'TURN') byHand = false; aimAt(view.phase === 'TURN' ? snapshot.view.round?.activeSeat ?? null : null); } overlay.render(view); };

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
// Standing: the view turns toward a seat (most of the way, so the dealer stays in the picture) and eases there.
function aimAt(seat: number | null) {
  const spot = seat === null ? null : scene.spots().bets.find(b => b.id === `P${seat}`), camera = scene.status().camera;
  aimed = !tall || !spot ? 0 : Math.max(-FRAMING.turnLimit, Math.min(FRAMING.turnLimit, Math.atan2(-spot.x * camera.scale, solveCamera(camera).edgeDistance - spot.s * camera.scale) * 180 / Math.PI * FRAMING.turnShare));
}
// A sideways drag on the picture turns the view by hand (standing: to reach the outer seats; lying: to look around); a double click turns it back.
// shot: a view that a clip directs (the dealer leaving): turn, tilt and zoom, and the camera moved up (dy) and back (dz) from its own place.
const SHOT_KEYS = ['yaw', 'pitch', 'zoom', 'dy', 'dz'] as const;
let turning: {x: number; yaw: number} | null = null, byHand = false, shot: Record<typeof SHOT_KEYS[number], number> | null = null;
const framing = () => tall ? FRAMING.tall : FRAMING.wide;
canvas.addEventListener('pointerdown', e => { turning = {x: e.clientX, yaw: scene.state.yaw}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!turning) return; const dx = e.clientX - turning.x; if (Math.abs(dx) > 4) byHand = true; if (byHand) scene.state.yaw = Math.max(-FRAMING.turnLimit, Math.min(FRAMING.turnLimit, turning.yaw + dx * 45 / canvas.clientHeight / Math.max(1, scene.state.zoom))); });
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { turning = null; });
canvas.addEventListener('dblclick', () => { byHand = false; });
scene.onFrame(() => {
  chips?.update(seconds());
  // A clip that directs the view (the dealer leaving) takes it over; otherwise the view eases to the seat in play and to its own tilt.
  if (shot) for (const key of SHOT_KEYS) scene.state[key] += (shot[key] - scene.state[key]) * 0.12;
  else { if (!turning && !byHand && Math.abs(scene.state.yaw - aimed) > 0.02) scene.state.yaw += (aimed - scene.state.yaw) * 0.08;
    if (!fixed) for (const key of ['pitch', 'zoom'] as const) { const left = framing()[key] - scene.state[key]; if (left) scene.state[key] = Math.abs(left) < 0.002 ? framing()[key] : scene.state[key] + left * 0.08; }
    for (const key of ['dy', 'dz'] as const) if (scene.state[key]) scene.state[key] = Math.abs(scene.state[key]) < 0.002 ? 0 : scene.state[key] * 0.92; } // the camera comes home
  const host = stage.getBoundingClientRect(), box = scene.canvas.getBoundingClientRect();
  overlay.place({left: box.left - host.left, top: box.top - host.top, width: box.width, height: box.height}, anchors());
});
render();

// ── a trial: the dealer leaves the table (game.html?prov=utgang) ──
// The film agent's low-resolution probe of a whole-body exit, played in the game as it would be: the hands leave the table in
// a film of the standard frame, then the whole-body film takes over behind the 3D table while the camera pulls back as she
// rises, until she and the whole table are in the picture; she walks out of it. (First tried with the camera in its place,
// tilting up and turning after her: Jakob found looking up at her not pretty, and the turn showed where the film's own frame
// ends, which cut her.) A trial with a blurry probe film, until the real film exists in the clip bank.
if (query.get('prov') === 'utgang') {
  const TRIAL = {lead: {path: 'assets/motions/pamela-table-leave-02/source.mp4', start: 3, end: 30}, probe: {path: 'assets/proofs/helkropp-prov/prov-lag-upplosning-uppskalad.mp4', start: 0, end: 177, frame: {scale: 0.5, anchor: [882, 656], layer: 'BEHIND_TABLE', shadow: false}},
    // rise: the probe's film frames in which she stands up. When she stands the camera has moved back along its line of sight by
    // `back` of its distance to the table's dealer-side edge and `lift` upward (scene units), and the view has tilt `up` and zoom `out`.
    rise: [8, 34], back: 0.75, lift: 0.05, up: -5.5, out: 0.9};
  const button = document.createElement('button'); button.type = 'button'; button.className = 'game-trial'; button.textContent = 'Prov: dealern lämnar bordet'; stage.append(button);
  const ease = (f: number, [a, b]: number[]) => { const t = Math.min(1, Math.max(0, (f - a) / (b - a))); return t * t * (3 - 2 * t); };
  let away = false;
  button.addEventListener('click', async () => {
    if (away) { away = false; shot = null; page.busy = false; page.error = null; button.textContent = 'Prov: dealern lämnar bordet'; film.rest(); render(); return; }
    if (page.busy || page.stage !== 'BETTING') return; // only between rounds
    button.disabled = true; page.busy = true; page.error = 'Prov med lågupplöst film'; render();
    let part = 0; const base = framing(), solved = solveCamera(scene.status().camera), slope = solved.pitch - base.pitch * Math.PI / 180; // the line of sight, radians below the horizontal
    const follow = scene.onFrame(() => { if (part !== 1) return; const risen = ease(scene.players.frame(), TRIAL.rise), reach = TRIAL.back * solved.edgeDistance * risen;
      shot = {yaw: 0, pitch: base.pitch + (TRIAL.up - base.pitch) * risen, zoom: base.zoom + (TRIAL.out - base.zoom) * risen, dz: reach * Math.cos(slope), dy: reach * Math.sin(slope) + TRIAL.lift * risen}; });
    await film.show([{...TRIAL.lead, track: null}, {...TRIAL.probe, track: null}], index => { part = index; });
    follow(); away = true; button.disabled = false; button.textContent = 'Tillbaka till vila';
  });
  Object.assign(window, {gameTrial: TRIAL}); // the numbers can be tried from the console
}
Object.assign(window, {game: {scene, film, page, state: () => snapshot}}); // for the proof recorder and the console; not an interface
