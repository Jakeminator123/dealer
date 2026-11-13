// The bot's knowledge, the pure parts: how a document is cleaned and split at its headings, how the clip bank, the proofs
// and the studio's views become text, which sections make up the core that goes with every question, and the last scan
// that stops the build if anything that must not leak is still there. No network and no files here: tools/build-
// knowledge.ts reads, these decide. Tested in tools/knowledge.test.ts.
//
// The site's password is weak on purpose (Jakob 2026-11-12), so the knowledge is treated as half public. Cleaning: paths of
// this machine become "‹lokal mapp›"; ids of projects, teams, stores, deployments and workspaces go; every sentence or
// table row about credits, balance, budget, price or cost goes, and so does anything on the release register's block list
// (data/studio-release.json), the trailers, passwords, environment variables and addresses of services. Of Scoutgaming only
// the named documents are read; its environment variables, operations and incidents are not read at all.
import type {Graph, Take} from '../src/clip-graph.ts';
import {edgeName, takeNames} from '../studio/lib/names.ts';
import {verdictOf, storedNote, awaitingJakob, judgedForJakob, proofVerdict, PROOF_VERDICT_LABEL, type ProofVerdict} from '../studio/lib/verdict.ts';
import {COST, PRIVATE_PATH, blockedName, type Proof, type Release} from './studio-freeze.ts';
import {inspectBlob} from './publication-check.ts';
import {roughTokens} from '../cloud/studio/bot-models.ts';
import type {Knowledge, Section} from '../cloud/studio/bot-search.ts';

export const CORE_TOKENS = 28_000;
/** A searchable section is cut at paragraphs into parts of about this many characters, so six of them stay small. */
export const PART_CHARS = 2400;
export const LOCAL = '‹lokal mapp›';

// ── The rules of the cleaning ───────────────────────────────────────────────
type Blocked = Pick<Release, 'blocked'>;
/** A document as read: its name in the sources ("HANDOFF", "Scoutgaming › Ordlista"), its id, its text and its rules. */
export type Doc = {kalla: string; id: string; text: string; scout: boolean; dropHeadings?: RegExp; dropIntro?: boolean; prio?: (heading: string) => number | null};

// Balance in the dealer's documents is the film service's credit balance; in Scoutgaming's it is the player's game balance.
const BALANCE = /(?<![\p{L}])(?:saldo\w*|balans\w*|balance\w*)(?![\p{L}])/iu;
const MONEY = /(?<![\p{L}])(?:faktur\w*|avgift\w*|spend\w*|usage)(?![\p{L}])/iu;
const TRAILER = /trailer|reklamfilm/i;
const PASSWORD = /lösenord|password|passwd|(?<![\p{L}])l[oö]sen(?![\p{L}])/iu;
const IDS = [/\b(?:prj|store|team|dpl|icfg|oac|org|ws|proj|env)_[A-Za-z0-9]{6,}/, /\bID\b[^.|\n]{0,12}\d{5,}/, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, /workspace[^.|\n]{0,40}\b\d{6,}\b/i];
const ENV = /process\.env|(?<![\w/])\.env(?:\.local)?\b|\b(?:[A-Z][A-Z0-9]*_)+(?:URL|KEY|TOKEN|SECRET|PASSWORD|ENABLED|ROOT|LOSEN|NYCKEL|KAKNYCKEL)\b|\b(?:VERCEL|BLOB|NEON|RENDER|OPENAI|RUNWAY|DATABASE|AWS|SCOUTGAMING|DEALER|NEXT_PUBLIC|BOT|GITHUB|POSTGRES|PG)_[A-Z0-9_]{2,}\b/;
const URL_ANY = /\bhttps?:\/\/[^\s)`>\]]+|\bgit@[\w.-]+:/g;
const URL_OK = /^https?:\/\/(?:www\.)?scoutgaming\.tech(?:\/|$)/;

// ── Paths of this machine, in every form the documents write them ──────────
// The start of a path: a drive (C:/, D:\, c:\\, also after a non-ASCII letter's word boundary), a share or a long path
// (\\server\share, \\?\C:\, \\wsl$\…), a Git Bash drive (/c/Users, /d/dealer-scratch), a home or system folder (/Users/,
// /home/, /tmp/, ~/, ~\), and a folder named by a variable (%USERPROFILE%\, $HOME/, $env:TEMP\). PRIVATE_PATH of
// tools/studio-freeze.ts (the copy's own check) is tested beside these, so nothing it finds is ever let through here.
const PATH_START = String.raw`(?:(?<![\p{L}\p{N}_])[A-Za-z]:[\\/]+(?=[\p{L}\p{N}_.~$%-])|\\\\[?.]\\|\\\\[\p{L}\p{N}][\p{L}\p{N}._$-]*\\(?=[\p{L}\p{N}._$-])|(?<![\p{L}\p{N}_.~/-])\/[A-Za-z]\/(?=[\p{L}\p{N}_.-])|(?<![\p{L}\p{N}_.])\/(?:Users|home|mnt|tmp|var|private|root|opt)\/|(?<![\p{L}\p{N}_.~])~[\\/](?=[\p{L}\p{N}_.-])|%[A-Za-z_]+%[\\/]|\$(?:HOME|TEMP|TMP|USERPROFILE|env:[A-Za-z_]+)[\\/])`;
// The rest of a path: up to a space, a quote, a bracket, a back-tick, a pipe or an emphasis mark; across a space only when
// the next word is itself a piece of a path (C:\Users\Jakob Eberg\Desktop).
const PATH_CHAR = String.raw`[^\s"'()<>,;|\x60*\[\]{}]`;
const LOCAL_PATH = new RegExp(String.raw`${PATH_START}${PATH_CHAR}*(?: (?=${PATH_CHAR}*[\\/])${PATH_CHAR}+)*`, 'gu');
/** A path of this machine in a text, in any of the forms above or as the copy's own check sees one. */
export const hasLocalPath = (text: string): boolean => new RegExp(LOCAL_PATH.source, 'u').test(text) || new RegExp(PRIVATE_PATH.source).test(text);
/** Every path of this machine replaced by the token; a full stop or colon that ends the sentence stays. */
export function replacePaths(text: string, onEach: () => void = () => {}): string {
  const token = (m: string) => { onEach(); const end = /[.:]+$/.exec(m)?.[0] ?? ''; return LOCAL + end; };
  return text
    // An autolink of a path (<D:/x>, <file:///C:/x>) goes whole, brackets and all.
    .replace(/<(?:file:\/\/\/?)?(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])[^<>\s]*>/g, token)
    .replace(/\bfile:\/\/\/?(?=[A-Za-z]:[\\/]|\/)/g, '')
    .replace(new RegExp(LOCAL_PATH.source, 'gu'), token)
    .replace(new RegExp(PRIVATE_PATH.source, 'g'), token);
}

export type Rule = 'kostnad' | 'spärrat namn' | 'reklamfilm' | 'lösenord' | 'id' | 'miljövariabel' | 'adress' | 'lokal sökväg';
/** The rule a piece of text breaks, or null. scout: Scoutgaming's own words (a game balance is no cost there). */
export function breaks(text: string, release: Blocked, scout: boolean): Rule | null {
  if (COST.test(text) || MONEY.test(text) || (!scout && BALANCE.test(text))) return 'kostnad';
  if (blockedName(text, release)) return 'spärrat namn';
  if (TRAILER.test(text)) return 'reklamfilm';
  if (PASSWORD.test(text)) return 'lösenord';
  if (IDS.some(re => re.test(text))) return 'id';
  if (ENV.test(text)) return 'miljövariabel';
  for (const m of text.matchAll(new RegExp(URL_ANY.source, 'g'))) if (!URL_OK.test(m[0])) return 'adress';
  if (hasLocalPath(text)) return 'lokal sökväg';
  return null;
}

export type Removed = Partial<Record<Rule | 'kodblock' | 'avsnitt' | 'sökväg ersatt', number>>;
const count = (removed: Removed, rule: keyof Removed, n = 1) => { removed[rule] = (removed[rule] ?? 0) + n; };

/** What is rewritten rather than removed: markdown links keep their words, lab addresses become the copy's, paths a token. */
export function rewrite(text: string, removed: Removed = {}): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(\s*https?:\/\/(?:127\.0\.0\.1|localhost):4319(\/studio\/[^)\s]*)\s*\)/g, '$1 ($2)')
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
    .replace(/\bhttps?:\/\/(?:127\.0\.0\.1|localhost):4319(\/studio\/[^\s)`>\]]*)/g, '$1')
    .replace(/\bhttps?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?[^\s)`>\]]*/g, '‹labbet›')
    .replace(/^[\s\S]*$/, all => replacePaths(all, () => count(removed, 'sökväg ersatt')));
}

/** One line (a paragraph, a list item or a table row) with every bad sentence, parenthesis or row taken out; null if nothing is left. */
export function cleanLine(line: string, release: Blocked, scout: boolean, removed: Removed): string | null {
  if (/^\s*\|/.test(line)) {
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return line;
    const row = rewrite(line, removed), rule = breaks(row, release, scout);
    if (rule) { count(removed, rule); return null; }
    return row;
  }
  const prefix = /^(\s*(?:[-*+]|\d+[.)])\s+|\s*>\s?)?/.exec(line)?.[0] ?? '';
  let rest = rewrite(line.slice(prefix.length), removed);
  rest = rest.replace(/\s*\([^()]*\)/g, group => { const rule = breaks(group, release, scout); if (rule) { count(removed, rule); return ''; } return group; });
  const kept: string[] = [];
  for (const sentence of rest.split(/(?<=[.!?])\s+/)) {
    const rule = breaks(sentence, release, scout);
    if (rule) count(removed, rule); else if (sentence.trim()) kept.push(sentence);
  }
  const text = kept.join(' ').trim();
  return text && !/^[*_`\s:–-]*$/.test(text) ? prefix + text : null;
}

/** Lines of markdown with hard-wrapped paragraphs and list items joined back into one line each; code blocks and comments out. */
export function unwrap(text: string, removed: Removed): string[] {
  const out: string[] = [];
  let fence = false, comment = false;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    if (comment) { if (raw.includes('-->')) comment = false; continue; }
    if (/^\s*<!--/.test(raw)) { if (!raw.includes('-->')) comment = true; continue; }
    if (/^\s*(?:```|~~~)/.test(raw)) { if (!fence) count(removed, 'kodblock'); fence = !fence; continue; }
    if (fence) continue;
    const line = raw.replace(/\s+$/, ''), prev = out.at(-1);
    const starts = /^\s*(?:[-*+]\s|\d+[.)]\s|#|\||>)/.test(line);
    if (line && !starts && prev && !/^\s*(?:#|\|)/.test(prev) && prev.trim()) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out;
}

export type Part = {heading: string; level: number; lines: string[]};
/** A document split at its headings of level 1–3; the text before the first heading belongs to the first part. */
export function splitHeadings(lines: string[]): Part[] {
  const parts: Part[] = [{heading: '', level: 0, lines: []}];
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) parts.push({heading: h[2].replace(/[*_`]/g, '').trim(), level: h[1].length, lines: []});
    else parts.at(-1)!.lines.push(line);
  }
  return parts;
}

export const slug = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'avsnitt';

/** A section text cut at blank lines (or, inside one long block, at lines) into parts of at most max characters. */
export function cut(text: string, max = PART_CHARS): string[] {
  if (text.length <= max) return [text];
  const blocks = text.split(/\n{2,}/).flatMap(b => b.length <= max ? [b] : b.split('\n'));
  const out: string[] = [];
  let current = '';
  for (const block of blocks) {
    const piece = block.length > max ? block.slice(0, max - 1) + '…' : block;
    if (current && current.length + piece.length + 2 > max) { out.push(current); current = ''; }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) out.push(current);
  return out;
}

export type Built = Section & {prio: number | null; tokens: number};

/** A document cleaned and split: one section per heading (cut in parts when long), each with its id, title and priority. */
export function cleanDoc(doc: Doc, release: Blocked): {sections: Built[]; removed: Removed} {
  const removed: Removed = {};
  const parts = splitHeadings(unwrap(doc.text, removed));
  const sections: Built[] = [], ids = new Set<string>();
  let h2 = '';
  parts.forEach((part, i) => {
    // A heading may name a path too ("Arkivet på D:/…"): it is rewritten like the text, and the section kept.
    const name = rewrite(part.heading, removed).trim();
    if (part.level === 1 || part.level === 2) h2 = part.level === 2 ? name : '';
    const heading = part.level === 0 || part.level === 1 ? 'Inledning' : part.level === 3 && h2 ? `${h2} › ${name}` : name;
    if ((part.level <= 1 && doc.dropIntro) || (doc.dropHeadings && doc.dropHeadings.test(part.level === 3 ? h2 : name)) || (part.level === 3 && doc.dropHeadings?.test(name))) { count(removed, 'avsnitt'); return; }
    // The heading as the title shows it, the parent's included: a section under a heading that breaks a rule goes with it.
    if (breaks(heading, release, doc.scout) || breaks(name, release, doc.scout)) { count(removed, 'avsnitt'); return; }
    const lines = part.lines.map(l => l.trim() ? cleanLine(l, release, doc.scout, removed) : '').filter((l): l is string => l !== null);
    const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 40 && i > 0) return;
    if (!text) return;
    const titel = `${doc.kalla} › ${heading}`, prio = doc.prio?.(heading) ?? null;
    const pieces = cut(text);
    pieces.forEach((piece, n) => {
      let id = `${doc.id}/${slug(heading)}${pieces.length > 1 ? `-${n + 1}` : ''}`;
      while (ids.has(id)) id += '-b';
      ids.add(id);
      sections.push({id, titel: pieces.length > 1 ? `${titel} (del ${n + 1})` : titel, text: piece, prio: n === 0 ? prio : prio === null ? null : prio + 0.5, tokens: roughTokens(piece)});
    });
  });
  return {sections, removed};
}

/** Any generated text through the same sentence rules (the bank's notes, proof descriptions, commit subjects). */
export function cleanPlain(text: string, release: Blocked, removed: Removed): string {
  return text.split('\n').map(l => l.trim() ? cleanLine(l, release, false, removed) : '').filter((l): l is string => l !== null).join('\n').trim();
}

// ── The clip bank as text ───────────────────────────────────────────────────
const short = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
/** A node in words, so that "plats 6" or "hålkortet" finds its films: READY → "A2.1 (nyp)", P6.C1 → "plats 6, kort 1". */
export function placeWords(node: string): string {
  const seat = /^P([1-7])\.C([1-3])$/.exec(node), dealer = /^D\.C([1-3])$/.exec(node);
  if (seat) return `plats ${seat[1]}, kort ${seat[2]}`;
  if (dealer) return `dealerns kort ${dealer[1]}${dealer[1] === '2' ? ' (hålkortet)' : ''}`;
  return ({IDLE: 'A1 (vila)', READY: 'A2.1 (nyp)', 'READY-B': 'A2.2 (hand över)', AWAY: 'borta från bordet', 'REVEAL(D.C2)': 'hålkortet vänt upp'} as Record<string, string>)[node] ?? node;
}
const verdictWord = (t: Take) => { const v = verdictOf(t); return `${v.label.toLowerCase()}${v.detail ? ` (${v.detail})` : ''}${v.byJakob ? ' av Jakob' : v.verdict === 'vantar' ? '' : ' av granskare'}`; };

/** The bank now, from buildGraph: a summary for the core, one row per film for the core, and one section per film to search. */
export function bankSections(graph: Graph, release: Blocked, removed: Removed): Built[] {
  const required = graph.summary.films.required.map(id => graph.edge[id]).filter(Boolean);
  const mainOf: Record<string, number> = {}, bestOf: Record<string, number> = {};
  for (const e of required) {
    const k = !e.main ? 'saknas' : verdictOf(e.main).verdict === 'godkand' && verdictOf(e.main).byJakob ? 'godkänd av Jakob rakt av' : verdictOf(e.main).verdict === 'primar' ? 'primär' : verdictOf(e.main).verdict === 'variant' ? 'bara variant' : verdictOf(e.main).verdict === 'vantar' ? 'väntar' : verdictOf(e.main).label.toLowerCase();
    mainOf[k] = (mainOf[k] ?? 0) + 1;
    const plain = e.takes.filter(t => !t.hub && t.stage === 'DONE' && t.decision !== 'REJECTED');
    const b = plain.some(t => t.decision === 'ACCEPTED' && !t.variant) ? 'rakt godkänd' : plain.some(t => t.variant) ? 'bara variant' : plain.some(t => t.decision === 'PENDING') ? 'väntar' : 'saknas';
    bestOf[b] = (bestOf[b] ?? 0) + 1;
  }
  const all = Object.values(graph.takes), byVerdict: Record<string, number> = {};
  for (const t of all) { const v = verdictOf(t).label.toLowerCase(); byVerdict[v] = (byVerdict[v] ?? 0) + 1; }
  const waiting = awaitingJakob(graph), forJakob = judgedForJakob(all), tally = (r: Record<string, number>) => Object.entries(r).map(([k, n]) => `${n} ${k}`).join(', ');
  const summary = [
    `Räknat med buildGraph på klippbanken som den var när kopian byggdes, i läget en film per plats (${graph.summary.films.mode === 'SEAT' ? 'platsens andra kort spelar första kortets filmer' : 'en film per kort'}).`,
    `- Huvudfilmer som en runda behöver: ${required.length}.`,
    `- Huvudtagningen, alltså det som spelas: ${tally(mainOf)}.`,
    `- Bästa tagning per steg i stället: ${tally(bestOf)}.`,
    `- Primära tagningar satta av Jakob: ${required.filter(e => e.takes.some(t => t.explicitMain)).length} av ${required.length}.`,
    `- Tagningar totalt: ${all.length} (${tally(byVerdict)}).`,
    `- Väntar på Jakobs ord: ${waiting.length}${waiting.length ? `: ${waiting.map(t => `${t.id} (${edgeName(t.edge)})`).join(', ')}` : ''}.`,
    // A verdict the main agent and a reviewer gave for him on his hand-over (tools/review-put.ts) does not wait for him.
    `- Dömda åt Jakob av huvudagenten och en granskare (väntar inte på honom, hans beslut ersätter domen; Granska, Alla, Dömda åt dig): ${forJakob.length}.`,
    `- Experimentsteg utanför modellen: ${graph.experiments.length}.`,
    // Jakob's words (2026-11-12): a "steg" is one move between two anchors; a film or a take is what plays there.
    'Ankare: A1 = vila (IDLE), A2.1 = nyp i skons fönster (READY), A2.2 = hand över kortet (READY-B). Ett steg är en rörelse mellan två ankare och skrivs till exempel A2.1 → P4C1 (READY>P4.C1); varje steg kan ha flera tagningar, och en av dem spelas. Syns i vyerna Karta och Primära.',
  ].join('\n');
  const rows = ['| Steg | Id | Spelas nu | Dom | Tagningar |', '| --- | --- | --- | --- | --- |'];
  const detail: Built[] = [];
  for (const e of [...graph.edges, ...graph.experiments]) {
    const names = takeNames(e.takes), n = (t: Take) => names.get(t.id) ?? t.id;
    const counts: Record<string, number> = {};
    for (const t of e.takes) { const v = verdictOf(t).label.toLowerCase(); counts[v] = (counts[v] ?? 0) + 1; }
    if (graph.summary.films.required.includes(e.id)) rows.push(`| ${edgeName(e)} | ${e.id} | ${e.main ? `${n(e.main)} (${e.main.id})` : 'ingen'} | ${e.main ? verdictWord(e.main) : 'saknas'} | ${tally(counts) || 'inga'} |`);
    if (!e.takes.length && !graph.summary.films.required.includes(e.id)) continue;
    const lines = [
      `Steget ${edgeName(e)} (${e.id}): från ${placeWords(e.from)} till ${placeWords(e.to)}${e.experiment ? ', experiment utanför modellen' : e.optional ? ', valfri' : ''}${e.shares ? `; spelar filmerna från ${edgeName(graph.edge[e.shares] ?? e.shares)}` : ''}.`,
      e.main ? `- Spelas nu: ${n(e.main)} (${e.main.id}), ${verdictWord(e.main)}.` : '- Ingen tagning kan spelas här: filmen saknas.',
    ];
    for (const t of e.takes) {
      const note = storedNote(t.motion?.review), limits = String(t.motion?.review?.limitations ?? '').trim();
      lines.push(`- ${n(t)} (${t.id}): ${verdictWord(t)}${note ? `. Jakob: "${short(note, 400)}"` : ''}${limits ? `. Brister enligt granskningen: ${short(limits, 300)}` : ''}.`);
    }
    const waitingHere = e.takes.filter(t => waiting.includes(t));
    if (waitingHere.length) lines.push(`- Väntar på Jakobs ord: ${waitingHere.map(n).join(', ')}.`);
    lines.push('Syns i vyn Karta (klicka på linjen) och i Primära.');
    const text = cleanPlain(lines.join('\n'), release, removed);
    if (text) detail.push({id: `banken/${slug(e.id)}`, titel: `Banken › ${edgeName(e)}`, text, prio: null, tokens: roughTokens(text)});
  }
  const table = rows.join('\n');
  return [
    {id: 'banken/lage', titel: 'Banken › Läget nu', text: cleanPlain(summary, release, removed), prio: 1, tokens: roughTokens(summary)},
    {id: 'banken/filmer', titel: 'Banken › Alla huvudfilmer', text: table, prio: 4, tokens: roughTokens(table)},
    ...detail,
  ];
}

// ── The proofs as text ──────────────────────────────────────────────────────
export function proofSections(proofs: readonly Proof[], onSite: ReadonlySet<string>, release: Blocked, removed: Removed): Built[] {
  const list: string[] = [], detail: Built[] = [];
  for (const p of proofs) {
    // A proof that names a blocked person anywhere, or is a trailer, is left out whole.
    if (TRAILER.test(`${p.id} ${p.title ?? ''}`) || blockedName(JSON.stringify(p), release)) { count(removed, 'avsnitt'); continue; }
    const title = cleanPlain(p.title?.trim() || p.id, release, removed) || p.id;
    const tally: Partial<Record<ProofVerdict, number>> = {};
    for (const f of p.files) { const v = proofVerdict(p, f.name) ?? 'unreviewed'; tally[v] = (tally[v] ?? 0) + 1; }
    const verdicts = Object.entries(tally).map(([v, n]) => `${n} ${PROOF_VERDICT_LABEL[v as ProofVerdict].toLowerCase()}`).join(', ');
    const films = p.files.filter(f => f.kind === 'video').length, pictures = p.files.length - films;
    const description = cleanPlain(p.description ?? '', release, removed);
    list.push(`- ${title} (${p.id}): ${films} filmer, ${pictures} bilder; ${verdicts || 'inga domar'}; ${onSite.has(p.id) ? 'finns i kopian' : 'finns inte i kopian'}.${description ? ` ${short(description.split(/(?<=[.!?])\s+/)[0] ?? '', 180)}` : ''}`);
    const files = p.files.slice(0, 24).map(f => {
      const label = cleanPlain(p.labels?.[f.name] ?? '', release, removed), v = proofVerdict(p, f.name);
      return `- ${f.name}${label ? `: ${short(label, 220)}` : ''}${v ? ` (${PROOF_VERDICT_LABEL[v].toLowerCase()})` : ''}`;
    });
    const text = [`Provet ${title} (${p.id}), ${onSite.has(p.id) ? 'finns i kopian under vyn Prov' : 'finns bara i Jakobs labb, inte i kopian'}.`, short(description, 1500), ...files].filter(Boolean).join('\n');
    detail.push({id: `prov/${slug(p.id)}`, titel: `Prov › ${title}`, text, prio: null, tokens: roughTokens(text)});
  }
  const text = ['Alla prov (jämförelsefilmer och bilder från arbetet), med domar per fil och om provet finns i kopian (vyn Prov):', ...list].join('\n');
  return [{id: 'prov/lista', titel: 'Prov › Alla prov', text, prio: 5, tokens: roughTokens(text)}, ...detail];
}

// ── The studio's views ──────────────────────────────────────────────────────
/** Five lines of the builder's own about each view, used when studio/lib/guide.ts gives none. */
export const OWN_VIEWS: {namn: string; adress: string; text: string}[] = [
  {namn: 'Scen', adress: '/studio/', text: 'Spelar en runda i 3D-scenen eller som vanliga filmer, och ändrar rum, ljus, bord, kort och kamera med förval. Rundan skrivs med Jakobs ord, till exempel A1 - A2.1 - P4C1 - A1.'},
  {namn: 'Karta', adress: '/studio/karta/', text: 'Nodkartan: ankarna (A1 vila, A2.1 nyp, A2.2 hand över) och kortplatserna, med en linje per steg. Klicka på en linje för stegets tagningar och domar.'},
  {namn: 'Primära', adress: '/studio/primara/', text: 'En rad per steg i rundan: vad som spelas nu mot bästa tagning Jakob godkänt. Jakob väljer själv en primär tagning per steg.'},
  {namn: 'Jämför', adress: '/studio/jamfor/', text: 'Två tagningar sida vid sida på samma ruta, eller på samma plats, med beslutet för kandidaten under.'},
  {namn: 'Granska', adress: '/studio/granska/', text: 'Tagningar som väntar på Jakobs dom, en i taget. I kopian sparas inga beslut.'},
  {namn: 'Prov', adress: '/studio/prov/', text: 'Prov från arbetet, nyast först: filmer och bilder med en dom per fil.'},
];
export type ViewText = {namn: string; adress: string; text: string};
export function viewSection(views: readonly ViewText[], words: readonly {ord: string; betyder: string}[], release: Blocked, removed: Removed): Built {
  const text = cleanPlain([
    'Studion har en vy per uppgift; kopian är skrivskyddad, så inget beslut sparas där.',
    ...views.map(v => `- ${v.namn}${v.adress ? ` (${v.adress})` : ''}: ${v.text}`),
    ...(words.length ? ['Orden i studion:', ...words.map(w => `- ${w.ord}: ${w.betyder}`)] : []),
  ].join('\n'), release, removed);
  return {id: 'studion/vyer', titel: 'Studion › Vyerna', text, prio: 2, tokens: roughTokens(text)};
}

/** The last commit subjects, as what changed most recently. */
export function commitSection(subjects: string[], release: Blocked, removed: Removed): Built {
  const text = cleanPlain(['De senaste ändringarna i dealerprojektets kod, nyast först (rubriker ur Git):', ...subjects.map(s => `- ${s}`)].join('\n'), release, removed);
  return {id: 'git/senaste', titel: 'Git › Senaste ändringarna', text, prio: 7, tokens: roughTokens(text)};
}

// ── The core and the rest ───────────────────────────────────────────────────
/** The sections with a priority, best first, go to the core while it stays within budget; everything else is searched. */
export function assemble(sections: Built[], kallor: string[], byggd: string, budget = CORE_TOKENS): Knowledge & {karnaTokens: number; avsnittTokens: number} {
  const ids = new Set<string>();
  for (const s of sections) { if (ids.has(s.id)) throw Error(`Avsnittet ${s.id} finns två gånger.`); ids.add(s.id); }
  const ranked = sections.map((s, i) => ({s, i})).filter(x => x.s.prio !== null).sort((a, b) => a.s.prio! - b.s.prio! || a.i - b.i);
  const karna: Built[] = [];
  let used = 0;
  for (const {s} of ranked) if (used + s.tokens <= budget) { karna.push(s); used += s.tokens; }
  const inCore = new Set(karna.map(s => s.id));
  const avsnitt = sections.filter(s => !inCore.has(s.id));
  const bare = (s: Built): Section => ({id: s.id, titel: s.titel, text: s.text});
  // The core in the order of the sources, not of its priorities: it reads as the documents do.
  const core = sections.filter(s => inCore.has(s.id)).map(bare);
  return {schemaVersion: 1, byggd, kallor, karna: core, avsnitt: avsnitt.map(bare), karnaTokens: used, avsnittTokens: avsnitt.reduce((n, s) => n + s.tokens, 0)};
}

/**
 * The last scan, over everything the bot will carry: a cost, a blocked name, the trailers, a password, an id, an environment
 * variable, an address of a service, a path of this machine, or a token pattern of tools/publication-check.ts. Empty when
 * clean; the build stops on any finding.
 */
export function scanLeaks(knowledge: Knowledge, release: Blocked): string[] {
  const out: string[] = [];
  for (const s of [...knowledge.karna, ...knowledge.avsnitt]) {
    const scout = s.id.startsWith('scout');
    for (const line of `${s.titel}\n${s.text}`.split('\n')) {
      const rule = breaks(line, release, scout);
      if (rule) out.push(`${s.id}: ${rule}: ${line.slice(0, 80)}`);
    }
  }
  for (const f of inspectBlob('bot-knowledge.json', Buffer.from(JSON.stringify(knowledge)))) if (f.level === 'RED') out.push(`kunskapen: ${f.message}`);
  return out;
}

/**
 * The snapshot build's own check of the knowledge it ships (tools/build-studio-snapshot.ts, bot-knowledge.js): the last
 * scan, and every string of it (ids, sources and dates too) through the copy's text check (findTextLeaks). The strings are
 * checked as the bot reads them, decoded: in the module's JSON a line break is the two characters "\n", so "mål:" at the
 * end of a line reads as the drive path "l:\n…", and a real C:\Users\… hides behind its doubled backslash. Each finding
 * says where it is.
 */
export function knowledgeLeaks(knowledge: Knowledge, release: Blocked, textLeaks: (text: string) => string[]): string[] {
  const out = scanLeaks(knowledge, release);
  const strings: {at: string; text: string}[] = [{at: 'byggd', text: knowledge.byggd}, ...knowledge.kallor.map((text, i) => ({at: `kallor[${i}]`, text}))];
  for (const s of [...knowledge.karna, ...knowledge.avsnitt]) strings.push({at: `${s.id} (id)`, text: s.id}, ...`${s.titel}\n${s.text}`.split('\n').map(text => ({at: s.id, text})));
  for (const {at, text} of strings) for (const rule of textLeaks(text)) out.push(`${at}: ${rule}: ${text.slice(0, 80)}`);
  return out;
}

/** The sources' rules: which headings never go in, and which sections are core (lower is earlier). */
export const DEALER_DOCS = {
  HANDOFF: {drop: /^(?:Före avslut av en session)$/, core: ['Målet', 'Ankarmodellen', 'Läget i banken', 'Öppet hos Jakob', 'Nästa steg', 'Jakobs besked som gäller', 'Andra dealern (Paow)', 'Referenser: V6, plats 4 och Pamela-filmen', 'Kända brister', 'Vem äger vad']},
  README: {drop: /^(?:Kör lokalt)$/, core: ['Inledning']},
  SYSTEM: {drop: null as RegExp | null, core: ['Ordlista och gräns mot Scout', 'Klippbank och nodnotation', 'Återbruk och införande']},
  DRIFT: {drop: /^(?:Identitet och ansvar|Anslutningar och miljö|Publik granskningssida och Blob|Molnmiljö|D: och städning|Headless Chrome och verktyg på D:)$/, core: [] as string[]},
  CHECKLISTA: {drop: null as RegExp | null, core: ['*']},
};
export const SCOUT_DROP = /drift|infrastruktur|miljö|environment|incident|getting started|repository map|deploy|hemlig|secret|^struktur$|^underhåll$|regel- och undantagsfiler|^fynd$|^kretslopp$|^mergat|^öppna pr|studio-workern/i;
export const SCOUT_CORE: Record<string, string[]> = {
  'Scoutgaming › README': ['Inledning', 'Surfaces'],
  'Scoutgaming › Dokument': ['Översikt per yta', 'Läge och arbete'],
  'Scoutgaming › Blackjack': ['Regler'],
  'Scoutgaming › Dealerbank': ['*'],
  'Scoutgaming › Signaler': ['Var signalen finns', 'Vad som skickas'],
  'Scoutgaming › Ordlista': ['Ytor', '4. Dealer'],
  'Scoutgaming › Nästa agent': ['Väntar på Jakob', 'Dealers i produktion 7 november'],
};
/** A priority function from a list of core headings ("*": every heading), starting at base. */
export const prioFrom = (core: string[], base: number) => (heading: string): number | null => {
  if (core.includes('*')) return base;
  // A heading may carry a date or a note after the name ("Läget i banken (räknat 2026-11-12)").
  const at = core.findIndex(name => heading === name || heading.startsWith(`${name} (`));
  return at < 0 ? null : base + at / 100;
};
