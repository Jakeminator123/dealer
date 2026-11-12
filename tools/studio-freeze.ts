// What the studio's online copy may carry, as pure functions: the release register (data/studio-release.json) read and
// checked, which takes and proofs go up, the block list that nothing may cross, and the frozen answers of the lab
// server's read routes with every cost and private field taken out. No network and no files here: tools/build-studio-
// snapshot.ts reads and writes, these decide. Tested in tools/studio-freeze.test.ts.
import type {BankData, Graph, Segment, Take} from '../src/clip-graph.ts';

// ── The register ────────────────────────────────────────────────────────────
export type ReleaseProof = {id: string; why: string; files?: string[]};
export type Release = {
  schemaVersion: 1;
  takes: {round: boolean; accepted: boolean; variants: boolean; waiting: boolean};
  round: {seats: string[]; reveal: boolean; holeCardDown: boolean};
  proofs: ReleaseProof[];
  paow: boolean;
  library: boolean;
  blocked: {folders: string[]; names: string[]};
  stills: {width: number; quality: number};
  limits: {blobBytes: number; staticBytes: number};
};

const SEAT = /^P[1-7]$/, ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const flag = (v: unknown, what: string) => { if (typeof v !== 'boolean') throw Error(`studio-release: ${what} ska vara true eller false.`); return v; };
const count = (v: unknown, what: string, lo: number, hi: number) => { if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) throw Error(`studio-release: ${what} ska vara ett heltal ${lo}–${hi}.`); return v as number; };

/** The register as the build uses it; anything unexpected stops the build rather than being guessed. */
export function readRelease(json: unknown): Release {
  const r = json as Record<string, any>;
  if (!r || r.schemaVersion !== 1) throw Error('studio-release: schemaVersion 1 saknas.');
  const takes = r.takes ?? {}, round = r.round ?? {}, blocked = r.blocked ?? {}, stills = r.stills ?? {}, limits = r.limits ?? {};
  if (!Array.isArray(round.seats) || !round.seats.length || round.seats.some((s: unknown) => typeof s !== 'string' || !SEAT.test(s))) throw Error('studio-release: round.seats ska vara platser P1–P7.');
  if (!Array.isArray(r.proofs)) throw Error('studio-release: proofs ska vara en lista.');
  const proofs: ReleaseProof[] = r.proofs.map((p: any) => {
    if (typeof p?.id !== 'string' || !ID.test(p.id)) throw Error(`studio-release: ogiltigt prov-id ${JSON.stringify(p?.id)}.`);
    if (typeof p.why !== 'string' || !p.why.trim()) throw Error(`studio-release: provet ${p.id} saknar varför.`);
    if (p.files !== undefined && (!Array.isArray(p.files) || !p.files.length || p.files.some((f: unknown) => typeof f !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.(?:mp4|png)$/i.test(f)))) throw Error(`studio-release: provet ${p.id} har en ogiltig fillista.`);
    return {id: p.id, why: p.why, ...(p.files ? {files: [...p.files]} : {})};
  });
  if (new Set(proofs.map(p => p.id)).size !== proofs.length) throw Error('studio-release: ett prov står två gånger.');
  const list = (v: unknown, what: string) => { if (!Array.isArray(v) || !v.length || v.some(x => typeof x !== 'string' || !x.trim())) throw Error(`studio-release: ${what} ska vara en lista med text.`); return [...v] as string[]; };
  return {
    schemaVersion: 1,
    takes: {round: flag(takes.round, 'takes.round'), accepted: flag(takes.accepted, 'takes.accepted'), variants: flag(takes.variants, 'takes.variants'), waiting: flag(takes.waiting, 'takes.waiting')},
    round: {seats: [...round.seats], reveal: flag(round.reveal, 'round.reveal'), holeCardDown: flag(round.holeCardDown, 'round.holeCardDown')},
    proofs, paow: flag(r.paow, 'paow'), library: flag(r.library, 'library'),
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
export const PRIVATE_PATH = /(?:\b[A-Za-z]:[\\/](?=[\w.-])|\\\\[A-Za-z0-9][A-Za-z0-9._-]*\\[A-Za-z0-9._$-]|(?<![\w.])\/(?:Users|home|mnt|tmp|var|private)\/)(?:[^\s"'()<>,;]*[^\s"'()<>,;.])?/g;
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
export type Picked = {id: string; group: 'runda' | 'godkänd' | 'variant' | 'väntar'};
export type Left = {id: string; why: string};

/** A take Jakob has accepted outright: accepted, not as a variant, by his own word, and playable (as Primära reads it). */
export const acceptedOutright = (t: Take) => t.stage === 'DONE' && t.decision === 'ACCEPTED' && !t.variant && t.motion?.review?.userAccepted === true;

/**
 * The takes whose films go up, by the register's rule: the takes the round plays, the takes accepted outright, the variants,
 * and (off by default) the takes that wait for Jakob. Every other take is named in left with the reason. A take whose id or
 * film names a blocked rule is never picked; when the rule would pick it, the build is stopped instead (refused).
 */
export function pickTakes(graph: Graph, round: Segment[], release: Release): {picked: Picked[]; left: Left[]; refused: Left[]} {
  const inRound = new Set(round.flatMap(s => s.take ? [s.take.id] : []));
  const picked: Picked[] = [], left: Left[] = [], refused: Left[] = [];
  for (const take of Object.values(graph.takes).sort((a, b) => a.order - b.order)) {
    const playable = take.stage === 'DONE' && take.decision !== 'REJECTED';
    const group: Picked['group'] | null = release.takes.round && inRound.has(take.id) ? 'runda'
      : release.takes.variants && playable && take.variant ? 'variant'
      : release.takes.accepted && acceptedOutright(take) ? 'godkänd'
      : release.takes.waiting && playable && take.decision === 'PENDING' ? 'väntar' : null;
    const rule = blockedPath(take.id, release) ?? (take.media.video ? blockedPath(take.media.video, release) : null);
    const paow = !release.paow && namesPaow(take.id);
    if (group && rule) { refused.push({id: take.id, why: `spärrad (${rule})`}); continue; }
    if (group && paow) { left.push({id: take.id, why: 'Paow är avslagen'}); continue; }
    if (group) { picked.push({id: take.id, group}); continue; }
    left.push({id: take.id, why: take.stage !== 'DONE' ? 'inte klar' : take.decision === 'REJECTED' ? 'underkänd' : take.decision === 'SECONDARY' ? 'sekundär' : take.decision === 'PENDING' ? 'väntar på Jakob' : 'inte godkänd av Jakob'});
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
/** The round as played: per step the take, the frames and the film. */
export const roundShape = (round: Segment[]) => round.map(s => ({id: s.id, take: s.take?.id ?? null, start: s.start, end: s.end, video: s.video, gap: s.gap}));

// ── Proofs ──────────────────────────────────────────────────────────────────
export type ProofFile = {name: string; path: string; kind: 'video' | 'image'; bytes: number};
export type Proof = {id: string; title: string | null; description: string | null; labels: Record<string, string> | null; verdicts: Record<string, string> | null; updatedAt: number | null; chapters: unknown[] | null; fps: number; files: ProofFile[]};

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
    proofs.push(scrub({...proof, labels: only(proof.labels), verdicts: only(proof.verdicts), files}, release));
  }
  for (const proof of all) if (!release.proofs.some(p => p.id === proof.id)) left.push({id: proof.id, why: blockedPath(proof.id, release) ? 'spärrad' : 'inte vald i registret'});
  return {proofs, refused, left};
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

export const MEDIA_TYPES: Record<string, string> = {'.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.glb': 'model/gltf-binary'};
/** The object a file becomes in Blob: named by its content, so it is never overwritten with something else. */
export const objectName = (sha256: string, path: string) => {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error('Ogiltig SHA-256.');
  const ext = /\.([a-z0-9]+)$/.exec(path)?.[1];
  if (!ext || !MEDIA_TYPES[`.${ext}`]) throw Error(`Okänd filtyp: ${path}`);
  return `studio/${sha256}.${ext}`;
};
