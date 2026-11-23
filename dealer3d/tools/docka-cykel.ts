// A doll's deal and its return in one film (Jakob 2026-11-23: "giv och återgång i en film"), for any place of the plan, laid
// as the doll lab lays it (dealer3d/page/docka.ts): "Naturlig" by default, and the standard Jakob saved for the doll and
// place (dealer3d/standard/<doll>-<place>.json) where there is one, laid again from its recipe and sliders in the way he
// saved it in ("hans standard vinner där den finns"). The deal is laid with the standard doll, given its return by
// dealer3d/src/return-cycle.ts, posed on the doll (page/pose-on-doll.ts) and, in "Naturlig", moved as a person moves
// (dealer3d/src/natural.ts). Writes the motion to a new file only, and prints what to read beside it and the render command.
//   node dealer3d/tools/docka-cykel.ts --to P5.C1 --out dealer3d/data/<new>.json [--doll paow] [--way naturlig|forut]
//     [--no-standard] [--flat-hand] [--hold 76] [--ready 116] [--duration 4] [--lift 0.022]
// --way: the way where no standard is used (the standard doll has only "forut"). --no-standard: lay the place as if no
// standard were saved. --flat-hand: the right hand flat as it lays the card (natural.ts `flatHand`; "Naturlig" only).
// The cycle's flags are dealer3d/tools/return-cycle.ts's, and left out they are its own defaults.
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {filmLens} from '../src/world.ts';
import {dollNamed} from '../src/doll.ts';
import {buildReturnCycle} from '../src/return-cycle.ts';
import {natural} from '../src/natural.ts';
import {NO_STEER, layDeal, recipeFor, recipeOf, type Recipe, type Steer, type Stored} from '../page/lay.ts';
import {NO_KNOBS, layNatural, onDoll, type Knobs, type Way} from '../page/natural-lab.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE = 'node dealer3d/tools/docka-cykel.ts --to <place, e.g. P5.C1> --out dealer3d/data/<new>.json [--doll paow|standard] [--way naturlig|forut] [--no-standard] [--flat-hand] [--hold <frame>] [--ready <frame>] [--duration <seconds>] [--lift <metres>]';
const {values} = parseArgs({options: {to: {type: 'string'}, out: {type: 'string'}, doll: {type: 'string'}, way: {type: 'string'}, 'no-standard': {type: 'boolean'}, 'flat-hand': {type: 'boolean'},
  hold: {type: 'string'}, ready: {type: 'string'}, duration: {type: 'string'}, lift: {type: 'string'}, help: {type: 'boolean', short: 'h'}}});
if (values.help) { console.log(USAGE); process.exit(0); }
function fail(why: string): never { console.error(why); process.exit(1); }
const place = values.to, out = values.out, dollName = values.doll ?? 'paow';
if (!place || !out) fail(USAGE);
if (values.way && values.way !== 'naturlig' && values.way !== 'forut') fail('--way ska vara naturlig eller forut.');
const number = (v: string | undefined, flag: string) => { if (v === undefined) return undefined; const n = Number(v); if (!v.trim() || !Number.isFinite(n)) fail(`${flag} ska vara ett tal.`); return n; };

const file = (rel: string) => path.join(ROOT, rel), rel = (p: string) => path.relative(ROOT, path.resolve(p)).split(path.sep).join('/');
const bytesOf = (rel: string) => readFile(file(rel)), sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const json = (b: Buffer) => JSON.parse(b.toString('utf8').replace(/^\uFEFF/, ''));
const lens = filmLens(), doll = dollNamed(dollName), planBytes = await bytesOf('placements/default.json'), plan = json(planBytes);
const used: Record<string, string> = {'placements/default.json': sha(planBytes)};
const readData = async (name: string) => { const r = `dealer3d/data/${name}.json`, b = await bytesOf(r); used[r] = sha(b); return json(b); };
const recipeNamed = async (name: string) => { const recipe: Recipe = recipeOf(name, await readData(name) as Stored); return {recipe, pose: await readData(recipe.poseFilm ?? 'till-ankare-2-3')}; };

// The place's recipe, as the lab finds it (lay.ts recipeFor), and the standard saved for the doll and place, as the lab reads it.
const found = recipeFor(place!); if (!found) fail(`${place} är ingen plats som docklabbet känner.`); if ('none' in found) fail(`${place}: docklabbet lägger ingen giv dit (${found.none}).`);
let {recipe, pose} = await recipeNamed(found.recipe), steer: Steer = {...NO_STEER}, knobs: Knobs = structuredClone(NO_KNOBS);
let way: Way = dollName === 'standard' ? 'forut' : (values.way as Way | undefined) ?? 'naturlig', standard: string | null = null;
const standardPath = `dealer3d/standard/${dollName}-${place.toLowerCase().replace('.', '')}.json`;
if (!values['no-standard'] && existsSync(file(standardPath))) {
  const b = await bytesOf(standardPath), lab = (json(b).lab ?? {}) as {recipe?: string; steer?: Partial<Steer>; naturlig?: {knobs?: Partial<Knobs>}};
  used[standardPath] = sha(b); standard = standardPath; steer = {...NO_STEER, ...lab.steer};
  knobs = {shoulderR: [...(lab.naturlig?.knobs?.shoulderR ?? NO_KNOBS.shoulderR)], shoulderL: [...(lab.naturlig?.knobs?.shoulderL ?? NO_KNOBS.shoulderL)], elbowOut: [...(lab.naturlig?.knobs?.elbowOut ?? NO_KNOBS.elbowOut)]} as Knobs;
  way = dollName === 'standard' ? 'forut' : lab.naturlig ? 'naturlig' : 'forut';
  if (lab.recipe && lab.recipe !== recipe.from) ({recipe, pose} = await recipeNamed(lab.recipe)); }
if (values['flat-hand'] && way !== 'naturlig') fail(`--flat-hand finns bara i Naturlig; ${place} läggs ${standard ? `som hans sparade standard (${standard}), ` : ''}i Som förut.`);

// The deal with the standard doll, as the lab lays it the chosen way; its return (return-cycle.ts checks the standard's arms); on the doll; moved as a person moves.
const laid = way === 'naturlig' ? layNatural({plan, target: place, recipe, pose, steer, lens, doll}).deal : layDeal({plan, target: place, recipe, pose, steer});
const options = {holdThrough: number(values.hold, '--hold'), readyFrom: number(values.ready, '--ready'), durationSeconds: number(values.duration, '--duration'), liftMeters: number(values.lift, '--lift')};
const recipePath = `dealer3d/data/${recipe.from}.json`, cycle = buildReturnCycle(laid as never, {path: recipePath, sha256: used[recipePath]}, options) as unknown as typeof laid & {frameCount: number; fps: number; rests: number; cycle: {holdThrough: number; liftStarts: number; liftEnds: number; readyFrom: number}};
const posed = onDoll(lens, cycle, doll);
let motion = posed.motion as typeof posed.motion & {frames: {card: {c: number[]}; L: Limb; R: Limb}[]}, bodyShare: number | null = null, flatDeg: number[] = [];
if (way === 'naturlig') {
  // (the body as the sliders ask it, laid on as the difference from what the deal asks: natural-lab.ts moveNatural)
  const asked = laid.lab.bodyAsked, body = steer.body ? steer.body.map((x, k) => Math.round((x - asked[k]) * 1000) / 1000) as [number, number, number] : null;
  const moved = natural(lens, posed.motion as never, doll, {body, ...knobs, steerOut: [cycle.cycle.liftStarts, cycle.cycle.readyFrom], ...(values['flat-hand'] ? {flatHand: true} : {})});
  motion = moved.motion as typeof motion; bodyShare = Math.min(...moved.receipt.frames.map(f => f.bodyShare)); flatDeg = moved.receipt.frames.map(f => f.flatDeg ?? 0); }

const words = place.replace(/^P(\d)\.C(\d)$/, 'plats $1 kort $2').replace(/^D\.C(\d)$/, 'dealerns kort $1');
const about = `${doll.name === 'paow' ? 'Paow' : 'Standarddockan'}, A2.3 till ${words} och tillbaka till A2.3 i samma film, lagd som docklabbet lägger den: ${standard ? `hans sparade standard ${standard} (i ${way === 'naturlig' ? 'Naturlig' : 'Som förut'})` : way === 'naturlig' ? 'Naturlig, inget reglage rört' : 'Som förut, inget reglage rört'}${values['flat-hand'] ? ', högerhanden plan vid nedsläppet (natural.ts flatHand)' : ''}. Skriven av dealer3d/tools/docka-cykel.ts; filmas med render-reference.ts --seconds ${cycle.frameCount / cycle.fps} --fps 24.`;
const made = {tool: 'dealer3d/tools/docka-cykel.ts', place, doll: doll.name, way, standard, recipe: recipe.from, poseFilm: recipe.poseFilm ?? 'till-ankare-2-3', steer, knobs, flatHand: !!values['flat-hand'], cycle: options, sources: used};
await writeFile(out, JSON.stringify({...motion, about, made}) + '\n', {flag: 'wx'});

type Limb = {s: number[]; e: number[]; w: number[]; p: number[][]};
const far = (a: Limb, b: Limb) => Math.max(...[a.s, a.e, a.w, ...a.p].map((q, i) => Math.hypot(...q.map((x, k) => (x - [b.s, b.e, b.w, ...b.p][i][k]) * 1000))));
const first = motion.frames[0], last = motion.frames.at(-1)!, c = cycle.cycle;
console.log(`skrev ${rel(out)}: ${motion.frames.length} rutor à ${cycle.fps}/s (${cycle.frameCount / cycle.fps} s); ${standard ? `hans standard ${standard}, ` : ''}${way === 'naturlig' ? 'Naturlig' : 'Som förut'}, receptet ${recipe.from}${found.lent && !standard ? ` (lånat: ${found.lent})` : ''}`);
console.log(`kortet ligger från ruta ${cycle.rests}, given hålls t.o.m. ruta ${c.holdThrough}, lyftet ${c.liftStarts}-${c.liftEnds}, åter i A2.3 från ruta ${c.readyFrom}; armen för kort ${posed.shortMm} mm${bodyShare === null ? '' : `; kroppen tar ${Math.round(bodyShare * 100)} % av styrningen`}`);
const closes = [far(last.R, first.R), far(last.L, first.L)];
console.log(`sista rutan mot första: höger hand och arm ${closes[0].toFixed(2)} mm, vänster ${closes[1].toFixed(2)} mm${Math.max(...closes) > 1 ? '  OBS: cykeln sluter inte' : ''}`);
if (values['flat-hand']) console.log(`högerhanden vriden på kortet (grader, var femte ruta från ${cycle.rests - 25}):`, flatDeg.map((x, i) => [i, x] as const).filter(([i]) => i >= cycle.rests - 25 && i % 5 === 0).map(([i, x]) => `${i}:${x}`).join(' '));
const name = path.basename(out, '.json'), seconds = cycle.frameCount / cycle.fps;
console.log(`rendera: node dealer3d/tools/render-reference.ts --motion ${rel(out)} --out D:/dealer-scratch/tmp/dealer-3d/ut/${name} --seconds ${seconds} --fps 24`);
console.log(`ruta för ruta: node dealer3d/tools/deal-check.ts ${rel(out)} 0 ${cycle.frameCount - 1}`);
