// Brings one delivered, after-worked take of an order to where Jakob judges it, the same way every time (it replaces
// D:/dealer-scratch/tmp/huvudagent11/look/in-i-banken.mjs and lagg-till-ankare.ts):
//   a film:  1. the clip bank's inbox (tools/register-order.ts; a round trip is split where the hand starts back, --split),
//            2. Material, row Filmer, as a candidate: a copy under assets/films/<dealer>/<name>/ with a receipt, role film,
//               state kandidat, in data/media-roles.json,
//   a still: the after-worked picture into Material as a candidate of the role the order makes (ankare-2.1, ankare-2.2),
//            through the register's own add (tools/media-roles.ts), never as gäller: Jakob approves it there;
//   then, with --prov <proof id>, a copy in that proof folder (assets/proofs/<id>/ with a proof.json); and the receipt's
//   status INFÖRD once the independent reviewer's verdict is on the take (GRANSKAD, or order-put's review), or with
//   --inford when told to without it. A part that is already there is left alone, so it can be run again.
//
//   node tools/order-bring.ts <order> <take> [--split <frame>] [--film <file>] [--name <name>] [--title "<title>"]
//                             [--note "<note>"] [--prov <proof id>] [--inford] [--dry]
// Never writes over a decision of Jakob's (register-order refuses), never sets gäller, never approves anything.
// Tests: tools/order-bring.test.ts.
import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe } from './film-fix.ts';
import { orderTake, OrderError } from './order-collect.ts';
import { planRegistration, register } from './register-order.ts';
import { receipts } from './order-put.ts';
import { mediaRoles } from './media-roles.ts';
import { NAME, NAME_LIMIT, TITLE_LIMIT, validateRegister, type Entry, type Register } from '../studio/lib/media.ts';
import { reviewerNote } from '../studio/lib/ledger.ts';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const posix = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/');
const NOTE_LIMIT = 400;

export type BringOptions = { split?: number; film?: string; name?: string; title?: string; note?: string; proof?: string; inford?: boolean; dry?: boolean; now?: () => Date; who?: string };
export type Brought = { order: string; take: number; kind: 'FILM' | 'STILL'; bank: string[] | null; material: { id: string; done: 'införd' | 'fanns' | 'skulle föras in' } | null; proof: string | null; receipt: string; notes: string[] };

/** The default name of the copy in Material: the order without the dealer in front, and the take ("giv-2-1-p1-05-t1"). */
export function nameOf(order: { id: string; dealer: string }, take: number): string {
  const base = order.id.startsWith(`${order.dealer}-`) ? order.id.slice(order.dealer.length + 1) : order.id;
  return `${base}-t${take}`.slice(0, NAME_LIMIT).replace(/-+$/, '');
}

/** Whether the independent reviewer's verdict is on the take: a GRANSKAD step with a note, or the review kept beside it. */
export function reviewed(take: { history?: unknown; review?: unknown } | null | undefined): string | null {
  return take ? reviewerNote(take.history, take.review) : null;
}

/** A film's entry in Material, role film, as a candidate; the receipt beside the copy says where it came from. */
export function filmEntry(input: { id: string; title: string; path: string; frames: number; fps: number; note: string; order: string; take: number; day: string }): Entry {
  return { id: input.id, role: 'film', name: input.title, path: input.path, still: Math.min(Math.round(input.frames * 0.55), input.frames - 1), fps: input.fps, state: 'kandidat', note: input.note, source: { from: `beställningen ${input.order}, tagning ${input.take} (studions vy Beställ)`, when: input.day } } as Entry;
}

/** Puts a film entry into the register after the dealer's last film, through a temporary file; refused when the register is not in its writer's form or would not hold. */
async function addFilmEntry(root: string, dealer: string, entry: Entry): Promise<'införd' | 'fanns'> {
  const file = path.join(root, 'data', 'media-roles.json');
  const text = await readFile(file, 'utf8');
  const register = JSON.parse(text) as Register;
  if (JSON.stringify(register, null, 2) + '\n' !== text) throw new OrderError('data/media-roles.json är inte i sin skrivares form; inget skrivs.');
  if (Object.values(register.dealers).some((d) => d.entries.some((e) => e.id === entry.id))) return 'fanns';
  const own = register.dealers[dealer];
  if (!own) throw new OrderError(`${dealer} finns inte i data/media-roles.json.`);
  const last = own.entries.map((e) => e.role).lastIndexOf('film');
  own.entries.splice(last + 1, 0, entry);
  const out = JSON.stringify(register, null, 2) + '\n';
  const { errors } = validateRegister(JSON.parse(out));
  if (errors.length) throw new OrderError(`Registret skulle inte hålla: ${errors.join('; ')}`);
  // Read again just before the write: a decision made in Material meanwhile is never written over.
  if ((await readFile(file, 'utf8')) !== text) throw new OrderError('data/media-roles.json ändrades under tiden; kör igen.');
  await mkdir(path.join(root, '.runtime'), { recursive: true });
  await writeFile(path.join(root, '.runtime', 'media-roles-previous.json'), text);
  const temporary = path.join(root, 'data', `.${randomUUID()}.tmp`);
  await writeFile(temporary, out, { flag: 'wx' });
  await rename(temporary, file);
  return 'införd';
}

/** A copy in a proof folder that has a proof.json, labelled and marked unreviewed; left alone when a file of that name is there. */
async function toProof(root: string, proofId: string, name: string, from: string, label: string, dry: boolean): Promise<string> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proofId)) throw new OrderError(`Ogiltigt prov-id: ${proofId}.`);
  const dir = path.join(root, 'assets', 'proofs', proofId), file = path.join(dir, 'proof.json');
  if (!existsSync(file)) throw new OrderError(`assets/proofs/${proofId}/proof.json finns inte.`);
  const proof = JSON.parse(await readFile(file, 'utf8')) as { labels?: Record<string, string>; verdicts?: Record<string, string> };
  proof.labels ??= {}; proof.verdicts ??= {};
  const ext = path.extname(from), had = Object.keys(proof.labels).find((k) => k.endsWith(`-${name}${ext}`));
  if (had) return `assets/proofs/${proofId}/${had}`;
  const target = `${Object.keys(proof.labels).length + 1}-${name}${ext}`;
  if (!dry) {
    await copyFile(from, path.join(dir, target));
    proof.labels[target] = label.slice(0, 300); proof.verdicts[target] = 'unreviewed';
    const temporary = path.join(dir, `.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
  }
  return `assets/proofs/${proofId}/${target}`;
}

/** Brings one take to where Jakob judges it (see the head of this file). */
export async function bring(root: string, id: string, take: number, options: BringOptions = {}): Promise<Brought> {
  const now = options.now ?? (() => new Date());
  const { order, entry, folder } = await orderTake(root, id, take);
  const full = JSON.parse(await readFile(path.join(root, 'data', 'orders', `${id}.json`), 'utf8')) as { title?: string; kind: string; step?: { makes?: { role?: string } | null } };
  if (!entry?.taskId) throw new OrderError(`${id} tagning ${take} är inte lagd (inget task-id i kvittot).`);
  if (['OSÄKER', 'MISSLYCKAD', 'AVBRUTEN', 'LAGD', 'KLAR'].includes(entry.status)) throw new OrderError(`${id} tagning ${take} är ${entry.status}: hämta och efterarbeta den först.`);
  const still = order.kind === 'STILL';
  const after = path.join(folder, `take-${take}`, still ? 'after.png' : 'after.mp4');
  const film = options.film ? path.resolve(root, options.film) : existsSync(after) ? after : path.join(folder, `take-${take}`, still ? 'source.png' : 'source.mp4');
  if (!existsSync(film)) throw new OrderError(`${posix(root, film)} finns inte: efterarbeta tagningen först.`);
  if (!path.resolve(film).startsWith(path.resolve(folder) + path.sep)) throw new OrderError(`Filen ska ligga under assets/orders/${id}/.`);
  const name = options.name ?? nameOf(order, take);
  if (!NAME.test(name) || name.length > NAME_LIMIT) throw new OrderError(`Namnet får bara ha a–z, 0–9 och bindestreck, högst ${NAME_LIMIT} tecken.`);
  const fullReceipt = JSON.parse(await readFile(path.join(folder, 'receipt.json'), 'utf8')) as { takes?: { take: number; history?: unknown; review?: unknown }[] };
  const verdict = reviewed(fullReceipt.takes?.find((t) => t.take === take));
  const title = (options.title ?? `${full.title ?? id}, tagning ${take}`).trim();
  const note = (options.note ?? verdict ?? 'Efterarbetad tagning ur en beställning i studions vy Beställ. Kandidat tills Jakob har dömt.').trim();
  if (note.length > NOTE_LIMIT) throw new OrderError(`Noten är ${note.length} tecken; registret tar högst ${NOTE_LIMIT}.`);
  const out: Brought = { order: id, take, kind: still ? 'STILL' : 'FILM', bank: null, material: null, proof: null, receipt: entry.status, notes: [] };
  const who = options.who ?? `huvudagenten: beställningen ${id}, tagning ${take}, efterarbetad (tools/order-bring.ts)`;

  if (!still) {
    // 1. The bank's inbox, unless this take is there already.
    const bank = JSON.parse(await readFile(path.join(root, 'data', 'clip-jobs.json'), 'utf8')) as { derived?: { id: string; order?: { id?: string; take?: number; fix?: number } }[] };
    const ours = (bank.derived ?? []).filter((d) => d.order?.id === id && d.order.take === take && !d.order.fix).map((d) => d.id);
    if (ours.length) { out.bank = ours; out.notes.push(`Banken: finns redan (${ours.join(', ')}).`); }
    else {
      const plan = await planRegistration(root, id, take, { split: options.split, film });
      if (!options.dry) await register(root, plan);
      out.bank = plan.takes.map((t) => t.id);
      out.notes.push(`Banken: ${options.dry ? 'skulle föras in' : 'införd'} i inkorgen (${out.bank.join(', ')}). ${plan.notes.join(' ')}`.trim());
    }
    // 2. Material, row Filmer, as a candidate.
    const dealer = order.dealer, materialId = `${dealer}-film-${name}`, dir = path.join(root, 'assets', 'films', dealer, name), copy = path.join(dir, 'source.mp4');
    const facts = probe(film), fps = Math.round(facts.rate * 100) / 100;
    const entryOut = filmEntry({ id: materialId, title: title.slice(0, 80), path: posix(root, copy), frames: facts.frames, fps, note, order: id, take, day: now().toISOString().slice(0, 10) });
    const registerText = await readFile(path.join(root, 'data', 'media-roles.json'), 'utf8');
    if (registerText.includes(`"id": "${materialId}"`)) out.material = { id: materialId, done: 'fanns' };
    else if (options.dry) out.material = { id: materialId, done: 'skulle föras in' };
    else {
      if (existsSync(copy) && sha(await readFile(copy)) !== sha(await readFile(film))) throw new OrderError(`En annan film ligger redan i ${posix(root, copy)}.`);
      await mkdir(dir, { recursive: true });
      if (!existsSync(copy)) { const part = `${copy}.${randomUUID()}.part`; await copyFile(film, part); await rename(part, copy); }
      const receipt = {
        schemaVersion: 1, id: materialId, dealer, role: 'film', name: title.slice(0, 80), createdAt: now().toISOString(), by: who,
        original: { path: posix(root, film), sha256: sha(await readFile(film)), order: id, take, delivered: `assets/orders/${id}/take-${take}/source.mp4` },
        output: { path: posix(root, copy), sha256: sha(await readFile(copy)), width: facts.width, height: facts.height, fps, frames: facts.frames },
        note: 'Efterarbetad tagning ur en beställning i studions vy Beställ. Kandidat tills Jakob har dömt.',
      };
      if (!existsSync(path.join(dir, 'receipt.json'))) await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
      out.material = { id: materialId, done: await addFilmEntry(root, dealer, entryOut) };
    }
  } else {
    // A still: a candidate of the role the order makes, through the register's own add.
    const role = full.step?.makes?.role;
    if (!role) throw new OrderError(`${id} säger inte vilken roll bilden får (step.makes).`);
    const materialId = `${order.dealer}-${name}`;
    const { register: reg } = await mediaRoles(root).readRegister();
    if (reg && Object.values(reg.dealers).some((d) => d.entries.some((e) => e.id === materialId))) out.material = { id: materialId, done: 'fanns' };
    else if (options.dry) out.material = { id: materialId, done: 'skulle föras in' };
    else {
      const bytes = new Uint8Array(await readFile(film));
      const done = await mediaRoles(root).add({ dealer: order.dealer, role, name, title: title.slice(0, TITLE_LIMIT), filename: posix(root, film), type: film.endsWith('.png') ? 'png' : 'jpeg', bytes, who, now: now() });
      out.material = { id: done.entry.id, done: 'införd' };
    }
  }
  // 3. The proof of the night, when asked for.
  if (options.proof) out.proof = await toProof(root, options.proof, name, film, `${title}. ${note}`, !!options.dry);
  // 4. INFÖRD, once the reviewer's verdict is on the take, or when told to without it.
  if (entry.status === 'INFÖRD') out.notes.push('Kvittot: redan INFÖRD.');
  else if (!verdict && !options.inford) out.notes.push(`Kvittot står kvar på ${entry.status}: granskarens dom saknas. Efter granskningen: node tools/order-put.ts review ${id} ${take} --note "Oberoende granskare: …", och kör detta igen (eller --inford).`);
  else if (options.dry) out.notes.push('Kvittot: skulle sättas till INFÖRD.');
  else {
    await receipts(root, { now }).advance(id, take, 'INFÖRD', { note: verdict ? 'förd in i banken och Material (tools/order-bring.ts)' : 'förd in före granskningen, på uppdrag (tools/order-bring.ts --inford)' });
    out.receipt = 'INFÖRD';
  }
  return out;
}

// ── On the command line ─────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const [id, take] = args;
  try {
    const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new OrderError('Kör från dealer-katalogen.');
    if (!id || !Number.isInteger(Number(take))) throw new OrderError('Använd: node tools/order-bring.ts <order> <tagning> [--split <ruta>] [--film <fil>] [--name <namn>] [--title "<titel>"] [--note "<not>"] [--prov <prov-id>] [--inford] [--dry]');
    const split = flag('--split');
    const result = await bring(root, id, Number(take), { split: split === undefined ? undefined : Number(split), film: flag('--film'), name: flag('--name'), title: flag('--title'), note: flag('--note'), proof: flag('--prov'), inford: args.includes('--inford'), dry: args.includes('--dry') });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
