// What is what per dealer, for the studio's view Material: the register data/media-roles.json (a role for a file, one frame
// of a film or a pattern) checked against the disk and the job file. The lab server (tools/preview.ts) answers GET
// /api/media with answer(), hands out only files the register names (servable), and adds a picture on Jakob's click
// (add): PNG or JPEG, kept under assets/keystones/<dealer>-<name>/ or assets/anchors/<dealer>-<name>/ with a receipt
// beside it, never over an existing one, and the register rewritten like the placement file: queued, against what is on
// disk at that moment, through a temporary file renamed into place; Jakob's Godkänn and Underkänn on a candidate are
// written the same way (setState, rules in studio/components/material/state.ts). The shapes and the pure rules are
// studio/lib/media.ts; the readers of picture and film headers here are pure too. Tests: tools/media-roles.test.ts.
import {readFile, open, stat, realpath, mkdir, writeFile, rename, rm, readdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {StoreError} from './placement-store.ts';
import {parseEdge, nodeName, formatEdge} from '../src/clip-graph.ts';
import {
 entryKey, isInside, isUploadRole, kindOfPath, uploadTarget, unassigned, usesOf, validateRegister,
 NAME, NAME_LIMIT, TITLE_LIMIT, UPLOAD_LIMIT, ROLE_LABEL,
 type DealerAnswer, type Entry, type EntryAnswer, type Found, type ImageType, type JobLike, type MediaAnswer, type Register, type UploadRole,
} from '../studio/lib/media.ts';
import {allowed, isDecidable, replacedBy, stateLine} from '../studio/components/material/state.ts';
import {ANCHOR_NODE} from '../src/order-model.ts';

/** The node an anchor stands for (ankare-2.1 → READY); an order finds the anchor that holds by role and node. */
export const nodeOfRole = (role: string): string | undefined => role.startsWith('ankare-') ? ANCHOR_NODE[role.slice(7) as keyof typeof ANCHOR_NODE] : undefined;

// ── Headers of pictures and films (pure) ────────────────────────────────────
/** PNG or JPEG by its first bytes. */
export function sniffImage(b: Uint8Array): ImageType | null {
 if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
 if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
 return null;
}

/** Width and height of a PNG (its IHDR) or a JPEG (its first frame header), from the start of the file. */
export function imageSize(b: Uint8Array): {width: number; height: number; type: ImageType} | null {
 const type = sniffImage(b), view = new DataView(b.buffer, b.byteOffset, b.byteLength);
 if (type === 'png') {
  if (b.length < 24 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
  return {width: view.getUint32(16), height: view.getUint32(20), type};
 }
 if (type === 'jpeg') {
  let i = 2;
  while (i + 9 < b.length) {
   if (b[i] !== 0xff) { i++; continue; }
   const marker = b[i + 1];
   if (marker === 0xff) { i++; continue; }
   if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
   const length = view.getUint16(i + 2);
   // Start of frame: baseline, extended, progressive, lossless (not DHT c4, JPG c8 or DAC cc).
   if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return {width: view.getUint16(i + 7), height: view.getUint16(i + 5), type};
   i += 2 + length;
  }
 }
 return null;
}

type Box = {type: string; start: number; end: number; body: number};
function boxes(b: Uint8Array, from: number, to: number): Box[] {
 const view = new DataView(b.buffer, b.byteOffset, b.byteLength), out: Box[] = [];
 let i = from;
 while (i + 8 <= to) {
  let size = view.getUint32(i), body = i + 8;
  const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
  if (size === 1) { if (i + 16 > to) break; size = Number(view.getBigUint64(i + 8)); body = i + 16; }
  else if (size === 0) size = to - i;
  if (size < 8 || i + size > to) break;
  out.push({type, start: i, end: i + size, body});
  i += size;
 }
 return out;
}
const child = (b: Uint8Array, box: Box, type: string) => boxes(b, box.body, box.end).find(x => x.type === type) ?? null;

/**
 * The video track of an MP4's moov box: width and height (tkhd), frames per second and length in frames (mdhd and stts).
 * Pure: give it the bytes of the moov box.
 */
export function moovFacts(b: Uint8Array): {width: number; height: number; fps: number | null; frames: number | null} | null {
 const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
 const moov = boxes(b, 0, b.length).find(x => x.type === 'moov');
 if (!moov) return null;
 for (const trak of boxes(b, moov.body, moov.end).filter(x => x.type === 'trak')) {
  const tkhd = child(b, trak, 'tkhd'), mdia = child(b, trak, 'mdia');
  if (!tkhd || !mdia) continue;
  const v1 = b[tkhd.body] === 1, at = tkhd.body + (v1 ? 4 + 8 + 8 + 4 + 4 + 8 : 4 + 4 + 4 + 4 + 4 + 4) + 8 + 2 + 2 + 2 + 2 + 36;
  if (at + 8 > tkhd.end) continue;
  const width = view.getUint32(at) / 65536, height = view.getUint32(at + 4) / 65536;
  if (!width || !height) continue; // a sound track
  const mdhd = child(b, mdia, 'mdhd'), stbl = (() => { const minf = child(b, mdia, 'minf'); return minf ? child(b, minf, 'stbl') : null; })(), stts = stbl ? child(b, stbl, 'stts') : null;
  let timescale = 0;
  if (mdhd) timescale = b[mdhd.body] === 1 ? view.getUint32(mdhd.body + 4 + 16) : view.getUint32(mdhd.body + 4 + 8);
  let frames: number | null = null, delta = 0;
  if (stts && stts.body + 8 <= stts.end) {
   const count = view.getUint32(stts.body + 4);
   frames = 0;
   for (let k = 0; k < count && stts.body + 8 + k * 8 + 8 <= stts.end; k++) { const n = view.getUint32(stts.body + 8 + k * 8), d = view.getUint32(stts.body + 12 + k * 8); frames += n; if (!delta) delta = d; }
  }
  const fps = timescale && delta ? Math.round((timescale / delta) * 1000) / 1000 : null;
  return {width: Math.round(width), height: Math.round(height), fps, frames};
 }
 return null;
}

/** Reads only the moov box of an MP4 on disk (it may lie at the start or at the end). */
async function mp4Facts(file: string) {
 const handle = await open(file, 'r');
 try {
  const {size} = await handle.stat(), head = Buffer.alloc(16);
  let at = 0;
  while (at + 8 <= size) {
   await handle.read(head, 0, 16, at);
   let length = head.readUInt32BE(0);
   const type = head.toString('latin1', 4, 8);
   if (length === 1) length = Number(head.readBigUInt64BE(8)); else if (length === 0) length = size - at;
   if (length < 8) return null;
   if (type === 'moov') {
    if (length > 64 * 1024 * 1024) return null;
    const box = Buffer.alloc(length);
    await handle.read(box, 0, length, at);
    return moovFacts(box);
   }
   at += length;
  }
  return null;
 } finally { await handle.close(); }
}

async function headerOf(file: string) {
 const handle = await open(file, 'r');
 try { const b = Buffer.alloc(256 * 1024); const {bytesRead} = await handle.read(b, 0, b.length, 0); return b.subarray(0, bytesRead); } finally { await handle.close(); }
}

/** Matches a pattern of the register ("assets/frames/*\/*.png": * within one folder name) against the disk. */
async function countPattern(root: string, pattern: string): Promise<number> {
 const parts = pattern.split('/'), re = (part: string) => new RegExp('^' + part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*') + '$');
 let dirs = [''];
 for (let i = 0; i < parts.length; i++) {
  const last = i === parts.length - 1, next: string[] = [];
  for (const dir of dirs) {
   if (!parts[i].includes('*')) { next.push(dir ? `${dir}/${parts[i]}` : parts[i]); continue; }
   const match = re(parts[i]);
   for (const e of await readdir(path.join(root, dir), {withFileTypes: true}).catch(() => [])) if ((last ? e.isFile() : e.isDirectory()) && match.test(e.name)) next.push(dir ? `${dir}/${e.name}` : e.name);
  }
  dirs = next;
 }
 let n = 0;
 for (const file of dirs) if (await stat(path.join(root, file)).then(s => s.isFile(), () => false)) n++;
 return n;
}

// ── The store ───────────────────────────────────────────────────────────────
const revisionOf = (text: string) => '"' + createHash('sha256').update(text).digest('hex') + '"';
// The edge the graph files a job under (src/clip-graph.ts buildGraph): a model edge by its base (READY-B>P4.C1 is a take of
// READY>P4.C1), anything else as an experiment edge under its own notation.
const edgeOf = (from: string, to: string) => parseEdge(`${from}>${to}`)?.base ?? formatEdge(nodeName(from), nodeName(to));

export type AddInput = {dealer: string; role: string; name: string; title: string; filename: string; type: string; bytes: Uint8Array; who?: string; now?: Date};

export function mediaRoles(root: string) {
 const registerFile = path.join(root, 'data/media-roles.json'), jobFile = path.join(root, 'data/clip-jobs.json');
 let queue: Promise<unknown> = Promise.resolve();
 // Facts of a file, kept while its size and time are the same: the page asks again on every load.
 const facts = new Map<string, {stamp: string; width: number | null; height: number | null; fps: number | null; frames: number | null}>();

 async function readRegister(): Promise<{text: string | null; register: Register | null; errors: string[]}> {
  let text: string;
  try { text = await readFile(registerFile, 'utf8'); } catch { return {text: null, register: null, errors: ['data/media-roles.json kunde inte läsas.']}; }
  let value: unknown;
  try { value = JSON.parse(text); } catch { return {text, register: null, errors: ['data/media-roles.json är inte giltig JSON.']}; }
  return {text, ...validateRegister(value)};
 }
 async function readJobs(): Promise<{jobs: JobLike[]; derived: number; edits: number}> {
  try {
   const file = JSON.parse(await readFile(jobFile, 'utf8'));
   const jobs = (Array.isArray(file?.jobs) ? file.jobs : []).filter((j: {id?: unknown}) => typeof j?.id === 'string');
   return {jobs, derived: Array.isArray(file?.derived) ? file.derived.length : 0, edits: Array.isArray(file?.edits) ? file.edits.length : 0};
  } catch { return {jobs: [], derived: 0, edits: 0}; }
 }

 /** The file lies where its name says, inside the repo: no link or junction leads out of it. */
 async function confined(file: string): Promise<boolean> {
  if (!isInside(file)) return false;
  try { return (await realpath(path.join(root, file))) === path.join(await realpath(root), ...file.split('/')); } catch { return false; }
 }

 async function look(entry: Entry): Promise<Found> {
  const none: Found = {exists: false, served: null, inside: false, width: null, height: null, bytes: null, fps: null, frames: null, count: null, usedBy: []};
  if (entry.proof) {
   const dir = `assets/proofs/${entry.proof}`, exists = await stat(path.join(root, dir)).then(s => s.isDirectory(), () => false);
   return {...none, exists, inside: true};
  }
  if (!entry.path) return none;
  const inside = isInside(entry.path), file = inside ? path.join(root, ...entry.path.split('/')) : entry.path;
  const s = await stat(file).catch(() => null);
  if (!s?.isFile()) return {...none, inside};
  const ok = inside ? await confined(entry.path) : true;
  if (!ok) return {...none, inside};
  const stamp = `${s.size}:${s.mtimeMs}`;
  let known = facts.get(file);
  if (known?.stamp !== stamp) {
   const kind = kindOfPath(entry.path);
   let width: number | null = null, height: number | null = null, fps: number | null = null, frames: number | null = null;
   try {
    if (kind === 'image') { const size = imageSize(await headerOf(file)); width = size?.width ?? null; height = size?.height ?? null; }
    else if (kind === 'video') { const f = await mp4Facts(file); width = f?.width ?? null; height = f?.height ?? null; fps = f?.fps ?? null; frames = f?.frames ?? null; }
   } catch {}
   known = {stamp, width, height, fps, frames};
   facts.set(file, known);
  }
  const count = entry.pattern ? await countPattern(root, entry.pattern) : null;
  return {exists: true, served: inside ? entry.path : null, inside, width: known.width, height: known.height, bytes: s.size, fps: known.fps, frames: known.frames, count, usedBy: []};
 }

 /** GET /api/media: every dealer's entries with what was found, and the measures. */
 async function answer(): Promise<MediaAnswer> {
  const {text, register, errors} = await readRegister(), {jobs, derived, edits} = await readJobs();
  if (!register) return {schemaVersion: 1, readable: false, revision: text ? revisionOf(text) : null, problems: errors, dealers: [], measures: [], unassigned: []};
  const uses = usesOf(jobs), dealers: DealerAnswer[] = [];
  for (const [id, dealer] of Object.entries(register.dealers)) {
   const entries: EntryAnswer[] = await Promise.all(dealer.entries.map(async entry => {
    const found = await look(entry), key = entryKey(entry);
    const usedBy = (key ? uses.get(key) ?? [] : []).map(u => ({...u, edge: edgeOf(u.from, u.to)}));
    return {...entry, ...found, fps: found.fps ?? entry.fps ?? null, usedBy};
   }));
   const prefix = dealer.films?.prefix, mine = (list: {id: string}[]) => prefix ? list.filter(j => j.id.startsWith(prefix)).length : 0;
   dealers.push({...dealer, id, entries, bank: {jobs: mine(jobs), derived: prefix ? derived : 0, edits: prefix ? edits : 0}});
  }
  return {schemaVersion: 1, readable: true, revision: revisionOf(text!), problems: [], dealers, measures: register.measures, unassigned: unassigned(register, jobs)};
 }

 /** A file the lab may hand out for the view: named by the register (a picture, a film, or a pattern's picture), inside the repo, no link out. */
 async function servable(file: string): Promise<boolean> {
  if (!isInside(file) || !/\.(?:png|jpe?g|mp4)$/i.test(file)) return false;
  const {register} = await readRegister();
  if (!register || !Object.values(register.dealers).some(d => d.entries.some(e => e.path === file))) return false;
  return confined(file);
 }

 /**
  * Adds a picture: checks it, keeps it with a receipt in its own new folder, and gives it a role in the register (as a
  * candidate). A folder that exists is never written into. If the register cannot be written, the new folder goes again.
  */
 async function add(input: AddInput) {
  const {dealer, role, name, filename} = input, title = input.title.trim(), now = input.now ?? new Date();
  if (!/^[a-z0-9]+$/.test(dealer)) throw new StoreError(400, 'Okänd dealer.');
  if (!isUploadRole(role)) throw new StoreError(400, 'Rollen ska vara ingångsbild, keystone eller ett ankare.');
  if (!NAME.test(name) || name.length > NAME_LIMIT) throw new StoreError(400, `Namnet får bara ha a–z, 0–9 och bindestreck, högst ${NAME_LIMIT} tecken.`);
  if (!title || title.length > TITLE_LIMIT) throw new StoreError(400, `Skriv ett namn på bilden, högst ${TITLE_LIMIT} tecken.`);
  if (input.type !== 'png' && input.type !== 'jpeg') throw new StoreError(415, 'Bara PNG eller JPEG.');
  if (!input.bytes.length) throw new StoreError(400, 'Bilden är tom.');
  if (input.bytes.length > UPLOAD_LIMIT) throw new StoreError(413, `Bilden är för stor (högst ${UPLOAD_LIMIT / 1048576} MB).`);
  if (sniffImage(input.bytes) !== input.type) throw new StoreError(415, 'Filen är inte den bild den säger sig vara.');
  const size = imageSize(input.bytes);
  if (!size || size.width < 16 || size.height < 16 || size.width > 20000 || size.height > 20000) throw new StoreError(415, 'Bildens storlek gick inte att läsa.');
  const original = path.basename(String(filename ?? '').replaceAll('\\', '/')).slice(0, 200) || 'okänd';
  const target = uploadTarget(dealer, role as UploadRole, name, input.type);
  const task = queue.then(async () => {
   const {text, register, errors} = await readRegister();
   if (!register || !text) throw new StoreError(500, `Registret håller inte: ${errors.join('; ')}`);
   const owner = register.dealers[dealer];
   if (!owner) throw new StoreError(404, 'Dealern finns inte i registret.');
   if (Object.values(register.dealers).some(d => d.entries.some(e => e.id === target.id))) throw new StoreError(409, 'Det finns redan en bild med det namnet. Välj ett annat.');
   const dir = path.join(root, ...target.dir.split('/'));
   await mkdir(path.dirname(dir), {recursive: true});
   try { await mkdir(dir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreError(409, 'Det finns redan en mapp med det namnet. Välj ett annat.');
    throw error;
   }
   try {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex'), day = now.toISOString().slice(0, 10);
    await writeFile(path.join(dir, target.file), input.bytes, {flag: 'wx'});
    const receipt = {
     schemaVersion: 1, id: target.id, dealer, role, name: title, createdAt: now.toISOString(), by: input.who ?? 'Jakob, studions vy Material',
     original: {fileName: original, bytes: input.bytes.length, sha256, width: size.width, height: size.height, type: input.type},
     output: {path: target.path, sha256},
     note: 'Lagd till från studion. Kandidat tills Jakob säger annat.',
    };
    await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    const entry: Entry = {id: target.id, role: role as UploadRole, name: title, path: target.path, ...(nodeOfRole(role) ? {node: nodeOfRole(role)} : {}), state: 'kandidat', note: `${ROLE_LABEL[role as UploadRole]} lagd till i studion ${day}.`, source: {from: `uppladdad: ${original}`, when: day}};
    const next = structuredClone(register);
    next.dealers[dealer].entries.push(entry);
    const out = JSON.stringify(next, null, 2) + '\n';
    if (validateRegister(JSON.parse(out)).errors.length) throw new StoreError(400, 'Bilden gick inte att föra in i registret.');
    await mkdir(path.join(root, '.runtime'), {recursive: true});
    await writeFile(path.join(root, '.runtime/media-roles-previous.json'), text);
    const temporary = path.join(root, 'data', `.${randomUUID()}.tmp`);
    await writeFile(temporary, out, {flag: 'wx'});
    await rename(temporary, registerFile);
    return {entry, receipt, revision: revisionOf(out)};
   } catch (error) {
    await rm(dir, {recursive: true, force: true});
    throw error;
   }
  });
  queue = task.then(() => {}, () => {});
  return task;
 }

 /**
  * Jakob's verdict on a picture from the view Material (PUT /api/media/<id>/state, tools/order-routes.ts): only
  * kandidat → gäller, kandidat → ersatt and gäller → ersatt, against the register's revision as read. Approving a
  * candidate sets the other candidates of the same role, node and card to ersatt. Each changed entry gets a line of who and
  * when (stateBy). The register is rewritten like add() does it.
  */
 async function setState(input: {id: string; state: unknown; expected: string | undefined; who?: string; now?: Date}) {
  const {id, expected} = input, to = input.state, now = input.now ?? new Date(), who = input.who ?? 'Jakob';
  if (to !== 'gäller' && to !== 'ersatt') throw new StoreError(400, 'Tillståndet ska vara gäller eller ersatt.');
  const task = queue.then(async () => {
   const {text, register, errors} = await readRegister();
   if (!register || !text) throw new StoreError(500, `Registret håller inte: ${errors.join('; ')}`);
   if (!expected) throw new StoreError(428, 'Läs materialet innan du ändrar en bild.');
   if (revisionOf(text) !== expected) throw new StoreError(409, 'Registret har ändrats sedan det lästes. Läs om och försök igen.');
   const owner = Object.entries(register.dealers).find(([, d]) => d.entries.some(e => e.id === id));
   if (!owner) throw new StoreError(404, 'Bilden finns inte i registret.');
   const next = structuredClone(register), dealer = next.dealers[owner[0]], entry = dealer.entries.find(e => e.id === id)!;
   if (!isDecidable(entry)) throw new StoreError(400, 'Bara en bild (inte en film eller en provmapp) kan godkännas här.');
   if (!allowed(entry.state, to)) throw new StoreError(409, `${entry.name} är ${entry.state ?? 'utan tillstånd'}: bara kandidat → gäller, kandidat → ersatt och gäller → ersatt.`);
   const replaced = to === 'gäller' ? replacedBy(dealer.entries, entry) : [];
   for (const other of replaced) Object.assign(other, {state: 'ersatt', stateBy: stateLine(who, now, other.state ?? 'kandidat', 'ersatt', `${entry.name} godkändes i Material`)});
   Object.assign(entry, {state: to, stateBy: stateLine(who, now, entry.state!, to)});
   const out = JSON.stringify(next, null, 2) + '\n';
   if (validateRegister(JSON.parse(out)).errors.length) throw new StoreError(400, 'Ändringen gick inte att föra in i registret.');
   await mkdir(path.join(root, '.runtime'), {recursive: true});
   await writeFile(path.join(root, '.runtime/media-roles-previous.json'), text);
   const temporary = path.join(root, 'data', `.${randomUUID()}.tmp`);
   await writeFile(temporary, out, {flag: 'wx'});
   await rename(temporary, registerFile);
   return {entry, replaced: replaced.map(e => ({id: e.id, name: e.name})), revision: revisionOf(out)};
  });
  queue = task.then(() => {}, () => {});
  return task;
 }

 return {answer, servable, add, readRegister, setState};
}
