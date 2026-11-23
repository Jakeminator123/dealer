// The lab server's routes for the doll lab (dealer3d/page/docka.html). The server calls handleDollLab(req, res, url)
// before its own routes (tools/preview.ts); it answers true when the request was one of these.
//   GET /dealer3d/docka                    the page
//   GET /dealer3d/page/<name>.ts           the page's modules, and
//   GET /dealer3d/src/<name>.ts            the 3D lane's, and
//   GET /src/table-lens.ts                 the lens they rest on: each with its types taken off, under its own name (the
//                                          modules name their neighbours with .ts, as Node needs them)
//   GET /dealer3d/data/<name>.json         a motion of dealer3d/data/
//   GET /dealer3d/plan                     Jakob's card plan (placements/default.json), read only
//   GET /dealer3d/standard                 the saved standards: name, doll, entry, place and when each was saved
//   GET /dealer3d/standard/<name>.json     one saved standard
//   PUT /dealer3d/standard/<name>.json     save one: "Spara som standard" on the page
// A standard is a motion in the form of dealer3d/data/*.json for one doll, one entry and one place, named <doll>-<place>
// from A2.3 (paow-p6c1, standard-dc1; every standard saved before the entries) and <doll>-a2-1-<place> from A2.1
// (paow-a2-1-p4c1; a2-2 is kept for A2.2), so that `node dealer3d/tools/render-reference.ts --motion dealer3d/standard/<name>.json`
// films exactly what was saved. The write is narrow: only into dealer3d/standard/, only a name of that pattern, only from
// the lab's own origin, only JSON of a motion's shape that names the same doll, entry (`lab.from`, A2.3 if left out) and place as its name, at most 1.5 MB;
// written beside the target and renamed over it. Nothing else under the repo is written by these routes.
// Imports nothing of dealer3d/src/, so that a module half way through a change there cannot stop the lab server.
// Test: node --test dealer3d/page/server.test.ts
import {mkdir, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import type {IncomingMessage, ServerResponse} from 'node:http';

export const STANDARDS = 'dealer3d/standard';
const BODY_LIMIT = 1_500_000, MOST_FRAMES = 900;
const NAME = /^([a-z][a-z0-9]{1,15})-(?:a2-([12])-)?(p[1-7]c[12]|dc[123])$/;
// A motion's own fields (dealer3d/tools/deal-film.ts and doll-pose.ts write these), and `lab`: what the page laid it from.
const KEYS = new Set(['about', 'film', 'pose', 'poseFilm', 'places', 'pace', 'rightAt', 'to', 'loose', 'fps', 'frameCount', 'leavesShoe', 'edge', 'folds', 'rests', 'handSize', 'palm', 'throughShoe', 'elbowForced', 'hip', 'beats', 'turns', 'laid', 'frames', 'doll', 'lab']);
class Refused extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

/** The plan's name of a place from a standard's: p6c1 is P6.C1, dc3 is D.C3. */
export const placeOf = (short: string) => short.startsWith('d') ? `D.C${short[2]}` : `P${short[1]}.C${short[3]}`;
/** The entry a standard's name says its deal begins in: A2.1 or A2.2 where the name has a2-1 or a2-2, else A2.3. */
const entryOf = (m: RegExpExecArray) => `A2.${m[2] ?? 3}`;
const vec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x));
const limb = (l: unknown) => { const a = l as {s?: unknown; e?: unknown; w?: unknown; p?: unknown} | null; return !!a && typeof a === 'object' && vec(a.s) && vec(a.e) && vec(a.w) && Array.isArray(a.p) && a.p.length === 21 && a.p.every(vec); };
/** Says what is wrong with a standard that is to be saved under `name`, or null: a motion's shape, and the doll, entry and place its name says. */
export function faultOf(name: string, value: unknown): string | null {
  const m = NAME.exec(name); if (!m) return 'Namnet är inte en docka och en plats.';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Rörelsen är inte ett objekt.';
  const v = value as Record<string, unknown>, strange = Object.keys(v).find(k => !KEYS.has(k)); if (strange) return `Okänt fält: ${strange.slice(0, 40)}.`;
  if (v.doll !== m[1]) return 'Rörelsen är för en annan docka än namnet säger.';
  if (!Array.isArray(v.to) || v.to.length !== 1 || v.to[0] !== placeOf(m[3])) return 'Rörelsen går till en annan plats än namnet säger.';
  if (((v.lab as {from?: unknown} | null)?.from ?? 'A2.3') !== entryOf(m)) return 'Rörelsen börjar i en annan ställning än namnet säger.';
  if (typeof v.fps !== 'number' || !(v.fps > 0 && v.fps <= 120)) return 'Rörelsen saknar rutor per sekund.';
  if (!Array.isArray(v.frames) || !Number.isInteger(v.frameCount) || v.frameCount !== v.frames.length || v.frames.length < 2 || v.frames.length > MOST_FRAMES) return 'Antalet rutor stämmer inte.';
  if (!vec(v.hip)) return 'Rörelsen saknar höft.';
  for (const key of ['leavesShoe', 'folds', 'rests'] as const) if (typeof v[key] !== 'number' || !Number.isFinite(v[key])) return `Rörelsen saknar ${key}.`;
  if (!Array.isArray(v.edge) || v.edge.length !== 2 || !v.edge.every(x => typeof x === 'number' && Number.isFinite(x))) return 'Rörelsen saknar edge.';
  const bad = v.frames.findIndex(f => { const a = f as {card?: {c?: unknown; l?: unknown; n?: unknown}; L?: unknown; R?: unknown; h?: unknown; g?: unknown} | null;
    return !a || typeof a !== 'object' || !a.card || !vec(a.card.c) || !vec(a.card.l) || !vec(a.card.n) || !limb(a.L) || !limb(a.R) || !vec(a.h) || (a.g !== undefined && !vec(a.g)); });
  return bad < 0 ? null : `Ruta ${bad} är inte en hel ruta.`;
}

export function dollLabRoutes(options: {root: string; origin: string}) {
  const {root, origin} = options, folder = path.join(root, STANDARDS);
  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => { res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'}).end(body); };
  const json = (res: ServerResponse, status: number, value: unknown) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
  const file = async (res: ServerResponse, relative: string, type: string, change: (text: string) => string = t => t) => {
    const text = await readFile(path.join(root, relative), 'utf8').catch(() => null);
    if (text === null) send(res, 404, 'text/plain; charset=utf-8', 'Finns inte.'); else send(res, 200, type, change(text.replace(/^﻿/, '')));
  };
  async function body(req: IncomingMessage): Promise<unknown> {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new Refused(415, 'JSON krävs.');
    if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) throw new Refused(413, 'Rörelsen är för stor.');
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of req) { size += chunk.length; if (size > BODY_LIMIT) throw new Refused(413, 'Rörelsen är för stor.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Refused(400, 'Rörelsen är inte giltig JSON.'); }
  }
  async function list() {
    const names = (await readdir(folder).catch(() => [] as string[])).filter(n => n.endsWith('.json') && NAME.test(n.slice(0, -5))).sort();
    return Promise.all(names.map(async n => { const name = n.slice(0, -5), m = NAME.exec(name)!; return {name, doll: m[1], from: entryOf(m), place: placeOf(m[3]), savedAt: (await stat(path.join(folder, n))).mtime.toISOString()}; }));
  }
  let writes: Promise<unknown> = Promise.resolve(), serial = 0;
  async function save(name: string, value: unknown) {
    const fault = faultOf(name, value); if (fault) throw new Refused(400, fault);
    const target = path.join(folder, `${name}.json`); if (path.dirname(target) !== folder) throw new Refused(400, 'Namnet är inte en docka och en plats.');
    const temp = path.join(folder, `.${name}.${process.pid}.${++serial}.tmp`);
    await mkdir(folder, {recursive: true});
    try { await writeFile(temp, JSON.stringify(value) + '\n', {flag: 'wx'}); await rename(temp, target); } finally { await rm(temp, {force: true}); }
  }

  /** Answers true when the request was the doll lab's. */
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const at = url.pathname, lab = at === '/dealer3d/docka' || at === '/dealer3d/plan' || at === '/src/table-lens.ts' || /^\/dealer3d\/(page|src|data|standard)(\/|$)/.test(at);
    if (!lab) return false;
    try {
      const standard = /^\/dealer3d\/standard\/([^/]+)\.json$/.exec(at);
      if (standard && req.method === 'PUT') {
        if (req.headers.origin !== origin) throw new Refused(403, 'Bara labbets egen sida får spara.');
        if (!NAME.test(standard[1])) throw new Refused(400, 'Namnet är inte en docka och en plats.');
        const value = await body(req), task = writes.then(() => save(standard[1], value)); writes = task.then(() => {}, () => {}); await task;
        json(res, 200, {saved: `${STANDARDS}/${standard[1]}.json`, standards: await list()}); return true;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { req.resume(); res.writeHead(405, {Allow: standard ? 'GET, PUT' : 'GET'}).end(); return true; }
      const script = /^\/dealer3d\/(page|src)\/([\w-]+)\.ts$/.exec(at), data = /^\/dealer3d\/data\/([\w-]+)\.json$/.exec(at);
      if (at === '/dealer3d/docka') await file(res, 'dealer3d/page/docka.html', 'text/html; charset=utf-8');
      else if (script) await file(res, `dealer3d/${script[1]}/${script[2]}.ts`, 'text/javascript; charset=utf-8', stripTypeScriptTypes);
      else if (at === '/src/table-lens.ts') await file(res, 'src/table-lens.ts', 'text/javascript; charset=utf-8', stripTypeScriptTypes);
      else if (data) await file(res, `dealer3d/data/${data[1]}.json`, 'application/json; charset=utf-8');
      else if (at === '/dealer3d/plan') await file(res, 'placements/default.json', 'application/json; charset=utf-8');
      else if (at === '/dealer3d/standard') json(res, 200, {standards: await list()});
      else if (standard && NAME.test(standard[1])) await file(res, `${STANDARDS}/${standard[1]}.json`, 'application/json; charset=utf-8');
      else send(res, 404, 'text/plain; charset=utf-8', 'Finns inte.');
    } catch (error) {
      req.resume(); // what is left of a refused body is let through, so that the answer reaches the sender
      if (!res.headersSent) json(res, error instanceof Refused ? error.status : 500, {error: error instanceof Refused ? error.message : 'Något gick fel i docklabbet.'});
      else res.end();
    }
    return true;
  };
}

export const handleDollLab = dollLabRoutes({root: path.resolve(process.cwd()), origin: 'http://127.0.0.1:4319'});
