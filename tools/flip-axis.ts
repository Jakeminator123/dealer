// Which edge the card turns about in a deal film, read from its card track (src/flip-axis.ts). Reads only.
//   node tools/flip-axis.ts <take-or-clip-id> [--json <file>]
//   node tools/flip-axis.ts --all [--json <file>]
// One id prints the answer with its evidence. --all prints a table of every deal take in the bank (deals and the turn of the
// hole card, experiments included): seat, take, Jakob's decision, whether it plays today, the answer and the frames.
// --json writes the same as JSON (the main agent keeps it in D:/dealer-scratch/tmp/huvudagent/vandning/).
// A derived take is read on its own frames of the clip it is cut from; a take without a track says so.
import {readFile, writeFile, access, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildGraph, type Take} from '../src/clip-graph.ts';
import {readFlip, type FlipReading, type FlipTrack} from '../src/flip-axis.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
const args = process.argv.slice(2), jsonAt = args.indexOf('--json'), jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null, all = args.includes('--all');
const id = args.find((a, i) => !a.startsWith('--') && (jsonAt < 0 || i !== jsonAt + 1));
if ((!all && !id) || (jsonAt >= 0 && !jsonOut) || (id && !/^[a-z0-9-]+$/.test(id))) throw Error('Usage: flip-axis.ts <take-or-clip-id> | --all [--json <file>]');

const readJson = async (file: string) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; } };
const exists = async (file: string) => { try { await access(file); return true; } catch { return false; } };
const clipId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const named = (list: unknown) => (Array.isArray(list) ? list : []).filter((item: any) => typeof item?.id === 'string' && clipId.test(item.id));
// The bank as tools/preview.ts serves it to the lab (clipBank), reduced to what the graph needs.
const file = await readJson('data/clip-jobs.json');
const jobs = named(file?.jobs), edits = named(file?.edits).filter((e: any) => typeof e.source?.clip === 'string'), derived = named(file?.derived).filter((d: any) => typeof d.clip === 'string' && clipId.test(d.clip));
const motions: Record<string, any> = {}, receipts: Record<string, any> = {}, media: Record<string, any> = {};
for (const take of derived) { const own = await readJson(`motions/${take.id}.json`), clip = await readJson(`motions/${take.clip}.json`);
  motions[take.id] = {source: clip?.source, motion: own?.motion, review: own?.review}; media[take.id] = {video: await exists(`assets/motions/${take.clip}/source.mp4`) ? `assets/motions/${take.clip}/source.mp4` : null}; }
for (const job of [...jobs, ...edits]) { const motion = await readJson(`motions/${job.id}.json`), receipt = await readJson(`assets/motions/${job.id}/generation.json`);
  if (motion) motions[job.id] = {source: motion.source, motion: motion.motion, review: motion.review};
  if (receipt) receipts[job.id] = {status: receipt.status, estimatedCredits: receipt.estimatedCredits, output: receipt.output ? {fps: receipt.output.fps, frames: receipt.output.frames} : null};
  media[job.id] = {video: await exists(`assets/motions/${job.id}/source.mp4`) ? `assets/motions/${job.id}/source.mp4` : null}; }
const graph = buildGraph({jobs, derived, edits, budget: file?.budget ?? null, motions, receipts, media} as any);

const seatOf = (edgeId: string, kind: string | null) => { const m = /(P[1-7]|D)\.C([1-3])/.exec(edgeId);
  return kind === 'REVEAL' ? 'hålkortet vänds' : !m ? edgeId : m[1] === 'D' ? `dealerns kort ${m[2]}` : `plats ${m[1][1]}${m[2] !== '1' ? `, kort ${m[2]}` : ''}`; };
const verdictOf = (t: Take) => t.variant ? 'variant' : ({ACCEPTED: 'godkänd', REJECTED: 'underkänd', SECONDARY: 'sekundär', PENDING: 'ogranskad'} as Record<string, string>)[t.decision] ?? t.decision.toLowerCase();
type Row = {edge: string; seat: string; take: string; clip: string; frames: [number, number] | null; verdict: string; playsToday: boolean; experiment: boolean; userReview: string | null; reading: FlipReading | null; missing: string | null};
async function rowOf(edgeId: string, take: Take | null, takeId: string): Promise<Row> {
  const edge = graph.edge[edgeId] ?? [...graph.experiments].find(e => e.id === edgeId) ?? null, clip = take?.segment?.clip ?? takeId, range: [number, number] | null = take?.segment ? [take.segment.start, take.segment.end] : null;
  const track = await readJson(`assets/tracking/${clip}/card-track.json`) as FlipTrack | null;
  return {edge: edgeId, seat: seatOf(edgeId, edge?.kind ?? null), take: takeId, clip, frames: range, verdict: take ? verdictOf(take) : '?', playsToday: !!edge && edge.main?.id === takeId, experiment: !!edge?.experiment,
    userReview: take?.motion?.review?.userReview ?? null, reading: track ? readFlip(track, range) : null, missing: track ? null : `inget kortspår (assets/tracking/${clip}/card-track.json)`};
}
const short = (r: Row) => !r.reading ? 'inget spår' : r.reading.answer === 'OKLART' ? `OKLART${r.reading.leaning ? ` (lutar ${r.reading.leaning})` : ''}` : r.reading.answer;
const turnText = (r: Row) => { const t = r.reading?.turn; return !t ? '-' : `${t.start}–${t.end}${t.edgeFrames.length ? `, kant ${t.edgeFrames[0]}${t.edgeFrames.length > 1 ? `–${t.edgeFrames[t.edgeFrames.length - 1]}` : ''}` : ', ingen kant'}`; };

let rows: Row[];
if (all) {
  rows = [];
  for (const edge of [...graph.edges, ...graph.experiments].filter(e => e.kind === 'DEAL' || e.kind === 'REVEAL')) for (const take of edge.takes) rows.push(await rowOf(edge.id, take, take.id));
  const pad = (s: string, n: number) => s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
  console.log(pad('Plats', 18) + pad('Tagning', 40) + pad('Beslut', 11) + pad('I dag', 6) + pad('Svar', 28) + 'Rutor');
  for (const r of rows) console.log(pad(r.seat + (r.experiment ? ' (prov)' : ''), 18) + pad(r.take, 40) + pad(r.verdict, 11) + pad(r.playsToday ? 'ja' : '', 6) + pad(short(r), 28) + turnText(r));
  const count = (answer: string) => rows.filter(r => r.reading?.answer === answer).length;
  console.log(`\nAv ${rows.length} tagningar: LÅNGSIDAN ${count('LÅNGSIDAN')}, KORTSIDAN ${count('KORTSIDAN')}, OKLART ${count('OKLART')}, utan spår ${rows.filter(r => !r.reading).length}.`);
  const today = rows.filter(r => r.playsToday);
  console.log(`Det som spelas i dag (${today.length}): ${today.map(r => `${r.seat} ${short(r)}`).join('; ')}.`);
} else {
  // A clip id that is no take of its own is read as the take cut from it (the bank's derived takes), else as the whole clip.
  const take = graph.takes[id!] ?? Object.values(graph.takes).find(t => t.segment?.clip === id) ?? null, edgeId = take?.edge ?? '?';
  const row = await rowOf(edgeId, take, take?.id ?? id!); rows = [row];
  console.log(`${row.take}${row.frames ? ` (ruta ${row.frames[0]}–${row.frames[1]} ur ${row.clip})` : ''} · ${row.seat} · ${row.verdict}${row.playsToday ? ' · spelas i dag' : ''}`);
  console.log(row.reading ? `${row.reading.answer}${row.reading.leaning ? ` (lutar åt ${row.reading.leaning})` : ''}\n` + row.reading.text.map(t => `  ${t}`).join('\n') : row.missing);
}
if (jsonOut) { await mkdir(path.dirname(path.resolve(jsonOut)), {recursive: true});
  await writeFile(jsonOut, JSON.stringify({schemaVersion: 1, createdAt: new Date().toISOString(), tool: 'tools/flip-axis.ts', rows}, null, 1) + '\n'); console.log(`JSON: ${jsonOut}`); }
