// Measures, film by film, whether the rendered card covers the film's own card: for every frame, with the card drawn as the lab
// draws it by default, how many pixels of the film's yellow or blue are still visible outside the shoe window.
//   node tools/card-coverage.ts <clip-id> [<clip-id> ...]      one or more tracked clips
//   node tools/card-coverage.ts --all [--shard 1/4]            every clip that has a track; shards split the work over processes
// Reads assets/motions/<clip>/source.mp4 and assets/tracking/<clip>/card-track.json. Writes assets/tracking/<clip>/coverage.json
// and the same summary into that folder's receipt.json (which the lab already reads). Nothing under Git is written.
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sceneOf, poseAt, leakCount, landing, ranges, MARGIN, type CardTrack} from '../src/card-overlay.ts';
import {quad, flatQuad, type PlacementPlan} from '../src/placement-model.ts';
import type {Pt} from '../src/card-track.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
const args = process.argv.slice(2), all = args.includes('--all'), scaleAt = args.indexOf('--scale'), // the lab's default Kortskala is the margin itself: the plan's card and a fifth more
  shardAt = args.indexOf('--shard'), [part, parts] = shardAt >= 0 ? args[shardAt + 1].split('/').map(Number) : [1, 1];
const env = existsSync('D:/dealer-scratch/tmp') ? {...process.env, TEMP: 'D:/dealer-scratch/tmp', TMP: 'D:/dealer-scratch/tmp'} : process.env;
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg', ffprobe = process.env.FFPROBE ?? 'ffprobe';
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const tracked = (await readdir('assets/tracking', {withFileTypes: true})).filter(d => d.isDirectory() && existsSync(`assets/tracking/${d.name}/card-track.json`) && existsSync(`assets/motions/${d.name}/source.mp4`)).map(d => d.name).sort();
const clips = all ? tracked.filter((_, i) => i % parts === part - 1) : args.filter((a, i) => /^[a-z][a-z0-9-]+$/.test(a) && (scaleAt < 0 || i !== scaleAt + 1));
if (!clips.length) throw Error('Usage: card-coverage.ts <clip-id> ... | --all [--shard i/n]');

const scene = sceneOf(await json('data/scene-contract.json')), jobs = await json('data/clip-jobs.json');
const saved = await json('placements/default.json'), plan: PlacementPlan = saved.plan ?? saved;
// The card a clip deals or leaves, when exactly one entry of the job file says so; a film cut into several takes has no single card.
function cardOf(clip: string): string | null {
  const card = (e: {kind?: string; from?: string; to?: string}) => /(?:P[1-7]|D)\.C[1-3]/.exec(String(e.kind === 'DEAL' ? e.to : e.from))?.[0] ?? null;
  const own = [...(jobs.jobs ?? []), ...(jobs.derived ?? [])].filter((e: {id: string; clip?: string}) => (e.clip ?? e.id) === clip), edit = (jobs.edits ?? []).find((e: {id: string}) => e.id === clip);
  if (edit) return cardOf(edit.source?.clip);
  const cards = [...new Set(own.map(card).filter(Boolean))];
  return cards.length === 1 ? cards[0] as string : null;
}
// The plan's quad for a card, in the film's pixels (the plan's native view is two pixels narrower than the film).
function planQuad(card: string, width: number): Pt[] | null {
  const g = plan.targets?.[card]?.geometry?.native; if (!g) return null;
  const q = plan.tableProjection?.mode === 'flat' ? flatQuad(g, plan.targets['P4.C1'].geometry.native, 'native', plan.tableProjection.heading) : quad(g, 'native');
  return q.map((p: Pt) => ({x: p.x * (width - 1) / 1761, y: p.y}));
}
async function* frames(file: string, bytes: number): AsyncGenerator<Buffer> {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, env});
  let frame = Buffer.allocUnsafe(bytes), filled = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) { let at = 0;
    while (at < chunk.length) { const take = Math.min(chunk.length - at, frame.length - filled); chunk.copy(frame, filled, at, at + take); filled += take; at += take;
      if (filled === frame.length) { yield frame; frame = Buffer.allocUnsafe(bytes); filled = 0; } } }
}

const LEAK = 25; // pixels of the film's card that must show before a frame counts as leaking
const r1 = (v: number | null | undefined) => v == null ? null : Math.round(v * 10) / 10;
for (const clip of clips) {
  const video = `assets/motions/${clip}/source.mp4`, dir = `assets/tracking/${clip}`, track: CardTrack = await json(`${dir}/card-track.json`);
  const info = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', video], {env}).toString()).streams[0], W: number = info.width, H: number = info.height;
  const card = cardOf(clip), land = card ? planQuad(card, W) : null, scale = scaleAt >= 0 ? Number(args[scaleAt + 1]) : MARGIN, shoe = track.shoeWindow?.box ? [track.shoeWindow.box] : [];
  const perFrame: number[] = []; let n = 0;
  for await (const frame of frames(video, W * H * 3)) perFrame.push(leakCount(frame, W, H, poseAt(track, scene, n++, scale, 12, null, land), shoe));
  const leaking = perFrame.flatMap((count, frame) => count >= LEAK ? [frame] : []), worst = perFrame.reduce((best, count, frame) => count > best.pixels ? {frame, pixels: count} : best, {frame: 0, pixels: 0});
  const fact = landing(track, scene, land);
  const coverage = {schemaVersion: 1, clip, createdAt: new Date().toISOString(), tool: 'tools/card-coverage.ts', scale, margin: MARGIN, leakAtPixels: LEAK, frames: perFrame.length,
    covered: leaking.length === 0, leakFrames: leaking.length, leakRanges: ranges(leaking), worst,
    card, landsOffPlanPx: r1(fact?.off), offPlanFlag: (fact?.off ?? 0) > 50, filmRestPx: r1(fact?.filmSize), planRestPx: r1(fact?.planSize), scaleNeeded: fact?.scaleNeeded == null ? null : Math.round(fact.scaleNeeded * 100) / 100,
    sides: ranges(track.frames.flatMap(f => f.side === 'NONE' ? [f.frame] : [])).length ? {none: ranges(track.frames.flatMap(f => f.side === 'NONE' ? [f.frame] : []))} : undefined};
  await writeFile(`${dir}/coverage.json`, JSON.stringify({...coverage, perFrame}) + '\n');
  if (existsSync(`${dir}/receipt.json`)) { const receipt = await json(`${dir}/receipt.json`); await writeFile(`${dir}/receipt.json`, JSON.stringify({...receipt, coverage}, null, 2) + '\n'); }
  console.log(JSON.stringify({clip, covered: coverage.covered, leakFrames: coverage.leakFrames, leakRanges: coverage.leakRanges, worst, card, landsOffPlanPx: coverage.landsOffPlanPx, filmRestPx: coverage.filmRestPx, planRestPx: coverage.planRestPx, scaleNeeded: coverage.scaleNeeded}));
}
