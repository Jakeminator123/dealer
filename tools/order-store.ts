// The order queue on disk: data/orders/<id>.json (in Git, small, no signed addresses) and the pictures that go out in
// assets/orders/<id>/ (outside Git). Builds a draft from a few choices (create), changes a draft (change), fetches what a
// draft waits for, or the dealer's anchor Jakob has since chosen in Material, and draws its last picture again (refresh),
// and freezes an order on Jakob's click (approve: the order's hash in approval, refused beyond data/order-policy.json).
// A still (anchor 2.1 or 2.2) goes out with the dealer's own anchor and its text, nothing else. Nothing of another dealer
// is shown as a stand-in: a picture that waits shows that it waits. The receipt beside the pictures (receipt.json) is
// never written here: only tools/order-put.ts writes it. Same guards as tools/review-store.ts: the caller presents the
// revision it read (If-Match), writes are queued, and a file is replaced through a temporary file renamed into place.
// Routes: tools/order-routes.ts.
//
// One straight line (2026-11-18): a draft says its dealer, its step and its card, and everything else comes from the step's
// ONE recipe in data/order-methods.json (src/order-methods.ts recipeFor): model, resolution, takes, text style, shape, turn,
// the reference film the recipe's rule finds (referenceByRule; the dummy's rendered films from data/rendered-references.json
// first) and the film's length (the reference film's own, else the recipe's). What a draft says against its recipe is a
// deliberate exception and is named in its notes; a step without a recipe has no default. The reference film is a choice of
// the order, never a condition (2026-11-23): where the recipe's rule finds none the draft is made without one, and its notes
// say so. Nor is a deal's last picture a condition: a deal to a seat with no end picture yet is made without one (its A3 is
// made from the film's last frame), and one with no reference film either says that only the first picture and the text
// tell where the card goes.
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
// picture (a register entry, role landning, that holds). A deal "bara dit" ends on the seat's OWN end picture: its landing
// picture where one holds, else the cut frame of the bank's own film to the seat (cutFrameOf; checked as a picture and its
// shoe put back from anchor 1 where the window's card is printed, cutPicture); a seat with neither is refused with what is
// missing. A reference film is a take of the bank or a rendered film (referenceCandidates; never an archived take), copied
// into the order's folder with its hash like the pictures; another dealer's film is allowed there and named.
import { readFile, writeFile, mkdir, rename, rm, stat, realpath, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { StoreError } from './placement-store.ts';
import { mediaRoles } from './media-roles.ts';
import { readMandateBudget } from './order-mandate.ts';
import {
  ANCHOR_NODE, ANCHOR_ROLE, CARD_SCALES, EXTRA_LIMIT, MODELS, FILE_NAME, FLIP_AXES, FLIP_LABEL, STYLE_LABEL, ORDER_ID, RETURN_23_BLOCK, RETURN_23_TRIAL, SEAT_TARGETS, SHORT_TWO_HAND_TURN_HELP, TAKES_MAX, scaleWords, shortTwoHandTurnProblem,
  LANDING_ROLE, bodyLine, canonical, checkPolicy, costOf, crossesBody, cutFrameOf, cutFrameWords, cutIntoOf, tidyMotion, dayOf, defaultFlip, defaultStyle, draftProblems, edgeOf, genitive, giveEndOf, hashInput, landingMissing, landingOf, a3Candidates, a3Name, openEndWords, archivedReferenceIds, isArchived, modelFor, modelsFor, paramsOf, plannedOf, readCutChecks, referenceCandidates, seatList, seatWords, secondsWords, shownOf, spentOn, stepOf, stylesFor, summaryOf, twoHandDealSideProblem, twoHandDraftProblem, twoHandMotion, validateOrder, waitingOf,
  type Anchor, type BankFacts, type CutFrame, type Drawn, type GiveEnd, type FlipAxis, type Motion, type Order, type OrderAnswer, type OrdersAnswer, type Owner, type Picture, type PlanAnswer, type Policy, type Receipt, type RefCandidate, type Reference, type RenderedReference, type SeatPlan, type Shape, type StepDef, type StepKey, type TextStyle, type Waits,
} from '../src/order-model.ts';
import { readMethods, recipeFor, recipeHands, referenceAbsent, referenceByRule, secondsOf, triedWords, type MethodRegister } from '../src/order-methods.ts';
import { TEMPLATE_CHOICES, TEMPLATE_CHOICES_WORDS, TEMPLATE_VERSION, handsIn, orderPrompt } from '../src/order-prompts.ts';
import { checkCutFrame, patchShoe } from '../src/cut-frame.ts';
import { H, TEXTURE, W, cardTexture, drawCard, drawCards, markSeen, pictureBytes, planQuad, pngOf, readPlan, readRgb, type Pt, type Texture } from './order-images.ts';
import type { PlacementPlan } from '../src/placement-model.ts';
import type { Entry, Register } from '../studio/lib/media.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const revisionOf = (text: string) => `"${sha(text)}"`;
export const orderHash = (order: Order) => sha(hashInput(order));

export type OrderPreview = { revision: string; orders: Order[] };
type PlanSnapshot = Awaited<ReturnType<typeof readPlan>>;
type SavePicture = (name: string, bytes: Buffer) => Promise<{ path: string; sha256: string }>;
type WatchSource = (file: string) => Promise<void>;
type SourceManifest = Map<string, string | null>;
type PreparedOrder = {
  draft: Omit<Order, 'id' | 'created'>;
  prefix: string;
  id: string | undefined;
  files: Map<string, Buffer>;
  sourceRevision: string;
};
const PREVIEW_ID = 'forhandsvisning';
const PREVIEW_BYTES = 192 * 1024 * 1024;
const SAVED_PREVIEW_LIMIT = 64;
const PREVIEW_CONFLICT = 'Beställningsunderlaget har ändrats. Hämta en ny förhandsvisning och kontrollera den innan du sparar.';
const r1 = (v: number) => Math.round(v * 10) / 10;

export type DealerInfo = { id: string; name: string; look: string; paused?: string | null; films?: { prefix?: string } };
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
  /** The model, when not the recipe's (an exception; modelsFor: a film can be made by every model that takes a first and a last picture). */
  model?: string;
  duration?: number;
  resolution?: string;
  takes?: number;
  extra?: string | null;
  /** One more sentence after the addition, the recipe's own included (extra replaces the recipe's; this never does). */
  extraAfter?: string | null;
  /** The first picture carries a mark on the yellow back, and the text says it (a trial; src/order-prompts.ts backMark). */
  backMark?: boolean;
  /** The register entry a still is made from, or a film starts on (default: the dealer's anchor that holds). */
  base?: string | null;
  /** RETUR-2.3: approved GIV-2.3 order whose frozen last picture is used as the first picture. */
  continues?: string;
  /** The text's style (default: Kort for a film; a still has one text). */
  style?: TextStyle;
  /** The template the text is written with (src/order-prompts.ts TEMPLATE_CHOICES; absent: the recipe's, today's): 13 and 14 are choices per order, a film in the short text. */
  template?: number;
  /** A deal: bara dit, ending on the seat's own end picture (the recipe), or tur och retur (an exception). */
  shape?: Shape;
  /** A reference film (referenceCandidates), for a model that takes one. Absent: the one the recipe's rule finds; null: none (an exception). */
  reference?: string | null;
  /** The card's size on the last picture of a round trip, as a factor of the plan's (CARD_SCALES; a trial); absent: 1. */
  cardScale?: number;
  /**
   * A deal bara dit: the seat's A3 candidate (a landing picture for the seat and the laying hand that does not hold yet) named
   * as its last picture, a deliberate exception ("med kandidaten som sista bild") said in the draft's notes; absent: the seat's
   * own end picture (the A3 that holds, else the cut frame), and where the seat has neither yet, no last picture. null: no
   * last picture although the seat has one (tools/order-new.ts --no-end). Without a last picture the film ends where the
   * model leaves the card, the reference film shows the way there where one goes, the text says no last frame
   * (src/order-prompts.ts withoutLastFrame), and the seat's A3 is made afterwards from the delivered film's last frame
   * (tools/landing-make.ts).
   */
  end?: string | null;
  id?: string;
  title?: string;
  group?: { id: string; label: string } | null;
  notes?: string[];
  createdBy?: string;
};
export type Change = { title?: string; takes?: number; flipAxis?: FlipAxis; extra?: string | null; duration?: number; hand?: 'LH' | 'RH'; pass?: boolean; side?: 'FRONT' | 'BACK' };

/** The shoe and its card in a dealer's anchor (the bank's shoe stands at the same place for every dealer), in bank pixels. */
export const SHOE_AT_ANCHOR: Pt[] = [[1182, 930], [1182, 818], [1300, 700], [1480, 610], [1730, 560], [1730, 930]];
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
    seats[target] = { target, centre: centres[target], quad: quads[target], side: i.endSide, startSide: i.startSide, hand: i.takeHand, pass: i.pass, grip: i.grip ?? 'PINCH', turnAt: i.turnAt ?? 'AIR', flipAxis: i.flipAxis ?? 'FREE', crosses: crossesBody(centres[target][0], line) };
  }
  return { path: file.path, sha256: file.sha256, updatedAt: plan.updatedAt, ...line, seats };
}
/** Whether a deal's taking hand, handover and side are what Placering says for its card. */
const fromPlanOf = (plan: PlacementPlan, m: Pick<Motion, 'target' | 'hand' | 'pass' | 'side'>) => {
  const i = m.target ? plan.targets[m.target]?.intent : null;
  return !!i && i.takeHand === m.hand && i.pass === !!m.pass && i.endSide === m.side;
};

/** The anchor ("1", "2.1", "2.2") an anchor role stands for. */
const ANCHOR_OF: Record<string, Anchor> = { 'ankare-1': '1', 'ankare-2.1': '2.1', 'ankare-2.2': '2.2', 'ankare-2.3': '2.3' };
/**
 * A rendered reference film as its register must list it: under assets/references/docka/<id>/ with its hash and length, and
 * where it says its shape, ROUND_TRIP or ONE_WAY (a round trip is never the reference of a deal bara dit, referenceByRule).
 */
const isRendered = (f: unknown): f is RenderedReference => {
  const r = f as Partial<RenderedReference> | null;
  return !!r && typeof r === 'object' && typeof r.id === 'string' && ORDER_ID.test(r.id) && typeof r.edge === 'string' && r.path === `assets/references/docka/${r.id}/source.mp4` && typeof r.sha256 === 'string' && /^[0-9a-f]{64}$/.test(r.sha256) && typeof r.seconds === 'number' && r.seconds > 0
    && (r.shape === undefined || r.shape === 'ROUND_TRIP' || r.shape === 'ONE_WAY') && (r.doll === undefined || (typeof r.doll === 'string' && ORDER_ID.test(r.doll)));
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether a landing picture shows the blue side's marks, by file, frame, change and the card's outline (marksOf). */
const MARKS = new Map<string, boolean>();

/** "Paows A1 · kandidat 2", "Paows A2.1": which of the dealer's pictures a draft uses, in Jakob's notation (until 2026-11-21
 *  "Paows ankare 2.1"; a draft labelled so keeps its label until its picture changes, see followOf). */
export function anchorWords(dealerName: string, at: string, entry: Pick<Entry, 'name' | 'state'> | null): string {
  const which = !entry || entry.state === 'gäller' ? '' : (/kandidat\s*\d+/i.exec(entry.name)?.[0] ?? entry.state ?? '');
  return `${genitive(dealerName)} A${at}${which ? ` · ${which}` : ''}`;
}
/** A label that ends in the dealer's words for the picture, in today's notation or the one before 2026-11-21. */
const endsInWords = (label: string, dealerName: string, at: string, entry: Pick<Entry, 'name' | 'state'>) => {
  const words = anchorWords(dealerName, at, entry);
  return label.endsWith(words) || label.endsWith(words.split(` A${at}`).join(` ankare ${at}`));
};

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
const pausedDealer = (name: string) => `${name} är pausad: inget nytt beställs.`;
/** A seat's landing picture that holds for a hand (role landning, LAND(<seat>), gäller, the card on that seat, that hand at it), as a picture. */
export function landingEntry(register: Register, dealer: string, target: string | null, hand: 'LH' | 'RH' = 'LH'): Entry | null {
  const found = landingOf(register.dealers[dealer]?.entries ?? [], target, hand);
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
 * in the label changes). Null when nothing has changed or the picture is not a dealer's anchor. A picture built on an
 * anchor (a return's last picture: the anchor with the card drawn) follows only another anchor, never only its name.
 */
export function followOf(register: Register, dealer: string, picture: Pick<Picture, 'from' | 'waits' | 'path' | 'label'>, dealerName: string): { was: Entry; now: Entry; at: Anchor; swap: boolean } | null {
  if (!picture.from?.entry || !picture.path) return null;
  const found = entryOf(register, picture.from.entry);
  if (!found || found.dealer !== dealer || found.entry.card) return null;
  const at = ANCHOR_OF[found.entry.role];
  if (!at) return null;
  const now = holding(register, dealer, found.entry.role, found.entry.node);
  if (!now) return null;
  if (now.id !== found.entry.id) return { was: found.entry, now, at, swap: true };
  if (picture.from.built) return null;
  return endsInWords(picture.label, dealerName, at, now) ? null : { was: found.entry, now, at, swap: false };
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

export type StoreOptions = { now?: () => Date; /** Another way to take a frame out of a film than FFmpeg (tests, whose films are not films). */ frame?: (source: { path: string; frame?: number }) => Promise<Buffer> };
export function orderStore(root: string, options: StoreOptions = {}) {
  const now = options.now ?? (() => new Date());
  const dir = path.join(root, 'data/orders');
  const folderOf = (id: string) => `assets/orders/${id}`;
  const media = mediaRoles(root);
  let queue: Promise<unknown> = Promise.resolve();
  let texture: { revision: string; value: Promise<Texture> } | null = null;
  const previews = new Map<string, { drafts: PreparedOrder[]; size: number; sources: SourceManifest; input: string }>();
  // A retry only needs the original input fingerprint and IDs, so the media can be released after saving.
  const savedPreviews = new Map<string, { input: string; orders: Pick<Order, 'id'>[] }>();
  let previewBytes = 0;
  async function tex(watch?: WatchSource) {
    const files = [path.join(root, TEXTURE.image)];
    if (watch) await Promise.all(files.map(watch));
    const revision = (await Promise.all(files.map(sourceStamp))).join('/');
    if (texture?.revision !== revision) {
      const value = cardTexture(root).catch((error) => { if (texture?.revision === revision) texture = null; throw error; });
      texture = { revision, value };
    }
    return texture.value;
  }
  // Hashes of the files on disk, kept while their size and time are the same: the page asks on every read.
  const hashes = new Map<string, { stamp: string; sha256: string }>();

  const fileOf = (id: string) => { if (typeof id !== 'string' || !ORDER_ID.test(id) || id.length > 80) throw new StoreError(400, 'Ogiltigt beställnings-id.'); return path.join(dir, `${id}.json`); };
  const serial = <T>(work: () => Promise<T>): Promise<T> => { const task = queue.then(work); queue = task.then(() => {}, () => {}); return task; };

  // Track identity, size and both clocks, including files absent when a fallback was chosen.
  async function sourceStamp(file: string): Promise<string | null> {
    try {
      const s = await stat(file, { bigint: true });
      return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
  }
  async function checkSources(sources: SourceManifest) {
    const unchanged = await Promise.all([...sources].map(async ([file, stamp]) => await sourceStamp(file) === stamp));
    if (unchanged.includes(false)) throw new StoreError(409, PREVIEW_CONFLICT);
  }
  async function readJson<T>(file: string, watch?: WatchSource): Promise<T | null> {
    await watch?.(file);
    try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return null; }
  }
  async function readArchiveInput<T>(relativeFile: string, optional = false): Promise<T | null> {
    try {
      const value = JSON.parse(await readFile(path.join(root, relativeFile), 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metadata');
      return value as T;
    } catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new StoreError(409, `Arkivstatus kan inte verifieras: ${relativeFile} kan inte läsas som ett register.`);
    }
  }
  async function readPolicy(watch?: WatchSource): Promise<Policy | null> { const p = await readJson<Policy>(path.join(root, 'data/order-policy.json'), watch); return p?.schemaVersion === 1 && Array.isArray(p.prices) ? p : null; }
  async function readDealers(watch?: WatchSource): Promise<DealerInfo[]> { return (await readJson<{ dealers: DealerInfo[] }>(path.join(root, 'data/dealers.json'), watch))?.dealers ?? []; }
  async function readRegister(watch?: WatchSource): Promise<Register> {
    await watch?.(path.join(root, 'data/media-roles.json'));
    const { register, errors } = await media.readRegister();
    if (!register) throw new StoreError(500, `Registret håller inte: ${errors.join('; ')}`);
    return register;
  }
  async function readReceipt(id: string): Promise<Receipt | null> { const r = await readJson<Receipt>(path.join(root, folderOf(id), 'receipt.json')); return r?.schemaVersion === 1 ? r : null; }
  /**
   * The bank as a reference film needs it, read as the lab's GET /api/clip-bank reads it (tools/preview.ts clipBank): the
   * job file's takes, each take's record (a derived take's own review, its film's facts) from motions/<id>.json.
   */
  async function readBank(watch?: WatchSource, archive?: { sourceIds: Set<string>; unreadable: Set<string> }): Promise<BankFacts> {
    type Lists = { jobs?: unknown[]; derived?: unknown[]; edits?: unknown[] };
    const file = archive ? await readArchiveInput<Lists>('data/clip-jobs.json') : await readJson<Lists>(path.join(root, 'data/clip-jobs.json'), watch);
    const named = <T>(list: unknown): T[] => (Array.isArray(list) ? list : []).filter((x) => typeof (x as { id?: unknown })?.id === 'string' && ORDER_ID.test((x as { id: string }).id)) as T[];
    const jobs = named<NonNullable<BankFacts['jobs']>[number]>(file?.jobs), edits = named<NonNullable<BankFacts['edits']>[number]>(file?.edits);
    const derived = named<NonNullable<BankFacts['derived']>[number]>(file?.derived).filter((d) => typeof d.clip === 'string' && ORDER_ID.test(d.clip));
    const holdsList = (raw: unknown, length: number) => Array.isArray(raw) && raw.length === length;
    if (archive && (!holdsList(file?.jobs, jobs.length) || (file?.edits !== undefined && !holdsList(file.edits, edits.length)) ||
      (file?.derived !== undefined && !holdsList(file.derived, derived.length)) ||
      derived.some((d) => !Array.isArray(d.frames) || d.frames.length !== 2 || !d.frames.every(Number.isInteger) || (d.editOf != null && (typeof d.editOf !== 'string' || !ORDER_ID.test(d.editOf)))) ||
      edits.some((e) => e.source?.clip != null && (typeof e.source.clip !== 'string' || !ORDER_ID.test(e.source.clip))))) {
      throw new StoreError(409, 'Arkivstatus kan inte verifieras: data/clip-jobs.json har ogiltiga källposter.');
    }
    const motions: NonNullable<BankFacts['motions']> = {};
    type Fact = NonNullable<NonNullable<BankFacts['motions']>[string]>;
    const record = async (id: string) => {
      const relativeFile = `motions/${id}.json`;
      if (!archive) return readJson<Fact>(path.join(root, relativeFile), watch);
      try { return await readArchiveInput<Fact>(relativeFile, true); }
      catch { archive.unreadable.add(id); return null; }
    };
    for (const j of [...jobs, ...edits]) motions[j.id] = await record(j.id);
    // A derived take: its own verdict (an archive too) and the hand that laid the card, its film's facts; the film itself too.
    for (const d of derived) { const own = await record(d.id), clip = await record(d.clip); motions[d.id] = { source: clip?.source, review: own?.review, motion: own?.motion }; if (!(d.clip in motions)) motions[d.clip] = clip; }
    const sources = [...(archive?.sourceIds ?? []), ...derived.map((d) => d.editOf), ...edits.map((e) => e.source?.clip)];
    for (const id of sources) if (typeof id === 'string' && ORDER_ID.test(id) && !(id in motions)) motions[id] = await record(id);
    if (archive) return { jobs, derived, edits, motions };
    // The picture checks of cut frames as they are written down (data/cut-frames.json): what Material and Bordet read too.
    return { jobs, derived, edits, motions, rendered: await readRendered(watch), cutChecks: readCutChecks(await readJson(path.join(root, 'data/cut-frames.json'), watch)) };
  }
  /** The dummy's rendered reference films (data/rendered-references.json: films[]); an entry that does not hold its shape is left out. */
  async function readRendered(watch?: WatchSource): Promise<RenderedReference[]> {
    const file = await readJson<{ films?: unknown[] }>(path.join(root, 'data/rendered-references.json'), watch);
    return (Array.isArray(file?.films) ? file.films : []).filter(isRendered);
  }
  /** The method register, or null where it is missing or does not hold (every draft then has to say its own values). */
  async function readMethodRegister(watch?: WatchSource): Promise<MethodRegister | null> {
    return readMethods(await readJson(path.join(root, 'data/order-methods.json'), watch)).register;
  }

  async function load(id: string, watch?: WatchSource): Promise<{ order: Order; revision: string; text: string }> {
    let text: string;
    const file = fileOf(id);
    await watch?.(file);
    try { text = await readFile(file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError(404, 'Beställningen finns inte.'); throw error; }
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

  /** A picture of the register, read from its file or its film's frame. */
  async function sourceBytes(register: Register, source: { entry: string }, watch?: WatchSource): Promise<{ bytes: Buffer; from: NonNullable<Picture['from']> }> {
    const found = entryOf(register, source.entry);
    if (!found || !isPicture(found.entry)) throw new StoreError(404, `${source.entry} finns inte som bild i registret.`);
    const e = found.entry;
    await watch?.(path.join(root, e.path!));
    return { bytes: await pictureBytes(root, { path: e.path!, frame: e.frame }), from: { entry: e.id, path: e.path, ...(e.frame !== undefined ? { frame: e.frame } : {}), note: `${e.name}${e.state ? ` (${e.state})` : ''}` } };
  }
  async function drawOn(base: Buffer, target: string, side: 'FRONT' | 'BACK' | null, scale = 1, snapshot?: PlanSnapshot, watch?: WatchSource) {
    const { plan, file } = snapshot ?? await readPlan(root);
    const { rgb, drawn } = drawCard(await readRgb(base), await tex(watch), plan, file, target, side, scale);
    return { bytes: await pngOf(rgb), drawn };
  }

  /**
   * The two pictures of a step whose cards are drawn on its anchor (the hole card's turn): the dealer's anchor that holds,
   * with every card of step.cards as it lies before (first) and after (last), where the plan says. While the anchor waits,
   * both pictures say that they wait. Drawn anew on every refresh, so they follow the anchor chosen in Material and the plan.
   */
  async function cardPictures(save: SavePicture, step: StepDef, register: Register, dealer: DealerInfo, snapshot?: PlanSnapshot, watch?: WatchSource): Promise<Picture[]> {
    const at = step.from, entry = holding(register, dealer.id, ANCHOR_ROLE[at], ANCHOR_NODE[at]), words = anchorWords(dealer.name, at, entry);
    const cards = step.cards ?? [], sideWords = (s: 'FRONT' | 'BACK') => (s === 'FRONT' ? 'öppet' : 'stängt');
    const labels = { first: `Första bild · ${words} + hålkortet ${sideWords(cards[cards.length - 1]?.before ?? 'BACK')}`, last: `Slutbild · samma, hålkortet ${sideWords(cards[cards.length - 1]?.after ?? 'FRONT')}` };
    if (!entry) {
      const waits: Waits = { dealer: dealer.id, role: ANCHOR_ROLE[at], node: ANCHOR_NODE[at], label: `ankare ${at}` };
      return [{ name: 'first.png', label: labels.first, goesAs: 'startFrame', path: null, sha256: null, from: null, waits }, { name: 'last.png', label: labels.last, goesAs: 'endFrame', path: null, sha256: null, from: null, waits }];
    }
    const { bytes, from } = await sourceBytes(register, { entry: entry.id }, watch);
    const { plan, file } = snapshot ?? await readPlan(root), base = await readRgb(bytes), texture = await tex(watch);
    const out: Picture[] = [];
    for (const [name, goesAs, when] of [['first.png', 'startFrame', 'before'], ['last.png', 'endFrame', 'after']] as const) {
      const made = drawCards(base, texture, plan, file, cards.map((c) => ({ target: c.target, side: c[when] })));
      out.push({ name, label: labels[when === 'before' ? 'first' : 'last'], goesAs, ...(await save(name, await pngOf(made.rgb))), width: 1764, height: 1174, from: { ...from, note: `${from.note}; dealerns kort ritade där planen säger` }, waits: null, drawn: made.drawn, drawnBeside: made.beside });
    }
    return out;
  }

  // ── Building a draft ───────────────────────────────────────────────────────
  async function nextId(prefix: string): Promise<string> {
    const taken = new Set((await readdir(dir).catch(() => [] as string[])).map((f) => f.replace(/\.json$/, '')));
    for (let n = 1; n < 100; n++) { const id = `${prefix}-${String(n).padStart(2, '0')}`; if (!taken.has(id)) return id; }
    throw new StoreError(409, 'För många beställningar med samma namn.');
  }

  /**
   * The draft's text from its choices: the dealer's look, the step, the motion, and where the card lands: where the last
   * picture draws it, or the plan's own point for the card (before that picture exists, or where it draws no card of its
   * own: an A3). The plan's point is stored with the text (prompt.place), so that the sent words reproduce whatever the
   * plan says later.
   */
  async function textOf(order: Pick<Order, 'step' | 'motion' | 'generation' | 'pictures' | 'prompt' | 'reference'>, dealer: DealerInfo, extra: string | null, snapshot?: PlanSnapshot, files?: ReadonlyMap<string, Buffer>): Promise<Order['prompt']> {
    const end = order.pictures.find((p) => p.goesAs === 'endFrame'), drawn = end?.drawn ?? null;
    const target = order.motion?.target ?? stepOf(order.step.key)?.target ?? null;
    const planPlace = !drawn && target ? planCentre((snapshot ?? await readPlan(root)).plan, target) : null;
    // An open deal whose last picture shows the blue side's marks (the pink cross, the red circle) says them: the card drawn
    // with them, or seen in the picture's own pixels where it draws no card of its own (an A3, a film's frame). A return
    // says them where its first picture, the seat's landing picture, shows them (Bordet's review, 2026-11-21). A draft not yet
    // saved reads its pictures where they are kept until then (files): the preview's text is the order's.
    let faceMark = false;
    const giv = order.step.key.startsWith('GIV-'), retur = order.step.key.startsWith('RETUR-');
    const shows = giv ? end : retur ? order.pictures.find((p) => p.goesAs === 'startFrame') : undefined;
    // A deal with no last picture says the marks as well: its A3 is made afterwards with the plan's card drawn on the seat,
    // marks and all (tools/landing-make.ts), as pilot 02's last picture showed them.
    if (giv && !end && order.step.shape === 'ONE_WAY' && target && order.motion?.side === 'FRONT') faceMark = true;
    else if (shows && target && order.motion?.side === 'FRONT') {
      const kept = files?.get(shows.name);
      if (giv && drawn) faceMark = !!drawn.mark;
      else if (kept || shows.path) { try { faceMark = markSeen(await readRgb(kept ?? path.join(root, ...shows.path!.split('/'))), planQuad((snapshot ?? await readPlan(root)).plan, target)); } catch { faceMark = false; } }
    }
    const backMark = !!order.prompt?.backMark;
    const { template, style, text } = orderPrompt({ ...order, prompt: { ...order.prompt, extra, faceMark, backMark } }, dealer, planPlace);
    return { template, style, text, sha256: sha(text), extra, middle: false, ...(planPlace ? { place: [planPlace.x, planPlace.y] as [number, number] } : {}), ...(faceMark ? { faceMark: true } : {}), ...(backMark ? { backMark: true } : {}) };
  }

  /** The short two-hand prompt turns a face-up deal over the short end (template 11). */
  function fixedTwoHandTurn(step: StepKey, style: TextStyle | undefined, turn: boolean, selected?: FlipAxis | null, recipe?: ReturnType<typeof recipeFor>): 'FREE' | null {
    if (step !== 'GIV-2.3' || style !== 'KORT' || !turn) return null;
    const problem = shortTwoHandTurnProblem(step, style, turn, selected);
    if (problem) throw new StoreError(400, problem);
    if (recipe?.turn && recipe.turn !== 'FREE') throw new StoreError(400, `Recept ${recipe.method.id} anger ${recipe.turn}. ${SHORT_TWO_HAND_TURN_HELP}`);
    return 'FREE';
  }

  /**
   * The last approved deal from 2.3 to the seat, bara dit, whose frozen last picture is an A3 candidate for the right hand:
   * what a return to 2.3 continues from when the order names neither (his notation, "A3P4C1 - A2.3").
   */
  async function lastFrozenDeal(register: Register, dealer: string, target: string): Promise<{ base?: string; continues?: string }> {
    const candidates = new Set(a3Candidates(register.dealers[dealer]?.entries ?? [], target, 'RH').filter(isPicture).map((e) => e.id));
    let best: { at: string; base: string; continues: string } | null = null;
    for (const name of (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'))) {
      const id = name.slice(0, -5);
      if (!ORDER_ID.test(id)) continue;
      const order = (await load(id).catch(() => null))?.order;
      const end = order?.pictures.find((p) => p.goesAs === 'endFrame');
      if (!order?.approval || order.status !== 'GODKÄND' || order.dealer !== dealer || order.step.key !== 'GIV-2.3' || order.step.shape !== 'ONE_WAY' || order.step.edge !== `READY-C>${target}` || !end?.from?.entry || !candidates.has(end.from.entry)) continue;
      if (!best || order.approval.at > best.at) best = { at: order.approval.at, base: end.from.entry, continues: order.id };
    }
    return best ? { base: best.base, continues: best.continues } : {};
  }

  /** The RH candidate must be the exact still at the approved deal's outgoing edge. */
  async function frozenReturnStart(register: Register, dealer: string, target: string, input: NewOrder, watch?: WatchSource) {
    const named = input.base || input.continues ? { base: input.base, continues: input.continues } : await lastFrozenDeal(register, dealer, target);
    const entry = a3Candidates(register.dealers[dealer]?.entries ?? [], target, 'RH').find((e) => e.id === named.base && isPicture(e));
    if (!entry) throw new StoreError(400, `Returprovet behöver en namngiven A3-kandidat (base) för ${seatWords(target)} med höger hand vid kortet, eller en godkänd GIV-2.3 dit med en sådan som fryst slutbild.`);
    if (!named.continues) throw new StoreError(400, 'Returprovet behöver id för given det fortsätter från (continues).');
    const { order } = await load(named.continues, watch);
    const end = order.pictures.find((p) => p.goesAs === 'endFrame');
    const frozen = `${folderOf(order.id)}/last.png`;
    const side = order.motion?.side;
    if (order.status !== 'GODKÄND' || order.approval?.orderSha256 !== orderHash(order) || order.dealer !== dealer ||
        order.step.key !== 'GIV-2.3' || order.step.shape !== 'ONE_WAY' || order.step.edge !== `READY-C>${target}` ||
        order.motion?.target !== target || order.motion.grip !== 'TWO_HANDS' || (side !== 'FRONT' && side !== 'BACK') ||
        end?.from?.entry !== entry.id || end.path !== frozen || !end.sha256) {
      throw new StoreError(400, 'Given måste vara en godkänd GIV-2.3 bara dit för samma dealer och kort, med den valda A3-kandidaten som fryst slutbild.');
    }
    const file = path.join(root, frozen);
    await watch?.(file);
    const usable = await servable(frozen);
    const bytes = usable ? await readFile(usable).catch(() => null) : null;
    if (!bytes || sha(bytes) !== end.sha256) throw new StoreError(409, 'Givens frysta slutbild saknas eller stämmer inte med dess SHA256.');
    const candidate = await sourceBytes(register, { entry: entry.id }, watch);
    if (sha(candidate.bytes) !== end.sha256) throw new StoreError(409, 'A3-kandidatens bild stämmer inte med givens frysta slutbild.');
    return { bytes, entry, path: frozen, side, orderId: order.id };
  }

  async function prepare(input: NewOrder, watch?: WatchSource): Promise<PreparedOrder> {
    const step = stepOf(input.step);
    if (!step) throw new StoreError(400, 'Okänt steg.');
    const return23 = step.key === 'RETUR-2.3';
    if (!return23 && step.off) throw new StoreError(400, `${step.label}: ${step.off}`);
    const toRest = step.key === 'RETUR-1';
    if (!return23 && !toRest && input.continues !== undefined) throw new StoreError(400, 'Föregående giv väljs bara för en retur från kortet: returprovet till 2.3 eller returen till vila.');
    const dealers = await readDealers(watch), dealer = dealers.find((d) => d.id === input.dealer);
    if (!dealer) throw new StoreError(400, unknownDealer(input.dealer));
    // A paused dealer (data/dealers.json paused, his words and date) gets nothing new; her drafts and orders stay as they are.
    if (dealer.paused) throw new StoreError(409, pausedDealer(dealer.name));
    const policy = await readPolicy(watch);
    if (!policy) throw new StoreError(500, 'data/order-policy.json kunde inte läsas.');
    const register = await readRegister(watch);
    // A step about one card that is not chosen (the hole card's turn) has its own; a deal or a return, the seat chosen.
    const target = step.target ?? (step.card ? (input.target ?? null) : null);
    await watch?.(path.join(root, 'placements/default.json'));
    const snapshot = await readPlan(root), { plan } = snapshot;
    if (step.card && (!target || !plan.targets[target])) throw new StoreError(400, 'Välj en plats på bordet: P1.C1 … P7.C2 eller D.C1–D.C3 (i hans skrivsätt till exempel "A2.3 - A3P4C2").');
    if (step.cards?.some((c) => !plan.targets[c.target])) throw new StoreError(400, `Planen saknar ${step.cards.filter((c) => !plan.targets[c.target]).map((c) => c.target).join(' och ')}.`);
    // The step's one recipe (data/order-methods.json): everything the order does not say itself comes from it, and what the
    // order says against it is a deliberate exception, named in the draft's notes. A step without a recipe has no default.
    const recipe = recipeFor(await readMethodRegister(watch), step.key, target);
    const noRecipe = `${step.label} har ingen metod än (data/order-methods.json), så inget är förvalt`;
    const style = input.style ?? recipe?.style ?? defaultStyle(step.kind);
    if (!stylesFor(step.kind, step).includes(style)) throw new StoreError(400, step.styles ? `${step.label} skrivs ${step.styles.join(' eller ')}.` : step.kind === 'STILL' ? 'En bild skrivs KORT.' : 'Texten är KORT eller MINIMAL; den långa texten (UTFÖRLIG) skrivs inte längre för en ny beställning.');
    // The template: the order's own choice (TEMPLATE_CHOICES), else the recipe's, written into the draft's prompt so that the
    // text keeps it when written again (orderPrompt). Templates 13 and 14 are short texts only, so a film in another style
    // that names no template is written with today's, and the draft's notes say so (the exceptions below): Bordet's row
    // offers the minimal text beside the short one, also where the recipe's template is 14 (the deal from 2.3 since 2026-11-23).
    const mall = input.template ?? (step.kind === 'FILM' && style === 'KORT' ? recipe?.template : null) ?? TEMPLATE_VERSION;
    if (!TEMPLATE_CHOICES.includes(mall)) throw new StoreError(400, `Mallen är ${TEMPLATE_CHOICES_WORDS}.`);
    if (mall !== TEMPLATE_VERSION && (step.kind !== 'FILM' || style !== 'KORT')) throw new StoreError(400, `Mall ${mall} skrivs bara för en film i den korta texten (KORT).`);
    const returnStart = return23 ? await frozenReturnStart(register, dealer.id, target!, input, watch) : null;
    // Other returns start on the seat's landing picture that holds, for the hand that laid the card (with handbyte the right
    // hand's): the one Bordet's row looks for (lib/bordet.ts), and the hand the motion below comes out with.
    const planned = target ? plan.targets[target].intent : null;
    const laid = handsIn(input.hand !== undefined || input.pass !== undefined
      ? { hand: input.pass ? 'LH' : (input.hand ?? planned?.takeHand ?? 'LH'), pass: !!input.pass && !!planned }
      : recipeHands(step, recipe, planned ? { hand: planned.takeHand, pass: planned.pass } : null)).lays;
    const landing = step.start === 'LAND' && !return23 && !(toRest && input.continues) ? landingEntry(register, dealer.id, target, laid) : null;
    // The return to rest continues a give (Jakob 2026-11-23: from the laid card "direkt" to A1): where no landing picture
    // holds, or the order names the give, it starts on that give's last frame in the bank's own film (giveEndOf).
    const giveEnd = toRest && !landing ? giveEndOf(await readBank(watch), { dealer: dealer.id, target, named: input.continues ?? null }) : null;
    if (toRest && input.continues && !giveEnd) throw new StoreError(400, `${input.continues} är ingen giv i banken till ${seatWords(target)} som en retur kan fortsätta (en annan plats, arkiverad eller underkänd).`);
    if (step.start === 'LAND' && !returnStart && !landing && !giveEnd) throw new StoreError(400, landingMissing(dealer.name, target));
    if (giveEnd && ((input.hand !== undefined && input.hand !== giveEnd.lays) || input.pass === true)) throw new StoreError(400, 'Returen fortsätter given i banken: handen som lade kortet går tillbaka, utan handbyte.');
    if (returnStart && !holding(register, dealer.id, ANCHOR_ROLE['2.3'], ANCHOR_NODE['2.3'])) throw new StoreError(400, 'Returprovet behöver ett gällande ankare 2.3 som sista bild.');
    if (returnStart && (input.hand === 'LH' || input.pass === true || input.flipAxis !== undefined || (input.side !== undefined && input.side !== returnStart.side))) {
      throw new StoreError(400, 'Returprovet följer bilden: höger hand tillbaka utan handbyte och kortet ligger med samma sida upp.');
    }
    if (returnStart && input.reference != null) throw new StoreError(400, 'Returprovet använder den frysta första och sista styrbilden utan referensfilm.');
    const modelId = input.model === undefined || input.model === null ? (recipe?.model ?? null) : String(input.model);
    if (!modelId) throw new StoreError(400, `${noRecipe}: säg modell (${modelsFor(step).filter((m) => !m.off).map((m) => m.id).join(', ')}) och längd själv.`);
    const model = modelFor(step, modelId);
    if (!model) throw new StoreError(400, `${String(input.model)} kan inte göra ${step.label}: välj ${modelsFor(step).filter((m) => !m.off).map((m) => m.id).join(', ')}.`);
    if (model.off) throw new StoreError(400, `${model.label} beställs inte längre: ${model.off}`);
    const takes = input.takes ?? recipe?.takes ?? 1;
    if (!Number.isInteger(takes) || takes < 1 || takes > TAKES_MAX) throw new StoreError(400, `Tagningar ska vara 1–${TAKES_MAX}.`);
    // The free addition is refused beyond the limit, as change() refuses it: cut, it would end the text mid-sentence unseen.
    if (input.extra !== undefined && input.extra !== null && typeof input.extra !== 'string') throw new StoreError(400, 'Tillägget ska vara en text.');
    if (input.extraAfter !== undefined && input.extraAfter !== null && typeof input.extraAfter !== 'string') throw new StoreError(400, 'Meningen efter tillägget ska vara en text.');
    const extra = [(input.extra === undefined ? recipe?.extra : input.extra)?.trim(), input.extraAfter?.trim()].filter(Boolean).join(' ') || null;
    if (extra && extra.length > EXTRA_LIMIT) throw new StoreError(400, `Tillägget får vara högst ${EXTRA_LIMIT} tecken (det här har ${extra.length}).`);
    const intent = target ? plan.targets[target].intent : null;
    if (input.hand !== undefined && input.hand !== 'LH' && input.hand !== 'RH') throw new StoreError(400, 'Handen ska vara LH eller RH.');
    if (input.pass !== undefined && typeof input.pass !== 'boolean') throw new StoreError(400, 'Handbyte ska vara sant eller falskt.');
    if (input.side !== undefined && input.side !== 'FRONT' && input.side !== 'BACK') throw new StoreError(400, 'Kortet landar FRONT (öppet) eller BACK (stängt).');
    const side: 'FRONT' | 'BACK' = returnStart?.side ?? input.side ?? intent?.endSide ?? 'FRONT';
    // GIV-2.3's shoe and text start on yellow, even when the plan describes a face-up start.
    const turn = step.key === 'GIV-2.3' ? side === 'FRONT' : step.start !== 'LAND' && !!intent && side !== intent.startSide;
    const chosenAxis = input.flipAxis ?? recipe?.turn ?? defaultFlip(step.key, intent?.turnAt, intent?.flipAxis);
    if (!FLIP_AXES.includes(chosenAxis)) throw new StoreError(400, 'Okänd vändning.');
    const flipAxis = fixedTwoHandTurn(step.key, style, turn, input.flipAxis, recipe) ?? chosenAxis;
    const deal = step.card && step.start !== 'LAND';
    if (input.shape !== undefined && input.shape !== 'ROUND_TRIP' && input.shape !== 'ONE_WAY') throw new StoreError(400, 'En giv är ONE_WAY (bara dit) eller ROUND_TRIP (tur och retur).');
    if (input.shape !== undefined && !deal && input.shape !== 'ONE_WAY') throw new StoreError(400, 'Bara en giv kan gå tur och retur.');
    // A deal is bara dit unless the recipe or the order says tur och retur (the trials hold only for bara dit, handbook §5).
    const shape: Shape | null = step.kind !== 'FILM' ? null : deal ? (input.shape ?? recipe?.shape ?? 'ONE_WAY') : 'ONE_WAY';
    // For ordinary deals an optional handover is an explicit exception. From anchor 2.3 the hand at the shoe
    // strokes the card out and the other hand always lays it.
    const twoHands = twoHandMotion(step.key, step.grip);
    // Nothing said: the one rule Bordet's row and the production list take too (recipeHands).
    const said = input.pass !== undefined || input.hand !== undefined;
    const byLine = recipeHands(step, recipe, intent ? { hand: intent.takeHand, pass: intent.pass } : null);
    const pass = twoHands?.pass ?? (returnStart || giveEnd ? false : !said ? byLine.pass : !step.card || !intent ? false : (input.pass ?? false));
    const hand: 'LH' | 'RH' = twoHands?.hand ?? (returnStart ? 'RH' : giveEnd ? giveEnd.lays : !said ? byLine.hand : pass ? 'LH' : (input.hand ?? intent?.takeHand ?? 'LH'));
    if (!twoHands && pass && input.hand === 'RH') throw new StoreError(400, 'Handbyte går från vänster hand till höger: vänster tar kortet ur skon.');
    const lays: 'LH' | 'RH' = handsIn({ hand, pass }).lays;
    const bank = step.kind === 'FILM' ? await readBank(watch) : null;
    // A deal bara dit ends on the seat's own end picture: its landing picture where one holds, else the cut frame of the
    // bank's own film to the seat. A seat with neither yet gets its deal without a last picture (`open`), which is also
    // what the order can ask for where the seat has one (end: null): the seat's A3 is then made from the film's last frame.
    const oneWayDeal = deal && shape === 'ONE_WAY';
    // The seat's A3 for the hand that lays the card; or, as a named exception, an A3 candidate for that seat and hand.
    if (input.end !== undefined && ((input.end !== null && typeof input.end !== 'string') || !oneWayDeal)) throw new StoreError(400, 'Slutbilden väljs bara för en giv bara dit, som en A3-kandidat för platsen eller ingen alls.');
    const named = input.end ? a3Candidates(register.dealers[dealer.id]?.entries ?? [], target, lays).find((e) => e.id === input.end && isPicture(e)) ?? null : null;
    if (input.end && !named) throw new StoreError(400, `${input.end} är ingen A3-kandidat för ${seatWords(target)} med ${lays === 'RH' ? 'höger' : 'vänster'} hand vid kortet.`);
    const seatLanding = named ?? (oneWayDeal && input.end !== null ? landingEntry(register, dealer.id, target, lays) : null);
    const cuts = oneWayDeal && input.end !== null && !seatLanding ? cutFrameOf(bank!, { dealer: dealer.id, step, target, hand: lays }) : [];
    const open = oneWayDeal && !seatLanding && !cuts.length;
    if (input.reference !== undefined && input.reference !== null && typeof input.reference !== 'string') throw new StoreError(400, 'Referensfilmen ska vara en tagnings id.');
    const cardScale = input.cardScale ?? 1;
    if (!(CARD_SCALES as readonly unknown[]).includes(cardScale)) throw new StoreError(400, `Kortets storlek ska vara ${CARD_SCALES.map((f) => scaleWords(f)).join(', ')}.`);
    if (cardScale !== 1 && !(deal && shape === 'ROUND_TRIP')) throw new StoreError(400, 'Kortets storlek väljs bara för tur och retur, där sista bilden ritas; i bara dit och en retur är kortet som i sista bilden.');
    if (input.reference && !model.videos) throw new StoreError(400, `${model.label} tar ingen referensfilm tillsammans med första och sista bild.`);
    // The reference film: the one the order names; none when it says null; else the one the recipe's rule finds for the
    // step and the seat. Where the rule finds none the draft is made without one, and its notes say what was not there.
    let chosen: RefCandidate | null = null, absent: string | null = null;
    if (input.reference) {
      chosen = referenceCandidates(bank ?? {}, { dealer: dealer.id, step, target, model }).find((c) => c.take === input.reference || c.film === input.reference) ?? null;
      if (!chosen) throw new StoreError(400, `${input.reference} finns inte bland bankens tagningar för ${step.label}${target ? ` till ${seatWords(target)}` : ''}.`);
      if (!chosen.fits) throw new StoreError(400, `Referensfilmen är ${secondsWords(chosen.seconds)}; ${model.label} tar ${model.referenceSeconds?.join('–')} s.`);
    } else if (input.reference === undefined && recipe && recipe.reference !== 'ingen' && model.videos) {
      chosen = referenceByRule(bank, recipe.reference, { dealer: dealer.id, step, target, model, shape, lays });
      if (!chosen) absent = `${referenceAbsent(recipe.reference, step)}${lays === 'RH' && !twoHands ? ' (lagd med höger hand)' : ''}`;
    }
    const seat = target && step.card ? target.toLowerCase().replace('.c1', '').replace('.', '-') : null;
    const prefix = [dealer.id, step.key.toLowerCase().replace('.', '-'), seat].filter(Boolean).join('-');

    // Generation parameters by name, as the tools take them for this model. The length: the order's own, else the reference
    // film's (the text says "with the same timing"), else the recipe's.
    if (input.resolution !== undefined && typeof input.resolution !== 'string') throw new StoreError(400, 'Upplösningen ska vara en text.');
    if (input.duration !== undefined && typeof input.duration !== 'number') throw new StoreError(400, 'Längden ska vara ett tal.');
    const seconds = step.kind !== 'FILM' ? undefined : (input.duration ?? secondsOf(model, recipe?.seconds ?? null, chosen) ?? undefined);
    if (step.kind === 'FILM' && seconds === undefined) throw new StoreError(400, `${noRecipe}: säg längden själv (${model.durations?.join('–')} s för ${model.label}).`);
    const params = paramsOf(step, model, { duration: seconds, resolution: input.resolution ?? recipe?.resolution });
    if (step.kind === 'FILM') {
      if (input.resolution !== undefined && model.resolutions && !model.resolutions.includes(input.resolution)) throw new StoreError(400, `${model.label} tar ${model.resolutions.join(', ')}, inte ${input.resolution}.`);
      const d = Number(params.duration);
      if (model.durations && !(d >= model.durations[0] && d <= model.durations[1])) throw new StoreError(400, `Längden ska vara ${model.durations[0]}–${model.durations[1]} s för ${model.label}.`);
    }
    const cost = costOf({ model: model.id, params }, takes, policy.prices);
    if (!cost) throw new StoreError(400, `Inget pris för ${model.label} med de här värdena i data/order-policy.json.`);
    // Where the draft departs from the recipe, said once in its notes (a deliberate exception, never a silent one).
    const exceptions: string[] = [];
    if (recipe) {
      if (model.id !== recipe.model) exceptions.push(`modell ${model.label} i stället för ${MODELS[recipe.model]?.label ?? recipe.model}`);
      if (deal && shape !== recipe.shape) exceptions.push(`${shape === 'ONE_WAY' ? 'bara dit' : 'tur och retur'} i stället för ${recipe.shape === 'ONE_WAY' ? 'bara dit' : 'tur och retur'}`);
      if (style !== recipe.style) exceptions.push(`texten ${STYLE_LABEL[style].toLowerCase()} i stället för ${STYLE_LABEL[recipe.style as keyof typeof STYLE_LABEL]?.toLowerCase() ?? recipe.style}`);
      if (mall !== recipe.template) exceptions.push(`mall ${mall} i stället för ${recipe.template}`);
      if (recipe.turn && input.flipAxis && input.flipAxis !== recipe.turn) exceptions.push(`vändningen "${FLIP_LABEL[input.flipAxis as FlipAxis] ?? input.flipAxis}" i stället för "${FLIP_LABEL[recipe.turn as FlipAxis] ?? recipe.turn}"`);
      if (recipe.reference !== 'ingen' && !chosen) exceptions.push(absent ? `ingen referensfilm: ${absent}` : 'ingen referensfilm fast receptet vill ha en');
      if (recipe.reference === 'ingen' && chosen) exceptions.push('en referensfilm fast receptet inte har någon');
      if (chosen?.doll) exceptions.push(`referensfilmen är dockan ${chosen.doll}s egen film (${chosen.take}), vald med namn: en dockas film är aldrig förvald`);
      if (input.duration !== undefined && input.duration !== secondsOf(model, recipe.seconds, chosen)) exceptions.push(`${input.duration} s i stället för ${secondsOf(model, recipe.seconds, chosen)} s`);
      if (takes !== recipe.takes) exceptions.push(`${takes} tagningar i stället för ${recipe.takes}`);
      if (open) exceptions.push(openEndWords(target!));
      if (named) exceptions.push(`med kandidaten som slutbild: ${named.name}, en kandidat som Jakob inte har gjort gällande`);
      if (deal && !twoHands && recipe.hand && (pass || hand !== recipe.hand)) exceptions.push(`${pass ? 'handbyte' : hand === 'RH' ? 'höger hand hela vägen' : 'vänster hand hela vägen'} i stället för ${recipe.hand === 'LH' ? 'handen vid skon hela vägen' : 'andra handen hela vägen'}`);
    }

    const files = new Map<string, Buffer>();
    const save: SavePicture = async (name, bytes) => {
      files.set(name, bytes);
      return { path: `${folderOf(PREVIEW_ID)}/${name}`, sha256: sha(bytes) };
    };
    const pictures: Picture[] = [];
    const notes = [
      ...(input.notes ?? []),
      // the recipe by name, with what has been tried with it in plain words (triedWords), never its status
      ...(recipe ? [`Recept ${recipe.method.id}: ${triedWords(recipe.method).tried}.`] : [`Inget recept finns för ${step.label}: varje värde är valt för den här beställningen.`]),
      ...(exceptions.length ? [`Undantag från receptet: ${exceptions.join('; ')}.`] : []),
      ...(returnStart ? [`Provundantag: A3-kandidaten ${returnStart.entry.name ?? a3Name(target!)} används som första bild, byte för byte ur den godkända givens slutbild.`, takes > 1 ? RETURN_23_BLOCK : RETURN_23_TRIAL] : []),
    ];
    const anchorPicture = async (name: string, label: (words: string) => string, goesAs: Picture['goesAs'], at: Anchor, tag?: string): Promise<{ picture: Picture; bytes: Buffer | null }> => {
      const namedBase = !return23 && at === step.from ? input.base : null;
      const entry = namedBase ? entryOf(register, namedBase)?.entry ?? null : holding(register, dealer.id, ANCHOR_ROLE[at], ANCHOR_NODE[at]);
      if (namedBase && !entry) throw new StoreError(404, `${namedBase} finns inte i registret.`);
      const words = anchorWords(dealer.name, at, entry);
      if (entry) {
        const { bytes, from } = await sourceBytes(register, { entry: entry.id }, watch);
        return { picture: { name, label: label(words), goesAs, ...(tag ? { tag } : {}), ...(await save(name, bytes)), width: 1764, height: 1174, from, waits: null }, bytes };
      }
      return { picture: { name, label: label(words), goesAs, ...(tag ? { tag } : {}), path: null, sha256: null, from: null, waits: { dealer: dealer.id, role: ANCHOR_ROLE[at], node: ANCHOR_NODE[at], label: `ankare ${at}` } }, bytes: null };
    };

    // A seat's landing picture, copied byte for byte from the register like an anchor (a still, or one frame of a film).
    const landingPicture = async (entry: Entry, name: string, label: string, goesAs: Picture['goesAs']): Promise<Picture> => {
      const { bytes, from } = await sourceBytes(register, { entry: entry.id }, watch);
      return { name, label, goesAs, ...(await save(name, bytes)), width: 1764, height: 1174, from, waits: null };
    };
    const landingWords = `${genitive(dealer.name)} landning på ${seatWords(target)}`;
    let motion: Order['motion'] = null;
    if (step.kind === 'FILM' && step.cards?.length) pictures.push(...(await cardPictures(save, step, register, dealer, snapshot, watch)));
    else if (step.kind === 'FILM') {
      const first = returnStart ? {
        picture: {
          name: 'first.png', label: `Första bild · ${returnStart.entry.name} (A3-kandidat)`, goesAs: 'startFrame' as const,
          ...(await save('first.png', returnStart.bytes)), width: 1764, height: 1174,
          from: { entry: returnStart.entry.id, path: returnStart.path, note: 'Fryst slutbild ur den godkända given' }, waits: null,
        }, bytes: null,
      } : giveEnd ? { picture: await giveEndPicture(save, giveEnd, watch), bytes: null }
        : step.start === 'LAND' ? { picture: await landingPicture(landing!, 'first.png', `Första bild · ${landingWords}`, 'startFrame'), bytes: null } : await anchorPicture('first.png', (w) => `Första bild · ${w}`, 'startFrame', step.from);
      pictures.push(first.picture);
      if (step.card && intent) {
        motion = { grip: step.grip ?? 'PINCH', hand, pass, turn, flipAxis: turn ? flipAxis : null, target, side, fromPlan: false, ...(cardScale !== 1 ? { cardScale } : {}) };
        motion.fromPlan = fromPlanOf(plan, motion);
        // What Placering said for the card's grip and turn, kept with a deal so that where it differs stays said.
        if (step.start !== 'LAND') motion.planned = plannedOf({ grip: intent.grip, turnAt: intent.turnAt, flipAxis: intent.flipAxis, side: intent.endSide });
        if (step.start === 'LAND') {
          // A return ends on its anchor with the card drawn where the plan lays it: the card stays where it lies (2026-11-21).
          const at = step.to ?? step.from;
          const anchor = await anchorPicture('last.png', (w) => `Slutbild · ${w} + kortet ${side === 'BACK' ? 'stängt' : 'öppet'} på ${seatWords(target)}`, 'endFrame', at);
          if (anchor.bytes) {
            const { bytes, drawn } = await drawOn(anchor.bytes, target!, side, 1, snapshot, watch);
            Object.assign(anchor.picture, await save('last.png', bytes), { drawn, from: { ...anchor.picture.from, built: `ankare ${at} + kortet ${target} där planen säger` } });
          }
          pictures.push(anchor.picture);
        }
        else if (open) { /* no last picture: the film ends where the model leaves the card */ }
        else if (shape === 'ONE_WAY' && seatLanding) pictures.push(await landingPicture(seatLanding, 'last.png', named ? `Slutbild · ${named.name}, kandidat (inte gällande)` : `Slutbild · ${landingWords}`, 'endFrame'));
        else if (shape === 'ONE_WAY') pictures.push(await cutPicture(save, cuts, target!, side, register, dealer, snapshot, watch));
        else {
          // Drawn on the dealer's own anchor only; while it waits, the picture shows that it waits (no other dealer stands in).
          const last: Picture = { name: 'last.png', label: `Slutbild · samma + kortet ${side === 'BACK' ? 'stängt' : 'öppet'} på ${seatWords(target)}`, goesAs: 'endFrame', path: null, sha256: null, from: { built: `första bilden + kortet ${target} där planen säger` }, waits: first.picture.waits ?? null };
          if (first.bytes) {
            const { bytes, drawn } = await drawOn(first.bytes, target!, side, cardScale, snapshot, watch);
            Object.assign(last, await save('last.png', bytes), { width: 1764, height: 1174, drawn, waits: null });
          }
          pictures.push(last);
        }
      } else {
        const last = await anchorPicture('last.png', (w) => `Slutbild · ${w}`, 'endFrame', step.to ?? step.from);
        pictures.push(last.picture);
      }
    } else {
      // A still goes out with the dealer's anchor and the text only.
      const base = await anchorPicture('anchor.png', (w) => w, 'referenceImage', step.from, 'anchor');
      pictures.push(base.picture);
    }

    // The reference film, copied into the order's folder with its hash: a take of the bank, or the dummy's rendered film.
    let reference: Reference = { status: 'INGEN', why: noReferenceWhy(model.id) };
    if (chosen) {
      const found = chosen;
      const home = found.kind === 'RENDERED' ? ['assets', 'references', 'docka'] : ['assets', 'motions'];
      const file = path.join(root, ...found.path.split('/'));
      await watch?.(file);
      try { if ((await realpath(file)) !== path.join(await realpath(path.join(root, ...home)), found.film, 'source.mp4')) throw new Error('outside'); } catch { throw new StoreError(404, `Filmen ${found.path} finns inte ${found.kind === 'RENDERED' ? 'bland dockans filmer' : 'i banken'}.`); }
      const bytes = await readFile(file);
      if (found.sha256 && sha(bytes) !== found.sha256) throw new StoreError(409, `${found.path} är inte den film ${found.kind === 'RENDERED' ? 'registret över dockfilmer säger' : 'banken mätte'} (sha256 skiljer).`);
      const copied = await save('reference.mp4', bytes);
      reference = {
        status: 'FINNS', clips: [found.take], ...copied, seconds: found.seconds!, goesTo: found.goesTo ?? found.edge, approvedStraight: found.approvedStraight, dealer: found.dealer,
        from: { film: found.film, path: found.path, sha256: copied.sha256, edge: found.edge, verdict: found.verdict, words: found.words, frames: found.frames, also: found.also },
      };
    }

    // What the still becomes: a candidate of its role in the register.
    const makes = step.makes ? { role: step.makes.role, label: step.makes.label } : null;
    const edge = edgeOf(step, target);
    const draft: PreparedOrder['draft'] = {
      schemaVersion: 1,
      title: input.title ?? `${dealer.name} · ${step.label}${target && step.card ? ` · ${a3Name(target)}` : ''}${deal && shape === 'ROUND_TRIP' ? ' · tur och retur' : ''}${recipe && model.id !== recipe.model ? ` · ${model.label}` : ''}${cardScale !== 1 ? ` · prov: kortet ${scaleWords(cardScale)}` : ''}`,
      summary: summaryOf(step, dealer.name, motion, shape),
      group: input.group ?? null,
      dealer: dealer.id,
      kind: step.kind,
      step: { key: step.key, label: step.label, edge, shape, cutInto: cutIntoOf(step, target, shape), makes },
      motion,
      pictures,
      reference,
      generation: { provider: 'runway-app', tool: model.tool, model: model.id, params },
      prompt: { template: mall !== TEMPLATE_VERSION ? `@${mall}` : '', style, text: '', sha256: '', extra, middle: false, ...(input.backMark === true ? { backMark: true } : {}) },
      takes,
      cost,
      limits: { maxCredits: cost.worstTotal, stopBelowCredits: policy.minBalance },
      notes,
      createdBy: input.createdBy ?? 'Jakob, Bordets Kortplan',
      approval: null,
      status: 'UTKAST',
    };
    draft.prompt = await textOf(draft, dealer, extra, snapshot, files);
    // Without a last picture and without a reference film only the first picture and the text tell where the card goes: the
    // draft says so (a choice of the one who orders, not a stop). The text may never point at a last frame that is not sent.
    if (open && reference.status !== 'FINNS') draft.notes.push(`Varken sista bild eller referensfilm går med: bara första bilden och texten säger vart kortet ska (${seatWords(target)}).`);
    if (open && /last frame|last picture/i.test(draft.prompt.text)) throw new StoreError(400, `Texten utan sista bild är inte skriven för det här fallet (mall ${mall}, ${style}): den nämner fortfarande sista bilden.`);
    // A chosen template with no text of its own for this film writes today's words: said, so that a trial of it is not a trial of nothing.
    if (mall !== TEMPLATE_VERSION) {
      const today = orderPrompt({ ...draft, prompt: { ...draft.prompt, template: '' } }, dealer, draft.prompt.place ? { x: draft.prompt.place[0], y: draft.prompt.place[1] } : null);
      if (today.text === draft.prompt.text) draft.notes.push(`Mall ${mall} har ingen egen text för den här filmen: texten är mall ${TEMPLATE_VERSION}:s, ord för ord.`);
    }
    const sourceRevision = sha(canonical({ input, dealer, recipe, plan: snapshot.file.sha256, policy, chosen }));
    return { draft, prefix, id: input.id, files, sourceRevision };
  }

  /** Give the same prepared media either an address in the preview or its final address on disk. */
  function addressed(draft: PreparedOrder['draft'], id: string, base: string, created: string): Order {
    return {
      ...draft, id, created,
      pictures: draft.pictures.map((p) => ({ ...p, path: p.path ? `${base}/${p.name}` : null })),
      reference: draft.reference.status === 'FINNS' ? { ...draft.reference, path: `${base}/reference.mp4` } : draft.reference,
    };
  }

  async function persist({ draft, prefix, id: named, files }: PreparedOrder): Promise<{ order: Order; revision: string }> {
    const id = named ?? await nextId(prefix);
    const file = fileOf(id);
    const folder = path.join(root, folderOf(id));
    await mkdir(path.dirname(folder), { recursive: true });
    if (await stat(file).catch(() => null)) throw new StoreError(409, 'Det finns redan en beställning med det id:t.');
    try { await mkdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreError(409, 'Mappen för beställningen finns redan.'); throw error; }
    try {
      for (const [name, bytes] of files) await put(id, name, bytes);
      const order = addressed(draft, id, folderOf(id), now().toISOString());
      return { order, revision: await write(order) };
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }

  function create(input: NewOrder) {
    return serial(async () => persist(await prepare(input)));
  }

  /**
   * The seat's end picture from the bank's own film: the first cut frame (cutFrameOf) that holds as a picture (src/cut-frame.ts
   * checkCutFrame: the laid card on the plan's card), taken out of the film, with the shoe put back from the dealer's anchor 1
   * where the card in the shoe's window is printed (patchShoe). Where none holds, the draft is refused with what each lacks.
   */
  async function cutPicture(save: SavePicture, cuts: readonly CutFrame[], target: string, side: 'FRONT' | 'BACK', register: Register, dealer: DealerInfo, { plan }: PlanSnapshot, watch?: WatchSource): Promise<Picture> {
    const quad = planQuad(plan, target);
    // The plan's card as a box in whole pixels, as the frame's own card is measured.
    const box = [Math.min(...quad.map((p) => p[0])), Math.min(...quad.map((p) => p[1])), Math.max(...quad.map((p) => p[0])), Math.max(...quad.map((p) => p[1]))].map(Math.round) as [number, number, number, number];
    const lacks: string[] = [];
    for (const cut of cuts) {
      await watch?.(path.join(root, cut.path));
      let frame: Buffer;
      try { frame = await (options.frame ?? ((source) => pictureBytes(root, source)))({ path: cut.path, frame: cut.frame }); } catch { lacks.push(`${cut.clip}: filmen finns inte i banken`); continue; }
      let rgb = await readRgb(frame);
      const check = checkCutFrame(rgb, W, H, box, { side });
      if (!check.holds) { lacks.push(`${cut.clip} ruta ${cut.frame}: ${check.problems.join(', ')}`); continue; }
      let shoeFrom: string | null = null;
      if (check.windowPrinted) {
        const rest = holding(register, dealer.id, ANCHOR_ROLE['1'], ANCHOR_NODE['1']);
        if (!rest) { lacks.push(`${cut.clip} ruta ${cut.frame}: kortet i skons fönster är tryckt, och ankare 1 saknas att ta skon ur`); continue; }
        rgb = Buffer.from(patchShoe(rgb, await readRgb((await sourceBytes(register, { entry: rest.id }, watch)).bytes), W, H));
        shoeFrom = rest.id;
      }
      const bytes = shoeFrom ? await pngOf(rgb) : frame;
      return {
        name: 'last.png', label: `Slutbild · snittruta ${cut.frame} ur ${cut.clip}`, goesAs: 'endFrame', ...(await save('last.png', bytes)), width: 1764, height: 1174,
        from: { path: cut.path, frame: cut.frame, note: `${cutFrameWords(cut)}${shoeFrom ? '; skon och kortet i fönstret ur ankare 1' : ''}`, cut: { clip: cut.clip, frame: cut.frame, ret: cut.ret, shoeFrom } }, waits: null,
      };
    }
    throw new StoreError(400, `${seatWords(target).replace(/^./, (c) => c.toUpperCase())} har ingen slutbild som håller: ${lacks.join('; ')}.`);
  }

  /** The first picture of a return to rest that continues a give: the give's last frame, taken out of the bank's own film (giveEndOf). */
  async function giveEndPicture(save: SavePicture, end: GiveEnd, watch?: WatchSource): Promise<Picture> {
    await watch?.(path.join(root, end.path));
    let frame: Buffer;
    try { frame = await (options.frame ?? ((source) => pictureBytes(root, source)))({ path: end.path, frame: end.frame }); }
    catch { throw new StoreError(409, `Filmen ${end.clip} finns inte i banken (${end.path}): returen kan inte börja på dess ruta.`); }
    return {
      name: 'first.png', label: `Första bild · ruta ${end.frame} ur given ${end.clip}`, goesAs: 'startFrame', ...(await save('first.png', frame)), width: 1764, height: 1174,
      from: { path: end.path, frame: end.frame, note: `Sista rutan i given ${end.deal}: returen fortsätter där`, cut: { clip: end.clip, frame: end.frame, ret: end.ret ?? end.deal, deal: end.deal } }, waits: null,
    };
  }

  /** One draft per seat, sharing a group ("Alla sju"), each with its own text and last picture. */
  async function expandSeats(input: NewOrder, watch?: WatchSource): Promise<NewOrder[]> {
    const seats = input.seats;
    if (!Array.isArray(seats) || seats.length < 2 || seats.length > SEAT_TARGETS.length) throw new StoreError(400, `Välj 2–${SEAT_TARGETS.length} platser.`);
    const targets = seats.map((s) => s?.target);
    if (targets.some((t) => typeof t !== 'string' || !SEAT_TARGETS.includes(t)) || new Set(targets).size !== targets.length) throw new StoreError(400, 'Platserna ska vara olika och finnas i planen (P1.C1 … D.C1).');
    for (const s of seats) for (const key of Object.keys(s)) if (!['target', 'hand', 'pass', 'side'].includes(key)) throw new StoreError(400, `${key} kan inte sättas per plats.`);
    const step = stepOf(input.step), dealer = (await readDealers(watch)).find((d) => d.id === input.dealer);
    if (!step?.card || step.start === 'LAND') throw new StoreError(400, 'Flera platser går bara för en giv.');
    if (!dealer) throw new StoreError(400, unknownDealer(input.dealer));
    const taken = new Set<string>();
    await watch?.(dir);
    for (const name of (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'))) { const g = (await readJson<Order>(path.join(dir, name), watch))?.group?.id; if (g) taken.add(g); }
    const prefix = `${dealer.id}-${step.key.toLowerCase().replace('.', '-')}-grupp`;
    let groupId = '';
    for (let n = 1; n < 100 && !groupId; n++) { const id = `${prefix}-${String(n).padStart(2, '0')}`; if (!taken.has(id)) groupId = id; }
    const all = targets.length === 7 && targets.every((t) => t.startsWith('P'));
    const group = input.group ?? { id: groupId, label: `${dealer.name} · ${step.group[0].toLowerCase()}${step.group.slice(1)} · ${all ? 'alla sju' : seatList(targets)}` };
    return seats.map((seat) => ({ ...input, seats: undefined, id: undefined, title: undefined, target: seat.target, hand: seat.hand ?? input.hand, pass: seat.pass ?? input.pass, side: seat.side ?? input.side, group }));
  }

  // A caught failure removes drafts created earlier in this call. A process crash can leave a partial batch on disk.
  async function persistAll(drafts: readonly PreparedOrder[]): Promise<{ orders: Order[]; revisions: string[] }> {
    const orders: Order[] = [], revisions: string[] = [];
    try {
      for (const draft of drafts) {
        const { order, revision } = await persist(draft);
        orders.push(order); revisions.push(revision);
      }
    } catch (error) {
      for (const order of orders) { await rm(fileOf(order.id), { force: true }); await rm(path.join(root, folderOf(order.id)), { recursive: true, force: true }); }
      throw error;
    }
    return { orders, revisions };
  }

  function createMany(input: NewOrder) {
    return serial(async () => persistAll((await prepareAll(await expandSeats(input))).drafts));
  }

  async function prepareAll(inputs: readonly NewOrder[], maxBytes = Infinity, watch?: WatchSource) {
    const drafts: PreparedOrder[] = [];
    let size = 0;
    for (const input of inputs) {
      const singles = input.seats === undefined ? [input] : await expandSeats(input, watch);
      for (const single of singles) {
        const draft = await prepare(single, watch);
        for (const bytes of draft.files.values()) size += bytes.length;
        if (size > maxBytes) throw new StoreError(413, 'Förhandsvisningen är för stor. Välj färre filmer.');
        drafts.push(draft);
      }
    }
    return { drafts, size };
  }

  function preview(inputs: readonly NewOrder[]): Promise<OrderPreview> {
    return serial(async () => {
      // Record sources before their first read, then reject a preview that combined different versions during preparation.
      const sources: SourceManifest = new Map();
      const watch: WatchSource = async (file) => {
        if (!sources.has(file)) sources.set(file, await sourceStamp(file));
      };
      const { drafts, size } = await prepareAll(inputs, PREVIEW_BYTES, watch);
      await checkSources(sources);
      const input = sha(canonical(inputs));
      const revision = revisionOf(canonical({ id: randomUUID(), sources: [...sources], drafts: drafts.map(({ draft, sourceRevision }) => ({ draft, sourceRevision })) }));
      const key = revision.slice(1, -1);
      while (previewBytes + size > PREVIEW_BYTES || previews.size >= 16) {
        const oldest = previews.keys().next().value!;
        previewBytes -= previews.get(oldest)!.size;
        previews.delete(oldest);
      }
      previews.set(key, { drafts, size, sources, input });
      previewBytes += size;
      return { revision, orders: drafts.map(({ draft }, i) => addressed(draft, `${PREVIEW_ID}-${i + 1}`, `api/orders/preview/${key}/${i}`, '')) };
    });
  }

  function previewAsset(key: string, index: number, name: string): Buffer | null {
    return previews.get(key)?.drafts[index]?.files.get(name) ?? null;
  }

  function savePreview(inputs: readonly NewOrder[], expected: string | undefined) {
    return serial(async () => {
      if (!expected) throw new StoreError(428, 'Förhandsvisa först. Ladda om studion om knappen Förhandsvisa saknas.');
      const key = /^"[a-f0-9]{64}"$/.test(expected) ? expected.slice(1, -1) : '';
      const input = sha(canonical(inputs));
      const saved = savedPreviews.get(key);
      if (saved) {
        if (saved.input !== input) throw new StoreError(409, PREVIEW_CONFLICT);
        return saved;
      }
      const preview = previews.get(key);
      if (!preview) throw new StoreError(409, 'Förhandsvisningen finns inte kvar. Hämta en ny förhandsvisning innan du sparar.');
      if (preview.input !== input) throw new StoreError(409, PREVIEW_CONFLICT);
      // Check all sources before the first write and persist the same bytes that were served in the active preview.
      // The route queue coordinates Material writes. The manifest detects external changes up to this check.
      await checkSources(preview.sources);
      const { orders } = await persistAll(preview.drafts);
      const result = { input, orders: orders.map(({ id }) => ({ id })) };
      if (savedPreviews.size >= SAVED_PREVIEW_LIMIT) savedPreviews.delete(savedPreviews.keys().next().value!);
      savedPreviews.set(key, result);
      previews.delete(key);
      previewBytes -= preview.size;
      return result;
    });
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
      const sideProblem = twoHandDealSideProblem(order);
      if (sideProblem) throw new StoreError(400, sideProblem);
      const policy = await readPolicy(), dealer = (await readDealers()).find((d) => d.id === order.dealer);
      if (!policy || !dealer) throw new StoreError(500, 'Policy eller dealer saknas.');
      const next: Order = structuredClone(order);
      if (changes.title !== undefined) next.title = changes.title.trim();
      if (changes.takes !== undefined) next.takes = changes.takes;
      const twoHands = twoHandMotion(next.step.key, next.motion?.grip);
      const editsPose = changes.side !== undefined || (!twoHands && (changes.hand !== undefined || changes.pass !== undefined));
      const oldHands = twoHands && (next.motion?.hand !== twoHands.hand || next.motion?.pass !== twoHands.pass);
      // A return follows its first picture: the hand that laid the card, and the card as it lies, not turned (prepare
      // refuses another hand or side too).
      if (editsPose && stepOf(next.step.key)?.start === 'LAND') throw new StoreError(400, 'En retur följer sin första bild: handen och kortets sida ändras inte i utkastet. Gör ett nytt utkast.');
      const turn = editsPose ? (changes.side ?? next.motion?.side) !== 'BACK' : next.motion?.turn ?? false;
      const fixedAxis = fixedTwoHandTurn(next.step.key, next.prompt.style, turn, changes.flipAxis ?? next.motion?.flipAxis);
      if (changes.flipAxis !== undefined) { if (!next.motion?.turn) throw new StoreError(400, 'Kortet vänds inte i det här utkastet.'); next.motion.flipAxis = changes.flipAxis; }
      if (changes.duration !== undefined) { if (next.kind !== 'FILM') throw new StoreError(400, 'En bild har ingen längd.'); next.generation.params.duration = changes.duration; }
      if (editsPose || oldHands) {
        if (!next.motion) throw new StoreError(400, 'Steget har ingen hand eller sida att välja.');
        // The last picture of a deal bara dit is the seat's end picture, which shows a hand and a side: they follow it.
        if (editsPose && next.step.shape === 'ONE_WAY') throw new StoreError(400, 'Slutbilden är platsens egen, som visar handen och kortets sida: de ändras inte i utkastet. Gör ett nytt utkast.');
        const pass = twoHands?.pass ?? changes.pass ?? (changes.hand !== undefined ? false : !!next.motion.pass);
        const hand = twoHands?.hand ?? changes.hand ?? (pass ? 'LH' : next.motion.hand);
        if (pass && hand !== 'LH') throw new StoreError(400, 'Handbyte går från vänster hand till höger: vänster tar kortet ur skon.');
        const side = changes.side ?? next.motion.side, redraw = side !== next.motion.side;
        const { plan } = await readPlan(root);
        const intent = next.motion.target ? plan.targets[next.motion.target]?.intent : null;
        Object.assign(next.motion, { hand, pass, side, turn, flipAxis: turn ? (fixedAxis ?? next.motion.flipAxis ?? defaultFlip(next.step.key, intent?.turnAt, intent?.flipAxis)) : null });
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
    if (!last || !order.motion?.target) return;
    const card = `kortet ${order.motion.side === 'BACK' ? 'stängt' : 'öppet'} på ${seatWords(order.motion.target)}`;
    // A return's last picture is its anchor with the card drawn; a round trip's is its first picture with it.
    last.label = stepOf(order.step.key)?.start === 'LAND' ? `${last.label.replace(/ \+ kortet .*$/, '')} + ${card}` : `Slutbild · samma + ${card}`;
  }
  /** Draws the last picture again on the first, with the card as the draft has it (side), when the first is there. */
  async function drawLast(id: string, order: Order, firstBytes: Buffer | null) {
    const first = order.pictures.find((p) => p.goesAs === 'startFrame');
    const last = order.pictures.find((p) => p.goesAs === 'endFrame' && p.from?.built);
    if (!first?.path || !last || !order.motion?.target) return;
    // A return draws on its anchor (the register's bytes), a round trip on its first picture.
    const base = stepOf(order.step.key)?.start === 'LAND'
      ? (last.from?.entry ? (await sourceBytes(await readRegister(), { entry: last.from.entry })).bytes : null)
      : firstBytes ?? (await readFile(path.join(root, ...first.path.split('/'))));
    if (!base) return;
    const { bytes, drawn } = await drawOn(base, order.motion.target, order.motion.side, order.motion.cardScale ?? 1);
    Object.assign(last, await put(id, 'last.png', bytes), { drawn, waits: null, width: 1764, height: 1174 });
  }

  /**
   * Brings a draft up to date: fetches what it waits for once it holds in the register, follows the anchor that holds now
   * when another of the same role has been approved in Material since (keeping what the picture was in `replaced`), draws
   * its last picture again when the first changed, the plan did or (a return) its anchor did, and writes the text with the
   * template of today.
   */
  async function refresh(id: string, expected: string | undefined) {
    return serial(async () => {
      const { order, revision } = await load(id);
      guardDraft(order, revision, expected);
      const sideProblem = twoHandDealSideProblem(order);
      if (sideProblem) throw new StoreError(400, sideProblem);
      fixedTwoHandTurn(order.step.key, order.prompt.style, order.motion?.turn ?? false, order.motion?.flipAxis);
      const register = await readRegister(), dealer = (await readDealers()).find((d) => d.id === order.dealer);
      if (!dealer) throw new StoreError(500, 'Dealern saknas i data/dealers.json.');
      const next: Order = structuredClone(order);
      const { plan, file: planFile } = await readPlan(root);
      let firstBytes: Buffer | null = null;
      // A step whose cards are drawn on its anchor (the hole card's turn) is drawn anew from the anchor that holds now.
      const drawnStep = stepOf(next.step.key);
      if (drawnStep?.cards?.length && next.kind === 'FILM') {
        const made = await cardPictures((name, bytes) => put(id, name, bytes), drawnStep, register, dealer);
        if (made.every((p) => p.path)) next.pictures = next.pictures.map((p) => made.find((m) => m.name === p.name) ?? p);
      }
      // A return's last picture is its anchor with the card drawn: another anchor approved since is drawn on below.
      let swappedLast = false;
      for (const p of next.pictures) {
        if (drawnStep?.cards?.length) continue;
        if (p.from?.built) {
          const f = followOf(register, order.dealer, p, dealer.name);
          if (f?.swap) {
            const { from } = await sourceBytes(register, { entry: f.now.id });
            p.replaced = { at: now().toISOString(), was: `${p.label} (${f.was.name})`, entry: f.was.id, sha256: p.sha256 };
            p.from = { ...from, built: p.from.built };
            p.label = `Slutbild · ${anchorWords(dealer.name, f.at, f.now)}`;
            swappedLast = true;
          }
          continue;
        }
        if (p.waits && !p.path) {
          const entry = resolveWaits(register, p.waits);
          if (!entry) continue;
          const { bytes, from } = await sourceBytes(register, { entry: entry.id });
          // A return's last picture that waited for its anchor is that anchor with the card drawn (drawLast below), as prepare builds it.
          const built = drawnStep?.start === 'LAND' && p.goesAs === 'endFrame' && next.motion?.target ? `ankare ${drawnStep.to ?? drawnStep.from} + kortet ${next.motion.target} där planen säger` : null;
          Object.assign(p, await put(id, p.name, bytes), { from: built ? { ...from, built } : from, waits: null, width: 1764, height: 1174 });
          if (p.goesAs === 'startFrame') firstBytes = bytes;
          continue;
        }
        const f = followOf(register, order.dealer, p, dealer.name);
        if (!f) continue;
        const words = new RegExp(`${escapeRe(genitive(dealer.name))} (?:ankare |A)${escapeRe(f.at)}(?: · .*)?$`);
        const label = words.test(p.label) ? p.label.replace(words, anchorWords(dealer.name, f.at, f.now)) : p.label;
        if (f.swap) {
          const { bytes, from } = await sourceBytes(register, { entry: f.now.id });
          const was = { at: now().toISOString(), was: `${p.label} (${f.was.name})`, entry: f.was.id, sha256: p.sha256 };
          Object.assign(p, await put(id, p.name, bytes), { from, width: 1764, height: 1174, replaced: was });
          if (p.goesAs === 'startFrame') firstBytes = bytes;
        } else if (p.from) p.from = { ...p.from, note: `${f.now.name} (${f.now.state})` };
        p.label = label;
      }
      if (next.motion) {
        const twoHands = twoHandMotion(next.step.key, next.motion.grip);
        if (twoHands) {
          Object.assign(next.motion, twoHands);
          next.motion.fromPlan = fromPlanOf(plan, next.motion);
        } else next.motion.pass ??= false;
      }
      const last = next.pictures.find((p) => p.goesAs === 'endFrame' && p.from?.built);
      if (last && (firstBytes || swappedLast || !last.path || last.drawn?.plan.sha256 !== planFile.sha256 || (last.drawn && last.drawn.side !== next.motion?.side))) await drawLast(id, next, firstBytes);
      await labelLast(next);
      next.summary = summaryOf(next.step, dealer.name, next.motion, next.step.shape);
      if (next.reference.status === 'INGEN') next.reference.why = noReferenceWhy(next.generation.model);
      next.prompt = await textOf(next, dealer, next.prompt.extra);
      return { order: next, revision: await write(next) };
    });
  }

  /** Why "Hämta bilderna" would change a draft now, in words, or null. */
  function refreshReason(order: Order, register: Register | null, dealer: DealerInfo | undefined, planSha: string | null): string | null {
    if (order.approval || order.status !== 'UTKAST') return null;
    const reasons: string[] = [];
    const hands = twoHandDraftProblem(order);
    if (hands) reasons.push(hands);
    if (register && waitingOf(order).some((w) => resolveWaits(register, w))) reasons.push('Det utkastet väntar på finns nu i Material.');
    for (const p of order.pictures) {
      const f = register && dealer ? followOf(register, order.dealer, p, dealer.name) : null;
      if (f) reasons.push(f.swap ? `${f.now.name} gäller nu i Material i stället för ${f.was.name}.` : `${f.now.name} är godkänd i Material.`);
    }
    if (planSha && order.pictures.some((p) => p.drawn && p.drawn.plan.sha256 !== planSha)) reasons.push('Planen har ändrats sedan kortet ritades.');
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
      const moves = waitingOf(order).some((w) => resolveWaits(register, w)) || order.pictures.some((p) => followOf(register, dealerId, p, dealer.name));
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

  /** Draft copies are checked against the bank again before the order freezes. */
  async function archivedSourceProblems(order: Order): Promise<string[]> {
    const reference = order.reference.status === 'FINNS' ? order.reference : null;
    const cuts = order.pictures.flatMap((p) => p.from?.cut ? [p.from.cut] : []);
    if (!reference && !cuts.length) return [];
    const ids = new Set<string>(Array.isArray(reference?.clips) ? reference.clips : []);
    if (reference?.from?.film) ids.add(reference.from.film);
    const sourceIds = new Set([...ids, ...cuts.flatMap(({ clip, ret }) => [clip, ret])]);
    // An absent optional motion may mean no verdict was written. An unreadable record could hide one.
    const unreadable = new Set<string>();
    const bank = await readBank(undefined, { sourceIds, unreadable });
    const derived = bank.derived ?? [], problems: string[] = [];
    if (reference) {
      const archived = archivedReferenceIds(bank);
      // The same dependency chain identifies whose archive status must be available.
      const unavailable = archivedReferenceIds({ ...bank, motions: Object.fromEntries([...unreadable].map((id) => [id, { review: { archived: true } }])) });
      if ([...ids].some((id) => unavailable.has(id))) {
        problems.push('Arkivstatus kan inte verifieras för referensfilmen: ett källregister under motions/ kan inte läsas.');
      } else if ([...ids].some((id) => archived.has(id))) {
        problems.push('Referensfilmen har en arkiverad källa eller del. Gör ett nytt utkast med en annan referensfilm.');
      }
    }
    for (const { clip, frame, ret } of cuts) {
      const sources = [clip, ret, ...derived.filter((d) => d.clip === clip && d.frames[0] <= frame && frame <= d.frames[1]).map((d) => d.id)];
      if (sources.some((id) => unreadable.has(id))) problems.push('Arkivstatus kan inte verifieras för snittrutan: ett källregister under motions/ kan inte läsas.');
      else if (sources.some((id) => isArchived(bank, id))) problems.push('Snittrutan kommer från en arkiverad tagning eller har en arkiverad retur. Gör ett nytt utkast med en annan slutbild.');
    }
    return problems;
  }

  /**
   * Whose each picture is. A whole picture of another dealer never lies in a dealer's draft (Jakob 2026-11-12), and such
   * a mix-up keeps the order from being approved; an older still's cut-out of an arm (picture.cut) was the one exception.
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
    // Each picture's name in Material today (the hash above is the stored order's; the names are only shown). A picture
    // built, drawn on or cut from an entry is not that entry: it keeps its own words.
    const named = { ...order, pictures: order.pictures.map((p) => ({ ...p, named: (p.from?.entry && !p.from.built && !p.drawn && !p.cut && register ? entryOf(register, p.from.entry)?.entry.name : null) ?? null })) };
    return { order: named, revision, hash, shown: shownOf(order, problems, receipt), problems, warnings, waiting, receipt, check, owners, refresh: why };
  }

  /**
   * Which landing pictures (A3, gäller or kandidat) of the dealers show the blue side's marks at their card, by register id:
   * what the store's text says of the card (textOf, markSeen) and Bordet's row says with it. Read once per file and card.
   */
  async function marksOf(register: Register | null, dealerIds: readonly string[]): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    const plan = await readPlan(root).then((s) => s.plan).catch(() => null);
    if (!register || !plan) return out;
    for (const id of dealerIds) for (const e of register.dealers[id]?.entries ?? []) {
      if (e.role !== LANDING_ROLE || (e.state !== 'gäller' && e.state !== 'kandidat') || !e.card || !plan.targets[e.card] || !isPicture(e)) continue;
      try {
        const file = path.join(root, ...e.path!.split('/')), facts = await stat(file), quad = planQuad(plan, e.card);
        const key = [e.path, e.frame ?? '', facts.mtimeMs, facts.size, JSON.stringify(quad)].join('|');
        if (!MARKS.has(key)) MARKS.set(key, markSeen(await readRgb(await pictureBytes(root, { path: e.path!, frame: e.frame })), quad));
        out[e.id] = MARKS.get(key)!;
      } catch { /* a picture that cannot be read shows no marks */ }
    }
    return out;
  }

  async function list(): Promise<OrdersAnswer> {
    const problems: string[] = [];
    const configured = await readPolicy();
    const policy = configured ? { ...configured, mandateBudget: await readMandateBudget(root, configured.mandate, () => now().toISOString()) } : null;
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
      marks: await marksOf(register, dealers.map((d) => d.id)),
      rendered: await readRendered(),
      methods: await readMethodRegister(),
      cutChecks: readCutChecks(await readJson(path.join(root, 'data/cut-frames.json'))),
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
      const mandateBudget = await readMandateBudget(root, policy.mandate, () => now().toISOString());
      const check = checkPolicy(order, { ...policy, mandateBudget }, spentOn(others, dayOf(at, zone), zone), balance);
      if (!check.ok) throw new StoreError(403, check.refusals.join(' '));
      const archived = await archivedSourceProblems(order);
      if (archived.length) throw new StoreError(409, archived.join(' '));
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

  /**
   * A file for the lab to hand out: a picture or film directly in an order's folder (assets/orders/<id>/), or a film of the
   * dummy's that data/rendered-references.json lists (assets/references/docka/<id>/source.mp4), which a row plays where the
   * reference film is chosen, before a draft holds its own copy. Nothing else under assets/.
   */
  async function servable(rel: string): Promise<string | null> {
    const m = /^assets\/orders\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9][a-z0-9._-]*\.(?:png|jpg|mp4))$/.exec(rel);
    const listed = m || !rel.startsWith('assets/references/docka/') ? null : (await readRendered()).find((r) => r.path === rel) ?? null;
    const at = m ? { home: ['assets', 'orders'], folder: m[1], name: m[2] } : listed ? { home: ['assets', 'references', 'docka'], folder: listed.id, name: 'source.mp4' } : null;
    if (!at) return null;
    const file = path.join(root, ...at.home, at.folder, at.name);
    try { if ((await realpath(file)) !== path.join(await realpath(path.join(root, ...at.home)), at.folder, at.name)) return null; } catch { return null; }
    return (await stat(file).then((s) => s.isFile(), () => false)) ? file : null;
  }

  return { list, one, load, create, createMany, preview, savePreview, previewAsset, change, refresh, follow, approve, setAside, servable, readReceipt };
}

export type { Drawn, OrderAnswer, OrdersAnswer };
