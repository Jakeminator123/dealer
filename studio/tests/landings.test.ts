// Material's station Landningar per seat (studio/components/material/landings.ts): which seats have an end picture of their
// own for a deal bara dit, which have none, and that one seat's picture never counts for another. On the checkout: Paow has
// no landing picture that holds (the lone one, for seat 4, is set aside), and her register says nothing else.
// Run: node --test "studio/tests/landings.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCutChecks, type BankFacts } from "../../src/order-model.ts";
import { endWord, seatEnds, seatEndsCount, seatEndsStatus, seatLabel } from "../components/material/landings.ts";

const landing = (card: string, state = "gäller") => ({ id: `l-${card}`, role: "landning", node: `LAND(${card})`, card, state, name: `Landning ${card}` });
const straight = { decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-13: bra" };
const trip = (clip: string, target: string, cut: number, node = "READY") => [{ id: `${clip}-deal`, from: node, to: target, clip, frames: [0, cut] as [number, number], dealer: "paow" }, { id: `${clip}-return`, from: target, to: node, clip, frames: [cut + 1, cut + 60] as [number, number], dealer: "paow" }];
const bank: BankFacts = {
  derived: [...trip("paow-p1", "P1.C1", 112), ...trip("paow-p4", "P4.C1", 108), ...trip("paow-p4-slap", "P4.C1", 126, "READY-B"), ...trip("paow-p6", "P6.C1", 90)],
  motions: { "paow-p1-return": { review: straight }, "paow-p4-return": { review: straight }, "paow-p4-slap-return": { review: straight }, "paow-p6-return": { review: { decision: "ACCEPTED", acceptedAs: "VARIANT", userAccepted: true } } },
};

test("each seat has its own end picture or none: a landing picture first, else the cut frame of the bank's own film there", () => {
  const rows = seatEnds([landing("P5.C1"), landing("P4.C1", "ersatt"), landing("P7.C1", "arkiverad")], bank, "paow");
  assert.deepEqual(rows.map((r) => r.label), ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "Dealer", "Hålkort"]);
  const word = Object.fromEntries(rows.map((r) => [r.label, [endWord(r.pinch), endWord(r.drag)]]));
  assert.deepEqual(word.P1, ["snittruta", "ingen slutbild"], "the pinch's own film; nothing from the drag");
  assert.deepEqual(word.P4, ["snittruta", "snittruta"], "a landing picture set aside does not hold: the cut frames of the two films");
  assert.deepEqual(word.P5, ["landningsbild", "landningsbild"], "the seat's own landing picture, from either anchor");
  assert.deepEqual(word.P6, ["ingen slutbild", "ingen slutbild"], "a return approved only as a variant gives no cut frame");
  assert.deepEqual(word.P7, ["ingen slutbild", "ingen slutbild"], "an archived picture is out of play");
  assert.deepEqual(word.P2, ["ingen slutbild", "ingen slutbild"], "seat 5's picture is never seat 2's");
  const p4 = rows.find((r) => r.target === "P4.C1")!;
  assert.deepEqual([p4.pinch?.kind === "SNITTRUTA" && p4.pinch.cut.clip, p4.drag?.kind === "SNITTRUTA" && p4.drag.cut.clip], ["paow-p4", "paow-p4-slap"]);
  // The station's sign and count: per seat, never one picture as if it were all.
  const state = seatEndsStatus(rows);
  assert.deepEqual([state.status, state.have, state.total, seatEndsCount(state)], ["gäller", 3, 9, "3 av 9 platser har en slutbild"]);
  assert.equal(seatEndsStatus(seatEnds([], bank, "paow")).status, "finns", "cut frames only: something is there, nothing is a landing picture that holds");
  assert.deepEqual(seatEndsStatus(seatEnds([], null, "paow")), { status: "saknas", have: 0, total: 9 });
  assert.equal(seatEndsStatus(seatEnds([], bank, "pamela")).have, 0, "another dealer's films are not hers");
  assert.deepEqual([seatLabel("D.C1"), seatLabel("D.C2"), seatLabel("P3.C1")], ["Dealer", "Hålkort", "P3"]);
});

test("on the checkout: the cut frames are checked against the films, and only seat 3 and seat 4 have an end picture for Paow", () => {
  const file = JSON.parse(readFileSync(new URL("../../data/cut-frames.json", import.meta.url), "utf8"));
  const checks = readCutChecks(file);
  assert.equal(Object.keys(checks).length, file.frames.length, "every row of the file reads");
  assert.ok(file.frames.length >= 20 && file.about.length > 100 && /^[0-9a-f]{64}$/.test(file.plan.sha256));
  const holds = (step: string) => [...new Set(file.frames.filter((f: { step: string; holds: boolean; dealer: string }) => f.dealer === "paow" && f.step === step && f.holds).map((f: { target: string }) => f.target))].sort();
  assert.deepEqual(holds("GIV-2.1"), ["P3.C1", "P4.C1"], "from anchor 2.1");
  assert.deepEqual(holds("GIV-2.2"), ["P4.C1"], "from anchor 2.2");
  // The bank as the checkout has it, with those checks: the same seats, and no other, in Material's row.
  const jobs = JSON.parse(readFileSync(new URL("../../data/clip-jobs.json", import.meta.url), "utf8"));
  const motions: NonNullable<BankFacts["motions"]> = {};
  const record = (id: string) => { try { return JSON.parse(readFileSync(new URL(`../../motions/${id}.json`, import.meta.url), "utf8")); } catch { return null; } };
  for (const d of jobs.derived as { id: string; clip: string }[]) { const own = record(d.id); motions[d.id] = { review: own?.review, motion: own?.motion }; if (!(d.clip in motions)) motions[d.clip] = record(d.clip); }
  const bank: BankFacts = { jobs: jobs.jobs, derived: jobs.derived, motions, cutChecks: checks };
  const entries = JSON.parse(readFileSync(new URL("../../data/media-roles.json", import.meta.url), "utf8")).dealers.paow.entries;
  const rows = seatEnds(entries, bank, "paow");
  assert.deepEqual(rows.filter((r) => r.pinch).map((r) => r.label), ["P3", "P4"]);
  assert.deepEqual(rows.filter((r) => r.drag).map((r) => r.label), ["P4"]);
  assert.deepEqual(seatEndsStatus(rows), { status: "finns", have: 2, total: 9 });
  // Without the written-down checks seven seats would look as if they had one: the file is what keeps Material and the store alike.
  assert.equal(seatEndsStatus(seatEnds(entries, { ...bank, cutChecks: {} }, "paow")).have, 7);
});

test("on the checkout: no landing picture holds for Paow, the lone seat-4 picture is set aside with who and why, and no note says otherwise", () => {
  const register = JSON.parse(readFileSync(new URL("../../data/media-roles.json", import.meta.url), "utf8"));
  const paow = register.dealers.paow;
  const landings = paow.entries.filter((e: { role: string }) => e.role === "landning");
  assert.deepEqual(landings.map((e: { id: string; state: string }) => [e.id, e.state]), [["paow-landning-p4-giv-t2", "ersatt"]], "set aside, not deleted");
  assert.match(landings[0].stateBy, /gäller → ersatt \(huvudagentens beslut på Jakobs ord i huvudagentens chatt 2026-11-18/);
  assert.match(landings[0].stateBy, /^Jakob 2026-11-13 02:39: kandidat → gäller \(Material\); /, "what he did himself in Material stays said");
  assert.equal(paow.missing?.landning, undefined, "the station shows seat by seat what holds; no note beside it says something else");
  // Anchor 2.3 holds, on his yes in Beslut.
  const a23 = paow.entries.filter((e: { role: string; state: string }) => e.role === "ankare-2.3" && e.state === "gäller");
  assert.deepEqual(a23.map((e: { id: string; node: string; path: string }) => [e.id, e.node, e.path]), [["paow-ankare-2-3-a", "READY-C", "assets/anchors/paow-ankare-2-3-a/anchor.png"]]);
  assert.match(a23[0].stateBy, /hans ja i Beslut 2026-11-18/);
});
