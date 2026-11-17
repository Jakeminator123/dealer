// The lip-sync facts (data/lipsync.json): which pictures the lip-sync model (MuseTalk, inside Scoutgaming's renderer) has
// as its reference and which it does not, the lips as measured, the chain from the rest film to the picture in the game with
// each step's format in and out and its scale, the settings and whose they are, where it runs, the evening's proofs and what
// is open. The speech lane writes and keeps it (docs/TAL.md); the studio's view Lipsync (/studio/lipsync/) shows it
// read-only through the lab server (GET /api/lipsync, tools/lipsync-store.ts). Nothing on a page writes it.
// Every fact says in `where` (in `runs`: `source`) where it stands or how it was measured; a value the speech lane only
// estimated says so in its own words ("cirka", "skattat"), and the view shows it as estimated.
// The repo is public: no secret, no personal detail and no path of this machine in any text.
// This is the strict reader: every problem of the file is named at once, and a file with any problem is not used.
// Pure: no files, no network. Tests: tools/lipsync-register.test.ts.
import {StoreError} from './placement-store.ts';
import {ID, privateIn} from './decision-register.ts';

export const LIPSYNC_FILE = 'data/lipsync.json';
const LIMIT = {about: 1000, text: 400, short: 120, list: 50} as const;

export type BaseImage = {dealer: string; bank: string; use: string; film: string; frames: string; size: string; sha256: string; built: string; reference?: string; where: string};
export type NotUsed = {what: string; note: string; where: string};
/** One measured mouth: the three measures in pixels of the film, or a note when it could not be measured. */
export type LipRow = {what: string; width?: number; upperLip?: number; lowerLip?: number; note?: string};
export type LipsMeasured = {note: string; where: string; rows: LipRow[]; conclusion: string};
/** One step of the chain. in, out and scale are the speech lane's words ("1764 × 1174", "cirka × 1,3 in (skattat)"); "-" is none. */
export type Step = {n: number; what: string; in: string; out: string; scale: string; by: string; where: string};
export type Setting = {group: string; name: string; value: string; owner: string; locked: boolean; where: string};
export type Runs = {
  today: {where: string; gpu: string; speed: string; realtime: boolean; source: string};
  runpod: {measured: string; pricePerHour: string; notBuilt: string[]; source: string};
};
export type ProofFact = {id: string; date: string; what: string; ownerSaid: string; outcome: string};
export type OpenPoint = {what: string; blocks: string};
export type Lipsync = {
  schemaVersion: 1; about: string; updated: string;
  baseImages: BaseImage[]; notUsedAsBase: NotUsed[]; lipsMeasured: LipsMeasured; steps: Step[];
  settings: Setting[]; lockNote: string; runs: Runs; proofs: ProofFact[]; open: OpenPoint[];
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
  return {text, shape, list, day, flag, measure};
}

/** The facts as a checked copy (keys in the file's order where they are given), or a LipsyncError that names every problem. */
export function readLipsync(json: unknown): Lipsync {
  const problems: string[] = [];
  if (!object(json)) throw new LipsyncError(['filen ska vara ett objekt']);
  const {text, shape, list, day, flag, measure} = reader(problems);
  shape('filen', json, TOP);
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
    shape(at, v, ['what', 'note', 'where']) ? {what: text(`${at}.what`, v.what, LIMIT.short), note: text(`${at}.note`, v.note), where: text(`${at}.where`, v.where)} : null, 0);

  let lipsMeasured: LipsMeasured = {note: '', where: '', rows: [], conclusion: ''};
  if (shape('lipsMeasured', json.lipsMeasured, ['note', 'where', 'rows', 'conclusion'])) {
    const m = json.lipsMeasured as Record<string, unknown>;
    lipsMeasured = {
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
  if (shape('runs', json.runs, ['today', 'runpod'])) {
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
  }

  const proofs = list('proofs', json.proofs, (at, v): ProofFact | null => {
    if (!shape(at, v, ['id', 'date', 'what', 'ownerSaid', 'outcome'])) return null;
    if (typeof v.id !== 'string' || v.id.length > 60 || !ID.test(v.id)) problems.push(`${at}.id: en provmapp under assets/proofs/ (dess id)`);
    return {id: String(v.id), date: day(`${at}.date`, v.date), what: text(`${at}.what`, v.what), ownerSaid: text(`${at}.ownerSaid`, v.ownerSaid, LIMIT.text, true), outcome: text(`${at}.outcome`, v.outcome)};
  }, 0);
  const seen = new Set<string>();
  for (const p of proofs) { if (seen.has(p.id)) problems.push(`proofs: ${p.id} står två gånger`); seen.add(p.id); }
  const open = list('open', json.open, (at, v): OpenPoint | null =>
    shape(at, v, ['what', 'blocks']) ? {what: text(`${at}.what`, v.what), blocks: text(`${at}.blocks`, v.blocks)} : null, 0);

  const about = text('about', json.about, LIMIT.about), updated = day('updated', json.updated);
  if (problems.length) throw new LipsyncError(problems);
  return {schemaVersion: 1, about, updated, baseImages, notUsedAsBase, lipsMeasured, steps, settings, lockNote, runs, proofs, open};
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
