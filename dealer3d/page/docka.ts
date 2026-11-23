// The doll lab (Jakob 2026-11-23): the white doll at the table in a view the mouse turns, set in her poses (A1, A2.1,
// A2.3) and dealing one card from an entry (A2.3, or A2.1; lay.ts Entry) to a place of his plan, the deal alone or with its
// return to the entry's pose ("Giv och återgång", as dealer3d/tools/docka-cykel.ts makes it for an order), with play,
// pause, scrubbing and speed, the joints and the fingertips on the card marked, the sliders that lay the deal again as
// they are moved, and "Spara som standard", which writes what is shown as a motion file for that doll, entry and place
// (dealer3d/standard/, lay.ts standardName; the routes are dealer3d/page/server.ts). The room and the doll are
// dealer3d/src/stage.ts's (page/lab-stage.ts), a deal from A2.3 is laid by dealer3d/src/two-hand.ts from the recipe of a
// stored deal (page/lay.ts), one from A2.1 is a read one-hand deal (lay.ts readDeal; for Paow her own, read off her
// films, a clip of her choice where there are several: lay.ts PAOW_READS), and either is posed on the doll
// paow as dealer3d/tools/doll-pose.ts poses it (page/pose-on-doll.ts): nothing is drawn or posed here that those do not make.
// Two ways of dealing from A2.3 (page/natural-lab.ts): "Naturlig", the standard for Paow (the hands hand the card over
// without meeting, thumb and forefinger hold its corner, her left hand at the shoe as her picture has it, the body,
// shoulders and elbows steered on her as far as her arms reach; dealer3d/src/natural.ts), and "Som förut", the deal as
// the lab laid it before, kept until Jakob has said yes to the new. From A2.1 there is one: the deal as read.
// Everything is laid here, with the shoe the films have (src/table-lens.ts SHOE): a stored file began in the shoe of before
// 2026-11-23, 3 cm off, and is not played. A standard he has saved is laid again from its recipe and his sliders, the way
// he saved it in, whichever way is chosen; the file stays as it is.
// window.docklabb is for a test that looks at the page: ready, and facts() of what is shown.
import {createLabStage, type LabStage, type Touch, type ViewName} from './lab-stage.ts';
import {NO_STEER, PAOW_READS, TURN_AT_PLACE, cardInFilmsShoe, cardTempoMost, cardTempoOf, layDeal, placeFrom, readClip, readDeal, recipeOf, shares, standardName, type Entry, type LaidDeal, type PoseFilm, type ReadDeal, type ReadStored, type Recipe, type Steer, type Stored} from './lay.ts';
import {NO_KNOBS, dollFor, gripYawsOf, layNatural, moveNatural, onDoll, withReturn, type Knobs, type LaidNatural, type Way} from './natural-lab.ts';
import {LANDINGS, LANDING_DEFAULT, SHAPING_KNOBS, asBefore, landingOf, landingWords, type Landing, type LandingReceipt} from '../src/landing.ts';
import {TURNS, TURN_DEFAULT, turnOf, type TurnId, type TurnReceipt} from '../src/turn-in-hand.ts';
import type {PoseOptions} from './pose-on-doll.ts';
import {dollNamed, type Doll} from '../src/doll.ts';
import {filmLens, type Plan} from '../src/world.ts';
import {CARD} from '../src/camera.ts';
import {TWO_HAND} from '../src/two-hand.ts';
import type {Read} from '../src/stage.ts';

type Pose = 'A1' | 'A2.1' | 'A2.3';
type Shown = {kind: 'pose'; pose: Pose} | {kind: 'deal'};
/** How a deal shown was laid: a way from A2.3, or as read (from A2.1). */
type How = Way | 'read';
type Motion = Read & {doll?: string; lab?: Record<string, unknown>; cycle?: unknown};
type Standard = {name: string; doll: string; place: string; savedAt: string};
/** What a saved standard carries of how it was made: the recipe, the sliders, for "Naturlig" the shoulders and elbows (`naturlig`, which a standard saved before has not), the landing and the turn where they are not the default (`landing`, landing.ts; `turn`, turn-in-hand.ts), and with its return the return (`back`). */
type SavedLab = {recipe?: string; steer?: Steer; bodyAsked?: [number, number, number]; shortMm?: number; naturlig?: {knobs?: Partial<Knobs>; bodyShare?: number}; landing?: unknown; turn?: unknown; back?: unknown};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const get = async (address: string) => { const r = await fetch(address, {cache: 'no-store'}); if (!r.ok) throw Error(`${address}: ${r.status}`); return r.json(); };
const files = new Map<string, Promise<unknown>>(), stored = <T>(name: string) => { let p = files.get(name); if (!p) { p = get(`/dealer3d/data/${name}.json`); files.set(name, p); } return p as Promise<T>; };
// The file a deal is laid from and its SHA-256, as a return names its source (the browser's own digest; none where it has none).
const sums = new Map<string, Promise<{path: string; sha256: string}>>(), sourceOf = (name: string) => { let p = sums.get(name); const path = `dealer3d/data/${name}.json`;
  if (!p) { p = (async () => { try { const bytes = await (await fetch(`/${path}`, {cache: 'no-store'})).arrayBuffer(), sum = await crypto.subtle.digest('SHA-256', bytes); return {path, sha256: [...new Uint8Array(sum)].map(b => b.toString(16).padStart(2, '0')).join('')}; } catch { return {path, sha256: ''}; } })(); sums.set(name, p); }
  return p; };
const comma = (n: number, digits = 0) => n.toFixed(digits).replace('.', ',').replace('-', '−');
const DOLLS: Record<string, string> = {paow: 'Paow', standard: 'Standarddockan'}, LENT = {'seat 5': 'receptet lånat av plats 5', 'her first card': 'receptet lånat av kort 1'};
const WHY = {reach: 'når inte', closed: 'stängt kort', unread: 'ingen giv från A2.1 är läst dit', unbuilt: 'A2.2 är inte byggd'};
const WAYS: Record<How, string> = {naturlig: 'Naturlig', forut: 'Som förut', read: 'Avläst giv'};
// The pose films: A1 is the first frame of the film to A2.3 and A2.3 its last (dealer3d/tools/doll-still.ts); A2.1, the
// pinch at the shoe, is the first frame of the read deals (lay.ts READ_DEALS; Paow's, of her clip chosen to P4.C1), in
// the films' shoe as a deal from A2.1 begins (lay.ts readDeal). A2.2 has no pose in the code.
const POSES: Record<Pose, {film: string; end: boolean; read?: boolean; said?: string}> = {
  'A1': {film: 'till-ankare-2-3-c', end: false}, 'A2.3': {film: 'till-ankare-2-3-c', end: true},
  'A2.1': {film: 'giv-avlast-p4', end: false, read: true, said: 'Avläst nyp'}};
const placeWords = (id: string) => { const m = /^(?:P([1-7])|D)\.C([123])$/.exec(id)!; return m[1] ? `plats ${m[1]}, kort ${m[2]}` : `dealern, kort ${m[2]}`; };
const knobsOf = (k?: Partial<Knobs>): Knobs => ({shoulderR: [...(k?.shoulderR ?? NO_KNOBS.shoulderR)] as [number, number], shoulderL: [...(k?.shoulderL ?? NO_KNOBS.shoulderL)] as [number, number], elbowOut: [...(k?.elbowOut ?? NO_KNOBS.elbowOut)] as [number, number]});

const plan = await get('/dealer3d/plan').catch(e => { $('note').textContent = 'Docklabbet kunde inte läsa kortplanen.'; throw e; }) as Plan, lens = filmLens();
const state = {doll: 'paow', way: 'naturlig' as Way, entry: 'A2.3' as Entry, back: false, clip: null as string | null, clipChosen: false, shown: {kind: 'deal'} as Shown, place: 'P4.C1', steer: {...NO_STEER} as Steer, knobs: knobsOf(), landing: {id: LANDING_DEFAULT} as Landing, turn: TURN_DEFAULT as TurnId, touched: false, playing: false, speed: 1, loop: false, joints: false, view: 'film' as ViewName, t: 0};
/** Whether a deal goes from `entry` to the place `id` (for the chosen doll: from A2.1 Paow has her own clips where she has them). */
const opens = (entry: Entry, id: string) => { const r = placeFrom(entry, id, state.doll); return !!r && !('none' in r); };
/** Paow's read clip to the chosen place from A2.1 (lay.ts readClip): the one chosen where the place has it, else its first; null where the doll has none there. */
const clipNow = () => state.entry === 'A2.1' ? readClip(state.doll, state.place, state.clip) : null;
// The address may name the doll, the entry, the card and the clip to begin on (/dealer3d/docka?docka=paow&fran=a2-1&plats=p4c1&klipp=11):
// the studio's Scen & bord opens the lab on the card chosen there. Without the words, or with a place no deal is laid to
// from the entry, it begins as before; a clip the place has not is its first.
const asked = new URLSearchParams(location.search);
{ if (Object.hasOwn(DOLLS, asked.get('docka') ?? '')) state.doll = asked.get('docka')!; if (asked.get('fran') === 'a2-1') state.entry = 'A2.1';
  const m = /^(?:p([1-7])|d)c([123])$/.exec(asked.get('plats') ?? ''), id = m ? `${m[1] ? `P${m[1]}` : 'D'}.C${m[2]}` : null;
  if (id && Object.hasOwn(plan.targets, id) && opens(state.entry, id)) state.place = id; else if (!opens(state.entry, state.place)) state.place = Object.keys(plan.targets).find(k => opens(state.entry, k)) ?? state.place;
  const k = asked.get('klipp'); if (k) { state.clip = k; state.clipChosen = true; } }
/** The way a deal from A2.3 is shown now: "Naturlig" is Paow's (the standard doll is locked, and keeps "Som förut"). */
const wayOf = (): Way => state.doll === 'standard' ? 'forut' : state.way;
// What is on the stage now: the motion, and for a deal what it was laid from. `from`: a saved standard (laid again from what it was saved with), laid here as steered, or a pose. `fault`: why the last laying did not go (the motion is then the last that did).
// `back`: shown with its return; `savedBack`: the standard was saved with its return.
type Now = {doll: string; place: string | null; entry: Entry; back: boolean; clip: string | null; motion: Motion; deal: LaidDeal | ReadDeal | null; recipe: Recipe | null; lent: string | null; shortMm: number; saved: boolean; said: string | null;
  way: How; from: 'saved' | 'laid' | 'pose'; savedWay: How | null; savedBack: boolean | null; bodyShare: number | null; receipt: ReturnType<typeof moveNatural>['receipt'] | null; landed: LandingReceipt | null; turned: TurnReceipt | null};
let now: Now | null = null, fault: string | null = null, laid: {key: string; value: LaidNatural} | null = null;
let standards: Standard[] = (await get('/dealer3d/standard').catch(() => ({standards: []}))).standards, stage: LabStage | null = null, held = 0;

/** A motion made with the standard doll, on the doll `D` (the chosen one, as a way has her); and how far paow's arm is too short at the worst, millimetres. */
const posedOn = (motion: object, D: Doll, options?: PoseOptions) => onDoll(lens, motion, D, options) as unknown as {motion: Motion; shortMm: number};
const plain = (e: unknown) => { const s = String((e as Error)?.message ?? e); return /reach/.test(s) ? 'armen når inte' : /frames to turn|too few|settle/.test(s) ? 'för snabbt för vändningen' : /grip/.test(s) ? 'greppet passar inte platsen' : /return moves too far/.test(s) ? 'återgången går för fort' : 'går inte att räkna'; };

/** A recipe by the name of its stored deal, and the pose film it begins on. */
const recipeNamed = async (name: string) => { const recipe = recipeOf(name, await stored<Stored & Motion>(name)); return {recipe, pose: await stored<PoseFilm>(recipe.poseFilm ?? 'till-ankare-2-3')}; };
/** Where the deal from the entry to the place comes from: a recipe (A2.3) or a read deal (A2.1). */
async function dealOfPlace(entry: Entry, place: string, doll: string, clip: string | null) {
  const r = placeFrom(entry, place, doll, clip); if (!r || 'none' in r) return null;
  if ('read' in r) return {read: r.read, clip: r.clip ?? null, lent: null};
  return {...await recipeNamed(r.recipe), lent: r.lent ? LENT[r.lent] : null};
}
const untouched = () => JSON.stringify(state.steer) === JSON.stringify(NO_STEER) && JSON.stringify(state.knobs) === JSON.stringify(NO_KNOBS) && asBefore(state.landing) && state.turn === TURN_DEFAULT;
type Laid = {motion: Motion; deal: LaidDeal | ReadDeal; shortMm: number; bodyShare: number | null; receipt: Now['receipt']; landed: LandingReceipt | null; turned: TurnReceipt | null};
/**
 * Lays the deal from the chosen entry to the chosen place the chosen way, as steered, on the doll, alone or with its return;
 * or, untouched, the standard saved for the doll, entry and place, laid again from its recipe and his sliders the way it
 * was saved in. Keeps what is shown where the laying does not go.
 */
async function showDeal(keepTime = false) {
  const place = state.place, doll = state.doll, entry = state.entry, back = state.back, chosen = wayOf(); let clip = state.clip, found = await dealOfPlace(entry, place, doll, clip);
  const stale = () => place !== state.place || doll !== state.doll || entry !== state.entry || back !== state.back || chosen !== wayOf() || clip !== state.clip;
  if (!found || stale()) return;
  const saved = state.touched ? null : standards.find(s => s.name === standardName(doll, entry, place)), D = dollNamed(doll);
  try {
    let lab: SavedLab | null = null;
    if (saved) { lab = ((await get(`/dealer3d/standard/${saved.name}.json`) as Motion).lab ?? {}) as SavedLab; if (stale()) return; }
    let way: How, savedWay: How | null = null, recipe: Recipe | null = null, shown: Laid;
    if ('read' in found) {
      // From A2.1: the read deal, as read; a standard saved from there is the clip it was saved with, where no clip is chosen.
      const own = lab && !state.clipChosen ? Object.entries(PAOW_READS[place]?.clips ?? {}).find(([, c]) => c.read === (lab as {read?: string}).read)?.[0] : undefined;
      if (own && own !== clip) { clip = state.clip = own; found = await dealOfPlace(entry, place, doll, clip); if (!found || !('read' in found) || stale()) return; }
      const deal = readDeal(found.read, await stored<ReadStored>(found.read), place), source = back ? await sourceOf(found.read) : null; if (stale()) return;
      way = 'read'; savedWay = saved ? 'read' : null;
      const r = source ? withReturn(deal as never, {way, body: null, knobs: NO_KNOBS, lens, doll: D, source}) : posedOn(deal, D, {hands: 'motion'});
      shown = {motion: r.motion as Motion, deal, shortMm: r.shortMm, bodyShare: null, receipt: null, landed: null, turned: null}; }
    else {
      let {recipe: own, pose} = found; way = chosen;
      if (lab) { state.steer = {...NO_STEER, ...lab.steer}; state.knobs = knobsOf(lab.naturlig?.knobs); state.landing = landingOf(lab.landing); state.turn = turnOf(lab.turn); savedWay = lab.naturlig ? 'naturlig' : 'forut'; way = doll === 'standard' ? 'forut' : savedWay;
        if (lab.recipe && lab.recipe !== own.from) ({recipe: own, pose} = await recipeNamed(lab.recipe)); if (stale()) return; }
      recipe = own; const source = back ? await sourceOf(own.from) : null; if (stale()) return;
      if (way === 'naturlig') {
        // (laid again only when what the laying takes has changed: the body, shoulders and elbows move the doll on the deal laid last)
        const key = JSON.stringify([doll, place, own.from, {...state.steer, body: null}]);
        if (laid?.key !== key) laid = {key, value: layNatural({plan, target: place, recipe: own, pose, steer: state.steer, lens, doll: D})};
        if (source) { const r = withReturn(laid.value.deal, {way, body: state.steer.body, knobs: state.knobs, lens, doll: D, source, landing: state.landing, turn: state.turn, cardTempo: cardTempoOf(state.steer)}); shown = {motion: r.motion as unknown as Motion, deal: laid.value.deal, shortMm: r.shortMm, bodyShare: r.bodyShare, receipt: r.receipt, landed: r.landing, turned: r.turn}; }
        else { const moved = moveNatural(laid.value, state.steer.body, state.knobs, lens, state.landing, state.turn); shown = {motion: moved.motion as unknown as Motion, deal: laid.value.deal, shortMm: laid.value.shortMm, bodyShare: moved.bodyShare, receipt: moved.receipt, landed: moved.landing, turned: moved.turn}; } }
      else {
        // "Som förut": the deal as the lab laid it before, as steered.
        const deal = layDeal({plan, target: place, recipe: own, pose, steer: state.steer}), r = source ? withReturn(deal, {way: 'forut', body: null, knobs: NO_KNOBS, lens, doll: D, source, cardTempo: cardTempoOf(state.steer)}) : posedOn(deal, D);
        shown = {motion: r.motion as unknown as Motion, deal, shortMm: r.shortMm, bodyShare: null, receipt: null, landed: null, turned: null}; } }
    const savedBack = lab ? !!lab.back : null;
    now = {doll, place, entry, back, clip: 'clip' in found ? found.clip : null, recipe, lent: found.lent, said: way === 'read' && doll !== 'standard' ? `på ${DOLLS[doll]}s kropp` : null, way, saved: !!saved && savedBack === back, from: saved ? 'saved' : 'laid', savedWay, savedBack, ...shown};
    fault = null;
  } catch (e) { fault = plain(e); console.warn(e); if (!now || now.place !== place || now.doll !== doll || now.entry !== entry || state.shown.kind !== 'deal') { paint(); return; } }
  if (stale()) return;
  state.shown = {kind: 'deal'}; const t = keepTime ? state.t : 0; stage!.setTarget(place); stage!.setMotion(now!.motion); state.t = Math.min(t, stage!.duration()); stage!.setTime(state.t); paint();
}
async function showPose(pose: Pose) {
  // A1 and A2.3 on the doll as the way has her (in "Naturlig" her left hand at the shoe as her picture has it); A2.1 as read, in the films' shoe.
  const p = POSES[pose], doll = state.doll, name = p.read ? readClip(doll, 'P4.C1', state.clip)?.read ?? p.film : p.film, film = await stored<Motion & ReadStored>(name); if (doll !== state.doll) return;
  const posed = p.read ? posedOn(readDeal(name, film, null), dollNamed(doll), {hands: 'motion'}) : posedOn(film, dollFor(wayOf(), dollNamed(doll)));
  if (!p.read) posed.motion = cardInFilmsShoe(posed.motion as Motion & {frames: {card: {c: number[]; l: number[]; n: number[]}}[]}); // the pose films' card stood in the shoe of before 2026-11-23
  state.shown = {kind: 'pose', pose}; state.playing = false; fault = null;
  now = {doll, place: null, entry: state.entry, back: false, clip: null, motion: posed.motion, deal: null, recipe: null, lent: null, shortMm: 0, saved: false, said: p.said && doll !== 'standard' ? `${p.said} på ${DOLLS[doll]}s kropp` : p.said ?? null, way: wayOf(), from: 'pose', savedWay: null, savedBack: null, bodyShare: null, receipt: null, landed: null, turned: null};
  stage!.setMotion(posed.motion); state.t = p.end ? stage!.duration() : 0; stage!.setTime(state.t); paint();
}
const show = (keepTime = false) => state.shown.kind === 'deal' ? showDeal(keepTime) : showPose(state.shown.pose);

/** A stage for the chosen doll on a canvas of its own (a stage's doll is fixed when it is made). */
async function setDoll(name: string) {
  state.doll = name; state.touched = false; state.steer = {...NO_STEER}; state.knobs = knobsOf(); state.landing = {id: LANDING_DEFAULT}; state.turn = TURN_DEFAULT;
  const first = posedOn(await stored<Motion>('till-ankare-2-3-c'), dollNamed(name)).motion, old = $('stage'), canvas = document.createElement('canvas'); canvas.id = 'stage';
  stage?.dispose(); old.replaceWith(canvas); size(canvas); stage = createLabStage(canvas, plan, dollNamed(name), first); stage.setJoints(state.joints); stage.setGrips(gripsShown()); stage.setTarget(state.place); stage.view(state.view);
  await show();
}
function size(canvas = $<HTMLCanvasElement>('stage')) { const box = $('frame').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(2, Math.round(box.width * dpr)), h = Math.max(2, Math.round(box.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; stage?.resized(); } }
/** The fingertips on the card are marked with the joints, and always close on the card. */
const gripsShown = () => state.joints || state.view === 'card';

// The sliders: each shows the recipe's own value until it is moved (the hand's angle on the card: in "Naturlig" 17° as her right hand takes it and −30° once it is turned, natural-lab.ts gripYawsOf), and lays the deal again when it is. From A2.1 none: the deal is as read.
type Knob = {name: string; group?: string; min: () => number; max: () => number; step: number; on: () => boolean; value: () => number; set: (v: number) => void; text: (v: number) => string; only?: string};
const R = () => now?.recipe ?? null, bodyNow = (): [number, number, number] => state.steer.body ?? ((now?.deal?.lab as {bodyAsked?: [number, number, number]} | undefined)?.bodyAsked ?? ((now?.motion.lab as {bodyAsked?: [number, number, number]} | undefined)?.bodyAsked) ?? [0, 0, 0]);
/** The way the deal on the stage was laid in (a saved standard is laid in its own), or the chosen one. */
const wayShown = (): Way => now && now.way !== 'read' && state.shown.kind === 'deal' ? now.way : wayOf();
/** The hand's two angles on the card, as her right hand takes it and once it is turned; moving either slider sets both, the other as it shows (both at −30: "Naturlig" as it was before the two). */
const yawsNow = (): [number, number] => (R() && gripYawsOf(R()!, state.steer, wayShown())) ?? [15, 15];
const yawKnob = (j: 0 | 1, name: string): Knob => ({name, min: () => -45, max: () => 40, step: 1, on: () => !!R()?.pace.contactGrip, value: () => yawsNow()[j], set: v => { const y = yawsNow(); y[j] = v; state.steer.gripYaw = y[0]; state.steer.gripYawEnd = y[1]; }, text: v => `${comma(v)}°`});
const body = (i: number, name: string, min: number, max: number, text: (v: number) => string, group?: string): Knob => ({name, group, min: () => min, max: () => max, step: 0.5, on: () => !!R(), value: () => bodyNow()[i], set: v => { const b = [...bodyNow()] as [number, number, number]; b[i] = v; state.steer.body = b; }, text});
/** A slider of "Naturlig" only: a shoulder or an elbow, laid on the doll by dealer3d/src/natural.ts. */
const natural = (key: keyof Knobs, j: 0 | 1, name: string, min: number, max: number, step: number, text: (v: number) => string): Knob => ({name, min: () => min, max: () => max, step, on: () => !!R() && wayOf() === 'naturlig', value: () => state.knobs[key][j],
  set: v => { const k = [...state.knobs[key]] as [number, number]; k[j] = v; state.knobs = {...state.knobs, [key]: k}; }, text, only: 'Bara i Naturlig'});
const cm = (up: string, down: string) => (v: number) => v ? `${comma(Math.abs(v), 1)} cm ${v > 0 ? up : down}` : '0', out = (v: number) => v ? `${comma(Math.abs(v))}° ${v > 0 ? 'ut' : 'in'}` : '0°';
const KNOBS: Knob[] = [
  {name: 'Var kortet vänds', group: 'Kortet', min: () => 0, max: () => 90, step: 5, on: () => !!R()?.pace.single, value: () => Math.round((state.steer.turnNear ?? R()?.pace.turnNear ?? 0) * 100), set: v => { state.steer.turnNear = v / 100; }, text: v => v ? `${v} % av vägen` : 'från handbytet'},
  {name: 'Vändningen börjar', min: () => R() && shares(R()!) ? -(R()!.pace.shared?.wait ?? 1) : -6, max: () => R() && shares(R()!) ? 20 : 10, step: 1, on: () => !!R(), value: () => state.steer.turnLater, set: v => { state.steer.turnLater = v; }, text: v => v ? `${v > 0 ? '+' : ''}${comma(v / 30, 2)} s` : 'som receptet'},
  {name: 'Handens höjd', min: () => 1, max: () => 12, step: 0.5, on: () => !!R()?.pace.single, value: () => (state.steer.carry ?? R()?.pace.carry ?? TWO_HAND.heights.carry) * 100, set: v => { state.steer.carry = v / 100; }, text: v => `${comma(v, 1)} cm`},
  yawKnob(0, 'Handens vinkel när högerhanden tar kortet'),
  yawKnob(1, 'Handens vinkel när kortet är vänt och läggs'),
  body(2, 'Lutning framåt', -5, 30, v => `${comma(v, 1)}°`, 'Kroppen'),
  body(0, 'Lutning åt sidan', -25, 25, v => v ? `${comma(Math.abs(v), 1)}° mot plats ${v > 0 ? 7 : 1}` : '0°'),
  body(1, 'Vridning', -15, 30, v => v ? `${comma(Math.abs(v), 1)}° ${v > 0 ? 'höger' : 'vänster'} axel fram` : '0°'),
  natural('shoulderR', 0, 'Höger axel upp', -2, 4, 0.5, cm('upp', 'ned')),
  natural('shoulderR', 1, 'Höger axel fram', -3, 4, 0.5, cm('fram', 'bak')),
  natural('shoulderL', 0, 'Vänster axel upp', -2, 4, 0.5, cm('upp', 'ned')),
  natural('shoulderL', 1, 'Vänster axel fram', -3, 4, 0.5, cm('fram', 'bak')),
  natural('elbowOut', 0, 'Höger armbåge ut', -20, 40, 1, out),
  natural('elbowOut', 1, 'Vänster armbåge ut', -20, 40, 1, out),
  // (Jakob 2026-11-23: "det är hennes rörelser med kortet som ska gå snabbare"; lay.ts Steer.cardTempo. "Hela given" is the tempo of before, everything faster.)
  {name: 'Kortets fart', group: 'Fart', min: () => 100, max: () => R() ? Math.round(cardTempoMost(R()!, state.steer) * 100) : 100, step: 5, on: () => !!R(), value: () => Math.round(cardTempoOf(state.steer) * 100), set: v => { if (v === 100) delete state.steer.cardTempo; else state.steer.cardTempo = v / 100; }, text: v => v === 100 ? '100 %' : `${v} %, bara korthänderna`},
  {name: 'Hela given', min: () => 40, max: () => R() && shares(R()!) ? 100 : 150, step: 5, on: () => !!R(), value: () => Math.round(state.steer.tempo * 100), set: v => { state.steer.tempo = v / 100; }, text: v => `${v} %`},
];
const knobs = KNOBS.map(k => { const box = $('knobs'); if (k.group) { const h = document.createElement('h3'); h.textContent = k.group; box.append(h); }
  const label = document.createElement('label'), name = document.createElement('span'), out = document.createElement('output'), input = document.createElement('input'); label.className = 'knob'; name.textContent = k.name; input.type = 'range'; input.step = String(k.step); label.append(name, out, input); box.append(label);
  input.addEventListener('input', () => { k.set(Number(input.value)); out.textContent = k.text(Number(input.value)); state.touched = true; clearTimeout(held); held = setTimeout(() => showDeal(true), 140); });
  input.addEventListener('change', () => { clearTimeout(held); showDeal(true); });
  return {k, label, out, input}; });
// The landing (dealer3d/src/landing.ts, "Naturlig" only): her right hand's end pose at the laid card, one of LANDINGS, and
// his own shaping on top of it (how far onto the card, the hand rolled, the wrist bent, the fingers spread, the free fingers curled).
const landingOn = () => state.shown.kind === 'deal' && !!R() && wayShown() === 'naturlig';
const landingButtons = LANDINGS.map(l => { const b = document.createElement('button'); b.dataset.landing = l.id; b.textContent = l.label; $('landings').append(b);
  b.addEventListener('click', () => { if (b.disabled || state.landing.id === l.id) return; state.landing = {...state.landing, id: l.id}; state.touched = true; showDeal(true); }); return b; });
// The turn (dealer3d/src/turn-in-hand.ts, "Naturlig" only): how her right hand turns the card face up, one of TURNS.
const turnButtons = TURNS.map(t => { const b = document.createElement('button'); b.dataset.turn = t.id; b.textContent = t.label; $('turns').append(b);
  b.addEventListener('click', () => { if (b.disabled || state.turn === t.id) return; state.turn = t.id; state.touched = true; showDeal(true); }); return b; });
const shapers = SHAPING_KNOBS.map(k => { const label = document.createElement('label'), name = document.createElement('span'), out = document.createElement('output'), input = document.createElement('input');
  label.className = 'knob'; name.textContent = k.label; input.type = 'range'; input.min = String(k.min); input.max = String(k.max); input.step = String(k.step); label.append(name, out, input); $('shaping').append(label);
  const said = (v: number) => v ? `${comma(Math.abs(v), k.step < 1 ? 1 : 0)}${k.unit === '°' ? '°' : ` ${k.unit}`} ${v > 0 ? k.plus : k.minus}` : '0';
  input.addEventListener('input', () => { const v = Number(input.value), l: Landing = {...state.landing}; if (v) l[k.key] = v; else delete l[k.key]; state.landing = l; out.textContent = said(v); state.touched = true; clearTimeout(held); held = setTimeout(() => showDeal(true), 140); });
  input.addEventListener('change', () => { clearTimeout(held); showDeal(true); });
  return {k, label, out, input, said}; });

/** Everything on the page that says what is chosen and shown. */
function paint() {
  const deal = state.shown.kind === 'deal', saved = standards.find(s => s.name === standardName(state.doll, state.entry, state.place)), way = wayOf(), read = state.entry === 'A2.1';
  for (const b of document.querySelectorAll<HTMLButtonElement>('#dolls button')) b.setAttribute('aria-pressed', String(b.dataset.doll === state.doll));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#ways button')) { const off = (state.doll === 'standard' && b.dataset.way === 'naturlig') || (read && deal); b.setAttribute('aria-pressed', String(!(read && deal) && b.dataset.way === way)); b.disabled = off; b.title = !off ? '' : read && deal ? 'Från A2.1 finns ett sätt: given som den är läst' : 'Bara för Paow'; }
  $('wayNote').textContent = read && deal && now?.clip ? 'Från A2.1: Paows egen giv med vänsterhanden, läst ur hennes film, inga reglage.' : read && deal ? 'Från A2.1: given med vänsterhanden som den är avläst, inga reglage.' : state.doll === 'standard' ? 'Naturlig finns bara för Paow.' : way === 'naturlig' ? 'Händerna möts inte vid handbytet, tummen och pekfingret håller kortets hörn, vänsterhanden ligger på skon som i hennes bild, och kroppen följer reglagen så långt armarna når.' : 'Given som labbet lade den före 23 november, med filmens sko.';
  for (const b of document.querySelectorAll<HTMLButtonElement>('#poses button')) b.setAttribute('aria-pressed', String(!deal && b.dataset.pose === (state.shown as {pose?: string}).pose));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#entries button')) b.setAttribute('aria-pressed', String(b.dataset.entry === state.entry));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#backs button')) b.setAttribute('aria-pressed', String((b.dataset.back === '1') === state.back));
  $('dealHead').textContent = `Giv från ${state.entry} till`;
  const closed: string[] = [];
  for (const b of document.querySelectorAll<HTMLButtonElement>('#places button')) { const id = b.dataset.place!, r = placeFrom(state.entry, id, state.doll), open = !!r && !('none' in r);
    b.disabled = !open; b.textContent = open ? '●' : '–'; b.title = open || !r ? placeWords(id) : `${placeWords(id)}: ${WHY[(r as {none: keyof typeof WHY}).none]}`; if (!open && r) closed.push(b.title);
    b.setAttribute('aria-pressed', String(deal && id === state.place)); b.classList.toggle('saved', standards.some(s => s.name === standardName(state.doll, state.entry, id))); }
  const clip = deal ? clipNow() : null, clips = read && deal && clip ? Object.keys(PAOW_READS[state.place].clips).sort() : [];
  $('clipsBox').hidden = !clips.length;
  if (clips.length) { const row = $('clips'); if (row.dataset.place !== state.place) { row.dataset.place = state.place; row.replaceChildren(...clips.map(id => { const b = document.createElement('button'), c = PAOW_READS[state.place].clips[id]; b.dataset.clip = id; b.textContent = id === PAOW_READS[state.place].first ? `${id} (förval)` : id; b.title = c.film; return b; })); }
    for (const b of row.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.clip === clip!.clip));
    $('clipNote').textContent = `Hennes egen giv, läst ur ${clip!.film}, i filmens takt.${clip!.clip === PAOW_READS[state.place].first ? ` Förval: ${PAOW_READS[state.place].why}` : ''}`; }
  $('closed').textContent = read && state.doll === 'paow' ? 'Från A2.1: Paows egna givar, lästa ur hennes filmer, till plats 4, kort 1; till plats 1, 3 och 5, kort 1, de gamla avlästa.' : read ? 'Från A2.1 finns bara de avlästa givarna: plats 1, 3, 4 och 5, kort 1.' : closed.map(c => c[0].toUpperCase() + c.slice(1)).join('. ') + (closed.length ? '.' : '');
  for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === state.speed));
  for (const {k, label, out, input} of knobs) { const on = deal && k.on(); input.disabled = !on; label.classList.toggle('off', !on); label.title = !on && deal ? (read ? 'Från A2.1 är given som den är läst' : k.only ?? '') : ''; input.min = String(k.min()); input.max = String(k.max());
    if (on) { const v = Math.max(k.min(), Math.min(k.max(), k.value())); input.value = String(v); out.textContent = k.text(k.value()); } else out.textContent = ''; }
  const lon = landingOn(), ld = lon ? now?.landed ?? null : null, landingNote = $('landingNote');
  for (const b of landingButtons) { b.disabled = !lon; b.setAttribute('aria-pressed', String(lon && b.dataset.landing === state.landing.id)); b.title = !lon && deal ? 'Bara i Naturlig' : ''; }
  for (const {k, label, out, input, said} of shapers) { const v = state.landing[k.key] ?? 0; input.disabled = !lon; label.classList.toggle('off', !lon); label.title = !lon && deal ? 'Bara i Naturlig' : ''; input.value = String(v); out.textContent = lon ? said(v) : ''; }
  landingNote.className = ld && (ld.liftedMm || ld.shortMm) ? 'small warn' : 'small';
  landingNote.textContent = !deal ? '' : !lon ? 'Landningen finns bara i Naturlig.' : !ld ? 'Förvalet: långfingret på kortet, som hon alltid har lagt det.'
    : [`På kortet: ${ld.touching.length ? ld.touching.join(', ') : 'inget finger'}`, ld.liftedMm ? `handen lyft ${comma(ld.liftedMm)} mm så att ingen led går in i kortet` : '', ld.shortMm ? `armen räcker inte hela vägen, ${comma(ld.shortMm)} mm kortare` : ''].filter(Boolean).join(' · ') + '.';
  const td = lon ? now?.turned ?? null : null, turnNote = $('turnNote');
  for (const b of turnButtons) { b.disabled = !lon; b.setAttribute('aria-pressed', String(lon && b.dataset.turn === state.turn)); b.title = !lon && deal ? 'Bara i Naturlig' : ''; }
  turnNote.className = td && (!td.laid || td.shortMm) ? 'small warn' : 'small';
  turnNote.textContent = !deal ? '' : !lon ? 'Vändningen finns bara i Naturlig.' : !td ? 'Förvalet: kortet vänds som förut.' : !td.laid ? `Går inte här: ${td.why}.`
    : [`Höger hand tar kortet i ${td.edge === 'long' ? 'långsidan' : 'kortsidan'} när vänster har släppt det, vrider det ${Math.round(td.heldInAll!)}° i greppet och släpper det strax före det ligger`,
      `handleden böjd högst ${comma(td.wrist!.most)}° (förut ${comma(td.wristBefore!.most)}°)`, td.shortMm ? `armen räcker inte hela vägen, ${comma(td.shortMm)} mm kortare` : ''].filter(Boolean).join(' · ') + '.';
  const steered = !untouched(), recipe = R();
  $<HTMLButtonElement>('atplace').disabled = !deal || !recipe || !shares(recipe); $<HTMLButtonElement>('reset').disabled = !deal || !recipe || (!steered && !now?.saved); $<HTMLButtonElement>('save').disabled = !deal || !now || now.saved || !now.deal || !!fault || now.shortMm > 0;
  const status = $('status'), when = saved ? new Date(saved.savedAt).toLocaleString('sv-SE', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '', withBack = (yes: boolean | null) => yes ? 'med återgången' : 'utan återgången';
  status.className = fault ? 'small warn' : 'small';
  status.textContent = !deal ? 'Välj en plats för att styra given.' : fault ? `Går inte: ${fault}. Senaste som gick visas.`
    : now?.from === 'saved' && !now.saved ? `Din sparade standard (${when}) är sparad ${withBack(now.savedBack)}; här visas den ${withBack(now.back)}. Spara som standard sparar den så här.`
    : now?.saved ? `Din sparade standard (${when}, ${now.savedWay === 'read' ? 'från A2.1' : `gjord i ${WAYS[now.savedWay ?? 'forut']}`}, ${withBack(now.savedBack)}), lagd ${now.savedWay === 'read' ? 'som den är läst' : 'med dina värden'} och filmens sko.${now.savedWay !== 'read' && now.savedWay !== way ? ` Dra i ett reglage för ${WAYS[way]} med dina värden.` : ''}`
    : saved ? `Inte den sparade (${when}). Klicka på platsen för den.` : steered ? 'Ändrad, inte sparad.'
    : read ? 'Avläst giv från A2.1. Ingen standard sparad.' : way === 'naturlig' ? 'Naturlig grundrörelse. Ingen standard sparad.' : 'Grundrörelsen som förut. Ingen standard sparad.';
  // The line in the picture: what is shown, and what is not as it should be.
  const what = deal ? `${state.entry} → ${placeWords(state.place)}${state.back ? ` → ${state.entry}` : ''}` : (state.shown as {pose: string}).pose, notes: string[] = [], warns: string[] = [];
  if (deal && now) notes.push(now.saved ? 'sparad standard' : WAYS[now.way]);
  if (deal && now?.back) notes.push('med återgång');
  if (deal && now?.turned?.laid) notes.push('vändning: i handen');
  if (deal && now?.landed) notes.push(`landning: ${landingWords({id: now.landed.id, ...now.landed.shaping}).toLowerCase()}`);
  if (deal && now?.clip) notes.push(`klipp ${now.clip}`); if (now?.said) notes.push(now.said); if (deal && now?.lent) notes.push(now.lent);
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

// The places: a row for each card and a column for each seat and for the dealer; a place no deal goes to from the chosen entry is closed, and says why below (paint).
{ const grid = $('places'), ids = Object.keys(plan.targets), cell = (text: string, row = false) => { const s = document.createElement('span'); s.textContent = text; if (row) s.className = 'row'; grid.append(s); };
  cell(''); for (const c of ['1', '2', '3', '4', '5', '6', '7', 'D']) cell(c);
  for (const card of [1, 2, 3]) { cell(`Kort ${card}`, true);
    for (const seat of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'D']) { const id = `${seat}.C${card}`, r = ids.includes(id) ? placeFrom('A2.3', id) : null; if (!r) { cell(''); continue; }
      const b = document.createElement('button'); b.dataset.place = id; b.textContent = '●'; b.title = placeWords(id); b.setAttribute('aria-label', placeWords(id));
      b.addEventListener('click', () => { if (!opens(state.entry, id)) return; if (id !== state.place) state.clipChosen = false; state.place = id; state.touched = false; state.steer = {...NO_STEER}; state.knobs = knobsOf(); state.landing = {id: LANDING_DEFAULT}; state.turn = TURN_DEFAULT; state.shown = {kind: 'deal'}; state.playing = false; showDeal().then(() => { if (state.view === 'player') stage!.view('player'); if (state.shown.kind === 'deal' && !fault) { state.t = 0; state.playing = true; paint(); } }); });
      grid.append(b); } } }

for (const b of document.querySelectorAll<HTMLButtonElement>('#dolls button')) b.addEventListener('click', () => { if (b.dataset.doll !== state.doll) setDoll(b.dataset.doll!); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#ways button')) b.addEventListener('click', () => { const way = b.dataset.way as Way; if (b.disabled || way === state.way) return; state.way = way; if (state.shown.kind === 'deal') showDeal(true); else showPose(state.shown.pose); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#poses button')) if (!b.disabled) b.addEventListener('click', () => showPose(b.dataset.pose as Pose));
// The entry: the place stays where a deal goes there from the new one, else the first that has one.
for (const b of document.querySelectorAll<HTMLButtonElement>('#entries button')) if (!b.disabled) b.addEventListener('click', () => { const entry = b.dataset.entry as Entry; if (entry === state.entry && state.shown.kind === 'deal') return;
  state.entry = entry; if (!opens(entry, state.place)) state.place = Object.keys(plan.targets).find(id => opens(entry, id)) ?? state.place;
  state.touched = false; state.steer = {...NO_STEER}; state.knobs = knobsOf(); state.landing = {id: LANDING_DEFAULT}; state.turn = TURN_DEFAULT; state.shown = {kind: 'deal'}; state.playing = false; showDeal(); });
// Paow's clip (lay.ts PAOW_READS): the deal from A2.1 to the place read off another of her films.
$('clips').addEventListener('click', e => { const id = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-clip]')?.dataset.clip; if (!id || id === clipNow()?.clip) return;
  state.clip = id; state.clipChosen = true; state.shown = {kind: 'deal'}; state.playing = false; showDeal().then(() => { if (state.shown.kind === 'deal' && !fault) { state.t = 0; state.playing = true; paint(); } }); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#backs button')) b.addEventListener('click', () => { const back = b.dataset.back === '1'; if (back === state.back) return; state.back = back; if (state.shown.kind === 'deal') showDeal(true); else paint(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.addEventListener('click', () => { state.view = b.dataset.view as ViewName; stage!.view(state.view); stage!.setGrips(gripsShown()); paint(); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button')) b.addEventListener('click', () => { state.speed = Number(b.dataset.speed); paint(); });
$<HTMLInputElement>('loop').addEventListener('change', e => { state.loop = (e.target as HTMLInputElement).checked; });
$<HTMLInputElement>('joints').addEventListener('change', e => { state.joints = (e.target as HTMLInputElement).checked; stage!.setJoints(state.joints); stage!.setGrips(gripsShown()); grip(true); });
const play = async () => { if (state.shown.kind !== 'deal') { await showDeal(); if (state.shown.kind !== 'deal') return; } if (!state.playing && state.t >= stage!.duration() - 1e-3) state.t = 0; state.playing = !state.playing; paint(); };
$('play').addEventListener('click', play);
addEventListener('keydown', e => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); play(); } });
$<HTMLInputElement>('scrub').addEventListener('input', e => { state.playing = false; state.t = Number((e.target as HTMLInputElement).value) / 1000 * stage!.duration(); stage!.setTime(state.t); transport(); grip(); });
$('reset').addEventListener('click', () => { state.steer = {...NO_STEER}; state.knobs = knobsOf(); state.landing = {id: LANDING_DEFAULT}; state.turn = TURN_DEFAULT; state.touched = true; showDeal(true); });
$('atplace').addEventListener('click', () => { const r = R(); if (!r) return; const {gripYawEnd: _end, ...steer} = state.steer; state.steer = {...steer, turnNear: TURN_AT_PLACE.turnNear, turnLater: TURN_AT_PLACE.wait - (r.pace.shared?.wait ?? 1), gripYaw: TURN_AT_PLACE.gripYaw}; state.touched = true; showDeal(true); });
$('save').addEventListener('click', async () => {
  if (!now?.deal || state.shown.kind !== 'deal' || fault) return; const name = standardName(state.doll, state.entry, state.place), button = $<HTMLButtonElement>('save'); button.disabled = true;
  // Exactly the frames on the stage, for this doll, with what they were laid from: the entry, for "Naturlig" also the shoulders and elbows and how much of the body's steering she took and the landing and the turn where they are not the default, and with the return the return (`back`, return-cycle.ts's `cycle`).
  const {cycle, ...shown} = now.motion, landing = now.way === 'naturlig' && now.landed ? {landing: landingOf({id: now.landed.id, ...now.landed.shaping})} : {}, turn = now.way === 'naturlig' && now.turned?.laid ? {turn: now.turned.id} : {};
  const lab = {...now.deal.lab, steer: state.steer, from: state.entry, doll: state.doll, place: state.place, shortMm: now.shortMm, savedAt: new Date().toISOString(), ...(now.way === 'naturlig' ? {naturlig: {knobs: state.knobs, bodyShare: now.bodyShare}} : {}), ...landing, ...turn, ...(cycle ? {back: cycle} : {})};
  const motion = {...shown, doll: state.doll, lab} as Motion;
  try { const r = await fetch(`/dealer3d/standard/${name}.json`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(motion)}), answer = await r.json(); if (!r.ok) throw Error(answer.error ?? String(r.status));
    standards = answer.standards; now = {...now, motion: {...now.motion, doll: state.doll, lab}, saved: true, from: 'saved', savedWay: now.way, savedBack: now.back}; paint();
    // (embedded: the page around is told, so that what it says of the saved standard is read again)
    if (asked.get('inbaddad') === '1' && parent !== window) parent.postMessage({docklabb: {place: state.place, saved: name}}, location.origin); }
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
(window as unknown as {docklabb: unknown}).docklabb = {ready: true, facts: () => ({doll: state.doll, way: wayOf(), entry: state.entry, back: state.back, clip: now?.clip ?? null, shown: state.shown, place: state.place, steer: state.steer, knobs: state.knobs, playing: state.playing, t: state.t, duration: stage?.duration(), fault, saved: now?.saved ?? false, from: now?.from ?? null, savedWay: now?.savedWay ?? null, shortMm: now?.shortMm ?? 0,
  frames: now?.motion.frameCount, forced: (now?.deal as LaidDeal | null)?.elbowForced ?? null, throughShoe: now?.deal?.throughShoe ?? null, note: $('note').textContent, status: $('status').textContent, grip: $('grip').textContent, standards: standards.map(s => s.name), camera: stage?.camera(), bodyShare: now?.bodyShare ?? null,
  gripYaw: R() ? gripYawsOf(R()!, state.steer, wayShown()) : null, cycle: (now?.motion.cycle as {readyFrom?: number} | undefined) ?? null, landing: state.landing, landed: now?.landed ?? null, landingNote: $('landingNote').textContent, turn: state.turn, turned: now?.turned ?? null, turnNote: $('turnNote').textContent,
  // What "Naturlig" did, over the whole deal: the hands' least gap, the wrists' most bend, the thumb's most gap from the card while the forefinger is on it (to the beat the card lies), and the fingertips on the card now.
  natural: now?.receipt ? (() => { const f = now.receipt!.frames, h = Math.ceil(((now.motion as {beats?: {h: number}[]}).beats?.[0]?.h) ?? f.length), held = f.filter(x => x.i <= h && x.touching.includes('R1'));
    return {apartMm: Math.min(...f.map(x => x.apartMm)), wristDeg: Math.max(...f.map(x => Math.max(...x.wristDeg))), thumbCardMm: held.length ? Math.max(...held.map(x => x.thumbCardMm[1])) : null, throughCard: f.reduce((s, x) => s + x.throughCard[1], 0)}; })() : null,
  touching: stage?.touching().map(t => `${t.hand}${t.finger} ${t.name} ${whereOn(t)}`) ?? [],
  // Where her right wrist and the card are, in the room and in the picture now (CSS pixels of the canvas): for checking a view against the film's own.
  seen: (() => { const m = now?.motion, i = m ? Math.min(m.frameCount - 1, Math.round(state.t * m.fps)) : 0, of = (world: number[]) => ({world, at: stage!.seen(world)}); return m && stage ? {wrist: of(m.frames[i].R.w), card: of(m.frames[i].card.c)} : null; })()})};
// Embedded in the studio (?inbaddad=1: Scen & bord, Kortplan's step 2, studio/components/bordet/DollPanel.tsx): the card chosen here
// is told to the page around the frame, and a card chosen there is chosen here; where reglagen are moved and not saved the
// deal stays, and the page around is told which card is still shown. Only the lab's own origin is told and heard.
if (asked.get('inbaddad') === '1' && parent !== window) {
  const tell = () => parent.postMessage({docklabb: {place: state.place}}, location.origin);
  $('places').addEventListener('click', e => { if ((e.target as HTMLElement).closest('button[data-place]')) tell(); });
  addEventListener('message', e => { const place = (e.data as {docklabb?: {place?: unknown}} | null)?.docklabb?.place; if (e.source !== parent || e.origin !== location.origin || typeof place !== 'string') return;
    const b = [...document.querySelectorAll<HTMLButtonElement>('#places button')].find(x => x.dataset.place === place);
    if (b && !b.disabled && place !== state.place && (untouched() || now?.saved)) b.click(); else tell(); });
}
