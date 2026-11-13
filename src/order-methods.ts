// The method of record (data/order-methods.json): per kind of step, and per class of seat where the evidence differs, what a
// film or still is ordered with in Beställ and whether that is settled (gäller), still being tried (prov) or not known
// (saknas). Pure: the register's check against the steps, models and styles that exist (src/order-model.ts), the method
// for a step and a seat, and the words the production list (tools/produce.ts) and Beställ show. No fs, no network.
// Tests: tools/order-methods.test.ts.
import { FLIP_AXES, FLIP_LABEL, MODELS, STEPS, TAKES_MAX, modelFor, stepOf, stylesFor, type FlipAxis, type Shape, type StepKey, type TextStyle } from './order-model.ts';

export const METHOD_STATUSES = ['gäller', 'prov', 'saknas'] as const;
export type MethodStatus = (typeof METHOD_STATUSES)[number];
export const METHOD_STATUS_LABEL: Record<MethodStatus, string> = { gäller: 'gäller', prov: 'prövas', saknas: 'ingen metod än' };
/** The classes of seats whose evidence differs: the middle seats, the far seats, the dealer's own cards. */
export const SEAT_CLASSES = ['mitten', 'ytter', 'dealer'] as const;
export type SeatClass = (typeof SEAT_CLASSES)[number];
export const SEAT_CLASS_LABEL: Record<SeatClass, string> = { mitten: 'mittplatserna P3–P5', ytter: 'ytterplatserna P1, P2, P6, P7', dealer: 'dealerns kort' };
/** The reference film rule: none, or a take of the bank to the same seat and step that Jakob approved straight (any dealer's). */
export const REFERENCE_RULES = ['ingen', 'samma-plats-rakt-godkänd'] as const;
export type ReferenceRule = (typeof REFERENCE_RULES)[number];
export const REFERENCE_LABEL: Record<ReferenceRule, string> = { ingen: 'ingen referensfilm', 'samma-plats-rakt-godkänd': 'referensfilm: en rakt godkänd giv till samma plats' };

export type Method = {
  id: string;
  step: StepKey;
  /** null: every seat (or a step without a seat). */
  seats: SeatClass | null;
  status: MethodStatus;
  /** The recipe: for gäller what is ordered, for prov the next trial; null where nothing is known (saknas). */
  model: string | null;
  style: TextStyle | null;
  seconds: number | null;
  takes: number | null;
  /** plan: what Placering says per card; a turn of the model; null for a step without a turned card. */
  turn: 'plan' | FlipAxis | null;
  shape: Shape | null;
  reference: ReferenceRule;
  /**
   * Where the reference rule finds no film for the seat: the model ordered instead, without a reference (everything else
   * as the recipe); absent or null: the step waits for such a film.
   */
  noReferenceModel?: string | null;
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

/**
 * The register as read, or null with every fault: each method names a step that exists; a model that can make that step
 * and is still offered, a style of that step, seconds the model takes, 1–4 takes; a seat class only for a step with a seat;
 * gäller and prov carry a whole recipe; no two methods for the same step and class.
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
      const model = MODELS[String(m.model)] ? modelFor(step, String(m.model)) : null;
      if (!model) errors.push(`${at}: modellen ${String(m.model)} finns inte eller kan inte göra ${step.label}.`);
      else {
        if (model.off && whole) errors.push(`${at}: ${model.label} beställs inte längre.`);
        if (m.reference === 'samma-plats-rakt-godkänd' && whole && !model.videos) errors.push(`${at}: ${model.label} tar ingen referensfilm.`);
        if (step.kind === 'FILM' && m.seconds !== null && m.seconds !== undefined && model.durations && !(m.seconds >= model.durations[0] && m.seconds <= model.durations[1])) errors.push(`${at}: ${model.label} tar ${model.durations.join('–')} s.`);
      }
    } else if (whole) errors.push(`${at}: ${m.status} kräver en modell.`);
    if (m.noReferenceModel !== null && m.noReferenceModel !== undefined) {
      const instead = MODELS[String(m.noReferenceModel)] ? modelFor(step, String(m.noReferenceModel)) : null;
      if (!instead || instead.off) errors.push(`${at}: noReferenceModel ${String(m.noReferenceModel)} kan inte göra ${step.label}.`);
      else if (m.reference !== 'samma-plats-rakt-godkänd') errors.push(`${at}: noReferenceModel gäller bara där metoden vill ha en referensfilm.`);
      else if (step.kind === 'FILM' && typeof m.seconds === 'number' && instead.durations && !(m.seconds >= instead.durations[0] && m.seconds <= instead.durations[1])) errors.push(`${at}: ${instead.label} tar ${instead.durations.join('–')} s.`);
    }
    if (m.style !== null && m.style !== undefined && !stylesFor(step.kind, step).includes(m.style)) errors.push(`${at}: stilen ${String(m.style)} finns inte för ${step.label}.`);
    else if ((m.style === null || m.style === undefined) && whole) errors.push(`${at}: ${m.status} kräver en stil.`);
    if (step.kind === 'FILM' && whole && !(typeof m.seconds === 'number' && m.seconds > 0)) errors.push(`${at}: en film kräver sekunder.`);
    if (step.kind === 'STILL' && m.seconds !== null && m.seconds !== undefined) errors.push(`${at}: en bild har inga sekunder.`);
    if (m.takes !== null && m.takes !== undefined && !(Number.isInteger(m.takes) && m.takes >= 1 && m.takes <= TAKES_MAX)) errors.push(`${at}: takes ska vara 1–${TAKES_MAX}.`);
    else if ((m.takes === null || m.takes === undefined) && whole) errors.push(`${at}: ${m.status} kräver antal tagningar.`);
    if (m.turn !== null && m.turn !== undefined && m.turn !== 'plan' && !FLIP_AXES.includes(m.turn as FlipAxis)) errors.push(`${at}: turn ska vara plan, ${FLIP_AXES.join(', ')} eller null.`);
    if (m.turn && !step.card) errors.push(`${at}: ${step.key} vänder inget kort som väljs.`);
    if (m.shape !== null && m.shape !== undefined && m.shape !== 'ROUND_TRIP' && m.shape !== 'ONE_WAY') errors.push(`${at}: shape ska vara ROUND_TRIP, ONE_WAY eller null.`);
    if (m.shape === 'ROUND_TRIP' && !(step.card && step.start !== 'LAND')) errors.push(`${at}: bara en giv går tur och retur.`);
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
 * "Kling 4 · kort text · 7 s · vänd vid platsen · prov: 1 tagning · referensfilm: …": a method's recipe in one line, or
 * why there is none. withoutReference: the recipe as ordered where no reference film exists for the seat.
 */
export function recipeWords(m: Method | null, withoutReference = false): string {
  if (!m || m.status === 'saknas' || !m.model) return 'ingen metod än';
  const style = m.style === 'KORT' ? 'kort text' : m.style === 'MINIMAL' ? 'minimal text' : m.style === 'UTFÖRLIG' ? 'lång text' : null;
  const model = withoutReference && m.noReferenceModel ? m.noReferenceModel : m.model;
  const turn = m.turn && m.turn !== 'plan' ? FLIP_LABEL[m.turn].toLowerCase() : null;
  const reference = m.reference === 'ingen' ? null : withoutReference ? 'utan referensfilm (ingen finns till platsen)' : REFERENCE_LABEL[m.reference];
  return [MODELS[model]?.label ?? model, style, m.seconds ? `${m.seconds} s` : null, turn, m.status === 'prov' ? 'prov: 1 tagning' : m.takes ? `${m.takes} tagningar` : null, reference].filter(Boolean).join(' · ');
}
