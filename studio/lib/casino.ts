// The Casino view's addresses. Its own, /game/?forval=levande&dust=0.8&table=casino-k3x9qa, carries the look (a preset and
// the keys that differ from it, as the Scen view writes them: lib/scene-presets.ts) and the table, so a calibrated look can
// be sent as a link. From it: the game in the frame (/game.html?forval=…&inbaddad=1&…&table=…, read by src/game-look.ts)
// and the same look in the Scen view (/scen/?forval=…&…). Another view reaches the Casino with casinoAddress(preset, keys).
// Pure: no DOM, no network; tests in studio/tests/casino.test.ts.
import type { SceneState } from "../../src/scene3d-view.ts";
import { SCENE_KEYS, encodeValue } from "./scene-keys.ts";
import { readAddress } from "./scene-presets.ts";

/** A table name as the lab server takes it (tools/preview.ts tableName): one game session per name. */
export const TABLE_NAME = /^[a-z0-9-]{1,40}$/;
/** The table when the address names none: the Casino's own, apart from the plain game's ("main"). */
export const CASINO_TABLE = "casino";

export type CasinoLook = { forval: string; patch: Partial<SceneState>; table: string; ignored: string[] };
type Params = { get(name: string): string | null; forEach(fn: (value: string, key: string) => void): void };

/** The look and table an address asks for. Words that are no key, or values that do not fit, are left out and named. */
export function readCasino(params: Params, rooms?: readonly string[]): CasinoLook {
  const keys = new URLSearchParams();
  // "table" is the Casino's own word, and "robot" belongs to every lab page (src/preview-ui.ts); neither is a look key.
  params.forEach((value, key) => {
    if (key !== "table" && key !== "robot") keys.append(key, value);
  });
  const { forval, patch, ignored } = readAddress(keys, rooms);
  const asked = params.get("table") ?? "";
  return { forval, patch, ignored, table: TABLE_NAME.test(asked) ? asked : CASINO_TABLE };
}

/** The keys as an address writes them, in the catalogue's order. */
function keyPairs(patch: Partial<SceneState>): [string, string][] {
  return SCENE_KEYS.filter((s) => patch[s.key] !== undefined).map((s) => [s.key, encodeValue(s, patch[s.key])]);
}
const join = (pairs: [string, string][]) => new URLSearchParams(pairs).toString();

/** "?forval=levande&dust=0.8&table=casino": the view's own question; forval always, so the link says which preset. */
export function casinoSearch(look: Pick<CasinoLook, "forval" | "patch"> & { table?: string | null }): string {
  const table: [string, string][] = look.table ? [["table", look.table]] : [];
  return `?${join([["forval", look.forval], ...keyPairs(look.patch), ...table])}`;
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
export function gameSrc(look: Pick<CasinoLook, "forval" | "patch" | "table">): string {
  return `/game.html?${join([["forval", look.forval], ["inbaddad", "1"], ...keyPairs(look.patch), ["table", look.table]])}`;
}

/** The same look in the Scen view, to calibrate it further. */
export function scenHref(look: Pick<CasinoLook, "forval" | "patch">): string {
  return `/scen/?${join([["forval", look.forval], ...keyPairs(look.patch)])}`;
}

/** A fresh table name: a new game session on the lab server, with a new balance and shoe. */
export function freshTable(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 6; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36) % 36];
  return `${CASINO_TABLE}-${id}`;
}
