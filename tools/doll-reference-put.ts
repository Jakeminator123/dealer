// Brings one rendered film of the doll (dealer3d/tools/render-reference.ts) into the repo's media and the register of
// rendered reference films, so that an order can name it (node tools/order-new.ts … --reference <id>):
//   node tools/doll-reference-put.ts <run folder> --id <id> --from READY-C --to P5.C1 [--shape ROUND_TRIP] [--doll paow]
//                                    [--lays RH|LH] [--motion dealer3d/data/<file>.json] [--note "<text>"] [--dry]
// The run folder holds referens.mp4, renderkvitto.json, rorelse.json and kortplan.json. They are copied to
// assets/references/docka/<id>/ (the film as source.mp4) with a receipt.json of their hashes, and the film gets one entry
// in data/rendered-references.json. An id is never used twice: a film made again gets a new id (dealer3d/LASMIG.md).
// A film whose motion is read off a real deal (the motion file's made.way "read", or a chain of such cycles) gets fromDeal,
// the deal it is read off: an order with it as its reference film is another way of making a film than one with a built
// cycle (src/order-ways.ts), and that way is tried with a pilot of its own.
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2), run = args[0];
const flag = (name: string) => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : undefined; };
const id = flag('--id'), edge = flag('--from') && flag('--to') ? `${flag('--from')}>${flag('--to')}` : undefined, shape = flag('--shape'), doll = flag('--doll'), lays = flag('--lays') ?? 'RH', motion = flag('--motion'), note = flag('--note'), dry = args.includes('--dry');
if (!run || !id || !edge) throw Error('Använd: node tools/doll-reference-put.ts <körningens mapp> --id <id> --from READY-C --to P5.C1 [--shape ROUND_TRIP] [--doll paow] [--lays RH|LH] [--motion <fil>] [--note "<text>"] [--dry]');
if (!/^docka-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw Error(`${id}: ett id börjar med docka- och har små bokstäver, siffror och bindestreck.`);
if (shape && shape !== 'ROUND_TRIP') throw Error('--shape är ROUND_TRIP eller utelämnas.');

const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const register = 'data/rendered-references.json', reg = JSON.parse(readFileSync(register, 'utf8')) as {films: Record<string, unknown>[]};
if (reg.films.some(f => f.id === id)) throw Error(`${id} finns redan i ${register}: en film som görs om får ett nytt id.`);
const to = `assets/references/docka/${id}`;
if (existsSync(to)) throw Error(`${to} finns redan.`);
const film = path.join(run, 'referens.mp4');
if (!existsSync(film)) throw Error(`${film} saknas.`);

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', film], {encoding: 'utf8'})).streams[0];
const [n, d] = String(probe.r_frame_rate).split('/').map(Number), fps = n / (d || 1), frames = Number(probe.nb_read_frames), seconds = Math.round((frames / fps) * 1000) / 1000;
const files: Record<string, {from: string; sha256: string}> = {'source.mp4': {from: 'referens.mp4', sha256: sha(film)}};
for (const name of ['renderkvitto.json', 'rorelse.json', 'kortplan.json']) if (existsSync(path.join(run, name))) files[name] = {from: name, sha256: sha(path.join(run, name))};
/** The deal a motion file is read off: its own film where it was made by reading, else the first read cycle of a chain. */
const readOff = (file: string): string | null => {
  if (!existsSync(file)) return null;
  const m = JSON.parse(readFileSync(file, 'utf8')) as {film?: string; made?: {way?: string; cycles?: string[]}};
  if (m.made?.way === 'read') return m.film ?? null;
  return (m.made?.cycles ?? []).map(readOff).find(Boolean) ?? null;
};
const fromDeal = motion ? readOff(motion) : null;
const receipt = {id, sourceRun: path.basename(run), files, video: {width: probe.width, height: probe.height, fps, frames, seconds}, edge, lays, ...(doll ? {doll} : {}), state: 'kandidat', ...(shape ? {shape} : {}),
  ...(motion ? {motion: {path: motion, sha256: sha(motion), ...(doll ? {doll} : {})}} : {}), ...(note ? {note} : {}), copiedAt: new Date().toISOString(), copiedBy: 'huvudagenten, tools/doll-reference-put.ts'};
const entry = {id, edge, path: `${to}/source.mp4`, sha256: files['source.mp4'].sha256, seconds, ...(fromDeal ? {fromDeal} : {}), lays, ...(shape ? {shape} : {}), check: null, ...(doll ? {doll} : {})};
if (dry) { console.log(JSON.stringify({written: false, entry, receipt}, null, 2)); process.exit(0); }
mkdirSync(to, {recursive: true});
for (const [name, f] of Object.entries(files)) copyFileSync(path.join(run, f.from), path.join(to, name));
writeFileSync(path.join(to, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
reg.films.push(entry);
writeFileSync(register, JSON.stringify(reg, null, 2) + '\n');
console.log(JSON.stringify({written: true, entry}, null, 2));
