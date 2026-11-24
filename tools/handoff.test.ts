// The hand-over (HANDOFF.md) is a start page, not an archive: a new session reads AGENTS.md, this one page and ONE lane
// file (docs/lage/<bana>.md), and can start (Jakob 2026-11-18: a hand-over is to be normal, and the long reading-in is
// not to be done again). Until that night the file was an archive that grew back within hours of every cleaning, so
// this test holds the caps, and only the caps:
//   HANDOFF.md              at most 120 lines and 900 words
//   docs/lage/<bana>.md     at most 60 lines and 800 words
//   the three start files   together under 3 500 words (AGENTS.md, HANDOFF.md and the longest lane file)
// and that the links of the hand-over pages lead somewhere. The numbers are the ones AGENTS.md names ("Läs först", "Var
// kunskap står"); AGENTS.md has no cap of its own. How the pages are laid out is the writer's choice. A test that goes red
// here is answered by moving text to where it belongs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const HANDOFF_LINES = 120;
export const HANDOFF_WORDS = 900;
export const LANE_LINES = 60;
export const START_WORDS = 3500;
/** Words too: a cap on lines alone is kept by writing longer lines, as the documents once did (docs/DRIFT.md). */
export const LANE_WORDS = 800;
const LANE_FOLDER = 'docs/lage';

const exists = (rel: string) => existsSync(path.join(root, rel));
/** A file's text with \n line ends; a missing file fails with its name. */
function read(rel: string): string {
  assert.ok(exists(rel), `${rel}: the file does not exist`);
  return readFileSync(path.join(root, rel), 'utf8').replaceAll('\r\n', '\n');
}
/** Lines as `wc -l` counts them for a file that ends with a line break, and words as `wc -w` does. */
const lines = (text: string) => text.replace(/\n$/, '').split('\n');
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
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

test('HANDOFF.md is one page: at most 120 lines and 900 words', () => {
  const text = read('HANDOFF.md');
  const l = lines(text).length, w = words(text);
  assert.ok(l <= HANDOFF_LINES, `HANDOFF.md has ${l} lines, at most ${HANDOFF_LINES}: move state to the lane file (docs/lage/), his decisions to docs/BESKED.md, defects to docs/BRISTER.md, and what happened to the commit message`);
  assert.ok(w <= HANDOFF_WORDS, `HANDOFF.md has ${w} words, at most ${HANDOFF_WORDS}: move state to the lane file (docs/lage/), his decisions to docs/BESKED.md, defects to docs/BRISTER.md, and what happened to the commit message`);
});

test('every lane file is at most 60 lines and 800 words', () => {
  const problems: string[] = [];
  for (const file of laneFiles()) {
    const text = read(file), l = lines(text).length, w = words(text);
    if (l > LANE_LINES) problems.push(`${file}: ${l} lines, at most ${LANE_LINES} (one screen)`);
    if (w > LANE_WORDS) problems.push(`${file}: ${w} words, at most ${LANE_WORDS}: say each thing once, and link to docs/BESKED.md, docs/BRISTER.md or a handbook instead of repeating them`);
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

test('the start reading is under 3 500 words: AGENTS.md, HANDOFF.md and the longest lane file', () => {
  const agents = read('AGENTS.md');
  const longest = Math.max(0, ...laneFiles().map(file => words(read(file))));
  const start = words(agents) + words(read('HANDOFF.md')) + longest;
  assert.ok(start <= START_WORDS, `the three start files have ${start} words together, at most ${START_WORDS}`);
});
