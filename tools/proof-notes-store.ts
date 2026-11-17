// Jakob's word on the proofs as the lab server reads and writes it (GET and PUT /api/proof-notes in tools/preview.ts), and
// the main agent's answer and read mark (tools/proof-notes.ts). The register and its rules: tools/proof-notes-register.ts.
// The guards are tools/decision-store.ts's: the page sends the note's revision as it read it (NEW_REVISION for a proof or file
// he has said nothing about), writes are queued, the file is replaced atomically and only from a register the strict reader
// accepts, and a register changed by another writer meanwhile is read again. Every word of his is also appended to
// .runtime/proof-notes.jsonl, outside Git, so that a word an agent's edit lost can be found again.
import {appendFile, mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {StoreError} from './placement-store.ts';
import {NOTES_FILE, applyAgent, applyChange, emptyNotes, formatNotes, noteRevision, readNotes, readPlace, validateChange, NEW_REVISION, type Note, type NotesRegister} from './proof-notes-register.ts';

/** The largest word the server takes (a text of TEXT_LIMIT characters and some room). */
export const NOTE_BYTES = 8192;
export type ShownNote = Note & {revision: string};
export type NotesAnswer = {schemaVersion: 1; newRevision: string; notes: ShownNote[]};
export type SavedNote = {proof: string; file: string | null; note: ShownNote | null};

type Raw = Record<string, unknown> & {notes: Record<string, unknown>[]};
const wait = (ms: number) => new Promise(done => setTimeout(done, ms));

export function proofNotesStore(root: string, now: () => string = () => new Date().toISOString()) {
  const file = path.join(root, ...NOTES_FILE.split('/'));
  let queue: Promise<unknown> = Promise.resolve();

  /** The register's text, as parsed, and as checked. No file is an empty register; an unreadable one is refused (422). */
  async function read(): Promise<{text: string | null; raw: Raw; register: NotesRegister}> {
    let text: string;
    try { text = await readFile(file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {text: null, raw: emptyNotes() as Raw, register: {schemaVersion: 1, notes: []}}; throw error; }
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new StoreError(422, `${NOTES_FILE} är inte giltig JSON.`); }
    return {text, raw: raw as Raw, register: readNotes(raw)};
  }

  /** Every note for the page (GET /api/proof-notes), in the register's order, each with its revision. */
  async function answer(): Promise<NotesAnswer> {
    const {raw, register} = await read();
    return {schemaVersion: 1, newRevision: NEW_REVISION, notes: register.notes.map((n, i) => ({...n, revision: noteRevision(raw.notes[i])}))};
  }

  /** Writes the register made from what lies there now, again when another writer changed it in between (twice). */
  function write(change: (before: {raw: Raw; register: NotesRegister}) => Raw): Promise<NotesRegister> {
    const task = queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        const before = await read();
        const text = formatNotes(change(before));
        const checked = readNotes(JSON.parse(text));
        await mkdir(path.dirname(file), {recursive: true});
        const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
        await writeFile(temporary, text, {flag: 'wx'});
        if ((await readFile(file, 'utf8').catch(() => null)) !== before.text) {
          await unlink(temporary).catch(() => {});
          if (attempt < 2) continue;
          throw new StoreError(409, 'Registret ändrades medan ordet sparades. Försök igen.');
        }
        // A reader on Windows can hold the file a moment: the rename is tried again before it gives up.
        for (let tries = 0; ; tries++) {
          try { await rename(temporary, file); break; }
          catch (error) { if (tries >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) { await unlink(temporary).catch(() => {}); throw error; } await wait(50 * (tries + 1)); }
        }
        return checked;
      }
    });
    queue = task.then(() => {}, () => {});
    return task;
  }

  /** Jakob's word from the page (PUT /api/proof-notes): {proof, file, choice, text}, against the note's revision. */
  async function save(body: unknown, expected: string | undefined): Promise<SavedNote> {
    const place = readPlace(body), change = validateChange(body);
    if (!expected) throw new StoreError(428, 'Läs orden innan du skriver.');
    const at = now();
    let written: Record<string, unknown> | null = null;
    const register = await write(({raw}) => {
      const before = raw.notes.find(n => n.proof === place.proof && (n.file ?? null) === place.file) ?? null;
      if (noteRevision(before) !== expected) throw new StoreError(409, 'Ordet har ändrats sedan det lästes. Läs om och skriv igen.');
      const next = applyChange(raw, place, change, at);
      written = next.note;
      return next.raw;
    });
    await mkdir(path.join(root, '.runtime'), {recursive: true});
    await appendFile(path.join(root, '.runtime', 'proof-notes.jsonl'), JSON.stringify({...place, ...change, at}) + '\n').catch(() => {});
    const note = written ? register.notes.find(n => n.id === (written as {id: number}).id) ?? null : null;
    return {...place, note: note ? {...note, revision: noteRevision(written)} : null};
  }

  /** The main agent's answer to note id, which also marks it read (tools/proof-notes.ts --answer). */
  const answerNote = (id: number, text: string) => write(({raw}) => applyAgent(raw, id, {answer: text, read: now()}));
  /** The main agent has read note id (tools/proof-notes.ts --read). */
  const markRead = (id: number) => write(({raw}) => applyAgent(raw, id, {read: now()}));

  return {read, answer, save, answerNote, markRead};
}
