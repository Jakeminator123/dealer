// The registers that were one JSON file per post (motions/<id>.json until 2026-11-23): one text file in Git and one
// SQLite database beside it (Jakob 2026-11-23: the posts into a database, the JSON files gone to spare the indexing, and
// self-cleaning, so that a film that is removed takes the posts of its takes with it).
//
//   data/motions.jsonl                  one post per line, sorted on id, keys in the order they were written: the truth
//                                       between machines and commits. A commit shows the one line of the film that changed.
//   data/motions-removed.jsonl          one line about Jakob's verdict for each removed post that carried one
//   .runtime/register/register.sqlite   this checkout's working copy (outside Git): keys, and the cascade film → takes
//
// Every write goes through here. Under SQLite's write lock the rows change, the text file is written anew (a temporary
// file renamed over it) and the database takes the text's hash. On every open the text's hash is compared with the one the
// database carries; when they differ (a pull, a merge, a new checkout, a hand edit, a crash between the two steps) the
// table is made again from the text. The database is never the only place a post stands, and may be deleted at any time.
//
// A post comes out as it went in: JSON.parse of its line, so keys and values are those of the old file. Its revision is
// the SHA-256 of the post written the way the old file was (two spaces, a newline at the end): the same value the lab
// held for motions/<id>.json, and the one a verdict is saved against (tools/review-store.ts).
//
// Each call opens the database, works and closes it: no handle is left behind. A reader that wants many posts takes them
// in one call (list); a writer of many posts writes them in one (putAll).
//
// One more register (data/orders/ is next) is one more Kind below and one more function like motionRegister.
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {StoreError} from './placement-store.ts';

export type Post = Record<string, unknown>;
export type Entry = {id: string; post: Post; revision: string};
/** What is kept of a removed post that carried Jakob's verdict: one short row, never cascaded. */
export type RemovedVerdict = {id: string; film: string; dealer: string | null; step: string | null; model: string | null; order: string | null;
  decision: string; acceptedAs?: string; by: string; at: string | null; note: string; removedAt: string; why: string};
export type Removal = {removed: string[]; films: string[]; verdicts: RemovedVerdict[]; jobs: number};

export const MOTIONS_TEXT = 'data/motions.jsonl', REMOVED_TEXT = 'data/motions-removed.jsonl', REGISTER_DB = '.runtime/register/register.sqlite';
const JOBS = 'data/clip-jobs.json';
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const object = (v: unknown): v is Post => !!v && typeof v === 'object' && !Array.isArray(v);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const pause = (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** The revision of a post: the hash of the post as its file was written (and what the lab holds when it saves a verdict). */
export const revisionOf = (post: Post) => '"' + sha(JSON.stringify(post, null, 2) + '\n') + '"';

/** The film a post belongs to: the folder of its source film; a film's own post names itself. */
export function filmOf(post: Post): string {
  const source = object(post.source) && typeof post.source.path === 'string' ? /^assets\/motions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[^/]+$/.exec(post.source.path)?.[1] : null;
  if (source) return source;
  const segment = object(post.motion) && object(post.motion.segment) ? post.motion.segment.clip : null;
  return typeof segment === 'string' && ID.test(segment) ? segment : String(post.id);
}

/** The film files the posts name (source.path under assets/). None: the posts say nothing about a film on the disk. */
export function filmFiles(posts: Post[]): string[] {
  const fileOf = (post: Post) => object(post.source) && typeof post.source.path === 'string' && /^assets\/[^:]*$/.test(post.source.path) && !post.source.path.includes('..') ? post.source.path : null;
  return [...new Set(posts.map(fileOf).filter((f): f is string => !!f))];
}

/** The posts of a register text, line by line. A line that is not a whole post stops the read: nothing is dropped silently. */
export function parseRegisterText(text: string, file = 'registret'): Post[] {
  const rows: Post[] = [];
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return;
    let row: unknown;
    try { row = JSON.parse(line); } catch { row = null; }
    if (!object(row)) throw new StoreError(422, `${file}, rad ${index + 1}, är inte en hel post (en sammanslagning som krockade?). Rätta raden; inget har ändrats.`);
    rows.push(row);
  });
  return rows;
}

// ── The registers ───────────────────────────────────────────────────────────
type Kind = {
  name: string;                                  // the key of the text's hash in the database
  file: string;                                  // the text file in Git
  tables: string[];                              // dropped and made again when the layout changes
  schema: string;
  clear: string;
  insert(db: DatabaseSync, row: Post): void;     // one line of the text into its table
  lines: string;                                 // the bodies in the order of the text
};

function checkPost(row: Post, file: string): string {
  if (typeof row.id !== 'string' || !ID.test(row.id)) throw new StoreError(422, `${file}: en post saknar ett giltigt id (${JSON.stringify(row.id ?? null).slice(0, 60)}).`);
  return row.id;
}
const MOTIONS: Kind = {
  name: 'motions', file: MOTIONS_TEXT, tables: ['motions', 'films'],
  // A film is the parent of every post cut from it, its own post included: deleting the film row deletes them all.
  schema: `CREATE TABLE films (id TEXT PRIMARY KEY) STRICT;
    CREATE TABLE motions (id TEXT PRIMARY KEY, film TEXT NOT NULL REFERENCES films (id) ON DELETE CASCADE, revision TEXT NOT NULL, body TEXT NOT NULL) STRICT;
    CREATE INDEX motions_film ON motions (film);`,
  clear: 'DELETE FROM motions; DELETE FROM films;',
  insert(db, row) {
    const id = checkPost(row, MOTIONS_TEXT);
    if (db.prepare('SELECT 1 FROM motions WHERE id = ?').get(id)) throw new StoreError(422, `${MOTIONS_TEXT}: ${id} står på två rader. Rätta filen; inget har ändrats.`);
    storeMotion(db, row);
  },
  lines: 'SELECT body FROM motions ORDER BY id',
};
const REMOVED: Kind = {
  name: 'motions-removed', file: REMOVED_TEXT, tables: ['motions_removed'],
  schema: 'CREATE TABLE motions_removed (id TEXT NOT NULL, removed_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (id, removed_at)) STRICT;',
  clear: 'DELETE FROM motions_removed;',
  insert(db, row) {
    const id = checkPost(row, REMOVED_TEXT);
    if (typeof row.removedAt !== 'string') throw new StoreError(422, `${REMOVED_TEXT}: ${id} saknar removedAt.`);
    db.prepare('INSERT OR REPLACE INTO motions_removed (id, removed_at, body) VALUES (?, ?, ?)').run(id, row.removedAt, JSON.stringify(row));
  },
  lines: 'SELECT body FROM motions_removed ORDER BY id, removed_at',
};
const KINDS = [MOTIONS, REMOVED];
const LAYOUT = 1; // raise when a table changes: the database is then made again from the texts

function storeMotion(db: DatabaseSync, post: Post): Entry {
  const id = String(post.id), film = filmOf(post), revision = revisionOf(post);
  db.prepare('INSERT OR IGNORE INTO films (id) VALUES (?)').run(film);
  db.prepare('INSERT INTO motions (id, film, revision, body) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET film = excluded.film, revision = excluded.revision, body = excluded.body')
    .run(id, film, revision, JSON.stringify(post));
  return {id, post, revision};
}

// ── The database and its text ───────────────────────────────────────────────
function open(root: string): DatabaseSync {
  const file = path.join(root, REGISTER_DB);
  mkdirSync(path.dirname(file), {recursive: true});
  for (let attempt = 0; ; attempt++) {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(file, {timeout: 5000});
      db.exec('PRAGMA foreign_keys = ON');
      const layout = () => (db!.prepare('PRAGMA user_version').get() as {user_version: number}).user_version;
      if (layout() !== LAYOUT) transaction(db, () => {
        if (layout() === LAYOUT) return; // another process made it meanwhile
        for (const table of [...KINDS.flatMap(kind => kind.tables), 'register_text']) db!.exec(`DROP TABLE IF EXISTS ${table}`);
        db!.exec('CREATE TABLE register_text (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL) STRICT;');
        for (const kind of KINDS) db!.exec(kind.schema);
        db!.exec(`PRAGMA user_version = ${LAYOUT}`);
      });
      return db;
    } catch (error) {
      try { db?.close(); } catch { /* never opened */ }
      // A database that cannot be read is only a copy: it is made again from the text (11 corrupt, 26 not a database).
      if (attempt === 0 && [11, 26].includes((error as {errcode?: number}).errcode ?? 0)) { rmSync(file, {force: true}); continue; }
      throw error;
    }
  }
}
function transaction<T>(db: DatabaseSync, work: () => T): T {
  if (db.isTransaction) return work();
  db.exec('BEGIN IMMEDIATE');
  try { const out = work(); db.exec('COMMIT'); return out; }
  catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}
const textOf = (root: string, kind: Kind) => { try { return readFileSync(path.join(root, kind.file), 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; } };
const hashIn = (db: DatabaseSync, kind: Kind) => (db.prepare('SELECT sha256 FROM register_text WHERE name = ?').get(kind.name) as {sha256: string} | undefined)?.sha256;
const keepHash = (db: DatabaseSync, kind: Kind, hash: string) => { db.prepare('INSERT INTO register_text (name, sha256) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET sha256 = excluded.sha256').run(kind.name, hash); };

/** Makes the table again from the text when the text is not the one the database was made from. */
function follow(db: DatabaseSync, root: string, kind: Kind) {
  if (hashIn(db, kind) === sha(textOf(root, kind))) return;
  transaction(db, () => {
    const text = textOf(root, kind), hash = sha(text); // read again under the lock: a writer may just have finished
    if (hashIn(db, kind) === hash) return;
    db.exec(kind.clear);
    for (const row of parseRegisterText(text, kind.file)) kind.insert(db, row);
    keepHash(db, kind, hash);
  });
}
function replaceFile(file: string, text: string) {
  mkdirSync(path.dirname(file), {recursive: true});
  const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  writeFileSync(temporary, text, {flag: 'wx'});
  // A reader on Windows can hold the file a moment: the rename is tried again before it gives up.
  for (let tries = 0; ; tries++) {
    try { renameSync(temporary, file); return; }
    catch (error) {
      if (tries >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) { try { unlinkSync(temporary); } catch { /* gone */ } throw error; }
      pause(50 * (tries + 1));
    }
  }
}
/** The text of a register as the table now has it, written over the file, and its hash kept: the last step before the commit. */
function writeText(db: DatabaseSync, root: string, kind: Kind) {
  const text = (db.prepare(kind.lines).all() as {body: string}[]).map(row => row.body + '\n').join('');
  if (text !== textOf(root, kind)) replaceFile(path.join(root, kind.file), text);
  keepHash(db, kind, sha(text));
}
function read<T>(root: string, kinds: Kind[], work: (db: DatabaseSync) => T): T {
  const db = open(root);
  try { for (const kind of kinds) follow(db, root, kind); return work(db); } finally { db.close(); }
}
/** One change: the tables follow their texts, the work is done, the texts named as changed are written, all under the write lock. */
function write<T>(root: string, kinds: Kind[], work: (db: DatabaseSync, changed: (kind: Kind) => void) => T): T {
  const db = open(root);
  try {
    return transaction(db, () => {
      for (const kind of kinds) follow(db, root, kind);
      const changed = new Set<Kind>(), out = work(db, kind => { changed.add(kind); });
      for (const kind of kinds) if (changed.has(kind)) writeText(db, root, kind); // in the order given: a text written before a failure stays
      return out;
    });
  } finally { db.close(); }
}

// ── Jakob's verdict on a removed post ───────────────────────────────────────
/** One row about his verdict (his words or his acceptance), or null when the post carries none of his. A verdict given for him is not his. */
export function removedVerdict(post: Post, removedAt: string, why: string): RemovedVerdict | null {
  const review = object(post.review) ? post.review : null;
  if (!review) return null;
  const said = typeof review.userReview === 'string' ? review.userReview.trim() : '';
  if (!said && review.userAccepted !== true) return null;
  const words = /^(\S+) (\d{4}-\d{2}-\d{2}): ([\s\S]*)$/.exec(said);
  const motion = object(post.motion) ? post.motion : {}, source = object(post.source) ? post.source : {}, order = object(post.order) ? post.order : {};
  const text = (v: unknown) => typeof v === 'string' && v ? v : null;
  return {id: String(post.id), film: filmOf(post), dealer: text(post.dealer), step: text(motion.kind) ? `${String(motion.kind)} ${String(motion.from ?? '?')}>${String(motion.to ?? '?')}` : null,
    model: text(source.model), order: text(order.id), decision: String(review.decision ?? 'PENDING'), ...(text(review.acceptedAs) ? {acceptedAs: String(review.acceptedAs)} : {}),
    by: words?.[1] ?? 'Jakob', at: words?.[2] ?? null, note: words?.[3] ?? said, removedAt, why};
}

/** Takes the entries of removed posts and films out of data/clip-jobs.json (jobs, derived, edits); returns how many went. */
export function dropJobs(root: string, ids: Iterable<string>, films: Iterable<string>): number {
  const file = path.join(root, JOBS);
  if (!existsSync(file)) return 0;
  let data: Record<string, unknown>;
  try { data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; }
  catch { throw new StoreError(422, `${JOBS} går inte att läsa, så dess rader för det borttagna står kvar. Rätta filen och kör node tools/register.ts sweep.`); }
  const gone = new Set(ids), film = new Set(films);
  let dropped = 0;
  for (const key of ['jobs', 'derived', 'edits']) {
    const list = data[key];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((e: {id?: unknown; clip?: unknown}) => !(gone.has(String(e?.id)) || film.has(String(e?.id)) || (key === 'derived' && film.has(String(e?.clip)))));
    dropped += list.length - kept.length; data[key] = kept;
  }
  if (dropped) replaceFile(file, JSON.stringify(data, null, 2) + '\n');
  return dropped;
}

// ── The motions register ────────────────────────────────────────────────────
type Row = {id: string; revision: string; body: string};
const entryOf = (row: Row): Entry => ({id: row.id, post: JSON.parse(row.body) as Post, revision: row.revision});
const STALE = 'Posten har ändrats sedan den lästes. Läs om klippbanken och försök igen.';

export function motionRegister(root: string) {
  const rowOf = (db: DatabaseSync, id: string) => db.prepare('SELECT id, revision, body FROM motions WHERE id = ?').get(id) as Row | undefined;
  /** The post as JSON holds it (what will come out again), after the checks every post passes on its way in. */
  const checked = (id: string, post: unknown): Post => {
    if (typeof id !== 'string' || !ID.test(id)) throw new StoreError(400, 'Ogiltigt klipp-id.');
    if (!object(post)) throw new StoreError(422, 'En post i registret är ett JSON-objekt.');
    if (post.id !== id) throw new StoreError(422, `Posten ska bära sitt eget id (${id}).`);
    return JSON.parse(JSON.stringify(post)) as Post;
  };
  const orphanFilms = (db: DatabaseSync) => { db.exec('DELETE FROM films WHERE id NOT IN (SELECT film FROM motions)'); };

  /** One post with its revision, or null. */
  const entry = (id: string): Entry | null => read(root, [MOTIONS], db => { const row = typeof id === 'string' ? rowOf(db, id) : undefined; return row ? entryOf(row) : null; });
  const get = (id: string): Post | null => entry(id)?.post ?? null;
  const has = (id: string): boolean => read(root, [MOTIONS], db => typeof id === 'string' && !!db.prepare('SELECT 1 FROM motions WHERE id = ?').get(id));
  const ids = (): string[] => read(root, [MOTIONS], db => (db.prepare('SELECT id FROM motions ORDER BY id').all() as {id: string}[]).map(row => row.id));
  /** Every post, sorted on id: one read for a reader that wants many. */
  const list = (): Entry[] => read(root, [MOTIONS], db => (db.prepare('SELECT id, revision, body FROM motions ORDER BY id').all() as Row[]).map(entryOf));
  /** Every post by its id: what a reader of the whole bank asks for. */
  const posts = (): Map<string, Post> => new Map(list().map(e => [e.id, e.post]));
  /** The posts of one film: its own and the takes cut from it. */
  const ofFilm = (film: string): Entry[] => read(root, [MOTIONS], db => (db.prepare('SELECT id, revision, body FROM motions WHERE film = ? ORDER BY id').all(film) as Row[]).map(entryOf));

  /**
   * Writes a post. revision: a string is the revision the caller read (404 when the post is gone, 409 when it changed),
   * null says the post must be new (409 when it is there), left out writes whatever stands there.
   */
  function put(id: string, post: unknown, options: {revision?: string | null} = {}): Entry {
    const next = checked(id, post);
    return write(root, [MOTIONS], (db, changed) => {
      const before = rowOf(db, id);
      if (options.revision === null && before) throw new StoreError(409, `${id} har redan en post i registret.`);
      if (typeof options.revision === 'string') {
        if (!before) throw new StoreError(404, `${id} har ingen post i registret.`);
        if (before.revision !== options.revision) throw new StoreError(409, STALE);
      }
      if (before?.revision === revisionOf(next)) return entryOf(before); // the same post: nothing to write
      const stored = storeMotion(db, next); orphanFilms(db); changed(MOTIONS);
      return stored;
    });
  }
  /** Several posts in one write (each carries its id): all or none. */
  function putAll(posts: unknown[]): Entry[] {
    const next = posts.map(post => checked(object(post) ? String(post.id) : '', post));
    return write(root, [MOTIONS], (db, changed) => {
      const out = next.map(post => { const before = rowOf(db, String(post.id)); if (before?.revision === revisionOf(post)) return entryOf(before); changed(MOTIONS); return storeMotion(db, post); });
      orphanFilms(db);
      return out;
    });
  }
  /**
   * Changes a post that is there: the function gets the post as it stands and returns the next one (an object is laid
   * over it, key by key). With a revision the change is made only when the post is still the one that was read.
   */
  function patch(id: string, change: Post | ((post: Post) => Post), options: {revision?: string} = {}): Entry & {before: Post} {
    if (typeof id !== 'string' || !ID.test(id)) throw new StoreError(400, 'Ogiltigt klipp-id.');
    return write(root, [MOTIONS], (db, changed) => {
      const row = rowOf(db, id);
      if (!row) throw new StoreError(404, `${id} har ingen post i registret.`);
      if (options.revision !== undefined && row.revision !== options.revision) throw new StoreError(409, STALE);
      const before = JSON.parse(row.body) as Post, next = checked(id, typeof change === 'function' ? change(before) : {...before, ...change});
      if (revisionOf(next) === row.revision) return {...entryOf(row), before};
      const stored = storeMotion(db, next); orphanFilms(db); changed(MOTIONS);
      return {...stored, before};
    });
  }
  /**
   * Removes posts. The id of a film removes the film and, by the cascade, every post cut from it; the id of a take removes
   * that post alone (and its name in the film's cutInto). For each removed post that carried Jakob's verdict one row is
   * kept in data/motions-removed.jsonl. The entries of what went leave data/clip-jobs.json as well.
   */
  function remove(target: string | string[], options: {why: string; at?: string}): Removal {
    const targets = [...new Set(Array.isArray(target) ? target : [target])];
    for (const id of targets) if (typeof id !== 'string' || !ID.test(id)) throw new StoreError(400, 'Ogiltigt klipp-id.');
    if (!options?.why?.trim()) throw new StoreError(400, 'Säg varför posten tas bort (why).');
    const at = options.at ?? new Date().toISOString();
    const out = write(root, [REMOVED, MOTIONS], (db, changed) => {
      const removed: string[] = [], films: string[] = [], verdicts: RemovedVerdict[] = [];
      for (const id of targets) {
        const film = !!db.prepare('SELECT 1 FROM films WHERE id = ?').get(id);
        const rows = (film ? db.prepare('SELECT id, revision, body FROM motions WHERE film = ? ORDER BY id').all(id) : db.prepare('SELECT id, revision, body FROM motions WHERE id = ?').all(id)) as Row[];
        if (!rows.length) continue;
        for (const row of rows) {
          const post = JSON.parse(row.body) as Post, verdict = removedVerdict(post, at, options.why.trim());
          if (verdict) { REMOVED.insert(db, verdict); verdicts.push(verdict); changed(REMOVED); }
          removed.push(row.id);
        }
        if (film) { db.prepare('DELETE FROM films WHERE id = ?').run(id); films.push(id); }
        else {
          const parent = (db.prepare('SELECT film FROM motions WHERE id = ?').get(id) as {film: string}).film, own = rowOf(db, parent);
          db.prepare('DELETE FROM motions WHERE id = ?').run(id);
          const source = own ? JSON.parse(own.body) as Post : null;
          if (source && Array.isArray(source.cutInto) && source.cutInto.includes(id)) storeMotion(db, {...source, cutInto: source.cutInto.filter(take => take !== id)});
        }
        changed(MOTIONS);
      }
      orphanFilms(db);
      return {removed, films, verdicts};
    });
    return {...out, jobs: out.removed.length ? dropJobs(root, out.removed, out.films) : 0};
  }
  /** The rows kept about his verdicts on removed posts, oldest removal first per id. */
  const removed = (): RemovedVerdict[] => read(root, [REMOVED], db => (db.prepare(REMOVED.lines).all() as {body: string}[]).map(row => JSON.parse(row.body) as RemovedVerdict));
  /** Where the register stands: counts, and the text's hash as the database carries it. */
  const status = () => read(root, KINDS, db => ({
    posts: (db.prepare('SELECT count(*) AS n FROM motions').get() as {n: number}).n, films: (db.prepare('SELECT count(*) AS n FROM films').get() as {n: number}).n,
    removedVerdicts: (db.prepare('SELECT count(*) AS n FROM motions_removed').get() as {n: number}).n,
    text: MOTIONS_TEXT, sha256: hashIn(db, MOTIONS) ?? null, bytes: Buffer.byteLength(textOf(root, MOTIONS)), database: REGISTER_DB,
  }));
  return {get, entry, has, ids, list, posts, ofFilm, put, putAll, patch, remove, removed, status, revisionOf, filmOf};
}

// ── The sweep ───────────────────────────────────────────────────────────────
export type Sweep = {ran: boolean; why: string | null; dry: boolean; present: number; films: {film: string; posts: string[]}[]; verdicts: RemovedVerdict[]; jobs: string[]; left: string[]};
/**
 * Removes the posts of films that are no longer on the disk (self-cleaning, Jakob 2026-11-23), and the entries
 * data/clip-jobs.json still has for them. A tree without media must never empty the register: the sweep runs only where
 * assets/motions/ holds films of the register, and stops when more than half of them are missing unless it is told that
 * this is right (all). dry lists and changes nothing. No local file is deleted: what is left of a film on the disk is named.
 */
export function sweepMotions(root: string, options: {dry?: boolean; all?: boolean; at?: string} = {}): Sweep {
  const register = motionRegister(root), dry = !!options.dry;
  const out: Sweep = {ran: false, why: null, dry, present: 0, films: [], verdicts: [], jobs: [], left: []};
  if (!existsSync(path.join(root, 'assets/motions'))) return {...out, why: 'Här finns ingen assets/motions/: trädet har ingen media, och registret lämnas orört.'};
  const posts = register.list(), byFilm = new Map<string, Entry[]>();
  for (const e of posts) { const film = filmOf(e.post); byFilm.set(film, [...(byFilm.get(film) ?? []), e]); }
  const missing: {film: string; posts: string[]}[] = [];
  for (const [film, own] of byFilm) {
    const files = filmFiles(own.map(e => e.post));
    if (!files.length) continue; // a post that names no film on the disk says nothing about one
    if (files.some(f => existsSync(path.join(root, f)))) out.present++; else missing.push({film, posts: own.map(e => e.id)});
  }
  if (!out.present) return {...out, why: 'Ingen av registrets filmer finns under assets/motions/: trädet har ingen media, och registret lämnas orört.'};
  if (missing.length > out.present && !options.all) return {...out, films: missing, why: `${missing.length} av ${missing.length + out.present} filmer saknas här: det ser ut som ett träd med bara en del av filmerna, och registret lämnas orört. Stämmer det att de är borta: kör med --all.`};
  out.ran = true; out.films = missing;
  // Entries of data/clip-jobs.json for a film that is gone and has no post (a removal that stopped half way).
  const known = new Set(posts.map(e => e.id)), going = new Set(missing.flatMap(m => m.posts)), gone = new Set(missing.map(m => m.film));
  let stray: string[] = [];
  try {
    const data = JSON.parse(readFileSync(path.join(root, JOBS), 'utf8')) as {derived?: {id?: string; clip?: string}[]};
    stray = (data.derived ?? []).filter(d => typeof d.id === 'string' && typeof d.clip === 'string' && ID.test(d.clip) && !known.has(d.id) && !byFilm.has(d.clip) && !existsSync(path.join(root, `assets/motions/${d.clip}/source.mp4`))).map(d => d.id!);
    out.jobs = [...(data.derived ?? []).filter(d => going.has(String(d.id)) || gone.has(String(d.clip))).map(d => String(d.id)), ...stray];
  } catch { /* no job file here, or one that cannot be read: remove says so when it has something to take */ }
  for (const m of missing) for (const dir of [`assets/motions/${m.film}`, `assets/tracking/${m.film}`]) if (existsSync(path.join(root, dir))) out.left.push(dir);
  const why = 'filmen finns inte på disken (svep)', at = options.at ?? new Date().toISOString();
  if (dry) { out.verdicts = posts.filter(e => going.has(e.id)).map(e => removedVerdict(e.post, at, why)).filter((v): v is RemovedVerdict => !!v); return out; }
  if (missing.length) out.verdicts = register.remove(missing.map(m => m.film), {why, at}).verdicts;
  if (stray.length) dropJobs(root, stray, []);
  return out;
}
