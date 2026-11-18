import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { traceTakes, type OrderPicture, type TakeLike } from '../studio/lib/lineage.ts';
import { currentReviewerEntry, reviewInstant } from '../studio/lib/ledger.ts';
import type { Entry, JobPicture } from '../studio/lib/media.ts';
import { parseReviewEvidence } from '../src/review-evidence.ts';

const indexDir = '.runtime/evidence';
const runsDir = indexDir + '/runs';
const schemaVersion = 1;
const indexSchemaVersion = 2;
const safeId = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const safeCode = /^[a-z][a-z0-9_-]{0,63}$/i;
const sha256 = /^[a-f0-9]{64}$/i;
const gitSha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const secret = /^(?:\.env(?:\.|$)|private$|secrets?(?:[._-]|$)|credentials?(?:[._-]|$)|gh[pousr]_|github_pat_|sk-|AKIA)/i;
const safePathPart = /^[\p{L}\p{N}_.@() -]+$/u;
const maximumReceiptBytes = 256 * 1024;

export type RunReceiptInput = {
  kind: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  revision: string | null;
  dirtyInputs: string[];
  counts: { pass: number; fail: number; skip: number; todo: number; cancelled?: number };
  studioRevision?: string | null;
  inputs: { path: string; sha256: string }[];
  notes?: string[];
  log?: string;
};

type Receipt = RunReceiptInput & { schemaVersion: number; id: string; counts: Required<RunReceiptInput['counts']> };
type Obj = Record<string, unknown>;
type Link = {
  id: string;
  relation: string;
  relatedId: string | null;
  source: string;
  path: string | null;
  sha256: string | null;
  take: number | null;
  planSha256: string | null;
  drawing: string | null;
};

function object(value: unknown): Obj {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function matched(value: unknown, rule: RegExp): string | null {
  return typeof value === 'string' && rule.test(value) ? value : null;
}

function identifier(value: unknown, rule = safeId): string | null {
  const key = matched(value, rule);
  return key && !secret.test(key) ? key : null;
}

function relative(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  const name = value.replaceAll('\\', '/');
  return name.split('/').every(segment => safePathPart.test(segment) && segment === segment.trim() && !/\.$/.test(segment)
    && !secret.test(segment) && !/\.(?:pem|pfx|key)$/i.test(segment)) ? name : null;
}

function natural(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function required<T>(value: T | null, field: string): T {
  if (value === null) throw new Error('Körkvittot har ett ogiltigt fält: ' + field + '.');
  return value;
}

function timestamp(value: unknown): string | null {
  const text = matched(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

// Reconstruct the supported fields so arbitrary caller properties never leak into a receipt.
function checkedReceipt(value: RunReceiptInput, id: string): Receipt {
  const startedAt = required(timestamp(value.startedAt), 'startedAt');
  const finishedAt = required(timestamp(value.finishedAt), 'finishedAt');
  if (finishedAt < startedAt) throw new Error('Körkvittot slutar före start.');
  if (!Array.isArray(value.dirtyInputs) || !Array.isArray(value.inputs)) throw new Error('Körkvittot saknar indatalistor.');
  if (value.notes !== undefined && !Array.isArray(value.notes)) throw new Error('Körkvittots noter ska vara koder.');
  return {
    schemaVersion, id, kind: required(identifier(value.kind, safeCode), 'kind'),
    startedAt, finishedAt, status: required(identifier(value.status, safeCode), 'status'),
    revision: value.revision === null ? null : required(matched(value.revision, gitSha), 'revision'),
    dirtyInputs: [...new Set(value.dirtyInputs.map(item => required(relative(item), 'dirtyInputs')))],
    counts: {
      pass: required(natural(value.counts?.pass), 'counts.pass'),
      fail: required(natural(value.counts?.fail), 'counts.fail'),
      skip: required(natural(value.counts?.skip), 'counts.skip'),
      todo: required(natural(value.counts?.todo), 'counts.todo'),
      cancelled: value.counts?.cancelled === undefined ? 0 : required(natural(value.counts.cancelled), 'counts.cancelled'),
    },
    ...(value.studioRevision !== undefined ? {
      studioRevision: value.studioRevision === null ? null : required(matched(value.studioRevision, gitSha), 'studioRevision'),
    } : {}),
    inputs: value.inputs.map(input => ({
      path: required(relative(input?.path), 'inputs.path'),
      sha256: required(matched(input?.sha256, sha256), 'inputs.sha256'),
    })),
    ...(value.notes ? { notes: value.notes.map(item => required(identifier(item, safeCode), 'notes')) } : {}),
    ...(value.log !== undefined ? { log: required(relative(value.log), 'log') } : {}),
  };
}


/** Run receipts, material registers and the cache belong to the primary checkout. */
function evidenceRoot(root: string): string {
  const checkout = path.resolve(root);
  const dotGit = lstatSync(path.join(checkout, '.git'), {throwIfNoEntry: false});
  if (!dotGit || dotGit.isDirectory()) return checkout;
  const env = {...process.env};
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: checkout, env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!path.isAbsolute(common) || path.basename(common).toLowerCase() !== '.git') {
    throw new Error('Evidensjournalen kräver huvudcheckoutens gemensamma .git-katalog.');
  }
  return path.dirname(common);
}

/** Write a receipt independently of the SQLite cache and return its path relative to the primary checkout. */
export function writeRunReceipt(root: string, receipt: RunReceiptInput): string {
  const id = randomUUID();
  const contents = JSON.stringify(checkedReceipt(receipt, id)) + '\n';
  if (Buffer.byteLength(contents) > maximumReceiptBytes) throw new Error('Körkvittot överstiger 256 KiB.');
  const name = runsDir + '/' + id + '.json';
  const target = path.join(evidenceRoot(root), name);
  const temp = target + '.tmp';
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    writeFileSync(temp, contents, { flag: 'wx' });
    renameSync(temp, target);
  } finally {
    rmSync(temp, { force: true });
  }
  return name;
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function jsonFiles(root: string, directory: string): string[] {
  try {
    return readdirSync(path.join(root, directory), { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json') && identifier(entry.name.slice(0, -5)))
      .map(entry => directory + '/' + entry.name).sort();
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

function readMetadata(root: string, source: string, unreadable: Set<string>, optional = false): Obj | null {
  const file = path.join(root, source);
  try {
    const limit = source.startsWith(runsDir + '/') ? maximumReceiptBytes : 8 * 1024 * 1024;
    if (statSync(file).size > limit) throw new Error('För stort metadata.');
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Metadata saknar objekt.');
    return object(value);
  } catch (error) {
    if (!optional || !missing(error)) unreadable.add(source);
    return null;
  }
}

function drawingOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.startsWith('flatQuad')) return 'flatQuad';
  if (value.startsWith('verkligt perspektiv:')) return 'lens';
  if (value === 'kortets egen fyrhörning (quad)') return 'quad';
  return 'other';
}

function reviewEvidence(review: Obj, prefix: string) {
  const evidence = parseReviewEvidence(review.evidence, prefix);
  return Number.isFinite(reviewInstant(review.at)) && typeof review.note === 'string' && review.note.trim() && evidence ? {film: evidence.film, artifacts: evidence.files} : null;
}

function materialLinks(root: string, unreadable: Set<string>): Link[] {
  const links: Link[] = [];
  const fromPath = new Map<string, Set<string>>();
  const add = (source: string, id: string, relation: string, related: unknown = null, fields: Obj = {}) => {
    const file = relative(fields.path);
    if (file?.startsWith('assets/') || file?.startsWith('output/')) {
      const keys = fromPath.get(file) ?? new Set<string>();
      keys.add(id);
      fromPath.set(file, keys);
    }
    links.push({
      id, relation, relatedId: identifier(related), source, path: file, sha256: matched(fields.sha256, sha256),
      take: natural(fields.take), planSha256: matched(fields.planSha256, sha256), drawing: drawingOf(fields.drawing),
    });
  };

  const registerPath = 'data/media-roles.json';
  const register = readMetadata(root, registerPath, unreadable);
  const entries: (Pick<Entry, 'id' | 'path' | 'frame' | 'pattern'> & { sha256?: string })[] = [];
  for (const [dealer, block] of Object.entries(object(register?.dealers))) {
    for (const raw of array(object(block).entries)) {
      const entry = object(raw);
      const key = identifier(entry.id);
      if (!key) continue;
      const file = relative(entry.path);
      entries.push({
        id: key, path: file ?? undefined, frame: natural(entry.frame) ?? undefined,
        pattern: typeof entry.pattern === 'string' ? entry.pattern : undefined,
        sha256: matched(entry.sha256, sha256) ?? undefined,
      });
      add(registerPath, key, 'registered-for', dealer, entry);
      for (const parent of array(entry.builtOn)) if (identifier(parent)) add(registerPath, key, 'built-on', parent);
      if (file && /^assets\/(?:anchors|films)\//.test(file)) {
        const source = path.posix.join(path.posix.dirname(file), 'receipt.json');
        const local = readMetadata(root, source, unreadable, true);
        const original = object(local?.original);
        const output = object(local?.output);
        if (relative(output.path) || matched(output.sha256, sha256)) add(source, key, 'material-receipt', null, output);
        if (identifier(original.order) || relative(original.path)) add(source, key, 'material-source', original.order, original);
      }
    }
  }

  const orderPictures: OrderPicture[] = [];
  const orderVersions = new Map<string, string | null>();
  for (const source of jsonFiles(root, 'data/orders')) {
    const order = readMetadata(root, source, unreadable);
    const key = identifier(order?.id);
    if (!order || !key) continue;
    orderVersions.set(key, matched(object(order.approval).orderSha256, sha256));
    add(source, key, 'ordered-for', order.dealer);
    for (const raw of array(order.pictures)) {
      const picture = object(raw), from = object(picture.from), drawn = object(picture.drawn), plan = object(drawn.plan);
      orderPictures.push({ path: picture.path, sha256: picture.sha256, from });
      add(source, key, 'order-picture', from.entry, { ...picture, planSha256: plan.sha256, drawing: drawn.as });
      if (relative(plan.path)) add(source, key, 'order-plan', null, { path: plan.path, sha256: plan.sha256, drawing: drawn.as });
    }
    const reference = object(order.reference);
    if (relative(reference.path)) add(source, key, 'order-reference', object(reference.from).clip, reference);
    const localSource = 'assets/orders/' + key + '/receipt.json';
    const local = readMetadata(root, localSource, unreadable, true);
    for (const raw of array(local?.takes)) {
      const entry = object(raw), take = natural(entry.take), review = object(entry.review);
      if (take !== null) add(localSource, key, 'order-take', null, { take, path: entry.file, sha256: entry.sha256 });
      if (review.evidence === undefined) continue;
      if (!take || (local?.order !== undefined && local.order !== key)) {
        unreadable.add(localSource);
        continue;
      }
      const evidence = reviewEvidence(review, `assets/orders/${key}/take-${take}/`);
      if (!evidence) {
        unreadable.add(localSource);
        continue;
      }
      if (currentReviewerEntry(entry.history, review) !== review) continue;
      // The review names its own film version. The current take file may be the original or a later edit.
      add(localSource, key, 'reviewed-film', null, { ...evidence.film, take });
      for (const file of evidence.artifacts) add(localSource, key, 'review-artifact', null, { ...file, take });
    }
  }

  for (const source of jsonFiles(root, 'motions')) {
    const motion = readMetadata(root, source, unreadable);
    if (!motion) continue;
    const key = identifier(motion.id) ?? path.posix.basename(source, '.json');
    const media = object(motion.source), order = object(motion.order);
    if (relative(media.path) || matched(media.sha256, sha256)) add(source, key, 'motion-file', null, media);
    const orderId = identifier(order.id);
    if (orderId) {
      const expected = matched(order.orderSha256, sha256);
      const changed = expected && orderVersions.get(orderId) !== expected;
      add(source, key, changed ? 'motion-order-version-missing' : 'motion-order', orderId, {
        take: order.take, path: order.path, sha256: expected,
      });
    }
    if (relative(order.receipt)) add(source, key, 'motion-order-receipt', orderId, { take: order.take, path: order.receipt });
    if (relative(motion.generationRef)) add(source, key, 'generation-receipt', null, { path: motion.generationRef });
  }

  const jobsPath = 'data/clip-jobs.json';
  const jobs = readMetadata(root, jobsPath, unreadable);
  const takes: TakeLike[] = [];
  for (const list of [jobs?.jobs, jobs?.derived, jobs?.edits]) {
    for (const raw of array(list)) {
      const job = object(raw), key = identifier(job.id);
      if (!key) continue;
      const clip = identifier(job.clip);
      const [from, to] = array(job.frames).map(natural);
      const frames: [number, number] | undefined = from != null && to != null ? [from, to] : undefined;
      takes.push({ id: key, clip: clip ?? key, frames, first: object(job.first) as JobPicture, last: object(job.last) as JobPicture });
      if (clip && clip !== key) add(jobsPath, key, 'derived-from', clip);
      const edit = identifier(object(job.source).clip);
      if (edit && edit !== key) add(jobsPath, key, 'edited-from', edit);
    }
  }
  for (const [key, trace] of Object.entries(traceTakes(entries, takes, orderPictures))) {
    if (trace.first) add(jobsPath, key, 'first-anchor', trace.first);
    if (trace.last) add(jobsPath, key, 'last-anchor', trace.last);
  }

  // Historical reports have different schemas. An exact known ID or path is a mention, not a lineage assertion.
  const known = new Set(links.map(link => link.id));
  for (const source of jsonFiles(root, 'evidence')) {
    const mentions = new Set<string>(), files = new Set<string>();
    const values: unknown[] = [readMetadata(root, source, unreadable)];
    while (values.length) {
      const item = values.pop();
      if (Array.isArray(item)) {
        for (const value of item) values.push(value);
      } else if (item && typeof item === 'object') {
        for (const [field, value] of Object.entries(item)) values.push(field, value);
      } else if (typeof item === 'string') {
        if (known.has(item)) mentions.add(item);
        const file = relative(item);
        if (file && fromPath.has(file)) files.add(file);
      }
    }
    for (const key of mentions) add(source, key, 'evidence-mention');
    for (const file of files) for (const key of fromPath.get(file) ?? []) add(source, key, 'evidence-mention', null, { path: file });
  }
  return links;
}

function openIndex(root: string) {
  return new DatabaseSync(path.join(root, indexDir, 'index.sqlite'), { timeout: 5000 });
}

function rebuildIndex(root: string): { schemaVersion: number; runs: number; links: number; unreadable: string[] } {
  mkdirSync(path.join(root, indexDir), { recursive: true });
  const db = openIndex(root);
  const unreadable = new Set<string>();
  try {
    db.exec('BEGIN IMMEDIATE');
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
    if (version > indexSchemaVersion) throw new Error('Evidensindexet kommer från en nyare version.');
    if (version !== indexSchemaVersion) db.exec('DROP TABLE IF EXISTS runs; DROP TABLE IF EXISTS material_links;');
    db.exec([
      'CREATE TABLE IF NOT EXISTS runs (',
      '  id TEXT PRIMARY KEY, kind TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,',
      '  status TEXT NOT NULL, revision TEXT, dirty_count INTEGER NOT NULL, studio_revision TEXT,',
      '  pass INTEGER NOT NULL, fail INTEGER NOT NULL, skip INTEGER NOT NULL, todo INTEGER NOT NULL,',
      '  cancelled INTEGER NOT NULL, receipt TEXT NOT NULL',
      ') STRICT;',
      'CREATE TABLE IF NOT EXISTS material_links (',
      '  id TEXT NOT NULL, relation TEXT NOT NULL, related_id TEXT, source TEXT NOT NULL,',
      '  path TEXT, sha256 TEXT, take INTEGER, plan_sha256 TEXT, drawing TEXT',
      ') STRICT;',
      'CREATE INDEX IF NOT EXISTS material_id ON material_links (id);',
      'CREATE INDEX IF NOT EXISTS material_related_id ON material_links (related_id);',
      'DELETE FROM runs; DELETE FROM material_links;',
      'PRAGMA user_version = ' + indexSchemaVersion + ';',
    ].join('\n'));

    const runInsert = db.prepare('INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let runs = 0;
    for (const source of jsonFiles(root, runsDir)) {
      const value = readMetadata(root, source, unreadable);
      if (!value) continue;
      const id = path.posix.basename(source, '.json');
      let receipt: Receipt;
      try {
        if (value.schemaVersion !== schemaVersion || value.id !== id) throw new Error('Fel kvittoversion eller id.');
        receipt = checkedReceipt(value as RunReceiptInput, id);
      } catch {
        unreadable.add(source);
        continue;
      }
      const { kind, startedAt, finishedAt, status, revision, dirtyInputs, studioRevision, counts } = receipt;
      runInsert.run(id, kind, startedAt, finishedAt, status, revision, dirtyInputs.length, studioRevision ?? null,
        counts.pass, counts.fail, counts.skip, counts.todo, counts.cancelled, source);
      runs++;
    }

    const linkInsert = db.prepare('INSERT INTO material_links VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const links = materialLinks(root, unreadable);
    for (const link of links) {
      linkInsert.run(link.id, link.relation, link.relatedId, link.source, link.path, link.sha256, link.take, link.planSha256, link.drawing);
    }
    db.exec('COMMIT');
    return { schemaVersion, runs, links: links.length, unreadable: [...unreadable].sort() };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

export function reindexEvidence(root: string) {
  return rebuildIndex(evidenceRoot(root));
}

export function evidenceStatus(root: string) {
  const primary = evidenceRoot(root);
  const summary = rebuildIndex(primary);
  const db = openIndex(primary);
  try {
    const latest = db.prepare('SELECT * FROM runs ORDER BY finished_at DESC, id DESC LIMIT 10').all();
    return { ...summary, latest };
  } finally {
    db.close();
  }
}

export function traceEvidence(root: string, key: string) {
  if (!identifier(key)) throw new Error('Ange ett order- eller material-ID.');
  const primary = evidenceRoot(root);
  const summary = rebuildIndex(primary);
  const db = openIndex(primary);
  try {
    const links = db.prepare([
      'WITH RECURSIVE origins(id) AS (',
      '  SELECT ? UNION SELECT related_id FROM material_links JOIN origins USING (id)',
      "  WHERE related_id IS NOT NULL AND relation IN ('motion-order', 'material-source', 'derived-from', 'edited-from')",
      ')',
      'SELECT DISTINCT material_links.* FROM material_links',
      'WHERE id IN (SELECT id FROM origins) OR related_id = ?',
      'ORDER BY id, relation, source, path, take',
    ].join('\n')).all(key, key);
    return { id: key, links, unreadable: summary.unreadable };
  } finally {
    db.close();
  }
}
