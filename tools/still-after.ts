// Brings a delivered anchor still into the bank's frame (src/still-after.ts): the after-work that tonight's orders ran as Python in
// scratch folders, as far as it runs without MediaPipe. Orders nothing and spends nothing.
//   node tools/still-after.ts <order id> <take> --fitted <png>    steps 2–4: fillDark, removeShadow, edgeCheck → ren.png, ren.json
//   node tools/still-after.ts <order id> <take> --shoe <png>      steps 6–9: greenTo, toneTo, removeShadow, edgeCheck → after.png, after.json
// The recipe and its numbering are in src/still-after.ts. Steps 1 (the fit) and 5 (the shoe back from a plate) find hands, eyes and
// shoulders with MediaPipe, which the repo does not have: they are still the Python of D:/dealer-scratch/tmp/bestall/paow-ankare-2-1/
// (grundbild-21.py, skolagning-21.py), and this command prints them where they belong. --fitted is grundbild-21's <name>-final.png;
// --shoe is skolagning-21's output (made from ren.png), or ren.png itself for an anchor whose shoe step was left out.
// Reads data/orders/<id>.json (kind STILL) and anchor.png beside it (the dealer's anchor 1: plate, green and tone); the delivery
// take-<n>/source.png is only read and its SHA-256 checked before and after. Writes into take-<n>/ (or --out <dir>), never over a file.
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {readPicture, Refused} from './film-after.ts';
import {orderTake, OrderError} from './order-collect.ts';
import {BANK, edgeCheck, EDGE} from '../src/film-after.ts';
import {fillDark, removeShadow, greenTo, toneTo} from '../src/still-after.ts';

const ROOT = process.cwd();
const PY = 'D:/dealer-scratch/tmp/filmagent/py/venv/Scripts/python.exe -I', VARIANTS = 'D:/dealer-scratch/tmp/bestall/paow-ankare-2-1';
const posix = (file: string) => { const rel = path.relative(ROOT, path.resolve(file)); return (!rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.resolve(file)).split(path.sep).join('/'); };
const sha = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');

/** A BGR picture written as an 8-bit RGB PNG (OpenCV's imwrite of the same pixels). */
async function writePicture(file: string, bgr: Uint8Array, w: number, h: number) {
  const rgb = Buffer.alloc(bgr.length); for (let i = 0; i < bgr.length; i += 3) { rgb[i] = bgr[i + 2]; rgb[i + 1] = bgr[i + 1]; rgb[i + 2] = bgr[i]; }
  await writeFile(file, await sharp(rgb, {raw: {width: w, height: h, channels: 3}}).png().toBuffer(), {flag: 'wx'});
}
/** What the edge check must give (the ground standard): no dark point above the edge, the body ending on rows 825–831. */
export function edgeVerdict(e: ReturnType<typeof edgeCheck>): {holds: boolean; why: string[]} {
  const why: string[] = [];
  if (e.darkGreenPixelsAboveEdge) why.push(`${e.darkGreenPixelsAboveEdge} mörka gröna punkter ovanför kanten (ska vara 0)`);
  const m = e.betweenHands?.median ?? e.bodyEnds?.median;
  if (m === undefined || m < EDGE.bodyRows[0] || m > EDGE.bodyRows[1]) why.push(`kroppen slutar på rad ${m ?? '–'} (ska vara ${EDGE.bodyRows[0]}–${EDGE.bodyRows[1]})`);
  return {holds: !why.length, why};
}

export type StillOptions = {fitted?: string; shoe?: string; out?: string};
export function readStillFlags(args: string[]): StillOptions {
  const o: StillOptions = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i], v = args[i + 1];
    if (!['--fitted', '--shoe', '--out'].includes(a)) throw new Refused(`Okänd flagga ${a}.`);
    if (v === undefined || v.startsWith('--')) throw new Refused(`${a} behöver ett värde.`);
    o[a.slice(2) as keyof StillOptions] = v; i++;
  }
  if (!o.fitted === !o.shoe) throw new Refused('Ange antingen --fitted <grundbild-21:s -final.png> (steg 2–4) eller --shoe <skolagning-21:s bild> (steg 6–9).');
  return o;
}

export async function stillAfter(id: string, take: number, options: StillOptions): Promise<{record: Record<string, unknown>; picture: string; receipt: string}> {
  const {order, folder} = await orderTake(ROOT, id, take);
  if (order.kind !== 'STILL') throw new Refused(`${id} är en ${order.kind}, ingen stillbild: filmer efterarbetas med tools/film-after.ts.`);
  const takeDir = path.join(folder, `take-${take}`), source = path.join(takeDir, 'source.png'), anchorFile = path.join(folder, 'anchor.png');
  if (!existsSync(source)) throw new Refused(`Leveransen saknas: ${posix(source)}.`);
  if (!existsSync(anchorFile)) throw new Refused(`${id}: anchor.png saknas; det är ankare 1, plattan, det gröna och tonen.`);
  const stage = options.fitted ? 'ren' : 'after', input = path.resolve((options.fitted ?? options.shoe)!), outDir = options.out ? path.resolve(options.out) : takeDir;
  const picture = path.join(outDir, `${stage}.png`), receipt = path.join(outDir, `${stage}.json`);
  for (const f of [picture, receipt]) if (existsSync(f)) throw new Refused(`${posix(f)} finns redan; efterarbetet skriver aldrig över.`);
  if (!existsSync(input)) throw new Refused(`${posix(input)} finns inte.`);
  const sourceSha = await sha(source), anchor = await readPicture(anchorFile), pic = await readPicture(input), W = BANK.width, H = BANK.height;
  for (const [name, p] of [['anchor.png', anchor], [posix(input), pic]] as const) if (p.width !== W || p.height !== H) throw new Refused(`${name} är ${p.width} × ${p.height}, inte bankens ${W} × ${H}.`);
  const started = Date.now(), steps: Record<string, unknown>[] = [];
  let data = pic.data;
  if (stage === 'ren') {
    const fill = fillDark(data, W, H); data = fill.data; steps.push({step: 2, name: 'fillDark (fyll-morkt.py)', ...fill, data: undefined});
    const shadow = removeShadow(data, W, H); data = shadow.data; steps.push({step: 3, name: 'removeShadow (ta-bort-skugga.py)', ...shadow, data: undefined});
  } else {
    const green = greenTo(data, anchor.data, W, H); data = green.data; steps.push({step: 6, name: 'greenTo (gron-till-niva.py), mot anchor.png', ...green, data: undefined});
    const tone = toneTo(data, anchor.data, W, H); data = tone.data; steps.push({step: 7, name: 'toneTo (ton-till.py), mot anchor.png', ...tone, data: undefined});
    const shadow = removeShadow(data, W, H); data = shadow.data; steps.push({step: 8, name: 'removeShadow igen (ta-bort-skugga.py)', ...shadow, data: undefined});
  }
  const edge = edgeCheck(data, W, H), verdict = edgeVerdict(edge);
  steps.push({step: stage === 'ren' ? 4 : 9, name: 'edgeCheck (kantkoll.py)', ...edge, verdict});
  await mkdir(outDir, {recursive: true});
  await writePicture(picture, data, W, H);
  const sourceAfter = await sha(source);
  if (sourceAfter !== sourceSha) throw Error('Originalet ändrades under körningen.');
  const sko = path.join(outDir, 'sko.png');
  const next = stage === 'ren'
    ? [`${PY} ${VARIANTS}/skolagning-21.py ${posix(picture)} ${posix(anchorFile)} ${posix(sko)} --keep-card`, `node tools/still-after.ts ${id} ${take} --shoe ${posix(sko)}${options.out ? ` --out ${posix(outDir)}` : ''}`]
    : [`node tools/order-put.ts status ${id} ${take} EFTERARBETAD --file ${posix(picture)} --note "tools/still-after.ts: ..."`];
  const record = {schemaVersion: 1, tool: 'tools/still-after.ts', createdAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 100) / 10, order: id, take, stage,
    source: {path: posix(source), sha256: sourceSha, sha256After: sourceAfter, untouched: true, bytes: (await stat(source)).size},
    input: {path: posix(input), sha256: pic.sha256, is: stage === 'ren' ? 'steg 1: grundbild-21 --fit-skip handB,elbowB --keep-shoe-region (Python, MediaPipe)' : 'steg 5: skolagning-21 --keep-card med anchor.png som platta (Python, MediaPipe), eller ren.png när skosteget utelämnas'},
    anchor: {path: posix(anchorFile), sha256: anchor.sha256, why: 'ankare 1: platta, grönt och ton'},
    output: {path: posix(picture), sha256: await sha(picture), width: W, height: H},
    steps, holds: verdict.holds, notPorted: {
      'steg 1': `${PY} ${VARIANTS}/grundbild-21.py <ankare 1> ${posix(source)} t${take} <mapp> --fit-skip handB,elbowB --keep-shoe-region  (passning på händer, axlar, armbågar och ögon från MediaPipe)`,
      'steg 5': `${PY} ${VARIANTS}/skolagning-21.py <ren.png> ${posix(anchorFile)} <sko.png> --keep-card  (handen vid skon från MediaPipe)`},
    next};
  await writeFile(receipt, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
  return {record, picture, receipt};
}

if (import.meta.main) {
  const [id, takeText, ...rest] = process.argv.slice(2);
  if (!id || !takeText) { console.error('Användning: node tools/still-after.ts <beställnings-id> <tagning> --fitted <png> | --shoe <png> [--out mapp]'); process.exit(1); }
  try {
    const {record, picture, receipt} = await stillAfter(id, Number(takeText), readStillFlags(rest));
    const r = record as Record<string, any>;
    console.log(JSON.stringify({picture: posix(picture), receipt: posix(receipt), stage: r.stage, holds: r.holds, steps: r.steps.map((s: Record<string, unknown>) => ({step: s.step, name: s.name, ...(s.verdict ? {verdict: s.verdict, darkGreenPixelsAboveEdge: s.darkGreenPixelsAboveEdge, betweenHands: s.betweenHands} : {})})), next: r.next}, null, 2));
  } catch (e) {
    if (e instanceof Refused || e instanceof OrderError) { console.error(e.message); process.exit(2); }
    throw e;
  }
}
