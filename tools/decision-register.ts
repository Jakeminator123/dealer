// The register of what waits for Jakob (data/decisions.json): one entry per question (kind "beslut") or per thing only he
// can do (kind "gora"), shown as one card each in the studio's view Beslut (/studio/beslut/) through the lab server
// (tools/decision-store.ts, GET and PUT /api/decisions). The list's order is the order of urgency: the most urgent first.
// Agents add an entry with answer null, change their own entries and close one by taking it out once his answer is carried
// out (the commit says what he answered). Only the page writes `answer`, and nothing else changes an answer he has given.
// The repo is public: no secret, no personal detail and no path of this machine in any text.
// This is the strict reader: every problem of the file is named at once, and a file with any problem is not used.
// Pure: no files, no network. Tests: tools/decision-register.test.ts.
import {createHash} from 'node:crypto';
import {StoreError} from './placement-store.ts';

export const REGISTER_FILE = 'data/decisions.json';
export const KINDS = ['beslut', 'gora'] as const;
export type Kind = typeof KINDS[number];
export const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const NOTE_LIMIT = 1000;
/** The question is short (Jakob 2026-11-17: he cannot read long texts): at most this many words and characters. */
export const QUESTION_WORDS = 14;
const LIMIT = {id: 60, question: 110, leads: 200, from: 40, cost: 100, chip: 40, page: 300, link: 200, about: 4000, entries: 200} as const;
/** Chips per entry: a choice has two to four, a task one to four ("Klart", or what came of it). */
export const CHIPS: Record<Kind, [number, number]> = {beslut: [2, 4], gora: [1, 4]};

export type Chip = {value: string; label: string};
export type Answer = {value: string; note: string; at: string};
export type Decision = {
  id: string; kind: Kind; question: string; leads: string;
  proof?: string; file?: string; page?: string; link?: string;
  chips: Chip[]; asked: string; from: string; cost?: string; answer: Answer | null;
};
export type Register = {schemaVersion: 1; about?: string; decisions: Decision[]};
export type AnswerChange = {value: string | null; note: string};

/** A register that cannot be used: every problem, and the first few in the message. */
export class RegisterError extends StoreError {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(422, `${REGISTER_FILE} går inte att läsa: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (och ${problems.length - 3} till)` : ''}`);
    this.name = 'RegisterError';
    this.problems = problems;
  }
}

const KEYS = ['id', 'kind', 'question', 'leads', 'proof', 'file', 'page', 'link', 'chips', 'asked', 'from', 'cost', 'answer'] as const;
const REQUIRED = ['id', 'kind', 'question', 'leads', 'chips', 'asked', 'from', 'answer'];
// A path of this machine or an e-mail address: neither belongs in the public repo.
const MACHINE_PATH = /(?:\b[A-Za-z]:[\\/]|\\\\[A-Za-z0-9]|(?<![\w.])\/(?:Users|home|mnt|tmp|var|private)\/)/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
// A page of the lab, named from the server's root without a leading slash: "game.html?table=casino", "studio/prov/?prov=x".
const PAGE = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\/?(?:\?[A-Za-z0-9._~=&%+,:-]*)?$/;
// An address outside, shown as text to open on the phone: "dealer-lake.vercel.app/trailer", https:// optional.
const LINK = /^(?:https:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[A-Za-z0-9._~/?=&%+,:-]*)?$/;
const FILE = /^[a-z0-9][a-z0-9._-]*\.(?:mp4|png|jpg)$/;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const isInstant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) && !Number.isNaN(Date.parse(v));

/** What in a text the public repo may not hold, or null. */
export function privateIn(text: string): string | null {
  if (MACHINE_PATH.test(text)) return 'en sökväg på datorn';
  if (EMAIL.test(text)) return 'en e-postadress';
  return null;
}

/** A one-line text of an agent: trimmed, single spaces, within its limit, nothing private. */
function line(at: string, value: unknown, limit: number, problems: string[]): string {
  if (typeof value !== 'string' || !value.trim()) { problems.push(`${at}: ska vara en text`); return ''; }
  if (value !== value.replace(/\s+/g, ' ').trim()) problems.push(`${at}: utan radbrytningar, dubbla mellanslag eller mellanslag i början och slutet`);
  if (value.length > limit) problems.push(`${at}: högst ${limit} tecken (har ${value.length})`);
  const secret = privateIn(value);
  if (secret) problems.push(`${at}: ${secret} hör inte hemma i det publika repot`);
  return value;
}

function readAnswer(at: string, value: unknown, chips: Chip[], problems: string[]): Answer | null {
  if (value === null) return null;
  if (!object(value)) { problems.push(`${at}: ska vara null eller {value, note, at}`); return null; }
  const extra = Object.keys(value).filter(k => !['value', 'note', 'at'].includes(k));
  if (extra.length) problems.push(`${at}: okända fält ${extra.join(', ')}`);
  if (typeof value.value !== 'string' || !chips.some(c => c.value === value.value)) problems.push(`${at}.value: ska vara ett av valen (${chips.map(c => c.value).join(', ')})`);
  const note = value.note;
  if (typeof note !== 'string') problems.push(`${at}.note: ska vara en text (tom går bra)`);
  else {
    if (note.length > NOTE_LIMIT) problems.push(`${at}.note: högst ${NOTE_LIMIT} tecken`);
    const secret = privateIn(note);
    if (secret) problems.push(`${at}.note: ${secret} hör inte hemma i det publika repot`);
  }
  if (!isInstant(value.at)) problems.push(`${at}.at: ska vara en tidpunkt som 2026-11-17T14:05:00.000Z`);
  return {value: String(value.value), note: typeof note === 'string' ? note : '', at: String(value.at)};
}

function readEntry(at: string, value: unknown, problems: string[]): Decision | null {
  if (!object(value)) { problems.push(`${at}: ska vara ett objekt`); return null; }
  const where = typeof value.id === 'string' && value.id ? `${at} (${value.id})` : at;
  const extra = Object.keys(value).filter(k => !(KEYS as readonly string[]).includes(k));
  if (extra.length) problems.push(`${where}: okända fält ${extra.join(', ')}`);
  for (const key of REQUIRED) if (!(key in value)) problems.push(`${where}: ${key} saknas`);
  const id = value.id;
  if (typeof id !== 'string' || id.length > LIMIT.id || !ID.test(id)) problems.push(`${where}.id: små bokstäver, siffror och bindestreck, högst ${LIMIT.id} tecken`);
  const kind = value.kind as Kind;
  if (!KINDS.includes(kind)) problems.push(`${where}.kind: beslut eller gora`);
  const question = line(`${where}.question`, value.question, LIMIT.question, problems);
  if (question && wordCount(question) > QUESTION_WORDS) problems.push(`${where}.question: högst ${QUESTION_WORDS} ord (har ${wordCount(question)})`);
  const leads = line(`${where}.leads`, value.leads, LIMIT.leads, problems);
  if (/[.!?]\s+\p{Lu}/u.test(leads)) problems.push(`${where}.leads: en enda mening`);
  const out: Decision = {id: String(id), kind, question, leads, chips: [], asked: String(value.asked), from: '', answer: null};
  if ('proof' in value) {
    if (typeof value.proof !== 'string' || value.proof.length > LIMIT.id || !ID.test(value.proof)) problems.push(`${where}.proof: en provmapp under assets/proofs/ (dess id)`);
    else out.proof = value.proof;
  }
  if ('file' in value) {
    if (!('proof' in value)) problems.push(`${where}.file: kräver proof`);
    if (typeof value.file !== 'string' || !FILE.test(value.file)) problems.push(`${where}.file: ett filnamn i provmappen (mp4, png eller jpg)`);
    else out.file = value.file;
  }
  if ('page' in value) {
    const page = value.page;
    if (typeof page !== 'string' || page.length > LIMIT.page || !PAGE.test(page) || page.split(/[/?]/).some(part => part === '..' || part === '.')) problems.push(`${where}.page: en sida i labbet utan inledande snedstreck, som game.html?table=casino`);
    else out.page = page;
  }
  if ('link' in value) {
    const link = value.link;
    if (typeof link !== 'string' || link.length > LIMIT.link || !LINK.test(link) || privateIn(link)) problems.push(`${where}.link: en adress utanför labbet, som dealer-lake.vercel.app/trailer`);
    else out.link = link;
  }
  const chips = value.chips;
  if (!Array.isArray(chips)) problems.push(`${where}.chips: ska vara en lista`);
  else {
    const [least, most] = CHIPS[kind] ?? [1, 4];
    if (chips.length < least || chips.length > most) problems.push(`${where}.chips: ${least === most ? least : `${least} till ${most}`} val för ${kind ?? 'posten'} (har ${chips.length})`);
    chips.forEach((chip, i) => {
      const c = `${where}.chips[${i}]`;
      if (!object(chip) || Object.keys(chip).some(k => k !== 'value' && k !== 'label')) { problems.push(`${c}: ska vara {value, label}`); return; }
      if (typeof chip.value !== 'string' || chip.value.length > LIMIT.chip || !ID.test(chip.value)) problems.push(`${c}.value: små bokstäver, siffror och bindestreck`);
      const label = line(`${c}.label`, chip.label, LIMIT.chip, problems);
      out.chips.push({value: String(chip.value), label});
    });
    const values = out.chips.map(c => c.value), labels = out.chips.map(c => c.label.toLowerCase());
    if (new Set(values).size !== values.length) problems.push(`${where}.chips: två val har samma value`);
    if (new Set(labels).size !== labels.length) problems.push(`${where}.chips: två val har samma text`);
  }
  if (!isDay(value.asked)) problems.push(`${where}.asked: ett datum som 2026-11-17`);
  out.from = line(`${where}.from`, value.from, LIMIT.from, problems);
  if ('cost' in value) out.cost = line(`${where}.cost`, value.cost, LIMIT.cost, problems);
  if ('answer' in value) out.answer = readAnswer(`${where}.answer`, value.answer, out.chips, problems);
  return out;
}

/** The register as a checked copy (keys in the register's order), or a RegisterError that names every problem. */
export function readRegister(json: unknown): Register {
  const problems: string[] = [];
  if (!object(json)) throw new RegisterError(['filen ska vara ett objekt']);
  const extra = Object.keys(json).filter(k => !['schemaVersion', 'about', 'decisions'].includes(k));
  if (extra.length) problems.push(`okända fält ${extra.join(', ')}`);
  if (json.schemaVersion !== 1) problems.push('schemaVersion ska vara 1');
  if ('about' in json && (typeof json.about !== 'string' || !json.about.trim() || json.about.length > LIMIT.about)) problems.push(`about: en text, högst ${LIMIT.about} tecken`);
  const list = json.decisions;
  const decisions: Decision[] = [];
  if (!Array.isArray(list)) problems.push('decisions ska vara en lista');
  else {
    if (list.length > LIMIT.entries) problems.push(`högst ${LIMIT.entries} poster`);
    list.forEach((entry, i) => { const d = readEntry(`decisions[${i}]`, entry, problems); if (d) decisions.push(d); });
    const seen = new Set<string>();
    for (const d of decisions) { if (seen.has(d.id)) problems.push(`id ${d.id} finns två gånger`); seen.add(d.id); }
  }
  if (problems.length) throw new RegisterError(problems);
  return {schemaVersion: 1, ...(typeof json.about === 'string' ? {about: json.about} : {}), decisions};
}

/** Jakob's answer from the page: {value, note}, value one of the entry's chips or null (the answer taken back). */
export function validateAnswer(value: unknown, decision: Pick<Decision, 'chips'>): AnswerChange {
  if (!object(value) || Object.keys(value).some(k => k !== 'value' && k !== 'note') || !('value' in value)) throw new StoreError(400, 'Svaret ska bara innehålla value och note.');
  if (value.value !== null && (typeof value.value !== 'string' || !decision.chips.some(c => c.value === value.value))) throw new StoreError(400, 'Svaret finns inte bland valen.');
  const raw = value.note ?? '';
  if (typeof raw !== 'string' || raw.length > NOTE_LIMIT) throw new StoreError(400, `Anteckningen får vara högst ${NOTE_LIMIT} tecken.`);
  const note = value.value === null ? '' : raw.replace(/\s+/g, ' ').trim();
  const secret = privateIn(note);
  if (secret) throw new StoreError(400, `Anteckningen har ${secret}; registret ligger i det publika repot, så skriv den utan.`);
  return {value: value.value as string | null, note};
}

/** The entry with its new answer: every other key, in its place, as it was. */
export function applyAnswer<T extends Record<string, unknown>>(entry: T, change: AnswerChange, at: string): T & {answer: Answer | null} {
  return {...entry, answer: change.value === null ? null : {value: change.value, note: change.note, at}};
}

/** An entry's revision, as the page sends it back (If-Match): its text as the register holds it, hashed. */
export const entryRevision = (entry: unknown): string => '"' + createHash('sha256').update(JSON.stringify(entry)).digest('hex') + '"';

/** The register's text: as JSON.stringify writes it with two spaces, so that a write changes no other line. */
export const formatRegister = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

/**
 * What a card shows of a proof: the file asked for (null when it is not there), or else the proof's first film in the
 * order its labels name them, else its first picture. names: the files of the proof's folder.
 */
export function pickShown(names: readonly string[], labels: Record<string, unknown> | null, wanted?: string): {name: string; kind: 'video' | 'image'} | null {
  const kindOf = (name: string) => (name.endsWith('.mp4') ? 'video' as const : 'image' as const);
  const files = names.filter(name => FILE.test(name));
  if (wanted) return files.includes(wanted) ? {name: wanted, kind: kindOf(wanted)} : null;
  const order = Object.keys(labels ?? {});
  const rank = (name: string) => (order.indexOf(name) + 1) || order.length + 1;
  const sorted = [...files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const first = sorted.find(name => kindOf(name) === 'video') ?? sorted[0];
  return first ? {name: first, kind: kindOf(first)} : null;
}
