// Brings one locally derived film into the clip bank: a film made on this machine from a film of the bank and an anchor
// picture of Material, with no paid generation (tools/python/hands-from-anchor.py: a rest of one set with the hands of
// another set's anchor). It enters as a film ordered through Runway does (tools/register-order.ts), as far as that is true of it.
//   node tools/register-derived.ts <film.mp4> --id <clip-id> --source <clip-id> --anchor <entry-id> --script <file> --operation "<what was done>" [--frames <a>-<b>] [--dry]
//   - <film.mp4> is copied to assets/motions/<clip>/source.mp4 with generation.json beside it: what it is made from (the source
//     clip and the anchor picture with their SHA-256, the script and its SHA-256), 0 credits, when (the film file's own time).
//   - --frames <a>-<b>: the film is a piece of the source, its frames a to b (both counted), as a rest cut where the dealer comes
//     back to the anchor in the middle of a film. The range is written beside the source (localDerivation.sourceFrames). A piece
//     takes the source's step but not a rest's facts (motion.idle: label, weight), which describe the whole movement: set them on
//     the post. Without --frames the film is the whole source, frame for frame.
//   - One derived take in data/clip-jobs.json, the whole film, whose first and last picture are the anchor's file: the film
//     starts and ends on that anchor, so the dealer's trees place it by the anchor and not by its source's (tools/dealer-tree.ts).
//   - One post in the register (tools/register-store.ts): the motion as the source's (kind, from, to, pass, basis and a rest's
//     idle: the movement is the source's), review PENDING with review.inbox true, and where the film comes from
//     (localDerivation: sourceClip, sourceSha256, createdAt, credits 0, operation).
// Refused, with nothing written: a clip id that is already in the register, in data/clip-jobs.json or holds another film in
// assets/motions/ (so a take Jakob has decided on is never written over), a source that is no whole film of the bank or whose
// file is not the one its post describes, an anchor that is not the dealer's anchor picture of the node the film starts and
// ends on, a film of another size, length or rate than its source (with --frames: than that range of it). --dry says what would be written.
import {readFile, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {buildGraph, type DerivedTake, type ImageRef} from '../src/clip-graph.ts';
import {probe, sha256File} from './film-fix.ts';
import {decided, inboxReview, register, type Plan} from './register-order.ts';
import {filmOf, motionRegister, type Post} from './register-store.ts';

export class DerivedError extends Error {}
export type Derivation = {film: string; id: string; source: string; anchor: string; script: string; operation: string; frames?: [number, number]};

const CLIP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
type SourcePost = {dealer?: string; source?: {path?: string; sha256?: string; width?: number; height?: number; fps?: number; frames?: number; model?: string};
  motion?: {kind?: string; from?: string; to?: string; pass?: boolean; basis?: string; idle?: Record<string, unknown>}};
type MaterialEntry = {id: string; role?: string; node?: string; path?: string};

/** Works out everything a registration writes, and refuses before anything is written. */
export async function planDerived(root: string, o: Derivation): Promise<Plan<DerivedTake>> {
  const rel = (file: string) => path.relative(root, file).split(path.sep).join('/'), inRepo = (file: string) => !rel(file).startsWith('..') && !path.isAbsolute(rel(file));
  if (!CLIP.test(o.id)) throw new DerivedError(`Ogiltigt klipp-id: ${o.id}.`);
  if (!o.operation.trim()) throw new DerivedError('Säg vad som är gjort med filmen (--operation).');
  // The id must be new: nothing that stands in the bank is written over, least of all a take Jakob has decided on.
  const posts = motionRegister(root).posts(), bank = await json(path.join(root, 'data', 'clip-jobs.json')) as {jobs?: {id: string}[]; derived?: DerivedTake[]; edits?: {id: string}[]};
  const there = posts.get(o.id);
  if (there) throw new DerivedError(decided(there as Parameters<typeof decided>[0]) ? `${o.id} har Jakobs beslut: inget skrivs över.` : `${o.id} har redan en post i registret.`);
  if ([...(bank.jobs ?? []), ...(bank.derived ?? []), ...(bank.edits ?? [])].some(x => x?.id === o.id || (x as DerivedTake)?.clip === o.id)) throw new DerivedError(`${o.id} finns redan i data/clip-jobs.json.`);
  // The source: a whole film of the bank, and the file its post describes.
  const from = posts.get(o.source) as SourcePost | undefined, src = from?.source, motion = from?.motion;
  if (!from) throw new DerivedError(`Källan ${o.source} har ingen post i registret.`);
  if (!src?.path || !src.sha256 || filmOf(from as Post) !== o.source || !motion?.kind || !motion.from || !motion.to) throw new DerivedError(`Källan ${o.source} är ingen hel film med ett steg i banken.`);
  const sourceFile = path.join(root, src.path), dealer = String(from.dealer ?? '');
  if (!existsSync(sourceFile)) throw new DerivedError(`Källfilmen ${src.path} finns inte på disken.`);
  const sourceSha = await sha256File(sourceFile);
  if (sourceSha !== src.sha256) throw new DerivedError(`${src.path} är inte den film posten ${o.source} beskriver (SHA-256 skiljer).`);
  // The anchor: the dealer's picture in Material of the node the film starts and ends on.
  const roles = await json(path.join(root, 'data', 'media-roles.json')) as {dealers?: Record<string, {entries?: MaterialEntry[]}>};
  const anchor = roles.dealers?.[dealer]?.entries?.find(e => e.id === o.anchor);
  if (!anchor?.path || !existsSync(path.join(root, anchor.path))) throw new DerivedError(`${o.anchor} är ingen bild för ${dealer} i Material (data/media-roles.json), eller dess fil saknas.`);
  if (!anchor.role?.startsWith('ankare-') || anchor.node !== motion.from || anchor.node !== motion.to) throw new DerivedError(`${o.anchor} (${anchor.role}, ${anchor.node ?? 'utan nod'}) är inte ankaret som ${o.source} börjar och slutar på: filmen går ${motion.from} → ${motion.to}.`);
  const anchorSha = await sha256File(path.join(root, anchor.path));
  // The film and the script that made it.
  const film = path.resolve(root, o.film), script = path.resolve(root, o.script);
  if (!existsSync(film)) throw new DerivedError(`Filmen ${o.film} finns inte.`);
  if (!existsSync(script) || !inRepo(script)) throw new DerivedError(`Skriptet ${o.script} finns inte i repot.`);
  const facts = probe(film), filmSha = await sha256File(film), made = await stat(film), scriptRel = rel(script);
  if (!(facts.frames > 1)) throw new DerivedError(`${o.film} har ${facts.frames} rutor.`);
  // A piece: a range of the source's frames, inside the film and at least two frames long.
  const last = Number(src.frames) - 1, [a, b] = o.frames ?? [0, last];
  if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b > a && b <= last)) throw new DerivedError(`--frames ${a}-${b}: källan ${o.source} har rutorna 0–${last}.`);
  const whole = a === 0 && b === last, range = whole ? '' : ` rutor ${a}–${b}`;
  // The post takes its step from the source, and a whole film also its rest's facts: both hold only for the source's own movement, frame for frame.
  if (facts.width !== src.width || facts.height !== src.height || facts.frames !== b - a + 1 || facts.rate !== src.fps)
    throw new DerivedError(`${o.film} är ${facts.width}×${facts.height}, ${facts.frames} rutor i ${facts.rate} rutor/s; källan ${o.source}${range} är ${src.width}×${src.height}, ${b - a + 1} rutor i ${src.fps}. Filmen är inte ${whole ? 'källans rörelse' : `rutorna ${a}–${b} av källan`} ruta för ruta${whole ? ' (ett stycke av den anges med --frames <a>-<b>)' : ''}.`);
  const dir = path.join(root, 'assets', 'motions', o.id), target = path.join(dir, 'source.mp4');
  if (existsSync(target) && await sha256File(target) !== filmSha) throw new DerivedError(`En annan film ligger redan i ${rel(target)}.`);

  const model = `${src.model ?? 'okänd'} + ${path.basename(script).replace(/\.[^.]+$/, '')}`, createdAt = made.mtime.toISOString(), idle = whole ? motion.idle : undefined, label = typeof idle?.label === 'string' ? idle.label : '';
  const picture: ImageRef = {file: {path: anchor.path, sha256: anchorSha}, note: `Ankaret ${o.anchor} i Material: filmen börjar och slutar på det.`};
  const purpose = `Lokalt härledd ur ${o.source}${range} på ankaret ${o.anchor} (${scriptRel})${label ? `: ${label}` : ''}.`, pieceOf = whole ? {} : {sourceFrames: [a, b]};
  const take: DerivedTake = {id: o.id, kind: motion.kind, from: motion.from, to: motion.to, clip: o.id, frames: [0, facts.frames - 1], purpose, dealer, model,
    duration: Math.round(facts.frames / facts.rate * 1000) / 1000, first: picture, last: picture};
  const output = {path: rel(target), sha256: filmSha, bytes: made.size, width: facts.width, height: facts.height, fps: facts.rate, frames: facts.frames};
  const record = {schemaVersion: 1, id: o.id, dealer, source: {...output, provider: scriptRel, model},
    motion: {kind: motion.kind, from: motion.from, to: motion.to, ...(typeof motion.pass === 'boolean' ? {pass: motion.pass} : {}), ...(motion.basis ? {basis: motion.basis} : {}), ...(idle ? {idle: structuredClone(idle)} : {})},
    review: inboxReview(`lokalt härledd ur ${o.source}${range} med ${scriptRel} (tools/register-derived.ts)`),
    localDerivation: {sourceClip: o.source, sourceSha256: sourceSha, ...pieceOf, createdAt, credits: 0, operation: o.operation.trim()},
    postProcessing: scriptRel, generationRef: `assets/motions/${o.id}/generation.json`, jobRef: 'data/clip-jobs.json', scoutIntegrated: false, published: false};
  const generation = {schemaVersion: 1, id: o.id, edges: [`${motion.from}>${motion.to}`], takes: [o.id], dealer, purpose, status: 'SUCCEEDED', provider: scriptRel, endpoint: scriptRel, model,
    estimatedCredits: 0, appCredits: 0, creditNote: 'Gjord lokalt ur en film i banken: kostade inga krediter.', first: picture, last: picture,
    derivation: {sourceClip: o.source, source: {path: src.path, sha256: sourceSha}, ...pieceOf, anchor: {entry: o.anchor, path: anchor.path, sha256: anchorSha}, script: {path: scriptRel, sha256: await sha256File(script)},
      operation: o.operation.trim(), credits: 0, createdAt},
    output: {...output, codec: facts.codec, audio: facts.audio}};
  return {clip: o.id, takes: [take], records: {[o.id]: record}, files: {copy: existsSync(target) ? null : [film, target], generation: [path.join(dir, 'generation.json'), generation]}, notes: []};
}

if (import.meta.main) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const o = {film: args[0]?.startsWith('--') ? undefined : args[0], id: flag('--id'), source: flag('--source'), anchor: flag('--anchor'), script: flag('--script'), operation: flag('--operation')};
  const range = flag('--frames'), frames = range === undefined ? undefined : /^\d+-\d+$/.test(range) ? range.split('-').map(Number) as [number, number] : null;
  if (Object.values(o).some(v => !v) || frames === null) { console.error('Användning: node tools/register-derived.ts <film.mp4> --id <klipp-id> --source <källklipp> --anchor <post i Material> --script <skript> --operation "<vad som är gjort>" [--frames <a>-<b>] [--dry]'); process.exit(1); }
  try {
    const root = process.cwd(), dry = args.includes('--dry'), plan = await planDerived(root, {...o, ...(frames ? {frames} : {})} as Derivation), rel = (file: string) => path.relative(root, file).split(path.sep).join('/');
    if (!dry) await register(root, plan);
    const take = plan.takes[0], [generationFile, generation] = plan.files.generation, summary = {written: !dry, clip: plan.clip, dealer: take.dealer, edge: `${take.from}>${take.to}`, frames: take.frames, ...(frames ? {sourceFrames: frames} : {})};
    // Dry: everything that would be written. Written: what the dealer's graph now makes of it.
    if (dry) console.log(JSON.stringify({...summary, files: {film: plan.files.copy ? plan.files.copy.map(rel) : 'ligger redan där', generation: rel(generationFile)}, generation, take, post: plan.records[plan.clip]}, null, 2));
    else { const bank = await json(path.join(root, 'data', 'clip-jobs.json')); console.log(JSON.stringify({...summary, placed: !!buildGraph({jobs: bank.jobs, derived: bank.derived, edits: bank.edits}, {dealer: take.dealer}).takes[take.id], next: [`node tools/dealer-tree.ts --dealer ${take.dealer}`]}, null, 2)); }
  } catch (error) {
    if (error instanceof DerivedError) { console.error(error.message); process.exit(2); }
    throw error;
  }
}
