// The Casino view's addresses. Its own, /game/?forval=levande&dust=0.8&table=casino-k3x9qa, carries the look (a preset and
// the keys that differ from it, as Bordet's Scen writes them: lib/scene-presets.ts) and the table, so a calibrated look can
// be sent as a link. From it: the game in the frame (/game.html?forval=…&inbaddad=1&…&table=…, read by src/game-look.ts)
// and the same look in Bordet's Scen (/bordet/?lage=scen&forval=…&…). Another view reaches the Casino with casinoAddress(preset, keys).
// The table's perspective (Standard or Bred lins, geometri=lins or kontrakt) is the address's word when it has one, else the one
// the preset was saved with (Casino's, by Använd i Casino in Scen; Jakob 2026-11-21), else Standard: shownGeometry here, and
// src/game-page.ts in the frame reads the same.
// The tree (?trad=<id>, a tree of data/dealer-trees.json; Karta's Prova i Casino writes it): the game in the frame plays that
// tree's films only (src/game-page.ts). Without it the Casino is as before. Several trees put together (?komposition=<id>, a
// composition of data/dealer-compositions.json; Karta's Komposition writes it) are played the same way, each from its own anchors.
// Pure: no DOM, no network; tests in studio/tests/casino.test.ts.
import type { SceneState } from "../../src/scene3d-view.ts";
import { SCENE_KEYS, encodeValue } from "./scene-keys.ts";
import { CASINO_PRESET, readAddress, type ScenePreset } from "./scene-presets.ts";
import { GEOMETRY_WORD, GEOMETRY_WORDS } from "../../src/card-plan.ts";
import { TREE_ID } from "../../src/dealer-trees.ts";

/**
 * The Casino on the internet: the copy's door /casino (cloud/studio/gate.ts GAME_HOME), the game with Casino's saved look as it
 * was when the copy was last published. The local studio links to it ("På nätet") so that Jakob can see it there.
 */
export const ONLINE_CASINO = "https://dealer-lake.vercel.app/casino";

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
export type CasinoLook = { forval: string; patch: Partial<SceneState>; table: string; ignored: string[]; geometri?: string | null; playback?: CasinoPlayback; trad?: string | null; komposition?: string | null };
type Params = { get(name: string): string | null; forEach(fn: (value: string, key: string) => void): void };

/** The address's word for the one tree the game plays (a tree id as src/dealer-trees.ts TREE_ID takes it). */
export const TREE_WORD = "trad";
/** The address's word for a composition of trees the game plays (an id as src/composition.ts COMPOSITION_ID takes it: a tree id's form). */
export const COMPOSITION_WORD = "komposition";

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
    if (key !== "table" && key !== "robot" && key !== GEOMETRY_WORD && key !== TREE_WORD && key !== COMPOSITION_WORD && !Object.hasOwn(PLAYBACK_WORDS, key)) keys.append(key, value);
  });
  if (!keys.has("forval")) keys.set("forval", CASINO_PRESET);
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
  const trad = params.get(TREE_WORD);
  if (trad !== null && !TREE_ID.test(trad)) ignored.push(TREE_WORD);
  const komposition = params.get(COMPOSITION_WORD);
  if (komposition !== null && !TREE_ID.test(komposition)) ignored.push(COMPOSITION_WORD);
  return { forval, patch, ignored, table: TABLE_NAME.test(asked) ? asked : CASINO_TABLE, ...(geometri ? { geometri } : {}), ...(Object.keys(playback).length ? { playback } : {}), ...(trad !== null && TREE_ID.test(trad) ? { trad } : {}), ...(komposition !== null && TREE_ID.test(komposition) ? { komposition } : {}) };
}

/** The keys as an address writes them, in the catalogue's order. */
function keyPairs(patch: Partial<SceneState>): [string, string][] {
  return SCENE_KEYS.filter((s) => patch[s.key] !== undefined).map((s) => [s.key, encodeValue(s, patch[s.key])]);
}
const join = (pairs: [string, string][]) => new URLSearchParams(pairs).toString();
const geometryPair = (look: Pick<CasinoLook, "geometri">): [string, string][] => (look.geometri ? [[GEOMETRY_WORD, look.geometri]] : []);
const playbackPairs = (look: Pick<CasinoLook, "playback">): [string, string][] => (Object.keys(PLAYBACK_WORDS) as PlaybackWord[])
  .flatMap(key => look.playback?.[key] !== undefined ? [[key, look.playback[key]] as [string, string]] : []);
// One of the two: a tree goes before a composition, as the game reads them (src/game-page.ts).
const treePair = (look: Pick<CasinoLook, "trad" | "komposition">): [string, string][] =>
  look.trad && TREE_ID.test(look.trad) ? [[TREE_WORD, look.trad]] : look.komposition && TREE_ID.test(look.komposition) ? [[COMPOSITION_WORD, look.komposition]] : [];

/** Carry the geometry of the current page to a lab link with its own look. */
export function withGeometry(href: string, geometri: string | undefined): string {
  if (!geometri || !Object.hasOwn(GEOMETRY_WORDS, geometri)) return href;
  const hashAt = href.indexOf("#"), hash = hashAt < 0 ? "" : href.slice(hashAt), base = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = base.indexOf("?"), pathname = queryAt < 0 ? base : base.slice(0, queryAt);
  const query = new URLSearchParams(queryAt < 0 ? "" : base.slice(queryAt + 1));
  query.set(GEOMETRY_WORD, geometri);
  return `${pathname}?${query}${hash}`;
}

/**
 * Prova i Casino from Scen: the Casino with Scen's look and always Scen's perspective in words, Standard as geometri=lins too,
 * so that a Casino saved with Bred lins shows the trial as Scen shows it.
 */
export const trialAddress = (casino: string, geometri: string | undefined): string => withGeometry(casino, geometri && Object.hasOwn(GEOMETRY_WORDS, geometri) ? geometri : "lins");

/** The perspective the game in the frame plays: the address's word, else the word the look's preset was saved with, else none (Standard). */
export function shownGeometry(look: Pick<CasinoLook, "forval" | "geometri">, presets: readonly Pick<ScenePreset, "name" | "geometri">[]): string | undefined {
  if (look.geometri) return look.geometri;
  const saved = presets.find((p) => p.name === look.forval)?.geometri;
  return saved && Object.hasOwn(GEOMETRY_WORDS, saved) ? saved : undefined;
}

/** "?forval=levande&dust=0.8&table=casino": the view's own question; forval always, so the link says which preset. */
export function casinoSearch(look: Pick<CasinoLook, "forval" | "patch" | "geometri" | "playback" | "trad" | "komposition"> & { table?: string | null }): string {
  const table: [string, string][] = look.table ? [["table", look.table]] : [];
  return `?${join([["forval", look.forval], ...keyPairs(look.patch), ...table, ...geometryPair(look), ...playbackPairs(look), ...treePair(look)])}`;
}

/**
 * The Casino view with a look, for a link from another view (next/link adds the base path /studio):
 * casinoAddress("levande", {dust: 0.8}) is "/game/?forval=levande&dust=0.8". keys: the scene keys that differ from the
 * preset (patchOf(current, presetState) in lib/scene-presets.ts). table: a table name, else the Casino's own. trad: one tree
 * the game plays (Karta's Prova i Casino), komposition: several put together (Karta's Komposition), else all the dealer's films.
 */
export function casinoAddress(forval: string, keys: Partial<SceneState> = {}, table?: string | null, trad?: string | null, komposition?: string | null): string {
  return `/game/${casinoSearch({ forval, patch: keys, table: table && TABLE_NAME.test(table) ? table : null, trad, komposition })}`;
}

/** The game in the frame: the lab's own page, with the look, the frame's mark, the table and the tree. */
export function gameSrc(look: Pick<CasinoLook, "forval" | "patch" | "table" | "geometri" | "playback" | "trad" | "komposition">): string {
  return `/game.html?${join([["forval", look.forval], ["inbaddad", "1"], ...keyPairs(look.patch), ["table", look.table], ...geometryPair(look), ...playbackPairs(look), ...treePair(look)])}`;
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
