// The order queue on disk: data/orders/<id>.json (in Git, small, no signed addresses) and the pictures that go out in
// assets/orders/<id>/ (outside Git). Builds a draft from a few choices (create), changes a draft (change), fetches what a
// draft waits for, or the dealer's anchor Jakob has since chosen in Material, and draws its last picture again (refresh),
// and freezes an order on Jakob's click (approve: the order's hash in approval, refused beyond data/order-policy.json).
// The pose picture of a still is a figure cut from the other dealer's anchor: only her dealing forearm, hand, the shoe
// and the card are kept (tools/order-images.ts cutFigure), so that nothing else of her goes out. Nothing of another
// dealer is shown as a stand-in: a picture that waits shows that it waits. The receipt beside the pictures
// (receipt.json) is never written here: only tools/order-put.ts writes it. Same guards as tools/review-store.ts: the
// caller presents the revision it read (If-Match), writes are queued, and a file is replaced through a temporary file
// renamed into place. Routes: tools/order-routes.ts.
import { readFile, writeFile, mkdir, rename, rm, stat, realpath, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { StoreError } from './placement-store.ts';
import { mediaRoles } from './media-roles.ts';
import {
  ANCHOR_NODE, ANCHOR_ROLE, EXTRA_LIMIT, FILE_NAME, FLIP_AXES, MODELS, ORDER_ID, TAKES_MAX,
  checkPolicy, costOf, dayOf, draftProblems, edgeOf, genitive, hashInput, seatWords, shownOf, spentOn, stepOf, summaryOf, validateOrder, waitingOf,
  type Drawn, type FlipAxis, type Order, type OrderAnswer, type OrdersAnswer, type Picture, type Policy, type Receipt, type StepKey, type Waits,
} from '../src/order-model.ts';
import { promptFor } from '../src/order-prompts.ts';
import { CUT, cardTexture, cutFigure, drawCard, pictureBytes, planQuad, pngOf, readPlan, readRgb, type Pt, type Texture } from './order-images.ts';
import type { PlacementPlan } from '../src/placement-model.ts';
import type { Entry, Register } from '../studio/lib/media.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const revisionOf = (text: string) => `"${sha(text)}"`;
export const orderHash = (order: Order) => sha(hashInput(order));

export type DealerInfo = { id: string; name: string; look: string; paused?: string | null };
/**
 * Where the pose of a still comes from: an entry of the register, or a frame of a bank film. keep: the region of the
 * picture that is kept (bank pixels); the rest of the person is filled with green, and what is kept is said in `what`.
 */
export type Source = { entry?: string; path?: string; frame?: number; label?: string; keep?: Pt[]; what?: string };
export type NewOrder = {
  dealer: string;
  step: StepKey;
  target?: string | null;
  flipAxis?: FlipAxis;
  duration?: number;
  resolution?: string;
  takes?: number;
  extra?: string | null;
  /** The register entry a still is made from, or a film starts on (default: the dealer's anchor that holds). */
  base?: string | null;
  pose?: Source | null;
  id?: string;
  title?: string;
  group?: { id: string; label: string } | null;
  notes?: string[];
  createdBy?: string;
};
export type Change = { title?: string; takes?: number; flipAxis?: FlipAxis; extra?: string | null; duration?: number };

/**
 * What is kept of the bank's dealer in a pose figure: her left forearm from about the elbow, its hand, the shoe and the
 * card, in bank pixels. Measured on her pinch and drag pictures (the same arm line): the forearm crosses the cut from
 * (1070, 655) to (1225, 500) at about the elbow, x 1107–1197; her body ends at x 1065 and stays outside, as do her head
 * and other arm.
 */
export const ARM_AT_SHOE: Pt[] = [[1225, 500], [1420, 560], [1730, 600], [1730, 920], [1150, 920], [1070, 655]];
export const POSE_WHAT = 'armen från armbågen, handen, skon och kortet';
/** The label of a pose figure, on the screen "Det här skickas". */
export const POSE_LABEL = 'Pose · bara armen, handen och skon';
/**
 * The pose pictures come from the bank's own dealer, cut down to the arm at the shoe. 2.1: not her anchor (there the
 * fingertips sit at the card's corner by the window's rim, and Paow's earlier pinch copied it as a grip on the rim; Jakob
 * 2026-11-13) but frame 16 of her seat-4 deal that Jakob approved: thumb and forefinger on the card's upper edge, the card
 * drawn a little out of the window. Its shoe lies within 2 px of Paow's (best match dx +1, dy −2 on the shoe's body).
 * 2.2: her anchor, the fingertips flat on the card (the shoe there has an open front and is not copied).
 */
export const POSE: Record<'ANKARE-2.1' | 'ANKARE-2.2', Source> = {
  'ANKARE-2.1': { path: 'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4', frame: 16, label: 'Pamelas giv till plats 4 (godkänd), ruta 16: nypet på kortet, kortet en bit ur fönstret', keep: ARM_AT_SHOE, what: POSE_WHAT },
  'ANKARE-2.2': { entry: 'pamela-slap', label: 'Pamelas ankare 2.2 (godkänt; skon där har öppen front och kopieras inte)', keep: ARM_AT_SHOE, what: POSE_WHAT },
};
/** The centre of a card of the plan in film pixels: where the text says the card lands before the last picture is drawn. */
export const planCentre = (plan: PlacementPlan, target: string) => { const q = planQuad(plan, target); return { x: q.reduce((s, p) => s + p[0], 0) / 4, y: q.reduce((s, p) => s + p[1], 0) / 4 }; };

/** "Paows ankare 1 · kandidat 2", "Paows ankare 2.1": which of the dealer's pictures a draft uses. */
export function anchorWords(dealerName: string, at: string, entry: Pick<Entry, 'name' | 'state'> | null): string {
  const which = !entry || entry.state === 'gäller' ? '' : (/kandidat\s*\d+/i.exec(entry.name)?.[0] ?? entry.state ?? '');
  return `${genitive(dealerName)} ankare ${at}${which ? ` · ${which}` : ''}`;
}

const isPicture = (e: Entry) => !!e.path && (e.frame !== undefined || /\.(?:png|jpe?g)$/i.test(e.path)) && !/^[A-Za-z]:\//.test(e.path);
/** The entry of a role that holds: state gäller, no card on the table, the anchor's node when given. */
export function holding(register: Register, dealer: string, role: string, node?: string): Entry | null {
  return register.dealers[dealer]?.entries.find((e) => e.role === role && e.state === 'gäller' && !e.card && (!node || e.node === node) && isPicture(e)) ?? null;
}
export function entryOf(register: Register, id: string): { dealer: string; entry: Entry } | null {
  for (const [dealer, d] of Object.entries(register.dealers)) { const entry = d.entries.find((e) => e.id === id); if (entry) return { dealer, entry }; }
  return null;
}
/** What a waiting picture waits for, if it holds now. */
export function resolveWaits(register: Register, waits: Waits): Entry | null {
  if (waits.entry) { const found = entryOf(register, waits.entry); return found && found.entry.state === 'gäller' && isPicture(found.entry) ? found.entry : null; }
  if (waits.role) return holding(register, waits.dealer, waits.role, waits.node);
  return null;
}

export type StoreOptions = { now?: () => Date; /** Other pose sources than POSE (tests). */ poses?: Partial<Record<keyof typeof POSE, Source>> };
export function orderStore(root: string, options: StoreOptions = {}) {
  const now = options.now ?? (() => new Date());
  const dir = path.join(root, 'data/orders');
  const folderOf = (id: string) => `assets/orders/${id}`;
  const media = mediaRoles(root);
  let queue: Promise<unknown> = Promise.resolve();
  let texture: Promise<Texture> | null = null;
  const tex = () => (texture ??= cardTexture(root).catch((error) => { texture = null; throw error; }));
  // Hashes of the files on disk, kept while their size and time are the same: the page asks on every read.
  const hashes = new Map<string, { stamp: string; sha256: string }>();

  const fileOf = (id: string) => { if (typeof id !== 'string' || !ORDER_ID.test(id) || id.length > 80) throw new StoreError(400, 'Ogiltigt beställnings-id.'); return path.join(dir, `${id}.json`); };
  const serial = <T>(work: () => Promise<T>): Promise<T> => { const task = queue.then(work); queue = task.then(() => {}, () => {}); return task; };

  async function readJson<T>(file: string): Promise<T | null> { try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return null; } }
  async function readPolicy(): Promise<Policy | null> { const p = await readJson<Policy>(path.join(root, 'data/order-policy.json')); return p?.schemaVersion === 1 && Array.isArray(p.prices) ? p : null; }
  async function readDealers(): Promise<DealerInfo[]> { return (await readJson<{ dealers: DealerInfo[] }>(path.join(root, 'data/dealers.json')))?.dealers ?? []; }
  async function readRegister(): Promise<Register> {
    const { register, errors } = await media.readRegister();
    if (!register) throw new StoreError(500, `Registret håller inte: ${errors.join('; ')}`);
    return register;
  }
  async function readReceipt(id: string): Promise<Receipt | null> { const r = await readJson<Receipt>(path.join(root, folderOf(id), 'receipt.json')); return r?.schemaVersion === 1 ? r : null; }

  async function load(id: string): Promise<{ order: Order; revision: string; text: string }> {
    let text: string;
    try { text = await readFile(fileOf(id), 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError(404, 'Beställningen finns inte.'); throw error; }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new StoreError(422, 'Beställningen är inte giltig JSON.'); }
    const { order, errors } = validateOrder(value);
    if (!order) throw new StoreError(422, `Beställningen håller inte: ${errors.join(' ')}`);
    if (order.id !== id) throw new StoreError(422, 'Beställningens id stämmer inte med filnamnet.');
    return { order, revision: revisionOf(text), text };
  }
  async function write(order: Order) {
    const { errors } = validateOrder(JSON.parse(JSON.stringify(order)));
    if (errors.length) throw new StoreError(400, `Beställningen håller inte: ${errors.join(' ')}`);
    const text = JSON.stringify(order, null, 2) + '\n';
    await mkdir(dir, { recursive: true });
    const temporary = path.join(dir, `.${randomUUID()}.tmp`);
    await writeFile(temporary, text, { flag: 'wx' });
    await rename(temporary, fileOf(order.id));
    return revisionOf(text);
  }
  /** Writes a picture of an order's folder (a draft's own file), through a temporary file. */
  async function put(id: string, name: string, bytes: Buffer) {
    if (!FILE_NAME.test(name)) throw new StoreError(400, `Ogiltigt filnamn ${name}.`);
    const folder = path.join(root, folderOf(id));
    await mkdir(folder, { recursive: true });
    const temporary = path.join(folder, `.${randomUUID()}.tmp`);
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, path.join(folder, name));
    return { path: `${folderOf(id)}/${name}`, sha256: sha(bytes) };
  }
  /** The hash of a file of an order's folder on disk, or null when it is not there (or lies outside through a link). */
  async function hashOnDisk(rel: string): Promise<string | null> {
    const file = path.join(root, ...rel.split('/'));
    const s = await stat(file).catch(() => null);
    if (!s?.isFile()) return null;
    try { if ((await realpath(file)) !== path.join(await realpath(root), ...rel.split('/'))) return null; } catch { return null; }
    const stamp = `${s.size}:${s.mtimeMs}`, known = hashes.get(file);
    if (known?.stamp === stamp) return known.sha256;
    const value = sha(await readFile(file));
    hashes.set(file, { stamp, sha256: value });
    return value;
  }

  async function sourceBytes(register: Register, source: Source): Promise<{ bytes: Buffer; from: NonNullable<Picture['from']> }> {
    if (source.entry) {
      const found = entryOf(register, source.entry);
      if (!found || !isPicture(found.entry)) throw new StoreError(404, `${source.entry} finns inte som bild i registret.`);
      const e = found.entry;
      return { bytes: await pictureBytes(root, { path: e.path!, frame: e.frame }), from: { entry: e.id, path: e.path, ...(e.frame !== undefined ? { frame: e.frame } : {}), note: `${e.name}${e.state ? ` (${e.state})` : ''}` } };
    }
    if (!source.path) throw new StoreError(400, 'Bilden saknar källa.');
    return { bytes: await pictureBytes(root, { path: source.path, frame: source.frame }), from: { path: source.path, ...(source.frame !== undefined ? { frame: source.frame } : {}), note: source.label } };
  }
  async function drawOn(base: Buffer, target: string) {
    const { plan, file } = await readPlan(root);
    const { rgb, drawn } = drawCard(await readRgb(base), await tex(), plan, file, target);
    return { bytes: await pngOf(rgb), drawn };
  }

  // ── Building a draft ───────────────────────────────────────────────────────
  async function nextId(prefix: string): Promise<string> {
    const taken = new Set((await readdir(dir).catch(() => [] as string[])).map((f) => f.replace(/\.json$/, '')));
    for (let n = 1; n < 100; n++) { const id = `${prefix}-${String(n).padStart(2, '0')}`; if (!taken.has(id)) return id; }
    throw new StoreError(409, 'För många beställningar med samma namn.');
  }

  /**
   * The draft's text from its choices: the dealer's look, the step, the motion, and where the card lands: where the last
   * picture draws it, or before that picture exists the plan's own point for the card.
   */
  async function textOf(order: Pick<Order, 'step' | 'motion' | 'generation' | 'pictures' | 'prompt'>, dealer: DealerInfo, extra: string | null) {
    const drawn = order.pictures.find((p) => p.goesAs === 'endFrame')?.drawn ?? null;
    const place = drawn ? { x: drawn.centre[0], y: drawn.centre[1] } : order.motion?.target ? planCentre((await readPlan(root)).plan, order.motion.target) : null;
    const { template, text } = promptFor({
      dealer, step: order.step.key, model: order.generation.model,
      motion: order.motion ? { grip: order.motion.grip, turn: order.motion.turn, flipAxis: order.motion.flipAxis, side: order.motion.side } : null,
      place, extra,
    });
    return { template, text, sha256: sha(text), extra, middle: false };
  }

  async function create(input: NewOrder): Promise<{ order: Order; revision: string }> {
    const step = stepOf(input.step);
    if (!step) throw new StoreError(400, 'Okänt steg.');
    if (step.off) throw new StoreError(400, `${step.label}: ${step.off}`);
    const dealers = await readDealers(), dealer = dealers.find((d) => d.id === input.dealer);
    if (!dealer) throw new StoreError(400, 'Okänd dealer.');
    const policy = await readPolicy();
    if (!policy) throw new StoreError(500, 'data/order-policy.json kunde inte läsas.');
    const register = await readRegister();
    const model = MODELS[step.model];
    const target = step.card ? (input.target ?? null) : null;
    const { plan } = await readPlan(root);
    if (step.card && (!target || !plan.targets[target])) throw new StoreError(400, 'Välj en plats på bordet (P1.C1 … D.C1).');
    const takes = input.takes ?? 2;
    if (!Number.isInteger(takes) || takes < 1 || takes > TAKES_MAX) throw new StoreError(400, `Tagningar ska vara 1–${TAKES_MAX}.`);
    const extra = input.extra?.trim() ? input.extra.trim().slice(0, EXTRA_LIMIT) : null;
    const flipAxis = input.flipAxis ?? 'FREE';
    if (!FLIP_AXES.includes(flipAxis)) throw new StoreError(400, 'Okänd vändning.');
    const seat = target ? target.toLowerCase().replace('.c1', '').replace('.', '-') : null;
    const id = input.id ?? (await nextId([dealer.id, step.key.toLowerCase().replace('.', '-'), seat].filter(Boolean).join('-')));
    if (!ORDER_ID.test(id)) throw new StoreError(400, 'Ogiltigt beställnings-id.');

    // Generation parameters by name, as the tools take them.
    const params: Record<string, string | number | boolean> = {};
    if (step.kind === 'STILL') { params.ratio = step.ratio!; params.imageSize = step.imageSize!; }
    else {
      params.resolution = input.resolution ?? step.resolution ?? '1080p';
      params.duration = input.duration ?? step.duration!;
      if (step.model === 'wan3') { params.ratio = step.ratio ?? 'adaptive'; params.generateAudio = false; }
    }
    const cost = costOf({ model: step.model, params }, takes, policy.prices);
    if (!cost) throw new StoreError(400, `Inget pris för ${model.label} med de här värdena i data/order-policy.json.`);

    const folder = path.join(root, folderOf(id));
    await mkdir(path.dirname(folder), { recursive: true });
    if (await stat(fileOf(id)).catch(() => null)) throw new StoreError(409, 'Det finns redan en beställning med det id:t.');
    try { await mkdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreError(409, 'Mappen för beställningen finns redan.'); throw error; }
    try {
      const pictures: Picture[] = [];
      const notes = [...(input.notes ?? [])];
      const anchorPicture = async (name: string, label: (words: string) => string, goesAs: Picture['goesAs'], at: '1' | '2.1' | '2.2', tag?: string): Promise<{ picture: Picture; bytes: Buffer | null }> => {
        const entry = input.base && at === step.from ? entryOf(register, input.base)?.entry ?? null : holding(register, dealer.id, ANCHOR_ROLE[at], ANCHOR_NODE[at]);
        if (input.base && at === step.from && !entry) throw new StoreError(404, `${input.base} finns inte i registret.`);
        const words = anchorWords(dealer.name, at, entry);
        if (entry) {
          const { bytes, from } = await sourceBytes(register, { entry: entry.id });
          return { picture: { name, label: label(words), goesAs, ...(tag ? { tag } : {}), ...(await put(id, name, bytes)), width: 1764, height: 1174, from, waits: null }, bytes };
        }
        return { picture: { name, label: label(words), goesAs, ...(tag ? { tag } : {}), path: null, sha256: null, from: null, waits: { dealer: dealer.id, role: ANCHOR_ROLE[at], node: ANCHOR_NODE[at], label: `ankare ${at}` } }, bytes: null };
      };

      let motion: Order['motion'] = null;
      if (step.kind === 'FILM') {
        const first = await anchorPicture('first.png', (w) => `Första bild · ${w}`, 'startFrame', step.from);
        pictures.push(first.picture);
        if (step.card) {
          const intent = plan.targets[target!].intent;
          motion = { grip: step.grip ?? 'PINCH', hand: intent.takeHand, turn: intent.turn, flipAxis, target, side: intent.endSide, fromPlan: true };
          // Drawn on the dealer's own anchor only; while it waits, the picture shows that it waits (no other dealer stands in).
          const last: Picture = { name: 'last.png', label: `Sista bild · samma + kortet på ${seatWords(target)}`, goesAs: 'endFrame', path: null, sha256: null, from: { built: `första bilden + kortet ${target} där planen säger` }, waits: first.picture.waits ?? null };
          if (first.bytes) {
            const { bytes, drawn } = await drawOn(first.bytes, target!);
            Object.assign(last, await put(id, 'last.png', bytes), { width: 1764, height: 1174, drawn, waits: null });
          }
          pictures.push(last);
        } else {
          const last = await anchorPicture('last.png', (w) => `Sista bild · ${w}`, 'endFrame', step.to ?? step.from);
          pictures.push(last.picture);
        }
      } else {
        const base = await anchorPicture('anchor.png', (w) => w, 'referenceImage', step.from, 'anchor');
        pictures.push(base.picture);
        const pose = input.pose ?? options.poses?.[step.key as keyof typeof POSE] ?? POSE[step.key as keyof typeof POSE];
        const { bytes, from } = await sourceBytes(register, pose);
        if (pose.keep) {
          // The figure: only the arm at the shoe of the other dealer; the rest of her is the picture's own green.
          const result = cutFigure(await readRgb(bytes), pose.keep);
          const figure = await pngOf(result.rgb);
          pictures.push({
            name: 'pose-figure.png', label: POSE_LABEL, goesAs: 'referenceImage', tag: 'pose', ...(await put(id, 'pose-figure.png', figure)), width: 1764, height: 1174,
            from: { ...from, note: `${pose.label ?? from.note}; allt av henne utom ${pose.what ?? POSE_WHAT} är bortklippt och grönt` }, waits: null,
            cut: { keep: pose.keep.map(([x, y]) => [x, y] as [number, number]), what: pose.what ?? POSE_WHAT, source: { sha256: sha(bytes) }, settings: { ...CUT }, filledPx: result.filledPx, keptPx: result.keptPx, green: result.green },
          });
        } else pictures.push({ name: 'pose.png', label: 'Pose (@pose)', goesAs: 'referenceImage', tag: 'pose', ...(await put(id, 'pose.png', bytes)), width: 1764, height: 1174, from: { ...from, note: pose.label ?? from.note }, waits: null });
      }

      // What the still becomes: a candidate of its role in the register.
      const makes = step.makes ? { role: step.makes.role, label: step.makes.label } : null;
      const edge = edgeOf(step, target);
      const order: Order = {
        schemaVersion: 1,
        id,
        title: input.title ?? `${dealer.name} · ${step.label}${target ? ` · ${seatWords(target)}` : ''}`,
        summary: summaryOf(step, dealer.name, motion),
        group: input.group ?? null,
        dealer: dealer.id,
        kind: step.kind,
        step: { key: step.key, label: step.label, edge, shape: step.kind === 'FILM' ? (step.card ? 'ROUND_TRIP' : 'ONE_WAY') : null, cutInto: step.card && target ? [`${ANCHOR_NODE[step.from]}>${target}`, `${target}>${ANCHOR_NODE[step.from]}`] : [], makes },
        motion,
        pictures,
        reference: { status: 'INGEN', why: step.card ? 'Ingen referensfilm. Mallen som höll hade bankens tur och retur till samma plats som referens; den klipps inte här än.' : 'Ingen referensfilm behövs för steget.' },
        generation: { provider: 'runway-app', tool: model.tool, model: model.id, params },
        prompt: { template: '', text: '', sha256: '', extra, middle: false },
        takes,
        cost,
        limits: { maxCredits: cost.worstTotal, stopBelowCredits: policy.minBalance },
        notes,
        created: now().toISOString(),
        createdBy: input.createdBy ?? 'Jakob, studions vy Beställ',
        approval: null,
        status: 'UTKAST',
      };
      order.prompt = await textOf(order, dealer, extra);
      const revision = await write(order);
      return { order, revision };
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }

  // ── Changing a draft ───────────────────────────────────────────────────────
  function guardDraft(order: Order, revision: string, expected: string | undefined) {
    if (!expected) throw new StoreError(428, 'Läs beställningen innan du ändrar den.');
    if (revision !== expected) throw new StoreError(409, 'Beställningen har ändrats sedan den lästes. Läs om och försök igen.');
    if (order.status !== 'UTKAST' || order.approval) throw new StoreError(409, 'Beställningen är godkänd och kan inte ändras.');
  }

  function validateChange(value: unknown): Change {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreError(400, 'Ändringen ska vara ett objekt.');
    const v = value as Record<string, unknown>, allowed = ['title', 'takes', 'flipAxis', 'extra', 'duration'];
    for (const key of Object.keys(v)) if (!allowed.includes(key)) throw new StoreError(400, `${key} kan inte ändras här (bara ${allowed.join(', ')}).`);
    if (v.title !== undefined && (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 120)) throw new StoreError(400, 'Namnet saknas eller är för långt.');
    if (v.takes !== undefined && (!Number.isInteger(v.takes) || (v.takes as number) < 1 || (v.takes as number) > TAKES_MAX)) throw new StoreError(400, `Tagningar ska vara 1–${TAKES_MAX}.`);
    if (v.flipAxis !== undefined && !FLIP_AXES.includes(v.flipAxis as FlipAxis)) throw new StoreError(400, 'Okänd vändning.');
    if (v.extra !== undefined && v.extra !== null && (typeof v.extra !== 'string' || v.extra.length > EXTRA_LIMIT)) throw new StoreError(400, `Tillägget får vara högst ${EXTRA_LIMIT} tecken.`);
    if (v.duration !== undefined && typeof v.duration !== 'number') throw new StoreError(400, 'Längden ska vara ett tal.');
    return v as Change;
  }

  async function change(id: string, value: unknown, expected: string | undefined) {
    const changes = validateChange(value);
    return serial(async () => {
      const { order, revision } = await load(id);
      guardDraft(order, revision, expected);
      const policy = await readPolicy(), dealer = (await readDealers()).find((d) => d.id === order.dealer);
      if (!policy || !dealer) throw new StoreError(500, 'Policy eller dealer saknas.');
      const next: Order = structuredClone(order);
      if (changes.title !== undefined) next.title = changes.title.trim();
      if (changes.takes !== undefined) next.takes = changes.takes;
      if (changes.flipAxis !== undefined) { if (!next.motion) throw new StoreError(400, 'Steget har ingen vändning.'); next.motion.flipAxis = changes.flipAxis; }
      if (changes.duration !== undefined) { if (next.kind !== 'FILM') throw new StoreError(400, 'En bild har ingen längd.'); next.generation.params.duration = changes.duration; }
      const extra = changes.extra !== undefined ? (changes.extra?.trim() || null) : next.prompt.extra;
      next.prompt = await textOf(next, dealer, extra);
      const cost = costOf(next.generation, next.takes, policy.prices);
      if (!cost) throw new StoreError(400, 'Inget pris för de här värdena.');
      next.cost = cost;
      next.limits = { ...next.limits, maxCredits: cost.worstTotal };
      return { order: next, revision: await write(next) };
    });
  }

  /** Fetches what a draft waits for once it holds in the register, and draws its last picture when the first changed or the plan did. */
  async function refresh(id: string, expected: string | undefined) {
    return serial(async () => {
      const { order, revision } = await load(id);
      guardDraft(order, revision, expected);
      const register = await readRegister(), dealer = (await readDealers()).find((d) => d.id === order.dealer);
      if (!dealer) throw new StoreError(500, 'Dealern saknas i data/dealers.json.');
      const next: Order = structuredClone(order);
      const { file: planFile } = await readPlan(root);
      let firstBytes: Buffer | null = null;
      for (const p of next.pictures) {
        if (!p.waits || p.path) continue;
        const entry = resolveWaits(register, p.waits);
        if (!entry || p.from?.built) continue;
        const { bytes, from } = await sourceBytes(register, { entry: entry.id });
        Object.assign(p, await put(id, p.name, bytes), { from, waits: null, width: 1764, height: 1174 });
        if (p.goesAs === 'startFrame') firstBytes = bytes;
      }
      const first = next.pictures.find((p) => p.goesAs === 'startFrame');
      const last = next.pictures.find((p) => p.goesAs === 'endFrame' && p.from?.built);
      if (first?.path && last && next.motion?.target && (firstBytes || !last.path || last.drawn?.plan.sha256 !== planFile.sha256)) {
        firstBytes ??= await readFile(path.join(root, ...first.path.split('/')));
        const { bytes, drawn } = await drawOn(firstBytes, next.motion.target);
        Object.assign(last, await put(id, 'last.png', bytes), { drawn, waits: null, width: 1764, height: 1174 });
      }
      next.summary = summaryOf(next.step, dealer.name, next.motion);
      next.prompt = await textOf(next, dealer, next.prompt.extra);
      return { order: next, revision: await write(next) };
    });
  }

  // ── Reading ────────────────────────────────────────────────────────────────
  async function balanceNow(policy: Policy | null, receipts: (Receipt | null)[]) {
    let best: { credits: number; at: string; source: string } | null = policy?.balance ?? null;
    for (const r of receipts) for (const t of r?.takes ?? []) {
      if (typeof t.creditsRemainingAfter !== 'number' || !t.requestedAt) continue;
      if (!best || t.requestedAt > best.at) best = { credits: t.creditsRemainingAfter, at: t.requestedAt, source: `kvittot för ${r!.order}, tagning ${t.take}` };
    }
    return best;
  }

  /** The problems that keep an order from being approved, with the files checked on disk. */
  async function problemsOf(order: Order): Promise<string[]> {
    const out = draftProblems(order);
    for (const p of order.pictures) if (p.path && p.sha256) {
      const onDisk = await hashOnDisk(p.path);
      if (onDisk === null) out.push(`${p.label}: filen saknas (${p.path}).`);
      else if (onDisk !== p.sha256) out.push(`${p.label}: filen har ändrats sedan beställningen gjordes.`);
    }
    if (order.prompt.sha256 !== sha(order.prompt.text)) out.push('Textens hash stämmer inte.');
    return out;
  }

  async function answerOf(order: Order, revision: string, register: Register | null, policy: Policy | null, spentToday: number, balance: number): Promise<OrderAnswer> {
    const receipt = await readReceipt(order.id);
    const problems = await problemsOf(order);
    const hash = orderHash(order);
    if (order.approval && order.approval.orderSha256 !== hash) problems.push('Beställningen har ändrats efter godkännandet: den läggs inte.');
    // Warnings are read now, not stored: a dealer's own picture that does not hold (yet), a plan changed since the card was drawn.
    const warnings: string[] = [];
    for (const p of order.pictures) {
      const found = p.from?.entry && register ? entryOf(register, p.from.entry) : null;
      if (!order.approval && found && found.dealer === order.dealer && found.entry.state !== 'gäller') warnings.push(`${p.label}: ${found.entry.name} är ${found.entry.state ?? 'utan tillstånd'}, inte godkänd. Godkänn den i Material först, eller välj en annan.`);
    }
    const { file: planFile } = await readPlan(root).catch(() => ({ file: null }));
    for (const p of order.pictures) if (!order.approval && p.drawn && planFile && p.drawn.plan.sha256 !== planFile.sha256) warnings.push(`${p.label}: planen har ändrats sedan kortet ritades. Hämta bilderna igen.`);
    const waiting = waitingOf(order).map((w) => ({ ...w, ready: !!register && !!resolveWaits(register, w) }));
    const check = !order.approval && policy ? checkPolicy(order, policy, spentToday, balance) : null;
    return { order, revision, hash, shown: shownOf(order, problems, receipt), problems, warnings, waiting, receipt, check };
  }

  async function list(): Promise<OrdersAnswer> {
    const problems: string[] = [];
    const policy = await readPolicy();
    if (!policy) problems.push('data/order-policy.json kunde inte läsas.');
    const register = await media.readRegister().then((r) => r.register);
    const loaded: { order: Order; revision: string }[] = [];
    for (const name of (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort()) {
      const id = name.slice(0, -5);
      if (!ORDER_ID.test(id)) continue;
      try { const { order, revision } = await load(id); loaded.push({ order, revision }); } catch (error) { problems.push(`${name}: ${(error as Error).message}`); }
    }
    const zone = policy?.timeZone ?? 'Europe/Stockholm', date = dayOf(now().toISOString(), zone);
    const spent = spentOn(loaded.map((l) => l.order), date, zone);
    const receipts = await Promise.all(loaded.map((l) => readReceipt(l.order.id)));
    const balance = await balanceNow(policy, receipts);
    const orders = [];
    for (const { order, revision } of loaded) orders.push(await answerOf(order, revision, register, policy, spent, balance?.credits ?? 0));
    // A queue: the oldest first.
    orders.sort((a, b) => (a.order.created < b.order.created ? -1 : a.order.created > b.order.created ? 1 : a.order.id.localeCompare(b.order.id)));
    return { schemaVersion: 1, orders, policy, day: { date, spent, cap: policy?.dailyCapCredits ?? 0 }, balance, problems };
  }

  async function one(id: string): Promise<OrderAnswer> {
    const all = await list();
    const found = all.orders.find((o) => o.order.id === id);
    if (!found) { await load(id); throw new StoreError(404, 'Beställningen finns inte.'); }
    return found;
  }

  // ── Jakob's click ──────────────────────────────────────────────────────────
  /** Freezes a draft: its hash in approval. Refused while anything waits or is missing, and beyond the policy. */
  async function approve(id: string, expected: string | undefined) {
    return serial(async () => {
      const { order, revision } = await load(id);
      guardDraft(order, revision, expected);
      const problems = await problemsOf(order);
      if (problems.length) throw new StoreError(409, problems.join(' '));
      const policy = await readPolicy();
      if (!policy) throw new StoreError(500, 'data/order-policy.json kunde inte läsas.');
      const all = await readdir(dir).catch(() => [] as string[]);
      const others: Order[] = [];
      for (const name of all) { const other = name.endsWith('.json') && ORDER_ID.test(name.slice(0, -5)) ? await load(name.slice(0, -5)).catch(() => null) : null; if (other) others.push(other.order); }
      const at = now().toISOString(), zone = policy.timeZone ?? 'Europe/Stockholm';
      const receipts = await Promise.all(others.map((o) => readReceipt(o.id)));
      const balance = (await balanceNow(policy, receipts))?.credits ?? 0;
      const check = checkPolicy(order, policy, spentOn(others, dayOf(at, zone), zone), balance);
      if (!check.ok) throw new StoreError(403, check.refusals.join(' '));
      const next: Order = { ...order, status: 'GODKÄND', approval: { by: 'jakob', at, orderSha256: orderHash(order) } };
      return { order: next, revision: await write(next), check };
    });
  }

  /** A file of an order's folder, for the lab to hand out: only a picture or film directly in assets/orders/<id>/. */
  async function servable(rel: string): Promise<string | null> {
    const m = /^assets\/orders\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9][a-z0-9._-]*\.(?:png|jpg|mp4))$/.exec(rel);
    if (!m) return null;
    const file = path.join(root, 'assets', 'orders', m[1], m[2]);
    try { if ((await realpath(file)) !== path.join(await realpath(path.join(root, 'assets', 'orders')), m[1], m[2])) return null; } catch { return null; }
    return (await stat(file).then((s) => s.isFile(), () => false)) ? file : null;
  }

  return { list, one, load, create, change, refresh, approve, servable, readReceipt };
}

export type { Drawn, OrderAnswer, OrdersAnswer };
