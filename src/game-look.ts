// The look game.html is played with when another page asks for one: the studio's Casino view, where Jakob plays the look
// he calibrated in the studio's Scen view. Two things in the address, the same as the Scen view's own address
// (/scen/?forval=levande&dust=0.8): ?forval=<name>, a preset of the 3D scene (data/scene-presets/<name>.json, read from
// /api/scene-presets/<name>), and scene keys (?dust=0.8&room=la). A preset is a whole look: the scene's DEFAULTS with the
// preset's keys over them, so a key the preset leaves out is the scene's default, as in the Scen view. The address's keys
// lie over the preset, or over the game's own settings when there is none. Without either the game keeps its own look.
//
// The studio's key catalogue (studio/lib/scene-keys.ts) is not imported: src/ is handed to the browser as it is and never
// reaches into studio/. KEYS is a copy of what an address needs of it (each key's kind, range and choices) with the same
// checks; tools/game-look.test.ts fails when the two part. Pure: no DOM, no network.
//
// Two of the game's own words share a name with a scene key and keep their meaning: tray=built keeps the built tray
// (src/game-page.ts), and fan=<px> is the cards' fan step (src/game-table.ts); fan is the scene's fan shadow only as a
// switch word (0, 1, true, false).
import type {SceneState} from './scene3d-view.ts';

export type LookKey = keyof SceneState;
export type KeyKind =
  | {kind: 'switch'}
  /** special: a value outside the range that still means something (scale 0 = the contract's own k). */
  | {kind: 'slider'; min: number; max: number; special?: number}
  /** open: room ids of the register beyond the options. */
  | {kind: 'choice'; options: readonly string[]; open?: true}
  | {kind: 'set'; options: readonly string[]}
  | {kind: 'text'; maxLength: number};

const on: KeyKind = {kind: 'switch'};
const range = (min: number, max: number): KeyKind => ({kind: 'slider', min, max});
const one = (...options: string[]): KeyKind => ({kind: 'choice', options});

/** The built rooms; the register's 360° rooms (data/scene-rooms.json) come on top. */
export const BUILT_ROOMS: readonly string[] = ['salong', 'hall', 'kuliss', 'plat'];
/** The blur that suits a built room; a 360° room's is in its register entry. */
export const BUILT_BLUR: Readonly<Record<string, number>> = {salong: 11, hall: 11, kuliss: 9, plat: 8};
export const ROOM_ID = /^[a-z0-9-]{1,30}$/;
export const PRESET_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const NAME_LIMIT = 40;
const MARKS = ['trim', 'arc', 'text', 'logo', 'boxes', 'rings', 'numbers'];
const SWITCH_WORDS = ['0', '1', 'true', 'false'];

export const KEYS: Readonly<Record<LookKey, KeyKind>> = {
  room: {kind: 'choice', options: BUILT_ROOMS, open: true}, roomShift: one('cut', 'shimmer'), roomShiftSeconds: range(1, 5), blur: range(0, 30), depthBlur: on, dofRange: range(0.5, 12),
  clock: on, dust: range(0, 1), flicker: on, flickerEvery: range(4, 90), flickerStrength: range(0, 1), fan: on, fanStrength: range(0, 0.4), fanPeriod: range(2, 12), roomLife: on, dealerLife: range(0, 2), filmTempo: range(1, 2),
  tal: one('repliker', 'av'), // the dealer's fixed lines as talk films, or as text only (src/game-page.ts)
  exposure: range(0.3, 2), roomLight: range(0, 2.5), lamp: range(0, 1), wrap: range(0, 1.5), dealerRoom: range(0, 1), filmEven: on, edgeClean: range(0, 1), filmBright: range(0.6, 1.4), filmWarm: range(-0.2, 0.2), shadowAbove: range(0, 1),
  cloth: one('print', 'v6', 'runway', 'runway-2', 'runway-3'), felt: one('green', 'blue', 'vin', 'svart'), marks: {kind: 'set', options: MARKS}, logo: {kind: 'text', maxLength: 28}, surface: one('painted', 'photo', 'natur', 'natur-2', 'natur-3', 'natur-duk'), base: one('column', 'legs'), tableSize: range(0.9, 1.4), tray: on, cups: on,
  cards: on, cardMethod: one('scene', 'film', 'matte'), cardHand: one('film', 'standard'), cardScale: range(0.8, 2), cardRank: one('A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'), cardSuit: one('spades', 'hearts', 'diamonds', 'clubs'), chipGloss: range(0, 1),
  mode: one('look', 'lean'), sway: on, focus: one('off', 'dealer', 'follow', 'card', 'manual'), focusDistance: range(0.3, 12), tolerance: range(0, 0.8),
  yaw: range(-60, 60), pitch: range(-35, 25), zoom: range(0.45, 2.5), dx: range(-0.9, 0.9), dy: range(-0.3, 0.5), dz: range(-0.5, 1.6), aim: on, format: one('desk', 'mob', 'fill'),
  panoramaTurn: range(0, 360), lens: one('plan', 'estimate'), scale: {kind: 'slider', min: 1, max: 2.6, special: 0}, keyLo: range(0, 0.5), keyHi: range(0.5, 1.2), shadow: range(0, 1.6), fold: on, guides: on,
};
export const isLookKey = (word: string): word is LookKey => Object.prototype.hasOwnProperty.call(KEYS, word);

const hasControl = (text: string) => [...text].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

/** Whether a value fits its key (studio/lib/scene-keys.ts checkValue, same rules). rooms: every room the scene has, when known. */
export function fits(k: KeyKind, value: unknown, rooms?: readonly string[]): boolean {
  switch (k.kind) {
    case 'switch': return typeof value === 'boolean';
    case 'slider': return typeof value === 'number' && Number.isFinite(value) && (value === k.special || value >= k.min - 1e-9 && value <= k.max + 1e-9);
    case 'choice': return typeof value === 'string' && (k.options.includes(value) || !!k.open && ROOM_ID.test(value) && (!rooms || rooms.includes(value)));
    case 'set': {
      if (typeof value !== 'string') return false;
      const words = value.trim().toLowerCase(); if (words === 'all' || words === 'none') return true;
      const list = words.split(/[\s,+]+/).filter(Boolean); return list.length > 0 && list.every(w => k.options.includes(w));
    }
    case 'text': return typeof value === 'string' && value.length <= k.maxLength && !hasControl(value);
  }
}
/** A value from an address (switches 1/0 or true/false, numbers as written), or null when it does not fit (decodeValue there). */
export function decode(k: KeyKind, text: string, rooms?: readonly string[]): SceneState[LookKey] | null {
  const value: unknown = k.kind === 'switch' ? (text === '1' || text === 'true' ? true : text === '0' || text === 'false' ? false : null) : k.kind === 'slider' ? (text.trim() === '' ? NaN : Number(text)) : text;
  return value !== null && fits(k, value, rooms) ? value as SceneState[LookKey] : null;
}

type Params = {get(name: string): string | null; forEach(fn: (value: string, key: string) => void): void};
export type Look = {
  /** The preset the address names, as written (null without ?forval), and the same when it is a preset name at all. */
  asked: string | null; forval: string | null;
  /** The address's scene keys that fit, and the scene keys whose values do not (named on the page). */
  keys: Partial<SceneState>; ignored: string[];
};

/** What the address asks for. Words that are no scene key (table, tema, …) are the game's or nobody's and are left alone. */
export function readLook(params: Params, rooms?: readonly string[]): Look {
  const asked = params.get('forval');
  const forval = asked !== null && PRESET_NAME.test(asked) && asked.length <= NAME_LIMIT ? asked : null;
  const keys: Record<string, unknown> = {}, ignored: string[] = [];
  params.forEach((text, word) => {
    if (!isLookKey(word) || word === 'tray' && text === 'built' || word === 'fan' && !SWITCH_WORDS.includes(text)) return;
    const value = decode(KEYS[word], text, rooms);
    if (value === null) { if (!ignored.includes(word)) ignored.push(word); } else keys[word] = value;
  });
  return {asked, forval, keys: keys as Partial<SceneState>, ignored: ignored.filter(word => !(word in keys))};
}

/** A preset as /api/scene-presets/<name> answers ({preset: {state}}): its keys that fit, and those that do not. null when it is no preset. */
export function presetFrom(answer: unknown, rooms?: readonly string[]): {state: Partial<SceneState>; dropped: string[]} | null {
  const state = (answer as {preset?: {state?: unknown}} | null)?.preset?.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const kept: Record<string, unknown> = {}, dropped: string[] = [];
  for (const [word, value] of Object.entries(state)) if (isLookKey(word) && fits(KEYS[word], value, rooms)) kept[word] = value; else dropped.push(word);
  return {state: kept as Partial<SceneState>, dropped};
}

/**
 * What the page sets on the scene over its own settings: with a preset the whole look (defaults, the preset, the keys),
 * without one only the keys. A room from the address without a blur gets the room's own blur then, as the game's room
 * menu gives it; over a preset the keys stay as written, as in the Scen view.
 */
export function lookState(defaults: SceneState, preset: Partial<SceneState> | null, keys: Partial<SceneState>, blurOf: (room: string) => number): Partial<SceneState> {
  if (preset) return {...defaults, ...preset, ...keys};
  return keys.room !== undefined && keys.blur === undefined ? {...keys, blur: blurOf(keys.room)} : {...keys};
}

/** One line for the page when part of the look could not be used; null when all of it was. */
export function lookNotice(asked: string | null, presetRead: boolean, ignored: readonly string[]): string | null {
  const parts = [
    asked !== null && !presetRead ? `Förvalet "${asked.slice(0, NAME_LIMIT)}" kunde inte läsas: spelet visar sitt eget utseende.` : '',
    ignored.length ? `Gick inte att använda ur adressen: ${ignored.join(', ')}.` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}
