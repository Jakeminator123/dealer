// The order queue on disk: data/orders/<id>.json (in Git, small, no signed addresses) and the pictures that go out in
// assets/orders/<id>/ (outside Git). Builds a draft from a few choices (create), changes a draft (change), fetches what a
// draft waits for, or the dealer's anchor Jakob has since chosen in Material, and draws its last picture again (refresh),
// and freezes an order on Jakob's click (approve: the order's hash in approval, refused beyond data/order-policy.json).
// The pose picture of a still is a figure cut from the other dealer's picture: only her dealing forearm, hand, the shoe
// and the card are kept (tools/order-images.ts cutFigure), or for anchor 2.2 only her forearm and hand, laid on the
// dealer's own shoe and card from the anchor (poseOnShoe), so that nothing else of her goes out. Nothing of another
// dealer is shown as a stand-in: a picture that waits shows that it waits. The receipt beside the pictures
// (receipt.json) is never written here: only tools/order-put.ts writes it. Same guards as tools/review-store.ts: the
// caller presents the revision it read (If-Match), writes are queued, and a file is replaced through a temporary file
// renamed into place. Routes: tools/order-routes.ts.
//
// A film is made with its step's own model unless another that can make it is asked for (modelsFor in src/order-model.ts:
// first and last picture); its parameters are the model's (paramsOf), as the sheet shows them.
// A deal's choices (which hand, handbyte, how the card lands and turns) come with the new draft and default to what the
// plan says for the card; the last picture draws the card closed or open as chosen. "Alla sju" makes one draft per seat
// sharing a group (createMany). A draft follows Jakob's choice in Material: when another anchor of the same role holds
// than the one a draft was made from, refresh copies the one that holds and keeps what the picture was (picture.replaced),
// and follow(dealer) does that for every draft of the dealer after a decision in Material. Every picture's owner is read
// from its source, and a whole picture of another dealer in a dealer's draft keeps it from being approved.
//
// The hole card's turn (HALKORT) draws only the hole card on both its pictures from her anchor 1 (cardPictures), closed and
// then open, anew on every refresh: the game draws every lying card itself, and with both dealer cards in the pictures the
// film lifted both. A deal to D.C2 (her hole card) is a deal like any other and lands closed as the plan says.
//
// Template 4 (2026-11-13): a new film draft is written in the short text unless another style is asked for (prompt.style);
// a draft without a style was written before and is Utförlig, and keeps its text. A return starts on the seat's landing
// picture and a deal "bara dit" ends on it (a register entry, role landning, that holds); where none holds, the draft is
// refused with what is missing. A reference film is a take of the bank (referenceCandidates), copied into the order's
// folder with its hash like the pictures; another dealer's film is allowed there and named.
import { readFile, writeFile, mkdir, rename, rm, stat, realpath, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { StoreError } from './placement-store.ts';
import { mediaRoles } from './media-roles.ts';
import {
  ANCHOR_NODE, ANCHOR_ROLE, CARD_SCALES, EXTRA_LIMIT, MODELS, FILE_NAME, FLIP_AXES, ORDER_ID, SEAT_TARGETS, TAKES_MAX, scaleWords,
  bodyLine, checkPolicy, costOf, crossesBody, cutIntoOf, tidyMotion, dayOf, defaultFlip, defaultStyle, draftProblems, edgeOf, genitive, hashInput, landingMissing, landingOf, modelFor, modelsFor, paramsOf, referenceCandidates, seatList, seatWords, secondsWords, shownOf, spentOn, stepOf, stylesFor, summaryOf, validateOrder, waitingOf,
  type BankFacts, type Drawn, type FlipAxis, type Motion, type Order, type OrderAnswer, type OrdersAnswer, type Owner, type Picture, type PlanAnswer, type Policy, type PoseAnswer, type Receipt, type Reference, type SeatPlan, type Shape, type StepDef, type StepKey, type TextStyle, type Waits,
} from '../src/order-model.ts';
import { orderPrompt } from '../src/order-prompts.ts';
import { CUT, LAY, armAlone, cardTexture, cutFigure, drawCard, drawCards, matchGreen, pictureBytes, planQuad, pngOf, poseOnShoe, readPlan, readRgb, type CardOutline, type Pt, type Texture } from './order-images.ts';
import type { PlacementPlan } from '../src/placement-model.ts';
import type { Entry, Register } from '../studio/lib/media.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const revisionOf = (text: string) => `"${sha(text)}"`;
export const orderHash = (order: Order) => sha(hashInput(order));
const r1 = (v: number) => Math.round(v * 10) / 10;

export type DealerInfo = { id: string; name: string; look: string; paused?: string | null; films?: { prefix?: string } };
/**
 * Where the pose of a still comes from: an entry of the register, or a frame of a bank film. keep: the region of the
 * picture that is kept (bank pixels); the rest of the person is filled with green, and what is kept is said in `what`.
 * lay: only the forearm and hand are kept (`sleeve`: where black is her sleeve and not the shoe) and laid on the dealer's
 * own anchor cut down to her shoe and card (`shoe`), moved so that the fingertips lie on her card (order-images.ts poseOnShoe).
 */
export type Source = { entry?: string; path?: string; frame?: number; label?: string; keep?: Pt[]; what?: string; lay?: { sleeve: Pt[]; shoe: Pt[] } };
/** One seat of a new deal: its card, and the choices that differ from the plan (absent: what Placering says). */
export type SeatChoice = { target: string; hand?: 'LH' | 'RH'; pass?: boolean; side?: 'FRONT' | 'BACK' };
export type NewOrder = {
  dealer: string;
  step: StepKey;
  target?: string | null;
  /** The hand that takes the card, handbyte (left to right), and how the card lands; absent: the plan's. */
  hand?: 'LH' | 'RH';
  pass?: boolean;
  side?: 'FRONT' | 'BACK';
  /** Several seats at once ("Alla sju"): one draft per seat, sharing a group (createMany). */
  seats?: SeatChoice[];
  flipAxis?: FlipAxis;
  /** The model, when not the step's own (modelsFor: a film can be made by every model that takes a first and a last picture). */
  model?: string;
  duration?: number;
  resolution?: string;
  takes?: number;
  extra?: string | null;
  /** The register entry a still is made from, or a film starts on (default: the dealer's anchor that holds). */
  base?: string | null;
  pose?: Source | null;
  /** The text's style (default: Kort for a film; a still has one text). */
  style?: TextStyle;
  /** A deal: tur och retur (default) or bara dit, ending on the seat's landing picture. */
  shape?: Shape;
  /** A reference film: the bank's take (referenceCandidates), for a model that takes one; absent or null: none. */
  reference?: string | null;
  /** The card's size on the last picture of a round trip, as a factor of the plan's (CARD_SCALES; a trial); absent: 1. */
  cardScale?: number;
  id?: string;
  title?: string;
  group?: { id: string; label: string } | null;
  notes?: string[];
  createdBy?: string;
};
export type Change = { title?: string; takes?: number; flipAxis?: FlipAxis; extra?: string | null; duration?: number; hand?: 'LH' | 'RH'; pass?: boolean; side?: 'FRONT' | 'BACK' };

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
 * Only the forearm and hand of the bank's dealer in her anchor 2.2 (frame 112 of pamela-ready-b-shoe-plate-01), in bank
 * pixels. ARM_ALONE: where the arm may be, cut at the elbow as ARM_AT_SHOE; skin in it is arm, the shoe and the card under
 * the hand are not. SLEEVE_AT_SHOE: where black in it is her sleeve: along the cuff's own edge against the shoe (x 1350 at
 * y 706–725, 1338 at y 742; measured 2026-11-13), above the shoe's top edge and the back of her hand.
 */
export const ARM_ALONE: Pt[] = [[1225, 500], [1440, 560], [1440, 890], [1170, 890], [1150, 712], [1070, 655]];
export const SLEEVE_AT_SHOE: Pt[] = [[1225, 500], [1440, 560], [1360, 690], [1350, 706], [1349, 725], [1344, 734], [1338, 742], [1300, 750], [1215, 752], [1150, 712], [1070, 655]];
/** The shoe and its card in a dealer's anchor (the bank's shoe stands at the same place for every dealer): off her sleeve and hand. */
export const SHOE_AT_ANCHOR: Pt[] = [[1182, 930], [1182, 818], [1300, 700], [1480, 610], [1730, 560], [1730, 930]];
export const POSE_ARM_WHAT = 'armen från armbågen och handen';
/**
 * The pose pictures come from the bank's own dealer, cut down to the arm at the shoe. 2.1: not her anchor (there the
 * fingertips sit at the card's corner by the window's rim, and Paow's earlier pinch copied it as a grip on the rim; Jakob
 * 2026-11-13) but frame 16 of her seat-4 deal that Jakob approved: thumb and forefinger on the card's upper edge, the card
 * drawn a little out of the window. Its shoe is the window shoe, within 2 px of Paow's (best match dx +1, dy −2 on the
 * shoe's body), and the card is part of the grip, so it is kept as it is. 2.2: her anchor, the fingertips flat on the
 * card; its shoe has an open front and taught the model a wrong shoe (paow-ankare-2-2, 2026-11-13), so only her forearm
 * and hand are kept and laid on the dealer's own shoe and card from the anchor the still is made from.
 */
export const POSE: Record<'ANKARE-2.1' | 'ANKARE-2.2', Source> = {
  'ANKARE-2.1': { path: 'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4', frame: 16, label: 'Pamelas giv till plats 4 (godkänd), ruta 16: nypet på kortet, kortet en bit ur fönstret', keep: ARM_AT_SHOE, what: POSE_WHAT },
  'ANKARE-2.2': { entry: 'pamela-slap', label: 'armen och handen ur Pamelas ankare 2.2 (godkänt), lagda på dealerns egen sko ur ankaret', keep: ARM_ALONE, what: POSE_ARM_WHAT, lay: { sleeve: SLEEVE_AT_SHOE, shoe: SHOE_AT_ANCHOR } },
};
/**
 * The centre of a card of the plan in film pixels, to a tenth as the drawn card keeps it (drawn.centre): where the text
 * says the card lands before the last picture is drawn, and where the sheet's preview says it lands.
 */
export const planCentre = (plan: PlacementPlan, target: string) => { const q = planQuad(plan, target); return { x: r1(q.reduce((s, p) => s + p[0], 0) / 4), y: r1(q.reduce((s, p) => s + p[1], 0) / 4) }; };

/** The plan's cards as an order sees them: centre and outline in film pixels, what Placering says, and the crossing rule. */
export function planAnswerOf(plan: PlacementPlan, file: { path: string; sha256: string }): PlanAnswer {
  const centres: Record<string, [number, number]> = {}, quads: Record<string, [number, number][]> = {};
  for (const target of Object.keys(plan.targets)) {
    const q = planQuad(plan, target), c = planCentre(plan, target);
    quads[target] = q.map(([x, y]) => [r1(x), r1(y)]);
    centres[target] = [c.x, c.y];
  }
  const line = bodyLine(centres, quads), seats: Record<string, SeatPlan> = {};
  for (const [target, t] of Object.entries(plan.targets)) {
    const i = t.intent;
    seats[target] = { target, centre: centres[target], quad: quads[target], side: i.endSide, startSide: i.startSide, hand: i.takeHand, pass: i.pass, grip: i.grip ?? 'PINCH', turnAt: i.turnAt ?? 'AIR', crosses: crossesBody(centres[target][0], line) };
  }
  return { path: file.path, sha256: file.sha256, updatedAt: plan.updatedAt, ...line, seats };
}
/** Whether a deal's hand and side are what Placering says for its card. */
const fromPlanOf = (plan: PlacementPlan, m: Pick<Motion, 'target' | 'hand' | 'pass' | 'side'>) => {
  const i = m.target ? plan.targets[m.target]?.intent : null;
  return !!i && i.takeHand === m.hand && i.pass === !!m.pass && i.endSide === m.side;
};

/** The anchor ("1", "2.1", "2.2") an anchor role stands for. */
const ANCHOR_OF: Record<string, '1' | '2.1' | '2.2'> = { 'ankare-1': '1', 'ankare-2.1': '2.1', 'ankare-2.2': '2.2' };
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
/** Why a draft has no reference film, in words of today (rewritten with the draft; the screen computes its own). */
export const noReferenceWhy = (model: string) => (MODELS[model]?.videos ? 'Ingen referensfilm vald.' : `${MODELS[model]?.label ?? model} tar ingen referensfilm tillsammans med första och sista bild.`);
/** Only the dealers data/dealers.json knows can be ordered for (the register may hold others, such as a separate track). */
export const unknownDealer = (id: unknown) =>
  `${typeof id === 'string' && id ? id.slice(0, 40) : 'Dealern'} finns inte i data/dealers.json, så inget kan beställas för henne här.`;
/** A seat's landing picture that holds (role landning, LAND(<seat>), gäller, the card on that seat), as a picture. */
export function landingEntry(register: Register, dealer: string, target: string | null): Entry | null {
  const found = landingOf(register.dealers[dealer]?.entries ?? [], target);
  return found && isPicture(found) ? found : null;
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

/**
 * What a draft's anchor picture should follow now: the entry it was made from (an anchor of the draft's own dealer, no
 * card), and the entry of that role that holds now when it is another one, or the same one approved since (only its name
 * in the label changes). Null when nothing has changed or the picture is not a dealer's anchor.
 */
export function followOf(register: Register, dealer: string, picture: Pick<Picture, 'from' | 'waits' | 'path' | 'label'>, dealerName: string): { was: Entry; now: Entry; at: '1' | '2.1' | '2.2'; swap: boolean } | null {
  if (picture.from?.built || !picture.from?.entry || !picture.path) return null;
  const found = entryOf(register, picture.from.entry);
  if (!found || found.dealer !== dealer || found.entry.card) return null;
  const at = ANCHOR_OF[found.entry.role];
  if (!at) return null;
  const now = holding(register, dealer, found.entry.role, found.entry.node);
  if (!now) return null;
  if (now.id !== found.entry.id) return { was: found.entry, now, at, swap: true };
  return picture.label.endsWith(anchorWords(dealerName, at, now)) ? null : { was: found.entry, now, at, swap: false };
}

/** Whose a picture is, read from its source: a register entry, a bank film's folder, what it waits for, or the first picture it is drawn on. */
export function ownerOf(picture: Picture, pictures: readonly Picture[], register: Register | null, dealers: readonly DealerInfo[]): Owner | null {
  const named = (id: string) => dealers.find((d) => d.id === id)?.name ?? register?.dealers[id]?.name ?? id;
  const part = picture.cut ? 'arm' : 'whole';
  if (picture.from?.built) {
    const first = pictures.find((p) => p.goesAs === 'startFrame');
    return first && first !== picture ? ownerOf(first, [], register, dealers) : null;
  }
  if (picture.from?.entry && register) {
    const found = entryOf(register, picture.from.entry);
    if (found) return { dealer: found.dealer, name: named(found.dealer), part };
  }
  const folder = picture.from?.path?.split('/').slice(-2, -1)[0];
  if (folder) {
    const d = dealers.find((x) => folder.startsWith(x.films?.prefix ?? `${x.id}-`));
    if (d) return { dealer: d.id, name: d.name, part };
  }
  if (picture.waits) return { dealer: picture.waits.dealer, name: named(picture.waits.dealer), part: 'whole' };
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
  /**
   * The bank as a reference film needs it, read as the lab's GET /api/clip-bank reads it (tools/preview.ts clipBank): the
   * job file's takes, each take's record (a derived take's own review, its film's facts) from motions/<id>.json.
   */
  async function readBank(): Promise<BankFacts> {
    const file = await readJson<{ jobs?: unknown[]; derived?: unknown[]; edits?: unknown[] }>(path.join(root, 'data/clip-jobs.json'));
    const named = <T>(list: unknown): T[] => (Array.isArray(list) ? list : []).filter((x) => typeof (x as { id?: unknown })?.id === 'string' && ORDER_ID.test((x as { id: string }).id)) as T[];
    const jobs = named<NonNullable<BankFacts['jobs']>[number]>(file?.jobs), edits = named<NonNullable<BankFacts['edits']>[number]>(file?.edits);
    const derived = named<NonNullable<BankFacts['derived']>[number]>(file?.derived).filter((d) => typeof d.clip === 'string' && ORDER_ID.test(d.clip));
    const motions: NonNullable<BankFacts['motions']> = {};
    const record = (id: string) => readJson<{ source?: NonNullable<NonNullable<BankFacts['motions']>[string]>['source']; review?: NonNullable<NonNullable<BankFacts['motions']>[string]>['review'] }>(path.join(root, 'motions', `${id}.json`));
    for (const j of [...jobs, ...edits]) motions[j.id] = await record(j.id);
    for (const d of derived) { const own = await record(d.id), clip = await record(d.clip); motions[d.id] = { source: clip?.source, review: own?.review }; }
    return { jobs, derived, edits, motions };
  }

  async function load(id: string): Promise<{ order: Order; revision: string; text: string }> {
    let text: string;
    try { text = await readFile(fileOf(id), 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError(404, 'Beställningen finns inte.'); throw error; }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new StoreError(422, 'Beställningen är inte giltig JSON.'); }
    // A draft made before 2026-11-13 may store a turn for a card that is not turned: read without it, written clean on its next change.
    const raw = value as Partial<Order> | null;
    if (raw && typeof raw === 'object' && raw.status === 'UTKAST' && raw.motion) raw.motion = tidyMotion(raw.motion);
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
  async function drawOn(base: Buffer, target: string, side: 'FRONT' | 'BACK' | null, scale = 1) {
    const { plan, file } = await readPlan(root);
    const { rgb, drawn } = drawCard(await readRgb(base), await tex(), plan, file, target, side, scale);
    return { bytes: await pngOf(rgb), drawn };
  }

  /**
   * The two pictures of a step whose cards are drawn on its anchor (the hole card's turn): the dealer's anchor that holds,
   * with every card of step.cards as it lies before (first) and after (last), where the plan says. While the anchor waits,
   * both pictures say that they wait. Drawn anew on every refresh, so they follow the anchor chosen in Material and the plan.
   */
  async function cardPictures(id: string, step: StepDef, register: Register, dealer: DealerInfo): Promise<Picture[]> {
    const at = step.from, entry = holding(register, dealer.id, ANCHOR_ROLE[at], ANCHOR_NODE[at]), words = anchorWords(dealer.name, at, entry);
    const cards = step.cards ?? [], sideWords = (s: 'FRONT' | 'BACK') => (s === 'FRONT' ? 'öppet' : 'stängt');
    const labels = { first: `Första bild · ${words} + hålkortet ${sideWords(cards[cards.length - 1]?.before ?? 'BACK')}`, last: `Sista bild · samma, hålkortet ${sideWords(cards[cards.length - 1]?.after ?? 'FRONT')}` };
    if (!entry) {
      const waits: Waits = { dealer: dealer.id, role: ANCHOR_ROLE[at], node: ANCHOR_NODE[at], label: `ankare ${at}` };
      return [{ name: 'first.png', label: labels.first, goesAs: 'startFrame', path: null, sha256: null, from: null, waits }, { name: 'last.png', label: labels.last, goesAs: 'endFrame', path: null, sha256: null, from: null, waits }];
    }
    const { bytes, from } = await sourceBytes(register, { entry: entry.id });
    const { plan, file } = await readPlan(root), base = await readRgb(bytes), texture = await tex();
    const out: Picture[] = [];
    for (const [name, goesAs, when] of [['first.png', 'startFrame', 'before'], ['last.png', 'endFrame', 'after']] as const) {
      const made = drawCards(base, texture, plan, file, cards.map((c) => ({ target: c.target, side: c[when] })));
      out.push({ name, label: labels[when === 'before' ? 'first' : 'last'], goesAs, ...(await put(id, name, await pngOf(made.rgb))), width: 1764, height: 1174, from: { ...from, note: `${from.note}; dealerns kort ritade där planen säger` }, waits: null, drawn: made.drawn, drawnBeside: made.beside });
    }
    return out;
  }

  /**
   * A pose figure: the source cut down to the arm at the shoe, its green then brought to the anchor's green when the
   * anchor is there (matched, with the greens before and after); while the anchor waits, the source's green (matched null).
   */
  async function cutPose(register: Register, pose: Source, anchor: { bytes: Buffer; sha256: string } | null): Promise<{ bytes: Buffer; from: NonNullable<Picture['from']>; cut: NonNullable<Picture['cut']> }> {
    if (!pose.keep) throw new StoreError(500, 'Posebilden saknar området som behålls.');
    const { bytes, from } = await sourceBytes(register, pose);
    if (pose.lay) return { from, ...(await layPose(bytes, { keep: pose.keep, what: pose.what ?? POSE_ARM_WHAT, ...pose.lay }, anchor)) };
    const result = cutFigure(await readRgb(bytes), pose.keep);
    const match = anchor ? matchGreen(result.rgb, await readRgb(anchor.bytes)) : null;
    return {
      bytes: await pngOf(match?.rgb ?? result.rgb),
      from,
      cut: {
        keep: pose.keep.map(([x, y]) => [x, y] as [number, number]), what: pose.what ?? POSE_WHAT, source: { sha256: sha(bytes) }, settings: { ...CUT }, filledPx: result.filledPx, keptPx: result.keptPx, green: result.green,
        matched: match && anchor ? { anchorSha256: anchor.sha256, anchor: match.anchor, before: match.before, after: match.after } : null,
      },
    };
  }

  /**
   * A pose laid on the dealer's own shoe: only the forearm and hand of the source, laid on the anchor cut down to her shoe
   * and card, moved by the two cards' top sides; then the green brought to the anchor's (it is hers already, so this
   * only records it). What is kept says the cut: filledPx and green of her own picture cut down to the shoe, keptPx the
   * arm's pixels, `laid` the regions, the move and both cards. While the anchor waits: the arm alone on the source's
   * green, unmoved (laid.by null), until the anchor is there and the draft is brought up to date (poseStale).
   */
  async function layPose(bytes: Buffer, lay: { keep: Pt[]; what: string; sleeve: Pt[]; shoe: Pt[] }, anchor: { bytes: Buffer; sha256: string } | null): Promise<{ bytes: Buffer; cut: NonNullable<Picture['cut']> }> {
    const source = await readRgb(bytes), copy = (q: readonly Pt[]) => q.map(([x, y]) => [x, y] as [number, number]);
    const card = (c: CardOutline) => ({ quad: copy(c.quad), top: copy(c.top) as [[number, number], [number, number]] });
    const fixed = { keep: copy(lay.keep), what: lay.what, source: { sha256: sha(bytes) }, settings: { ...CUT, ...LAY } };
    if (!anchor) {
      const alone = armAlone(source, lay);
      return { bytes: await pngOf(alone.rgb), cut: { ...fixed, filledPx: alone.base.filledPx, keptPx: alone.armPx, green: alone.base.green, matched: null, laid: { sleeve: copy(lay.sleeve), shoe: copy(lay.shoe), by: null, cards: null } } };
    }
    const own = await readRgb(anchor.bytes);
    let made;
    try { made = poseOnShoe(source, own, lay); } catch (error) { throw new StoreError(422, `Posebilden kan inte läggas på dealerns sko: ${(error as Error).message}`); }
    const match = matchGreen(made.rgb, own);
    return {
      bytes: await pngOf(match.rgb),
      cut: {
        ...fixed, filledPx: made.base.filledPx, keptPx: made.armPx, green: made.base.green,
        matched: { anchorSha256: anchor.sha256, anchor: match.anchor, before: match.before, after: match.after },
        laid: { sleeve: copy(lay.sleeve), shoe: copy(lay.shoe), by: made.by, cards: { source: card(made.cards.source), anchor: card(made.cards.anchor) } },
      },
    };
  }

  // The pose figures for the sheet, before a draft exists: cut once per source (and anchor) and kept while the server runs.
  const poseCache = new Map<string, Promise<Buffer>>();
  const poseOf = (step: keyof typeof POSE): Source => options.poses?.[step] ?? POSE[step];
  /** The pose figure a still would get, its green brought to the anchor entry given (the dealer's picture it is made from). */
  async function posePicture(step: string, anchorEntry?: string | null): Promise<Buffer> {
    if (!(step in POSE)) throw new StoreError(404, 'Ingen posebild för steget.');
    const source = poseOf(step as keyof typeof POSE), key = JSON.stringify([source, anchorEntry ?? null]);
    let made = poseCache.get(key);
    if (!made) {
      made = (async () => {
        const register = await readRegister();
        if (!source.keep) return (await sourceBytes(register, source)).bytes;
        const found = anchorEntry ? entryOf(register, anchorEntry) : null;
        if (anchorEntry && (!found || !isPicture(found.entry))) throw new StoreError(404, `${anchorEntry} finns inte som bild i registret.`);
        const anchor = found ? (await sourceBytes(register, { entry: found.entry.id })).bytes : null;
        return (await cutPose(register, source, anchor ? { bytes: anchor, sha256: sha(anchor) } : null)).bytes;
      })();
      made.catch(() => poseCache.delete(key));
      poseCache.set(key, made);
    }
    return made;
  }
  function posesOf(register: Register | null, dealers: DealerInfo[]): PoseAnswer[] {
    return (Object.keys(POSE) as (keyof typeof POSE)[]).map((step) => {
      const source = poseOf(step);
      const owner = ownerOf({ name: 'pose-figure.png', label: '', goesAs: 'referenceImage', path: null, sha256: null, from: { entry: source.entry, path: source.path }, cut: source.keep ? ({} as Picture['cut']) : null }, [], register, dealers);
      return { step, label: source.label ?? step, owner: owner ?? { dealer: '?', name: 'okänd', part: 'arm' }, served: `api/orders/pose/${step}` };
    });
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
  async function textOf(order: Pick<Order, 'step' | 'motion' | 'generation' | 'pictures' | 'prompt' | 'reference'>, dealer: DealerInfo, extra: string | null): Promise<Order['prompt']> {
    const drawn = order.pictures.find((p) => p.goesAs === 'endFrame')?.drawn ?? null;
    const target = order.motion?.target ?? stepOf(order.step.key)?.target ?? null;
    const planPlace = !drawn && target ? planCentre((await readPlan(root)).plan, target) : null;
    const { template, style, text } = orderPrompt({ ...order, prompt: { ...order.prompt, extra } }, dealer, planPlace);
    return { template, style, text, sha256: sha(text), extra, middle: false };
  }

  async function create(input: NewOrder): Promise<{ order: Order; revision: string }> {
    const step = stepOf(input.step);
    if (!step) throw new StoreError(400, 'Okänt steg.');
    if (step.off) throw new StoreError(400, `${step.label}: ${step.off}`);
    const dealers = await readDealers(), dealer = dealers.find((d) => d.id === input.dealer);
    if (!dealer) throw new StoreError(400, unknownDealer(input.dealer));
    const policy = await readPolicy();
    if (!policy) throw new StoreError(500, 'data/order-policy.json kunde inte läsas.');
    const register = await readRegister();
    // The step's own model, or one asked for that can make it (a film: first and last picture, no reference).
    const model = input.model === undefined || input.model === null ? modelFor(step) : typeof input.model === 'string' ? modelFor(step, input.model) : null;
    if (!model) throw new StoreError(400, `${String(input.model)} kan inte göra ${step.label}: välj ${modelsFor(step).filter((m) => !m.off).map((m) => m.id).join(', ')}.`);
    if (model.off) throw new StoreError(400, `${model.label} beställs inte längre: ${model.off}`);
    // A step about one card that is not chosen (the hole card's turn) has its own; a deal or a return, the seat chosen.
    const target = step.target ?? (step.card ? (input.target ?? null) : null);
    const { plan } = await readPlan(root);
    if (step.card && (!target || !plan.targets[target])) throw new StoreError(400, 'Välj en plats på bordet (P1.C1 … D.C2).');
    if (step.cards?.some((c) => !plan.targets[c.target])) throw new StoreError(400, `Planen saknar ${step.cards.filter((c) => !plan.targets[c.target]).map((c) => c.target).join(' och ')}.`);
    const takes = input.takes ?? 2;
    if (!Number.isInteger(takes) || takes < 1 || takes > TAKES_MAX) throw new StoreError(400, `Tagningar ska vara 1–${TAKES_MAX}.`);
    // The free addition is refused beyond the limit, as change() refuses it: cut, it would end the text mid-sentence unseen.
    if (input.extra !== undefined && input.extra !== null && typeof input.extra !== 'string') throw new StoreError(400, 'Tillägget ska vara en text.');
    const extra = input.extra?.trim() || null;
    if (extra && extra.length > EXTRA_LIMIT) throw new StoreError(400, `Tillägget får vara högst ${EXTRA_LIMIT} tecken (det här har ${extra.length}).`);
    const intent = target ? plan.targets[target].intent : null;
    const flipAxis = input.flipAxis ?? defaultFlip(step.key, intent?.turnAt);
    if (!FLIP_AXES.includes(flipAxis)) throw new StoreError(400, 'Okänd vändning.');
    if (input.hand !== undefined && input.hand !== 'LH' && input.hand !== 'RH') throw new StoreError(400, 'Handen ska vara LH eller RH.');
    if (input.pass !== undefined && typeof input.pass !== 'boolean') throw new StoreError(400, 'Handbyte ska vara sant eller falskt.');
    if (input.side !== undefined && input.side !== 'FRONT' && input.side !== 'BACK') throw new StoreError(400, 'Kortet landar FRONT (öppet) eller BACK (stängt).');
    const style = input.style ?? defaultStyle(step.kind);
    if (!stylesFor(step.kind, step).includes(style)) throw new StoreError(400, step.styles ? `${step.label} skrivs ${step.styles.join(' eller ')}.` : step.kind === 'STILL' ? 'En bild skrivs KORT eller UTFÖRLIG.' : 'Texten är KORT, MINIMAL eller UTFÖRLIG.');
    const deal = step.card && step.start !== 'LAND';
    if (input.shape !== undefined && input.shape !== 'ROUND_TRIP' && input.shape !== 'ONE_WAY') throw new StoreError(400, 'En giv är ROUND_TRIP (tur och retur) eller ONE_WAY (bara dit).');
    if (input.shape !== undefined && !deal && input.shape !== 'ONE_WAY') throw new StoreError(400, 'Bara en giv kan gå tur och retur.');
    const shape: Shape | null = step.kind !== 'FILM' ? null : deal ? (input.shape ?? 'ROUND_TRIP') : 'ONE_WAY';
    // A return starts on the seat's landing picture and a deal bara dit ends on it: one must hold.
    const landing = step.start === 'LAND' || (deal && shape === 'ONE_WAY') ? landingEntry(register, dealer.id, target) : null;
    if ((step.start === 'LAND' || (deal && shape === 'ONE_WAY')) && !landing) throw new StoreError(400, landingMissing(dealer.name, target));
    if (input.reference !== undefined && input.reference !== null && typeof input.reference !== 'string') throw new StoreError(400, 'Referensfilmen ska vara en tagnings id.');
    const cardScale = input.cardScale ?? 1;
    if (!(CARD_SCALES as readonly unknown[]).includes(cardScale)) throw new StoreError(400, `Kortets storlek ska vara ${CARD_SCALES.map((f) => scaleWords(f)).join(', ')}.`);
    if (cardScale !== 1 && !(deal && shape === 'ROUND_TRIP')) throw new StoreError(400, 'Kortets storlek väljs bara för tur och retur, där sista bilden ritas; i bara dit och en retur är kortet som i landningsbilden.');
    if (input.reference && !model.videos) throw new StoreError(400, `${model.label} tar ingen referensfilm tillsammans med första och sista bild.`);
    const seat = target && step.card ? target.toLowerCase().replace('.c1', '').replace('.', '-') : null;
    const id = input.id ?? (await nextId([dealer.id, step.key.toLowerCase().replace('.', '-'), seat].filter(Boolean).join('-')));
    if (!ORDER_ID.test(id)) throw new StoreError(400, 'Ogiltigt beställnings-id.');

    // Generation parameters by name, as the tools take them for this model (the sheet shows the same, from paramsOf).
    if (input.resolution !== undefined && typeof input.resolution !== 'string') throw new StoreError(400, 'Upplösningen ska vara en text.');
    if (input.duration !== undefined && typeof input.duration !== 'number') throw new StoreError(400, 'Längden ska vara ett tal.');
    const params = paramsOf(step, model, { duration: input.duration, resolution: input.resolution });
    if (step.kind === 'FILM') {
      if (model.resolutions && !model.resolutions.includes(String(params.resolution))) throw new StoreError(400, `${model.label} tar ${model.resolutions.join(', ')}, inte ${params.resolution}.`);
      const d = Number(params.duration);
      if (model.durations && !(d >= model.durations[0] && d <= model.durations[1])) throw new StoreError(400, `Längden ska vara ${model.durations[0]}–${model.durations[1]} s för ${model.label}.`);
    }
    const cost = costOf({ model: model.id, params }, takes, policy.prices);
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

      // A seat's landing picture, copied byte for byte from the register like an anchor (a still, or one frame of a film).
      const landingPicture = async (name: string, label: string, goesAs: Picture['goesAs']): Promise<Picture> => {
        const { bytes, from } = await sourceBytes(register, { entry: landing!.id });
        return { name, label, goesAs, ...(await put(id, name, bytes)), width: 1764, height: 1174, from, waits: null };
      };
      const landingWords = `${genitive(dealer.name)} landning på ${seatWords(target)}`;
      let motion: Order['motion'] = null;
      if (step.kind === 'FILM' && step.cards?.length) pictures.push(...(await cardPictures(id, step, register, dealer)));
      else if (step.kind === 'FILM') {
        const first = step.start === 'LAND' ? { picture: await landingPicture('first.png', `Första bild · ${landingWords}`, 'startFrame'), bytes: null } : await anchorPicture('first.png', (w) => `Första bild · ${w}`, 'startFrame', step.from);
        pictures.push(first.picture);
        if (step.card && intent) {
          // The choices made in the sheet, else what Placering says for the card. Every card leaves the shoe closed; in a
          // return it lies where it was laid and is not turned.
          const pass = input.pass ?? (input.hand === undefined ? intent.pass : false);
          const hand = pass ? 'LH' : (input.hand ?? intent.takeHand);
          if (pass && input.hand === 'RH') throw new StoreError(400, 'Handbyte går från vänster hand till höger: vänster tar kortet ur skon.');
          const side = input.side ?? intent.endSide;
          const turn = step.start === 'LAND' ? false : side !== intent.startSide;
          motion = { grip: step.grip ?? 'PINCH', hand, pass, turn, flipAxis: turn ? flipAxis : null, target, side, fromPlan: false, ...(cardScale !== 1 ? { cardScale } : {}) };
          motion.fromPlan = fromPlanOf(plan, motion);
          if (step.start === 'LAND') pictures.push((await anchorPicture('last.png', (w) => `Sista bild · ${w}`, 'endFrame', step.to ?? step.from)).picture);
          else if (shape === 'ONE_WAY') pictures.push(await landingPicture('last.png', `Sista bild · ${landingWords}`, 'endFrame'));
          else {
            // Drawn on the dealer's own anchor only; while it waits, the picture shows that it waits (no other dealer stands in).
            const last: Picture = { name: 'last.png', label: `Sista bild · samma + kortet ${side === 'BACK' ? 'stängt' : 'öppet'} på ${seatWords(target)}`, goesAs: 'endFrame', path: null, sha256: null, from: { built: `första bilden + kortet ${target} där planen säger` }, waits: first.picture.waits ?? null };
            if (first.bytes) {
              const { bytes, drawn } = await drawOn(first.bytes, target!, side, cardScale);
              Object.assign(last, await put(id, 'last.png', bytes), { width: 1764, height: 1174, drawn, waits: null });
            }
            pictures.push(last);
          }
        } else {
          const last = await anchorPicture('last.png', (w) => `Sista bild · ${w}`, 'endFrame', step.to ?? step.from);
          pictures.push(last.picture);
        }
      } else {
        const base = await anchorPicture('anchor.png', (w) => w, 'referenceImage', step.from, 'anchor');
        pictures.push(base.picture);
        const pose = input.pose ?? options.poses?.[step.key as keyof typeof POSE] ?? POSE[step.key as keyof typeof POSE];
        if (pose.keep) {
          // The figure: only the arm at the shoe of the other dealer; the rest of her is green, the anchor's green.
          const { bytes: figure, from, cut } = await cutPose(register, pose, base.bytes && base.picture.sha256 ? { bytes: base.bytes, sha256: base.picture.sha256 } : null);
          pictures.push({
            name: 'pose-figure.png', label: POSE_LABEL, goesAs: 'referenceImage', tag: 'pose', ...(await put(id, 'pose-figure.png', figure)), width: 1764, height: 1174,
            from: { ...from, note: pose.lay ? `${pose.label ?? from.note}; allt annat av henne är bortklippt, hennes sko och kort också` : `${pose.label ?? from.note}; allt av henne utom ${pose.what ?? POSE_WHAT} är bortklippt och grönt` }, waits: null, cut,
          });
        } else {
          const { bytes, from } = await sourceBytes(register, pose);
          pictures.push({ name: 'pose.png', label: 'Pose (@pose)', goesAs: 'referenceImage', tag: 'pose', ...(await put(id, 'pose.png', bytes)), width: 1764, height: 1174, from: { ...from, note: pose.label ?? from.note }, waits: null });
        }
      }

      // A reference film: a take of the bank for this step, copied into the order's folder with its hash.
      let reference: Reference = { status: 'INGEN', why: noReferenceWhy(model.id) };
      if (input.reference) {
        const found = referenceCandidates(await readBank(), { dealer: dealer.id, step, target, model }).find((c) => c.take === input.reference || c.film === input.reference);
        if (!found) throw new StoreError(400, `${input.reference} finns inte bland bankens tagningar för ${step.label}${target ? ` till ${seatWords(target)}` : ''}.`);
        if (!found.fits) throw new StoreError(400, `Referensfilmen är ${secondsWords(found.seconds)}; ${model.label} tar ${model.referenceSeconds?.join('–')} s.`);
        const file = path.join(root, ...found.path.split('/'));
        try { if ((await realpath(file)) !== path.join(await realpath(path.join(root, 'assets', 'motions')), found.film, 'source.mp4')) throw new Error('outside'); } catch { throw new StoreError(404, `Filmen ${found.path} finns inte i banken.`); }
        const bytes = await readFile(file);
        if (found.sha256 && sha(bytes) !== found.sha256) throw new StoreError(409, `${found.path} är inte den film banken mätte (sha256 skiljer).`);
        const copied = await put(id, 'reference.mp4', bytes);
        reference = {
          status: 'FINNS', clips: [found.take], ...copied, seconds: found.seconds!, goesTo: found.goesTo ?? found.edge, approvedStraight: found.approvedStraight, dealer: found.dealer,
          from: { film: found.film, path: found.path, sha256: copied.sha256, edge: found.edge, verdict: found.verdict, words: found.words, frames: found.frames, also: found.also },
        };
      }

      // What the still becomes: a candidate of its role in the register.
      const makes = step.makes ? { role: step.makes.role, label: step.makes.label } : null;
      const edge = edgeOf(step, target);
      const order: Order = {
        schemaVersion: 1,
        id,
        title: input.title ?? `${dealer.name} · ${step.label}${target && step.card ? ` · ${seatWords(target)}` : ''}${deal && shape === 'ONE_WAY' ? ' · bara dit' : ''}${model.id !== step.model ? ` · ${model.label}` : ''}${cardScale !== 1 ? ` · prov: kortet ${scaleWords(cardScale)}` : ''}`,
        summary: summaryOf(step, dealer.name, motion, shape),
        group: input.group ?? null,
        dealer: dealer.id,
        kind: step.kind,
        step: { key: step.key, label: step.label, edge, shape, cutInto: cutIntoOf(step, target, shape), makes },
        motion,
        pictures,
        reference,
        generation: { provider: 'runway-app', tool: model.tool, model: model.id, params },
        prompt: { template: '', style, text: '', sha256: '', extra, middle: false },
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

  /**
   * One draft per seat, sharing a group ("Alla sju": the first card to every player), each with its own text and last
   * picture. All or nothing: when one cannot be made, the ones already made are removed again (they are new drafts).
   */
  async function createMany(input: NewOrder): Promise<{ orders: Order[]; revisions: string[] }> {
    const seats = input.seats;
    if (!Array.isArray(seats) || seats.length < 2 || seats.length > SEAT_TARGETS.length) throw new StoreError(400, `Välj 2–${SEAT_TARGETS.length} platser.`);
    const targets = seats.map((s) => s?.target);
    if (targets.some((t) => typeof t !== 'string' || !SEAT_TARGETS.includes(t)) || new Set(targets).size !== targets.length) throw new StoreError(400, 'Platserna ska vara olika och finnas i planen (P1.C1 … D.C1).');
    for (const s of seats) for (const key of Object.keys(s)) if (!['target', 'hand', 'pass', 'side'].includes(key)) throw new StoreError(400, `${key} kan inte sättas per plats.`);
    const step = stepOf(input.step), dealer = (await readDealers()).find((d) => d.id === input.dealer);
    if (!step?.card || step.start === 'LAND') throw new StoreError(400, 'Flera platser går bara för en giv.');
    if (!dealer) throw new StoreError(400, unknownDealer(input.dealer));
    const taken = new Set<string>();
    for (const name of (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'))) { const g = (await readJson<Order>(path.join(dir, name)))?.group?.id; if (g) taken.add(g); }
    const prefix = `${dealer.id}-${step.key.toLowerCase().replace('.', '-')}-grupp`;
    let groupId = '';
    for (let n = 1; n < 100 && !groupId; n++) { const id = `${prefix}-${String(n).padStart(2, '0')}`; if (!taken.has(id)) groupId = id; }
    const all = targets.length === 7 && targets.every((t) => t.startsWith('P'));
    const group = input.group ?? { id: groupId, label: `${dealer.name} · ${step.group.toLowerCase()} · ${all ? 'alla sju' : seatList(targets)}` };
    const made: Order[] = [], revisions: string[] = [];
    try {
      for (const seat of seats) {
        const { order, revision } = await create({ ...input, seats: undefined, id: undefined, title: undefined, target: seat.target, hand: seat.hand ?? input.hand, pass: seat.pass ?? input.pass, side: seat.side ?? input.side, group });
        made.push(order); revisions.push(revision);
      }
    } catch (error) {
      for (const order of made) { await rm(fileOf(order.id), { force: true }); await rm(path.join(root, folderOf(order.id)), { recursive: true, force: true }); }
      throw error;
    }
    return { orders: made, revisions };
  }

  // ── Changing a draft ───────────────────────────────────────────────────────
  function guardDraft(order: Order, revision: string, expected: string | undefined) {
    if (!expected) throw new StoreError(428, 'Läs beställningen innan du ändrar den.');
    if (revision !== expected) throw new StoreError(409, 'Beställningen har ändrats sedan den lästes. Läs om och försök igen.');
    if (order.status !== 'UTKAST' || order.approval) throw new StoreError(409, 'Beställningen är godkänd och kan inte ändras.');
  }

  function validateChange(value: unknown): Change {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoreError(400, 'Ändringen ska vara ett objekt.');
    const v = value as Record<string, unknown>, allowed = ['title', 'takes', 'flipAxis', 'extra', 'duration', 'hand', 'pass', 'side'];
    if (v.hand !== undefined && v.hand !== 'LH' && v.hand !== 'RH') throw new StoreError(400, 'Handen ska vara LH eller RH.');
    if (v.pass !== undefined && typeof v.pass !== 'boolean') throw new StoreError(400, 'Handbyte ska vara sant eller falskt.');
    if (v.side !== undefined && v.side !== 'FRONT' && v.side !== 'BACK') throw new StoreError(400, 'Kortet landar FRONT (öppet) eller BACK (stängt).');
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
      if (changes.flipAxis !== undefined) { if (!next.motion?.turn) throw new StoreError(400, 'Kortet vänds inte i det här utkastet.'); next.motion.flipAxis = changes.flipAxis; }
      if (changes.duration !== undefined) { if (next.kind !== 'FILM') throw new StoreError(400, 'En bild har ingen längd.'); next.generation.params.duration = changes.duration; }
      if (changes.hand !== undefined || changes.pass !== undefined || changes.side !== undefined) {
        if (!next.motion) throw new StoreError(400, 'Steget har ingen hand eller sida att välja.');
        const pass = changes.pass ?? (changes.hand !== undefined ? false : !!next.motion.pass);
        const hand = changes.hand ?? (pass ? 'LH' : next.motion.hand);
        if (pass && hand !== 'LH') throw new StoreError(400, 'Handbyte går från vänster hand till höger: vänster tar kortet ur skon.');
        const side = changes.side ?? next.motion.side, redraw = side !== next.motion.side;
        // In a return the card lies where it was laid and is not turned.
        const turn = stepOf(next.step.key)?.start === 'LAND' ? false : side !== 'BACK';
        const intent = next.motion.target ? (await readPlan(root)).plan.targets[next.motion.target]?.intent : null;
        Object.assign(next.motion, { hand, pass, side, turn, flipAxis: turn ? (next.motion.flipAxis ?? defaultFlip(next.step.key, intent?.turnAt)) : null });
        const { plan } = await readPlan(root);
        next.motion.fromPlan = fromPlanOf(plan, next.motion);
        await labelLast(next);
        if (redraw) await drawLast(id, next, null);
      }
      next.summary = summaryOf(next.step, dealer.name, next.motion, next.step.shape);
      if (next.reference.status === 'INGEN') next.reference.why = noReferenceWhy(next.generation.model);
      const extra = changes.extra !== undefined ? (changes.extra?.trim() || null) : next.prompt.extra;
      next.prompt = await textOf(next, dealer, extra);
      const cost = costOf(next.generation, next.takes, policy.prices);
      if (!cost) throw new StoreError(400, 'Inget pris för de här värdena.');
      next.cost = cost;
      next.limits = { ...next.limits, maxCredits: cost.worstTotal };
      return { order: next, revision: await write(next) };
    });
  }

  /** The built last picture's label says how the card lands and where. */
  async function labelLast(order: Order) {
    const last = order.pictures.find((p) => p.goesAs === 'endFrame' && p.from?.built);
    if (last && order.motion?.target) last.label = `Sista bild · samma + kortet ${order.motion.side === 'BACK' ? 'stängt' : 'öppet'} på ${seatWords(order.motion.target)}`;
  }
  /** Draws the last picture again on the first, with the card as the draft has it (side), when the first is there. */
  async function drawLast(id: string, order: Order, firstBytes: Buffer | null) {
    const first = order.pictures.find((p) => p.goesAs === 'startFrame');
    const last = order.pictures.find((p) => p.goesAs === 'endFrame' && p.from?.built);
    if (!first?.path || !last || !order.motion?.target) return;
    const base = firstBytes ?? (await readFile(path.join(root, ...first.path.split('/'))));
    const { bytes, drawn } = await drawOn(base, order.motion.target, order.motion.side, order.motion.cardScale ?? 1);
    Object.assign(last, await put(id, 'last.png', bytes), { drawn, waits: null, width: 1764, height: 1174 });
  }

  /**
   * Brings a draft up to date: fetches what it waits for once it holds in the register, follows the anchor that holds now
   * when another of the same role has been approved in Material since (keeping what the picture was in `replaced`), draws
   * its last picture again when the first changed or the plan did, and writes the text with the template of today.
   */
  async function refresh(id: string, expected: string | undefined) {
    return serial(async () => {
      const { order, revision } = await load(id);
      guardDraft(order, revision, expected);
      const register = await readRegister(), dealer = (await readDealers()).find((d) => d.id === order.dealer);
      if (!dealer) throw new StoreError(500, 'Dealern saknas i data/dealers.json.');
      const next: Order = structuredClone(order);
      const { file: planFile } = await readPlan(root);
      let firstBytes: Buffer | null = null;
      // A step whose cards are drawn on its anchor (the hole card's turn) is drawn anew from the anchor that holds now.
      const drawnStep = stepOf(next.step.key);
      if (drawnStep?.cards?.length && next.kind === 'FILM') {
        const made = await cardPictures(id, drawnStep, register, dealer);
        if (made.every((p) => p.path)) next.pictures = next.pictures.map((p) => made.find((m) => m.name === p.name) ?? p);
      }
      for (const p of next.pictures) {
        if (p.from?.built || drawnStep?.cards?.length) continue;
        if (p.waits && !p.path) {
          const entry = resolveWaits(register, p.waits);
          if (!entry) continue;
          const { bytes, from } = await sourceBytes(register, { entry: entry.id });
          Object.assign(p, await put(id, p.name, bytes), { from, waits: null, width: 1764, height: 1174 });
          if (p.goesAs === 'startFrame') firstBytes = bytes;
          continue;
        }
        const f = followOf(register, order.dealer, p, dealer.name);
        if (!f) continue;
        const words = new RegExp(`${escapeRe(genitive(dealer.name))} ankare ${escapeRe(f.at)}(?: · .*)?$`);
        const label = words.test(p.label) ? p.label.replace(words, anchorWords(dealer.name, f.at, f.now)) : p.label;
        if (f.swap) {
          const { bytes, from } = await sourceBytes(register, { entry: f.now.id });
          const was = { at: now().toISOString(), was: `${p.label} (${f.was.name})`, entry: f.was.id, sha256: p.sha256 };
          Object.assign(p, await put(id, p.name, bytes), { from, width: 1764, height: 1174, replaced: was });
          if (p.goesAs === 'startFrame') firstBytes = bytes;
        } else if (p.from) p.from = { ...p.from, note: `${f.now.name} (${f.now.state})` };
        p.label = label;
      }
      // The pose figure's green follows the anchor it is sent with: cut again from its source and matched to the anchor of now.
      const stale = poseStale(next);
      if (stale) {
        const { anchor, pose } = stale, cut = pose.cut!;
        const source: Source = { ...(pose.from?.entry ? { entry: pose.from.entry } : { path: pose.from?.path, frame: pose.from?.frame }), keep: cut.keep, what: cut.what, ...(cut.laid ? { lay: { sleeve: cut.laid.sleeve, shoe: cut.laid.shoe } } : {}) };
        const made = await cutPose(register, source, { bytes: await readFile(path.join(root, ...anchor.path!.split('/'))), sha256: anchor.sha256! });
        Object.assign(pose, await put(id, pose.name, made.bytes), { cut: made.cut });
      }
      if (next.motion && next.motion.pass === undefined) next.motion.pass = false;
      const last = next.pictures.find((p) => p.goesAs === 'endFrame' && p.from?.built);
      if (last && (firstBytes || !last.path || last.drawn?.plan.sha256 !== planFile.sha256 || (last.drawn && last.drawn.side !== next.motion?.side))) await drawLast(id, next, firstBytes);
      await labelLast(next);
      next.summary = summaryOf(next.step, dealer.name, next.motion, next.step.shape);
      if (next.reference.status === 'INGEN') next.reference.why = noReferenceWhy(next.generation.model);
      next.prompt = await textOf(next, dealer, next.prompt.extra);
      return { order: next, revision: await write(next) };
    });
  }

  /** A still whose pose figure's green is not (yet) matched to the anchor it is sent with. */
  function poseStale(order: Order): { anchor: Picture; pose: Picture } | null {
    const anchor = order.pictures.find((p) => p.tag === 'anchor' && p.path && p.sha256);
    const pose = order.pictures.find((p) => p.tag === 'pose' && p.cut && p.from);
    return anchor && pose && pose.cut!.matched?.anchorSha256 !== anchor.sha256 ? { anchor, pose } : null;
  }

  /** Why "Hämta bilderna" would change a draft now, in words, or null. */
  function refreshReason(order: Order, register: Register | null, dealer: DealerInfo | undefined, planSha: string | null): string | null {
    if (order.approval || order.status !== 'UTKAST') return null;
    const reasons: string[] = [];
    if (register && waitingOf(order).some((w) => resolveWaits(register, w))) reasons.push('Det utkastet väntar på finns nu i Material.');
    for (const p of order.pictures) {
      const f = register && dealer ? followOf(register, order.dealer, p, dealer.name) : null;
      if (f) reasons.push(f.swap ? `${f.now.name} gäller nu i Material i stället för ${f.was.name}.` : `${f.now.name} är godkänd i Material.`);
    }
    if (planSha && order.pictures.some((p) => p.drawn && p.drawn.plan.sha256 !== planSha)) reasons.push('Planen har ändrats sedan kortet ritades.');
    if (poseStale(order)) reasons.push('Posebildens gröna är inte ankarets än.');
    // The template its style writes today (a draft without a style is Utförlig, whose deal text is still template 3's).
    if (dealer && order.prompt.template !== orderPrompt(order, dealer, null).template) reasons.push('Texten är skriven med en äldre mall.');
    return reasons.length ? reasons.join(' ') : null;
  }

  /**
   * After a decision in Material: every draft of the dealer that would change (a picture it waits for holds now, another
   * anchor holds than the one it was made from) is brought up to date. Returns the drafts that followed; one that cannot
   * be brought up to date stays as it is and shows why in Beställ.
   */
  async function follow(dealerId: string): Promise<string[]> {
    const register = await media.readRegister().then((r) => r.register).catch(() => null);
    const dealer = (await readDealers()).find((d) => d.id === dealerId);
    if (!register || !dealer) return [];
    const followed: string[] = [];
    for (const name of (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort()) {
      const id = name.slice(0, -5);
      if (!ORDER_ID.test(id)) continue;
      const loaded = await load(id).catch(() => null);
      if (!loaded || loaded.order.dealer !== dealerId || loaded.order.status !== 'UTKAST') continue;
      const { order } = loaded;
      const moves = waitingOf(order).some((w) => resolveWaits(register, w)) || order.pictures.some((p) => followOf(register, dealerId, p, dealer.name)) || !!poseStale(order);
      if (!moves) continue;
      try { await refresh(id, loaded.revision); followed.push(id); } catch { /* shown in Beställ as a reason to fetch the pictures */ }
    }
    return followed;
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

  /**
   * Whose each picture is. A whole picture of another dealer never lies in a dealer's draft (Jakob 2026-11-12); only the
   * cut-out of her arm at the shoe may, as the pose of a still. Such a mix-up keeps the order from being approved.
   */
  function ownersOf(order: Order, register: Register | null, dealers: DealerInfo[]) {
    const owners: Record<string, Owner | null> = {}, problems: string[] = [];
    const mine = dealers.find((d) => d.id === order.dealer)?.name ?? order.dealer;
    for (const p of order.pictures) {
      const owner = (owners[p.name] = ownerOf(p, order.pictures, register, dealers));
      if (owner && owner.dealer !== order.dealer && owner.part !== 'arm') problems.push(`${p.label}: bilden är ${genitive(owner.name)}, inte ${genitive(mine)}. En annan dealers bild ligger aldrig i ett utkast.`);
    }
    return { owners, problems };
  }

  async function answerOf(order: Order, revision: string, register: Register | null, policy: Policy | null, spentToday: number, balance: number, dealers: DealerInfo[] = []): Promise<OrderAnswer> {
    const receipt = await readReceipt(order.id);
    const problems = await problemsOf(order);
    const hash = orderHash(order);
    if (order.approval && order.approval.orderSha256 !== hash) problems.push('Beställningen har ändrats efter godkännandet: den läggs inte.');
    const { owners, problems: mixed } = ownersOf(order, register, dealers);
    problems.push(...mixed);
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
    const why = refreshReason(order, register, dealers.find((d) => d.id === order.dealer), planFile?.sha256 ?? null);
    return { order, revision, hash, shown: shownOf(order, problems, receipt), problems, warnings, waiting, receipt, check, owners, refresh: why };
  }

  async function list(): Promise<OrdersAnswer> {
    const problems: string[] = [];
    const policy = await readPolicy();
    if (!policy) problems.push('data/order-policy.json kunde inte läsas.');
    const register = await media.readRegister().then((r) => r.register);
    const dealers = await readDealers();
    const plan = await readPlan(root).then(({ plan, file }) => planAnswerOf(plan, file)).catch(() => null);
    if (!plan) problems.push('placements/default.json kunde inte läsas.');
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
    for (const { order, revision } of loaded) orders.push(await answerOf(order, revision, register, policy, spent, balance?.credits ?? 0, dealers));
    // A queue: the oldest first.
    orders.sort((a, b) => (a.order.created < b.order.created ? -1 : a.order.created > b.order.created ? 1 : a.order.id.localeCompare(b.order.id)));
    return {
      schemaVersion: 1, orders, policy, day: { date, spent, cap: policy?.dailyCapCredits ?? 0 }, balance, problems,
      dealers: dealers.map(({ id, name, look, paused }) => ({ id, name, look, paused: paused ?? null })),
      plan,
      poses: posesOf(register, dealers),
    };
  }

  async function one(id: string): Promise<OrderAnswer> {
    const all = await list();
    const found = all.orders.find((o) => o.order.id === id);
    if (!found) { await load(id); throw new StoreError(404, 'Beställningen finns inte.'); }
    return found;
  }

  // ── Jakob's click, or the main agent on his mandate ────────────────────────
  /**
   * Freezes a draft: its hash in approval. Refused while anything waits or is missing, and beyond the policy. Jakob's
   * click (the route) is by jakob; the main agent's (tools/order-approve.ts) is by huvudagent and carries the mandate it
   * acts on. The checks and the hash are the same for both.
   */
  async function approve(id: string, expected: string | undefined, who: { by: 'huvudagent'; mandate: string } | null = null) {
    if (who && (who.by !== 'huvudagent' || typeof who.mandate !== 'string' || !who.mandate.trim() || who.mandate.length > 300)) throw new StoreError(400, 'Huvudagentens godkännande kräver uppdraget (mandate: vems ord och när, högst 300 tecken).');
    return serial(async () => {
      const { order, revision } = await load(id);
      guardDraft(order, revision, expected);
      const register = await media.readRegister().then((r) => r.register).catch(() => null);
      const problems = [...(await problemsOf(order)), ...ownersOf(order, register, await readDealers()).problems];
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
      const approval: Order['approval'] = who ? { by: 'huvudagent', at, orderSha256: orderHash(order), mandate: who.mandate.trim() } : { by: 'jakob', at, orderSha256: orderHash(order) };
      const next: Order = { ...order, status: 'GODKÄND', approval };
      return { order: next, revision: await write(next), check };
    });
  }

  /** Sets a draft aside (AVBRUTEN) with why: never placed, kept as the record of what was prepared. */
  async function setAside(id: string, expected: string | undefined, why: string, by: string) {
    if (typeof why !== 'string' || !why.trim() || why.length > 300) throw new StoreError(400, 'Säg varför (högst 300 tecken).');
    return serial(async () => {
      const { order, revision } = await load(id);
      guardDraft(order, revision, expected);
      const next: Order = { ...order, status: 'AVBRUTEN', setAside: { at: now().toISOString(), by, why: why.trim() } };
      return { order: next, revision: await write(next) };
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

  return { list, one, load, create, createMany, change, refresh, follow, approve, setAside, servable, readReceipt, posePicture };
}

export type { Drawn, OrderAnswer, OrdersAnswer };
