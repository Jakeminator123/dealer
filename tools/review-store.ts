// Review decisions from the lab. Rewrites only the `review` block of motions/<id>.json: the rest of the
// record, its key order included, stays byte for byte as it was. Same guards as the placement store:
// the caller must hold the revision it read, writes are queued and the file is replaced atomically.
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {StoreError} from './placement-store.ts';

export const DECISIONS = ['MAIN', 'ACCEPTED', 'VARIANT', 'SECONDARY', 'REJECTED', 'PENDING'] as const;
export type Decision = typeof DECISIONS[number];
export type ReviewChange = {decision: Decision; note: string};
export const NOTE_LIMIT = 1500;
const SAID: Record<Decision, string> = {MAIN: 'vald som primär tagning i labbet.', ACCEPTED: 'godkänd i labbet.', VARIANT: 'godkänd som variant i labbet.', SECONDARY: 'sekundärt alternativ, satt i labbet.', REJECTED: 'underkänd i labbet.', PENDING: 'återställd till ogranskad i labbet.'};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function validateChange(value: unknown): ReviewChange {
  if (!object(value) || Object.keys(value).some(key => key !== 'decision' && key !== 'note')) throw new StoreError(400, 'Beslutet ska bara innehålla decision och note.');
  if (!DECISIONS.includes(value.decision as Decision)) throw new StoreError(400, 'Okänt beslut.');
  const note = value.note ?? '';
  if (typeof note !== 'string' || note.length > NOTE_LIMIT) throw new StoreError(400, `Anteckningen får vara högst ${NOTE_LIMIT} tecken.`);
  return {decision: value.decision as Decision, note: note.replace(/\s+/g, ' ').trim()};
}

/** The review block after a decision. Only decision, acceptedAs, userReview and userAccepted are touched. */
export function applyChange(review: unknown, change: ReviewChange, date: string, reviewer = 'Jakob'): Record<string, unknown> {
  const next: Record<string, unknown> = {...(object(review) ? review : {})};
  const accepted = change.decision === 'ACCEPTED' || change.decision === 'VARIANT' || change.decision === 'MAIN';
  next.decision = accepted ? 'ACCEPTED' : change.decision;
  // "VARIANT" is an accepted take used now and then; "MAIN" (Primär in the lab) is the take played first on its edge.
  // Only those two choices set the marker: a plain approval, like every other decision, takes it away.
  if (change.decision === 'VARIANT' || change.decision === 'MAIN') next.acceptedAs = change.decision; else delete next.acceptedAs;
  // A reset takes away what marks the film as decided: his word. It then waits for his decision again.
  if (change.decision === 'PENDING') delete next.userReview; else next.userReview = `${reviewer} ${date}: ${change.note || SAID[change.decision]}`;
  next.userAccepted = accepted;
  return next;
}

export function reviewStore(root: string, today: () => string = () => new Date().toISOString().slice(0, 10)) {
  let queue: Promise<unknown> = Promise.resolve();
  const fileOf = (id: string) => { if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new StoreError(400, 'Ogiltigt klipp-id.'); return path.join(root, 'motions', `${id}.json`); };
  const revisionOf = (text: string) => '"' + createHash('sha256').update(text).digest('hex') + '"';
  async function load(id: string) {
    let text: string;
    try { text = await readFile(fileOf(id), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError(404, 'Klippet har ingen post i motions/ ännu, så beslutet kan inte sparas.'); throw error; }
    const record: unknown = JSON.parse(text);
    if (!object(record)) throw new StoreError(422, 'Posten i motions/ går inte att läsa.');
    return {record, revision: revisionOf(text)};
  }
  async function save(id: string, value: unknown, expected: string | undefined) {
    const change = validateChange(value); fileOf(id);
    const task = queue.then(async () => {
      const before = await load(id);
      if (!expected) throw new StoreError(428, 'Läs klippbanken innan du sparar ett beslut.');
      if (before.revision !== expected) throw new StoreError(409, 'Posten har ändrats sedan den lästes. Läs om klippbanken och försök igen.');
      const review = applyChange(before.record.review, change, today());
      // Spreading keeps every key where it was; only the value of `review` is new.
      const text = JSON.stringify({...before.record, review}, null, 2) + '\n';
      await mkdir(path.join(root, '.runtime'), {recursive: true});
      await writeFile(path.join(root, '.runtime/review-previous.json'), JSON.stringify({id, review: before.record.review ?? null}, null, 2) + '\n');
      const temporary = path.join(root, 'motions', `.${randomUUID()}.tmp`);
      await writeFile(temporary, text, {flag: 'wx'}); await rename(temporary, fileOf(id));
      return {id, review, revision: revisionOf(text)};
    });
    queue = task.then(() => {}, () => {});
    return task;
  }
  return {load, save, revisionOf};
}
