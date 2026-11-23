// Brings a delivered film into the bank's frame and measures it (src/film-after.ts): the after-work that tonight's orders ran as
// Python in a scratch folder (D:/dealer-scratch/tmp/paow/skript/efterarbete.py, slutkoll.py, kantkoll.py, filmmatt.py), the same
// frames without Python. Orders nothing and spends nothing.
//   node tools/film-after.ts <order id> <take> [flags]
// Reads data/orders/<id>.json (the model, first.png and the anchor it was copied from, last.png, the motion's target) and the
// delivery assets/orders/<id>/take-<n>/source.mp4, which is only read. A deal ordered without a last picture (order-new.ts
// --no-end, a seat's first landing) is checked against the card plan's card instead (dealCheckOf). Writes beside it, never over anything:
//   after.mp4   the bank's frame (1764 × 1174) at the delivery's own rate, no sound; H.264 CRF 12, preset slow, 4:2:0, encoded by
//               FFmpeg from BGR frames exactly as the script did, so the same frames give the same file
//   after.json  the receipt: the treatment and why, every flag, the frames cut, the scaling, the tone lock's gain and lift, the
//               pictures with their SHA-256, the original's SHA-256 before and after (unchanged), and every measure: the green
//               before and after, slutkoll (on the delivery and on after.mp4), kantkoll on the first and last frame, filmmatt's
//               pixel half; --compare adds the frame-by-frame comparison with another film; --rim adds cardRim (the way, the
//               frames changed, the pixels painted and those held still, per frame too)
// The treatment follows the model (TREATMENTS in src/film-after.ts): WAN 3 cuts its two dark last frames and lifts the person to
// first.png; Kling 4 keeps every frame and is scaled from 1172 to 1174 rows; Kling 3.0 4K is scaled down and lifted. The green
// comes from the anchor first.png was copied from (its from.path), as every after-work tonight used it. A delivery that is not
// the first picture's shape (width/height within 1 %) is refused: fitting it to the bank's frame is the main agent's and Jakob's.
// The delivery's colour tags are ignored on decoding, as OpenCV did (a Kling 4 film is tagged BT.709 and was read as BT.601).
// Flags, the cases the scripts had:
//   --keep-tail | --cut <n>   keep every frame | cut the n last frames (default by the model: WAN 3 cuts 2)
//   --lock | --no-lock        lift the person to first.png's levels, or not (default by the model)
//   --fps <rate>              the rate written (default: the delivery's own, e.g. 24 for Kling)
//   --anchor <png>            the picture whose green is wanted (default: the anchor first.png comes from)
//   --seats <P1.C1,…>         the targets filmmatt measures the landing at (default: the order's motion.target)
//   --rim <felt|card>         the pale rim the model draws round the dealt card outside the shoe painted over, frame by frame,
//                             after the levelling (tools/card-rim.ts): as felt (the card becomes as small as its colour), or
//                             in the card's own colour (the card keeps its outer size and her fingers stay on it). Off unless
//                             asked for: Jakob has said yes to neither at game size
//   --out <dir>               write after.mp4 and after.json into that folder instead (a trial; nothing beside the original)
//   --compare <film>          compare after.mp4 frame by frame with another film (tonight's Python after.mp4)
// Exit code 2 and the reason in Swedish when the run is refused; nothing is then written.
import {readFile, writeFile, mkdir, rename, rm, stat} from 'node:fs/promises';
import {existsSync, mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {probe, sha256File, type Probe} from './film-fix.ts';
import {orderTake, OrderError} from './order-collect.ts';
import {BANK, TREATMENTS, resizeCubic, smoothGreen, toneLock, levelFrame, NO_TONE, cornerMean, endCheck, stillAnchorTail, edgeCheck, filmMeasure, seam, round, cardBlobs, type Tone, type PlanTarget} from '../src/film-after.ts';
import {checkDeal, type DealCheck, type FrameCard} from '../src/deal-check.ts';
import {planQuad, readPlan, type Pt} from './order-images.ts';
import {RIM_WAYS, rimOffFilm, type RimWay} from './card-rim.ts';
import type {PlacementPlan} from '../src/placement-model.ts';

const ROOT = process.cwd();
const childEnv = () => {
  const scratch = path.join(ROOT, '.runtime', 'film-after');
  mkdirSync(scratch, {recursive: true});
  return {...process.env, TEMP: scratch, TMP: scratch};
};
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
/** The encoding, argument for argument as efterarbete.py called FFmpeg. */
export const ENCODE = ['-an', '-c:v', 'libx264', '-crf', '12', '-preset', 'slow', '-pix_fmt', 'yuv420p'];
// Decoding as OpenCV did: every frame as it comes, BGR, the stream's colour tags set aside (OpenCV converts with BT.601).
const DECODE_FILTER = 'setparams=colorspace=unknown:color_primaries=unknown:color_trc=unknown:range=unknown';
export const SHAPE_TOLERANCE = 0.01;

export class Refused extends Error {}
const posix = (file: string) => { const rel = path.relative(ROOT, path.resolve(file)); return (!rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.resolve(file)).split(path.sep).join('/'); };

/** A picture as OpenCV reads it: 8-bit BGR, no colour management. */
export async function readPicture(file: string): Promise<{width: number; height: number; data: Uint8Array; sha256: string}> {
  const bytes = await readFile(file), {data, info} = await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const out = new Uint8Array(info.width * info.height * 3), ch = info.channels;
  for (let p = 0; p < info.width * info.height; p++) { const s = p * ch; out[p * 3] = data[s + (ch >= 3 ? 2 : 0)]; out[p * 3 + 1] = data[s + (ch >= 3 ? 1 : 0)]; out[p * 3 + 2] = data[s]; }
  return {width: info.width, height: info.height, data: out, sha256: createHash('sha256').update(bytes).digest('hex')};
}

/** The frames of a film as OpenCV's VideoCapture gives them: BGR, w × h × 3 bytes each. */
export async function* decode(file: string, w: number, h: number): AsyncGenerator<Uint8Array> {
  const bytes = w * h * 3, child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:v:0', '-vf', DECODE_FILTER, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: childEnv()});
  let err = ''; child.stderr!.on('data', c => { err += c; });
  const done = new Promise<number>(resolve => child.on('close', code => resolve(code ?? 1)));
  let frame = new Uint8Array(bytes), filled = 0, complete = false;
  try {
    for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
      let at = 0;
      while (at < chunk.length) { const take = Math.min(chunk.length - at, bytes - filled); frame.set(chunk.subarray(at, at + take), filled); filled += take; at += take;
        if (filled === bytes) { yield frame; frame = new Uint8Array(bytes); filled = 0; } }
    }
    complete = true;
  } finally { if (!complete) child.kill(); }
  const code = await done;
  if (code !== 0) throw Error(`ffmpeg ${code}: ${err.trim().slice(0, 400)}`);
  if (filled) throw Error(`${file}: en halv ruta på slutet (${filled} av ${bytes} byte).`);
}

/** An encoder fed BGR frames, as efterarbete.py fed its FFmpeg. */
function encoder(file: string, w: number, h: number, fps: string) {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', `${w}x${h}`, '-r', fps, '-i', '-', ...ENCODE, file], {stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true, env: childEnv()});
  let err = ''; child.stderr!.on('data', c => { err += c; });
  const done = new Promise<void>((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg ${code}: ${err.trim().slice(0, 400)}`))); });
  return {
    write: async (frame: Uint8Array) => { if (!child.stdin!.write(frame)) await new Promise(resolve => child.stdin!.once('drain', resolve)); },
    end: async () => { child.stdin!.end(); await done; },
    abort: async () => { child.stdin!.destroy(); child.kill(); await done.catch(() => undefined); },
  };
}

/** The rate as efterarbete.py wrote it to FFmpeg: a whole number when it is one ("24", "30"). */
export function rateText(fps: string): string { const [n, d] = fps.split('/').map(Number); return d && n % d === 0 ? String(n / d) : fps; }
/** Whether a delivery has the first picture's shape (width/height within SHAPE_TOLERANCE): Kling 4's 1764 × 1172 does, 16:9 does not. */
export function sameShape(w: number, h: number, pw: number, ph: number): boolean { return Math.abs(w / h - pw / ph) / (pw / ph) <= SHAPE_TOLERANCE; }

export type Options = {cut?: number; lock?: boolean; fps?: string; anchor?: string; seats?: string[]; rim?: RimWay; out?: string; compare?: string};
/** Reads the flags; unknown flags are refused, so that a typo is not ignored. */
export function readFlags(args: string[]): Options {
  const o: Options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i], value = () => { const v = args[++i]; if (v === undefined || v.startsWith('--')) throw new Refused(`${a} behöver ett värde.`); return v; };
    if (a === '--keep-tail') o.cut = 0;
    else if (a === '--cut') { const n = Number(value()); if (!Number.isInteger(n) || n < 0 || n > 3) throw new Refused('--cut är 0–3 rutor (WAN 3:s två mörka sista rutor; mer än så är ett utsnitt).'); o.cut = n; }
    else if (a === '--lock') o.lock = true;
    else if (a === '--no-lock') o.lock = false;
    else if (a === '--fps') { o.fps = value(); if (!/^\d+(\/\d+)?$/.test(o.fps)) throw new Refused('--fps är ett tal eller ett bråk (24, 30, 30000/1001).'); }
    else if (a === '--anchor') o.anchor = value();
    else if (a === '--seats') o.seats = value().split(',').filter(Boolean);
    else if (a === '--rim') { const way = value(); if (!RIM_WAYS.includes(way as RimWay)) throw new Refused('--rim är felt (kanten målas som filt) eller card (kanten målas i kortets egen färg).'); o.rim = way as RimWay; }
    else if (a === '--out') o.out = value();
    else if (a === '--compare') o.compare = value();
    else throw new Refused(`Okänd flagga ${a}.`);
  }
  return o;
}

export type FilmComparison = {other: string; otherSha256: string; identicalFile: boolean; frames: [number, number]; identicalFrames: number; meanAbs: number; maxAbs: number; differingShare: number;
  worstFrame: {frame: number; meanAbs: number; maxAbs: number} | null; histogram: Record<string, number>; perFrame: {frame: number; meanAbs: number; maxAbs: number}[]};

/** The whole run for one take. Nothing is written beside the original unless every step holds; after.mp4 is written under a temporary name first. */
export async function afterWork(id: string, take: number, options: Options = {}, root = ROOT): Promise<{record: Record<string, unknown>; film: string; receipt: string}> {
  const {order, folder} = await orderTake(root, id, take);
  if (order.kind !== 'FILM') throw new Refused(`${id} är en ${order.kind}, ingen film: stillbilder efterarbetas med tools/still-after.ts.`);
  const model = String(order.generation?.model ?? ''), treatment = TREATMENTS[model];
  if (!treatment) throw new Refused(`${id}: modellen ${model || '(ingen)'} har inget efterarbete här; det finns för ${Object.keys(TREATMENTS).join(', ')}.`);
  const takeDir = path.join(folder, `take-${take}`), source = path.join(takeDir, 'source.mp4');
  if (!existsSync(source)) throw new Refused(`Leveransen saknas: ${posix(source)}.`);
  const pics = (order as {pictures?: {name: string; path: string | null; from?: {path?: string}}[]}).pictures ?? [];
  const firstEntry = pics.find(p => p.name === 'first.png'), firstFile = path.join(folder, 'first.png'), lastFile = path.join(folder, 'last.png');
  if (!existsSync(firstFile)) throw new Refused(`${id}: first.png saknas (${posix(firstFile)}); utan den finns varken grönt eller ton att gå efter.`);
  const anchorFile = options.anchor ? path.resolve(options.anchor) : firstEntry?.from?.path && existsSync(path.join(root, firstEntry.from.path)) ? path.join(root, firstEntry.from.path) : firstFile;
  const outDir = options.out ? path.resolve(options.out) : takeDir, film = path.join(outDir, 'after.mp4'), receipt = path.join(outDir, 'after.json'), part = path.join(outDir, 'after.part.mp4');
  for (const f of [film, receipt]) if (existsSync(f)) throw new Refused(`${posix(f)} finns redan; efterarbetet skriver aldrig över (det som ligger där kan vara det som banken gjordes av).`);
  if (path.resolve(film) === path.resolve(source)) throw new Refused('Utfilen får inte vara originalet.');

  const facts: Probe = probe(source), anchor = await readPicture(anchorFile), first = await readPicture(firstFile), last = existsSync(lastFile) ? await readPicture(lastFile) : null;
  const W = anchor.width, H = anchor.height;
  if (W !== BANK.width || H !== BANK.height) throw new Refused(`Ankaret ${posix(anchorFile)} är ${W} × ${H}, inte bankens ${BANK.width} × ${BANK.height}.`);
  if (first.width !== W || first.height !== H || (last && (last.width !== W || last.height !== H))) throw new Refused('first.png och last.png ska ha bankens storlek.');
  if (!sameShape(facts.width, facts.height, W, H)) throw new Refused(`Leveransen är ${facts.width} × ${facts.height} (bredd/höjd ${round(facts.width / facts.height, 3)}), inte första bildens form ${round(W / H, 3)}: stanna och rapportera; passningen till bankens ram är huvudagentens och Jakobs.`);
  const cut = options.cut ?? treatment.cutTail, lock = options.lock ?? treatment.lock, fps = rateText(options.fps ?? facts.fps), rate = (([n, d]) => n / (d || 1))(fps.split('/').map(Number));
  const scaled = facts.width !== W || facts.height !== H, seats = options.seats ?? (typeof (order.motion as {target?: unknown} | null)?.target === 'string' ? [String((order.motion as {target: string}).target)] : []);
  const other = options.compare ? path.resolve(options.compare) : null;
  if (other) { if (!existsSync(other)) throw new Refused(`${posix(other)} finns inte.`); const o = probe(other); if (o.width !== W || o.height !== H) throw new Refused(`${posix(other)} är ${o.width} × ${o.height}; jämförelsen kräver bankens ram.`); }
  const sourceSha = await sha256File(source);

  await mkdir(outDir, {recursive: true});
  const gt = smoothGreen(anchor.data, W, H), started = Date.now();
  let tone: Tone | null = null, index = 0, written = 0, firstLevels: [number[], number[]] | null = null, lastLevels: [number[], number[]] | null = null;
  const queue: Uint8Array[] = [], sourceEnd = last ? endCheck(last.data, W, H) : null, enc = encoder(part, W, H, fps), rim = options.rim ? rimOffFilm(anchor.data, options.rim) : null;
  let whole = false, encoded = false;
  try {
    for await (const raw of decode(source, facts.width, facts.height)) {
      const frame = scaled ? resizeCubic(raw, facts.width, facts.height, W, H) : raw;
      if (index++ === 0 && lock) {
        tone = toneLock(first.data, frame, W, H);
        if (!tone.pixels) throw new Refused('Ingen del av henne syns i både first.png och filmens första ruta; tonlåset kan inte mätas (--no-lock om det är meningen).');
      }
      sourceEnd?.add(frame);
      queue.push(frame);
      if (queue.length > cut) {
        const f = queue.shift()!, o = levelFrame(f, gt, W, H, tone ?? NO_TONE), levels: [number[], number[]] = [cornerMean(f, W, H), cornerMean(o, W, H)];
        if (!firstLevels) firstLevels = levels; lastLevels = levels;
        rim?.add(o);
        await enc.write(o); written++;
      }
    }
    await enc.end(); encoded = true;
    if (index !== facts.frames) throw Error(`Avkodningen gav ${index} rutor, ffprobe räknade ${facts.frames}.`);
    const record = await measures();
    await rename(part, film);
    await writeFile(receipt, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
    whole = true;
    return {record, film, receipt};
  } finally { if (!whole) { if (!encoded) await enc.abort(); await rm(part, {force: true}); } }

  // The measures, on the film as written (decoded again, as the scripts read after.mp4), and the comparison when asked.
  async function measures() {
  const out = probe(part), measure = filmMeasure(W, H, rate), endAfter = last ? endCheck(last.data, W, H) : null, plan = await planTargets(root);
  const tail = last ? stillAnchorTail(last.data, rate) : null;
  let f0: Uint8Array | null = null, fl: Uint8Array | null = null, comparison: FilmComparison | null = null;
  const cmp = other ? comparer(other) : null;
  const otherFrames = other ? decode(other, W, H)[Symbol.asyncIterator]() : null;
  for await (const frame of decode(part, W, H)) {
    if (!f0) f0 = frame.slice(); fl = frame;
    measure.add(frame); endAfter?.add(frame); tail?.add(frame);
    if (otherFrames && cmp) { const next = await otherFrames.next(); cmp.add(frame, next.done ? null : next.value); }
  }
  if (otherFrames && cmp) { for (let next = await otherFrames.next(); !next.done; next = await otherFrames.next()) cmp.add(null, next.value); comparison = await cmp.result(await sha256File(part)); }
  const sourceAfter = await sha256File(source);
  if (sourceAfter !== sourceSha) throw Error('Originalet ändrades under körningen.');
  const t = tone ?? {...NO_TONE, pixels: 0}, rgb = (v: number[]) => [v[2], v[1], v[0]];
  const record = {schemaVersion: 1, tool: 'tools/film-after.ts', createdAt: new Date().toISOString(), seconds: round((Date.now() - started) / 1000, 1),
    order: id, take, model, treatment: {...treatment, cutTail: cut, lock, fps, flags: options, scaledFrom: scaled ? [facts.width, facts.height] : null,
      scaling: scaled ? 'varje ruta skalad rakt till bankens ram, bikubiskt (OpenCV INTER_CUBIC), som efterarbete.py' : null, soundDropped: facts.audio,
      colourTagsIgnored: Object.keys(facts.colour).length ? facts.colour : null, port: 'efterarbete.py, slutkoll.py, kantkoll.py och filmmatt.py:s pixeldel (src/film-after.ts)'},
    pictures: {anchor: {path: posix(anchorFile), sha256: anchor.sha256, why: 'det gröna som varje ruta förs till'}, first: {path: posix(firstFile), sha256: first.sha256, why: lock ? 'tonlåsets referens' : 'startskarven'},
      ...(last ? {last: {path: posix(lastFile), sha256: last.sha256, why: 'slutkoll och slutskarven'}} : {})},
    source: {path: posix(source), sha256: sourceSha, sha256After: sourceAfter, untouched: true, bytes: (await stat(source)).size, width: facts.width, height: facts.height, fps: facts.fps, frames: facts.frames, audio: facts.audio, colour: facts.colour},
    output: {path: posix(film), sha256: await sha256File(part), bytes: (await stat(part)).size, width: out.width, height: out.height, fps: out.fps, frames: out.frames, audio: out.audio, encoding: `FFmpeg ${ENCODE.join(' ')} från BGR-rutor`,
      dropped: cut ? [facts.frames - cut, facts.frames - 1] : null, frameMap: 'samma rutnummer som originalet'},
    tone: lock ? {gainRGB: rgb(t.gain).map(v => round(v, 4)), liftRGB: rgb(t.lift).map(v => round(v, 2)), pixels: t.pixels} : null,
    // As efterarbete.py printed it (gain and lift in OpenCV's B, G, R; greens R, G, B), for a line-by-line comparison with tonight's notes.
    efterarbete: {frames: written, gainBGR: t.gain.map(v => round(v, 3)), liftBGR: t.lift.map(v => round(v, 2)), greenBefore: {first: firstLevels?.[0], last: lastLevels?.[0]}, greenAfter: {first: firstLevels?.[1], last: lastLevels?.[1]}},
    slutkoll: {source: sourceEnd?.result() ?? null, after: endAfter?.result() ?? null},
    stillAnchorTail: tail?.result() ?? null,
    kantkoll: {firstFrame: f0 ? edgeCheck(f0, W, H) : null, lastFrame: fl ? edgeCheck(fl, W, H) : null},
    filmmatt: {...measure.result(seats, plan), startSeam: f0 ? seam(f0, first.data) : null, endSeam: fl && last ? seam(fl, last.data) : null},
    ...(rim ? {cardRim: rim.result()} : {}),
    ...(comparison ? {comparison} : {}),
    // The automatic check of a deal (src/deal-check.ts): a take that fails it goes to no reviewer; remarks go with it.
    ...(isDeal(order) ? {dealCheck: dealCheckOf(order, measure.dealFrames(), last, rate, last ? null : await planCardFor(root, order))} : {}),
    review: 'Efterarbetet ersätter ingen granskning: varje ruta granskas i full upplösning (tools/order-clerk.md, avsnitt 6–8).'};
  if (record.output.frames !== written) throw Error(`after.mp4 har ${record.output.frames} rutor, ${written} skrevs.`);
  return record;
  }
}

/** A deal from the pinch or the drag (its step key in the order). */
const isDeal = (order: {step?: {key?: string}}) => /^GIV-/.test(String(order.step?.key ?? ''));
/**
 * Where the plan lays a card, as an order's last picture would have drawn it (tools/order-images.ts planQuad: through the
 * table's lens on "Plant bord", in film pixels): the outline, its box (left, top, right, bottom, as cardBlobs gives a card's),
 * the outline's middle (an order's place) and its area. Measured against six drawn last pictures of 2026-11-21 (P4.C1, P4.C2,
 * D.C3) the box lies 0–2 px from the card cardBlobs finds on last.png and the area 1–2 % under it. Null when the plan has no
 * such place.
 */
export type PlanCard = {target: string; quad: Pt[]; bbox: [number, number, number, number]; centre: [number, number]; n: number; plan?: {path: string; sha256: string}};
export function planCardOf(plan: PlacementPlan, target: string): PlanCard | null {
  if (!plan.targets?.[target]?.geometry?.native) return null;
  const q = planQuad(plan, target), xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  let twice = 0; for (let i = 0; i < q.length; i++) { const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % q.length]; twice += x0 * y1 - x1 * y0; }
  return {target, quad: q.map(([x, y]) => [round(x, 1), round(y, 1)] as Pt), bbox: [Math.round(Math.min(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...xs)), Math.round(Math.max(...ys))],
    centre: [round(xs.reduce((s, v) => s + v, 0) / q.length, 1), round(ys.reduce((s, v) => s + v, 0) / q.length, 1)], n: Math.round(Math.abs(twice) / 2)};
}
/** The plan's card for an order's motion.target, from placements/default.json; null without a target or a plan. */
async function planCardFor(root: string, order: {motion?: unknown}): Promise<PlanCard | null> {
  const target = (order.motion as {target?: unknown} | null)?.target;
  if (typeof target !== 'string' || !existsSync(path.join(root, 'placements', 'default.json'))) return null;
  const {plan, file} = await readPlan(root), card = planCardOf(plan, target);
  return card && {...card, plan: file};
}

/** Whether an order has a last picture: one that goes to the model as its end frame (order-new.ts --no-end leaves it out). */
const hasEnd = (order: {pictures?: unknown}) => Array.isArray(order.pictures) && order.pictures.some(p => (p as {goesAs?: string} | null)?.goesAs === 'endFrame');
/**
 * The check of a deal: the card per frame from the pass, against the last picture's card (the largest blue outside the
 * shoe on last.png, by the same colour rule; the plan's rule drew it as a real card at its place). An order with a last
 * picture whose file is missing, or whose card cannot be measured, has nothing to land on, and the check says so. An order
 * without a last picture (a seat's first landing, made from the film's last frame afterwards) lands on the plan's card
 * (`planCard`, planCardOf) by the same check and thresholds; the result then says so in `cardFrom`, and its texts name the
 * plan's card instead of the last picture's.
 */
export function dealCheckOf(order: {motion?: unknown; pictures?: unknown}, deal: {frames: FrameCard[]; changePerFrame: number[]}, last: {width: number; height: number; data: Uint8Array} | null, fps: number, planCard: PlanCard | null = null): DealCheck & {cardFrom?: string; planCard?: PlanCard} {
  const side = (order.motion as {side?: string} | null)?.side === 'BACK' ? 'BACK' : 'FRONT';
  if (!last && !hasEnd(order)) {
    const target = String((order.motion as {target?: unknown} | null)?.target ?? '(inget mål)');
    if (!planCard) return {pass: false, fails: [{code: 'ingen-plats-i-planen', text: `Ordern har ingen sista bild och kortplanen ingen plats ${target}: inget att jämföra landningen med.`}], remarks: [], measures: {}};
    const check = checkDeal(deal.frames, {fps, side, lastCard: {bbox: planCard.bbox, centre: planCard.centre, n: planCard.n}, changePerFrame: deal.changePerFrame});
    const named = (f: DealCheck['fails'][number]) => ({...f, text: f.text.replaceAll('sista bildens kort', 'kortplanens kort').replace(': returen hoppar.', ': kortet ligger utanför sin plats.').replace('handen hoppar till sista bilden', 'handen hoppar i filmens sista rutor')});
    return {...check, fails: check.fails.map(named), remarks: check.remarks.map(named), cardFrom: `kortplanen, ${planCard.target} (ingen sista bild)`, planCard};
  }
  const card = last ? cardBlobs(last.data, last.width, last.height).filter(b => b.c === (side === 'BACK' ? 'Y' : 'B') && !b.inShoe).sort((a, b) => b.area - a.area)[0] : null;
  if (!card?.box) return {pass: false, fails: [{code: 'ingen-sista-bild', text: 'Sista bildens kort går inte att mäta: inget att jämföra landningen med.'}], remarks: [], measures: {}};
  return checkDeal(deal.frames, {fps, side, lastCard: {bbox: card.box, centre: [card.x, card.y], n: card.area}, changePerFrame: deal.changePerFrame});
}

async function planTargets(root: string): Promise<Record<string, PlanTarget>> {
  const file = path.join(root, 'placements', 'default.json');
  if (!existsSync(file)) return {};
  const targets = JSON.parse(await readFile(file, 'utf8')).targets ?? {};
  return Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, (v as {geometry: {native: PlanTarget}}).geometry.native]));
}

/** Frame by frame against another film: identical frames, the mean and largest difference per value, and how the differences spread. */
function comparer(other: string) {
  const perFrame: {frame: number; meanAbs: number; maxAbs: number}[] = [], hist = new Float64Array(256);
  let mine = 0, theirs = 0, identical = 0, sum = 0, values = 0, max = 0, differing = 0;
  return {
    add(a: Uint8Array | null, b: Uint8Array | null) {
      if (a) mine++; if (b) theirs++;
      if (!a || !b) return;
      let s = 0, m = 0, d = 0;
      for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i] - b[i]); s += v; if (v > m) m = v; if (v) d++; hist[v]++; }
      if (!m) identical++;
      sum += s; values += a.length; differing += d; max = Math.max(max, m);
      perFrame.push({frame: perFrame.length, meanAbs: round(s / a.length, 4), maxAbs: m});
    },
    async result(mineSha: string): Promise<FilmComparison> {
      const otherSha = await sha256File(other), worst = perFrame.reduce<typeof perFrame[number] | null>((w, f) => !w || f.meanAbs > w.meanAbs ? f : w, null), histogram: Record<string, number> = {};
      for (let v = 0; v < 256; v++) if (hist[v]) histogram[String(v)] = hist[v];
      return {other: posix(other), otherSha256: otherSha, identicalFile: otherSha === mineSha, frames: [mine, theirs], identicalFrames: identical, meanAbs: values ? round(sum / values, 5) : 0, maxAbs: max,
        differingShare: values ? round(differing / values, 6) : 0, worstFrame: worst, histogram, perFrame};
    },
  };
}

if (import.meta.main) {
  const [id, takeText, ...rest] = process.argv.slice(2);
  if (!id || !takeText) { console.error('Användning: node tools/film-after.ts <beställnings-id> <tagning> [--keep-tail|--cut n] [--lock|--no-lock] [--fps r] [--anchor png] [--seats P1.C1] [--rim felt|card] [--out mapp] [--compare film]'); process.exit(1); }
  try {
    const {record, film, receipt} = await afterWork(id, Number(takeText), readFlags(rest));
    const r = record as Record<string, any>;
    console.log(JSON.stringify({film: posix(film), receipt: posix(receipt), model: r.model, frames: r.output.frames, size: [r.output.width, r.output.height], fps: r.output.fps, cutTail: r.treatment.cutTail, lock: r.treatment.lock,
      efterarbete: r.efterarbete, slutkoll: r.slutkoll.after, kantkollLast: r.kantkoll.lastFrame && {dark: r.kantkoll.lastFrame.darkGreenPixelsAboveEdge, bodyEnds: r.kantkoll.lastFrame.bodyEnds},
      filmmatt: {frozenFrames: r.filmmatt.frozenFrames, green: r.filmmatt.green, landing: r.filmmatt.landing, startSeam: r.filmmatt.startSeam, endSeam: r.filmmatt.endSeam},
      cardRim: r.cardRim && {way: r.cardRim.way, framesChanged: r.cardRim.framesChanged, firstFrame: r.cardRim.firstFrame, lastFrame: r.cardRim.lastFrame, pixelsPainted: r.cardRim.pixelsPainted, softEdge: r.cardRim.softEdge, herEdge: r.cardRim.herEdge, held: r.cardRim.held},
      comparison: r.comparison && {identicalFile: r.comparison.identicalFile, frames: r.comparison.frames, identicalFrames: r.comparison.identicalFrames, meanAbs: r.comparison.meanAbs, maxAbs: r.comparison.maxAbs, differingShare: r.comparison.differingShare},
      dealCheck: r.dealCheck && {pass: r.dealCheck.pass, cardFrom: r.dealCheck.cardFrom, fails: r.dealCheck.fails, remarks: r.dealCheck.remarks}}, null, 2));
    if (!rest.includes('--out')) console.log(`Nästa: node tools/order-put.ts status ${id} ${takeText} EFTERARBETAD --file ${posix(film)} --note "tools/film-after.ts (${r.model}): ..."`);
    // A deal that fails the automatic check is not given to a reviewer (src/deal-check.ts): say so and why.
    if (r.dealCheck && !r.dealCheck.pass) console.log(`Kontrollen fäller tagningen (${r.dealCheck.fails.map((f: {code: string}) => f.code).join(', ')}): ingen granskare. Sedan: node tools/order-put.ts status ${id} ${takeText} MÄTT --note "faller automatiskt: ${r.dealCheck.fails.map((f: {text: string}) => f.text).join(' ')}"`);
  } catch (e) {
    if (e instanceof Refused || e instanceof OrderError) { console.error(e.message); process.exit(2); }
    throw e;
  }
}
