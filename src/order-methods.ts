// The method of record (data/order-methods.json): per kind of step, and per class of seat where the evidence differs, the ONE
// recipe a film or still is ordered with (model, resolution, seconds, takes, text style and template, shape, turn, reference
// film rule, where the last picture comes from, Jakob's addition) and whether that is settled (gäller), still being tried
// (prov) or not known (saknas). Nothing else in the repo says how a step is ordered: the steps (src/order-model.ts STEPS) only
// say what a film is between, and the store, Bordet and the production list all take their defaults from recipeFor here.
// Pure: the register's check against the steps, models and styles that exist, the recipe for a step and a seat, the reference
// film the recipe's rule finds (referenceByRule), the film's length (secondsOf), and the words the production list
// (tools/produce.ts) and Beställ show. No fs, no network. Tests: tools/order-methods.test.ts.
import { FLIP_AXES, FLIP_LABEL, MODELS, STEPS, TAKES_MAX, lengthFor, lengthOfReference, modelFor, referenceCandidates, stepOf, stylesFor, type BankFacts, type FlipAxis, type ModelDef, type RefCandidate, type Shape, type StepDef, type StepKey, type TextStyle } from './order-model.ts';
import { TEMPLATE_VERSION } from './order-prompts.ts';

export const METHOD_STATUSES = ['gäller', 'prov', 'saknas'] as const;
export type MethodStatus = (typeof METHOD_STATUSES)[number];
export const METHOD_STATUS_LABEL: Record<MethodStatus, string> = { gäller: 'gäller', prov: 'prövas', saknas: 'ingen metod än' };
/** The classes of seats whose evidence differs: the middle seats, the far seats, the dealer's own cards. */
export const SEAT_CLASSES = ['mitten', 'ytter', 'dealer'] as const;
export type SeatClass = (typeof SEAT_CLASSES)[number];
/**
 * A reference film rule: none; a film of the bank that shows the same step to the same seat, approved straight by Jakob (any
 * dealer's); the dummy's rendered film for the seat, read off a real deal (from trial 2C2, 2026-11-18), else such a film of
 * the bank; or only the dummy's film (the far seats, where the bank's approved deal fell as a reference in trial 2B). Where
 * the rule finds no film the step waits: nothing is ordered without one.
 */
export const REFERENCE_RULES = ['ingen', 'samma-plats-rakt-godkänd', 'renderad-eller-samma-plats', 'renderad'] as const;
export type ReferenceRule = (typeof REFERENCE_RULES)[number];
export const REFERENCE_LABEL: Record<ReferenceRule, string> = {
  ingen: 'ingen referensfilm',
  'samma-plats-rakt-godkänd': 'referensfilm: en rakt godkänd giv till samma plats',
  'renderad-eller-samma-plats': 'referensfilm: dockan till platsen, annars en rakt godkänd giv dit',
  renderad: 'referensfilm: dockan till platsen',
};
/** What a step waits for where its rule finds no reference film, in Jakob's words. */
export const REFERENCE_WAITS: Record<Exclude<ReferenceRule, 'ingen'>, string> = {
  'samma-plats-rakt-godkänd': 'väntar på en rakt godkänd giv till platsen som referensfilm',
  'renderad-eller-samma-plats': 'väntar på dockans film till platsen eller en rakt godkänd giv dit',
  renderad: 'väntar på dockans film till platsen',
};
/** The same for a given step: a film without a card has no seat, so "till platsen" and "dit" are left out. */
export const referenceWaits = (rule: ReferenceRule, step: Pick<StepDef, 'card'>): string =>
  rule === 'ingen' ? '' : step.card ? REFERENCE_WAITS[rule] : REFERENCE_WAITS[rule].replace(' till platsen', '').replace(' dit', '').replace('giv', 'film av samma steg');
/**
 * Where the last picture comes from: the anchor the film ends on (ankare); the first picture with the card drawn where the
 * plan lays it (ritat-kort: a round trip, the hole card's turn); or the seat's own end picture (platsens-slutbild: its
 * landing picture where one holds, else the cut frame of the bank's film to the seat, seatEndOf in src/order-model.ts).
 */
export const LAST_PICTURES = ['ankare', 'ritat-kort', 'platsens-slutbild'] as const;
export type LastPicture = (typeof LAST_PICTURES)[number];
export const LAST_PICTURE_LABEL: Record<LastPicture, string> = { ankare: 'sista bild: ankaret', 'ritat-kort': 'sista bild: ankaret med kortet ritat', 'platsens-slutbild': 'sista bild: platsens egen slutbild' };

export type Method = {
  id: string;
  step: StepKey;
  /** null: every seat (or a step without a seat). */
  seats: SeatClass | null;
  status: MethodStatus;
  /** The recipe: for gäller what is ordered, for prov the next trial; null where nothing is known (saknas). */
  model: string | null;
  /** A film's resolution as the tool takes it ("1080p"); null for a still and where nothing is known. */
  resolution: string | null;
  style: TextStyle | null;
  /** The text template the recipe was written and tried with (src/order-prompts.ts TEMPLATE_VERSION); null where nothing is known. */
  template: number | null;
  /**
   * A film's length where no reference film goes with it: the shortest the model takes that covers the movement. With a
   * reference film the film is as long as the reference (secondsOf).
   */
  seconds: number | null;
  /** One take per trial (prov), two per clip once the method holds (Jakob's frame, docs/BESKED.md). */
  takes: number | null;
  /** plan: what Placering says per card; a turn of the model; null for a step without a turned card. */
  turn: 'plan' | FlipAxis | null;
  /**
   * The hand of a deal: LH, the hand at the shoe takes the card and lays it (every trial that held); plan, what Placering
   * says per card; null where the step has no hand to say or its own (the two hands of anchor 2.3). Never a handbyte: it
   * fell in both its trials, so the plan's handbyte for a card is an exception a draft has to say, not a default.
   */
  hand: 'plan' | 'LH' | 'RH' | null;
  shape: Shape | null;
  reference: ReferenceRule;
  lastPicture: LastPicture | null;
  /** Jakob's addition, one positive sentence, or null. */
  extra: string | null;
  evidence: { orders: string[]; reviewer: string[]; owner: { take: string; words: string }[]; note: string };
  setBy: string;
  setAt: string;
};
export type MethodRegister = { about: string; schemaVersion: 1; methods: Method[] };

/** The class of a card's seat: P3–P5 the middle, P1, P2, P6, P7 the far seats, D.* the dealer's own. */
export function seatClass(target: string | null | undefined): SeatClass | null {
  const m = /^P([1-7])\.C\d$/.exec(target ?? '');
  if (m) return ['3', '4', '5'].includes(m[1]) ? 'mitten' : 'ytter';
  return /^D\.C\d$/.test(target ?? '') ? 'dealer' : null;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
/** Where the last picture of a step with this shape comes from: there is one right answer per step and shape. */
export function lastPictureOf(step: Pick<StepDef, 'kind' | 'card' | 'start' | 'cards'>, shape: Shape | null): LastPicture | null {
  if (step.kind !== 'FILM') return null;
  if (step.cards?.length) return 'ritat-kort';
  if (step.card && step.start !== 'LAND') return shape === 'ONE_WAY' ? 'platsens-slutbild' : 'ritat-kort';
  return 'ankare';
}

/**
 * The register as read, or null with every fault: each method names a step that exists; a model that can make that step
 * and is still offered, a resolution and seconds the model takes, a style of that step, today's template, 1–4 takes (one
 * for a trial); a seat class only for a step with a seat; gäller and prov carry a whole recipe; the last picture is the
 * one the step's shape has; no two methods for the same step and class.
 */
export function readMethods(value: unknown): { register: MethodRegister | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { register: null, errors: ['Registret är inte ett objekt.'] };
  if (value.schemaVersion !== 1) errors.push('schemaVersion ska vara 1.');
  if (typeof value.about !== 'string' || !value.about.trim()) errors.push('about saknas.');
  if (!Array.isArray(value.methods)) return { register: null, errors: [...errors, 'methods saknas.'] };
  const seen = new Set<string>(), slots = new Set<string>();
  value.methods.forEach((raw, i) => {
    const at = `methods[${i}]`;
    if (!isObject(raw)) return void errors.push(`${at}: inte ett objekt.`);
    const m = raw as Partial<Method>;
    if (typeof m.id !== 'string' || !ID.test(m.id)) errors.push(`${at}: id ska vara a–z, 0–9, punkt och bindestreck.`);
    else if (seen.has(m.id)) errors.push(`${at}: ${m.id} finns två gånger.`);
    else seen.add(m.id);
    const step = stepOf(String(m.step));
    if (!step) return void errors.push(`${at}: steget ${String(m.step)} finns inte (${STEPS.map((s) => s.key).join(', ')}).`);
    if (m.seats !== null && !(SEAT_CLASSES as readonly unknown[]).includes(m.seats)) errors.push(`${at}: seats ska vara null eller ${SEAT_CLASSES.join(', ')}.`);
    if (m.seats && !step.card) errors.push(`${at}: ${step.key} har ingen plats att dela på.`);
    const slot = `${step.key}|${m.seats ?? '*'}`;
    if (slots.has(slot)) errors.push(`${at}: två metoder för ${step.key}${m.seats ? ` (${m.seats})` : ''}.`);
    slots.add(slot);
    if (!(METHOD_STATUSES as readonly unknown[]).includes(m.status)) errors.push(`${at}: status ska vara ${METHOD_STATUSES.join(', ')}.`);
    if (!(REFERENCE_RULES as readonly unknown[]).includes(m.reference)) errors.push(`${at}: reference ska vara ${REFERENCE_RULES.join(' eller ')}.`);
    const whole = m.status === 'gäller' || m.status === 'prov';
    if (m.model !== null && m.model !== undefined) {
      const model = modelFor(step, String(m.model));
      if (!model) errors.push(`${at}: modellen ${String(m.model)} finns inte eller kan inte göra ${step.label}.`);
      else {
        if (model.off && whole) errors.push(`${at}: ${model.label} beställs inte längre.`);
        if (m.reference !== 'ingen' && whole && !model.videos) errors.push(`${at}: ${model.label} tar ingen referensfilm.`);
        if (step.kind === 'FILM' && m.seconds !== null && m.seconds !== undefined && model.durations && !(m.seconds >= model.durations[0] && m.seconds <= model.durations[1])) errors.push(`${at}: ${model.label} tar ${model.durations.join('–')} s.`);
        if (step.kind === 'FILM' && whole && !(typeof m.resolution === 'string' && (!model.resolutions || model.resolutions.includes(m.resolution)))) errors.push(`${at}: ${model.label} tar upplösningen ${(model.resolutions ?? []).join(', ')}.`);
      }
    } else if (whole) errors.push(`${at}: ${m.status} kräver en modell.`);
    if (step.kind === 'STILL' && m.resolution !== null && m.resolution !== undefined) errors.push(`${at}: en bild har ingen upplösning här (stegets storlek gäller).`);
    if (m.style !== null && m.style !== undefined && !stylesFor(step.kind, step).includes(m.style)) errors.push(`${at}: stilen ${String(m.style)} finns inte för ${step.label}.`);
    else if ((m.style === null || m.style === undefined) && whole) errors.push(`${at}: ${m.status} kräver en stil.`);
    if (whole && m.template !== TEMPLATE_VERSION) errors.push(`${at}: receptet säger mall ${String(m.template)}; texten skrivs med mall ${TEMPLATE_VERSION}. Ett recept gäller den mall det är prövat med: pröva om eller skriv om det.`);
    if (step.kind === 'FILM' && whole && !(typeof m.seconds === 'number' && m.seconds > 0)) errors.push(`${at}: en film kräver sekunder.`);
    if (step.kind === 'STILL' && m.seconds !== null && m.seconds !== undefined) errors.push(`${at}: en bild har inga sekunder.`);
    if (m.takes !== null && m.takes !== undefined && !(Number.isInteger(m.takes) && m.takes >= 1 && m.takes <= TAKES_MAX)) errors.push(`${at}: takes ska vara 1–${TAKES_MAX}.`);
    else if ((m.takes === null || m.takes === undefined) && whole) errors.push(`${at}: ${m.status} kräver antal tagningar.`);
    else if (m.status === 'prov' && m.takes !== 1) errors.push(`${at}: ett prov är en tagning (takes 1); två tagningar per klipp först när metoden gäller.`);
    if (m.turn !== null && m.turn !== undefined && m.turn !== 'plan' && !FLIP_AXES.includes(m.turn as FlipAxis)) errors.push(`${at}: turn ska vara plan, ${FLIP_AXES.join(', ')} eller null.`);
    if (m.turn && !step.card) errors.push(`${at}: ${step.key} vänder inget kort som väljs.`);
    if (m.hand !== null && m.hand !== undefined && !['plan', 'LH', 'RH'].includes(m.hand)) errors.push(`${at}: hand ska vara plan, LH, RH eller null.`);
    if (m.hand && !(step.card && step.start !== 'LAND' && step.grip !== 'TWO_HANDS')) errors.push(`${at}: ${step.key} har ingen hand att välja.`);
    if (m.shape !== null && m.shape !== undefined && m.shape !== 'ROUND_TRIP' && m.shape !== 'ONE_WAY') errors.push(`${at}: shape ska vara ROUND_TRIP, ONE_WAY eller null.`);
    if (m.shape === 'ROUND_TRIP' && !(step.card && step.start !== 'LAND')) errors.push(`${at}: bara en giv går tur och retur.`);
    if (whole && step.card && step.start !== 'LAND' && !m.shape) errors.push(`${at}: en giv säger sin form (ONE_WAY eller ROUND_TRIP).`);
    if (m.lastPicture !== null && m.lastPicture !== undefined && !(LAST_PICTURES as readonly unknown[]).includes(m.lastPicture)) errors.push(`${at}: lastPicture ska vara ${LAST_PICTURES.join(', ')} eller null.`);
    else if (whole && (m.lastPicture ?? null) !== lastPictureOf(step, m.shape ?? null)) errors.push(`${at}: lastPicture ska vara ${String(lastPictureOf(step, m.shape ?? null))} för ${step.key}${m.shape ? ` (${m.shape})` : ''}.`);
    if (m.extra !== null && m.extra !== undefined && (typeof m.extra !== 'string' || !m.extra.trim() || m.extra.length > 600)) errors.push(`${at}: extra ska vara en mening (högst 600 tecken) eller null.`);
    const e = m.evidence as Method['evidence'] | undefined;
    if (!isObject(e) || !Array.isArray(e.orders) || !Array.isArray(e.reviewer) || !Array.isArray(e.owner) || typeof e.note !== 'string') errors.push(`${at}: evidence ska ha orders, reviewer, owner och note.`);
    else if (e.owner.some((o) => !isObject(o) || typeof o.take !== 'string' || typeof o.words !== 'string' || !/^\S+ \d{4}-\d{2}-\d{2}: /.test(o.words))) errors.push(`${at}: Jakobs ord citeras som de står i review.userReview ("Jakob 2026-11-13: …"), med tagningen.`);
    if (typeof m.setBy !== 'string' || !m.setBy.trim() || typeof m.setAt !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(m.setAt)) errors.push(`${at}: setBy och setAt (vem och när) krävs.`);
  });
  return { register: errors.length ? null : (value as unknown as MethodRegister), errors };
}

/** The method for a step and a seat: the one for its class of seat, else the one for every seat; null when none is written. */
export function methodFor(register: Pick<MethodRegister, 'methods'> | null, step: StepKey, target: string | null = null): Method | null {
  const list = register?.methods.filter((m) => m.step === step) ?? [];
  const cls = seatClass(target);
  return list.find((m) => m.seats !== null && m.seats === cls) ?? list.find((m) => m.seats === null) ?? null;
}

/**
 * The step's one recipe for a seat, with every value a draft needs: the method that holds or is being tried. Null where no
 * method is written or it holds nothing (saknas): such a step has no default, and ordering it is a deliberate exception
 * where the model and the length are said by the one who orders.
 */
export type Recipe = { method: Method; model: string; resolution: string | null; seconds: number | null; takes: number; style: TextStyle; template: number; shape: Shape | null; turn: FlipAxis | null; /** The hand that takes and lays the card; null: what Placering says for the card. */ hand: 'LH' | 'RH' | null; reference: ReferenceRule; lastPicture: LastPicture | null; extra: string | null };
export function recipeFor(register: Pick<MethodRegister, 'methods'> | null, step: StepKey, target: string | null = null): Recipe | null {
  const m = methodFor(register, step, target);
  if (!m || m.status === 'saknas' || !m.model || !m.style || !m.takes) return null;
  return { method: m, model: m.model, resolution: m.resolution, seconds: m.seconds, takes: m.takes, style: m.style, template: m.template ?? TEMPLATE_VERSION, shape: m.shape, turn: m.turn && m.turn !== 'plan' ? m.turn : null, hand: m.hand === 'LH' || m.hand === 'RH' ? m.hand : null, reference: m.reference, lastPicture: m.lastPicture, extra: m.extra };
}

/**
 * The hands of a film where the one who orders says nothing about them: Bordet's row (studio/lib/bordet.ts lineOf), the
 * store's draft (tools/order-store.ts create) and the production list (tools/produce.ts) all take them from here. From
 * anchor 2.3 the hand at the shoe strokes the card out and the other hand lays it; a deal takes the recipe's hand all the
 * way; else what Placering says for the card (its hand, and a handbyte only where the plan says one and the recipe names
 * no hand). `lays` is the hand that lays the card: what a reference film and a cut frame must have been laid with.
 */
export function recipeHands(step: Pick<StepDef, 'card' | 'start' | 'grip'>, recipe: Pick<Recipe, 'hand'> | null, seat: { hand?: 'LH' | 'RH'; pass?: boolean } | null): { hand: 'LH' | 'RH'; pass: boolean; lays: 'LH' | 'RH' } {
  if (step.grip === 'TWO_HANDS') return { hand: 'LH', pass: false, lays: 'RH' };
  if (step.card && step.start !== 'LAND' && recipe?.hand) return { hand: recipe.hand, pass: false, lays: recipe.hand };
  const pass = !!step.card && !!seat?.pass, hand = pass ? 'LH' : (seat?.hand ?? 'LH');
  return { hand, pass, lays: pass ? 'RH' : hand };
}

/**
 * The reference film a rule finds for a step and a seat, or null (the step then waits). Always a film of the same step to
 * the same seat that passes its own reference check where one has been run. For a deal bara dit also a film that is the deal
 * alone: a take cut from a round trip sends the whole film, and a reference must end as the last picture does (handbook §5).
 * The dummy's film comes first under the rules that take it; a film of the bank must be approved straight by Jakob. The
 * film's laying hand is the order's (lays; the left where nothing is said): a one-hand deal is no reference for a handbyte.
 */
export function referenceByRule(bank: BankFacts | null, rule: ReferenceRule, want: { dealer: string; step: StepDef; target: string | null; model: Pick<ModelDef, 'referenceSeconds' | 'videos'> | null; shape?: Shape | null; lays?: 'LH' | 'RH' | null }): RefCandidate | null {
  if (rule === 'ingen' || !bank || !want.model?.videos) return null;
  const rendered = rule === 'renderad' || rule === 'renderad-eller-samma-plats', banked = rule !== 'renderad';
  return referenceCandidates(bank, want).find((c) =>
    c.match === 0 && c.fits && !(c.check && !c.check.pass) && (want.shape !== 'ONE_WAY' || !c.frames) && (c.lays ?? 'LH') === (want.lays ?? 'LH')
    && (c.kind === 'RENDERED' ? rendered : banked && c.approvedStraight && c.verdict === 'GODKÄND')) ?? null;
}

/**
 * A film's length: with a reference film the reference's own, in whole seconds the model takes (the text says "with the
 * same timing"); without one the recipe's, brought within what the model takes.
 */
export function secondsOf(model: Pick<ModelDef, 'durations'>, recipeSeconds: number | null, reference: Pick<RefCandidate, 'seconds'> | null): number | null {
  if (reference?.seconds) return lengthOfReference(model, reference.seconds);
  return recipeSeconds === null ? null : lengthFor(model, recipeSeconds);
}

/**
 * "Kling 4 · 1080p · 3 s · bara dit · sista bild: platsens egen slutbild · referensfilm: … · mall 10 · prov: 1 tagning": a
 * method's recipe in one line, or why there is none.
 */
export function recipeWords(m: Method | null): string {
  if (!m || m.status === 'saknas' || !m.model) return 'ingen metod än';
  const style = m.style === 'KORT' ? 'kort text' : m.style === 'MINIMAL' ? 'minimal text' : null;
  const turn = m.turn && m.turn !== 'plan' ? FLIP_LABEL[m.turn].toLowerCase() : null;
  const shape = m.shape === 'ONE_WAY' ? 'bara dit' : m.shape === 'ROUND_TRIP' ? 'tur och retur' : null;
  const hand = m.hand === 'LH' ? 'handen vid skon hela vägen' : m.hand === 'RH' ? 'andra handen hela vägen' : null;
  const takes = m.takes ? (m.status === 'prov' ? `prov: ${m.takes} tagning${m.takes === 1 ? '' : 'ar'}` : `${m.takes} tagningar`) : null;
  return [MODELS[m.model]?.label ?? m.model, m.resolution, m.seconds ? `${m.seconds} s` : null, shape, hand, turn, m.lastPicture && m.lastPicture !== 'ankare' ? LAST_PICTURE_LABEL[m.lastPicture] : null, m.reference === 'ingen' ? null : REFERENCE_LABEL[m.reference], style, m.template ? `mall ${m.template}` : null, takes].filter(Boolean).join(' · ');
}
