// The Casino's default against the game's own look. The studio's Casino plays game.html in a frame with the preset basgrund
// when its address names none (studio/lib/casino.ts, studio/lib/scene-presets.ts BASE), and game.html then lays the preset's
// whole look over the scene's DEFAULTS (src/game-look.ts lookState). Opened on its own, game.html sets its own look instead
// (src/game-page.ts). basgrund is a copy of that look, said in words in studio/lib/scene-presets.ts GAME; nothing held the two
// together, so a change to the game's framing would have made the Casino and the game differ without anyone deciding it. Read
// from the files as they stand; no media, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULTS} from '../src/scene3d-view.ts';
import {lookState, presetFrom} from '../src/game-look.ts';
import {CASINO_TABLE, casinoSearch, gameSrc, readCasino} from '../studio/lib/casino.ts';
import {BASE, CASINO_PRESET, SHIPPED} from '../studio/lib/scene-presets.ts';

const page = readFileSync('src/game-page.ts', 'utf8');
const rooms = JSON.parse(readFileSync('data/scene-rooms.json', 'utf8')).rooms as {id: string; blur?: number}[];
const basgrund = JSON.parse(readFileSync(`data/scene-presets/${BASE}.json`, 'utf8'));

/** What game.html sets on the scene by itself, read from its code: the framing, the first room and its blur, and the rest of its one scene.set. */
function gameOwn() {
  const framing = /const FRAMING = \{wide: \{pitch: (-?[\d.]+), zoom: ([\d.]+)\}/.exec(page);
  assert.ok(framing, 'FRAMING.wide was not found in src/game-page.ts');
  const room = /let room = ROOMS\.find\(r => r\.id === \(asked\.room \?\? query\.get\('room'\) \?\? remembered\)\)\?\.id \?\? '([a-z0-9-]+)';/.exec(page)?.[1];
  assert.ok(room, 'the game\'s first room was not found in src/game-page.ts');
  const set = /scene\.set\(\{format: '([a-z]+)', room: room as never, blur: ROOMS\.find\(r => r\.id === room\)!\.blur, tray: (true|false), cards: (true|false), pitch: Number\(query\.get\('pitch'\) \?\? FRAMING\.wide\.pitch\), zoom: Number\(query\.get\('zoom'\) \?\? FRAMING\.wide\.zoom\)\}\);/.exec(page);
  assert.ok(set, 'the game\'s own scene.set was not found in src/game-page.ts');
  assert.match(page, /else scene\.set\(\{roomShift: 'shimmer', room: id, blur: next\.blur\} as never\);/, 'the game changes rooms with the shimmer');
  const blur = rooms.find(r => r.id === room)?.blur;
  assert.equal(typeof blur, 'number', `the room ${room} has no blur in data/scene-rooms.json`);
  return {format: set[1], room, blur, tray: set[2] === 'true', cards: set[3] === 'true', pitch: Number(framing[1]), zoom: Number(framing[2]), roomShift: 'shimmer'};
}

test('the Casino\'s default preset is the game\'s own look: basgrund holds exactly what game.html sets by itself', () => {
  const own = gameOwn();
  assert.deepEqual({...basgrund.state}, own, 'data/scene-presets/basgrund.json and src/game-page.ts part');
  assert.deepEqual(SHIPPED.find(p => p.name === BASE)?.state, basgrund.state, 'the shipped copy in studio/lib/scene-presets.ts');
  // game.html in the Casino: the scene's DEFAULTS with basgrund over them; on its own: DEFAULTS with its own settings. The same.
  const casino = lookState(DEFAULTS, presetFrom({preset: {state: basgrund.state}})!.state, {}, () => 11);
  assert.deepEqual(casino, {...DEFAULTS, ...own});
});

test('the Casino opens on its editable saved look, its own table and the rail\'s dealer', () => {
  const look = readCasino(new URLSearchParams(''));
  assert.equal(look.forval, CASINO_PRESET);
  assert.deepEqual(look.patch, {});
  assert.equal(look.table, CASINO_TABLE);
  const src = new URL(gameSrc(look), 'http://lab');
  assert.equal(src.pathname, '/game.html');
  assert.equal(src.searchParams.get('forval'), CASINO_PRESET);
  assert.equal(src.searchParams.get('inbaddad'), '1');
  assert.equal(src.searchParams.get('table'), CASINO_TABLE);
  assert.deepEqual([...src.searchParams.keys()].sort(), ['forval', 'inbaddad', 'table'], 'no key of an experiment rides along by default');
  assert.match(readFileSync('studio/components/casino/CasinoView.tsx', 'utf8'), /const src = `\$\{gameSrc\(look\)\}&\$\{new URLSearchParams\(\{ \[DEALER_PARAM\]: dealer \}\)\}`;/, 'the rail\'s dealer is passed on');
});

test('the Casino carries the geometry word on to the game in the frame, and keeps it in its own address', () => {
  const look = readCasino(new URLSearchParams('geometri=lins&table=prov'));
  assert.equal(look.geometri, 'lins'); assert.deepEqual(look.ignored, [], 'the word is the page\'s own, not a look key that failed');
  const src = new URL(gameSrc(look), 'http://lab');
  assert.equal(src.searchParams.get('geometri'), 'lins'); assert.equal(src.searchParams.get('table'), 'prov');
  assert.equal(new URLSearchParams(casinoSearch(look)).get('geometri'), 'lins');
  const other = readCasino(new URLSearchParams('geometri=annat'));
  assert.equal(other.geometri, undefined, 'only the words the game page knows'); assert.equal(new URL(gameSrc(other), 'http://lab').searchParams.has('geometri'), false);
});

test('Bordet\'s Scen starts from the same preset as the Casino when its address names no look', () => {
  assert.match(readFileSync('studio/components/bordet/SceneBody.tsx', 'utf8'), /: new URLSearchParams\(\{ forval: CASINO_PRESET \}\)\);/);
});
