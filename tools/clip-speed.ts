// A film's own speed (Jakob 2026-11-23: "spela upp dealerklipp i 1.5x eller 2x ... den nya standarden för respektive klipp"):
// the field playbackSpeed on the film's entry in data/clip-jobs.json. The clip bank reads it as take.speed (src/clip-graph.ts),
// Karta's stills and the Stage play the film at it, and the game plays it at that speed times the round's tempo, the tempo
// never past 2× (src/game-film.ts filmRate). Set in Karta, in a step's panel beside the film (studio/components/map/ClipSpeed.tsx).
//   PUT /api/clip-speed   {"id": "<take id>", "speed": 1.5}   from the lab only; speed 1 takes the field away
// The file is written as the tools that register a film write it (tools/register-order.ts: two spaces, a last newline, a
// temporary file renamed into place), so nothing but the one field changes. A file that is not in that form is left as it is,
// and the reason is said. Tests: tools/clip-speed.test.ts.
import {randomUUID} from 'node:crypto';
import {readFile, rename, writeFile} from 'node:fs/promises';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const JOBS = 'data/clip-jobs.json';
/** The speeds Karta offers; 1 is as filmed (no field). */
export const CLIP_SPEEDS: readonly number[] = [1, 1.25, 1.5, 2];
const TAKE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Entry = {id?: unknown; from?: unknown; to?: unknown; kind?: unknown; playbackSpeed?: number};
type Jobs = {jobs?: Entry[]; derived?: Entry[]; edits?: Entry[]};
export type SpeedResult = {ok: true; id: string; speed: number} | {ok: false; status: number; error: string};

/** The file's text with one film's speed set (1: the field taken away), or why not. Pure. */
export function withClipSpeed(text: string, id: unknown, speed: unknown): {ok: true; text: string; id: string; speed: number} | {ok: false; status: number; error: string} {
  if (typeof id !== 'string' || !TAKE_ID.test(id)) return {ok: false, status: 400, error: 'Ange filmens id.'};
  if (typeof speed !== 'number' || !CLIP_SPEEDS.includes(speed)) return {ok: false, status: 422, error: 'Farten är 1×, 1,25×, 1,5× eller 2×.'};
  let data: Jobs;
  try { data = JSON.parse(text) as Jobs; } catch { return {ok: false, status: 500, error: `${JOBS} kunde inte läsas.`}; }
  const write = (of: Jobs) => `${JSON.stringify(of, null, 2)}\n`;
  if (write(data) !== text) return {ok: false, status: 409, error: `${JOBS} är inte skriven som verktygen skriver den. Farten sparades inte, så att filen inte formateras om.`};
  const list = (of: unknown): Entry[] => Array.isArray(of) ? of as Entry[] : [];
  const entry = [...list(data.jobs), ...list(data.derived)].find(e => e?.id === id);
  if (!entry) return list(data.edits).some(e => e?.id === id) ? {ok: false, status: 422, error: 'En rättad kopia har sin källfilms fart: sätt farten på källfilmen.'} : {ok: false, status: 404, error: `Filmen ${id} finns inte i ${JOBS}.`};
  if (entry.kind === 'IDLE' || (entry.from === 'IDLE' && entry.to === 'IDLE')) return {ok: false, status: 422, error: 'Vila och tal går alltid som filmat.'};
  if (speed === 1) delete entry.playbackSpeed; else entry.playbackSpeed = speed;
  return {ok: true, text: write(data), id, speed};
}

/** Sets one film's speed in data/clip-jobs.json; nothing is written when the answer is no, or when nothing would change. */
export async function setClipSpeed(id: unknown, speed: unknown, root = ROOT): Promise<SpeedResult> {
  const file = path.join(root, JOBS);
  let text: string;
  try { text = await readFile(file, 'utf8'); } catch { return {ok: false, status: 500, error: `${JOBS} kunde inte läsas.`}; }
  const next = withClipSpeed(text, id, speed);
  if (!next.ok) return next;
  if (next.text !== text) { const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`); await writeFile(temporary, next.text, {flag: 'wx'}); await rename(temporary, file); }
  return {ok: true, id: next.id, speed: next.speed};
}

const readBody = (req: IncomingMessage, limit = 4 * 1024) => new Promise<string>((resolve, reject) => {
  let size = 0; const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { reject(new Error('För stor.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

/** origin: the lab's own address, as tools/preview.ts has it; a speed is taken from the lab's own pages only. */
export async function serveClipSpeed(req: IncomingMessage, res: ServerResponse, origin = 'http://127.0.0.1:4319'): Promise<void> {
  const send = (status: number, body: unknown) => { res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}); res.end(JSON.stringify(body)); };
  try {
    if (req.method !== 'PUT') return send(405, {error: 'Bara PUT.'});
    if (req.headers.origin !== origin) return send(403, {error: 'Spara från det lokala labbet.'});
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, {error: 'JSON krävs.'});
    let body: {id?: unknown; speed?: unknown} | null;
    try { body = JSON.parse(await readBody(req)); } catch { return send(400, {error: 'Farten kunde inte läsas.'}); }
    const saved = await setClipSpeed(body?.id, body?.speed);
    return saved.ok ? send(200, saved) : send(saved.status, {error: saved.error});
  } catch (e) { send(500, {error: e instanceof Error ? e.message : String(e)}); }
}
