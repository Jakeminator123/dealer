// The look game.html is played with from the studio (src/game-look.ts): its copy of the key catalogue against the studio's
// own (studio/lib/scene-keys.ts), the address and preset reading, and the game's own words that share a name with a key.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUILT_BLUR, BUILT_ROOMS, KEYS, NAME_LIMIT, PRESET_NAME, ROOM_ID, decode, fits, lookNotice, lookState, presetFrom, readLook, type KeyKind} from '../src/game-look.ts';
import {BUILT_BLUR as STUDIO_BLUR, BUILT_ROOMS as STUDIO_ROOMS, ROOM_ID as STUDIO_ROOM_ID, SCENE_KEYS, checkValue, decodeValue, type KeySpec} from '../studio/lib/scene-keys.ts';
import {NAME_LIMIT as STUDIO_NAME_LIMIT, PRESET_NAME as STUDIO_PRESET_NAME, SHIPPED, effective} from '../studio/lib/scene-presets.ts';
import {DEFAULTS} from '../src/scene3d-view.ts';

const params = (text: string) => new URLSearchParams(text);
const kindOf = (s: KeySpec): KeyKind => {
  switch (s.kind) {
    case 'switch': return {kind: 'switch'};
    case 'slider': return s.special ? {kind: 'slider', min: s.min, max: s.max, special: s.special.value} : {kind: 'slider', min: s.min, max: s.max};
    case 'choice': return s.open ? {kind: 'choice', options: s.options.map(o => o.value), open: true} : {kind: 'choice', options: s.options.map(o => o.value)};
    case 'set': return {kind: 'set', options: s.options.map(o => o.value)};
    case 'text': return {kind: 'text', maxLength: s.maxLength};
  }
};

test('the copy of the key catalogue is the studio\'s: every key of the scene, same kind, range and choices', () => {
  assert.deepEqual(Object.keys(KEYS).sort(), Object.keys(DEFAULTS).sort(), 'every key of the scene, no other');
  assert.deepEqual(Object.keys(KEYS).sort(), SCENE_KEYS.map(s => s.key).sort());
  for (const s of SCENE_KEYS) assert.deepEqual(KEYS[s.key], kindOf(s), s.key);
  assert.deepEqual(BUILT_ROOMS, STUDIO_ROOMS.map(r => r.value));
  assert.deepEqual(BUILT_BLUR, STUDIO_BLUR);
  assert.equal(String(ROOM_ID), String(STUDIO_ROOM_ID));
  assert.equal(String(PRESET_NAME), String(STUDIO_PRESET_NAME));
  assert.equal(NAME_LIMIT, STUDIO_NAME_LIMIT);
});

test('values are checked and read as the studio checks and reads them', () => {
  const rooms = [...BUILT_ROOMS, 'panorama', 'la', 'skog'];
  const samples: unknown[] = [true, false, 0, 1, -1, 0.5, 2.6, 3, 361, -60, -61, NaN, 'all', 'none', 'trim,arc', 'trim, nope', '', 'salong', 'la', 'okand', 'ok rum', 'SCOUT GAMING', 'x'.repeat(29), 'rad\nbrytning', 'A', '10', 'lean', null];
  for (const s of SCENE_KEYS) {
    for (const value of samples) {
      assert.equal(fits(KEYS[s.key], value, rooms), checkValue(s, value, rooms) === null, `${s.key} ${JSON.stringify(value)}`);
      assert.equal(fits(KEYS[s.key], value), checkValue(s, value) === null, `${s.key} ${JSON.stringify(value)} without rooms`);
      if (typeof value === 'string') assert.deepEqual(decode(KEYS[s.key], value, rooms), decodeValue(s, value, rooms), `${s.key} "${value}"`);
    }
    for (const text of ['1', '0', 'true', 'false', '0.25', '-8', '']) assert.deepEqual(decode(KEYS[s.key], text, rooms), decodeValue(s, text, rooms), `${s.key} "${text}"`);
  }
});

test('the address: the preset, the keys that fit, the keys that do not, and the game\'s own words left alone', () => {
  const rooms = [...BUILT_ROOMS, 'panorama', 'la'];
  assert.deepEqual(readLook(params(''), rooms), {asked: null, forval: null, keys: {}, ignored: []});
  assert.deepEqual(readLook(params('forval=levande&dust=0.8&room=la&sway=1&table=casino-ab12&tema=scout&inbaddad=1'), rooms),
    {asked: 'levande', forval: 'levande', keys: {dust: 0.8, room: 'la', sway: true}, ignored: []});
  assert.deepEqual(readLook(params('forval=Inte%20ett%20namn&dust=4&room=skog&zoom=x'), rooms), {asked: 'Inte ett namn', forval: null, keys: {}, ignored: ['dust', 'room', 'zoom']});
  // tray=built keeps the built tray, fan=<px> is the cards' fan step: neither is a scene key, neither is named
  assert.deepEqual(readLook(params('tray=built&fan=24'), rooms), {asked: null, forval: null, keys: {}, ignored: []});
  assert.deepEqual(readLook(params('tray=0&fan=1'), rooms), {asked: null, forval: null, keys: {tray: false, fan: true}, ignored: []});
  // the last value of a word wins, as in the studio's readAddress
  assert.deepEqual(readLook(params('dust=9&dust=0.3'), rooms).keys, {dust: 0.3});
  assert.deepEqual(readLook(params('dust=9&dust=0.3'), rooms).ignored, []);
});

test('a preset as the lab hands it out: its state kept, a key that does not fit dropped and named', async () => {
  const file = JSON.parse(await readFile('data/scene-presets/levande.json', 'utf8'));
  assert.deepEqual(presetFrom({preset: file}), {state: file.state, dropped: []});
  assert.deepEqual(presetFrom({preset: {state: {dust: 0.5, glow: 1, zoom: 9}}}), {state: {dust: 0.5}, dropped: ['glow', 'zoom']});
  for (const answer of [null, {}, {preset: null}, {preset: {state: []}}, {error: 'Det finns inget förval med det namnet.'}]) assert.equal(presetFrom(answer), null);
});

test('the look over the game: a preset is a whole look, keys alone lie over the game\'s own', () => {
  const blurOf = (room: string) => ({panorama: 5, la: 4, hall: 11}[room] ?? 11);
  for (const p of SHIPPED) assert.deepEqual(lookState(DEFAULTS, p.state, {}, blurOf), effective(DEFAULTS, p.state), `${p.name} as the Scen view shows it`);
  // a key the preset leaves out is the scene's default, also where the game sets its own (tray, cards, format)
  const bare = lookState(DEFAULTS, {dust: 0.4}, {zoom: 1.1}, blurOf);
  assert.deepEqual([bare.dust, bare.zoom, bare.tray, bare.cards, bare.format, bare.room], [0.4, 1.1, false, false, 'desk', 'salong']);
  // over a preset the keys stay as written, as in the Scen view; alone a room brings its own blur
  assert.equal(lookState(DEFAULTS, SHIPPED[0].state, {room: 'hall'}, blurOf).blur, 5);
  assert.deepEqual(lookState(DEFAULTS, null, {room: 'hall'}, blurOf), {room: 'hall', blur: 11});
  assert.deepEqual(lookState(DEFAULTS, null, {room: 'la', blur: 2}, blurOf), {room: 'la', blur: 2});
  assert.deepEqual(lookState(DEFAULTS, null, {}, blurOf), {});
});

test('what the page says when part of the look could not be used', () => {
  assert.equal(lookNotice(null, false, []), null);
  assert.equal(lookNotice('levande', true, []), null);
  assert.equal(lookNotice('borta', false, []), 'Förvalet "borta" kunde inte läsas: spelet visar sitt eget utseende.');
  assert.equal(lookNotice(null, false, ['dust', 'room']), 'Gick inte att använda ur adressen: dust, room.');
  assert.match(lookNotice('borta', false, ['zoom'])!, /^Förvalet "borta" .*\. Gick inte att använda ur adressen: zoom\.$/);
});

test('game.html without a look reads no look module and sets what it set before', async () => {
  const page = await readFile('src/game-page.ts', 'utf8');
  // the module is read only when the address holds more than the game's own words
  assert.match(page, /lookAsked \? import\('\.\/game-look\.ts'\)\.catch\(\(\) => null\) : null/);
  // dealer: whose films the game plays (?dealer=paow, which the Casino view passes on), no look; intro: a film before the game
  // (src/game-intro.ts), read only when the address names one
  assert.match(page, /const OWN_WORDS = \['table', 'tema', 'bricka', 'chatt', 'robot', 'inbaddad', 'dealer', 'intro'\]/);
  assert.match(page, /if \(introAsked\) void import\('\.\/game-intro\.ts'\)/);
  // and the look is laid only when there is one
  assert.match(page, /if \(Object\.keys\(asked\)\.length\) \{ scene\.set\(/);
});

test('the drawn cards and her lines: the game draws cards unless the player or a look says off; tal=av keeps her silent', async () => {
  const rooms = [...BUILT_ROOMS], blurOf = () => 11;
  // cards is the scene's own key: ?cards=0 (a link or a recording writes it) turns the drawn cards off, over a preset too.
  assert.deepEqual(readLook(params('cards=0'), rooms).keys, {cards: false});
  assert.equal(lookState(DEFAULTS, {cards: true}, {cards: false}, blurOf).cards, false);
  assert.equal(lookState(DEFAULTS, null, {}, blurOf).cards, undefined, 'without a look the game keeps its own (on)');
  const page = await readFile('src/game-page.ts', 'utf8');
  // who decides (src/game-film.ts cardsChoice, pinned in tools/game-film.test.ts): the address, then the menu's memory, then on
  assert.ok(page.includes('scene.set({cards: cardsNow.cards});'), 'on unless the address, the player or the look says off');
  assert.match(page, /cards\(on\) \{ scene\.set\(\{cards: on\}\);/, 'the console switch sets the scene key');
  assert.match(await readFile('src/game-panel.ts', 'utf8'), /toggle\('Ritade kort'/);
  // tal: repliker (the default) or av; anything else is not used.
  assert.equal(DEFAULTS.tal, 'repliker');
  assert.deepEqual(readLook(params('tal=av'), rooms).keys, {tal: 'av'});
  assert.deepEqual(readLook(params('tal=ja'), rooms).ignored, ['tal']);
});
