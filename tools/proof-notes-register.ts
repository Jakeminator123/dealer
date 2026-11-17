// Jakob's own word on the proofs (data/proof-notes.json): on a film or picture of a proof, or on the proof as a whole
// (file null), his choice ("bra" or "inte-bra", or none) and his text, and when. Only the studio's Granska, part Prov, writes
// his word, and only on his click (tools/proof-notes-store.ts through PUT /api/proof-notes on the lab server); no tool
// writes as him. The main agent's answer is a field of its own (answer), written by tools/proof-notes.ts, as is read (the
// main agent has read it). A change of his word takes read away, so that it is read again; the answer stays.
// The register lies in the public repo: it holds proof folder, file name, his choice, his text and times, nothing else, and
// a text with a path of this machine or an e-mail address is refused. Pure: no files; tests in studio/tests/proof-notes.test.ts.
import {createHash} from 'node:crypto';
import {StoreError} from './placement-store.ts';
import {privateIn} from './decision-register.ts';

export const NOTES_FILE = 'data/proof-notes.json';
export const CHOICES = ['bra', 'inte-bra'] as const;
export type Choice = typeof CHOICES[number];
export const TEXT_LIMIT = 1000;
const LIMIT = {about: 400, notes: 5000};

/** The main agent's answer to one note. */
export type NoteAnswer = {text: string; at: string};
export type Note = {id: number; proof: string; file: string | null; choice: Choice | null; text: string; at: string; answer?: NoteAnswer; read?: string};
export type NotesRegister = {schemaVersion: 1; about?: string; notes: Note[]};
/** What he sends from the page: his choice (or none) and his text (or none). Both empty takes his word away. */
export type NoteChange = {choice: Choice | null; text: string};

const KEYS = ['id', 'proof', 'file', 'choice', 'text', 'at', 'answer', 'read'] as const;
export const PROOF_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FILE_NAME = /^[a-z0-9][a-z0-9._-]*\.(?:mp4|png|jpg)$/;
/** The revision a page sends for a proof or file he has said nothing about yet. */
export const NEW_REVISION = '"ny"';

export class NotesError extends StoreError {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(422, `${NOTES_FILE} går inte att läsa: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (och ${problems.length - 3} till)` : ''}`);
    this.name = 'NotesError';
    this.problems = problems;
  }
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInstant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) && !Number.isNaN(Date.parse(v));
const isChoice = (v: unknown): v is Choice => typeof v === 'string' && (CHOICES as readonly string[]).includes(v);

/** A text as it is kept: spaces and tabs single, at most one empty line in a row, trimmed. */
export const cleanText = (text: string): string => text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function readText(where: string, value: unknown, problems: string[]): string {
  if (typeof value !== 'string' || value.length > TEXT_LIMIT) { problems.push(`${where}: en text, högst ${TEXT_LIMIT} tecken`); return ''; }
  const secret = privateIn(value);
  if (secret) problems.push(`${where} har ${secret}`);
  return value;
}

function readNote(where: string, value: unknown, problems: string[]): Note | null {
  if (!object(value)) { problems.push(`${where} ska vara ett objekt`); return null; }
  const extra = Object.keys(value).filter(k => !(KEYS as readonly string[]).includes(k));
  if (extra.length) problems.push(`${where}: okända fält ${extra.join(', ')}`);
  const at = problems.length;
  if (!Number.isSafeInteger(value.id) || (value.id as number) < 1) problems.push(`${where}.id: ett heltal från 1`);
  if (typeof value.proof !== 'string' || !PROOF_ID.test(value.proof)) problems.push(`${where}.proof: en provmapps namn`);
  if (value.file !== null && (typeof value.file !== 'string' || !FILE_NAME.test(value.file))) problems.push(`${where}.file: en fil i provet (mp4, png, jpg) eller null för provet som helhet`);
  if (value.choice !== null && !isChoice(value.choice)) problems.push(`${where}.choice: ${CHOICES.join(', ')} eller null`);
  const text = readText(`${where}.text`, value.text, problems);
  if (value.choice === null && !text.trim()) problems.push(`${where}: varken val eller text`);
  if (!isInstant(value.at)) problems.push(`${where}.at: en tidpunkt (ISO, UTC)`);
  let answer: NoteAnswer | undefined;
  if ('answer' in value) {
    const a = value.answer;
    if (!object(a) || Object.keys(a).some(k => k !== 'text' && k !== 'at')) problems.push(`${where}.answer: {text, at}`);
    else {
      const t = readText(`${where}.answer.text`, a.text, problems);
      if (!t.trim()) problems.push(`${where}.answer.text är tom`);
      if (!isInstant(a.at)) problems.push(`${where}.answer.at: en tidpunkt (ISO, UTC)`);
      answer = {text: t, at: a.at as string};
    }
  }
  if ('read' in value && !isInstant(value.read)) problems.push(`${where}.read: en tidpunkt (ISO, UTC)`);
  if (problems.length > at) return null;
  return {id: value.id as number, proof: value.proof as string, file: value.file as string | null, choice: value.choice as Choice | null, text, at: value.at as string,
    ...(answer ? {answer} : {}), ...('read' in value ? {read: value.read as string} : {})};
}

/** The register as a checked copy, or a NotesError naming every problem. */
export function readNotes(json: unknown): NotesRegister {
  const problems: string[] = [];
  if (!object(json)) throw new NotesError(['filen ska vara ett objekt']);
  const extra = Object.keys(json).filter(k => !['schemaVersion', 'about', 'notes'].includes(k));
  if (extra.length) problems.push(`okända fält ${extra.join(', ')}`);
  if (json.schemaVersion !== 1) problems.push('schemaVersion ska vara 1');
  if ('about' in json && (typeof json.about !== 'string' || !json.about.trim() || json.about.length > LIMIT.about)) problems.push(`about: en text, högst ${LIMIT.about} tecken`);
  const notes: Note[] = [];
  if (!Array.isArray(json.notes)) problems.push('notes ska vara en lista');
  else {
    if (json.notes.length > LIMIT.notes) problems.push(`högst ${LIMIT.notes} poster`);
    json.notes.forEach((entry, i) => { const n = readNote(`notes[${i}]`, entry, problems); if (n) notes.push(n); });
    const ids = new Set<number>(), places = new Set<string>();
    for (const n of notes) {
      if (ids.has(n.id)) problems.push(`id ${n.id} finns två gånger`);
      const place = `${n.proof}/${n.file ?? ''}`;
      if (places.has(place)) problems.push(`${n.proof}${n.file ? ` ${n.file}` : ''} har två poster`);
      ids.add(n.id); places.add(place);
    }
  }
  if (problems.length) throw new NotesError(problems);
  return {schemaVersion: 1, ...(typeof json.about === 'string' ? {about: json.about} : {}), notes};
}

/** An empty register, as the first write makes it. */
export const emptyNotes = (): Record<string, unknown> => ({schemaVersion: 1, about: 'Jakobs egna ord om proven i studions Granska, del Prov: hans val och text per fil eller prov. Bara sidan skriver hans ord; huvudagentens svar skrivs med tools/proof-notes.ts.', notes: []});

/** Where a note is: the proof and the file, or the proof as a whole (file null). */
export function readPlace(value: unknown): {proof: string; file: string | null} {
  if (!object(value)) throw new StoreError(400, 'Ange prov och fil.');
  const {proof, file} = value;
  if (typeof proof !== 'string' || !PROOF_ID.test(proof)) throw new StoreError(400, 'Provet har inget giltigt namn.');
  if (file !== null && file !== undefined && (typeof file !== 'string' || !FILE_NAME.test(file))) throw new StoreError(400, 'Filen har inget giltigt namn.');
  return {proof, file: (file as string | null | undefined) ?? null};
}

/** His word from the page: {proof, file, choice, text}. Both choice and text empty take his word away. */
export function validateChange(value: unknown): NoteChange {
  if (!object(value) || Object.keys(value).some(k => !['proof', 'file', 'choice', 'text'].includes(k))) throw new StoreError(400, 'Ordet ska bara innehålla proof, file, choice och text.');
  if (value.choice !== null && value.choice !== undefined && !isChoice(value.choice)) throw new StoreError(400, 'Valet finns inte.');
  const raw = value.text ?? '';
  if (typeof raw !== 'string' || raw.length > TEXT_LIMIT) throw new StoreError(400, `Texten får vara högst ${TEXT_LIMIT} tecken.`);
  const text = cleanText(raw);
  const secret = privateIn(text);
  if (secret) throw new StoreError(400, `Texten har ${secret}; registret ligger i det publika repot, så skriv den utan.`);
  return {choice: (value.choice as Choice | null | undefined) ?? null, text};
}

/** A note's revision, as the page sends it back (If-Match); NEW_REVISION where there is none. */
export const noteRevision = (entry: unknown): string => (entry == null ? NEW_REVISION : '"' + createHash('sha256').update(JSON.stringify(entry)).digest('hex') + '"');

/** The register's text: JSON.stringify with two spaces, so that a write changes no other line. */
export const formatNotes = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

type Raw = Record<string, unknown> & {notes: Record<string, unknown>[]};

/**
 * His word applied to the raw register: a new note (the next id), a changed one (choice, text and at new, read taken away,
 * the answer kept), or none (both empty: the note is taken out). Every other note stays as it was.
 */
export function applyChange(raw: Raw, place: {proof: string; file: string | null}, change: NoteChange, at: string): {raw: Raw; note: Record<string, unknown> | null} {
  const index = raw.notes.findIndex(n => n.proof === place.proof && (n.file ?? null) === place.file);
  const empty = change.choice === null && !change.text;
  if (empty) return {raw: {...raw, notes: raw.notes.filter((_, i) => i !== index)}, note: null};
  const before = index >= 0 ? raw.notes[index] : null;
  const id = before ? before.id : raw.notes.reduce((max, n) => Math.max(max, Number(n.id) || 0), 0) + 1;
  const note: Record<string, unknown> = {id, proof: place.proof, file: place.file, choice: change.choice, text: change.text, at, ...(before && 'answer' in before ? {answer: before.answer} : {})};
  return {raw: {...raw, notes: index >= 0 ? raw.notes.map((n, i) => (i === index ? note : n)) : [...raw.notes, note]}, note};
}

/** The main agent's answer to note id (read with it), or only read. */
export function applyAgent(raw: Raw, id: number, change: {answer?: string; read: string}): Raw {
  const index = raw.notes.findIndex(n => n.id === id);
  if (index < 0) throw new StoreError(404, `Det finns ingen anteckning ${id}.`);
  let answer: NoteAnswer | undefined;
  if (change.answer !== undefined) {
    const text = cleanText(change.answer);
    if (!text) throw new StoreError(400, 'Svaret är tomt.');
    if (text.length > TEXT_LIMIT) throw new StoreError(400, `Svaret får vara högst ${TEXT_LIMIT} tecken.`);
    const secret = privateIn(text);
    if (secret) throw new StoreError(400, `Svaret har ${secret}; registret ligger i det publika repot.`);
    answer = {text, at: change.read};
  }
  const {read: _read, answer: old, ...rest} = raw.notes[index];
  const note = {...rest, ...(answer ? {answer} : old !== undefined ? {answer: old} : {}), read: change.read};
  return {...raw, notes: raw.notes.map((n, i) => (i === index ? note : n))};
}

/** What he has said that the main agent has not read or answered since, newest first. */
export const unreadNotes = (register: NotesRegister): Note[] => register.notes.filter(n => !n.read).sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);

export const CHOICE_WORD: Record<Choice, string> = {bra: 'Bra', 'inte-bra': 'Inte bra'};

/** One note as the tool lists it: "#3 kort-grepp / a.mp4 · Inte bra · "för mörk" · 2026-11-18 00:31". */
export function noteLine(n: Note): string {
  const when = `${n.at.slice(0, 16).replace('T', ' ')} UTC`;
  return [`#${n.id} ${n.proof}${n.file ? ` / ${n.file}` : ' (hela provet)'}`, n.choice ? CHOICE_WORD[n.choice] : null, n.text ? `"${n.text.replace(/\n/g, ' / ')}"` : null, when].filter(Boolean).join(' · ');
}
