// What in the doll's hands breaks what a hand can do (dealer3d/src/hand-rule.ts handFaults), frame by frame, as numbers
// to read beside the sheet and the close-ups (Jakob 2026-11-23: "inget finger kan försvinna på ett konstigt sätt"):
// a joint beyond its limit, a bone that changes length, two fingers in each other, two neighbours not side by side in
// order, a free finger bent far more than its neighbour, a bone in the card or the felt. Faults in the ring and the
// little finger are the hand rule's ("fria"); those in the thumb, the forefinger and the middle finger are where the deal
// puts the holding fingertips ("håll").
//   node dealer3d/tools/hand-check.ts <motion.json> [--rutor]
//     one motion (a deal or a cycle in dealer3d/data/): per hand the frames with faults, and with --rutor each frame's faults.
//   node dealer3d/tools/hand-check.ts --platser [P4.C1,P7.C1] [--doll paow] [--rutor]
//     every place of the plan (or those named) from A2.3, laid as the doll lab lays it (Giv: his saved standard where there
//     is one, else "Naturlig"), before the hand rule (natural-lab.ts AsBefore `fingers`) and with it: per place the frames
//     with faults before → after, the faults by kind, the largest step the rule adds between two frames to a fingertip or
//     joint, and whether the first frame, the wrists and the bones' lengths are as before.
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {filmLens} from '../src/world.ts';
import {dollNamed} from '../src/doll.ts';
import {boneLengths, handFaults, type Fault} from '../src/hand-rule.ts';
import {landingOf} from '../src/landing.ts';
import {turnOf} from '../src/turn-in-hand.ts';
import type {Vec3} from '../src/camera.ts';
import {NO_STEER, layDeal, placeFrom, recipeOf, standardName, type Recipe, type Steer, type Stored} from '../page/lay.ts';
import {NO_KNOBS, layNatural, moveNatural, onDoll, type AsBefore, type Knobs} from '../page/natural-lab.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const {values, positionals} = parseArgs({allowPositionals: true, options: {platser: {type: 'boolean'}, doll: {type: 'string'}, rutor: {type: 'boolean'}}});
const json = async (rel: string) => JSON.parse((await readFile(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8')).replace(/^﻿/, ''));
type Hand = {w: Vec3; p: Vec3[]};
type Frame = {card: {c: Vec3; l: Vec3; n: Vec3}; R: Hand; L: Hand};
const SIDES = [['R', 1, 'höger'], ['L', -1, 'vänster']] as const;
const free = (f: Fault) => f.fingers.some(k => k >= 3);
const faultsOf = (frames: Frame[]) => SIDES.map(([side, sign]) => { const bones = boneLengths(frames[0][side].p);
  return frames.map(f => handFaults(f[side].p, sign, bones, f.card)); });
const count = (per: Fault[][], which: (f: Fault) => boolean) => per.filter(fs => fs.some(which)).length;
const kinds = (per: Fault[][][]) => { const n: Record<string, number> = {}; for (const hand of per) for (const fs of hand) for (const f of fs) n[f.kind] = (n[f.kind] ?? 0) + 1; return Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ') || 'inga'; };
const worst = (per: Fault[][][], which: (f: Fault) => boolean) => { let w: Fault | null = null; for (const hand of per) for (const fs of hand) for (const f of fs) if (which(f) && (!w || f.by > w.by)) w = f; return w ? `${w.what}` : '–'; };

if (!values.platser) {
  const file = positionals[0]; if (!file) { console.error('node dealer3d/tools/hand-check.ts <motion.json> [--rutor] | --platser [P4.C1,…] [--doll paow] [--rutor]'); process.exit(1); }
  const frames = (await json(file)).frames as Frame[], per = faultsOf(frames);
  SIDES.forEach(([, , name], h) => console.log(`${name} hand: ${count(per[h], () => true)} av ${frames.length} rutor med fel (fria fingrar ${count(per[h], free)}, håll ${count(per[h], f => !free(f))}); värst fria: ${worst([per[h]], free)}; värst håll: ${worst([per[h]], f => !free(f))}`));
  console.log('sorter:', kinds(per));
  if (values.rutor) frames.forEach((_, i) => SIDES.forEach(([, , name], h) => { if (per[h][i].length) console.log(String(i).padStart(4), name.padEnd(7), per[h][i].map(f => f.what).join('; ')); }));
  process.exit(0);
}

const lens = filmLens(), plan = await json('placements/default.json'), dollName = values.doll ?? 'paow', doll = dollNamed(dollName);
const recipeNamed = async (name: string) => { const recipe: Recipe = recipeOf(name, await json(`dealer3d/data/${name}.json`) as Stored); return {recipe, pose: await json(`dealer3d/data/${recipe.poseFilm ?? 'till-ankare-2-3'}.json`)}; };
/** A place laid as the lab lays it (Giv), `before` as natural-lab.ts AsBefore. */
async function laid(place: string, before: AsBefore) {
  const found = placeFrom('A2.3', place); if (!found || 'none' in found || 'read' in found) return null;
  let {recipe, pose} = await recipeNamed(found.recipe);
  const file = `dealer3d/standard/${standardName(dollName, 'A2.3', place)}.json`, saved = existsSync(path.join(ROOT, file));
  let steer: Steer = {...NO_STEER}, knobs: Knobs = structuredClone(NO_KNOBS), landing = landingOf(undefined), turn = turnOf(undefined), way = dollName === 'standard' ? 'forut' : 'naturlig';
  if (saved) { const lab = (await json(file)).lab ?? {}; steer = {...NO_STEER, ...lab.steer}; knobs = {...NO_KNOBS, ...(lab.naturlig?.knobs ?? {})}; landing = landingOf(lab.landing); turn = turnOf(lab.turn);
    if (dollName !== 'standard') way = lab.naturlig ? 'naturlig' : 'forut'; if (lab.recipe && lab.recipe !== recipe.from) ({recipe, pose} = await recipeNamed(lab.recipe)); }
  if (way === 'naturlig') { const l = layNatural({plan, target: place, recipe, pose, steer, lens, doll, before}); return {frames: moveNatural(l, steer.body, knobs, lens, landing, turn).motion.frames as unknown as Frame[], saved, way}; }
  return {frames: onDoll(lens, layDeal({plan, target: place, recipe, pose, steer}), doll).motion.frames as unknown as Frame[], saved, way};
}
const places = positionals[0] ? positionals[0].split(',') : Object.keys(plan.targets);
/** The most a joint's or fingertip's step from one frame to the next is longer with the rule than before it, millimetres. */
const step = (a: Frame[], b: Frame[]) => { let most = 0; const at = (m: Frame[], i: number, side: 'R' | 'L', k: number) => Math.hypot(...[0, 1, 2].map(x => m[i][side].p[k][x] - m[i - 1][side].p[k][x]));
  for (let i = 1; i < a.length; i++) for (const [side] of SIDES) for (let k = 1; k < 21; k++) most = Math.max(most, at(b, i, side, k) - at(a, i, side, k));
  return Math.round(most * 10000) / 10; };
const same = (a: Frame[], b: Frame[], pick: (f: Frame, side: 'R' | 'L') => unknown) => a.every((f, i) => SIDES.every(([side]) => JSON.stringify(pick(f, side)) === JSON.stringify(pick(b[i], side))));
const lengthsKept = (a: Frame[], b: Frame[]) => { let most = 0; a.forEach((f, i) => SIDES.forEach(([side]) => { const x = boneLengths(f[side].p), y = boneLengths(b[i][side].p); x.forEach((l, k) => { most = Math.max(most, Math.abs(l - y[k])); }); })); return Math.round(most * 10000) / 10; };
console.log(`plats   lagd          rutor med fel i fria fingrar (R/L) före → efter   håll före → efter   största tillagda steg   första rutan, handleder, ben`);
for (const place of places) {
  const a = await laid(place, {fingers: true}), b = await laid(place, {});
  if (!a || !b) { console.log(place.padEnd(7), 'läggs inte från A2.3'); continue; }
  const pa = faultsOf(a.frames), pb = faultsOf(b.frames), n = a.frames.length;
  const fr = (per: Fault[][][]) => `${count(per[0], free)}/${count(per[1], free)}`, hold = (per: Fault[][][]) => `${count(per[0], f => !free(f))}/${count(per[1], f => !free(f))}`;
  console.log(`${place.padEnd(7)} ${(a.saved ? 'standard' : a.way).padEnd(13)} ${fr(pa).padStart(7)} → ${fr(pb).padEnd(7)} av ${n}${''.padEnd(22)} ${hold(pa).padStart(7)} → ${hold(pb).padEnd(9)} ${String(step(a.frames, b.frames)).padStart(6)} mm             ${same(a.frames.slice(0, 1), b.frames.slice(0, 1), (f, s) => f[s].p) ? 'lika' : 'ÄNDRAD'}, ${same(a.frames, b.frames, (f, s) => f[s].p[0]) ? 'lika' : 'ÄNDRADE'}, ${lengthsKept(a.frames, b.frames)} mm`);
  console.log(`        före: ${kinds(pa)}; värst fria: ${worst(pa, free)}`);
  console.log(`        efter: ${kinds(pb)}; värst fria: ${worst(pb, free)}`);
  if (values.rutor) b.frames.forEach((_, i) => SIDES.forEach(([, , name], h) => { if (pb[h][i].length) console.log(String(i).padStart(4), name.padEnd(7), pb[h][i].map(f => f.what).join('; ')); }));
}
