// The doll lab (Jakob 2026-11-23): the white doll at the table in a view the mouse turns, set in her poses (A1, A2.1,
// A2.3) and dealing one card from A2.3 to any place of his plan in one movement, with play, pause, scrubbing and speed,
// the joints marked, a handful of sliders that lay the deal again as they are moved, and "Spara som standard", which
// writes what is shown as a motion file for that doll and place (dealer3d/standard/<doll>-<place>.json; the routes are
// dealer3d/page/server.ts). The room and the doll are dealer3d/src/stage.ts's (page/lab-stage.ts), a deal is laid by
// dealer3d/src/two-hand.ts from the recipe of a stored deal (page/lay.ts) and posed on the doll paow as
// dealer3d/tools/doll-pose.ts poses it (page/pose-on-doll.ts): nothing is drawn or posed here that those do not make.
// window.docklabb is for a test that looks at the page: ready, and facts() of what is shown.
import {createLabStage, type LabStage, type ViewName} from './lab-stage.ts';
import {NO_STEER, TURN_AT_PLACE, layDeal, recipeFor, recipeOf, shares, type LaidDeal, type PoseFilm, type Recipe, type Steer, type Stored} from './lay.ts';
import {poseOnDoll, type PoseOptions} from './pose-on-doll.ts';
import {dollNamed} from '../src/doll.ts';
import {filmLens, type Plan} from '../src/world.ts';
import {TWO_HAND} from '../src/two-hand.ts';
import type {Read} from '../src/stage.ts';

type Pose = 'A1' | 'A2.1' | 'A2.3';
type Shown = {kind: 'pose'; pose: Pose} | {kind: 'deal'};
type Motion = Read & {doll?: string; lab?: Record<string, unknown>};
type Standard = {name: string; doll: string; place: string; savedAt: string};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const get = async (address: string) => { const r = await fetch(address, {cache: 'no-store'}); if (!r.ok) throw Error(`${address}: ${r.status}`); return r.json(); };
const files = new Map<string, Promise<unknown>>(), stored = <T>(name: string) => { let p = files.get(name); if (!p) { p = get(`/dealer3d/data/${name}.json`); files.set(name, p); } return p as Promise<T>; };
const comma = (n: number, digits = 0) => n.toFixed(digits).replace('.', ',').replace('-', '−');
const DOLLS: Record<string, string> = {paow: 'Paow', standard: 'Standarddockan'}, WHY = {reach: 'når inte', closed: 'stängt kort'}, LENT = {'seat 5': 'receptet lånat av plats 5', 'her first card': 'receptet lånat av kort 1'};
// The pose films: A1 is the first frame of the film to A2.3 and A2.3 its last (dealer3d/tools/doll-still.ts); A2.1, the
// pinch at the shoe, is the first frame of the deal read off Pamela's film (dealer3d/LASMIG.md). A2.2 has no pose in the code.
const POSES: Record<Pose, {film: string; end: boolean; options?: PoseOptions; said?: string}> = {
  'A1': {film: 'till-ankare-2-3-c', end: false}, 'A2.3': {film: 'till-ankare-2-3-c', end: true},
  'A2.1': {film: 'giv-pamela-p4', end: false, options: {hands: 'motion'}, said: 'Pamelas avlästa nyp'}};
const placeWords = (id: string) => { const m = /^(?:P([1-7])|D)\.C([123])$/.exec(id)!; return m[1] ? `plats ${m[1]}, kort ${m[2]}` : `dealern, kort ${m[2]}`; };
const standardName = (doll: string, place: string) => `${doll}-${place.toLowerCase().replace('.', '')}`;

const plan = await get('/dealer3d/plan').catch(e => { $('note').textContent = 'Docklabbet kunde inte läsa kortplanen.'; throw e; }) as Plan, lens = filmLens();
const state = {doll: 'paow', shown: {kind: 'deal'} as Shown, place: 'P4.C1', steer: {...NO_STEER} as Steer, touched: false, playing: false, speed: 1, loop: false, joints: false, view: 'film' as ViewName, t: 0};
// What is on the stage now: the motion, and for a deal what it was laid from. `fault`: why the last laying did not go (the motion is then the last that did).
let now: {doll: string; place: string | null; motion: Motion; deal: LaidDeal | null; recipe: Recipe | null; lent: string | null; shortMm: number; saved: boolean; said: string | null} | null = null, fault: string | null = null;
let standards: Standard[] = (await get('/dealer3d/standard').catch(() => ({standards: []}))).standards, stage: LabStage | null = null, held = 0;

/** A motion made with the standard doll, on the chosen doll; and how far paow's arm is too short at the worst, millimetres. */
function onDoll<M extends Motion>(motion: M, options?: PoseOptions): {motion: Motion; shortMm: number} {
  if (state.doll === 'standard') return {motion: {...motion, doll: 'standard'}, shortMm: 0};
  const posed = poseOnDoll(lens, motion as never, dollNamed(state.doll), options) as {motion: Motion; receipt: {frames: {shortMm: [number, number]}[]}};
  return {motion: posed.motion, shortMm: Math.max(0, ...posed.receipt.frames.flatMap(f => f.shortMm))};
}
const plain = (e: unknown) => { const s = String((e as Error)?.message ?? e); return /reach/.test(s) ? 'armen når inte' : /frames to turn|too few|settle/.test(s) ? 'för snabbt för vändningen' : /grip/.test(s) ? 'greppet passar inte platsen' : 'går inte att räkna'; };

async function recipeOfPlace(place: string) {
  const r = recipeFor(place); if (!r || 'none' in r) return null;
  const recipe = recipeOf(r.recipe, await stored<Stored>(r.recipe)), pose = await stored<PoseFilm>(recipe.poseFilm ?? 'till-ankare-2-3');
  return {recipe, pose, lent: r.lent ? LENT[r.lent] : null};
}
/** Lays the deal to the chosen place as steered and poses it on the doll; or, untouched, takes the standard saved for the doll and place. Keeps what is shown where the laying does not go. */
async function showDeal(keepTime = false) {
  const place = state.place, doll = state.doll, found = await recipeOfPlace(place); if (!found || place !== state.place || doll !== state.doll) return;
  const saved = state.touched ? null : standards.find(s => s.name === standardName(doll, place));
  try {
    if (saved) { const motion = await get(`/dealer3d/standard/${saved.name}.json`) as Motion, lab = (motion.lab ?? {}) as {steer?: Steer; bodyAsked?: [number, number, number]; shortMm?: number};
      state.steer = {...NO_STEER, ...lab.steer}; now = {doll, place, motion, deal: null, recipe: found.recipe, lent: found.lent, shortMm: lab.shortMm ?? 0, saved: true, said: null}; }
    else { const deal = layDeal({plan, target: place, recipe: found.recipe, pose: found.pose, steer: state.steer}), posed = onDoll(deal as unknown as Motion);
      now = {doll, place, motion: posed.motion, deal, recipe: found.recipe, lent: found.lent, shortMm: posed.shortMm, saved: false, said: null}; }
    fault = null;
  } catch (e) { fault = plain(e); console.warn(e); if (!now || now.place !== place || now.doll !== doll || state.shown.kind !== 'deal') { paint(); return; } }
  if (place !== state.place || doll !== state.doll) return;
  state.shown = {kind: 'deal'}; const t = keepTime ? state.t : 0; stage!.setTarget(place); stage!.setMotion(now!.motion); state.t = Math.min(t, stage!.duration()); stage!.setTime(state.t); paint();
}
async function showPose(pose: Pose) {
  const p = POSES[pose], doll = state.doll, posed = onDoll(await stored<Motion>(p.film), p.options); if (doll !== state.doll) return;
  state.shown = {kind: 'pose', pose}; state.playing = false; fault = null; now = {doll, place: null, motion: posed.motion, deal: null, recipe: null, lent: null, shortMm: 0, saved: false, said: p.said && doll !== 'standard' ? `${p.said} på ${DOLLS[doll]}s kropp` : p.said ?? null};
  stage!.setMotion(posed.motion); state.t = p.end ? stage!.duration() : 0; stage!.setTime(state.t); paint();
}
const show = (keepTime = false) => state.shown.kind === 'deal' ? showDeal(keepTime) : showPose(state.shown.pose);

/** A stage for the chosen doll on a canvas of its own (a stage's doll is fixed when it is made). */
async function setDoll(name: string) {
  state.doll = name; state.touched = false; state.steer = {...NO_STEER};
  const first = onDoll(await stored<Motion>('till-ankare-2-3-c')).motion, old = $('stage'), canvas = document.createElement('canvas'); canvas.id = 'stage';
  stage?.dispose(); old.replaceWith(canvas); size(canvas); stage = createLabStage(canvas, plan, dollNamed(name), first); stage.setJoints(state.joints); stage.setTarget(state.place); stage.view(state.view);
  await show();
}
function size(canvas = $<HTMLCanvasElement>('stage')) { const box = $('frame').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(2, Math.round(box.width * dpr)), h = Math.max(2, Math.round(box.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; stage?.resized(); } }

// The sliders: each shows the recipe's own value until it is moved, and lays the deal again when it is.
type Knob = {name: string; group?: string; min: () => number; max: () => number; step: number; on: () => boolean; value: () => number; set: (v: number) => void; text: (v: number) => string};
const R = () => now?.recipe ?? null, bodyNow = (): [number, number, number] => state.steer.body ?? (now?.deal?.lab.bodyAsked ?? ((now?.motion.lab as {bodyAsked?: [number, number, number]} | undefined)?.bodyAsked) ?? [0, 0, 0]);
const body = (i: number, name: string, min: number, max: number, text: (v: number) => string, group?: string): Knob => ({name, group, min: () => min, max: () => max, step: 0.5, on: () => !!R(), value: () => bodyNow()[i], set: v => { const b = [...bodyNow()] as [number, number, number]; b[i] = v; state.steer.body = b; }, text});
const KNOBS: Knob[] = [
  {name: 'Var kortet vänds', group: 'Kortet', min: () => 0, max: () => 90, step: 5, on: () => !!R()?.pace.single, value: () => Math.round((state.steer.turnNear ?? R()?.pace.turnNear ?? 0) * 100), set: v => { state.steer.turnNear = v / 100; }, text: v => v ? `${v} % av vägen` : 'från handbytet'},
  {name: 'Vändningen börjar', min: () => R() && shares(R()!) ? -(R()!.pace.shared?.wait ?? 1) : -6, max: () => R() && shares(R()!) ? 20 : 10, step: 1, on: () => !!R(), value: () => state.steer.turnLater, set: v => { state.steer.turnLater = v; }, text: v => v ? `${v > 0 ? '+' : ''}${comma(v / 30, 2)} s` : 'som receptet'},
  {name: 'Handens höjd', min: () => 1, max: () => 12, step: 0.5, on: () => !!R()?.pace.single, value: () => (state.steer.carry ?? R()?.pace.carry ?? TWO_HAND.heights.carry) * 100, set: v => { state.steer.carry = v / 100; }, text: v => `${comma(v, 1)} cm`},
  {name: 'Handens vinkel på kortet', min: () => -30, max: () => 40, step: 1, on: () => !!R()?.pace.contactGrip, value: () => state.steer.gripYaw ?? R()?.pace.gripYaw ?? 15, set: v => { state.steer.gripYaw = v; }, text: v => `${comma(v)}°`},
  body(2, 'Lutning framåt', -5, 30, v => `${comma(v, 1)}°`, 'Kroppen'),
  body(0, 'Lutning åt sidan', -25, 25, v => v ? `${comma(Math.abs(v), 1)}° mot plats ${v > 0 ? 7 : 1}` : '0°'),
  body(1, 'Vridning', -15, 30, v => v ? `${comma(Math.abs(v), 1)}° ${v > 0 ? 'höger' : 'vänster'} axel fram` : '0°'),
  {name: 'Tempo', group: 'Fart', min: () => 40, max: () => R() && shares(R()!) ? 100 : 150, step: 5, on: () => !!R(), value: () => Math.round(state.steer.tempo * 100), set: v => { state.steer.tempo = v / 100; }, text: v => `${v} %`},
];
const knobs = KNOBS.map(k => { const box = $('knobs'); if (k.group) { const h = document.createElement('h3'); h.textContent = k.group; box.append(h); }
  const label = document.createElement('label'), name = document.createElement('span'), out = document.createElement('output'), input = document.createElement('input'); label.className = 'knob'; name.textContent = k.name; input.type = 'range'; input.step = String(k.step); label.append(name, out, input); box.append(label);
  input.addEventListener('input', () => { k.set(Number(input.value)); out.textContent = k.text(Number(input.value)); state.touched = true; clearTimeout(held); held = setTimeout(() => showDeal(true), 140); });
  input.addEventListener('change', () => { clearTimeout(held); showDeal(true); });
  return {k, label, out, input}; });

/** Everything on the page that says what is chosen and shown. */
function paint() {
  const deal = state.shown.kind === 'deal', saved = standards.find(s => s.name === standardName(state.doll, state.place));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#dolls button')) b.setAttribute('aria-pressed', String(b.dataset.doll === state.doll));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#poses button')) b.setAttribute('aria-pressed', String(!deal && b.dataset.pose === (state.shown as {pose?: string}).pose));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#places button')) { b.setAttribute('aria-pressed', String(deal && b.dataset.place === state.place)); b.classList.toggle('saved', standards.some(s => s.name === standardName(state.doll, b.dataset.place!))); }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === state.speed));
  for (const {k, label, out, input} of knobs) { const on = deal && k.on(); input.disabled = !on; label.classList.toggle('off', !on); input.min = String(k.min()); input.max = String(k.max());
    if (on) { const v = Math.max(k.min(), Math.min(k.max(), k.value())); input.value = String(v); out.textContent = k.text(k.value()); } else out.textContent = ''; }
  const steered = JSON.stringify(state.steer) !== JSON.stringify(NO_STEER), recipe = R();
  $<HTMLButtonElement>('atplace').disabled = !deal || !recipe || !shares(recipe); $<HTMLButtonElement>('reset').disabled = !deal || (!steered && !now?.saved); $<HTMLButtonElement>('save').disabled = !deal || !now || now.saved || !!fault || now.shortMm > 0;
  const status = $('status'), when = saved ? new Date(saved.savedAt).toLocaleString('sv-SE', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '';
  status.className = fault ? 'small warn' : 'small';
  status.textContent = !deal ? 'Välj en plats för att styra given.' : fault ? `Går inte: ${fault}. Senaste som gick visas.` : now?.saved ? `Sparad standard visas (${when}).` : saved ? `Inte den sparade (${when}). Klicka på platsen för den.` : steered ? 'Ändrad, inte sparad.' : 'Grundrörelsen. Ingen standard sparad.';
  // The line in the picture: what is shown, and what is not as it should be.
  const what = deal ? `A2.3 → ${placeWords(state.place)}` : (state.shown as {pose: string}).pose, notes: string[] = [], warns: string[] = [];
  if (now?.said) notes.push(now.said); if (deal && now?.lent) notes.push(now.lent);
  if (deal && now?.shortMm) warns.push(`armen räcker inte, ${comma(now.shortMm)} mm`); const laid = (now?.deal ?? now?.motion) as {elbowForced?: unknown[]; throughShoe?: number} | undefined; // a saved standard carries what its laying said
  if (deal && laid?.elbowForced?.length) warns.push('armbågen tvingad'); if (deal && laid?.throughShoe) warns.push('handen går genom skon');
  const note = $('note'); note.replaceChildren(); const strong = document.createElement('b'); strong.textContent = `${DOLLS[state.doll]} · ${what}`; note.append(strong);
  if (notes.length) note.append(` · ${notes.join(' · ')}`); if (warns.length) { const w = document.createElement('span'); w.className = 'warn'; w.textContent = ` · ${warns.join(' · ')}`; note.append(w); }
  transport();
}
function transport() {
  const deal = state.shown.kind === 'deal', length = stage?.duration() ?? 0;
  $('play').textContent = state.playing ? 'Paus' : 'Spela'; $<HTMLInputElement>('scrub').disabled = !deal; $<HTMLInputElement>('scrub').value = String(deal && length ? Math.round(Math.min(state.t, length) / length * 1000) : 0);
  $('clock').textContent = deal ? `${comma(Math.min(state.t, length), 2)} s` : '';
}

// The places: a row for each card and a column for each seat and for the dealer; a place no deal is laid to is closed, and says why below.
{ const grid = $('places'), ids = Object.keys(plan.targets), closed: string[] = [], cell = (text: string, row = false) => { const s = document.createElement('span'); s.textContent = text; if (row) s.className = 'row'; grid.append(s); };
  cell(''); for (const c of ['1', '2', '3', '4', '5', '6', '7', 'D']) cell(c);
  for (const card of [1, 2, 3]) { cell(`Kort ${card}`, true);
    for (const seat of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'D']) { const id = `${seat}.C${card}`, r = ids.includes(id) ? recipeFor(id) : null; if (!r) { cell(''); continue; }
      const b = document.createElement('button'); b.dataset.place = id; b.textContent = '●'; b.title = placeWords(id); b.setAttribute('aria-label', placeWords(id));
      if ('none' in r) { b.disabled = true; b.textContent = '–'; b.title = `${placeWords(id)}: ${WHY[r.none]}`; closed.push(`${placeWords(id)}: ${WHY[r.none]}`); }
      else b.addEventListener('click', () => { state.place = id; state.touched = false; state.steer = {...NO_STEER}; state.shown = {kind: 'deal'}; state.playing = false; showDeal().then(() => { if (state.view === 'player') stage!.view('player'); if (state.shown.kind === 'deal' && !fault) { state.t = 0; state.playing = true; paint(); } }); });
      grid.append(b); } }
  $('closed').textContent = closed.map(c => c[0].toUpperCase() + c.slice(1)).join('. ') + (closed.length ? '.' : ''); }

for (const b of document.querySelectorAll<HTMLButtonElement>('#dolls button')) b.addEventListener('click', () => { if (b.dataset.doll !== state.doll) setDoll(b.dataset.doll!); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#poses button')) if (!b.disabled) b.addEventListener('click', () => showPose(b.dataset.pose as Pose));
for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.addEventListener('click', () => { state.view = b.dataset.view as ViewName; stage!.view(state.view); paint(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) b.addEventListener('click', () => { state.speed = Number(b.dataset.speed); paint(); });
$<HTMLInputElement>('loop').addEventListener('change', e => { state.loop = (e.target as HTMLInputElement).checked; });
$<HTMLInputElement>('joints').addEventListener('change', e => { state.joints = (e.target as HTMLInputElement).checked; stage!.setJoints(state.joints); });
const play = async () => { if (state.shown.kind !== 'deal') { await showDeal(); if (state.shown.kind !== 'deal') return; } if (!state.playing && state.t >= stage!.duration() - 1e-3) state.t = 0; state.playing = !state.playing; paint(); };
$('play').addEventListener('click', play);
addEventListener('keydown', e => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); play(); } });
$<HTMLInputElement>('scrub').addEventListener('input', e => { state.playing = false; state.t = Number((e.target as HTMLInputElement).value) / 1000 * stage!.duration(); stage!.setTime(state.t); transport(); });
$('reset').addEventListener('click', () => { state.steer = {...NO_STEER}; state.touched = true; showDeal(true); });
$('atplace').addEventListener('click', () => { const r = R(); if (!r) return; state.steer = {...state.steer, turnNear: TURN_AT_PLACE.turnNear, turnLater: TURN_AT_PLACE.wait - (r.pace.shared?.wait ?? 1), gripYaw: TURN_AT_PLACE.gripYaw}; state.touched = true; showDeal(true); });
$('save').addEventListener('click', async () => {
  if (!now?.deal || state.shown.kind !== 'deal' || fault) return; const name = standardName(state.doll, state.place), button = $<HTMLButtonElement>('save'); button.disabled = true;
  // Exactly the frames on the stage, for this doll, with what they were laid from.
  const motion = {...now.motion, doll: state.doll, lab: {...now.deal.lab, doll: state.doll, place: state.place, shortMm: now.shortMm, savedAt: new Date().toISOString()}};
  try { const r = await fetch(`/dealer3d/standard/${name}.json`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(motion)}), answer = await r.json(); if (!r.ok) throw Error(answer.error ?? String(r.status));
    standards = answer.standards; now = {...now, motion, saved: true}; paint(); }
  catch (e) { paint(); const status = $('status'); status.className = 'small warn'; status.textContent = `Sparades inte: ${String((e as Error).message ?? e)}`; }
});

// The clock: the time runs while it plays (a breath on the last picture before a loop begins again), and the stage is drawn only when something has changed.
let last = performance.now();
function tick(ms: number) {
  const dt = Math.min(0.1, (ms - last) / 1000); last = ms;
  if (stage) { size();
    if (state.playing) { const length = stage.duration(); state.t += dt * state.speed;
      if (state.t >= length + (state.loop ? 0.5 : 0)) { if (state.loop) state.t = 0; else { state.t = length; state.playing = false; paint(); } }
      stage.setTime(Math.min(state.t, length)); transport(); }
    if (stage.needsDraw()) stage.draw(); }
  requestAnimationFrame(tick);
}
try { await setDoll(state.doll); } catch (e) { $('note').textContent = `Docklabbet kunde inte starta: ${String((e as Error).message ?? e)}`; throw e; }
requestAnimationFrame(tick);
(window as unknown as {docklabb: unknown}).docklabb = {ready: true, facts: () => ({doll: state.doll, shown: state.shown, place: state.place, steer: state.steer, playing: state.playing, t: state.t, duration: stage?.duration(), fault, saved: now?.saved ?? false, shortMm: now?.shortMm ?? 0,
  frames: now?.motion.frameCount, forced: now?.deal?.elbowForced ?? null, throughShoe: now?.deal?.throughShoe ?? null, note: $('note').textContent, status: $('status').textContent, standards: standards.map(s => s.name), camera: stage?.camera(),
  // Where her right wrist and the card are, in the room and in the picture now (CSS pixels of the canvas): for checking a view against the film's own.
  seen: (() => { const m = now?.motion, i = m ? Math.min(m.frameCount - 1, Math.round(state.t * m.fps)) : 0, of = (world: number[]) => ({world, at: stage!.seen(world)}); return m && stage ? {wrist: of(m.frames[i].R.w), card: of(m.frames[i].card.c)} : null; })()})};
