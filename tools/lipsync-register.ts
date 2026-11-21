// The lip-sync facts (data/lipsync.json): the ways her mouth is made and how a job gets to each (`ways`: Scoutgaming's
// renderer for the bank's line films, the own runner on his computer, the same runner on his RunPod), what is set and what
// is true or not yet per dealer (`dealers`), what a new film or a new dealer needs (`whenNew`), which pictures the lip-sync
// model has as its reference and which it does not, the lips as measured, the chain from the rest film to the picture in
// the game with each step's format in and out and its scale, the settings and whose they are, where it runs, the proofs,
// the licences and what is open. The text of the same knowledge is docs/TAL.md; the studio's view Lipsync
// (/studio/lipsync/) shows it read-only through the lab server (GET /api/lipsync, tools/lipsync-store.ts). Nothing on a
// page writes it. Every fact says in `where` (in `runs` and `ways`: `source`) where it stands or how it was measured; a
// value only estimated says so in its own words ("cirka", "skattat"), and what is not done or not known says that, never a
// guess. An entry with `dealer` is that dealer's; one without holds for every dealer.
// The repo is public: no secret, no personal detail and no path of this machine in any text.
// This is the strict reader: every problem of the file is named at once, and a file with any problem is not used.
// Pure: no files, no network.
import {StoreError} from './placement-store.ts';
import {ID, privateIn} from './decision-register.ts';

export const LIPSYNC_FILE = 'data/lipsync.json';
const LIMIT = {about: 1000, text: 400, short: 120, list: 50} as const;

export type BaseImage = {dealer: string; bank: string; use: string; film: string; frames: string; size: string; sha256: string; built: string; reference?: string; where: string};
export type NotUsed = {dealer?: string; what: string; note: string; where: string};
/** One measured mouth: the three measures in pixels of the film, or a note when it could not be measured. */
export type LipRow = {what: string; width?: number; upperLip?: number; lowerLip?: number; note?: string};
export type LipsMeasured = {dealer?: string; note: string; where: string; rows: LipRow[]; conclusion: string};
/** One step of the chain. in, out and scale are the speech lane's words ("1764 × 1174", "cirka × 1,3 in (skattat)"); "-" is none. */
export type Step = {n: number; what: string; in: string; out: string; scale: string; by: string; where: string};
export type Setting = {group: string; name: string; value: string; owner: string; locked: boolean; where: string};
export type Runs = {
  today: {where: string; gpu: string; speed: string; realtime: boolean; source: string};
  runpod: {measured: string; pricePerHour: string; notBuilt: string[]; source: string};
  /** The runner built from MuseTalk's open source, where there is one: what it is, what was measured, what is not built. */
  ownRunner?: {what: string; measured: string; notBuilt: string[]; source: string};
};
/** One part the runner is built from, and whether its licence allows commercial use, in the speech lane's words. */
export type Licence = {what: string; licence: string; commercial: string; where: string};
export type ProofFact = {id: string; dealer?: string; date: string; what: string; ownerSaid: string; outcome: string};
export type OpenPoint = {what: string; blocks: string};

/** How far a way has come: works (made and tried), built (built, not tried), notBuilt. */
export const WAY_STATES = ['works', 'built', 'notBuilt'] as const;
export type WayState = typeof WAY_STATES[number];
/** The entry of `runs` that holds a way's measurements. */
export const RUN_KEYS = ['today', 'runpod', 'ownRunner'] as const;
/**
 * One way her mouth is made: where it runs, how a job gets there (send: the steps in order, commands as they are typed),
 * what it gives, what it costs, what preparing a new film costs, and which entry of `runs` holds what was measured.
 */
export type Way = {id: string; name: string; state: WayState; where: string; send: string[]; gives: string; cost: string; prepare: string; runs: typeof RUN_KEYS[number]; note?: string; source: string};
/** The mouth with his yes for a dealer: in words, the recipe as it is given, his word, the day and the proof he answered. */
export type DealerMouth = {value: string; recipe: string; ownerSaid: string; date: string; proof: string; where: string};
/** How the dealer's line films in the game are laid. */
export type DealerLines = {value: string; where: string};
/** A film whose clip the own runner has prepared. */
export type RunnerClip = {film: string; clip: string; prepared: string; where: string};
export const ANSWERS = ['ja', 'nej', 'okänt'] as const;
/** One statement about a dealer and whether it holds: ja, nej, or okänt where no source says. */
export type Check = {what: string; answer: typeof ANSWERS[number]; note: string; where: string};
/** What is set and what is true for one dealer; mouth and lines are null where nothing is made. */
export type DealerFacts = {dealer: string; summary: string; mouth: DealerMouth | null; lines: DealerLines | null; runner: RunnerClip[]; checks: Check[]};
/** What a new film and a new dealer need before she can speak over it. */
export type WhenNew = {film: string[]; dealer: string[]; where: string};

export type Lipsync = {
  schemaVersion: 1; about: string; updated: string;
  ways?: Way[]; dealers?: DealerFacts[]; whenNew?: WhenNew;
  baseImages: BaseImage[]; notUsedAsBase: NotUsed[]; lipsMeasured: LipsMeasured; steps: Step[];
  settings: Setting[]; lockNote: string; runs: Runs; proofs: ProofFact[]; open: OpenPoint[]; licences?: Licence[];
};

/** A facts file that cannot be used: every problem, and the first few in the message. */
export class LipsyncError extends StoreError {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(422, `${LIPSYNC_FILE} går inte att läsa: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (och ${problems.length - 3} till)` : ''}`);
    this.name = 'LipsyncError';
    this.problems = problems;
  }
}

const TOP = ['schemaVersion', 'about', 'updated', 'baseImages', 'notUsedAsBase', 'lipsMeasured', 'steps', 'settings', 'lockNote', 'runs', 'proofs', 'open'];
// A full SHA-256, or its first characters followed by an ellipsis, as the speech lane shortens one ("ece306c06d59…").
const SHA = /^(?:[0-9a-f]{64}|[0-9a-f]{8,63}…)$/;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** The reader of one file: it collects every problem, and each read gives back a checked value. */
function reader(problems: string[]) {
  /** A one-line text: trimmed, single spaces, within its limit, nothing private. Empty only where allowed. */
  const text = (at: string, value: unknown, limit: number = LIMIT.text, empty = false): string => {
    if (typeof value !== 'string' || (!empty && !value.trim())) { problems.push(`${at}: ska vara en text${empty ? ' (tom går bra)' : ''}`); return ''; }
    if (value !== value.replace(/\s+/g, ' ').trim()) problems.push(`${at}: utan radbrytningar, dubbla mellanslag eller mellanslag i början och slutet`);
    if (value.length > limit) problems.push(`${at}: högst ${limit} tecken (har ${value.length})`);
    const secret = privateIn(value);
    if (secret) problems.push(`${at}: ${secret} hör inte hemma i det publika repot`);
    return value;
  };
  /** An object with exactly these keys (the optional ones may be left out); false when it is no object. */
  const shape = (at: string, value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> => {
    if (!object(value)) { problems.push(`${at}: ska vara ett objekt`); return false; }
    const extra = Object.keys(value).filter(k => !required.includes(k) && !optional.includes(k));
    if (extra.length) problems.push(`${at}: okända fält ${extra.join(', ')}`);
    for (const key of required) if (!(key in value)) problems.push(`${at}: ${key} saknas`);
    return true;
  };
  /** A list of at least one and at most LIMIT.list entries, each read by `one`; the entries that are objects come back. */
  const list = <T>(at: string, value: unknown, one: (at: string, entry: unknown) => T | null, least = 1): T[] => {
    if (!Array.isArray(value)) { problems.push(`${at}: ska vara en lista`); return []; }
    if (value.length < least || value.length > LIMIT.list) problems.push(`${at}: ${least} till ${LIMIT.list} poster (har ${value.length})`);
    return value.map((entry, i) => one(`${at}[${i}]`, entry)).filter((entry): entry is T => entry !== null);
  };
  const day = (at: string, value: unknown): string => { if (!isDay(value)) problems.push(`${at}: ett datum som 2026-11-17`); return String(value); };
  const flag = (at: string, value: unknown): boolean => { if (typeof value !== 'boolean') problems.push(`${at}: true eller false`); return value === true; };
  const measure = (at: string, value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000) problems.push(`${at}: ett mått i bildpunkter`);
    return Number(value);
  };
  /** An id as the repo writes them (a dealer, a proof, a way): small letters, digits and hyphens. */
  const id = (at: string, value: unknown, what: string): string => {
    if (typeof value !== 'string' || value.length > 60 || !ID.test(value)) problems.push(`${at}: ${what} (små bokstäver, siffror och bindestreck)`);
    return String(value);
  };
  /** One of the given words. */
  const oneOf = <T extends string>(at: string, value: unknown, words: readonly T[]): T => {
    if (typeof value !== 'string' || !(words as readonly string[]).includes(value)) problems.push(`${at}: ett av ${words.join(', ')}`);
    return value as T;
  };
  /** The optional dealer of an entry, copied only where the file gives it. */
  const dealerOf = (at: string, v: Record<string, unknown>): {dealer?: string} => ('dealer' in v ? {dealer: id(`${at}.dealer`, v.dealer, 'en dealers id')} : {});
  return {text, shape, list, day, flag, measure, id, oneOf, dealerOf};
}

/** The ways, the dealers and what a new film or dealer needs; checked against the runs and the proofs the file holds. */
function readPerDealer(json: Record<string, unknown>, r: ReturnType<typeof reader>, problems: string[], runs: Runs, proofs: ProofFact[]) {
  const {text, shape, list, day, id, oneOf} = r;
  const lines = (at: string, value: unknown, least = 0) => list(at, value, (a, v) => text(a, v), least);

  const ways = 'ways' in json ? list('ways', json.ways, (at, v): Way | null => {
    if (!shape(at, v, ['id', 'name', 'state', 'where', 'send', 'gives', 'cost', 'prepare', 'runs', 'source'], ['note'])) return null;
    const way: Way = {id: id(`${at}.id`, v.id, 'ett id'), name: text(`${at}.name`, v.name, LIMIT.short), state: oneOf(`${at}.state`, v.state, WAY_STATES),
      where: text(`${at}.where`, v.where), send: lines(`${at}.send`, v.send, 1), gives: text(`${at}.gives`, v.gives), cost: text(`${at}.cost`, v.cost),
      prepare: text(`${at}.prepare`, v.prepare), runs: oneOf(`${at}.runs`, v.runs, RUN_KEYS), source: text(`${at}.source`, v.source)};
    // A way's measurements are an entry of runs that the file really has.
    if ((RUN_KEYS as readonly string[]).includes(String(v.runs)) && !runs[way.runs]) problems.push(`${at}.runs: runs.${way.runs} finns inte i filen`);
    if ('note' in v) way.note = text(`${at}.note`, v.note);
    return way;
  }) : null;

  const proofDealer = new Map(proofs.map(p => [p.id, p.dealer]));
  const dealers = 'dealers' in json ? list('dealers', json.dealers, (at, v): DealerFacts | null => {
    if (!shape(at, v, ['dealer', 'summary', 'mouth', 'lines', 'runner', 'checks'])) return null;
    const dealer = id(`${at}.dealer`, v.dealer, 'en dealers id');
    let mouth: DealerMouth | null = null;
    if (v.mouth !== null && shape(`${at}.mouth`, v.mouth, ['value', 'recipe', 'ownerSaid', 'date', 'proof', 'where'])) {
      const m = v.mouth as Record<string, unknown>;
      mouth = {value: text(`${at}.mouth.value`, m.value), recipe: text(`${at}.mouth.recipe`, m.recipe), ownerSaid: text(`${at}.mouth.ownerSaid`, m.ownerSaid, LIMIT.text, true),
        date: day(`${at}.mouth.date`, m.date), proof: id(`${at}.mouth.proof`, m.proof, 'en provmapp under assets/proofs/ (dess id)'), where: text(`${at}.mouth.where`, m.where)};
      // The proof he answered is one of the file's proofs, and not another dealer's.
      if (!proofDealer.has(mouth.proof)) problems.push(`${at}.mouth.proof: ${mouth.proof} står inte bland proofs`);
      else if (proofDealer.get(mouth.proof) && proofDealer.get(mouth.proof) !== dealer) problems.push(`${at}.mouth.proof: ${mouth.proof} är en annan dealers prov`);
    }
    let dealerLines: DealerLines | null = null;
    if (v.lines !== null && shape(`${at}.lines`, v.lines, ['value', 'where'])) {
      const l = v.lines as Record<string, unknown>;
      dealerLines = {value: text(`${at}.lines.value`, l.value), where: text(`${at}.lines.where`, l.where)};
    }
    const runner = list(`${at}.runner`, v.runner, (a, c): RunnerClip | null => shape(a, c, ['film', 'clip', 'prepared', 'where'])
      ? {film: text(`${a}.film`, c.film, LIMIT.short), clip: text(`${a}.clip`, c.clip), prepared: text(`${a}.prepared`, c.prepared), where: text(`${a}.where`, c.where)} : null, 0);
    const checks = list(`${at}.checks`, v.checks, (a, c): Check | null => shape(a, c, ['what', 'answer', 'note', 'where'])
      ? {what: text(`${a}.what`, c.what, LIMIT.short), answer: oneOf(`${a}.answer`, c.answer, ANSWERS), note: text(`${a}.note`, c.note, LIMIT.text, true), where: text(`${a}.where`, c.where)} : null);
    return {dealer, summary: text(`${at}.summary`, v.summary), mouth, lines: dealerLines, runner, checks};
  }) : null;

  let whenNew: WhenNew | null = null;
  if ('whenNew' in json && shape('whenNew', json.whenNew, ['film', 'dealer', 'where'])) {
    const w = json.whenNew as Record<string, unknown>;
    whenNew = {film: lines('whenNew.film', w.film, 1), dealer: lines('whenNew.dealer', w.dealer, 1), where: text('whenNew.where', w.where)};
  }
  for (const [name, values] of [['ways', (ways ?? []).map(w => w.id)], ['dealers', (dealers ?? []).map(d => d.dealer)]] as const) {
    const seen = new Set<string>();
    for (const value of values) { if (seen.has(value)) problems.push(`${name}: ${value} står två gånger`); seen.add(value); }
  }
  return {...(ways ? {ways} : {}), ...(dealers ? {dealers} : {}), ...(whenNew ? {whenNew} : {})};
}

/** The facts as a checked copy (keys in the file's order where they are given), or a LipsyncError that names every problem. */
export function readLipsync(json: unknown): Lipsync {
  const problems: string[] = [];
  if (!object(json)) throw new LipsyncError(['filen ska vara ett objekt']);
  const r = reader(problems), {text, shape, list, day, flag, measure, id, dealerOf} = r;
  shape('filen', json, TOP, ['licences', 'ways', 'dealers', 'whenNew']);
  if (json.schemaVersion !== 1) problems.push('schemaVersion ska vara 1');

  const baseImages = list('baseImages', json.baseImages, (at, v): BaseImage | null => {
    if (!shape(at, v, ['dealer', 'bank', 'use', 'film', 'frames', 'size', 'sha256', 'built', 'where'], ['reference'])) return null;
    const out: BaseImage = {
      dealer: text(`${at}.dealer`, v.dealer, LIMIT.short), bank: text(`${at}.bank`, v.bank, LIMIT.short), use: text(`${at}.use`, v.use),
      film: text(`${at}.film`, v.film, LIMIT.short), frames: text(`${at}.frames`, v.frames, LIMIT.short), size: text(`${at}.size`, v.size, LIMIT.short),
      sha256: String(v.sha256), built: day(`${at}.built`, v.built), where: text(`${at}.where`, v.where),
    };
    if (typeof v.sha256 !== 'string' || !SHA.test(v.sha256)) problems.push(`${at}.sha256: 64 tecken 0–9 och a–f, eller de första följda av …`);
    if ('reference' in v) out.reference = text(`${at}.reference`, v.reference);
    return out;
  });
  const notUsedAsBase = list('notUsedAsBase', json.notUsedAsBase, (at, v): NotUsed | null =>
    shape(at, v, ['what', 'note', 'where'], ['dealer']) ? {...dealerOf(at, v), what: text(`${at}.what`, v.what, LIMIT.short), note: text(`${at}.note`, v.note), where: text(`${at}.where`, v.where)} : null, 0);

  let lipsMeasured: LipsMeasured = {note: '', where: '', rows: [], conclusion: ''};
  if (shape('lipsMeasured', json.lipsMeasured, ['note', 'where', 'rows', 'conclusion'], ['dealer'])) {
    const m = json.lipsMeasured as Record<string, unknown>;
    lipsMeasured = {
      ...dealerOf('lipsMeasured', m),
      note: text('lipsMeasured.note', m.note), where: text('lipsMeasured.where', m.where),
      rows: list('lipsMeasured.rows', m.rows, (at, v): LipRow | null => {
        if (!shape(at, v, ['what'], ['width', 'upperLip', 'lowerLip', 'note'])) return null;
        const row: LipRow = {what: text(`${at}.what`, v.what, LIMIT.short)};
        for (const key of ['width', 'upperLip', 'lowerLip'] as const) if (key in v) row[key] = measure(`${at}.${key}`, v[key]);
        if ('note' in v) row.note = text(`${at}.note`, v.note);
        if (!['width', 'upperLip', 'lowerLip', 'note'].some(key => key in v)) problems.push(`${at}: måtten (width, upperLip, lowerLip) eller en note`);
        return row;
      }),
      conclusion: text('lipsMeasured.conclusion', m.conclusion),
    };
  }

  const steps = list('steps', json.steps, (at, v): Step | null => {
    if (!shape(at, v, ['n', 'what', 'in', 'out', 'scale', 'by', 'where'])) return null;
    if (typeof v.n !== 'number' || !Number.isInteger(v.n)) problems.push(`${at}.n: ett heltal`);
    return {n: Number(v.n), what: text(`${at}.what`, v.what), in: text(`${at}.in`, v.in), out: text(`${at}.out`, v.out),
      scale: text(`${at}.scale`, v.scale, LIMIT.short * 2), by: text(`${at}.by`, v.by, LIMIT.short), where: text(`${at}.where`, v.where)};
  });
  // The chain is read in its order: step n stands as entry n, from 1 without a gap.
  steps.forEach((step, i) => { if (step.n !== i + 1) problems.push(`steps[${i}].n: ska vara ${i + 1} (stegen står i ordning från 1)`); });

  const settings = list('settings', json.settings, (at, v): Setting | null => {
    if (!shape(at, v, ['group', 'name', 'value', 'owner', 'locked', 'where'])) return null;
    return {group: text(`${at}.group`, v.group, 40), name: text(`${at}.name`, v.name, LIMIT.short), value: text(`${at}.value`, v.value),
      owner: text(`${at}.owner`, v.owner, 40), locked: flag(`${at}.locked`, v.locked), where: text(`${at}.where`, v.where)};
  });
  const lockNote = text('lockNote', json.lockNote);

  let runs: Runs = {today: {where: '', gpu: '', speed: '', realtime: false, source: ''}, runpod: {measured: '', pricePerHour: '', notBuilt: [], source: ''}};
  if (shape('runs', json.runs, ['today', 'runpod'], ['ownRunner'])) {
    const r = json.runs as Record<string, unknown>;
    if (shape('runs.today', r.today, ['where', 'gpu', 'speed', 'realtime', 'source'])) {
      const t = r.today as Record<string, unknown>;
      runs.today = {where: text('runs.today.where', t.where), gpu: text('runs.today.gpu', t.gpu, LIMIT.short), speed: text('runs.today.speed', t.speed),
        realtime: flag('runs.today.realtime', t.realtime), source: text('runs.today.source', t.source)};
    }
    if (shape('runs.runpod', r.runpod, ['measured', 'pricePerHour', 'notBuilt', 'source'])) {
      const p = r.runpod as Record<string, unknown>;
      runs.runpod = {measured: text('runs.runpod.measured', p.measured), pricePerHour: text('runs.runpod.pricePerHour', p.pricePerHour),
        notBuilt: list('runs.runpod.notBuilt', p.notBuilt, (at, v) => text(at, v), 0), source: text('runs.runpod.source', p.source)};
    }
    if ('ownRunner' in r && shape('runs.ownRunner', r.ownRunner, ['what', 'measured', 'notBuilt', 'source'])) {
      const o = r.ownRunner as Record<string, unknown>;
      runs.ownRunner = {what: text('runs.ownRunner.what', o.what, LIMIT.about), measured: text('runs.ownRunner.measured', o.measured, LIMIT.about),
        notBuilt: list('runs.ownRunner.notBuilt', o.notBuilt, (at, v) => text(at, v), 0), source: text('runs.ownRunner.source', o.source)};
    }
  }

  const proofs = list('proofs', json.proofs, (at, v): ProofFact | null => {
    if (!shape(at, v, ['id', 'date', 'what', 'ownerSaid', 'outcome'], ['dealer'])) return null;
    return {id: id(`${at}.id`, v.id, 'en provmapp under assets/proofs/ (dess id)'), ...dealerOf(at, v), date: day(`${at}.date`, v.date), what: text(`${at}.what`, v.what),
      ownerSaid: text(`${at}.ownerSaid`, v.ownerSaid, LIMIT.text, true), outcome: text(`${at}.outcome`, v.outcome)};
  }, 0);
  const seen = new Set<string>();
  for (const p of proofs) { if (seen.has(p.id)) problems.push(`proofs: ${p.id} står två gånger`); seen.add(p.id); }
  const open = list('open', json.open, (at, v): OpenPoint | null =>
    shape(at, v, ['what', 'blocks']) ? {what: text(`${at}.what`, v.what), blocks: text(`${at}.blocks`, v.blocks)} : null, 0);

  const licences = 'licences' in json ? list('licences', json.licences, (at, v): Licence | null =>
    shape(at, v, ['what', 'licence', 'commercial', 'where']) ? {what: text(`${at}.what`, v.what), licence: text(`${at}.licence`, v.licence, LIMIT.short),
      commercial: text(`${at}.commercial`, v.commercial), where: text(`${at}.where`, v.where)} : null, 0) : null;

  const perDealer = readPerDealer(json, r, problems, runs, proofs);
  const about = text('about', json.about, LIMIT.about), updated = day('updated', json.updated);
  if (problems.length) throw new LipsyncError(problems);
  return {schemaVersion: 1, about, updated, ...perDealer, baseImages, notUsedAsBase, lipsMeasured, steps, settings, lockNote, runs, proofs, open, ...(licences ? {licences} : {})};
}

/**
 * What the view shows of a proof: its first picture in the order its labels name them (a still says the most at a glance),
 * else its first film in that order. names: the files of the proof's folder.
 */
export function pickStill(names: readonly string[], labels: Record<string, unknown> | null): {name: string; kind: 'video' | 'image'} | null {
  const files = names.filter(name => /^[a-z0-9][a-z0-9._-]*\.(?:mp4|png|jpg)$/.test(name));
  const order = Object.keys(labels ?? {});
  const rank = (name: string) => (order.indexOf(name) + 1) || order.length + 1;
  const sorted = [...files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const first = sorted.find(name => !name.endsWith('.mp4')) ?? sorted[0];
  return first ? {name: first, kind: first.endsWith('.mp4') ? 'video' : 'image'} : null;
}

/** A proof's first film in the order its labels name them (the speech lane's proofs put the one at the game's size first), or null. */
export function pickFilm(names: readonly string[], labels: Record<string, unknown> | null): string | null {
  const films = names.filter(name => /^[a-z0-9][a-z0-9._-]*\.mp4$/.test(name));
  const order = Object.keys(labels ?? {});
  const rank = (name: string) => (order.indexOf(name) + 1) || order.length + 1;
  return [...films].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0] ?? null;
}
