// The doll lab (Jakob 2026-11-23): the white doll at the table in a view the mouse turns, set in her poses (A1, A2.1,
// A2.3) and dealing one card from A2.3 to any place of his plan in one movement, with play, pause, scrubbing and speed,
// the joints and the fingertips on the card marked, the sliders that lay the deal again as they are moved, and "Spara som
// standard", which writes what is shown as a motion file for that doll and place (dealer3d/standard/<doll>-<place>.json;
// the routes are dealer3d/page/server.ts). The room and the doll are dealer3d/src/stage.ts's (page/lab-stage.ts), a deal
// is laid by dealer3d/src/two-hand.ts from the recipe of a stored deal (page/lay.ts) and posed on the doll paow as
// dealer3d/tools/doll-pose.ts poses it (page/pose-on-doll.ts): nothing is drawn or posed here that those do not make.
// Two ways of dealing (page/natural-lab.ts): "Naturlig", the standard for Paow (the hands hand the card over without
// meeting, thumb and forefinger hold its corner, the body, shoulders and elbows steered on her as far as her arms reach;
// dealer3d/src/natural.ts), and "Som förut", the deal as the lab laid it before, kept until Jakob has said yes to the new.
// Everything is laid here, with the shoe the films have (src/table-lens.ts SHOE): a stored file began in the shoe of before
// 2026-11-23, 3 cm off, and is not played. A standard he has saved is laid again from its recipe and his sliders, the way
// he saved it in, whichever way is chosen; the file stays as it is.
// window.docklabb is for a test that looks at the page: ready, and facts() of what is shown.
import {createLabStage, type LabStage, type Touch, type ViewName} from './lab-stage.ts';
import {NO_STEER, TURN_AT_PLACE, cardInFilmsShoe, layDeal, recipeFor, recipeOf, shares, type LaidDeal, type PoseFilm, type Recipe, type Steer, type Stored} from './lay.ts';
import {NO_KNOBS, layNatural, moveNatural, onDoll as dealOnDoll, type Knobs, type LaidNatural, type Way} from './natural-lab.ts';
import {poseOnDoll, type PoseOptions} from './pose-on-doll.ts';
import {dollNamed} from '../src/doll.ts';
import {filmLens, type Plan} from '../src/world.ts';
import {CARD} from '../src/camera.ts';
import {TWO_HAND} from '../src/two-hand.ts';
import type {Read} from '../src/stage.ts';

type Pose = 'A1' | 'A2.1' | 'A2.3';
type Shown = {kind: 'pose'; pose: Pose} | {kind: 'deal'};
type Motion = Read & {doll?: string; lab?: Record<string, unknown>};
type Standard = {name: string; doll: string; place: string; savedAt: string};
/** What a saved standard carries of how it was made: the recipe, the sliders, and for "Naturlig" the shoulders and elbows (`naturlig`, which a standard saved before has not). */
type SavedLab = {recipe?: string; steer?: Steer; bodyAsked?: [number, number, number]; shortMm?: number; naturlig?: {knobs?: Partial<Knobs>; bodyShare?: number}};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const get = async (address: string) => { const r = await fetch(address, {cache: 'no-store'}); if (!r.ok) throw Error(`${address}: ${r.status}`); return r.json(); };
const files = new Map<string, Promise<unknown>>(), stored = <T>(name: string) => { let p = files.get(name); if (!p) { p = get(`/dealer3d/data/${name}.json`); files.set(name, p); } return p as Promise<T>; };
const comma = (n: number, digits = 0) => n.toFixed(digits).replace('.', ',').replace('-', '−');
const DOLLS: Record<string, string> = {paow: 'Paow', standard: 'Standarddockan'}, WHY = {reach: 'når inte', closed: 'stängt kort'}, LENT = {'seat 5': 'receptet lånat av plats 5', 'her first card': 'receptet lånat av kort 1'};
const WAYS: Record<Way, string> = {naturlig: 'Naturlig', forut: 'Som förut'};
// The pose films: A1 is the first frame of the film to A2.3 and A2.3 its last (dealer3d/tools/doll-still.ts); A2.1, the
// pinch at the shoe, is the first frame of the deal read off Pamela's film (dealer3d/LASMIG.md). A2.2 has no pose in the code.
const POSES: Record<Pose, {film: string; end: boolean; options?: PoseOptions; said?: string}> = {
  'A1': {film: 'till-ankare-2-3-c', end: false}, 'A2.3': {film: 'till-ankare-2-3-c', end: true},
  'A2.1': {film: 'giv-pamela-p4', end: false, options: {hands: 'motion'}, said: 'Pamelas avlästa nyp'}};
const placeWords = (id: string) => { const m = /^(?:P([1-7])|D)\.C([123])$/.exec(id)!; return m[1] ? `plats ${m[1]}, kort ${m[2]}` : `dealern, kort ${m[2]}`; };
const standardName = (doll: string, place: string) => `${doll}-${place.toLowerCase().replace('.', '')}`;
const knobsOf = (k?: Partial<Knobs>): Knobs => ({shoulderR: [...(k?.shoulderR ?? NO_KNOBS.shoulderR)] as [number, number], shoulderL: [...(k?.shoulderL ?? NO_KNOBS.shoulderL)] as [number, number], elbowOut: [...(k?.elbowOut ?? NO_KNOBS.elbowOut)] as [number, number]});

const plan = await get('/dealer3d/plan').catch(e => { $('note').textContent = 'Docklabbet kunde inte läsa kortplanen.'; throw e; }) as Plan, lens = filmLens();
const state = {doll: 'paow', way: 'naturlig' as Way, shown: {kind: 'deal'} as Shown, place: 'P4.C1', steer: {...NO_STEER} as Steer, knobs: knobsOf(), touched: false, playing: false, speed: 1, loop: false, joints: false, view: 'film' as ViewName, t: 0};
// The address may name the card and the doll to begin on (/dealer3d/docka?plats=p5c1&docka=standard): the studio's Scen & bord
// opens the lab on the card chosen there. Without the words, or with a place no deal is laid to, it begins as before.
const asked = new URLSearchParams(location.search);
{ const m = /^(?:p([1-7])|d)c([123])$/.exec(asked.get('plats') ?? ''), id = m ? `${m[1] ? `P${m[1]}` : 'D'}.C${m[2]}` : null, r = id && Object.hasOwn(plan.targets, id) ? recipeFor(id) : null;
  if (id && r && !('none' in r)) state.place = id; if (Object.hasOwn(DOLLS, asked.get('docka') ?? '')) state.doll = asked.get('docka')!; }
/** The way a deal is shown now: "Naturlig" is Paow's (the standard doll is locked, and keeps "Som förut"). */
const wayOf = (): Way => state.doll === 'standard' ? 'forut' : state.way;
// What is on the stage now: the motion, and for a deal what it was laid from. `from`: a saved standard (laid again from what it was saved with), laid here as steered, or a pose. `fault`: why the last laying did not go (the motion is then the last that did).
type Now = {doll: string; place: string | null; motion: Motion; deal: LaidDeal | null; recipe: Recipe | null; lent: string | null; shortMm: number; saved: boolean; said: string | null;
  way: Way; from: 'saved' | 'laid' | 'pose'; savedWay: Way | null; bodyShare: number | null; receipt: ReturnType<typeof moveNatural>['receipt'] | null};
let now: Now | null = null, fault: string | null = null, laid: {key: string; value: LaidNatural} | null = null;
let standards: Standard[] = (await get('/dealer3d/standard').catch(() => ({standards: []}))).standards, stage: LabStage | null = null, held = 0;

/** A motion made with the standard doll, on the chosen doll; and how far paow's arm is too short at the worst, millimetres. */
function onDoll<M extends Motion>(motion: M, options?: PoseOptions): {motion: Motion; shortMm: number} {
  if (state.doll === 'standard') return {motion: {...motion, doll: 'standard'}, shortMm: 0};
  const posed = poseOnDoll(lens, motion as never, dollNamed(state.doll), options) as {motion: Motion; receipt: {frames: {shortMm: [number, number]}[]}};
  return {motion: posed.motion, shortMm: Math.max(0, ...posed.receipt.frames.flatMap(f => f.shortMm))};
}
const plain = (e: unknown) => { const s = String((e as Error)?.message ?? e); return /reach/.test(s) ? 'armen når inte' : /frames to turn|too few|settle/.test(s) ? 'för snabbt för vändningen' : /grip/.test(s) ? 'greppet passar inte platsen' : 'går inte att räkna'; };

/** A recipe by the name of its stored deal, and the pose film it begins on. */
const recipeNamed = async (name: string) => { const recipe = recipeOf(name, await stored<Stored & Motion>(name)); return {recipe, pose: await stored<PoseFilm>(recipe.poseFilm ?? 'till-ankare-2-3')}; };
async function recipeOfPlace(place: string) {
  const r = recipeFor(place); if (!r || 'none' in r) return null;
  return {...await recipeNamed(r.recipe), lent: r.lent ? LENT[r.lent] : null};
}
const untouched = () => JSON.stringify(state.steer) === JSON.stringify(NO_STEER) && JSON.stringify(state.knobs) === JSON.stringify(NO_KNOBS);
/**
 * Lays the deal to the chosen place the chosen way, as steered, on the doll; or, untouched, the standard saved for the doll
 * and place, laid again from its recipe and his sliders the way it was saved in. Keeps what is shown where the laying does not go.
 */
async function showDeal(keepTime = false) {
  const place = state.place, doll = state.doll, chosen = wayOf(), found = await recipeOfPlace(place); if (!found || place !== state.place || doll !== state.doll || chosen !== wayOf()) return;
  const saved = state.touched ? null : standards.find(s => s.name === standardName(doll, place)), D = dollNamed(doll);
  try {
    let {recipe, pose} = found, way = chosen, savedWay: Way | null = null;
    if (saved) { const lab = ((await get(`/dealer3d/standard/${saved.name}.json`) as Motion).lab ?? {}) as SavedLab;
      state.steer = {...NO_STEER, ...lab.steer}; state.knobs = knobsOf(lab.naturlig?.knobs); savedWay = lab.naturlig ? 'naturlig' : 'forut'; way = doll === 'standard' ? 'forut' : savedWay;
      if (lab.recipe && lab.recipe !== recipe.from) ({recipe, pose} = await recipeNamed(lab.recipe));
      if (place !== state.place || doll !== state.doll) return; }
    const base = {doll, place, recipe, lent: found.lent, said: null, way, saved: !!saved, from: saved ? 'saved' as const : 'laid' as const, savedWay};
    if (way === 'naturlig') {
      // (laid again only when what the laying takes has changed: the body, shoulders and elbows move the doll on the deal laid last)
      const key = JSON.stringify([doll, place, recipe.from, {...state.steer, body: null}]);
      if (laid?.key !== key) laid = {key, value: layNatural({plan, target: place, recipe, pose, steer: state.steer, lens, doll: D})};
      const moved = moveNatural(laid.value, state.steer.body, state.knobs, lens, D);
      now = {...base, motion: moved.motion as unknown as Motion, deal: laid.value.deal, shortMm: laid.value.shortMm, bodyShare: moved.bodyShare, receipt: moved.receipt}; }
    else {
      // "Som förut": the deal as the lab laid it before, as steered.
      const deal = layDeal({plan, target: place, recipe, pose, steer: state.steer}), posed = dealOnDoll(lens, deal as unknown as Motion, D);
      now = {...base, motion: posed.motion, deal, shortMm: posed.shortMm, bodyShare: null, receipt: null}; }
    fault = null;
  } catch (e) { fault = plain(e); console.warn(e); if (!now || now.place !== place || now.doll !== doll || state.shown.kind !== 'deal') { paint(); return; } }
  if (place !== state.place || doll !== state.doll) return;
  state.shown = {kind: 'deal'}; const t = keepTime ? state.t : 0; stage!.setTarget(place); stage!.setMotion(now!.motion); state.t = Math.min(t, stage!.duration()); stage!.setTime(state.t); paint();
}
async function showPose(pose: Pose) {
  const p = POSES[pose], doll = state.doll, posed = onDoll(await stored<Motion>(p.film), p.options); if (doll !== state.doll) return;
  posed.motion = cardInFilmsShoe(posed.motion as Motion & {frames: {card: {c: number[]; l: number[]; n: number[]}}[]}); // the pose films' card stood in the shoe of before 2026-11-23
  state.shown = {kind: 'pose', pose}; state.playing = false; fault = null;
  now = {doll, place: null, motion: posed.motion, deal: null, recipe: null, lent: null, shortMm: 0, saved: false, said: p.said && doll !== 'standard' ? `${p.said} på ${DOLLS[doll]}s kropp` : p.said ?? null, way: wayOf(), from: 'pose', savedWay: null, bodyShare: null, receipt: null};
  stage!.setMotion(posed.motion); state.t = p.end ? stage!.duration() : 0; stage!.setTime(state.t); paint();
}
const show = (keepTime = false) => state.shown.kind === 'deal' ? showDeal(keepTime) : showPose(state.shown.pose);

/** A stage for the chosen doll on a canvas of its own (a stage's doll is fixed when it is made). */
async function setDoll(name: string) {
  state.doll = name; state.touched = false; state.steer = {...NO_STEER}; state.knobs = knobsOf();
  const first = onDoll(await stored<Motion>('till-ankare-2-3-c')).motion, old = $('stage'), canvas = document.createElement('canvas'); canvas.id = 'stage';
  stage?.dispose(); old.replaceWith(canvas); size(canvas); stage = createLabStage(canvas, plan, dollNamed(name), first); stage.setJoints(state.joints); stage.setGrips(gripsShown()); stage.setTarget(state.place); stage.view(state.view);
  await show();
}
function size(canvas = $<HTMLCanvasElement>('stage')) { const box = $('frame').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(2, Math.round(box.width * dpr)), h = Math.max(2, Math.round(box.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; stage?.resized(); } }
/** The fingertips on the card are marked with the joints, and always close on the card. */
const gripsShown = () => state.joints || state.view === 'card';

// The sliders: each shows the recipe's own value until it is moved, and lays the deal again when it is.
type Knob = {name: string; group?: string; min: () => number; max: () => number; step: number; on: () => boolean; value: () => number; set: (v: number) => void; text: (v: number) => string; only?: string};
const R = () => now?.recipe ?? null, bodyNow = (): [number, number, number] => state.steer.body ?? (now?.deal?.lab.bodyAsked ?? ((now?.motion.lab as {bodyAsked?: [number, number, number]} | undefined)?.bodyAsked) ?? [0, 0, 0]);
const body = (i: number, name: string, min: number, max: number, text: (v: number) => string, group?: string): Knob => ({name, group, min: () => min, max: () => max, step: 0.5, on: () => !!R(), value: () => bodyNow()[i], set: v => { const b = [...bodyNow()] as [number, number, number]; b[i] = v; state.steer.body = b; }, text});
/** A slider of "Naturlig" only: a shoulder or an elbow, laid on the doll by dealer3d/src/natural.ts. */
const natural = (key: keyof Knobs, j: 0 | 1, name: string, min: number, max: number, step: number, text: (v: number) => string): Knob => ({name, min: () => min, max: () => max, step, on: () => !!R() && wayOf() === 'naturlig', value: () => state.knobs[key][j],
  set: v => { const k = [...state.knobs[key]] as [number, number]; k[j] = v; state.knobs = {...state.knobs, [key]: k}; }, text, only: 'Bara i Naturlig'});
const cm = (up: string, down: string) => (v: number) => v ? `${comma(Math.abs(v), 1)} cm ${v > 0 ? up : down}` : '0', out = (v: number) => v ? `${comma(Math.abs(v))}° ${v > 0 ? 'ut' : 'in'}` : '0°';
const KNOBS: Knob[] = [
  {name: 'Var kortet vänds', group: 'Kortet', min: () => 0, max: () => 90, step: 5, on: () => !!R()?.pace.single, value: () => Math.round((state.steer.turnNear ?? R()?.pace.turnNear ?? 0) * 100), set: v => { state.steer.turnNear = v / 100; }, text: v => v ? `${v} % av vägen` : 'från handbytet'},
  {name: 'Vändningen börjar', min: () => R() && shares(R()!) ? -(R()!.pace.shared?.wait ?? 1) : -6, max: () => R() && shares(R()!) ? 20 : 10, step: 1, on: () => !!R(), value: () => state.steer.turnLater, set: v => { state.steer.turnLater = v; }, text: v => v ? `${v > 0 ? '+' : ''}${comma(v / 30, 2)} s` : 'som receptet'},
  {name: 'Handens höjd', min: () => 1, max: () => 12, step: 0.5, on: () => !!R()?.pace.single, value: () => (state.steer.carry ?? R()?.pace.carry ?? TWO_HAND.heights.carry) * 100, set: v => { state.steer.carry = v / 100; }, text: v => `${comma(v, 1)} cm`},
  {name: 'Handens vinkel på kortet', min: () => -30, max: () => 40, step: 1, on: () => !!R()?.pace.contactGrip, value: () => state.steer.gripYaw ?? R()?.pace.gripYaw ?? 15, set: v => { state.steer.gripYaw = v; }, text: v => `${comma(v)}°`},
  body(2, 'Lutning framåt', -5, 30, v => `${comma(v, 1)}°`, 'Kroppen'),
  body(0, 'Lutning åt sidan', -25, 25, v => v ? `${comma(Math.abs(v), 1)}° mot plats ${v > 0 ? 7 : 1}` : '0°'),
  body(1, 'Vridning', -15, 30, v => v ? `${comma(Math.abs(v), 1)}° ${v > 0 ? 'höger' : 'vänster'} axel fram` : '0°'),
  natural('shoulderR', 0, 'Höger axel upp', -2, 4, 0.5, cm('upp', 'ned')),
  natural('shoulderR', 1, 'Höger axel fram', -3, 4, 0.5, cm('fram', 'bak')),
  natural('shoulderL', 0, 'Vänster axel upp', -2, 4, 0.5, cm('upp', 'ned')),
  natural('shoulderL', 1, 'Vänster axel fram', -3, 4, 0.5, cm('fram', 'bak')),
  natural('elbowOut', 0, 'Höger armbåge ut', -20, 40, 1, out),
  natural('elbowOut', 1, 'Vänster armbåge ut', -20, 40, 1, out),
  {name: 'Tempo', group: 'Fart', min: () => 40, max: () => R() && shares(R()!) ? 100 : 150, step: 5, on: () => !!R(), value: () => Math.round(state.steer.tempo * 100), set: v => { state.steer.tempo = v / 100; }, text: v => `${v} %`},
];
const knobs = KNOBS.map(k => { const box = $('knobs'); if (k.group) { const h = document.createElement('h3'); h.textContent = k.group; box.append(h); }
  const label = document.createElement('label'), name = document.createElement('span'), out = document.createElement('output'), input = document.createElement('input'); label.className = 'knob'; name.textContent = k.name; input.type = 'range'; input.step = String(k.step); label.append(name, out, input); box.append(label);
  input.addEventListener('input', () => { k.set(Number(input.value)); out.textContent = k.text(Number(input.value)); state.touched = true; clearTimeout(held); held = setTimeout(() => showDeal(true), 140); });
  input.addEventListener('change', () => { clearTimeout(held); showDeal(true); });
  return {k, label, out, input}; });

/** Everything on the page that says what is chosen and shown. */
function paint() {
  const deal = state.shown.kind === 'deal', saved = standards.find(s => s.name === standardName(state.doll, state.place)), way = wayOf();
  for (const b of document.querySelectorAll<HTMLButtonElement>('#dolls button')) b.setAttribute('aria-pressed', String(b.dataset.doll === state.doll));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#ways button')) { b.setAttribute('aria-pressed', String(b.dataset.way === way)); b.disabled = state.doll === 'standard' && b.dataset.way === 'naturlig'; b.title = b.disabled ? 'Bara för Paow' : ''; }
  $('wayNote').textContent = state.doll === 'standard' ? 'Naturlig finns bara för Paow.' : way === 'naturlig' ? 'Händerna möts inte vid handbytet, tummen och pekfingret håller kortets hörn, och kroppen följer reglagen så långt armarna når.' : 'Given som labbet lade den före 23 november, med filmens sko.';
  for (const b of document.querySelectorAll<HTMLButtonElement>('#poses button')) b.setAttribute('aria-pressed', String(!deal && b.dataset.pose === (state.shown as {pose?: string}).pose));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#places button')) { b.setAttribute('aria-pressed', String(deal && b.dataset.place === state.place)); b.classList.toggle('saved', standards.some(s => s.name === standardName(state.doll, b.dataset.place!))); }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === state.speed));
  for (const {k, label, out, input} of knobs) { const on = deal && k.on(); input.disabled = !on; label.classList.toggle('off', !on); label.title = !on && k.only && deal ? k.only : ''; input.min = String(k.min()); input.max = String(k.max());
    if (on) { const v = Math.max(k.min(), Math.min(k.max(), k.value())); input.value = String(v); out.textContent = k.text(k.value()); } else out.textContent = ''; }
  const steered = !untouched(), recipe = R();
  $<HTMLButtonElement>('atplace').disabled = !deal || !recipe || !shares(recipe); $<HTMLButtonElement>('reset').disabled = !deal || (!steered && !now?.saved); $<HTMLButtonElement>('save').disabled = !deal || !now || now.saved || !now.deal || !!fault || now.shortMm > 0;
  const status = $('status'), when = saved ? new Date(saved.savedAt).toLocaleString('sv-SE', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '';
  status.className = fault ? 'small warn' : 'small';
  status.textContent = !deal ? 'Välj en plats för att styra given.' : fault ? `Går inte: ${fault}. Senaste som gick visas.`
    : now?.saved ? `Din sparade standard (${when}, gjord i ${WAYS[now.savedWay ?? 'forut']}), lagd med dina värden och filmens sko.${now.savedWay !== way ? ` Dra i ett reglage för ${WAYS[way]} med dina värden.` : ''}`
    : saved ? `Inte den sparade (${when}). Klicka på platsen för den.` : steered ? 'Ändrad, inte sparad.'
    : way === 'naturlig' ? 'Naturlig grundrörelse. Ingen standard sparad.' : 'Grundrörelsen som förut. Ingen standard sparad.';
  // The line in the picture: what is shown, and what is not as it should be.
  const what = deal ? `A2.3 → ${placeWords(state.place)}` : (state.shown as {pose: string}).pose, notes: string[] = [], warns: string[] = [];
  if (deal && now) notes.push(now.saved ? 'sparad standard' : WAYS[now.way]);
  if (now?.said) notes.push(now.said); if (deal && now?.lent) notes.push(now.lent);
  if (deal && now?.bodyShare !== null && now?.bodyShare !== undefined && now.bodyShare < 0.995) notes.push(`kroppen tar ${Math.round(now.bodyShare * 100)} % av styrningen, längre når inte armen`);
  if (deal && now?.shortMm) warns.push(`armen räcker inte, ${comma(now.shortMm)} mm`); const laidAs = (now?.deal ?? now?.motion) as {elbowForced?: unknown[]; throughShoe?: number} | undefined; // a saved standard carries what its laying said
  if (deal && laidAs?.elbowForced?.length) warns.push('armbågen tvingad'); if (deal && laidAs?.throughShoe) warns.push('handen går genom skon');
  const note = $('note'); note.replaceChildren(); const strong = document.createElement('b'); strong.textContent = `${DOLLS[state.doll]} · ${what}`; note.append(strong);
  if (notes.length) note.append(` · ${notes.join(' · ')}`); if (warns.length) { const w = document.createElement('span'); w.className = 'warn'; w.textContent = ` · ${warns.join(' · ')}`; note.append(w); }
  transport(); grip(true);
}
function transport() {
  const deal = state.shown.kind === 'deal', length = stage?.duration() ?? 0;
  $('play').textContent = state.playing ? 'Paus' : 'Spela'; $<HTMLInputElement>('scrub').disabled = !deal; $<HTMLInputElement>('scrub').value = String(deal && length ? Math.round(Math.min(state.t, length) / length * 1000) : 0);
  $('clock').textContent = deal ? `${comma(Math.min(state.t, length), 2)} s` : '';
}
/** Where on the card a fingertip lies, in words: at a corner, at an edge, or on the face. */
const whereOn = (t: Touch) => { const h = CARD.height / 2 - 0.012, w = CARD.width / 2 - 0.012, long = Math.abs(t.along) >= h, short = Math.abs(t.across) >= w; return long && short ? 'i hörnet' : long || short ? 'vid kanten' : 'mitt på'; };
let gripSaid = '';
/** The line over the picture that says which fingertips hold the card and where (with the marks: the joints on, or close on the card). */
function grip(force = false) {
  const list = stage && gripsShown() ? stage.touching() : [], hand = (h: 'R' | 'L', name: string) => { const own = list.filter(t => t.hand === h); return own.length ? `${name}: ${own.map(t => `${t.name} ${whereOn(t)}`).join(', ')}` : ''; };
  const said = !stage || !gripsShown() ? '' : list.length ? `Rör kortet · ${[hand('R', 'höger hand'), hand('L', 'vänster hand')].filter(Boolean).join(' · ')}` : 'Inga fingertoppar på kortet';
  if (said !== gripSaid || force) { gripSaid = said; $('grip').textContent = said; }
}

// The places: a row for each card and a column for each seat and for the dealer; a place no deal is laid to is closed, and says why below.
{ const grid = $('places'), ids = Object.keys(plan.targets), closed: string[] = [], cell = (text: string, row = false) => { const s = document.createElement('span'); s.textContent = text; if (row) s.className = 'row'; grid.append(s); };
  cell(''); for (const c of ['1', '2', '3', '4', '5', '6', '7', 'D']) cell(c);
  for (const card of [1, 2, 3]) { cell(`Kort ${card}`, true);
    for (const seat of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'D']) { const id = `${seat}.C${card}`, r = ids.includes(id) ? recipeFor(id) : null; if (!r) { cell(''); continue; }
      const b = document.createElement('button'); b.dataset.place = id; b.textContent = '●'; b.title = placeWords(id); b.setAttribute('aria-label', placeWords(id));
      if ('none' in r) { b.disabled = true; b.textContent = '–'; b.title = `${placeWords(id)}: ${WHY[r.none]}`; closed.push(`${placeWords(id)}: ${WHY[r.none]}`); }
      else b.addEventListener('click', () => { state.place = id; state.touched = false; state.steer = {...NO_STEER}; state.knobs = knobsOf(); state.shown = {kind: 'deal'}; state.playing = false; showDeal().then(() => { if (state.view === 'player') stage!.view('player'); if (state.shown.kind === 'deal' && !fault) { state.t = 0; state.playing = true; paint(); } }); });
      grid.append(b); } }
  $('closed').textContent = closed.map(c => c[0].toUpperCase() + c.slice(1)).join('. ') + (closed.length ? '.' : ''); }

for (const b of document.querySelectorAll<HTMLButtonElement>('#dolls button')) b.addEventListener('click', () => { if (b.dataset.doll !== state.doll) setDoll(b.dataset.doll!); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#ways button')) b.addEventListener('click', () => { const way = b.dataset.way as Way; if (b.disabled || way === state.way) return; state.way = way; if (state.shown.kind === 'deal') showDeal(true); else paint(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#poses button')) if (!b.disabled) b.addEventListener('click', () => showPose(b.dataset.pose as Pose));
for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.addEventListener('click', () => { state.view = b.dataset.view as ViewName; stage!.view(state.view); stage!.setGrips(gripsShown()); paint(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) b.addEventListener('click', () => { state.speed = Number(b.dataset.speed); paint(); });
$<HTMLInputElement>('loop').addEventListener('change', e => { state.loop = (e.target as HTMLInputElement).checked; });
$<HTMLInputElement>('joints').addEventListener('change', e => { state.joints = (e.target as HTMLInputElement).checked; stage!.setJoints(state.joints); stage!.setGrips(gripsShown()); grip(true); });
const play = async () => { if (state.shown.kind !== 'deal') { await showDeal(); if (state.shown.kind !== 'deal') return; } if (!state.playing && state.t >= stage!.duration() - 1e-3) state.t = 0; state.playing = !state.playing; paint(); };
$('play').addEventListener('click', play);
addEventListener('keydown', e => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); play(); } });
$<HTMLInputElement>('scrub').addEventListener('input', e => { state.playing = false; state.t = Number((e.target as HTMLInputElement).value) / 1000 * stage!.duration(); stage!.setTime(state.t); transport(); grip(); });
$('reset').addEventListener('click', () => { state.steer = {...NO_STEER}; state.knobs = knobsOf(); state.touched = true; showDeal(true); });
$('atplace').addEventListener('click', () => { const r = R(); if (!r) return; state.steer = {...state.steer, turnNear: TURN_AT_PLACE.turnNear, turnLater: TURN_AT_PLACE.wait - (r.pace.shared?.wait ?? 1), gripYaw: TURN_AT_PLACE.gripYaw}; state.touched = true; showDeal(true); });
$('save').addEventListener('click', async () => {
  if (!now?.deal || state.shown.kind !== 'deal' || fault) return; const name = standardName(state.doll, state.place), button = $<HTMLButtonElement>('save'); button.disabled = true;
  // Exactly the frames on the stage, for this doll, with what they were laid from (for "Naturlig" also the shoulders and elbows, and how much of the body's steering she took).
  const lab = {...now.deal.lab, steer: state.steer, doll: state.doll, place: state.place, shortMm: now.shortMm, savedAt: new Date().toISOString(), ...(now.way === 'naturlig' ? {naturlig: {knobs: state.knobs, bodyShare: now.bodyShare}} : {})};
  const motion = {...now.motion, doll: state.doll, lab};
  try { const r = await fetch(`/dealer3d/standard/${name}.json`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(motion)}), answer = await r.json(); if (!r.ok) throw Error(answer.error ?? String(r.status));
    standards = answer.standards; now = {...now, motion, saved: true, from: 'saved', savedWay: now.way}; paint(); }
  catch (e) { paint(); const status = $('status'); status.className = 'small warn'; status.textContent = `Sparades inte: ${String((e as Error).message ?? e)}`; }
});

// The clock: the time runs while it plays (a breath on the last picture before a loop begins again), and the stage is drawn only when something has changed.
let last = performance.now();
function tick(ms: number) {
  const dt = Math.min(0.1, (ms - last) / 1000); last = ms;
  if (stage) { size();
    if (state.playing) { const length = stage.duration(); state.t += dt * state.speed;
      if (state.t >= length + (state.loop ? 0.5 : 0)) { if (state.loop) state.t = 0; else { state.t = length; state.playing = false; paint(); } }
      stage.setTime(Math.min(state.t, length)); transport(); grip(); }
    if (stage.needsDraw()) stage.draw(); }
  requestAnimationFrame(tick);
}
try { await setDoll(state.doll); } catch (e) { $('note').textContent = `Docklabbet kunde inte starta: ${String((e as Error).message ?? e)}`; throw e; }
requestAnimationFrame(tick);
(window as unknown as {docklabb: unknown}).docklabb = {ready: true, facts: () => ({doll: state.doll, way: wayOf(), shown: state.shown, place: state.place, steer: state.steer, knobs: state.knobs, playing: state.playing, t: state.t, duration: stage?.duration(), fault, saved: now?.saved ?? false, from: now?.from ?? null, savedWay: now?.savedWay ?? null, shortMm: now?.shortMm ?? 0,
  frames: now?.motion.frameCount, forced: now?.deal?.elbowForced ?? null, throughShoe: now?.deal?.throughShoe ?? null, note: $('note').textContent, status: $('status').textContent, grip: $('grip').textContent, standards: standards.map(s => s.name), camera: stage?.camera(), bodyShare: now?.bodyShare ?? null,
  // What "Naturlig" did, over the whole deal: the hands' least gap, the wrists' most bend, the thumb's most gap from the card while the forefinger is on it (to the beat the card lies), and the fingertips on the card now.
  natural: now?.receipt ? (() => { const f = now.receipt!.frames, h = Math.ceil(((now.motion as {beats?: {h: number}[]}).beats?.[0]?.h) ?? f.length), held = f.filter(x => x.i <= h && x.touching.includes('R1'));
    return {apartMm: Math.min(...f.map(x => x.apartMm)), wristDeg: Math.max(...f.map(x => Math.max(...x.wristDeg))), thumbCardMm: held.length ? Math.max(...held.map(x => x.thumbCardMm[1])) : null, throughCard: f.reduce((s, x) => s + x.throughCard[1], 0)}; })() : null,
  touching: stage?.touching().map(t => `${t.hand}${t.finger} ${t.name} ${whereOn(t)}`) ?? [],
  // Where her right wrist and the card are, in the room and in the picture now (CSS pixels of the canvas): for checking a view against the film's own.
  seen: (() => { const m = now?.motion, i = m ? Math.min(m.frameCount - 1, Math.round(state.t * m.fps)) : 0, of = (world: number[]) => ({world, at: stage!.seen(world)}); return m && stage ? {wrist: of(m.frames[i].R.w), card: of(m.frames[i].card.c)} : null; })()})};
// Embedded in the studio (?inbaddad=1: Scen & bord's part Docka, studio/components/bordet/DollPanel.tsx): the card chosen here
// is told to the page around the frame, and a card chosen there is chosen here; where reglagen are moved and not saved the
// deal stays, and the page around is told which card is still shown. Only the lab's own origin is told and heard.
if (asked.get('inbaddad') === '1' && parent !== window) {
  const tell = () => parent.postMessage({docklabb: {place: state.place}}, location.origin);
  $('places').addEventListener('click', e => { if ((e.target as HTMLElement).closest('button[data-place]')) tell(); });
  addEventListener('message', e => { const place = (e.data as {docklabb?: {place?: unknown}} | null)?.docklabb?.place; if (e.source !== parent || e.origin !== location.origin || typeof place !== 'string') return;
    const b = [...document.querySelectorAll<HTMLButtonElement>('#places button')].find(x => x.dataset.place === place);
    if (b && !b.disabled && place !== state.place && (untouched() || now?.saved)) b.click(); else tell(); });
}
