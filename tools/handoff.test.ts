// The hand-over (HANDOFF.md) is a start page, not an archive: a new session reads AGENTS.md, this one page and ONE lane
// file (docs/lage/<bana>.md), and can start. Until 2026-11-18 the file was an archive that grew back within hours of
// every cleaning (reviewed that night at 796 lines and 12 353 words: it no longer fit in one reading, and what fell off
// the end was Jakob's standing decisions and the known defects). So each thing now stands in one place, and this test
// holds the cap so that the page cannot grow back:
//   HANDOFF.md              at most 120 lines and 900 words, six fixed sections, the main agent's address on one line
//   docs/BESKED.md          Jakob's standing decisions, looked up by topic (may be long)
//   docs/BRISTER.md         the known defects (may be long)
//   docs/lage/<bana>.md     one lane's state in a fixed form of five labelled parts, at most 60 lines and 800 words
// What happened and why stands in commit messages only, so no heading carries a date or a clock time (a dated heading is
// a diary entry). What waits for Jakob stands only as cards in Beslut (data/decisions.json), not in these pages.
// A test that goes red here is answered by moving text to where it belongs, never by raising a number.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const HANDOFF_LINES = 120;
export const HANDOFF_WORDS = 900;
export const LANE_LINES = 60;
/** Words too: a cap on lines alone is kept by writing longer lines, as the documents once did (docs/DRIFT.md). */
export const LANE_WORDS = 800;
/** HANDOFF's sections, in this order and no others. */
export const SECTIONS = ['Läget', 'Nästa steg', 'Vem äger vad', 'Väntar på Jakob', 'Läs för ditt ämne', 'Före avslut'];
/** A lane file's five parts, each a line that begins with the label in bold ("**Läget.**"), in this order. */
export const LABELS = ['Läget', 'Nästa steg', 'Väntar på Jakob', 'Var saker ligger', 'Fällor'];
/** The lanes that must have a state file; another file in docs/lage/ is held to the same form. */
export const LANES = ['film', 'kort', 'labbet-och-studion', 'spelet'];
const LANE_FOLDER = 'docs/lage';

const exists = (rel: string) => existsSync(path.join(root, rel));
/** A file's text with \n line ends; a missing file fails with its name and what it is. */
function read(rel: string): string {
  assert.ok(exists(rel), `${rel}: the file does not exist (the hand-over system names it; see the head of tools/handoff.test.ts)`);
  return readFileSync(path.join(root, rel), 'utf8').replaceAll('\r\n', '\n');
}
/** Lines as `wc -l` counts them for a file that ends with a line break, and words as `wc -w` does. */
const lines = (text: string) => text.replace(/\n$/, '').split('\n');
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
/** Headings of any level, outside fenced code. */
function headings(text: string): {level: number; title: string; line: number}[] {
  const out: {level: number; title: string; line: number}[] = []; let fenced = false;
  lines(text).forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    const m = fenced ? null : /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (m) out.push({level: m[1].length, title: m[2], line: i + 1});
  });
  return out;
}
/** The lane files that exist, as repo paths. */
const laneFiles = () => exists(LANE_FOLDER)
  ? readdirSync(path.join(root, LANE_FOLDER)).filter(f => f.endsWith('.md')).sort().map(f => `${LANE_FOLDER}/${f}`)
  : [];
/** The pages of the hand-over system: the start page, the two lists and every lane file. */
const pages = () => ['HANDOFF.md', 'docs/BESKED.md', 'docs/BRISTER.md', ...laneFiles()];
/** The relative links of a page ([text](target)): not an address with a scheme, not an anchor of the page itself. */
function links(text: string): string[] {
  const out: string[] = [];
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    out.push(decodeURIComponent(target.replace(/#.*$/, '')));
  }
  return out;
}
/** A link's target as a repo path, resolved from the folder of the page that links. */
const resolved = (page: string, target: string) => path.relative(root, path.resolve(root, path.dirname(page), target)).replaceAll('\\', '/');
/** The text of one "## " section of HANDOFF, without its heading. */
function section(text: string, title: string): string {
  const all = lines(text), from = all.indexOf(`## ${title}`);
  assert.ok(from >= 0, `HANDOFF.md: the section "## ${title}" is missing`);
  const rest = all.slice(from + 1), to = rest.findIndex(line => /^##\s/.test(line));
  return (to < 0 ? rest : rest.slice(0, to)).join('\n');
}

test('HANDOFF.md is one page: at most 120 lines and 900 words', () => {
  const text = read('HANDOFF.md');
  const l = lines(text).length, w = words(text);
  assert.ok(l <= HANDOFF_LINES, `HANDOFF.md has ${l} lines, at most ${HANDOFF_LINES}: move state to the lane file (docs/lage/), his decisions to docs/BESKED.md, defects to docs/BRISTER.md, and what happened to the commit message`);
  assert.ok(w <= HANDOFF_WORDS, `HANDOFF.md has ${w} words, at most ${HANDOFF_WORDS}: move state to the lane file (docs/lage/), his decisions to docs/BESKED.md, defects to docs/BRISTER.md, and what happened to the commit message`);
});

test('HANDOFF.md has its six sections in order, and no others', () => {
  const found = headings(read('HANDOFF.md'));
  assert.deepEqual(found.filter(h => h.level === 2).map(h => h.title), SECTIONS, 'HANDOFF.md: the "## " headings');
  assert.equal(found.filter(h => h.level === 1).length, 1, 'HANDOFF.md: one title');
});

test('no heading carries a date or a clock time: what happened stands in the commit message', () => {
  const dated: string[] = [];
  for (const page of pages()) for (const h of headings(read(page))) {
    if (/\d{4}-\d{2}-\d{2}/.test(h.title) || /\bkl\.?\s*\d{1,2}\b/i.test(h.title) || /(?<![\d.,])(?:[01]?\d|2[0-3])[.:][0-5]\d(?![\d.,]?\d)/.test(h.title)) dated.push(`${page}:${h.line}: ${h.title}`);
  }
  assert.deepEqual(dated, []);
});

test('the main agent\'s address stands on one line, under "Vem äger vad"', () => {
  const text = read('HANDOFF.md');
  const address = /^- \*\*Huvudagentens adress: `[a-z0-9-]+`\.\*\*/;
  assert.equal(lines(text).filter(line => address.test(line)).length, 1, 'HANDOFF.md: exactly one line that begins "- **Huvudagentens adress: `<adress>`.**"');
  assert.equal(lines(section(text, 'Vem äger vad')).filter(line => address.test(line)).length, 1, 'HANDOFF.md: the address line stands under "## Vem äger vad"');
});

test('every lane has its state file, in the fixed form of five parts, at most 60 lines and 800 words', () => {
  const problems: string[] = [];
  for (const lane of LANES) if (!exists(`${LANE_FOLDER}/${lane}.md`)) problems.push(`${LANE_FOLDER}/${lane}.md: the file does not exist`);
  for (const file of laneFiles()) {
    const all = lines(read(file));
    if (all.length > LANE_LINES) problems.push(`${file}: ${all.length} lines, at most ${LANE_LINES} (one screen)`);
    const w = words(all.join('\n'));
    if (w > LANE_WORDS) problems.push(`${file}: ${w} words, at most ${LANE_WORDS}: say each thing once, and link to docs/BESKED.md, docs/BRISTER.md or a handbook instead of repeating them`);
    const bold = all.filter(line => line.startsWith('**'));
    const labels = bold.map(line => /^\*\*([^*]+?)[.:]?\*\*/.exec(line)?.[1] ?? line);
    if (JSON.stringify(labels) !== JSON.stringify(LABELS)) problems.push(`${file}: the lines that begin with ** are [${labels.join(' | ')}], and must be exactly [${LABELS.join(' | ')}] in that order`);
    if (headings(all.join('\n')).filter(h => h.level === 1).length !== 1) problems.push(`${file}: one "# " title`);
  }
  assert.deepEqual(problems, []);
});

test('every relative link in the hand-over pages leads to a file that exists', () => {
  const missing: string[] = [];
  for (const page of pages()) for (const target of links(read(page))) {
    const file = resolved(page, target);
    if (file.startsWith('..') || !exists(file)) missing.push(`${page}: ${target}`);
  }
  assert.deepEqual(missing, []);
});

test('HANDOFF.md links the decisions, the defects and every lane file under "Läs för ditt ämne"', () => {
  const linked = links(section(read('HANDOFF.md'), 'Läs för ditt ämne')).map(target => resolved('HANDOFF.md', target));
  const wanted = ['docs/BESKED.md', 'docs/BRISTER.md', ...new Set([...LANES.map(lane => `${LANE_FOLDER}/${lane}.md`), ...laneFiles()])];
  assert.deepEqual(wanted.filter(file => !linked.includes(file)), [], 'HANDOFF.md, "Läs för ditt ämne": pages without a link');
});
