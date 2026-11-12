// Orders for Runway, prepared in the studio's view Beställ and placed later by an ordering agent (tools/order-clerk.md).
// Pure: the order's shape and its check, the steps a dealer can be ordered for with their defaults, what goes out per take
// (requestOf), the cost from the price table in data/order-policy.json, the policy check, the hash the approval freezes,
// and the status a person sees. No fs, no network, no hashing (the caller hashes hashInput()); the studio builds it in.
// Tests: tools/order-model.test.ts.

// ── Words ───────────────────────────────────────────────────────────────────
export const ORDER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FILE_NAME = /^[a-z0-9][a-z0-9-]*\.(?:png|jpg|mp4)$/;
export const TEXT_LIMIT = 6000;
export const EXTRA_LIMIT = 600;
export const TAKES_MAX = 4;

export type Kind = 'STILL' | 'FILM';
/** How the card turns on its way: free (the model chooses a natural turn), rolled about the long side, folded over the short side. */
export type FlipAxis = 'FREE' | 'LONG_EDGE' | 'SHORT_EDGE';
export const FLIP_AXES: readonly FlipAxis[] = ['FREE', 'LONG_EDGE', 'SHORT_EDGE'];
export const FLIP_LABEL: Record<FlipAxis, string> = {
  FREE: 'Naturlig vändning',
  LONG_EDGE: 'Rullas kring långsidan',
  SHORT_EDGE: 'Viks över kortsidan som fingrarna håller',
};
export const FLIP_ABOUT: Record<FlipAxis, string> = {
  FREE: 'Ingen bestämd sida: handen vänder kortet som en människa kan från nypet.',
  LONG_EDGE: 'Som bankens filmer gör i dag.',
  SHORT_EDGE: 'Kortet står en stund upprätt på kortsidan mellan tummen och fingrarna.',
};

/** Stored on the order. A draft (UTKAST) can change; an approved order (GODKÄND) never does; AVBRUTEN is set aside. */
export type OrderStatus = 'UTKAST' | 'GODKÄND' | 'AVBRUTEN';
/** A take after approval, in the receipt (assets/orders/<id>/receipt.json, written only by tools/order-put.ts). */
export const TAKE_FLOW = ['GODKÄND', 'LAGD', 'KLAR', 'HÄMTAD', 'EFTERARBETAD', 'MÄTT', 'GRANSKAD', 'INFÖRD'] as const;
export type TakeStatus = (typeof TAKE_FLOW)[number] | 'OSÄKER' | 'MISSLYCKAD' | 'AVBRUTEN';
export const TAKE_STATUSES: readonly TakeStatus[] = [...TAKE_FLOW, 'OSÄKER', 'MISSLYCKAD', 'AVBRUTEN'];
/** What a person sees for an order: before approval the draft's state, after it how its takes stand. */
export type Shown = 'UTKAST' | 'VÄNTAR' | 'KLAR_ATT_TRYCKA' | TakeStatus;
export const SHOWN_LABEL: Record<Shown, string> = {
  UTKAST: 'Utkast',
  VÄNTAR: 'Väntar',
  KLAR_ATT_TRYCKA: 'Klar att godkänna',
  GODKÄND: 'Godkänd, i kön',
  LAGD: 'Lagd',
  OSÄKER: 'Osäker',
  KLAR: 'Klar hos Runway',
  HÄMTAD: 'Hämtad',
  EFTERARBETAD: 'Efterarbetad',
  MÄTT: 'Mätt',
  GRANSKAD: 'Granskad',
  INFÖRD: 'Införd',
  MISSLYCKAD: 'Misslyckad',
  AVBRUTEN: 'Avbruten',
};

// ── The order (data/orders/<id>.json) ───────────────────────────────────────
/** A picture that is not made yet: a role of the register that must hold (gäller), or one entry that must. */
export type Waits = { dealer: string; label: string; role?: string; node?: string; entry?: string };
/** The card drawn on a picture where the placement plan says (the plan's own drawing rule, flatQuad). */
export type Drawn = {
  target: string;
  side: 'FRONT' | 'BACK';
  as: string;
  plan: { path: string; sha256: string; updatedAt: string | null };
  texture: { video: string; frame: number; sha256: string; quadFrom: string };
  quad: [number, number][];
  centre: [number, number];
  measured: { centre: [number, number]; area: number; box: [number, number]; changedElsewhere: number } | null;
  measuredOffsetPx: number | null;
};
export type GoesAs = 'startFrame' | 'endFrame' | 'referenceImage';
/**
 * One picture that goes out. name: the file in assets/orders/<id>/ ("first.png"); path and sha256 are null while it waits.
 * from: where it was copied or built from (a register entry, a frame of a film). preview: while it waits, a picture that
 * shows how it will look (for the last picture, the card drawn on a stand-in), never sent.
 */
export type Picture = {
  name: string;
  label: string;
  goesAs: GoesAs;
  tag?: string;
  path: string | null;
  sha256: string | null;
  width?: number | null;
  height?: number | null;
  from: { entry?: string; path?: string; frame?: number; built?: string; note?: string } | null;
  waits?: Waits | null;
  drawn?: Drawn | null;
  preview?: { path: string; on: string; note: string; drawn?: Drawn | null } | null;
};
export type Reference =
  | { status: 'INGEN'; why: string }
  | { status: 'SAKNAS'; why: string; candidates: string[] }
  | { status: 'FINNS'; clips: string[]; path: string; sha256: string; seconds: number; goesTo: string; approvedStraight: boolean };
export type Generation = {
  provider: 'runway-app';
  tool: 'generate_image' | 'generate_video';
  model: string;
  /** Every parameter that goes out besides text and pictures, by its name in the tool. */
  params: Record<string, string | number | boolean>;
};
export type Motion = { grip: 'PINCH' | 'DRAG'; hand: 'LH' | 'RH'; turn: boolean; flipAxis: FlipAxis; target: string | null; side: 'FRONT' | 'BACK'; fromPlan: boolean };
export type Order = {
  schemaVersion: 1;
  id: string;
  title: string;
  group?: { id: string; label: string } | null;
  dealer: string;
  kind: Kind;
  /** The step: a film between two anchors (edge "READY>P4.C1"), or the picture a still makes (makes). */
  step: { key: StepKey; label: string; edge: string | null; shape: 'ROUND_TRIP' | 'ONE_WAY' | null; cutInto: string[]; makes?: { role: string; entry?: string; label: string } | null };
  motion: Motion | null;
  pictures: Picture[];
  reference: Reference;
  generation: Generation;
  prompt: { template: string; text: string; sha256: string; extra: string | null; middle: boolean };
  takes: number;
  cost: { perTake: number; total: number; worstPerTake: number; worstTotal: number; basis: string };
  limits: { maxCredits: number; stopBelowCredits: number };
  notes: string[];
  created: string;
  createdBy: string;
  approval: { by: 'jakob'; at: string; orderSha256: string } | null;
  status: OrderStatus;
};

// ── Steps and their defaults (bestall-plan "Defaults per kind of step") ─────
export type StepKey = 'INGANG-2.1' | 'INGANG-2.2' | 'GIV-2.1' | 'GIV-2.2' | 'RETUR-2.1' | 'RETUR-1' | 'VILA' | 'ANKARE-2.1' | 'ANKARE-2.2' | 'MELLANBILD';
export type StepDef = {
  key: StepKey;
  group: string;
  label: string;
  kind: Kind;
  /** The anchor the film starts on and the one it ends on ("1", "2.1", "2.2"), or the still's base picture. */
  from: '1' | '2.1' | '2.2';
  to: '1' | '2.1' | '2.2' | null;
  card: boolean;
  grip?: 'PINCH' | 'DRAG';
  model: string;
  resolution?: string;
  ratio?: string;
  imageSize?: string;
  duration?: number;
  /** Why the step cannot be ordered here (yet). */
  off?: string;
  makes?: { role: string; node?: string; label: string };
};
export const STEPS: readonly StepDef[] = [
  { key: 'INGANG-2.1', group: 'Ingång', label: 'Ankare 1 → 2.1', kind: 'FILM', from: '1', to: '2.1', card: false, model: 'wan3', resolution: '1080p', ratio: 'adaptive', duration: 4 },
  { key: 'INGANG-2.2', group: 'Ingång', label: 'Ankare 1 → 2.2', kind: 'FILM', from: '1', to: '2.2', card: false, model: 'wan3', resolution: '1080p', ratio: 'adaptive', duration: 4 },
  { key: 'GIV-2.1', group: 'Giv från 2.1', label: 'Nyp, ett kort till platsen och tillbaka', kind: 'FILM', from: '2.1', to: '2.1', card: true, grip: 'PINCH', model: 'kling-4', resolution: '1080p', duration: 7 },
  { key: 'GIV-2.2', group: 'Giv från 2.2', label: 'Släp, ett kort till platsen och tillbaka', kind: 'FILM', from: '2.2', to: '2.2', card: true, grip: 'DRAG', model: 'wan3', resolution: '1080p', ratio: 'adaptive', duration: 6 },
  { key: 'RETUR-2.1', group: 'Retur → 2.1', label: 'Tillbaka till skon', kind: 'FILM', from: '2.1', to: '2.1', card: true, model: 'kling-4', duration: 3, off: 'Ingår i tur och retur-filmen från ankare 2.' },
  { key: 'RETUR-1', group: 'Retur → 1', label: 'Tillbaka till vila', kind: 'FILM', from: '2.1', to: '1', card: true, model: 'wan3', duration: 3, off: 'Inte byggd här än.' },
  { key: 'VILA', group: 'Vila', label: 'Vila, samma bild först och sist', kind: 'FILM', from: '1', to: '1', card: false, model: 'wan3', resolution: '1080p', ratio: 'adaptive', duration: 4 },
  { key: 'ANKARE-2.1', group: 'Bild', label: 'Ankare 2.1 (nyp)', kind: 'STILL', from: '1', to: null, card: false, model: 'nano-banana-pro', ratio: '4:3', imageSize: '4K', makes: { role: 'ankare-2.1', node: 'READY', label: 'ankare 2.1' } },
  { key: 'ANKARE-2.2', group: 'Bild', label: 'Ankare 2.2 (släp)', kind: 'STILL', from: '1', to: null, card: false, model: 'nano-banana-pro', ratio: '4:3', imageSize: '4K', makes: { role: 'ankare-2.2', node: 'READY-B', label: 'ankare 2.2' } },
  { key: 'MELLANBILD', group: 'Bild', label: 'Mellanbild: kortet på kortsidan mitt i rörelsen', kind: 'STILL', from: '2.1', to: null, card: false, model: 'nano-banana-pro', ratio: '4:3', imageSize: '4K', makes: { role: 'arbetsmaterial', label: 'mellanbilden' } },
];
export const stepOf = (key: string): StepDef | null => STEPS.find((s) => s.key === key) ?? null;
/** The graph's node of an anchor ("2.1" → READY). */
export const ANCHOR_NODE: Record<'1' | '2.1' | '2.2', string> = { '1': 'IDLE', '2.1': 'READY', '2.2': 'READY-B' };
/** The register's role of an anchor. */
export const ANCHOR_ROLE: Record<'1' | '2.1' | '2.2', string> = { '1': 'ankare-1', '2.1': 'ankare-2.1', '2.2': 'ankare-2.2' };
/** The edge a film step is filed under, in the graph's notation: READY>P4.C1, IDLE>READY. */
export function edgeOf(step: StepDef, target: string | null): string | null {
  if (step.kind !== 'FILM') return null;
  if (step.card && target) return step.to === '1' ? `${target}>IDLE` : `${ANCHOR_NODE[step.from]}>${target}`;
  return `${ANCHOR_NODE[step.from]}>${ANCHOR_NODE[step.to ?? step.from]}`;
}
export const SEAT_TARGETS = ['P1.C1', 'P2.C1', 'P3.C1', 'P4.C1', 'P5.C1', 'P6.C1', 'P7.C1', 'D.C1'];

// ── Models: what each takes (from the tools' schemas, 2026-11-12) ──────────
export type ModelDef = { id: string; tool: Generation['tool']; label: string; durations?: [number, number]; resolutions?: string[]; middle?: boolean; audio: 'always' | 'off' | 'none'; note: string };
export const MODELS: Record<string, ModelDef> = {
  'kling-4': { id: 'kling-4', tool: 'generate_video', label: 'Kling 4', durations: [3, 30], resolutions: ['720p', '1080p'], middle: true, audio: 'always', note: 'Följer första och sista bild; ljudet är alltid på och tas bort i efterarbetet.' },
  wan3: { id: 'wan3', tool: 'generate_video', label: 'WAN 3', durations: [2, 30], resolutions: ['480p', '720p', '1080p'], middle: false, audio: 'off', note: 'Två bilder och en text; ratio adaptive ger bankens 1764 × 1174.' },
  'nano-banana-pro': { id: 'nano-banana-pro', tool: 'generate_image', label: 'Nano Banana Pro', audio: 'none', note: 'Redigering av dealerns egen bild med referensbilder (@tagg i texten).' },
};

// ── Policy and prices (data/order-policy.json) ──────────────────────────────
export type Price = { model: string; resolution?: string; imageSize?: string; perSecond?: number; perImage?: number; listedPerSecond?: number; source: string };
export type Policy = {
  schemaVersion: 1;
  enabled: boolean;
  dailyCapCredits: number;
  maxPerOrder: number;
  minBalance: number;
  timeZone: string;
  balance: { credits: number; at: string; source: string };
  prices: Price[];
};

/** The price of one take, and the worst case (the tool's listed price where it is higher than the ledgers'). */
export function priceOf(generation: Pick<Generation, 'model' | 'params'>, prices: readonly Price[]): { perTake: number; worstPerTake: number; basis: string } | null {
  const { model, params } = generation;
  const p = prices.find((x) => x.model === model && (x.resolution === undefined || x.resolution === params.resolution) && (x.imageSize === undefined || x.imageSize === params.imageSize));
  if (!p) return null;
  if (p.perImage !== undefined) return { perTake: p.perImage, worstPerTake: p.perImage, basis: `${p.perImage} krediter per bild. ${p.source}` };
  const seconds = Number(params.duration);
  if (!p.perSecond || !(seconds > 0)) return null;
  const perTake = Math.ceil(seconds * p.perSecond - 1e-9);
  const worstPerTake = Math.ceil(seconds * Math.max(p.perSecond, p.listedPerSecond ?? 0) - 1e-9);
  return { perTake, worstPerTake, basis: `${String(p.perSecond).replace('.', ',')} krediter per s × ${seconds} s. ${p.source}` };
}

export function costOf(generation: Pick<Generation, 'model' | 'params'>, takes: number, prices: readonly Price[]): Order['cost'] | null {
  const price = priceOf(generation, prices);
  if (!price) return null;
  return { perTake: price.perTake, total: price.perTake * takes, worstPerTake: price.worstPerTake, worstTotal: price.worstPerTake * takes, basis: price.basis };
}

/** The calendar day of a moment in the policy's time zone: "2026-11-12". */
export function dayOf(iso: string, timeZone = 'Europe/Stockholm'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Credits committed on a day: the worst-case total of every order approved that day. */
export function spentOn(orders: readonly Pick<Order, 'approval' | 'cost' | 'status'>[], day: string, timeZone = 'Europe/Stockholm'): number {
  return orders.filter((o) => o.approval && o.status !== 'AVBRUTEN' && dayOf(o.approval.at, timeZone) === day).reduce((sum, o) => sum + o.cost.worstTotal, 0);
}

export type PolicyCheck = { ok: boolean; refusals: string[]; spentToday: number; afterToday: number; balance: number; balanceAfter: number };
/** Whether the policy lets this order be approved now. The worst-case cost counts. */
export function checkPolicy(order: Pick<Order, 'cost'>, policy: Policy, spentToday: number, balance: number): PolicyCheck {
  const cost = order.cost.worstTotal, refusals: string[] = [];
  if (!policy.enabled) refusals.push('Beställningar är avstängda (enabled: false i data/order-policy.json).');
  if (cost > policy.maxPerOrder) refusals.push(`Beställningen kostar upp till ${cost} krediter; taket per beställning är ${policy.maxPerOrder}.`);
  if (spentToday + cost > policy.dailyCapCredits) refusals.push(`I dag är ${spentToday} av ${policy.dailyCapCredits} krediter intecknade; den här skulle ta det till ${spentToday + cost}.`);
  if (balance - cost < policy.minBalance) refusals.push(`Saldot ${balance} minus ${cost} går under golvet ${policy.minBalance}.`);
  return { ok: refusals.length === 0, refusals, spentToday, afterToday: spentToday + cost, balance, balanceAfter: balance - cost };
}

// ── What goes out ───────────────────────────────────────────────────────────
/** A local picture or film in the call: the ordering agent uploads the file and puts its hosted address here. */
export const fileRef = (name: string) => `$file:${name}`;
export type Request = { tool: Generation['tool']; args: Record<string, unknown> };

/**
 * The exact call for one take (1-based): the tool and its arguments, with $file:<name> where an uploaded address goes.
 * Take 2 and later carry confirmRepeat (otherwise the tool returns the earlier task for an identical request).
 */
export function requestOf(order: Pick<Order, 'generation' | 'pictures' | 'reference' | 'prompt'>, take: number): Request {
  const { tool, model, params } = order.generation;
  const args: Record<string, unknown> = { model, promptText: order.prompt.text, ...params };
  const start = order.pictures.find((p) => p.goesAs === 'startFrame');
  const end = order.pictures.find((p) => p.goesAs === 'endFrame');
  const refs = order.pictures.filter((p) => p.goesAs === 'referenceImage');
  if (start) args.startFrame = { url: fileRef(start.name) };
  if (end) args.endFrame = { url: fileRef(end.name) };
  if (refs.length) args.referenceImages = refs.map((p) => (p.tag ? { url: fileRef(p.name), tag: p.tag } : { url: fileRef(p.name) }));
  if (order.reference.status === 'FINNS') args.referenceVideos = [{ url: fileRef(order.reference.path.split('/').pop()!), durationSeconds: order.reference.seconds }];
  if (tool === 'generate_image') args.count = 1;
  if (take > 1) args.confirmRepeat = true;
  return { tool, args };
}

// ── The hash the approval freezes ───────────────────────────────────────────
/** Keys sorted at every level, so that the same content always gives the same text. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
/** What the approval's orderSha256 is the hash of: everything in the order but approval and status. */
export function hashInput(order: Order): string {
  const { approval: _approval, status: _status, ...rest } = order;
  return canonical(rest);
}

// ── State ───────────────────────────────────────────────────────────────────
export const waitingOf = (order: Pick<Order, 'pictures'>): Waits[] => order.pictures.filter((p) => p.waits && !p.path).map((p) => p.waits!);
/** "ankare 2.1", "ankare 2.1 och mellanbilden". */
export function waitWords(waits: readonly Waits[]): string {
  const labels = [...new Set(waits.map((w) => w.label))];
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} och ${labels[labels.length - 1]}`;
}
export type Receipt = {
  schemaVersion: 1;
  order: string;
  orderSha256: string;
  takes: { take: number; status: TakeStatus; requestedAt: string | null; taskId: string | null; creditsRemainingAfter?: number | null; error?: string | null; file?: string | null; sha256?: string | null; history: { at: string; status: TakeStatus; note?: string }[] }[];
};
/** The takes of an approved order as they stand: a take the receipt does not name waits in the queue. */
export function takeStates(order: Pick<Order, 'takes'>, receipt: Receipt | null): TakeStatus[] {
  return Array.from({ length: order.takes }, (_, i) => receipt?.takes.find((t) => t.take === i + 1)?.status ?? 'GODKÄND');
}
/** The one status shown for an order: the least advanced of its takes once approved (a failure or doubt first). */
export function shownOf(order: Order, problems: readonly string[], receipt: Receipt | null): Shown {
  if (order.status === 'AVBRUTEN') return 'AVBRUTEN';
  if (!order.approval) return waitingOf(order).length ? 'VÄNTAR' : problems.length ? 'UTKAST' : 'KLAR_ATT_TRYCKA';
  const states = takeStates(order, receipt);
  for (const s of ['OSÄKER', 'MISSLYCKAD'] as const) if (states.includes(s)) return s;
  const live = states.filter((s) => s !== 'AVBRUTEN');
  if (!live.length) return 'AVBRUTEN';
  return live.reduce((a, b) => (TAKE_FLOW.indexOf(a as (typeof TAKE_FLOW)[number]) <= TAKE_FLOW.indexOf(b as (typeof TAKE_FLOW)[number]) ? a : b));
}

/** What keeps a draft from being approved, in words (pictures waiting, files missing, text missing). Pure part only. */
export function draftProblems(order: Order): string[] {
  const out: string[] = [];
  const waits = waitingOf(order);
  if (waits.length) out.push(`Väntar på ${waitWords(waits)}.`);
  for (const p of order.pictures) if (!p.waits && (!p.path || !p.sha256)) out.push(`${p.label} saknas.`);
  if (order.reference.status === 'SAKNAS') out.push('Referensfilmen saknas: välj en eller ingen.');
  if (!order.prompt.text.trim()) out.push('Texten saknas.');
  return out;
}

// ── Check of an order file ──────────────────────────────────────────────────
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const SHA = /^[0-9a-f]{64}$/;
export function validateOrder(value: unknown): { order: Order | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { order: null, errors: ['Beställningen är inte ett objekt.'] };
  const o = value as Partial<Order>;
  if (o.schemaVersion !== 1) errors.push('schemaVersion ska vara 1.');
  if (typeof o.id !== 'string' || !ORDER_ID.test(o.id) || o.id.length > 80) errors.push('id ska vara a–z, 0–9 och bindestreck.');
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 120) errors.push('title saknas eller är för lång.');
  if (typeof o.dealer !== 'string' || !/^[a-z0-9]+$/.test(o.dealer)) errors.push('dealer ska vara ett id.');
  if (o.kind !== 'STILL' && o.kind !== 'FILM') errors.push('kind ska vara STILL eller FILM.');
  if (!isObject(o.step) || !stepOf(String(o.step.key))) errors.push('step.key är okänd.');
  if (!Array.isArray(o.pictures) || !o.pictures.length) errors.push('pictures saknas.');
  else {
    const names = new Set<string>();
    o.pictures.forEach((p, i) => {
      const at = `pictures[${i}]`;
      if (!isObject(p) || typeof p.name !== 'string' || !FILE_NAME.test(p.name)) return void errors.push(`${at}: name ska vara ett filnamn (a–z, 0–9, -, .png/.jpg).`);
      if (names.has(p.name)) errors.push(`${at}: ${p.name} finns två gånger.`);
      names.add(p.name);
      if (!['startFrame', 'endFrame', 'referenceImage'].includes(String(p.goesAs))) errors.push(`${at}: goesAs är okänd.`);
      if (p.path !== null && (typeof p.path !== 'string' || p.path !== `assets/orders/${o.id}/${p.name}`)) errors.push(`${at}: path ska vara assets/orders/<id>/${p.name} eller null.`);
      if (p.sha256 !== null && (typeof p.sha256 !== 'string' || !SHA.test(p.sha256))) errors.push(`${at}: sha256 ska vara 64 hextecken eller null.`);
      if ((p.path === null) !== (p.sha256 === null)) errors.push(`${at}: path och sha256 hör ihop.`);
      if (p.path === null && !p.waits) errors.push(`${at}: en bild utan fil måste vänta på något (waits).`);
    });
    if (o.pictures.filter((p) => p?.goesAs === 'startFrame').length > 1 || o.pictures.filter((p) => p?.goesAs === 'endFrame').length > 1) errors.push('Högst en första och en sista bild.');
  }
  if (!isObject(o.generation) || o.generation.provider !== 'runway-app' || !MODELS[String(o.generation.model)]) errors.push('generation: okänd modell eller leverantör.');
  else {
    const m = MODELS[o.generation.model];
    if (o.generation.tool !== m.tool) errors.push(`generation.tool ska vara ${m.tool} för ${m.label}.`);
    if (!isObject(o.generation.params)) errors.push('generation.params saknas.');
    else {
      for (const key of ['promptText', 'startFrame', 'endFrame', 'referenceImages', 'referenceVideos', 'confirmRepeat', 'count']) if (key in o.generation.params) errors.push(`generation.params får inte ha ${key}: den sätts ur bilderna och texten.`);
      const d = o.generation.params.duration;
      if (m.durations && (typeof d !== 'number' || d < m.durations[0] || d > m.durations[1])) errors.push(`Längden ska vara ${m.durations[0]}–${m.durations[1]} s för ${m.label}.`);
      if (m.audio === 'always' && 'generateAudio' in o.generation.params) errors.push(`${m.label} tar inte generateAudio (ljudet är alltid på).`);
      if (Array.isArray(o.pictures) && !m.middle && o.kind === 'FILM' && o.pictures.some((p) => p?.goesAs === 'referenceImage')) errors.push(`${m.label} tar ingen mellanbild här.`);
    }
  }
  if (!isObject(o.prompt) || typeof o.prompt.text !== 'string' || o.prompt.text.length > TEXT_LIMIT || typeof o.prompt.sha256 !== 'string') errors.push('prompt: text och sha256 krävs.');
  else if (o.prompt.extra !== null && (typeof o.prompt.extra !== 'string' || o.prompt.extra.length > EXTRA_LIMIT)) errors.push(`prompt.extra får vara högst ${EXTRA_LIMIT} tecken.`);
  if (!Number.isInteger(o.takes) || (o.takes as number) < 1 || (o.takes as number) > TAKES_MAX) errors.push(`takes ska vara 1–${TAKES_MAX}.`);
  if (!isObject(o.cost) || !(Number(o.cost.total) >= 0) || !(Number(o.cost.worstTotal) >= Number(o.cost.total))) errors.push('cost saknas.');
  if (!isObject(o.reference) || !['INGEN', 'SAKNAS', 'FINNS'].includes(String(o.reference.status))) errors.push('reference.status ska vara INGEN, SAKNAS eller FINNS.');
  if (!['UTKAST', 'GODKÄND', 'AVBRUTEN'].includes(String(o.status))) errors.push('status ska vara UTKAST, GODKÄND eller AVBRUTEN.');
  if (o.approval !== null && (!isObject(o.approval) || o.approval.by !== 'jakob' || typeof o.approval.at !== 'string' || !SHA.test(String(o.approval.orderSha256)))) errors.push('approval ska vara null eller {by: "jakob", at, orderSha256}.');
  if (o.status === 'GODKÄND' && !o.approval) errors.push('En godkänd beställning måste ha approval.');
  if (o.status === 'UTKAST' && o.approval) errors.push('Ett utkast har ingen approval.');
  if (!Array.isArray(o.notes)) errors.push('notes ska vara en lista.');
  return { order: errors.length ? null : (o as Order), errors };
}

// ── What GET /api/orders answers (tools/order-store.ts list) ────────────────
/** Each order as the view gets it: its revision (If-Match), hash, shown status, what keeps it, what it waits for. */
export type OrderAnswer = {
  order: Order;
  revision: string;
  hash: string;
  shown: Shown;
  problems: string[];
  warnings: string[];
  waiting: (Waits & { ready: boolean })[];
  receipt: Receipt | null;
  check: PolicyCheck | null;
};
export type OrdersAnswer = {
  schemaVersion: 1;
  orders: OrderAnswer[];
  policy: Policy | null;
  day: { date: string; spent: number; cap: number };
  balance: { credits: number; at: string; source: string } | null;
  problems: string[];
};

/** Words for a credit sum: "1 000". */
export const credits = (n: number) => Math.round(n).toLocaleString('sv-SE').replace(/ /g, ' ');
