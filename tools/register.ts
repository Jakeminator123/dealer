// The register of films and takes from the command line (tools/register-store.ts has the layer; the posts stand in
// data/motions.jsonl, one per line, and are hidden from search, so this is how a post is read):
//
//   node tools/register.ts get <id>                 one post, written as its file was (two spaces)
//   node tools/register.ts list [text]              the ids, or only those whose post contains the text
//   node tools/register.ts film <id>                the posts of one film: its own and the takes cut from it
//   node tools/register.ts status                   how many posts and films, and where they stand
//   node tools/register.ts removed                  the rows kept about Jakob's verdicts on removed posts
//   node tools/register.ts remove <id> --why "<text>"   removes a post; the id of a film removes the film and its takes
//   node tools/register.ts sweep [--dry] [--all]    removes the posts of films that are no longer on the disk
//   node tools/register.ts migrate [--dry]          the one-time move of motions/*.json into the register
//
// --root <dir> points at another checkout (a copy to try a move on). Every change says what it took.
import {existsSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {MOTIONS_TEXT, REMOVED_TEXT, motionRegister, parseRegisterText, sweepMotions, type Post} from './register-store.ts';

export type Migration = {files: number; written: number; already: number; deleted: number; plain: string[]; problems: string[]; done: boolean};
/**
 * The one-time move: reads every motions/<id>.json, writes the posts to the register (text and database), reads each
 * post back both from the database and from the text file and compares it with its JSON file, key order included, and
 * deletes the JSON files only when every post matches. dry reads and compares what it can, and writes nothing. It can
 * be run again: a file that came after the move is taken in, and one that differs from its post in the register stops it.
 */
export function migrateMotions(root: string, options: {dry?: boolean} = {}): Migration {
  const out: Migration = {files: 0, written: 0, already: 0, deleted: 0, plain: [], problems: [], done: false};
  const dir = path.join(root, 'motions');
  if (!existsSync(dir)) { out.done = true; return out; }
  const names = readdirSync(dir).sort(), files = names.filter(n => n.endsWith('.json')), other = names.filter(n => !n.endsWith('.json'));
  const register = motionRegister(root), posts = new Map<string, {text: string; post: Post}>();
  out.files = files.length;
  for (const name of files) {
    const id = name.slice(0, -5), text = readFileSync(path.join(dir, name), 'utf8');
    let post: unknown;
    try { post = JSON.parse(text); } catch { out.problems.push(`motions/${name} är inte hel JSON.`); continue; }
    if (!post || typeof post !== 'object' || Array.isArray(post)) { out.problems.push(`motions/${name} är inte en post (ett JSON-objekt).`); continue; }
    if ((post as Post).id !== id) { out.problems.push(`motions/${name} bär id ${JSON.stringify((post as Post).id ?? null)}, inte filens namn.`); continue; }
    if (JSON.stringify(post, null, 2) + '\n' !== text) out.plain.push(id); // the post is the same; only its revision is new
    posts.set(id, {text, post: post as Post});
  }
  const same = (a: unknown, b: unknown) => isDeepStrictEqual(a, b) && JSON.stringify(a) === JSON.stringify(b);
  const before = new Map(register.list().map(e => [e.id, e.post]));
  for (const [id, {post}] of posts) if (before.has(id)) { if (same(before.get(id), post)) out.already++; else out.problems.push(`${id} står redan i registret och skiljer sig från motions/${id}.json: avgör vilken som gäller och ta bort den andra.`); }
  if (out.problems.length || options.dry) return out;
  register.putAll([...posts.values()].map(p => p.post));
  out.written = posts.size - out.already;
  // Read back, twice: from the database, and from the text file on its own (the truth in Git).
  const stored = new Map(register.list().map(e => [e.id, e])), inText = new Map(parseRegisterText(readFileSync(path.join(root, MOTIONS_TEXT), 'utf8'), MOTIONS_TEXT).map(p => [String(p.id), p]));
  for (const [id, {text, post}] of posts) {
    const file = JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')) as Post, entry = stored.get(id);
    if (!entry || !same(entry.post, file) || !same(entry.post, post)) out.problems.push(`${id} kom inte ut ur databasen som den gick in.`);
    else if (!same(inText.get(id), file)) out.problems.push(`${id} står inte i ${MOTIONS_TEXT} som i sin fil.`);
    else if (!out.plain.includes(id) && (JSON.stringify(entry.post, null, 2) + '\n' !== text || entry.revision !== register.revisionOf(file))) out.problems.push(`${id} fick en annan revision än sin fil.`);
  }
  if (out.problems.length) return out;
  for (const id of posts.keys()) { unlinkSync(path.join(dir, `${id}.json`)); out.deleted++; }
  if (!other.length) rmdirSync(dir); else out.problems.push(`motions/ har kvar ${other.length} filer som inte är poster (${other.slice(0, 3).join(', ')}); mappen står kvar.`);
  // The file for the rows about his verdicts is there from the start (empty), so Git and the documents can name it.
  if (!existsSync(path.join(root, REMOVED_TEXT))) writeFileSync(path.join(root, REMOVED_TEXT), '');
  out.done = true;
  return out;
}

function main(argv: string[]) {
  const flags = new Set(argv.filter(a => a.startsWith('--') && !['--root', '--why'].includes(a)));
  const valueOf = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const words = argv.filter((a, i) => !a.startsWith('--') && !['--root', '--why'].includes(argv[i - 1] ?? ''));
  const root = path.resolve(valueOf('--root') ?? path.resolve(import.meta.dirname, '..')), register = motionRegister(root);
  const [command, id] = words, say = (line: string) => console.log(line);
  const need = () => { if (!id) throw new Error(`Ange ett id: node tools/register.ts ${command} <id>`); return id; };
  if (command === 'get') {
    const post = register.get(need());
    if (!post) { console.error(`${id} har ingen post i registret.`); process.exitCode = 1; return; }
    process.stdout.write(JSON.stringify(post, null, 2) + '\n');
  } else if (command === 'list') {
    const hits = register.list().filter(e => !id || e.id.includes(id) || JSON.stringify(e.post).includes(id));
    for (const e of hits) say(e.id);
    if (!hits.length) say(id ? `Ingen post innehåller ${id}.` : 'Registret är tomt.');
  } else if (command === 'film') {
    const own = register.ofFilm(need());
    for (const e of own) { const r = (e.post.review ?? {}) as {decision?: string; acceptedAs?: string; userReview?: string}; say(`${e.id}${r.decision ? `  ${r.decision}${r.acceptedAs ? ` (${r.acceptedAs})` : ''}${r.userReview ? `  ${r.userReview.slice(0, 80)}` : ''}` : ''}`); }
    if (!own.length) say(`Ingen post hör till filmen ${id}.`);
  } else if (command === 'status') {
    const s = register.status();
    say(`${s.posts} poster i ${s.films} filmer · ${s.text} (${Math.round(s.bytes / 1024)} kB) · databasen ${s.database} · ${s.removedVerdicts} rader om hans domar på borttagna poster (${REMOVED_TEXT})`);
    if (existsSync(path.join(root, 'motions'))) say('motions/ finns kvar: flytten är inte gjord här (node tools/register.ts migrate --dry).');
  } else if (command === 'removed') {
    const rows = register.removed();
    for (const r of rows) say(`${r.id}  ${r.decision}${r.acceptedAs ? ` (${r.acceptedAs})` : ''}  ${r.by} ${r.at ?? ''}: ${r.note.slice(0, 90)}  [borttagen ${r.removedAt.slice(0, 10)}: ${r.why}]`);
    if (!rows.length) say('Inga rader: ingen borttagen post bar hans dom.');
  } else if (command === 'remove') {
    const why = valueOf('--why');
    if (!why) throw new Error('Säg varför: node tools/register.ts remove <id> --why "<text>"');
    const done = register.remove(need(), {why});
    if (!done.removed.length) { say(`${id} har ingen post i registret; inget togs bort.`); return; }
    say(`Tog bort ${done.removed.length} poster${done.films.length ? ` (filmen ${done.films.join(', ')} med sina tagningar)` : ''}: ${done.removed.join(', ')}`);
    say(`${done.verdicts.length} bar hans dom och har en rad i ${REMOVED_TEXT}; ${done.jobs} rader gick ur data/clip-jobs.json.`);
  } else if (command === 'sweep') {
    const s = sweepMotions(root, {dry: flags.has('--dry'), all: flags.has('--all')});
    if (!s.ran) { say(`Svepet körde inte. ${s.why}`); for (const f of s.films.slice(0, 12)) say(`  saknas: ${f.film}`); return; }
    const count = s.films.reduce((n, f) => n + f.posts.length, 0);
    say(`${s.dry ? 'Skulle ta' : 'Tog'} bort ${count} poster i ${s.films.length} filmer som inte finns på disken (${s.present} filmer finns).`);
    for (const f of s.films) say(`  ${f.film}: ${f.posts.join(', ')}`);
    if (s.verdicts.length) { say(`${s.verdicts.length} av dem bär hans dom${s.dry ? ' och får' : ' och har'} en rad i ${REMOVED_TEXT}:`); for (const v of s.verdicts) say(`  ${v.id}  ${v.decision}  ${v.by} ${v.at ?? ''}: ${v.note.slice(0, 70)}`); }
    if (s.jobs.length) say(`${s.jobs.length} rader ${s.dry ? 'går' : 'gick'} ur data/clip-jobs.json.`);
    if (s.left.length) say(`Kvar på disken (inget raderas här; node tools/media-thin.ts städar media): ${s.left.join(', ')}`);
  } else if (command === 'migrate') {
    const m = migrateMotions(root, {dry: flags.has('--dry')});
    for (const p of m.problems) console.error(p);
    if (!m.files && m.done) { say('motions/ finns inte här: flytten är redan gjord.'); return; }
    if (flags.has('--dry')) say(`${m.files} poster i motions/ · ${m.already} står redan lika i registret · ${m.plain.length} filer är inte skrivna i registrets form (posten är densamma) · ${m.problems.length} hinder. Inget är ändrat.`);
    else if (m.done) say(`${m.files} poster flyttade till ${MOTIONS_TEXT} (${m.written} nya, ${m.already} stod redan lika), var och en läst tillbaka ur databasen och ur textfilen och lika med sin fil; ${m.deleted} JSON-filer raderade.`);
    if (m.problems.length && !m.done) { console.error(`Flytten stannade: ${m.problems.length} hinder. Ingen JSON-fil är raderad.`); process.exitCode = 1; }
  } else {
    say('node tools/register.ts get <id> | list [text] | film <id> | status | removed | remove <id> --why "<text>" | sweep [--dry] [--all] | migrate [--dry]');
    if (command) process.exitCode = 1;
  }
}

if (import.meta.main) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(String(error instanceof Error ? error.message : error)); process.exitCode = 1; }
}
