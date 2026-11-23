// What the studio's online copy may carry, as pure functions: the release register (data/studio-release.json) read and
// checked, which takes and proofs go up, the block list that nothing may cross, and the frozen answers of the lab
// server's read routes with every cost and private field taken out. No network and no files here: tools/build-studio-
// snapshot.ts reads and writes, these decide. Tested in tools/studio-freeze.test.ts.
import {buildGraph, resolveRound, type BankData, type Graph, type Step} from '../src/clip-graph.ts';
import {judgedBank, hubChain, SEAT_HUB} from '../src/game-director.ts';
import {GAME_VOICE, spokenFilms, spokenLine, type SpeechTake} from '../src/speech-lines.ts';
import {posix} from 'node:path';

// ── The register ────────────────────────────────────────────────────────────
export type ReleaseProof = {id: string; why: string; files?: string[]};
export type Release = {
  schemaVersion: 1;
  /** The variants of the steps the game plays that it never chooses itself go up too (pickTakes). Off: they stay on the computer. */
  variants: boolean;
  proofs: ReleaseProof[];
  paow: boolean;
  /** The scene's presets (data/scene-presets/, /api/scene-presets) go up read-only, Jakob's numbered places among them. */
  presets: boolean;
  /** The game (game.html with the engine of game/ in the page) goes up, and every take it can play for these dealers. */
  casino: {on: boolean; dealers: string[]};
  blocked: {folders: string[]; names: string[]};
  stills: {width: number; quality: number};
  limits: {blobBytes: number; staticBytes: number};
};

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The dealers the copy carries: Paow while her switch is on (Pamela left main 2026-11-23). */
export const releaseDealers = (release: Pick<Release, 'paow'>): string[] => (release.paow ? ['paow'] : []);
const flag = (v: unknown, what: string) => { if (typeof v !== 'boolean') throw Error(`studio-release: ${what} ska vara true eller false.`); return v; };
const count = (v: unknown, what: string, lo: number, hi: number) => { if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) throw Error(`studio-release: ${what} ska vara ett heltal ${lo}–${hi}.`); return v as number; };

/** The register as the build uses it; anything unexpected stops the build rather than being guessed. */
export function readRelease(json: unknown): Release {
  const r = json as Record<string, any>;
  if (!r || r.schemaVersion !== 1) throw Error('studio-release: schemaVersion 1 saknas.');
  // Until 2026-11-21 the register chose the round's takes, his accepted ones and every variant (takes, round); now the game decides.
  if (r.takes !== undefined || r.round !== undefined) throw Error('studio-release: takes och round finns inte längre (2026-11-21); spelet avgör vilka tagningar som går upp, och variants om dess varianter följer med.');
  const blocked = r.blocked ?? {}, stills = r.stills ?? {}, limits = r.limits ?? {};
  if (!Array.isArray(r.proofs)) throw Error('studio-release: proofs ska vara en lista.');
  const proofs: ReleaseProof[] = r.proofs.map((p: any) => {
    if (typeof p?.id !== 'string' || !ID.test(p.id)) throw Error(`studio-release: ogiltigt prov-id ${JSON.stringify(p?.id)}.`);
    if (typeof p.why !== 'string' || !p.why.trim()) throw Error(`studio-release: provet ${p.id} saknar varför.`);
    if (p.files !== undefined && (!Array.isArray(p.files) || !p.files.length || p.files.some((f: unknown) => typeof f !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.(?:mp4|png)$/i.test(f)))) throw Error(`studio-release: provet ${p.id} har en ogiltig fillista.`);
    return {id: p.id, why: p.why, ...(p.files ? {files: [...p.files]} : {})};
  });
  if (new Set(proofs.map(p => p.id)).size !== proofs.length) throw Error('studio-release: ett prov står två gånger.');
  const list = (v: unknown, what: string) => { if (!Array.isArray(v) || !v.length || v.some(x => typeof x !== 'string' || !x.trim())) throw Error(`studio-release: ${what} ska vara en lista med text.`); return [...v] as string[]; };
  const paow = flag(r.paow, 'paow'), casino = r.casino ?? {};
  const on = flag(casino.on, 'casino.on');
  if (!Array.isArray(casino.dealers) || casino.dealers.some((d: unknown) => typeof d !== 'string' || !ID.test(d)) || new Set(casino.dealers).size !== casino.dealers.length) throw Error('studio-release: casino.dealers ska vara en lista med dealer-id, var och en en gång.');
  for (const d of casino.dealers as string[]) if (!releaseDealers({paow}).includes(d)) throw Error(`studio-release: casino.dealers nämner ${d}, som inte följer med kopian${d === 'paow' ? ' (paow är avslagen)' : ''}.`);
  if (on && !casino.dealers.length) throw Error('studio-release: casino.on kräver minst en dealer i casino.dealers.');
  return {
    schemaVersion: 1,
    variants: flag(r.variants, 'variants'),
    proofs, paow,
    presets: flag(r.presets, 'presets'), casino: {on, dealers: [...casino.dealers]},
    blocked: {folders: list(blocked.folders, 'blocked.folders'), names: list(blocked.names, 'blocked.names')},
    stills: {width: count(stills.width, 'stills.width', 120, 1920), quality: count(stills.quality, 'stills.quality', 40, 100)},
    limits: {blobBytes: count(limits.blobBytes, 'limits.blobBytes', 1, 5e9), staticBytes: count(limits.staticBytes, 'limits.staticBytes', 1, 1e9)},
  };
}

// ── The block list ──────────────────────────────────────────────────────────
// Letters without their marks and in lower case: "Göran", "GORAN" and "göran" are one name to the block list.
const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(plain(name))}(?![\\p{L}\\p{N}])`, 'u');
const folderRe = (pattern: string) => new RegExp(`^${pattern.split('*').map(part => escapeRe(plain(part))).join('.*')}$`);

/** The rule of the block list a text names ("namn Astrid"), or null. Names count as whole words. */
export function blockedName(text: string, release: Pick<Release, 'blocked'>): string | null {
  const t = plain(text);
  for (const name of release.blocked.names) if (nameRe(name).test(t)) return `namn ${name}`;
  return null;
}
/** The rule a path breaks: a folder or file whose name matches a blocked pattern ("trailer-noir*"), or a blocked name in it. */
export function blockedPath(path: string, release: Pick<Release, 'blocked'>): string | null {
  for (const part of path.split('/')) {
    const stem = plain(part).replace(/\.[a-z0-9]+$/, '');
    for (const pattern of release.blocked.folders) if (folderRe(pattern).test(plain(part)) || folderRe(pattern).test(stem)) return `mapp ${pattern}`;
  }
  return blockedName(path.replaceAll(/[-_/.]/g, ' '), release);
}
export const namesPaow = (text: string) => /(?<![a-z])paow(?![a-z])/i.test(plain(text));

// ── Words that may not go up ────────────────────────────────────────────────
// Costs in any wording the records use (credits, krediter, what something cost or was charged), and paths of this machine.
export const COST = /(?<![\p{L}])(?:credits?|krediter(?:na)?|kredit\w*|kostn\w*|kostade|kostar|cost(?:s|ing)?|charged|paid|debiter\w*|betal\w*|budget\w*|pris(?:et)?|price[ds]?)(?![\p{L}])|\$\s?\d|\d\s?(?:usd|dollar|sek|kr)(?![\p{L}])/iu;
// A drive letter, a share or a home folder. One thing that looks like a drive is not one: in built code a one-letter
// name before the else-branch of a choice that begins with a pattern, `s=i:/höjd/i.test(a)`; a slash whose text up to
// the next slash is followed by flags and .test( or .exec( is that pattern, never a path. A backslash may stand doubled,
// as a path does inside a string of code.
export const PRIVATE_PATH = /(?:\b[A-Za-z]:(?:\\{1,2}|\/(?!(?:[^\/\\\s"'\x60]|\\.)*\/[dgimsuvy]*\.(?:test|exec)\())(?=[\w.-])|\\\\[A-Za-z0-9][A-Za-z0-9._-]*\\[A-Za-z0-9._$-]|(?<![\w.])\/(?:Users|home|mnt|tmp|var|private)\/)(?:[^\s"'()<>,;]*[^\s"'()<>,;.])?/g;
/** Keys that are a cost, a ceiling, an order time or a handle on the generation service, wherever they stand. */
export const FORBIDDEN_KEY = /^(?:estimatedCredits|maximumCredits|credits|budget|requestedAt|completedAt|task|taskId|tasks|cost|costs|price|balance|token|apiKey)$/i;

/**
 * A text with every sentence that names a cost or a blocked person left out, any parenthesis that does so removed, and
 * every path of this machine replaced by "…". Jakob's stamp in front ("Jakob 2026-11-11: ") stays where it is. A text
 * that loses everything becomes "…", so that it still says that something was said.
 */
export function redactText(text: string, release: Pick<Release, 'blocked'>): string {
  const bad = (part: string) => COST.test(part) || blockedName(part, release) !== null;
  const stamp = /^\S+ \d{4}-\d{2}-\d{2}: /.exec(text)?.[0] ?? '';
  let rest = text.slice(stamp.length);
  rest = rest.replace(/\s*\([^()]*\)/g, group => bad(group) ? '' : group).replace(PRIVATE_PATH, '…');
  const kept = rest.split(/(?<=[.!?])\s+/).filter(sentence => !bad(sentence)).join(' ').trim();
  return stamp + (kept || (text.trim() ? '…' : ''));
}

/** Every string of a value redacted, every forbidden key dropped (a deep copy; the input is left as it was). */
export function scrub<T>(value: T, release: Pick<Release, 'blocked'>): T {
  if (typeof value === 'string') return redactText(value, release) as T;
  if (Array.isArray(value)) return value.map(v => scrub(v, release)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !FORBIDDEN_KEY.test(k)).map(([k, v]) => [k, scrub(v, release)])) as T;
  return value;
}

/**
 * What a frozen answer still carries that may not go up: a forbidden key, a cost, a path of this machine, a blocked name.
 * Empty when the value is clean. The build runs it on every answer it writes and stops at the first finding.
 */
export function findLeaks(value: unknown, release: Pick<Release, 'blocked'>, at = ''): string[] {
  const out: string[] = [];
  if (typeof value === 'string') {
    if (COST.test(value)) out.push(`${at}: kostnad`);
    if (new RegExp(PRIVATE_PATH.source).test(value)) out.push(`${at}: lokal sökväg`);
    const name = blockedName(value, release); if (name) out.push(`${at}: ${name}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => out.push(...findLeaks(v, release, `${at}[${i}]`)));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(k)) out.push(`${at}.${k}: fält som inte får finnas`);
    out.push(...findLeaks(v, release, `${at}.${k}`));
  }
  return out;
}

/** A text file of the site (a page, a module, a prefetch file): only blocked names and machine paths are looked for there. */
export function findTextLeaks(text: string, release: Pick<Release, 'blocked'>): string[] {
  const out: string[] = [];
  if (new RegExp(PRIVATE_PATH.source).test(text)) out.push('lokal sökväg');
  for (const name of release.blocked.names) if (nameRe(name).test(plain(text))) out.push(`namn ${name}`);
  return out;
}

// ── Which takes go up ───────────────────────────────────────────────────────
// Jakob 2026-11-21: on the net "ska endast filer som används i casinot finnas + filer som kan behövas och testas med typ i och
// under fliken 'Scen & Bord'"; the variants he is "rädd för att förlora" stay on the computer, and he chooses at a publication
// whether they go up (variants in the register). Until then the round's takes, every take he had accepted and every variant
// went up, the proofs too: 223 files, 1 636 MB in Blob on 2026-11-20.
export type Picked = {id: string; group: 'spel' | 'variant'};
export type Left = {id: string; why: string};

/**
 * Every take the game can play for a dealer, as the game reads the bank (judgedBank in src/game-director.ts): a take with a
 * verdict, Jakob's or a provisional one given in his place, and the talk films she plays on request; done, not rejected, with
 * a film. The game's own bank decides, so a take it would never play (one that waits for Jakob) is not among them.
 * A spoken line has one film in the game: the one the page's own question gives (spokenFilms over her rest takes, with the game's
 * voice). The takes that film has replaced are never played, and every delivery of re-laid lines adds as many films as she has
 * lines: on 2026-11-17 the copy's films for Blob had grown past their limit that way (2 250 MB against 2 200), with about a
 * hundred talk films in them that no page plays. A replaced take stays listed in the frozen clip bank, without its film.
 */
export function gameTakes(bank: BankData, dealer: string): Set<string> {
  const graph = buildGraph(judgedBank(bank), {dealer}), rests = (graph.edge['IDLE>IDLE']?.takes ?? []) as unknown as SpeechTake[];
  const said = new Set(Object.values(spokenFilms(rests, dealer, {voice: GAME_VOICE})).map(s => s.clip));
  return new Set(Object.values(graph.takes).filter(t => t.stage === 'DONE' && t.decision !== 'REJECTED' && !!t.media.video && (spokenLine(t as unknown as SpeechTake) === null || said.has(t.id))).map(t => t.id));
}

/**
 * The takes the game chooses by itself in its own bank (judged: judgedBank, one dealer): every take of her rest (IDLE>IDLE: the
 * rest loop draws among them by weight, the chat plays those on request, and while a film plays before the game the calm ones),
 * and the take each step plays, as the game asks it (resolveRound): every edge on its own, and every deal followed by each
 * return from its card, with the hole card down and up; and the four films of a deal from another pose at the shoe (hubChain), for
 * every card the dealer's SEAT_HUB names and every pose a deal can be made from (src/game-film.ts seatHubs tries those for a
 * second card), since the game deals from there when those films play. A variant reached that way (on an edge whose only films
 * are variants, as the only return that continues a deal, or as the deal from another pose) is played, so it is the game's
 * like any other film it plays.
 */
export function gameChoices(judged: Graph): Set<string> {
  const out = new Set((judged.edge['IDLE>IDLE']?.takes ?? []).map(t => t.id));
  const note = (steps: Step[]) => { for (const holeCardDown of [true, false]) for (const s of resolveRound(judged, steps, {holeCardDown})) if (s.take) out.add(s.take.id); };
  const edges = [...judged.edges, ...judged.experiments];
  for (const e of edges) {
    note([{from: e.from, to: e.to}]);
    if (e.kind === 'DEAL') for (const back of edges.filter(b => b.kind === 'RETURN' && b.from === e.to)) note([{from: e.from, to: e.to}, {from: back.from, to: back.to}]);
  }
  const hubs = [...Object.entries(SEAT_HUB[judged.dealer] ?? {}), ...edges.flatMap(e => e.kind === 'DEAL' && e.target ? e.hubVariants.map(hub => [e.target!, hub] as const) : [])];
  for (const [card, hub] of hubs) for (const s of hubChain(judged, hub, card) ?? []) if (s.take) out.add(s.take.id);
  return out;
}

/**
 * The copy's one choice of films for one dealer: what goes up, and why every other take of hers stays behind. The source is
 * what the game plays, for a dealer of casino.dealers: gameTakes, and of its variants only those the game chooses itself
 * (gameChoices) unless release.variants is on; then every variant it can play goes up as well. The round of the map, his
 * accepted takes the game does not play and the takes that wait for him no longer go up (Jakob 2026-11-21); the copy lists
 * them without a film. When the dealer trees decide what plays (data/dealer-trees.json, tools/dealer-tree.ts: the trees in
 * state "spelas"), `source` below is where they come in, in place of the game's bank; nothing else here changes.
 * A take whose id or film names a blocked rule is never picked: when the source would pick it, the build stops (refused). A
 * take Jakob has archived (review.archived) is never picked, whatever its verdict.
 */
export function pickTakes(bank: BankData, dealer: string, release: Release): {picked: Picked[]; left: Left[]; refused: Left[]} {
  const graph = buildGraph(bank, {dealer}), plays = release.casino.on && release.casino.dealers.includes(dealer);
  const source = plays ? gameTakes(bank, dealer) : new Set<string>(), chosen = plays ? gameChoices(buildGraph(judgedBank(bank), {dealer})) : new Set<string>();
  const wanted = new Map<string, Picked['group']>();
  for (const id of source) { const take = graph.takes[id]; if (!take) continue; if (!take.variant || chosen.has(id)) wanted.set(id, 'spel'); else if (release.variants) wanted.set(id, 'variant'); }
  const picked: Picked[] = [], left: Left[] = [], refused: Left[] = [];
  for (const take of Object.values(graph.takes).sort((a, b) => a.order - b.order)) {
    if (take.archived) { left.push({id: take.id, why: 'arkiverad'}); continue; }
    const group = wanted.get(take.id) ?? null;
    const rule = blockedPath(take.id, release) ?? (take.media.video ? blockedPath(take.media.video, release) : null);
    const paow = !release.paow && namesPaow(take.id);
    if (group && rule) { refused.push({id: take.id, why: `spärrad (${rule})`}); continue; }
    if (group && paow) { left.push({id: take.id, why: 'Paow är avslagen'}); continue; }
    if (group) { picked.push({id: take.id, group}); continue; }
    left.push({id: take.id, why: !plays ? 'dealern spelas inte i Casino' : take.stage !== 'DONE' ? 'inte klar' : take.decision === 'REJECTED' ? 'underkänd'
      : source.has(take.id) ? 'variant som spelet inte väljer själv (variants är av)' : 'spelet spelar den inte'});
  }
  return {picked, left, refused};
}

// ── The frozen clip bank ────────────────────────────────────────────────────
/** A path of this machine in a job's image reference becomes a stable token: equal paths stay equal (returnFits compares them). */
export function tokenFor(path: string, digest: (text: string) => string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(path)?.[1]?.toLowerCase() ?? 'bin';
  return `lokal/${digest(path).slice(0, 16)}.${ext}`;
}

/**
 * The clip bank as the copy hands it out (GET /api/clip-bank): the same jobs, decisions and film facts, so the graph and
 * the round come out as on the lab; without the budget, the cost and order times of every receipt, the revisions (nothing
 * can be saved), machine paths, costs and blocked names in any text. media holds paths only for a picked take and only for
 * a file that goes up: shown maps a lab path to the copy's path ("…/first.png" to "…/first.webp"); a path it lacks is null.
 */
export function freezeBank(bank: BankData & Record<string, unknown>, shown: Map<string, string>, picked: Set<string>, release: Release, digest: (text: string) => string): BankData & {schemaVersion: 1; readable: true; frozen: true} {
  const imageRef = (ref: any) => {
    if (!ref || typeof ref !== 'object') return ref;
    const out = structuredClone(ref);
    if (typeof out.file?.path === 'string' && new RegExp(PRIVATE_PATH.source).test(out.file.path)) out.file.path = tokenFor(out.file.path, digest);
    return out;
  };
  const jobs = (bank.jobs ?? []).map(job => ({...job, first: imageRef(job.first), ...(job.last ? {last: imageRef(job.last)} : {})}));
  const receipts = Object.fromEntries(Object.entries(bank.receipts ?? {}).map(([id, r]) => [id, {status: r?.status, output: r?.output ?? null}]));
  const media = Object.fromEntries(Object.entries(bank.media ?? {}).map(([id, m]) => {
    const keep = (path: string | null | undefined) => (picked.has(id) && path && shown.get(path)) || null;
    return [id, {video: keep(m?.video), reversed: keep(m?.reversed), first: keep(m?.first), last: keep(m?.last), track: keep(m?.track), overrides: keep(m?.overrides)}];
  }));
  const frozen = {schemaVersion: 1 as const, readable: true as const, frozen: true as const, jobs, derived: bank.derived ?? [], edits: bank.edits ?? [], motions: bank.motions ?? {}, receipts, media, revisions: {}};
  return scrub(frozen, release);
}

/** What a graph decides that the copy must decide the same way: each edge's main take, variants and status. */
export const graphShape = (graph: Graph) => Object.fromEntries([...graph.edges, ...graph.experiments].map(e => [e.id, {main: e.main?.id ?? null, variants: e.variants.map(t => t.id), status: e.status}]));

// ── Proofs ──────────────────────────────────────────────────────────────────
export type ProofFile = {name: string; path: string; kind: 'video' | 'image'; bytes: number};
export type Proof = {id: string; title: string | null; description: string | null; labels: Record<string, string> | null; verdicts: Record<string, string> | null; takes?: string[] | null; updatedAt: number | null; chapters: unknown[] | null; fps: number; files: ProofFile[]};

/**
 * The proofs that go up (GET /api/proofs): those the register names, in its order, each with only its listed files. A proof
 * the register names but the block list stops (its folder, or its proof.json as written, names a blocked rule) is refused,
 * not skipped. raw: the text of each proof.json as it lies on disk, so the check also sees what the route leaves out.
 */
export function pickProofs(all: Proof[], raw: Map<string, string>, release: Release): {proofs: Proof[]; refused: Left[]; left: Left[]} {
  const proofs: Proof[] = [], refused: Left[] = [], left: Left[] = [];
  for (const wanted of release.proofs) {
    const proof = all.find(p => p.id === wanted.id);
    if (!proof) { refused.push({id: wanted.id, why: 'finns inte bland proven'}); continue; }
    const rule = blockedPath(proof.id, release) ?? blockedName(raw.get(proof.id) ?? '', release) ?? blockedName(JSON.stringify(proof), release);
    if (rule) { refused.push({id: proof.id, why: `spärrad (${rule})`}); continue; }
    if (!release.paow && (namesPaow(proof.id) || namesPaow(proof.title ?? ''))) { left.push({id: proof.id, why: 'Paow är avslagen'}); continue; }
    const files = wanted.files ? proof.files.filter(f => wanted.files!.includes(f.name)) : proof.files;
    if (wanted.files && files.length !== wanted.files.length) { refused.push({id: proof.id, why: 'en fil i registret finns inte i provet'}); continue; }
    const named = new Set(files.map(f => f.name)), only = (record: Record<string, string> | null) => record ? Object.fromEntries(Object.entries(record).filter(([name]) => named.has(name))) : null;
    proofs.push(scrub({...proof, labels: only(proof.labels), verdicts: only(proof.verdicts), ...(proof.takes !== undefined ? {takes: proof.takes ? proof.takes.filter(name => named.has(name)) : null} : {}), files}, release));
  }
  for (const proof of all) if (!release.proofs.some(p => p.id === proof.id)) left.push({id: proof.id, why: blockedPath(proof.id, release) ? 'spärrad' : 'inte vald i registret'});
  return {proofs, refused, left};
}

/**
 * Jakob's word on the proofs as the copy shows it (GET /api/proof-notes, frozen): only notes on the proofs that go up, and on
 * their files that go up or on the proof as a whole; the main agent's read mark is left out. answer: the lab's GET answer.
 */
export function pickNotes(answer: {notes?: unknown}, proofs: readonly Pick<Proof, 'id' | 'files'>[]): {schemaVersion: 1; newRevision: null; notes: Record<string, unknown>[]} {
  const up = new Map(proofs.map(p => [p.id, new Set(p.files.map(f => f.name))]));
  const notes = (Array.isArray(answer.notes) ? answer.notes : []).filter((n): n is Record<string, unknown> => !!n && typeof n === 'object' && up.has(String(n.proof)) && (n.file === null || up.get(String(n.proof))!.has(String(n.file))));
  return {schemaVersion: 1, newRevision: null, notes: notes.map(({read: _read, revision: _revision, ...rest}) => rest)};
}

// ── Paths of the copy ───────────────────────────────────────────────────────
/** A path inside the output: forward slashes, no "..", no drive, no backslash, no control characters, no leading slash. */
export function safeRelative(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && path.length <= 400 && /^[A-Za-z0-9._@()[\]+,=~-]+(?:\/[A-Za-z0-9._@()[\]+,=~-]+)*$/.test(path)
    && !path.split('/').some(part => part === '.' || part === '..');
}

/**
 * The flat name the studio's prefetch asks for, for a file the export writes nested ("karta/__next.karta/__PAGE__.txt" is
 * asked for as "karta/__next.karta.__PAGE__.txt"; tools/studio-files.ts answers the same way on the lab). null for others.
 */
export function prefetchAlias(path: string): string | null {
  const m = /^((?:[^/]+\/)*)(__next\.[^/]+)\/(.+)\.txt$/.exec(path);
  return m ? `${m[1]}${m[2]}.${m[3].split('/').join('.')}.txt` : null;
}

/**
 * The files of the checkout a module names by a plain literal ('assets/scene/table.png', "assets/props/tray.glb"): what the
 * scene or the game loads by its own path, beside what the registers name. A path built at run time (`…${id}…`) is not one;
 * those come from the registers (rooms, thumbs, materials, the bank's media).
 */
export function namedAssets(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(['"`])(assets\/[A-Za-z0-9._/-]+\.(?:png|jpg|webp|glb|json|mp4))\1/g)) if (safeRelative(m[2])) out.add(m[2]);
  return [...out].sort();
}

// ── The game in the copy ────────────────────────────────────────────────────
// The lab plays the game against its server (tools/preview.ts /api/game); the copy has none, so the engine of game/ runs in
// the game page (cloud/studio/game-local.ts), with node:crypto from cloud/studio/node-crypto.ts. Its modules are the copy's
// own: under /engine/ with their paths in the repo ("/engine/game/session.js" is game/session.ts made ready for the browser).
export const ENGINE_ENTRY = '/engine/cloud/studio/game-local.js';
export const ENGINE_CRYPTO = '/engine/cloud/studio/node-crypto.js';
const ENGINE_SOURCE = /^\/engine\/((?:game\/[a-z0-9-]+|cloud\/studio\/(?:game-local|node-crypto))\.)js$/;

/** The repo file behind an engine module's address ("/engine/game/rng.js" → "game/rng.ts"), or null for any other address. */
export function engineSource(address: string): string | null {
  const m = ENGINE_SOURCE.exec(address);
  return m ? `${m[1]}ts` : null;
}

/**
 * An engine module as the copy serves it (address: its own, "/engine/game/rng.js"): node:crypto is the shim, named relative to
 * the module so that the engine's folder holds together by itself, and no other module of Node may be named. Its whole-line
 * comments stay in the repo: they say where the code was ported from, by people's names the copy does not carry, and the
 * browser needs none of them. Only a line that is a comment from its first character on is emptied (the line numbers stay),
 * so no code is touched; a module with a template string over several lines, where such a line could be text, stops the
 * build instead.
 */
export function forEngine(text: string, address: string): string {
  if (!engineSource(address)) throw Error(`Ingen modul i spelmotorn: ${address}`);
  const relative = posix.relative(posix.dirname(address), ENGINE_CRYPTO), shim = relative.startsWith('.') ? relative : `./${relative}`;
  const out = text.replace(/((?:\bfrom|\bimport)\s*\(?\s*)(['"])node:crypto\2/g, `$1$2${shim}$2`);
  const other = /(?:\bfrom|\bimport)\s*\(?\s*['"](node:[a-z/_]+)['"]/.exec(out);
  if (other) throw Error(`Spelmotorn importerar ${other[1]}, som inte finns i en webbläsare.`);
  const lines = out.split('\n');
  if (lines.some(line => (line.replace(/\\./g, '').match(/`/g)?.length ?? 0) % 2)) throw Error(`${address} har en malltext över flera rader; kommentarerna kan inte tas bort säkert.`);
  return lines.map(line => /^\s*\/\//.test(line) ? '' : line).join('\n');
}

/**
 * The copy's game.html: the lab's own page, without the lab tab's stream (preview-ui.js, which talks to the lab server) and
 * with the engine in front of game-page.js, so that the page's first read of /api/game is answered in the page. The page is
 * matched exactly: a game.html that no longer has these two lines stops the build instead of going up half-changed.
 */
export function copyGamePage(html: string): string {
  const tab = '<script type="module" src="preview-ui.js"></script>\n', page = '<script type="module" src="game-page.js"></script>';
  if (html.split(tab).length !== 2 || html.split(page).length !== 2) throw Error('game.html har inte de två skriptrader kopian väntar sig (preview-ui.js och game-page.js).');
  return html.replace(tab, '').replace(page, `<script type="module" src="${ENGINE_ENTRY}"></script>\n${page}`);
}

export const MEDIA_TYPES: Record<string, string> = {'.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.glb': 'model/gltf-binary'};
/** The object a file becomes in Blob: named by its content, so it is never overwritten with something else. */
export const objectName = (sha256: string, path: string) => {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error('Ogiltig SHA-256.');
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1];
  if (!ext || !MEDIA_TYPES[`.${ext}`]) throw Error(`Okänd filtyp: ${path}`);
  return `studio/${sha256}.${ext}`;
};
