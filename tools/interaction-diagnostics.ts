// A bounded local inbox that every IDE can read. A sample is evidence to inspect, not proof of a slow handler.
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {IncomingMessage, ServerResponse} from 'node:http';
import type {InteractionSample} from '../src/interaction-diagnostics.ts';

export const SAMPLE_LIMIT = 200, BODY_LIMIT = 16384;
const localPath = (s: unknown): s is string => typeof s === 'string' && /^\/[a-zA-Z0-9/_.,%-]*$/.test(s) && !s.startsWith('//') && s.length <= 200;
export function validateSamples(value: unknown): InteractionSample[] {
  if (!Array.isArray(value) || !value.length || value.length > 16) throw Error('Invalid samples');
  return value.map(s => {
    if (!s || !localPath(s.page) || typeof s.target !== 'string' || !/^(unknown|(?:a|button|input|select|textarea|[a-z][a-z0-9-]*)(?: \/[a-zA-Z0-9/_.,%-]*)?)$/.test(s.target) || s.target.length > 210 ||
      !['pointerdown','pointerup','mousedown','mouseup','click','keydown','keyup','keypress','touchstart','touchend'].includes(s.event) ||
      typeof s.at !== 'string' || s.at.length > 30 || !Number.isFinite(Date.parse(s.at)) ||
      typeof s.hidden !== 'boolean' || typeof s.visibilityChanged !== 'boolean' || !Number.isSafeInteger(s.interactionId) || s.interactionId <= 0 ||
      !['duration','inputDelay','processing','presentation'].every(k => typeof s[k] === 'number' && Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 86400000) || s.duration < 200) throw Error('Invalid sample');
    return {at: s.at, page: s.page, target: s.target, event: s.event, interactionId: s.interactionId,
      duration: s.duration, inputDelay: s.inputDelay, processing: s.processing, presentation: s.presentation, hidden: s.hidden, visibilityChanged: s.visibilityChanged};
  });
}
export function diagnosticsStore(root: string) {
  const file = path.join(root, '.runtime', 'interaction-diagnostics', 'recent.json');
  let queue: Promise<unknown> = Promise.resolve();
  return {file, async append(samples: InteractionSample[]) {
    const run = queue.then(async () => {
      let previous: unknown[] = [];
      try { if ((await stat(file)).size < 200000) { const saved = JSON.parse(await readFile(file, 'utf8')); if (Array.isArray(saved)) previous = saved; } }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      let studioCommit: string | null = null;
      try { const build = JSON.parse(await readFile(path.join(root, 'studio', 'out', 'bygge.json'), 'utf8')); if (/^[a-f0-9]{40}$/.test(build.commit)) studioCommit = build.commit; } catch {}
      await mkdir(path.dirname(file), {recursive: true});
      await writeFile(file, JSON.stringify([...previous, ...samples.map(s => ({...s, studioCommit}))].slice(-SAMPLE_LIMIT), null, 2) + '\n');
    });
    queue = run.catch(() => {}); return run;
  }};
}
export async function receiveDiagnostics(req: IncomingMessage, res: ServerResponse, origin: string, store: ReturnType<typeof diagnosticsStore>) {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  if (req.headers.origin !== origin) { res.writeHead(403).end(); return; }
  if (req.headers['content-type'] !== 'application/json') { res.writeHead(415).end(); return; }
  const chunks: Buffer[] = []; let bytes = 0;
  try {
    for await (const chunk of req) { bytes += chunk.length; if (bytes > BODY_LIMIT) { res.writeHead(413).end(); return; } chunks.push(chunk); }
    const samples = validateSamples(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    await store.append(samples); res.writeHead(204).end();
  } catch { res.writeHead(400).end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = diagnosticsStore(path.resolve(fileURLToPath(new URL('../', import.meta.url)))).file;
  try { const samples = JSON.parse(await readFile(file, 'utf8')); console.log(JSON.stringify({file, count: samples.length, latest: samples.slice(-10)}, null, 2)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') console.log('Inga långsamma interaktioner registrerade ännu.'); else throw e; }
}
