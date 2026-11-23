// The Casino's looks against the game's own. The studio's Casino plays game.html in a frame with its saved look casino
// (studio/lib/casino.ts, studio/lib/scene-presets.ts CASINO_PRESET), and game.html lays a preset's whole look over the scene's
// DEFAULTS (src/game-look.ts lookState). Opened on its own, game.html sets its own look instead (src/game-own.ts GAME_OWN), and
// the base preset basgrund is a copy of that look: held together here, so that a change to the game's framing cannot make the
// two differ without anyone deciding it. Read from the files as they stand; no media, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULTS} from '../src/scene3d-view.ts';
import {lookState, presetFrom} from '../src/game-look.ts';
import {GAME_OWN} from '../src/game-own.ts';
import {CASINO_TABLE, casinoSearch, gameSrc, readCasino} from '../studio/lib/casino.ts';
import {BASE, BRED_LINS, CASINO_PRESET, SHIPPED, validatePreset} from '../studio/lib/scene-presets.ts';
import {tableGeometry} from '../src/card-plan.ts';
import {findLeaks, readRelease, scrub} from './studio-freeze.ts';

const rooms = JSON.parse(readFileSync('data/scene-rooms.json', 'utf8')).rooms as {id: string; blur?: number}[];
const basgrund = JSON.parse(readFileSync(`data/scene-presets/${BASE}.json`, 'utf8'));

test('the base preset is the game\'s own look: basgrund holds exactly what game.html sets by itself', () => {
  const blur = rooms.find(r => r.id === GAME_OWN.room)?.blur;
  assert.equal(typeof blur, 'number', `the room ${GAME_OWN.room} has no blur in data/scene-rooms.json`);
  const own = {...GAME_OWN, blur};
  assert.deepEqual({...basgrund.state}, own, 'data/scene-presets/basgrund.json and src/game-own.ts part');
  assert.deepEqual(SHIPPED.find(p => p.name === BASE)?.state, basgrund.state, 'the shipped copy in studio/lib/scene-presets.ts');
  // game.html in the Casino: the scene's DEFAULTS with basgrund over them; on its own: DEFAULTS with its own settings. The same.
  const casino = lookState(DEFAULTS, presetFrom({preset: {state: basgrund.state}})!.state, {}, () => 11);
  assert.deepEqual(casino, {...DEFAULTS, ...own});
});

test('the Casino opens on its editable saved look and its own table', () => {
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

test('Använd i Casino with Bred lins: the plain Casino link plays Bred lins, and saved with Standard again it plays Standard', () => {
  // the plain Casino (the rail's Casino, no parameters): its frame names no geometry, so the game page takes the preset's
  const plain = new URL(gameSrc(readCasino(new URLSearchParams(''))), 'http://lab').search;
  assert.equal(new URLSearchParams(plain).has('geometri'), false);
  const saved = (geometri?: string) => presetFrom({preset: {state: basgrund.state, ...(geometri ? {geometri} : {})}})!;
  assert.equal(tableGeometry(plain, saved(BRED_LINS).geometri ?? null), 'contract', 'saved with Bred lins');
  assert.equal(tableGeometry(plain, saved().geometri ?? null), 'lens', 'saved with Standard: no word, the file as it was');
  // Prova i Casino and a Casino address with its own word play that word over the saved one
  assert.equal(tableGeometry(new URL(gameSrc(readCasino(new URLSearchParams('geometri=lins'))), 'http://lab').search, BRED_LINS), 'lens');
});

test('the saved perspective goes up with the copy: validated, scrubbed and still there, so the Casino on the net plays it', () => {
  const release = readRelease(JSON.parse(readFileSync('data/studio-release.json', 'utf8')));
  assert.equal(release.presets, true, 'the presets go up with the copy (tools/build-studio-snapshot.ts)');
  const {preset, errors} = validatePreset({schemaVersion: 1, name: CASINO_PRESET, label: 'Casino', about: 'Casinos sparade visning.', state: basgrund.state, geometri: BRED_LINS}, CASINO_PRESET);
  assert.deepEqual(errors, []);
  // as tools/build-studio-snapshot.ts writes api/scene-presets/<name>.json and the list
  const one = scrub({preset: {...preset!, revision: null}}, release), list = scrub({schemaVersion: 1, presets: [{...preset!, revision: null}], problems: []}, release);
  assert.equal(one.preset.geometri, BRED_LINS); assert.equal(list.presets[0].geometri, BRED_LINS);
  assert.deepEqual(findLeaks(one, release), []); assert.deepEqual(findLeaks(list, release), []);
  assert.equal(tableGeometry('?forval=casino&table=casino&dealer=paow', presetFrom(one)!.geometri ?? null), 'contract');
});
