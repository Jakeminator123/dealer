// The view Material's pure parts: the rules for an added picture and the chain at a glance (studio/lib/media.ts), and the
// films in numbers per seat (components/material/films.ts). The register itself and the server are tested in
// tools/media-roles.test.ts. Run from the repo root: node --test "studio/tests/media.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type MotionRecord } from "../../src/clip-graph.ts";
import { seatGroups, takeCount } from "../components/material/films.ts";
import {
  CHAIN, ROLES, UPLOAD_ROLES, fitChip, folderName, isInside, kindOfPath, readFit, referenceChips, roleStatus, sizeWarning, sizeWords, slugName, uploadTarget, usedWords, validateRegister,
} from "../lib/media.ts";

test("a proof is not a role in Material: it is registered by its own proof.json", () => {
  assert.equal((ROLES as readonly string[]).includes("prov"), false);
  const register = (entries: unknown[]) => ({ schemaVersion: 1, dealers: { pamela: { name: "Pamela", entries } }, measures: [] });
  const old = validateRegister(register([{ id: "pamela-prov-x", role: "prov", name: "Ett prov", proof: "x" }]));
  assert.equal(old.register, null);
  assert.ok(old.errors.some((e) => e.includes("rollen prov finns inte längre: ett prov registreras av sitt proof.json")), old.errors.join(" | "));
  assert.ok(old.errors.some((e) => e.includes("proof hör inte hemma här")));
  assert.deepEqual(validateRegister(register([{ id: "pamela-vila", role: "ankare-1", name: "Vila", path: "assets/anchors/pamela-vila/anchor.png" }])).errors, []);
  assert.ok(validateRegister(register([{ id: "pamela-tom", role: "referens", name: "Utan fil" }])).errors.some((e) => e.includes("ingen fil")));
});

test("the fit chip: nothing when it fits or was not measured; a reference says what it is for and when nothing uses it", () => {
  const fit = (verdict: string, more: Record<string, unknown> = {}) => readFit({ verdict, words: "Kortet ligger 23 px från platsen.", usedBy: [], ...more });
  assert.equal(fitChip(null), null);
  assert.equal(fitChip(fit("stämmer")), null);
  assert.equal(fitChip(fit("äldre plan")), "äldre plan");
  assert.equal(fitChip(fit("annan kamera")), "annan kamera");
  assert.equal(readFit({ verdict: "kanske" }), null, "a verdict the page does not know is no fit");
  assert.deepEqual(readFit({ verdict: "går inte att mäta" }), { verdict: "går inte att mäta", words: "", for: null, usedBy: [] });
  assert.deepEqual(referenceChips(fit("annan kamera", { for: "utseende" })), ["utseende", "används inte"]);
  assert.deepEqual(referenceChips(fit("stämmer", { for: "kontroll", usedBy: ["tools/verify.ts läser den"] })), ["kontroll"]);
  assert.deepEqual(referenceChips(fit("stämmer", { for: "flyg" })), ["används inte"], "an unknown purpose is not shown");
  assert.deepEqual(referenceChips(null), []);
});

test("the chain is Jakob's order (anchor 2.3 with it), and only the first six roles take a picture from the studio", () => {
  assert.deepEqual(CHAIN, ["ingangsbild", "keystone", "ankare-1", "ankare-2.1", "ankare-2.2", "ankare-2.3", "landning", "film"]);
  assert.deepEqual(ROLES.slice(0, CHAIN.length), [...CHAIN]);
  assert.deepEqual([...UPLOAD_ROLES], ["ingangsbild", "keystone", "ankare-1", "ankare-2.1", "ankare-2.2", "ankare-2.3"]);
});

test("a folder name from what was typed: lower case, å ä ö plain, the dealer's own name not twice", () => {
  assert.equal(slugName("Sittande B, ljusare"), "sittande-b-ljusare");
  assert.equal(slugName("  Släp i kavaj — 2 "), "slap-i-kavaj-2");
  assert.equal(slugName("Ögon ÅÄ"), "ogon-aa");
  assert.equal(slugName("x".repeat(80)).length, 40);
  assert.equal(folderName("paow-vila-prov", "paow"), "vila-prov");
  assert.equal(folderName("Paow vila", "paow"), "vila");
  assert.equal(folderName("Paow", "paow"), "");
  assert.equal(folderName("Pamela vila", "paow"), "pamela-vila");
});

test("where an added picture is kept: keystones and ingångsbilder apart from anchors, in their own format", () => {
  assert.deepEqual(uploadTarget("paow", "keystone", "sittande-b", "png"), { id: "paow-sittande-b", dir: "assets/keystones/paow-sittande-b", file: "keystone.png", path: "assets/keystones/paow-sittande-b/keystone.png" });
  assert.equal(uploadTarget("paow", "ingangsbild", "jakob-3", "jpeg").path, "assets/keystones/paow-jakob-3/ingangsbild.jpg");
  assert.equal(uploadTarget("pamela", "ankare-2.2", "slap-ny", "png").path, "assets/anchors/pamela-slap-ny/anchor.png");
});

test("an anchor not in the bank's frame is warned about; a keystone may have any size", () => {
  assert.equal(sizeWarning("ankare-1", 1764, 1174), null);
  assert.match(sizeWarning("ankare-2.1", 1600, 1000) ?? "", /1764 × 1174.*1600 × 1000/);
  assert.equal(sizeWarning("keystone", 4800, 3584), null);
});

test("words: used by, size, paths", () => {
  assert.equal(usedWords(0), "används inte av någon film");
  assert.equal(usedWords(1), "används av 1 film");
  assert.equal(usedWords(15), "används av 15 filmer");
  assert.equal(sizeWords(1764, 1174), "1764 × 1174");
  assert.equal(sizeWords(null, 3), null);
  assert.ok(isInside("assets/anchors/paow-vila-ung-2/anchor.png"));
  assert.ok(!isInside("assets/../.env.local") && !isInside("D:/dealer-scratch/x.png") && !isInside("src/x.ts"));
  assert.deepEqual(["a.png", "b.JPG", "c.mp4", "assets/proofs/x", "d.json"].map(kindOfPath), ["image", "image", "video", "folder", "other"]);
});

test("how a role stands: what holds, candidates only, or missing", () => {
  const dealer = {
    missing: { keystone: "ingen i hög upplösning", "ankare-2.1": "inget nyp i det nya utseendet" },
    entries: [
      { role: "ingangsbild" as const },
      { role: "keystone" as const },
      { role: "ankare-1" as const, state: "kandidat" as const },
      { role: "ankare-1" as const, state: "ersatt" as const },
      { role: "ankare-2.1" as const, state: "ersatt" as const },
      { role: "ankare-2.2" as const, state: "gäller" as const },
    ],
  };
  assert.equal(roleStatus(dealer, "ingangsbild"), "finns");
  assert.equal(roleStatus(dealer, "keystone"), "saknas", "low-resolution pictures and a word that it is missing");
  assert.equal(roleStatus(dealer, "ankare-1"), "kandidat");
  assert.equal(roleStatus(dealer, "ankare-2.1"), "saknas");
  assert.equal(roleStatus(dealer, "ankare-2.2"), "gäller");
  assert.equal(roleStatus(dealer, "landning"), "saknas");
  assert.equal(roleStatus(dealer, "film", 0), "saknas");
  assert.equal(roleStatus(dealer, "film", 109), "finns");
});

test("the films per seat: rest and entry, each seat, the dealer and the experiments, counted in four groups", () => {
  type Review = NonNullable<MotionRecord["review"]>;
  const rows: [string, string, string, string, Review | null][] = [
    ["pamela-idle-ready-entry-01", "IDLE", "READY", "ENTRY", { decision: "ACCEPTED", userAccepted: true, userReview: "Jakob: ja" }],
    ["pamela-p4-c1-plan-deal-02", "READY", "LAND(P4.C1)", "DEAL", { decision: "ACCEPTED", userAccepted: true, userReview: "Jakob: ja" }],
    ["pamela-p4-c1-plan-deal-03", "READY", "LAND(P4.C1)", "DEAL", { decision: "REJECTED", userReview: "Jakob: nej" }],
    ["pamela-p4-c2-plan-deal-01", "READY", "LAND(P4.C2)", "DEAL", { decision: "ACCEPTED", acceptedAs: "VARIANT", userReview: "Jakob: variant" }],
    ["pamela-d-c1-plan-deal-01", "READY", "LAND(D.C1)", "DEAL", null],
    ["pamela-readyb-draw-01", "READY-B", "DRAWN", "DEAL", { decision: "REJECTED" }],
  ];
  const jobs: BankJob[] = rows.map(([id, from, to, kind]) => ({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" }));
  const data: BankData = {
    jobs,
    motions: Object.fromEntries(rows.map(([id, , , , review]) => [id, { source: { frames: 120, fps: 30 }, ...(review ? { review } : {}) }])),
    media: Object.fromEntries(rows.map(([id]) => [id, { video: `assets/motions/${id}/source.mp4` }])),
    revisions: {},
  };
  const graph = buildGraph(data);
  const groups = seatGroups(graph);
  assert.deepEqual(groups.map((g) => g.key), ["vila", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "D", "prov"]);
  const by = (key: string) => groups.find((g) => g.key === key)!;
  assert.deepEqual([by("vila").takes, by("vila").counts.accepted], [1, 1]);
  assert.deepEqual([by("P4").takes, by("P4").steps, by("P4").counts.accepted, by("P4").counts.variants, by("P4").counts.rejected], [3, 2, 1, 1, 1]);
  assert.deepEqual([by("D").takes, by("D").counts.waiting], [1, 1]);
  assert.deepEqual([by("prov").takes, by("prov").counts.rejected], [1, 1]);
  assert.equal(by("P1").takes, 0);
  assert.equal(takeCount(graph), rows.length);
});
