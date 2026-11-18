// The Casino view's addresses. Its own, /game/?forval=levande&dust=0.8&table=casino-k3x9qa, carries the look (a preset and
// the keys that differ from it, as Bordet's Scen writes them: lib/scene-presets.ts) and the table, so a calibrated look can
// be sent as a link. From it: the game in the frame (/game.html?forval=…&inbaddad=1&…&table=…, read by src/game-look.ts)
// and the same look in Bordet's Scen (/bordet/?lage=scen&forval=…&…). Another view reaches the Casino with casinoAddress(preset, keys).
// Pure: no DOM, no network; tests in studio/tests/casino.test.ts.
import type { SceneState } from "../../src/scene3d-view.ts";
import { SCENE_KEYS, encodeValue } from "./scene-keys.ts";
import { readAddress } from "./scene-presets.ts";
import { GEOMETRY_WORD, GEOMETRY_WORDS } from "../../src/card-plan.ts";

/** A table name as the lab server takes it (tools/preview.ts tableName): one game session per name. */
export const TABLE_NAME = /^[a-z0-9-]{1,40}$/;
/** The table when the address names none: the Casino's own, apart from the plain game's ("main"). */
export const CASINO_TABLE = "casino";

// Game playback words are independent of the scene look. Keep only values the game implements.
const PLAYBACK_WORDS = { kort: ["hand", "matt", "liggande"], cardBack: ["film", "dark"], cardFace: ["film", "paper"], dealTempo: null, diagnos: ["0", "1"] } as const;
type PlaybackWord = keyof typeof PLAYBACK_WORDS;
type CasinoPlayback = Partial<Record<PlaybackWord, string>>;

/**
 * geometri: the page's own word for the table's geometry (src/card-plan.ts: geometri=lins or geometri=kontrakt), when the
 * address has it. It is no look key: the Casino keeps it in its address, the game in the frame and the link to Scen.
 */
export type CasinoLook = { forval: string; patch: Partial<SceneState>; table: string; ignored: string[]; geometri?: string | null; playback?: CasinoPlayback };
type Params = { get(name: string): string | null; forEach(fn: (value: string, key: string) => void): void };

/** The explicit geometry word in a lab address, if it is one the game knows. */
export function readGeometryWord(params: Pick<Params, "get">): string | undefined {
  const word = params.get(GEOMETRY_WORD);
  return word !== null && Object.hasOwn(GEOMETRY_WORDS, word) ? word : undefined;
}

/** The look and table an address asks for. Words that are no key, or values that do not fit, are left out and named. */
export function readCasino(params: Params, rooms?: readonly string[]): CasinoLook {
  const keys = new URLSearchParams();
  // "table" is the Casino's own word, and "robot" belongs to every lab page (src/preview-ui.ts); neither is a look key.
  params.forEach((value, key) => {
    if (key !== "table" && key !== "robot" && key !== GEOMETRY_WORD && !Object.hasOwn(PLAYBACK_WORDS, key)) keys.append(key, value);
  });
  const { forval, patch, ignored } = readAddress(keys, rooms);
  const asked = params.get("table") ?? "", geometri = readGeometryWord(params);
  const playback: CasinoPlayback = {};
  for (const key of Object.keys(PLAYBACK_WORDS) as PlaybackWord[]) {
    const value = params.get(key);
    if (value === null) continue;
    const choices = PLAYBACK_WORDS[key], number = Number(value);
    const valid = choices ? (choices as readonly string[]).includes(value) : value.trim() !== "" && Number.isFinite(number) && number >= 1 && number <= 1.15;
    if (valid) playback[key] = key === "dealTempo" ? String(number) : value;
    else ignored.push(key);
  }
  return { forval, patch, ignored, table: TABLE_NAME.test(asked) ? asked : CASINO_TABLE, ...(geometri ? { geometri } : {}), ...(Object.keys(playback).length ? { playback } : {}) };
}

/** The keys as an address writes them, in the catalogue's order. */
function keyPairs(patch: Partial<SceneState>): [string, string][] {
  return SCENE_KEYS.filter((s) => patch[s.key] !== undefined).map((s) => [s.key, encodeValue(s, patch[s.key])]);
}
const join = (pairs: [string, string][]) => new URLSearchParams(pairs).toString();
const geometryPair = (look: Pick<CasinoLook, "geometri">): [string, string][] => (look.geometri ? [[GEOMETRY_WORD, look.geometri]] : []);
const playbackPairs = (look: Pick<CasinoLook, "playback">): [string, string][] => (Object.keys(PLAYBACK_WORDS) as PlaybackWord[])
  .flatMap(key => look.playback?.[key] !== undefined ? [[key, look.playback[key]] as [string, string]] : []);

/** Carry the geometry of the current page to a lab link with its own look. */
export function withGeometry(href: string, geometri: string | undefined): string {
  if (!geometri || !Object.hasOwn(GEOMETRY_WORDS, geometri)) return href;
  const hashAt = href.indexOf("#"), hash = hashAt < 0 ? "" : href.slice(hashAt), base = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = base.indexOf("?"), pathname = queryAt < 0 ? base : base.slice(0, queryAt);
  const query = new URLSearchParams(queryAt < 0 ? "" : base.slice(queryAt + 1));
  query.set(GEOMETRY_WORD, geometri);
  return `${pathname}?${query}${hash}`;
}

/** "?forval=levande&dust=0.8&table=casino": the view's own question; forval always, so the link says which preset. */
export function casinoSearch(look: Pick<CasinoLook, "forval" | "patch" | "geometri" | "playback"> & { table?: string | null }): string {
  const table: [string, string][] = look.table ? [["table", look.table]] : [];
  return `?${join([["forval", look.forval], ...keyPairs(look.patch), ...table, ...geometryPair(look), ...playbackPairs(look)])}`;
}

/**
 * The Casino view with a look, for a link from another view (next/link adds the base path /studio):
 * casinoAddress("levande", {dust: 0.8}) is "/game/?forval=levande&dust=0.8". keys: the scene keys that differ from the
 * preset (patchOf(current, presetState) in lib/scene-presets.ts). table: a table name, else the Casino's own.
 */
export function casinoAddress(forval: string, keys: Partial<SceneState> = {}, table?: string | null): string {
  return `/game/${casinoSearch({ forval, patch: keys, table: table && TABLE_NAME.test(table) ? table : null })}`;
}

/** The game in the frame: the lab's own page, with the look, the frame's mark and the table. */
export function gameSrc(look: Pick<CasinoLook, "forval" | "patch" | "table" | "geometri" | "playback">): string {
  return `/game.html?${join([["forval", look.forval], ["inbaddad", "1"], ...keyPairs(look.patch), ["table", look.table], ...geometryPair(look), ...playbackPairs(look)])}`;
}

/** The same look in Bordet's Scen, to calibrate it further. */
export function scenHref(look: Pick<CasinoLook, "forval" | "patch" | "geometri">): string {
  return `/bordet/?${join([["lage", "scen"], ["forval", look.forval], ...keyPairs(look.patch), ...geometryPair(look)])}`;
}

/** A fresh table name: a new game session on the lab server, with a new balance and shoe. */
export function freshTable(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 6; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36) % 36];
  return `${CASINO_TABLE}-${id}`;
}
