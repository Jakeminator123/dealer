// Which ways of making a film hold (Jakob 2026-11-24: "Se till att fel som detta med metod inte kan göras … Det ska vara
// glasklart vilka sätt vi kan använda oss av för att producera filmer!"; docs/BESKED.md, "Bara sätt som håller, och en
// pilot först"). A way is a recipe of data/order-methods.json plus what differs in how the film is made: the model, the
// text template, a deal's shape (tur och retur or bara dit), the kind of reference film (none, the doll's built film, the
// doll's film read off a real deal, a real film) and whether the card lands closed. Its state is counted, never written:
//   håller   Jakob himself has approved a film made so, and his approvals are at least as many as his rejections
//   föll     his own rejections are more than his approvals
//   oprövat  he has judged no film made so (a verdict set for him, review.provisional, never counts)
// His own verdict is his block in Granska, or, where a film has none of his there, his yes to a card in Beslut that named the
// film (data/order-methods.json beslut, withBeslut): the list and the answers say which ("hans ja i Beslut 2026-11-23").
// For a deal the film that counts is the deal; the return cut from the same film is shown beside it. The approval
// (tools/order-store.ts approve, both his click and the main agent's) lets ONE order of an untried way through, the pilot,
// and no second one until he has judged its film; a way that fell is refused until the recipe has changed, which makes it
// another way. Pure: no fs, no network. The list is printed by node tools/verdicts-per-method.ts. Tests: tools/order-ways.test.ts.
import { MODELS, SHAPE_LABEL, stepOf, type Order, type RenderedReference, type Shape, type StepKey, type TakeStatus } from './order-model.ts';
import { methodFor, type BeslutYes, type MethodRegister } from './order-methods.ts';
import { TEMPLATE_CHOICES } from './order-prompts.ts';

export const WAY_STATES = ['håller', 'föll', 'oprövat'] as const;
export type WayState = (typeof WAY_STATES)[number];

export const REFERENCE_KINDS = ['ingen', 'docka-byggd', 'docka-avläst', 'film'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
  ingen: 'utan referensfilm', 'docka-byggd': 'dockans byggda film', 'docka-avläst': 'dockans avlästa film', film: 'en riktig film som referensfilm',
};

/** A way: what an order is made with. key says all of it; two orders with the same key are made the same way. */
export type Way = {
  key: string;
  /** The recipe: the method's id in data/order-methods.json (per step, and per class of seat where it differs), else the step. */
  recipe: string;
  step: StepKey;
  model: string;
  /** The text template as the order stores it ("film-giv-kort@15"), null for a text written by hand. */
  template: string | null;
  shape: Shape | null;
  reference: ReferenceKind;
  /** A deal whose card lands closed. */
  closed: boolean;
};

type OrderFacts = Pick<Order, 'kind' | 'step' | 'motion' | 'generation' | 'prompt' | 'reference'>;

/** The kind of reference film an order carries: the doll's film is read off a real deal where its register entry says fromDeal. */
export function referenceKind(reference: Order['reference'], rendered: readonly Pick<RenderedReference, 'id' | 'fromDeal'>[]): ReferenceKind {
  if (reference.status !== 'FINNS') return 'ingen';
  const films = reference.clips.map((id) => rendered.find((r) => r.id === id)).filter((r) => !!r);
  if (!films.length) return reference.dealer === 'docka' ? 'docka-byggd' : 'film';
  return films.some((r) => !!r.fromDeal) ? 'docka-avläst' : 'docka-byggd';
}

/** The way an order is made, or null for a still (only films are tried by a pilot). */
export function wayOf(order: OrderFacts, methods: Pick<MethodRegister, 'methods'> | null, rendered: readonly Pick<RenderedReference, 'id' | 'fromDeal'>[]): Way | null {
  if (order.kind !== 'FILM') return null;
  const step = order.step.key, deal = step.startsWith('GIV-');
  const recipe = methodFor(methods, step, order.motion?.target ?? null)?.id ?? step;
  return keyed({
    recipe, step, model: order.generation.model, template: order.prompt.template || null, shape: deal ? order.step.shape : null,
    reference: referenceKind(order.reference, rendered), closed: deal && order.motion?.side === 'BACK',
  });
}
const keyed = (way: Omit<Way, 'key'>): Way => ({ ...way, key: [way.recipe, way.model, way.template ?? 'egen text', way.shape ?? '-', way.reference, way.closed ? 'stängt' : '-'].join(' | ') });

/**
 * Whether a draft can be made this way today: its template is one a new order may be written with (src/order-prompts.ts
 * TEMPLATE_CHOICES), or the text is written by hand. The other ways are history: the list leaves them out unless asked.
 */
export function orderable(way: Pick<Way, 'template'>): boolean {
  const version = way.template ? /@(\d+)$/.exec(way.template)?.[1] : null;
  return !way.template || (!!version && TEMPLATE_CHOICES.includes(Number(version)));
}
/** "mall 15" for "film-giv-kort@15"; a minimal or long text says so. */
function templateWords(template: string | null): string {
  const m = template ? /^(.*)@(\d+)$/.exec(template) : null;
  if (!m) return template ? `mall ${template}` : 'egen text';
  return `mall ${m[2]}${/minimal/.test(m[1]) ? ', minimal text' : /utforlig|utförlig/.test(m[1]) ? ', utförlig text' : ''}`;
}
/** The way in a line: "Kling 4 · mall 15 · tur och retur · dockans byggda film". */
export function wayWords(way: Omit<Way, 'key'>): string {
  return [MODELS[way.model]?.label ?? way.model, templateWords(way.template), ...(way.shape ? [SHAPE_LABEL[way.shape].toLowerCase()] : []), REFERENCE_KIND_LABEL[way.reference], ...(way.closed ? ['stängt kort'] : [])].join(' · ');
}
const SEATS_WORDS: Record<string, string> = { mitten: 'plats 3–5', ytter: 'plats 1, 2, 6 och 7', dealer: 'dealerns kort' };
/** The step a way belongs to, as the list groups it: "Giv från A2.1 · plats 3–5". */
export function stepWords(way: Pick<Way, 'step' | 'recipe'>, methods: Pick<MethodRegister, 'methods'> | null): string {
  const step = stepOf(way.step), seats = methods?.methods.find((m) => m.id === way.recipe)?.seats ?? null;
  const name = !step ? way.step : step.group === 'Giv från A2.1' || step.group === 'Giv från A2.2' || step.group === 'Giv från A2.3' || step.group === 'Vila' || step.group === 'Hålkortet' ? step.group : `${step.group}: ${step.label.charAt(0).toLowerCase()}${step.label.slice(1)}`;
  return seats ? `${name} · ${SEATS_WORDS[seats]}` : name;
}

/** His verdict on one film of the bank, as far as a way is concerned. */
export type FilmVerdict = {
  film: string; order: string; take: number | null;
  /** retur: the return cut from a deal's film; film: the step's own film. */
  part: 'film' | 'retur';
  /** His own verdict; null where he has given none. */
  his: 'ja' | 'nej' | null;
  /** Where his own verdict stands: his words or his click in Granska, or his yes to a card in Beslut that named the film (withBeslut). */
  from: 'granska' | 'beslut' | null;
  /** A verdict set for him (review.provisional): shown, never counted. */
  forHim: 'ja' | 'nej' | null;
  words: string | null; at: string | null;
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const yesNo = (decision: unknown): 'ja' | 'nej' | null => (decision === 'ACCEPTED' ? 'ja' : decision === 'REJECTED' ? 'nej' : null);

/**
 * The verdicts of the bank's films that came from an order: every post of the register (and what is kept of a removed one,
 * tools/register-store.ts postOfRemoved) whose order is known, by the post's own order block, else by its id
 * ("<order>-<take>…", the longest order id that fits).
 */
export function filmVerdicts(posts: Iterable<readonly [string, unknown]>, orders: ReadonlyMap<string, Pick<Order, 'step'>>): FilmVerdict[] {
  const out: FilmVerdict[] = [];
  for (const [id, post] of posts) {
    if (!object(post)) continue;
    const from = object(post.order) ? post.order : null;
    let order = typeof from?.id === 'string' && orders.has(from.id) ? from.id : null, take = typeof from?.take === 'number' ? from.take : null;
    if (!order) for (const m of [...id.matchAll(/-(\d\d)(?=-|$)/g)].reverse()) {
      if (orders.has(id.slice(0, m.index))) { order = id.slice(0, m.index); take = Number(m[1]); break; }
    }
    if (!order) continue;
    // A post without a verdict block is the whole film that a deal and its return were cut from: its parts are judged, not it.
    if (!object(post.review) || typeof post.review.decision !== 'string') continue;
    const review = post.review, motion = object(post.motion) ? post.motion : {};
    const said = typeof review.userReview === 'string' ? review.userReview.trim() : '';
    const own = !!said || review.userAccepted === true, given = !own && object(review.provisional);
    const dated = /^\S+ (\d{4}-\d{2}-\d{2}): ([\s\S]*)$/.exec(said);
    out.push({
      film: id, order, take, part: orders.get(order)!.step.key.startsWith('GIV-') && (motion.kind === 'RETURN' || /-return(-|$)/.test(id)) ? 'retur' : 'film',
      his: own ? yesNo(review.decision) : null, from: own ? 'granska' : null, forHim: given ? yesNo(review.decision) : null,
      words: own ? (dated?.[2] ?? said) || null : null, at: dated?.[1] ?? null,
    });
  }
  return out;
}

/**
 * His yes in Beslut counted in (data/order-methods.json beslut): a film a card named stands as his own yes, with his answer
 * and its day, where he has given it no verdict of his own in Granska; one there goes first. A deal's film is its deal part.
 * A named film without a verdict block in the bank is added from its order ("<order>-<take>"). Only this tally changes:
 * the film's block in the bank still says the verdict was set for him, and here it is no longer counted as that too.
 */
export function withBeslut(verdicts: readonly FilmVerdict[], beslut: readonly BeslutYes[] | undefined, orders: ReadonlySet<string>): FilmVerdict[] {
  const out = verdicts.map((v) => ({ ...v }));
  for (const b of beslut ?? []) for (const film of b.films) {
    const hits = out.filter((v) => v.part === 'film' && (v.film === film || v.film.startsWith(`${film}-`)));
    if (hits.some((v) => v.from === 'granska')) continue;
    const named = /^(.+)-(\d\d)$/.exec(film);
    let hit = hits.find((v) => v.forHim === 'ja') ?? hits[0];
    if (!hit && named && orders.has(named[1])) out.push(hit = { film, order: named[1], take: Number(named[2]), part: 'film', his: null, from: null, forHim: null, words: null, at: null });
    if (hit && !hit.his) Object.assign(hit, { his: 'ja', from: 'beslut', forHim: null, words: b.words, at: b.at } satisfies Partial<FilmVerdict>);
  }
  return out;
}
/** "hans ja i Beslut 2026-11-23": where a yes that is not his block in Granska comes from. */
export const beslutWords = (days: readonly string[]) => `hans ja i Beslut${days.length ? ` ${[...new Set(days)].sort().join(' och ')}` : ''}`;

/** A take that can still give a film: not failed, not set aside, and not one whose call nobody knows the fate of. */
const DEAD: readonly TakeStatus[] = ['MISSLYCKAD', 'AVBRUTEN', 'OSÄKER'];

/** An approved order of an untried way: the film of it that waits for his eyes (forHim: the verdict set for him on it), and its takes. */
export type Pilot = { order: string; film: string | null; forHim: 'ja' | 'nej' | null; takes: TakeStatus[] };
export type WayRow = {
  way: Way;
  /** The step in the list's words, and the way's own line. */
  step: string; words: string;
  state: WayState;
  /** His own verdicts on the films made so (a deal: the deal part), and on the returns cut from them. */
  yes: number; no: number; back: { yes: number; no: number };
  /** How many of `yes` are his yes in Beslut about the film (not his block in Granska), and the days he answered. */
  beslut: { yes: number; days: string[] };
  /** Verdicts set for him on the same films: shown, never counted. */
  forHim: { yes: number; no: number };
  /** The approved film orders made so, oldest first, and the dealers they are for. */
  orders: string[]; dealers: string[];
  /** His words that say the state: his latest rejection of a way that fell, his latest approval of one that holds. */
  said: { film: string; words: string | null; at: string | null; from: FilmVerdict['from'] } | null;
  /** Every film of the way with a verdict block in the bank, his own or one set for him: what the list prints per take. */
  films: FilmVerdict[];
  /** For an untried way: the approved orders that can still give a film, each with the film that waits for his eyes (null: not in the bank yet). */
  pilots: Pilot[];
};

/** Every way an approved film order was made with, its state counted from his own verdicts, in the order of the steps. */
export function wayBook(orders: readonly { order: Order; takes: readonly TakeStatus[] }[], verdicts: readonly FilmVerdict[], methods: Pick<MethodRegister, 'methods' | 'beslut'> | null, rendered: readonly Pick<RenderedReference, 'id' | 'fromDeal'>[]): WayRow[] {
  const rows = new Map<string, WayRow>(), byOrder = new Map<string, FilmVerdict[]>();
  for (const v of withBeslut(verdicts, methods?.beslut, new Set(orders.map((o) => o.order.id)))) byOrder.set(v.order, [...(byOrder.get(v.order) ?? []), v]);
  const latest = (list: readonly FilmVerdict[]) => list.reduce<FilmVerdict | null>((last, v) => (!last || (v.at ?? '') >= (last.at ?? '') ? v : last), null);
  const told = new Map<string, { yes: FilmVerdict[]; no: FilmVerdict[] }>();
  for (const { order, takes } of [...orders].sort((a, b) => (a.order.created < b.order.created ? -1 : a.order.created > b.order.created ? 1 : a.order.id.localeCompare(b.order.id)))) {
    if (!order.approval || order.status !== 'GODKÄND') continue;
    const way = wayOf(order, methods, rendered);
    if (!way) continue;
    const row = rows.get(way.key) ?? { way, step: stepWords(way, methods), words: wayWords(way), state: 'oprövat' as WayState, yes: 0, no: 0, back: { yes: 0, no: 0 }, beslut: { yes: 0, days: [] }, forHim: { yes: 0, no: 0 }, orders: [], dealers: [], said: null, films: [], pilots: [] };
    rows.set(way.key, row);
    row.orders.push(order.id);
    if (!row.dealers.includes(order.dealer)) row.dealers.push(order.dealer);
    const own = told.get(way.key) ?? { yes: [], no: [] };
    told.set(way.key, own);
    const films = (byOrder.get(order.id) ?? []).filter((v) => v.part === 'film');
    row.films.push(...(byOrder.get(order.id) ?? []));
    for (const v of byOrder.get(order.id) ?? []) {
      if (v.part === 'retur') { if (v.his === 'ja') row.back.yes++; else if (v.his === 'nej') row.back.no++; continue; }
      if (v.his === 'ja') { row.yes++; own.yes.push(v); } else if (v.his === 'nej') { row.no++; own.no.push(v); }
      if (v.from === 'beslut') { row.beslut.yes++; if (v.at && !row.beslut.days.includes(v.at)) row.beslut.days.push(v.at); }
      if (v.forHim === 'ja') row.forHim.yes++; else if (v.forHim === 'nej') row.forHim.no++;
    }
    // A pilot (kept only for a way he has judged no film of): an order with a film in the bank, or a take that can still give
    // one. The film named is the one approved for him where there is one: that is the film that plays.
    const waits = films.find((v) => v.forHim === 'ja') ?? films[0] ?? null;
    if (waits || takes.some((t) => !DEAD.includes(t))) row.pilots.push({ order: order.id, film: waits?.film ?? null, forHim: waits?.forHim ?? null, takes: [...takes] });
  }
  for (const row of rows.values()) {
    const own = told.get(row.way.key)!;
    row.state = row.no > row.yes ? 'föll' : row.yes ? 'håller' : 'oprövat';
    const word = row.state === 'föll' ? latest(own.no) : row.state === 'håller' ? latest(own.yes) : null;
    row.said = word ? { film: word.film, words: word.words, at: word.at, from: word.from } : null;
    if (row.state !== 'oprövat') row.pilots = [];
  }
  return [...rows.values()];
}

/**
 * The pilot an untried way waits for, another order than `draft`: the newest whose film is approved for him (the film that
 * plays), else the newest with a film in the bank, else the newest. others: how many more wait the same way.
 */
export function pilotOf(row: Pick<WayRow, 'pilots'>, draft = ''): { pilot: Pilot; others: number } | null {
  const pilots = row.pilots.filter((p) => p.order !== draft);
  const pilot = pilots.findLast((p) => p.forHim === 'ja') ?? pilots.findLast((p) => !!p.film) ?? pilots.at(-1);
  return pilot ? { pilot, others: pilots.length - 1 } : null;
}
/** Where he sees a film of the bank: its card in Granska. */
export const reviewAddress = (film: string) => `/studio/granska/?tagning=${film}`;
const quoted = (words: string | null, max = 160) => (words ? ` (”${words.length > max ? `${words.slice(0, max - 1).trimEnd()}…` : words}”)` : '');

/**
 * Why a draft made a certain way cannot be approved now, in plain words, or null when it can: the way fell, or it is
 * untried and its pilot is already approved (another order than the draft itself). A way no approved order was made with
 * has no row: the draft is its pilot.
 */
export function wayStop(row: WayRow | null | undefined, draft: string): string | null {
  if (!row || row.state === 'håller') return null;
  if (row.state === 'föll') {
    const counted = row.yes + row.no > 1 ? ` Av ${row.yes + row.no} filmer som han själv har dömt på det här sättet är ${row.no} underkända${row.beslut.yes ? ` (${row.beslut.yes} ja är ${beslutWords(row.beslut.days)})` : ''}.` : '';
    const forHim = !row.forHim.yes ? '' : row.forHim.yes === 1 ? ' 1 film på sättet är godkänd åt honom; den räknas först när han själv har dömt den i Granska.' : ` ${row.forHim.yes} filmer på sättet är godkända åt honom; de räknas först när han själv har dömt dem i Granska.`;
    return `Sättet föll och beställs inte igen: ${row.words}. Jakob underkände ${row.said?.film ?? 'filmen'}${row.said?.at ? ` ${row.said.at}` : ''}${quoted(row.said?.words ?? null)}.${counted} Ändra receptet (mall, modell, referensfilm eller tur och retur): då är det ett nytt sätt, som prövas med en pilot.${forHim}`;
  }
  const waits = pilotOf(row, draft);
  if (!waits) return null;
  const { pilot, others } = waits, more = others ? ` ${others} order till på samma sätt väntar likadant.` : '';
  const head = `En pilot först: sättet är oprövat (${row.words}), och piloten ${pilot.order} är redan godkänd.`;
  if (!pilot.film) return `${head} Dess film finns inte i banken än (${pilot.takes.length === 1 ? 'tagningen står som' : 'tagningarna står som'} ${[...new Set(pilot.takes)].join(', ')}): hämta den och för in den, så att Jakob ser den i Granska; kom ingen film, avbryt tagningen. Nästa order går att godkänna när han själv har godkänt pilotens film.${more}`;
  return `${head} Filmen ${pilot.film} väntar på Jakobs ögon${pilot.forHim ? ' (den är dömd åt honom, och det räknas inte)' : ''}: han ser och dömer den i Granska, ${reviewAddress(pilot.film)}. När han har godkänt den går nästa order att godkänna; underkänner han den har sättet fallit.${more}`;
}

/** The way's state as an order's row and the guide say it: the line, the short word by the recipe, and why approval stops. */
export type WayAnswer = {
  key: string; words: string; state: WayState; chip: string; stop: string | null;
  /** What the state is counted from, in a sentence: "Jakob själv: 5 ja mot 1 nej (5 ja är hans ja i Beslut 2026-11-23)." */
  basis: string;
};
/** What a way's state is counted from: his own yes against his own no, and where a yes that is not his block in Granska comes from. */
export function wayBasis(row: Pick<WayRow, 'yes' | 'no' | 'beslut'> | null | undefined): string {
  if (!row || !(row.yes + row.no)) return 'Jakob har inte dömt någon film som är gjord så.';
  return `Jakob själv: ${row.yes} ja mot ${row.no} nej${row.beslut.yes ? ` (${row.beslut.yes} ja är ${beslutWords(row.beslut.days)})` : ''}.`;
}
/** "Håller", "Föll: <his words>", "Oprövat: en pilot först". */
export function wayChip(row: Pick<WayRow, 'state' | 'said'> | null | undefined): string {
  if (!row || row.state === 'oprövat') return 'Oprövat: en pilot först';
  if (row.state === 'håller') return 'Håller';
  const words = row.said?.words ?? null;
  return `Föll: ${words ? (words.length > 60 ? `${words.slice(0, 59).trimEnd()}…` : words) : 'Jakob underkände filmen'}`;
}
/** What the store answers about an order's way (null for a still). */
export function wayAnswer(order: OrderFacts & { id?: string }, book: readonly WayRow[], methods: Pick<MethodRegister, 'methods'> | null, rendered: readonly Pick<RenderedReference, 'id' | 'fromDeal'>[]): WayAnswer | null {
  const way = wayOf(order, methods, rendered);
  return way ? answered(way, book, order.id ?? '') : null;
}
function answered(way: Way, book: readonly WayRow[], draft: string): WayAnswer {
  const row = book.find((r) => r.way.key === way.key) ?? null;
  return { key: way.key, words: wayWords(way), state: row?.state ?? 'oprövat', chip: wayChip(row), stop: wayStop(row, draft), basis: wayBasis(row) };
}
/** The text template of a deal saved from the doll (tools/doll-order.ts: --mall 15 unless asked otherwise). */
const DOLL_TEMPLATE = 'film-giv-kort@15';
/**
 * The same deal made the doll's way instead (Bordet's guide, "Från dockan": tools/doll-order.ts): giv och återgång in one
 * film, the doll's built film as reference, template 15. Asked before the doll's film is made, which takes a minute.
 */
export function dollWayAnswer(order: OrderFacts, book: readonly WayRow[], methods: Pick<MethodRegister, 'methods'> | null, rendered: readonly Pick<RenderedReference, 'id' | 'fromDeal'>[]): WayAnswer | null {
  const own = wayOf(order, methods, rendered);
  if (!own || !own.step.startsWith('GIV-')) return null;
  return answered(keyed({ ...own, template: DOLL_TEMPLATE, shape: 'ROUND_TRIP', reference: 'docka-byggd' }), book, '');
}
