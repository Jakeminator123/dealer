// A dealer's compositions (Jakob 2026-11-23: two or more node trees put together into a larger tree, with shares): the register
// data/dealer-compositions.json read, drawn and saved for the lab. The rules are src/composition.ts; the trees, their films and
// their pictures come from tools/dealer-tree.ts (treeWorld), as Karta draws them.
//   GET    /api/compositions?dealer=<id>                    every composition drawn, and her trees to choose from (Karta)
//   GET    /api/compositions?dealer=<id>&komposition=<id>   one composition, or one tree alone, cut for the game (?komposition=)
//   PUT    /api/compositions?dealer=<id>                    saves one composition (the body: a CompositionDef), from the lab only
//   DELETE /api/compositions?dealer=<id>&komposition=<id>   removes one, from the lab only
// node tools/dealer-composition.ts [dealer]: each composition's number and what its steps are covered by, in plain text.
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TABLE_GEOMETRY} from '../src/card-plan.ts';
import {COMPOSITION_ID, checkComposition, compositionView, compositionWord, soloComposition,
  type CompositionAnswer, type CompositionCut, type CompositionDef, type CompositionRegister, type CompositionView, type ReuseRow} from '../src/composition.ts';
import {createLayout, slotLabel, type Slot} from '../src/game-table.ts';
import {treeWorld} from './dealer-tree.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTER = 'data/dealer-compositions.json';
const ABOUT = "Each dealer's compositions (Jakob 2026-11-23): two or more of her node trees (data/dealer-trees.json, by id) put together into one larger tree that the lab's game plays with ?komposition=<id>. trees: each tree and its share (80 and 20; share 0: the tree only lends what the others lack). bridges: where two trees may meet although their pictures differ, by the two pictures' entry ids in data/media-roles.json (A1 of one tree and A1 of another, or their anchors at the shoe); ab and ba are the bridge films each way (a path under assets/), and without one that way is a plain cut. shares: a film's share among the films of its own step, by take id. Rules and words: src/composition.ts. Written by Karta (studio/components/map/CompositionKarta.tsx) through tools/dealer-composition.ts.";

export function readCompositions(root = ROOT): CompositionRegister {
  try { const r = JSON.parse(readFileSync(path.join(root, REGISTER), 'utf8')) as CompositionRegister; if (r?.schemaVersion === 1 && r.dealers && typeof r.dealers === 'object') return r; } catch {}
  return {schemaVersion: 1, about: ABOUT, dealers: {}};
}
const defsOf = (register: CompositionRegister, dealer: string): CompositionDef[] => register.dealers[dealer]?.compositions ?? [];

/**
 * How far the drawn card is moved when a card plays another card's film: a seat's cards its first card's film, the dealer's
 * second card her first's, her later cards her third's. From the placement plan as the game reads it (read only).
 */
export function reuseRows(root = ROOT): ReuseRow[] {
  let plan: unknown;
  try { const raw = JSON.parse(readFileSync(path.join(root, 'placements/default.json'), 'utf8')); plan = raw.plan ?? raw; } catch { return []; }
  const out: ReuseRow[] = [];
  try {
    const layout = createLayout(plan as Parameters<typeof createLayout>[0], {geometry: TABLE_GEOMETRY});
    const width = (slot: Slot) => { const q = layout.quad(slot); return Math.max(...q.map(p => p.x)) - Math.min(...q.map(p => p.x)); };
    for (let seat = 0; seat <= 7; seat++) {
      const owner = seat ? 'P' as const : 'D' as const, at = (index: number): Slot => ({owner, seat, hand: 0, hands: 1, index}), cardWidth = width(at(0));
      for (let index = 1; index < 7; index++) {
        if (!seat && index === 2) continue; // the dealer's third card has a place and a film of its own
        const film = seat ? 0 : index === 1 ? 0 : 2, a = layout.centre(at(film)), b = layout.centre(at(index)), px = Math.hypot(b.x - a.x, b.y - a.y);
        out.push({card: slotLabel(at(index)), film: slotLabel(at(film)), px: Math.round(px), game: Math.round(px * 640 / 1764 * 10) / 10, cards: Math.round(px / cardWidth * 100) / 100});
      }
    }
  } catch { return []; }
  return out;
}

/** GET /api/compositions?dealer=<id>. */
export async function compositionAnswer(dealer: string, root = ROOT): Promise<CompositionAnswer> {
  const {views, takes, pictures} = await treeWorld(dealer), defs = defsOf(readCompositions(root), dealer);
  const compositions = defs.map(def => compositionView(def, views, takes));
  const solo = views.filter(v => v.home === v.tree.id).map(v => compositionView(soloComposition(v.tree), views, takes));
  const used = new Set([...compositions, ...solo].flatMap(c => c.trees.flatMap(t => [t.rest, t.shoe])).filter((id): id is string => !!id));
  return {schemaVersion: 1, dealer, made: new Date().toISOString(), compositions, trees: solo.flatMap(c => c.trees),
    takes: takes.filter(t => t.tree !== null && !t.archived).map(t => ({id: t.id, verdict: t.verdict})),
    pictures: Object.fromEntries([...used].map(id => [id, pictures.get(id) ?? {path: null, name: null}])), reuse: reuseRows(root)};
}

/** The cut the game plays from a drawn composition: its trees with their films, and the films of the dealer's other trees to leave out. */
function cutOf(dealer: string, view: CompositionView, takes: Awaited<ReturnType<typeof treeWorld>>['takes']): CompositionCut {
  const inside = new Set(view.trees.map(t => t.tree));
  return {schemaVersion: 1, dealer, id: view.def.id, name: view.def.name,
    trees: view.trees.map(t => ({tree: t.tree, name: t.name, share: t.share, hub: t.hub, rest: t.rest, shoe: t.shoe, own: takes.filter(x => x.tree === t.tree).map(x => x.id)})),
    drop: takes.filter(x => x.tree !== null && !inside.has(x.tree)).map(x => x.id),
    bridges: view.def.bridges ?? [], shares: view.def.shares ?? {},
    home: view.home ?? [...view.trees].sort((a, b) => b.share - a.share)[0]?.tree ?? null, count: view.count, looks: view.looks};
}

/** GET /api/compositions?dealer=<id>&komposition=<id>: a composition of the register, else a tree of that id alone. Null: neither. */
export async function compositionCut(dealer: string, id: string, root = ROOT): Promise<CompositionCut | null> {
  const {views, takes} = await treeWorld(dealer);
  const tree = views.find(v => v.tree.id === id)?.tree, def = defsOf(readCompositions(root), dealer).find(c => c.id === id) ?? (tree ? soloComposition(tree) : null);
  return def ? cutOf(dealer, compositionView(def, views, takes), takes) : null;
}

/**
 * Saves one composition of a dealer (a new id is added, a known one replaced). What does not hold is returned in plain words and
 * nothing is written: an id that is a tree's, a tree she does not have, a bridge between pictures that are not the trees' own,
 * a bridge film that is not on this machine, a share for a film that is in none of the trees.
 */
export async function saveComposition(dealer: string, input: unknown, root = ROOT): Promise<{ok: true; id: string} | {ok: false; problems: string[]}> {
  const {views, takes} = await treeWorld(dealer), ids = views.map(v => v.tree.id), problems = checkComposition(input, ids);
  if (problems.length) return {ok: false, problems};
  const given = input as CompositionDef;
  if (ids.includes(given.id)) problems.push(`"${given.id}" är redan ett träd: välj ett annat id.`);
  const def: CompositionDef = {id: given.id, name: given.name.trim(), trees: given.trees.map(t => ({tree: t.tree, share: t.share})),
    ...(given.bridges?.length ? {bridges: given.bridges.map(b => ({a: b.a, b: b.b, ...(b.ab ? {ab: b.ab} : {}), ...(b.ba ? {ba: b.ba} : {}), ...(b.seconds !== undefined ? {seconds: b.seconds} : {})}))} : {}),
    ...(given.shares && Object.keys(given.shares).length ? {shares: Object.fromEntries(Object.entries(given.shares).filter(([, share]) => share > 0))} : {}),
    ...(typeof given.note === 'string' && given.note.trim() ? {note: given.note.trim().slice(0, 300)} : {})};
  const view = compositionView(def, views, takes), own = new Set(view.trees.flatMap(t => [t.rest, t.shoe]).filter(Boolean)), inside = new Set(view.trees.map(t => t.tree));
  for (const b of def.bridges ?? []) {
    if (!own.has(b.a) || !own.has(b.b)) problems.push(`Bryggan ${b.a} – ${b.b} går inte mellan trädens egna bilder (A1 eller ankaret vid skon).`);
    for (const film of [b.ab, b.ba]) if (film && !existsSync(path.join(root, film))) problems.push(`Bryggans film ${film} finns inte på den här datorn.`);
  }
  const known = new Set(takes.filter(t => t.tree !== null && inside.has(t.tree)).map(t => t.id));
  for (const id of Object.keys(def.shares ?? {})) if (!known.has(id)) problems.push(`Filmen ${id} hör inte till något av kompositionens träd.`);
  if (problems.length) return {ok: false, problems};
  const register = readCompositions(root), list = defsOf(register, dealer), at = list.findIndex(c => c.id === def.id);
  const next = at >= 0 ? list.map((c, i) => i === at ? def : c) : [...list, def];
  write({...register, about: register.about || ABOUT, dealers: {...register.dealers, [dealer]: {compositions: next}}}, root);
  return {ok: true, id: def.id};
}

/** Removes one composition; false when the dealer has none of that id. */
export function removeComposition(dealer: string, id: string, root = ROOT): boolean {
  const register = readCompositions(root), list = defsOf(register, dealer);
  if (!list.some(c => c.id === id)) return false;
  write({...register, dealers: {...register.dealers, [dealer]: {compositions: list.filter(c => c.id !== id)}}}, root);
  return true;
}
function write(register: CompositionRegister, root: string) {
  const file = path.join(root, REGISTER), temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(register, null, 2)}\n`);
  renameSync(temp, file);
}

const readBody = (req: IncomingMessage, limit = 64 * 1024) => new Promise<string>((resolve, reject) => {
  let size = 0; const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { reject(new Error('För stor.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

/** origin: the lab's own address, as tools/preview.ts has it; a save or a removal is taken from the lab's own pages only. */
export async function serveCompositions(req: IncomingMessage, res: ServerResponse, url: URL, origin = 'http://127.0.0.1:4319'): Promise<void> {
  const send = (status: number, body: unknown) => { res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}); res.end(JSON.stringify(body)); };
  const dealer = url.searchParams.get('dealer') ?? '', id = url.searchParams.get('komposition');
  if (!/^[a-z0-9-]+$/.test(dealer)) return send(400, {error: 'Ange ?dealer=<id>.'});
  if (id !== null && !COMPOSITION_ID.test(id)) return send(400, {error: `"${id.slice(0, 40)}" är inget kompositions-id.`});
  try {
    if (req.method === 'GET') {
      if (id === null) return send(200, await compositionAnswer(dealer));
      const cut = await compositionCut(dealer, id);
      return send(cut ? 200 : 404, cut ?? {error: `${dealer} har ingen komposition "${id}".`});
    }
    if (req.method !== 'PUT' && req.method !== 'DELETE') return send(405, {error: 'Bara GET, PUT och DELETE.'});
    if (req.headers.origin !== origin) return send(403, {error: 'Spara från det lokala labbet.'});
    if (req.method === 'DELETE') {
      if (id === null) return send(400, {error: 'Ange ?komposition=<id>.'});
      return removeComposition(dealer, id) ? send(200, {ok: true}) : send(404, {error: `${dealer} har ingen komposition "${id}".`});
    }
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, {error: 'JSON krävs.'});
    let body: unknown;
    try { body = JSON.parse(await readBody(req)); } catch { return send(400, {error: 'Kompositionen kunde inte läsas.'}); }
    const saved = await saveComposition(dealer, body);
    return saved.ok ? send(200, saved) : send(422, {error: saved.problems.join(' '), problems: saved.problems});
  } catch (e) { send(500, {error: e instanceof Error ? e.message : String(e)}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dealer = process.argv[2] ?? 'paow', answer = await compositionAnswer(dealer);
  const HOW: Record<string, string> = {eget: 'eget', aterbruk: 'återbruk', lanat: 'lånat', saknas: 'saknas'};
  for (const c of [...answer.compositions, ...answer.trees.map(t => ({def: {id: t.tree, name: `${t.name} (ensamt)`}, trees: [t], steps: [], count: {have: t.have, own: t.have, total: 36}, joins: [], home: null, looks: [], problems: []} as unknown as CompositionView))]) {
    console.log(`\n${c.def.name} [${c.def.id}]: spelbart ${compositionWord(c.count)}, varav egna ${c.count.own}${c.looks.length > 1 ? ' · händerna skiljer mellan träden' : ''}`);
    console.log(`  träd: ${c.trees.map(t => `${t.name} ${t.percent} %`).join(', ')}${c.home ? ` · vilar i ${c.home}` : ''}`);
    for (const j of c.joins) console.log(`  ${j.a} – ${j.b}: vilan ${j.rest.how}${j.rest.film ? ' (film)' : ''}, skon ${j.shoe.how}${j.shoe.film ? ' (film)' : ''}`);
    for (const s of c.steps) console.log(`  ${s.name.padEnd(24)} ${HOW[s.state].padEnd(9)} ${s.parts.map(p => `${p.tree} ${p.percent} %${p.how === 'aterbruk' ? ` (${p.of}:s film)` : ''}${p.films.filter(f => f.percent > 0).length > 1 ? ` [${p.films.filter(f => f.percent > 0).map(f => `${f.id} ${f.percent} %`).join(', ')}]` : ''}`).join(' | ')}${s.lacking.length ? ` · ${s.lacking.join(', ')} lånar via ${s.reach}` : ''}`);
    for (const p of c.problems) console.log(`  ! ${p}`);
  }
}
