// Jakob's answers from the studio's view Beslut, and the register as the view reads it (GET and PUT /api/decisions in
// tools/preview.ts). A write rewrites only the `answer` block of one entry of data/decisions.json: every other entry, and
// every other key of that one, stays as it was (the register is kept as JSON.stringify writes it with two spaces, which
// tools/decision-register.test.ts checks, so the other lines stay byte for byte). The guards are tools/review-store.ts's:
// the page must send the entry's revision as it read it, writes are queued, the file is replaced atomically and only from a
// register the strict reader accepts. If an agent saves the register while an answer is being written, the answer is
// written again on what lies there now. Every answer is also appended to .runtime/decision-answers.jsonl, outside Git, so
// that an answer an agent's edit lost can be found again.
import {appendFile, mkdir, readFile, readdir, realpath, rename, unlink, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {StoreError} from './placement-store.ts';
import {ID, REGISTER_FILE, applyAnswer, entryRevision, formatRegister, pickShown, readRegister, validateAnswer, type Decision, type Register} from './decision-register.ts';

/** The largest answer the server takes (a note of NOTE_LIMIT characters and some room). */
export const ANSWER_BYTES = 8192;
/** What a card shows: a film or picture of the entry's proof, as an address of the lab server. */
export type Shown = {name: string; path: string; kind: 'video' | 'image'};
/** An entry as the page gets it: with its revision, what to show, and a short line when the proof or its file is missing. */
export type ShownDecision = Decision & {revision: string; shown: Shown | null; missing: string | null};
export type DecisionsAnswer = {schemaVersion: 1; decisions: ShownDecision[]};
export type Saved = {decision: ShownDecision; revision: string};

type Raw = Record<string, unknown> & {decisions: Record<string, unknown>[]};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function decisionStore(root: string, now: () => string = () => new Date().toISOString()) {
  const file = path.join(root, ...REGISTER_FILE.split('/'));
  const proofs = path.join(root, 'assets', 'proofs');
  let queue: Promise<unknown> = Promise.resolve();

  /** The register's text, as parsed, and as checked. No file is an empty register; an unreadable one is refused (422). */
  async function read(): Promise<{text: string | null; raw: Raw | null; register: Register}> {
    let text: string;
    try { text = await readFile(file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {text: null, raw: null, register: {schemaVersion: 1, decisions: []}}; throw error; }
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new StoreError(422, `${REGISTER_FILE} är inte giltig JSON.`); }
    const register = readRegister(raw); // a RegisterError (422) names every problem
    return {text, raw: raw as Raw, register};
  }

  /** The proof's film or picture for a card, only from a folder that really lies under assets/proofs/. */
  async function shownOf(d: Decision): Promise<{shown: Shown | null; missing: string | null}> {
    if (!d.proof) return {shown: null, missing: null};
    const base = await realpath(proofs).catch(() => null), folder = await realpath(path.join(proofs, d.proof)).catch(() => null);
    if (!base || folder !== path.join(base, d.proof)) return {shown: null, missing: `Provet ${d.proof} finns inte på den här datorn.`};
    const names = (await readdir(folder, {withFileTypes: true}).catch(() => [])).filter(entry => entry.isFile()).map(entry => entry.name);
    let labels: Record<string, unknown> | null = null;
    try { const info: unknown = JSON.parse(await readFile(path.join(folder, 'proof.json'), 'utf8')); if (object(info) && object(info.labels)) labels = info.labels; } catch {}
    const pick = pickShown(names, labels, d.file);
    if (!pick) return {shown: null, missing: d.file ? `Filen ${d.file} finns inte i provet.` : 'Provet har ingen film eller bild.'};
    return {shown: {...pick, path: `assets/proofs/${d.proof}/${pick.name}`}, missing: null};
  }

  const shown = async (d: Decision, entry: unknown): Promise<ShownDecision> => ({...d, revision: entryRevision(entry), ...await shownOf(d)});

  /** Every entry for the page (GET /api/decisions), in the register's order. */
  async function answer(): Promise<{schemaVersion: 1; decisions: ShownDecision[]}> {
    const {raw, register} = await read();
    return {schemaVersion: 1, decisions: await Promise.all(register.decisions.map((d, i) => shown(d, raw!.decisions[i])))};
  }

  /** Jakob's answer to one entry (PUT /api/decisions/<id>): {value, note}, value null to take it back. */
  async function save(id: string, value: unknown, expected: string | undefined): Promise<Saved> {
    if (typeof id !== 'string' || id.length > 60 || !ID.test(id)) throw new StoreError(400, 'Ogiltigt id.');
    const task = queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        const before = await read();
        const index = before.register.decisions.findIndex(d => d.id === id);
        if (!before.raw || index < 0) throw new StoreError(404, 'Frågan finns inte längre i registret.');
        if (!expected) throw new StoreError(428, 'Läs frågorna innan du svarar.');
        const entry = before.raw.decisions[index];
        if (entryRevision(entry) !== expected) throw new StoreError(409, 'Frågan har ändrats sedan den lästes. Läs om och svara igen.');
        const change = validateAnswer(value, before.register.decisions[index]);
        const at = now(), next = applyAnswer(entry, change, at);
        // Spreading keeps every key where it was; only the one entry's answer is new.
        const text = formatRegister({...before.raw, decisions: before.raw.decisions.map((d, i) => (i === index ? next : d))});
        const checked = readRegister(JSON.parse(text));
        const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
        await writeFile(temporary, text, {flag: 'wx'});
        if ((await readFile(file, 'utf8').catch(() => null)) !== before.text) {
          await unlink(temporary).catch(() => {});
          if (attempt < 2) continue;
          throw new StoreError(409, 'Registret ändrades medan svaret sparades. Försök igen.');
        }
        await rename(temporary, file);
        await mkdir(path.join(root, '.runtime'), {recursive: true});
        await appendFile(path.join(root, '.runtime', 'decision-answers.jsonl'), JSON.stringify({id, before: entry.answer ?? null, after: next.answer, at}) + '\n').catch(() => {});
        const decision = await shown(checked.decisions[index], next);
        return {decision, revision: decision.revision};
      }
    });
    queue = task.then(() => {}, () => {});
    return task;
  }

  return {read, answer, save};
}
