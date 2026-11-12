// The Scen view's address: the round and the look in one question (studio/components/scene-editor/address.ts).
// Run: node --test "studio/tests/scene-address.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, type SceneState } from "../../src/scene3d-view.ts";
import { START_LOOK, askedPart, fromOldScen, joinParts, lookPart, readLook, roundPart } from "../components/scene-editor/address.ts";
import { readAddress as readRound } from "../lib/rounds.ts";
import { SHIPPED, effective } from "../lib/scene-presets.ts";

const [basgrund, levande] = SHIPPED.map((p) => effective(DEFAULTS, p.state));
const q = (text: string) => new URLSearchParams(text);

test("a look that names no preset is Levande; one that names one keeps it", () => {
  assert.equal(START_LOOK, "levande");
  assert.deepEqual(readLook(q("")), { forval: "levande", patch: {}, ignored: [] });
  assert.deepEqual(readLook(q("runda=A1+-+A2.1&vy=platt")), { forval: "levande", patch: {}, ignored: [] }, "the round's words are not the look's");
  const asked = readLook(q("runda=A1&forval=basgrund&dust=0.8&glitter=1"));
  assert.equal(asked.forval, "basgrund");
  assert.deepEqual(asked.patch, { dust: 0.8 });
  assert.deepEqual(asked.ignored, ["glitter"]);
  // a forval that cannot be a preset's name falls back to basgrund, as the presets' own reader does
  assert.equal(readLook(q("forval=../x")).forval, "basgrund");
});

test("the round's part stays as it stands, and the round's reader still reads the whole address", () => {
  const text = "kant=READY%3EP4.C1&tagning=pamela-p4-c1-plan-deal-02&forval=levande&dust=0.8&vy=platt&robot=1";
  assert.equal(roundPart(q(text)), "kant=READY%3EP4.C1&tagning=pamela-p4-c1-plan-deal-02&vy=platt&robot=1");
  const round = readRound(q(text));
  assert.equal(round.view, "platt");
  assert.deepEqual(round.asked, { kind: "kant", edge: "READY>P4.C1", take: "pamela-p4-c1-plan-deal-02" });
  // an old Spela link: the round and the view, and Levande as Spela showed it
  const old = q("runda=A2.1+-+P4C1+-+A2.1&vy=platt");
  assert.equal(readRound(old).view, "platt");
  assert.equal(readLook(old).forval, "levande");
});

test("the look is written with its preset always named, and only the keys that differ from it", () => {
  assert.equal(lookPart("levande", levande, levande), "forval=levande");
  assert.equal(lookPart("basgrund", basgrund, basgrund), "forval=basgrund", "basgrund is named: a bare address is Levande here");
  const changed: SceneState = { ...levande, dust: 0.8, felt: "vin" };
  const text = lookPart("levande", changed, levande);
  assert.equal(text, "forval=levande&dust=0.8&felt=vin");
  const back = readLook(q(text));
  assert.deepEqual(effective(levande, back.patch), changed);
  // before the scene is there, the look as the address asked for it, in the catalogue's order
  assert.equal(askedPart({ forval: "levande", patch: { felt: "vin", dust: 0.8 } }), "forval=levande&dust=0.8&felt=vin");
});

test("the parts join into one question", () => {
  assert.equal(joinParts("", ""), "");
  assert.equal(joinParts("runda=x", ""), "?runda=x");
  assert.equal(joinParts("runda=x&vy=platt", "forval=levande&dust=0.8"), "?runda=x&vy=platt&forval=levande&dust=0.8");
  assert.equal(joinParts("", "forval=levande"), "?forval=levande");
});

test("the old Scen view's address leads to / with the same question, basgrund named when it named none", () => {
  assert.equal(fromOldScen(q("forval=levande&dust=0.8")), "/?forval=levande&dust=0.8");
  assert.equal(fromOldScen(q("dust=0.8")), "/?forval=basgrund&dust=0.8");
  assert.equal(fromOldScen(q("")), "/?forval=basgrund");
  // what the Casino view's link to Scen writes (lib/casino.ts scenHref) arrives unchanged
  assert.equal(fromOldScen(q("forval=levande&room=la&dust=0.8&sway=0&zoom=1.1")), "/?forval=levande&room=la&dust=0.8&sway=0&zoom=1.1");
  assert.equal(readLook(q("forval=basgrund&dust=0.8")).forval, "basgrund");
});
