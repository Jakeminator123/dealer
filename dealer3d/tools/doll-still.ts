// The dolls of dealer3d/src/doll.ts at anchor 1, each alone on a transparent picture in the plan's native pixels
// (1762 × 1174), cut as the studio's Siluett is (tools/placement-backdrop.ts: the bank's frame, x_plan = x_film × 1761 / 1763),
// so that Placering can lay a doll over the picture of its table where the Siluett's drawn figure is now.
//   node dealer3d/tools/doll-still.ts [--dolls standard,paow] [--out assets/lab/placement-backdrop]
// Writes <out>/docka-<doll>.png (RGBA) per doll and <out>/docka-receipt.json (sources with SHA-256, the pose, where the
// hands and the figure lie in plan pixels). Needs Chrome; not the lab server. Takes the shared lock for the graphics card
// and headless Chrome (tools/lab-look.ts) for the two stills and closes Chrome again (dealer3d/tools/shoot.ts).
//
// Anchor 1 is her rest: the first frame of the pose film to A2.3 (dealer3d/data/till-ankare-2-3-c.json), whose hands lie
// where data/dealer-standard.json has the rest picture's (within 15 px). A doll other than the standard is posed on that
// film by dealer3d/tools/doll-pose.ts first. The stage's look 'bare' (dealer3d/src/stage.ts) draws the figure only: the
// table, the shoe and the cards hide what is behind them without being drawn, so her body ends on the table's edge and
// the shoe stands in front of her elbow as in the picture of the table; the felt keeps the figure's own shadow, nothing else
// (at rest the light from the players' left puts almost all of it under her hands and behind the edge).
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {LOCK, lockLine, releaseLock, takeLock} from '../../tools/lab-look.ts';
import {NEUTRAL_BACKDROP, VIEWS} from '../../src/placement-model.ts';
import {filmEye, see, type Vec3} from '../src/camera.ts';
import {filmLens} from '../src/world.ts';
import {dollNamed} from '../src/doll.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const dolls = arg('--dolls', 'standard,paow')!.split(',').map(s => dollNamed(s.trim()));
const out = arg('--out', path.posix.dirname(NEUTRAL_BACKDROP.native))!;
export const FILM = {width: 1764, height: 1174}, PLAN = {width: VIEWS.native.width, height: VIEWS.native.height};
export const POSE = {file: 'dealer3d/data/till-ankare-2-3-c.json', name: 'till-ankare-2-3-c', frame: 0};
const filmToPlan = (p: {x: number; y: number}) => ({x: p.x * (PLAN.width - 1) / (FILM.width - 1), y: p.y * (PLAN.height - 1) / (FILM.height - 1)});
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const round1 = (v: number) => Math.round(v * 10) / 10;
const run = (args: string[]) => new Promise<void>((resolve, reject) => { const child = spawn(process.execPath, args, {cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true}); let said = '';
  child.stdout.on('data', d => said += d); child.stderr.on('data', d => said += d);
  child.on('close', code => code === 0 ? resolve() : reject(Error(`${args[0]} slutade med ${code}: ${said.trim().split('\n').slice(-4).join(' | ')}`))); });

const work = path.join(ROOT, '.runtime', 'doll-still', String(process.pid));
await mkdir(work, {recursive: true});
try {
  // Each doll's pose film: the standard's as it is, another's posed on it.
  const poses = [];
  for (const doll of dolls) {
    const file = doll.name === 'standard' ? path.join(ROOT, POSE.file) : path.join(work, `${POSE.name}-${doll.name}.json`);
    if (doll.name !== 'standard') await run(['dealer3d/tools/doll-pose.ts', '--motion', POSE.file, '--doll', doll.name, '--out', file]);
    const motion = JSON.parse(await readFile(file, 'utf8')); if ((motion.doll ?? 'standard') !== doll.name) throw Error(`Rörelsen för ${doll.name} bär dockan ${motion.doll}.`);
    poses.push({doll, file, name: doll.name === 'standard' ? POSE.name : `${POSE.name}-${doll.name}`, motion, bytes: await readFile(file)});
  }
  // The stills, under the shared lock: one Chrome per doll, closed by the recorder.
  const line = lockLine('3d-banan', `dockstillbilder ${dolls.map(d => d.name).join(', ')}`, 5, new Date());
  if (!await takeLock(LOCK, line, {sleep: ms => delay(ms)})) throw Error('GPU-låset är upptaget.');
  try {
    for (const p of poses) await run(['dealer3d/tools/shoot.ts', '--out', path.join(work, p.doll.name), '--motion', p.name, '--motion-file', p.file,
      '--eyes', 'film', '--look', 'bare', '--tags', '0', '--times', '0', '--size', `${FILM.width}x${FILM.height}`]);
  } finally { if (!releaseLock(LOCK, line)) console.error('GPU-låsets ägare ändrades under körningen.'); }

  const eye = filmEye(filmLens()), at = (p: number[]) => { const s = see(eye, p as Vec3)!, q = filmToPlan(s); return [round1(q.x), round1(q.y)]; };
  const pictures = [];
  for (const p of poses) {
    const shot = path.join(work, p.doll.name, 'ruta-0.00.png'), facts = JSON.parse(await readFile(path.join(work, p.doll.name, 'ruta.json'), 'utf8'));
    const meta = await sharp(shot).metadata();
    if (meta.width !== FILM.width || meta.height !== FILM.height || meta.channels !== 4) throw Error(`${shot}: ${meta.width} × ${meta.height}, ${meta.channels} kanaler; väntade ${FILM.width} × ${FILM.height} med alfa.`);
    const picture = await sharp(shot).resize(PLAN.width, PLAN.height, {fit: 'fill', kernel: 'lanczos3'}).png({compressionLevel: 9}).toBuffer();
    // Where the figure is: the box of the pixels it covers, and how many (alpha over a half).
    const {data, info} = await sharp(picture).raw().toBuffer({resolveWithObject: true});
    let n = 0, x0 = info.width, x1 = -1, y0 = info.height, y1 = -1, corners = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const a = data[(y * info.width + x) * 4 + 3]; if (a > 127) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) corners = Math.max(corners, data[(y * info.width + x) * 4 + 3]);
    if (!n || corners) throw Error(`${p.doll.name}: ${n ? 'hörnen är inte genomskinliga' : 'ingen figur i bilden'}.`);
    const f = p.motion.frames[POSE.frame];
    pictures.push({doll: p.doll.name, path: path.posix.join(out, `docka-${p.doll.name}.png`), picture, receipt: {
      path: path.posix.join(out, `docka-${p.doll.name}.png`), width: info.width, height: info.height, channels: 4, bytes: picture.length, sha256: sha(picture),
      doll: p.doll.name, measuresJudged: p.doll.name === 'standard' ? 'the figure every film was made with until 2026-11-21' : 'not judged by Jakob (dealer3d/src/doll.ts about)',
      pose: {film: POSE.file, frame: POSE.frame, sha256: sha(p.bytes), posedWith: p.doll.name === 'standard' ? null : `node dealer3d/tools/doll-pose.ts --motion ${POSE.file} --doll ${p.doll.name} (--elbow forearm)`},
      figure: {box: [x0, y0, x1, y1], pixels: n, note: 'plan pixels where the alpha is over a half'},
      hands: {rightWrist: at(f.R.w), leftWrist: at(f.L.w), rightMiddleTip: at(f.R.p[12]), leftMiddleTip: at(f.L.p[12]), note: 'her right is the picture\'s left; plan pixels'},
      shot: {chrome: facts.chrome, query: facts.query, size: facts.size}}});
  }
  const head = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, windowsHide: true}).toString().trim(); } catch { return null; } })();
  const sources = Object.fromEntries(await Promise.all(['dealer3d/src/doll.ts', 'dealer3d/src/stage.ts', 'dealer3d/src/body.ts', 'dealer3d/tools/doll-pose.ts', 'dealer3d/tools/shoot.ts', POSE.file].map(async f => [f, sha(await readFile(path.join(ROOT, f)))])));
  const receipt = {schemaVersion: 1, about: 'Placering: dockorna i vila (ankare 1) utan bakgrund, i planens bildpunkter som Siluetten, för att läggas över bordets bild. Byggda av dealer3d/tools/doll-still.ts; läs filens början för hur.',
    madeAt: new Date().toISOString(), madeBy: `node dealer3d/tools/doll-still.ts --dolls ${dolls.map(d => d.name).join(',')}`, repoHead: head, three: JSON.parse(await readFile(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version,
    frame: {film: `${FILM.width} × ${FILM.height}`, plan: `${PLAN.width} × ${PLAN.height}`, mapping: 'x_plan = x_film × 1761 / 1763, y unchanged (one resize, fill, lanczos3), as tools/placement-backdrop.ts', camera: 'the bank\'s camera (filmEye of the fitted lens), as the Siluett\'s table'},
    look: 'dealer3d/src/stage.ts look bare: the white figure, lit as the plain look; table, shoe and cards write depth only; the felt shows the figure\'s shadow at 0.3 (at rest almost all of it lies under her hands)',
    sources, dolls: pictures.map(p => p.receipt)};
  await mkdir(path.join(ROOT, out), {recursive: true});
  for (const [file, bytes] of [...pictures.map(p => [p.path, p.picture] as const), [path.posix.join(out, 'docka-receipt.json'), Buffer.from(JSON.stringify(receipt, null, 2) + '\n')] as const]) {
    const target = path.join(ROOT, file), temp = `${target}.${process.pid}.tmp`; await writeFile(temp, bytes); await rename(temp, target); }
  for (const p of pictures) console.log(`${p.path}: ${p.receipt.width} × ${p.receipt.height} RGBA, ${p.receipt.bytes} byte, SHA-256 ${p.receipt.sha256}, figuren ${p.receipt.figure.box.join(',')}`);
} finally { await rm(work, {recursive: true, force: true}); }
