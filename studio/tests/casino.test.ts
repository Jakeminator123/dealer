// The Casino view's addresses (studio/lib/casino.ts). Run: node --test "studio/tests/casino.test.ts"
// The game page's side, reading the same address, is tested in tools/game-look.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tableGeometry } from "../../src/card-plan.ts";
import { DEFAULTS } from "../../src/scene3d-view.ts";
import { readLook } from "../../src/game-look.ts";
import { cardsChoice, cardWords } from "../../src/game-film.ts";
import { CASINO_TABLE, casinoAddress, casinoSearch, freshTable, gameSrc, readCasino, readGeometryWord, scenHref, withGeometry } from "../lib/casino.ts";
import { SHIPPED, effective, patchOf, readAddress, scenePageAddress } from "../lib/scene-presets.ts";

const params = (text: string) => new URLSearchParams(text);

test("Casino keeps explicit card, tempo and diagnosis choices in its address and the actual game frame", () => {
  const input = params("forval=levande&table=carry-ab&geometri=lins&kort=liggande&cardBack=dark&cardFace=paper&dealTempo=1.12&diagnos=1");
  const look = readCasino(input);
  assert.deepEqual(look.ignored, []);
  const canonical = params(casinoSearch(look));
  const frame = new URL(gameSrc(readCasino(canonical)), "http://127.0.0.1:4319").searchParams;
  for (const word of ["kort", "cardBack", "cardFace", "dealTempo", "diagnos"]) {
    assert.equal(canonical.get(word), input.get(word), `${word} survives URL normalization`);
    assert.equal(frame.get(word), input.get(word), `${word} reaches game.html`);
  }
  assert.deepEqual(cardsChoice({kort: frame.get("kort")}), {cards: true, carry: "film"});
  assert.deepEqual(cardWords(frame), {back: "dark", face: "paper"});
  assert.equal(frame.get("table"), "carry-ab");
  assert.equal(frame.get("inbaddad"), "1");
  assert.deepEqual(look.patch, {}, "playback choices are not stored as scene controls");
});

test("Casino accepts supported playback choices and rejects unknown or out-of-range values", () => {
  for (const [word, values] of Object.entries({kort: ["hand", "matt", "liggande"], cardBack: ["film", "dark"], cardFace: ["film", "paper"], dealTempo: ["1", "1.15"], diagnos: ["0", "1"]})) {
    for (const value of values) {
      const look = readCasino(params(`${word}=${value}`));
      assert.deepEqual(look.ignored, []);
      assert.equal(new URL(gameSrc(look), "http://localhost").searchParams.get(word), value);
    }
  }
  for (const [word, values] of Object.entries({kort: ["unknown"], cardBack: ["red"], cardFace: ["dark"], dealTempo: ["", "NaN", "Infinity", "0.9", "1.16"], diagnos: ["true", "2"]})) {
    for (const value of values) {
      const look = readCasino(params(`${word}=${value}`));
      assert.deepEqual(look.ignored, [word]);
      assert.equal(new URL(gameSrc(look), "http://localhost").searchParams.has(word), false);
    }
  }
  const look = readCasino(params("kort=liggande&dealTempo=1.12&diagnos=1&cardFace=paper&unknown=yes"));
  assert.deepEqual(look.ignored, ["unknown"]);
  const scene = new URL(scenHref(look), "http://localhost");
  scene.searchParams.delete("lage");
  assert.deepEqual(readAddress(scene.searchParams), {forval: "basgrund", patch: {}, ignored: []}, "game controls are not sent to a scene that does not implement them");
});

test("the view's address: the preset, the keys, the table; basgrund and the Casino's own table when none is named", () => {
  assert.deepEqual(readCasino(params("")), { forval: "basgrund", patch: {}, ignored: [], table: CASINO_TABLE });
  assert.deepEqual(readCasino(params("forval=levande&dust=0.8&sway=0&table=casino-k3x9qa")), { forval: "levande", patch: { dust: 0.8, sway: false }, ignored: [], table: "casino-k3x9qa" });
  // a table the lab server would refuse, an unknown word and a value out of range
  assert.deepEqual(readCasino(params("forval=rumsstudien&table=Mitt%20bord&glow=1&dust=4")), { forval: "rumsstudien", patch: {}, ignored: ["glow", "dust"], table: CASINO_TABLE });
});

test("the addresses written from a look: forval always, keys in the catalogue's order, the table last", () => {
  const look = { forval: "levande", patch: { zoom: 1.1, dust: 0.8, room: "la" as const, sway: false }, table: "casino-k3x9qa" };
  assert.equal(casinoSearch(look), "?forval=levande&room=la&dust=0.8&sway=0&zoom=1.1&table=casino-k3x9qa");
  assert.equal(casinoAddress("basgrund"), "/game/?forval=basgrund");
  assert.equal(gameSrc(look), "/game.html?forval=levande&inbaddad=1&room=la&dust=0.8&sway=0&zoom=1.1&table=casino-k3x9qa");
  assert.equal(scenHref(look), "/bordet/?lage=scen&forval=levande&room=la&dust=0.8&sway=0&zoom=1.1");
  // text is written so that it reads back the same
  const logo = { forval: "basgrund", patch: { logo: "Kväll & dag" }, table: CASINO_TABLE };
  assert.deepEqual(readCasino(params(casinoSearch(logo).slice(1))), { ...logo, ignored: [] });
});

test("a look goes round: the view's address, the game's frame and the Scen view read the same look", () => {
  const look = { forval: "rumsstudien", patch: { dust: 0.25, lamp: 0.8, felt: "vin", marks: "trim,arc", cards: false, yaw: -12.5 }, table: "casino-abc123" };
  assert.deepEqual(readCasino(params(casinoSearch(look).slice(1))), { ...look, ignored: [] });
  const game = new URL(gameSrc(look), "http://127.0.0.1:4319").searchParams;
  assert.deepEqual(readLook(game), { asked: "rumsstudien", forval: "rumsstudien", keys: look.patch, ignored: [] });
  const at = new URL(scenHref(look), "http://127.0.0.1:4319").searchParams;
  assert.equal(at.get("lage"), "scen", "Bordet's Scen");
  at.delete("lage");
  assert.deepEqual(readAddress(at), { forval: "rumsstudien", patch: look.patch, ignored: [] });
});

test("Casino, Scen and the lab links retain the explicit geometry with the selected look", () => {
  const lab = "http://127.0.0.1:4319";
  for (const [word, mode] of [["lins", "lens"], ["kontrakt", "contract"]] as const) {
    const original = readCasino(params(`forval=levande&cardHand=standard&pitch=-12&zoom=0.95&geometri=${word}`));
    const scen = new URL(scenHref(original), lab);
    assert.equal(scen.search, `?lage=scen&forval=levande&cardHand=standard&pitch=-12&zoom=0.95&geometri=${word}`);
    const geometri = readGeometryWord(scen.searchParams);
    const game = new URL(withGeometry(casinoAddress(original.forval, original.patch), geometri), lab);
    const roundTrip = readCasino(game.searchParams);
    assert.deepEqual(roundTrip, original);
    const frame = new URL(gameSrc(roundTrip), lab);
    assert.equal(tableGeometry(frame.search), mode);
    assert.deepEqual(readLook(frame.searchParams).keys, original.patch);

    const scene = new URL(withGeometry(scenePageAddress(effective(DEFAULTS, original.patch), DEFAULTS), geometri), lab);
    assert.equal(scene.search, `?cardHand=standard&pitch=-12&zoom=0.95&geometri=${word}`);
    assert.equal(tableGeometry(scene.search), mode);
    assert.equal(withGeometry("/scene3d.html", geometri), `/scene3d.html?geometri=${word}`);
  }
  assert.equal(withGeometry("/scene3d.html", readGeometryWord(params("geometri=annat"))), "/scene3d.html");
  assert.equal(withGeometry("/scene3d.html?geometri=kontrakt#bordet", "lins"), "/scene3d.html?geometri=lins#bordet");
});

test("casinoAddress, from another view: the active preset and only the keys that differ from it", () => {
  const levande = effective(DEFAULTS, SHIPPED[1].state);
  const tuned = { ...levande, dust: 0.9, room: "skog" as const, blur: 6 };
  assert.equal(casinoAddress("levande", patchOf(tuned, levande)), "/game/?forval=levande&room=skog&blur=6&dust=0.9");
  assert.equal(casinoAddress("levande", patchOf(levande, levande)), "/game/?forval=levande");
  assert.equal(casinoAddress("levande", { dust: 0.9 }, "casino-k3x9qa"), "/game/?forval=levande&dust=0.9&table=casino-k3x9qa");
  // a table the lab server would refuse is left out: the Casino's own is used
  assert.equal(casinoAddress("levande", {}, "Mitt bord"), "/game/?forval=levande");
  // and the view reads back what was written
  assert.deepEqual(readCasino(new URL(casinoAddress("levande", patchOf(tuned, levande)), "http://x").searchParams), { forval: "levande", patch: { room: "skog", blur: 6, dust: 0.9 }, ignored: [], table: CASINO_TABLE });
});

test("a new table is a fresh name the lab server takes", () => {
  const names = new Set(Array.from({ length: 50 }, () => freshTable()));
  assert.ok(names.size > 45);
  for (const name of names) assert.match(name, /^casino-[a-z0-9]{6}$/);
  assert.equal(freshTable(() => 0), "casino-aaaaaa");
  assert.equal(freshTable(() => 0.9999), "casino-999999");
});
