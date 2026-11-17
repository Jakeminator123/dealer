// studio/lib/lineage.ts and the choice by hand (studio/components/material/state.ts): what a take was built on, when it is
// marked older, what the dialog says before a change, and which changes a picture offers.
import test from "node:test";
import assert from "node:assert/strict";
import { traceTakes, olderOf, consequenceOfHolding, fromOlderChip, traceShare, builtOnPicture, olderChip } from "../lib/lineage.ts";
import { allowed, offered, ACTION } from "../components/material/state.ts";
import { validateRegister, roleStatus, type Entry } from "../lib/media.ts";

const anchor = (id: string, state: Entry["state"], extra: Partial<Entry> = {}): Entry => ({ id, role: "ankare-2.2", name: id, path: `assets/anchors/${id}/anchor.png`, node: "READY-B", state, ...extra });

test("a take is traced to the entries its first and last picture were made from: by path, by an order's from.entry, by sha256, by a frame", () => {
  const entries = [
    { ...anchor("paow-vila", "gäller", { role: "ankare-1", node: "IDLE" }), sha256: "aa" },
    { ...anchor("paow-slap-a", "ersatt"), sha256: "bb" },
    { id: "pamela-vila", role: "ankare-1" as const, name: "Vila", path: "assets/motions/pamela-idle/source.mp4", frame: 0 },
  ];
  const takes = [
    { id: "t-path", first: { file: { path: "assets/anchors/paow-vila/anchor.png" } }, last: { file: { path: "assets/orders/o/last.png", sha256: "zz" } } },
    { id: "t-order", first: { file: { path: "assets/orders/o/first.png", sha256: "11" } } },
    { id: "t-sha", first: { file: { path: "assets/elsewhere/copy.png", sha256: "bb" } } },
    { id: "t-frame", first: { frame: { video: "assets/motions/pamela-idle/source.mp4", index: 0 } } },
    { id: "whole", clip: "whole", frames: [0, 100] as [number, number], first: { file: { path: "assets/anchors/paow-vila/anchor.png" } }, last: { file: { path: "assets/anchors/paow-slap-a/anchor.png" } } },
    { id: "whole-deal", clip: "whole", frames: [0, 60] as [number, number] },
    { id: "whole-back", clip: "whole", frames: [61, 100] as [number, number] },
  ];
  const l = traceTakes(entries, takes, [{ path: "assets/orders/o/first.png", sha256: "11", from: { entry: "paow-slap-a" } }, { path: "assets/orders/o/last.png", from: null }]);
  assert.deepEqual(l["t-path"], { first: "paow-vila", last: null }, "the order's built last picture names no entry");
  assert.deepEqual(l["t-order"], { first: "paow-slap-a", last: null });
  assert.deepEqual(l["t-sha"], { first: "paow-slap-a", last: null });
  assert.deepEqual(l["t-frame"], { first: "pamela-vila", last: null });
  assert.deepEqual([l["whole-deal"], l["whole-back"]], [{ first: "paow-vila", last: null }, { first: null, last: "paow-slap-a" }], "a piece takes the film's first or last picture where it starts or ends with it");
  assert.deepEqual(builtOnPicture(l, "paow-slap-a").sort(), ["t-order", "t-sha", "whole", "whole-back"]);
  assert.deepEqual(traceShare(l, ["t-path", "whole", "nothing"]), { both: 0 + 1, one: 1, none: 1, total: 3 });
});

test("a take is marked older only where another picture holds its place now; one level, and a state-less picture is never older", () => {
  const entries = [anchor("a22-old", "ersatt"), anchor("a22-new", "gäller"), anchor("a22-cand", "kandidat"), { ...anchor("pam", undefined), node: "READY-C" }];
  assert.deepEqual(olderOf({ first: "a22-old", last: "a22-new" }, entries), [{ side: "first", built: "a22-old", holds: "a22-new", chip: "äldre ankare 2.2" }]);
  assert.deepEqual(olderOf({ first: "a22-cand", last: null }, entries).map((o) => o.chip), ["äldre ankare 2.2"], "a candidate beside the one that holds is older too");
  assert.deepEqual(olderOf({ first: "pam", last: null }, entries), [], "no state: nothing to compare with");
  assert.deepEqual(olderOf(undefined, entries), []);
  assert.equal(olderChip({ role: "landning" }), "äldre landning");
});

test("before a change of the picture that holds, one line says how many clips become marked", () => {
  const entries = [anchor("a22-old", "gäller"), anchor("a22-new", "kandidat")];
  const lineage = { t1: { first: "a22-old", last: null }, t2: { first: null, last: "a22-old" }, t3: { first: "a22-new", last: null } };
  const c = consequenceOfHolding(entries, entries[1], lineage);
  assert.deepEqual(c.takes.sort(), ["t1", "t2"]);
  assert.equal(c.line, "2 klipp är byggda på den bild som gäller nu och blir markerade som äldre. De spelas som förut tills du väljer annat.");
  assert.match(consequenceOfHolding(entries, entries[0], { t3: { first: "x", last: null } }).line, /^Inga klipp/);
});

test("an anchor made from a keystone that no longer holds has its own chip; its clips are not marked for that", () => {
  const k = (id: string, state: Entry["state"]): Entry => ({ id, role: "keystone", name: `Stående ${id}`, path: `assets/keystones/${id}/keystone.png`, state });
  const entries: Entry[] = [k("ks-old", "ersatt"), k("ks-new", "gäller"), { ...anchor("vila", "gäller", { role: "ankare-1", node: "IDLE" }), builtOn: ["ks-old"] }, { ...anchor("vila-2", "kandidat", { role: "ankare-1", node: "IDLE" }), builtOn: ["ks-new"] }];
  assert.equal(fromOlderChip(entries[2], entries), "från äldre keystone");
  assert.equal(fromOlderChip(entries[3], entries), null);
  assert.deepEqual(olderOf({ first: "vila", last: null }, entries), [], "the clip on the anchor that holds is not marked");
});

test("by hand: any picture can be made the one that holds, set aside or archived; an archived one comes back as a candidate", () => {
  assert.ok(allowed("ersatt", "gäller"), "one set aside before can hold again (2026-11-18)");
  assert.ok(allowed(undefined, "gäller"), "a picture without a state counts as a candidate");
  assert.ok(allowed("gäller", "arkiverad") && allowed("kandidat", "arkiverad") && allowed("ersatt", "arkiverad"));
  assert.ok(!allowed("arkiverad", "gäller"), "an archived picture comes back first");
  assert.deepEqual(offered("arkiverad"), ["kandidat"]);
  assert.deepEqual(offered("gäller"), ["ersatt", "arkiverad"]);
  assert.equal(ACTION.arkiverad.button, "Arkivera");
  assert.equal(ACTION.kandidat.button, "Ta tillbaka");
});

test("the register takes the state arkiverad and builtOn naming its own pictures; an archived picture does not count in its role", () => {
  const reg = (entries: object[]) => ({ schemaVersion: 1, dealers: { paow: { name: "Paow", entries } }, measures: [] });
  const ok = validateRegister(reg([anchor("a", "arkiverad"), { ...anchor("b", "gäller"), builtOn: ["a"] }]));
  assert.deepEqual(ok.errors, []);
  assert.match(validateRegister(reg([{ ...anchor("b", "gäller"), builtOn: ["nowhere"] }])).errors.join(" "), /builtOn nämner nowhere/);
  assert.match(validateRegister(reg([{ ...anchor("b", "gäller"), builtOn: ["b"] }])).errors.join(" "), /builtOn är en lista/);
  assert.equal(roleStatus({ entries: [anchor("a", "arkiverad")] }, "ankare-2.2"), "saknas");
});
