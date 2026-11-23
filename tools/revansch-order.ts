// A revansch on a nearly good take (Jakob 2026-11-23, BESKED "Revansch på nästan bra klipp" and "Nya filmer: snabbare och
// bättre, inte kopior"): a new draft born from the delivered order it remakes, the same in everything — pictures, reference
// film, model, text — except that the take's own film goes with the call as the last reference video (video 2 after the
// order's reference film, or video 1 where it had none), and the text says what the remake keeps and the faults it fixes,
// in --fix sentences written for the model. A predecessor on a model that takes no reference films (a WAN 3 vila) is
// remade on the model --modell names instead, its params rebuilt with paramsOf.
//
//   node tools/revansch-order.ts <order-id> <take> --fix "<English sentence>" [--fix "<another>"] [--modell kling-4] [--dry]
//
// It makes a draft only: nothing here approves, places or pays (tools/order-approve.ts, tools/order-put.ts). The take's
// untouched original (take-<n>/source.mp4) is copied as assets/orders/<new>/forra.mp4; every copied file is checked
// against its recorded hash. --dry names what would be made and makes nothing.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, costOf, lengthFor, paramsOf, stepOf, validateOrder, type Order, type Price, type Revansch } from '../src/order-model.ts';

export class RevanschError extends Error {}

/** What the text says of the previous film (video n): keep what it did well, be plainly better, then the --fix sentences. */
export const revanschSentences = (fixes: string[], n = 2) =>
  `Video ${n} shows her earlier take of this same film: it was nearly right. Make the same film again, not an identical copy but plainly better. Keep what video ${n} does well: her manner and the framing stay as in video ${n}, and her body stays as still. ${fixes.join(' ')}`;

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

export type RevanschPlan = { id: string; of: { order: string; take: number }; title: string; folder: string; forraSeconds: number; sentences: string };

/** The draft: the predecessor copied with a new id, the take's film beside it as forra.mp4, and the revansch text appended. */
export function revanschOrder(root: string, predId: string, take: number, fixes: string[], options: { dry?: boolean; model?: string } = {}): Record<string, unknown> {
  if (!fixes.length || fixes.some((f) => !f.trim())) throw new RevanschError('Minst en --fix "<mening på engelska>" krävs: vad som görs bättre.');
  const predFile = path.join(root, 'data', 'orders', `${predId}.json`);
  if (!existsSync(predFile)) throw new RevanschError(`Beställningen ${predId} finns inte (data/orders/${predId}.json).`);
  const read = validateOrder(json(predFile));
  if (!read.order) throw new RevanschError(`${predId} går inte att läsa som beställning: ${read.errors[0]}`);
  const pred = read.order;
  if (pred.kind !== 'FILM') throw new RevanschError(`${predId} är en stillbild; en revansch görs bara på en film.`);
  if (pred.reference.status === 'SAKNAS') throw new RevanschError(`${predId} har referensfilmen SAKNAS: välj en eller ingen först.`);
  // With a reference film the previous take is video 2; without one it is the only video, video 1 (Jakobs vila-exempel 2026-11-24).
  const ref = pred.reference.status === 'FINNS' ? pred.reference : null;
  if (pred.revansch?.of) throw new RevanschError(`${predId} är själv en revansch på ${pred.revansch.of.order}: gör revanschen på en tagning av ${predId} i stället, så förra filmen är den senaste.`);
  if (!Number.isInteger(take) || take < 1 || take > pred.takes) throw new RevanschError(`${predId} har tagning 1–${pred.takes}, inte ${take}.`);

  // The take's delivered original, as order-collect fetched and recorded it.
  const fetchedFile = path.join(root, 'assets', 'orders', predId, `take-${take}`, 'fetched.json');
  if (!existsSync(fetchedFile)) throw new RevanschError(`${predId} tagning ${take} är inte hämtad (ingen fetched.json): hämta den först (tools/order-collect.ts).`);
  const fetched = json(fetchedFile) as { file?: { path?: string; sha256?: string }; film?: { frames?: number; fps?: string } };
  const sourcePath = fetched.file?.path, sourceSha = fetched.file?.sha256;
  const [fn, fd] = String(fetched.film?.fps ?? '').split('/').map(Number);
  const rate = fn && (fd || 1) ? fn / (fd || 1) : NaN;
  const seconds = Math.round(((Number(fetched.film?.frames) || 0) / rate) * 100) / 100;
  if (!sourcePath || !sourceSha || !(seconds > 0)) throw new RevanschError(`${predId} tagning ${take}: fetched.json saknar fil, hash eller filmens längd.`);

  // A new name each time: a film made again gets a new id, and the id says whose revansch it is.
  let id: string | null = null;
  for (let n = 1; n <= 9; n++) {
    const name = `${predId}-revansch-${n}`;
    if (!existsSync(path.join(root, 'data', 'orders', `${name}.json`)) && !existsSync(path.join(root, 'assets', 'orders', name))) { id = name; break; }
  }
  if (!id) throw new RevanschError(`${predId} har redan nio revanscher.`);
  const sentences = revanschSentences(fixes.map((f) => f.trim()), ref ? 2 : 1);
  const title = `${pred.title} · revansch`;
  if (title.length > 120) throw new RevanschError('Titeln blir för lång (över 120 tecken).');
  // A predecessor on a model that takes no reference films (a WAN 3 vila) is remade on the model --modell names.
  let generation = pred.generation;
  if (!MODELS[generation.model]?.videos) {
    if (!options.model) throw new RevanschError(`${predId} gjordes med ${generation.model}, som inte tar någon referensfilm: ange --modell (en modell som tar referensfilm, t.ex. kling-4).`);
    const m = MODELS[options.model];
    if (!m || m.tool !== 'generate_video' || !m.videos) throw new RevanschError(`--modell ${options.model}: okänd modell, eller en som inte tar referensfilm.`);
    const def = stepOf(pred.step.key);
    if (!def) throw new RevanschError(`${predId}: steget ${pred.step.key} är okänt.`);
    const duration = lengthFor(m, Number(pred.generation.params.duration) || (m.durations?.[0] ?? 0));
    generation = { provider: 'runway-app', tool: 'generate_video', model: m.id, params: paramsOf(def, m, { duration, resolution: typeof pred.generation.params.resolution === 'string' ? pred.generation.params.resolution : null }) };
  }
  // Every film that goes with the call is paid for, so the cost is counted anew, never copied.
  const prices = (json(path.join(root, 'data', 'order-policy.json')) as { prices?: Price[] }).prices ?? [];
  const cost = costOf(generation, pred.takes, prices, (ref?.seconds ?? 0) + seconds);
  if (!cost) throw new RevanschError('Revanschen kan inte prissättas: prisraden i data/order-policy.json saknar perInputSecond (krediter per sekund indatafilm utöver filmens längd) för modellen.');
  const folder = path.join(root, 'assets', 'orders', id);
  const plan: RevanschPlan = { id, of: { order: predId, take }, title, folder, forraSeconds: seconds, sentences };
  if (options.dry) return { ok: true, dry: true, ...plan, cost };

  // Copy the predecessor's files and the take's film, each checked against its recorded hash before anything is written.
  const copies: { from: string; name: string; sha256: string }[] = [
    ...pred.pictures.filter((p) => p.path && p.sha256).map((p) => ({ from: p.path!, name: p.name, sha256: p.sha256! })),
    ...(ref ? [{ from: ref.path, name: ref.path.split('/').pop()!, sha256: ref.sha256 }] : []),
    { from: sourcePath, name: 'forra.mp4', sha256: sourceSha },
  ];
  mkdirSync(folder, { recursive: true });
  try {
    for (const c of copies) {
      const from = path.join(root, ...c.from.split('/'));
      if (!existsSync(from)) throw new RevanschError(`${c.from} finns inte på disken.`);
      if (sha(readFileSync(from)) !== c.sha256) throw new RevanschError(`${c.from} är inte filen som beställningen bokförde (sha256 skiljer).`);
      copyFileSync(from, path.join(folder, c.name));
    }
    const text = `${pred.prompt.text} ${sentences}`;
    const revansch: Revansch = { of: { order: predId, take }, path: `assets/orders/${id}/forra.mp4`, sha256: sourceSha, seconds, fixes: fixes.map((f) => f.trim()) };
    const { summaryCorrections: _corr, setAside: _aside, ...kept } = pred;
    const order: Order = {
      ...kept,
      id,
      title,
      pictures: pred.pictures.map((p) => (p.path ? { ...p, path: `assets/orders/${id}/${p.name}` } : p)),
      reference: ref ? { ...ref, path: `assets/orders/${id}/${ref.path.split('/').pop()!}` } : pred.reference,
      revansch,
      generation,
      // extra stays the predecessor's: the revansch sentences live in the text and in revansch.fixes (revanschSentences is the frame).
      prompt: { ...pred.prompt, text, sha256: sha(text) },
      cost,
      limits: { ...pred.limits, maxCredits: cost.worstTotal },
      notes: [...pred.notes,
        `Revansch på ${predId} tagning ${take} (BESKED 2026-11-23 "Revansch på nästan bra klipp"): tagningens film är video ${ref ? 2 : 1}, texten säger vad som behålls och vad som görs bättre.`,
        ...(generation !== pred.generation ? [`Modellbyte för revanschen: ${pred.generation.model} tar ingen referensfilm, så den görs med ${generation.model}.`] : [])],
      created: new Date().toISOString(),
      createdBy: 'tools/revansch-order.ts',
      approval: null,
      status: 'UTKAST',
    };
    const checked = validateOrder(JSON.parse(JSON.stringify(order)));
    if (!checked.order) throw new RevanschError(`Utkastet håller inte: ${checked.errors.join(' ')}`);
    writeFileSync(path.join(root, 'data', 'orders', `${id}.json`), JSON.stringify(order, null, 2) + '\n');
    return { ok: true, dry: false, id, title, of: plan.of, forraSeconds: seconds, cost: order.cost, fixes: revansch.fixes, next: [`node tools/order-approve.ts ${id}`, `node tools/order-put.ts check ${id}`] };
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  try {
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new RevanschError('Kör från dealer-katalogen.');
    const args = process.argv.slice(2), fixes: string[] = [];
    for (let i = 0; i < args.length; i++) if (args[i] === '--fix') fixes.push(args[++i] ?? '');
    const at = args.indexOf('--modell'), model = at >= 0 ? args[at + 1] : undefined;
    const plain = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--fix' && !(at >= 0 && i === at + 1));
    if (plain.length !== 2 || (at >= 0 && !model)) throw new RevanschError('Använd: node tools/revansch-order.ts <order-id> <tagning> --fix "<mening>" [--fix ...] [--modell kling-4] [--dry]');
    console.log(JSON.stringify(revanschOrder(root, plain[0], Number(plain[1]), fixes, { dry: args.includes('--dry'), model }), null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
