// Whose studio it is (studio/lib/dealer.ts) and that every reader of the graph keeps to one dealer's takes: Granska's queue,
// Primära's seam, the Primär rule, Scen's round. A small bank made here with Pamela's films and a second dealer's few, cut
// as the order register cuts them (a deal and its return out of one film). Decisions are written to a temporary folder.
// Run from the repo root: node --test "studio/tests/dealer.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGraph, dealersOf, resolveRound, type BankData, type BankJob, type DerivedTake, type MotionRecord } from "../../src/clip-graph.ts";
import { applyProvisional, reviewStore } from "../../tools/review-store.ts";
import { decide, type Put } from "../lib/decide.ts";
import {
  DEFAULT_DEALER,
  addressWord,
  bankDealers,
  chooseDealer,
  dealerEntries,
  dealerGraphs,
  dealerHref,
  filmsLine,
  openingRound,
  ownSteps,
  readDealerAddress,
  readDealerRegister,
  withDealer,
  withoutDealer,
} from "../lib/dealer.ts";
import { takeName, takeNames } from "../lib/names.ts";
import { primaries, seamWith } from "../lib/primaries.ts";
import { reviewQueue } from "../lib/review.ts";
import { readyRounds } from "../lib/rounds.ts";
import { awaitingJakob, primarCount } from "../lib/verdict.ts";

const job = (id: string, from: string, to: string, kind: string, extra: Partial<BankJob> = {}): BankJob => ({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "", ...extra });
const jakob = (said: string) => `Jakob 2026-11-12: ${said}`;

/** Pamela: an entry, a deal to P4 with its return, both his; Paow: an entry and one film cut into a deal and its return, all in the inbox. */
function bank(): BankData {
  const jobs = [
    job("pamela-entry-01", "IDLE", "READY", "ENTRY"),
    job("pamela-p4-deal-01", "READY", "P4.C1", "DEAL"),
    job("pamela-p4-back-01", "P4.C1", "READY", "RETURN", { first: { frame: { video: "assets/motions/pamela-p4-deal-01/source.mp4", videoSha256: "", index: 90 } } }),
    job("pamela-p4-idle-01", "P4.C1", "IDLE", "RETURN", { first: { frame: { video: "assets/motions/pamela-p4-deal-01/source.mp4", videoSha256: "", index: 90 } } }),
  ];
  const derived: DerivedTake[] = [
    { id: "paow-entry-01", kind: "ENTRY", from: "IDLE", to: "READY", clip: "paow-entry-01", frames: [0, 117], dealer: "paow" },
    { id: "paow-p4-01-deal", kind: "DEAL", from: "READY", to: "P4.C1", clip: "paow-p4-01", frames: [0, 102], dealer: "paow" },
    { id: "paow-p4-01-return-ready", kind: "RETURN", from: "P4.C1", to: "READY", clip: "paow-p4-01", frames: [103, 168], dealer: "paow" },
  ];
  const motions: Record<string, MotionRecord> = {
    "pamela-entry-01": { source: { frames: 120, fps: 30 }, review: { decision: "ACCEPTED", userAccepted: true, userReview: jakob("bra") } },
    "pamela-p4-deal-01": { source: { frames: 120, fps: 30 }, review: { decision: "ACCEPTED", acceptedAs: "MAIN", userAccepted: true, userReview: jakob("primär") } },
    "pamela-p4-back-01": { source: { frames: 60, fps: 30 }, review: { decision: "ACCEPTED", userAccepted: true, userReview: jakob("bra") } },
    "pamela-p4-idle-01": { source: { frames: 60, fps: 30 }, review: { decision: "ACCEPTED", userAccepted: true, userReview: jakob("bra") } },
    "paow-entry-01": { source: { frames: 118, fps: 24 }, review: { decision: "PENDING", inbox: true } },
    "paow-p4-01-deal": { source: { frames: 169, fps: 24 }, review: { decision: "PENDING", inbox: true } },
    // As tools/register-order.ts writes it: the return starts on the frame after the deal's last.
    "paow-p4-01-return-ready": { source: { frames: 169, fps: 24 }, motion: { startsOn: { clip: "paow-p4-01-deal", frame: 103 } }, review: { decision: "PENDING", inbox: true } },
  };
  const media: BankData["media"] = {
    ...Object.fromEntries(jobs.map((j) => [j.id, { video: `assets/motions/${j.id}/source.mp4` }])),
    "paow-entry-01": { video: "assets/motions/paow-entry-01/source.mp4" },
    "paow-p4-01-deal": { video: "assets/motions/paow-p4-01/source.mp4" },
    "paow-p4-01-return-ready": { video: "assets/motions/paow-p4-01/source.mp4" },
  };
  const ids = [...jobs.map((j) => j.id), ...derived.map((d) => d.id)];
  return { jobs, derived, edits: [], motions, media, revisions: Object.fromEntries(ids.map((id) => [id, `"${id}"`])) };
}

test("the bank's dealers: Pamela first, also without a take, then the others as their first take comes", () => {
  const owners = dealersOf(bank());
  assert.deepEqual(bankDealers(owners), ["pamela", "paow"]);
  assert.deepEqual(bankDealers({}), [DEFAULT_DEALER]);
  assert.deepEqual(bankDealers({ a: "paow", b: "BAD id", c: "paow" }), ["pamela", "paow"]);
});

test("names and the pause come from data/dealers.json; without it a dealer is her id with a capital", async () => {
  const register = readDealerRegister({ dealers: [{ id: "pamela", name: "Pamela", paused: "Jakob 2026-11-12: inget nytt." }, { id: "paow", name: " Paow ", paused: null }, { id: "Bad Id", name: "X" }, null] });
  assert.deepEqual(register, { pamela: { name: "Pamela", paused: "Jakob 2026-11-12: inget nytt." }, paow: { name: "Paow", paused: null } });
  assert.deepEqual(readDealerRegister(null), {});
  // The checkout's own register reads (only read here).
  const own = readDealerRegister(JSON.parse(await readFile("data/dealers.json", "utf8")));
  assert.equal(own.pamela?.name, "Pamela");
  assert.ok(own.paow?.name);
  const graphs = dealerGraphs(bank(), ["pamela", "paow", "nyn"]);
  const entries = dealerEntries(["pamela", "paow", "nyn"], graphs, register);
  assert.deepEqual(
    entries.map((e) => [e.id, e.name, !!e.paused, e.takes, e.waiting]),
    [
      ["pamela", "Pamela", true, 4, 0],
      ["paow", "Paow", false, 3, 3],
      ["nyn", "Nyn", false, 0, 0],
    ],
  );
});

test("the address wins, then a take it names, then the memory, then Pamela; only dealers there are", () => {
  const owners = dealersOf(bank());
  const known = ["pamela", "paow"];
  const at = (query: string) => readDealerAddress(new URLSearchParams(query));
  assert.deepEqual(chooseDealer({ address: at("dealer=paow"), remembered: "pamela", known, owners }), { id: "paow", from: "address" });
  assert.deepEqual(chooseDealer({ address: at("dealer=pamela&tagning=paow-p4-01-deal"), remembered: "paow", known, owners }), { id: "pamela", from: "address" });
  // An old link to one of Pamela's takes opens her studio, whatever is remembered; Jämför's a and b count as well.
  assert.deepEqual(chooseDealer({ address: at("tagning=pamela-p4-deal-01"), remembered: "paow", known, owners }), { id: "pamela", from: "take" });
  assert.deepEqual(chooseDealer({ address: at("kant=READY%3EP4.C1&a=paow-p4-01-deal"), remembered: null, known, owners }), { id: "paow", from: "take" });
  assert.deepEqual(chooseDealer({ address: at("vy=alla"), remembered: "paow", known, owners }), { id: "paow", from: "memory" });
  assert.deepEqual(chooseDealer({ address: at(""), remembered: null, known, owners }), { id: "pamela", from: "default" });
  // A dealer there is not: the next rule decides. While the bank is read, any well-formed word stands.
  assert.deepEqual(chooseDealer({ address: at("dealer=nobody"), remembered: "paow", known, owners }), { id: "paow", from: "memory" });
  assert.deepEqual(chooseDealer({ address: at("dealer=Paow"), remembered: "gone", known, owners }), { id: "pamela", from: "default" });
  assert.deepEqual(chooseDealer({ address: at("dealer=nyn"), remembered: null, known: null, owners: {} }), { id: "nyn", from: "address" });
  assert.deepEqual(chooseDealer({ address: null, remembered: null, known: null, owners: {} }), { id: "pamela", from: "default" });
});

test("the address keeps the dealer: set, replaced or taken out, every other word as it was written", () => {
  assert.equal(withDealer("?runda=A1%20-%20A2.1&forval=levande", "paow"), "?runda=A1%20-%20A2.1&forval=levande&dealer=paow");
  assert.equal(withDealer("runda=x+y&dealer=pamela&vy=platt", "paow"), "?runda=x+y&vy=platt&dealer=paow");
  assert.equal(withDealer("?dealer=paow", null), "");
  assert.equal(withDealer("", "paow"), "?dealer=paow");
  assert.equal(withoutDealer("?kant=READY%3EP4.C1&dealer=paow&tagning=t"), "?kant=READY%3EP4.C1&tagning=t");
  assert.equal(withoutDealer(""), "");
  // A dealer word that is a prefix of another word is no dealer word.
  assert.equal(withoutDealer("?dealers=2&dealer=paow"), "?dealers=2");
  assert.equal(dealerHref("/granska/", "pamela"), "/granska/");
  assert.equal(dealerHref("/granska/", "paow"), "/granska/?dealer=paow");
  assert.equal(dealerHref("/granska/?vy=alla", "paow"), "/granska/?vy=alla&dealer=paow");
  assert.equal(dealerHref("/", "paow"), "/?dealer=paow");
});

test("the address names Pamela only where a take of another dealer's would otherwise decide", () => {
  const owners = dealersOf(bank());
  const at = (query: string) => readDealerAddress(new URLSearchParams(query));
  assert.equal(addressWord("paow", at(""), owners), "paow");
  assert.equal(addressWord("pamela", at("vy=alla"), owners), null);
  assert.equal(addressWord("pamela", at("tagning=pamela-p4-deal-01"), owners), null);
  assert.equal(addressWord("pamela", at("tagning=paow-p4-01-deal"), owners), "pamela");
});

test("Granska: each dealer's queue holds her own takes only, both takes of one film among them, and the films play their own frames", () => {
  const data = bank();
  const pamela = buildGraph(data);
  const paow = buildGraph(data, { dealer: "paow" });
  assert.deepEqual(awaitingJakob(pamela), []);
  const queue = reviewQueue(paow, new Map());
  assert.equal(queue.waiting, 3);
  assert.deepEqual(queue.items.map((i) => [i.take.id, i.group]), [
    ["paow-entry-01", "Ingång"],
    ["paow-p4-01-deal", "P4"],
    ["paow-p4-01-return-ready", "P4"],
  ]);
  const [deal, back] = [paow.takes["paow-p4-01-deal"], paow.takes["paow-p4-01-return-ready"]];
  assert.equal(deal.media.video, back.media.video, "one film, two takes");
  assert.deepEqual([deal.segment, back.segment], [{ clip: "paow-p4-01", start: 0, end: 102 }, { clip: "paow-p4-01", start: 103, end: 168 }]);
  // No card track yet: nothing in the take claims one.
  assert.equal(deal.media.track ?? null, null);
  assert.ok(deal.revision, "a decision can be sent: the take has its record's revision");
  // The rail's counts follow the chosen graph: 3 of 33 films for Paow, none Primär.
  assert.deepEqual(primarCount(paow), { set: 0, total: 33 });
  assert.equal(filmsLine(paow, "Paow"), "Paow har 3 av 33 filmer");
});

test("another dealer's takes are named as Pamela's are: what the edge does and the take's number, not her order's words", () => {
  const named = (id: string, edge: string, kind: "DEAL" | "RETURN" | "ENTRY", dealer = "paow") => takeName({ id, edge, kind, dealer });
  assert.equal(named("paow-giv-p4-01-deal", "READY>P4.C1", "DEAL"), "Giv 01");
  assert.equal(named("paow-giv-p4-02-return-ready", "P4.C1>READY", "RETURN"), "Retur 02");
  assert.equal(named("paow-ingang-2-1-01-01", "IDLE>READY", "ENTRY"), "Ingång 01 01");
  assert.equal(named("paow-ingang-2-1-02-01", "IDLE>READY", "ENTRY"), "Ingång 02 01");
  // Pamela's names are as they were, also where her id has the same words.
  assert.equal(named("pamela-p4-c1-plan-deal-02", "READY>P4.C1", "DEAL", "pamela"), "Giv 02");
  assert.equal(takeName({ id: "pamela-giv-p4-01", edge: "READY>P4.C1", kind: "DEAL" }), "Giv giv p4 01");
  // The two takes of one edge stay apart in the graph's own lists.
  const paow = buildGraph(bank(), { dealer: "paow" });
  assert.deepEqual([...takeNames(paow.edge["READY>P4.C1"].takes).values()], ["Giv 01"]);
});

test("Primär lowers only the take's own dealer's Primär, never another dealer's on the same edge", async () => {
  const data = bank();
  const paow = buildGraph(data, { dealer: "paow" });
  const pamela = buildGraph(data);
  const calls: [string, string][] = [];
  const put: Put = async (id, decision) => {
    calls.push([id, decision]);
    return { id, review: { decision }, revision: `"${id}-2"` };
  };
  const take = paow.takes["paow-p4-01-deal"];
  assert.deepEqual(await decide(take, "MAIN", "", pamela, put), { lowered: [], failed: [] });
  assert.deepEqual(calls, [["paow-p4-01-deal", "MAIN"]], "Pamela's Primär on READY>P4.C1 is left alone");
  calls.length = 0;
  await decide(take, "MAIN", "", paow, put);
  assert.deepEqual(calls, [["paow-p4-01-deal", "MAIN"]]);
});

test("Primära: the seam a Primär would give is reckoned in the dealer's own graph", () => {
  const data = bank();
  const paow = buildGraph(data, { dealer: "paow" });
  const seam = seamWith(data, paow, paow.takes["paow-p4-01-return-ready"]);
  assert.deepEqual(seam, { tone: "ok", text: "Fortsätter given som spelas nu." }, "her own deal, never Pamela's");
  const page = primaries(data, paow);
  assert.equal(page.rows.length, 33);
  assert.equal(page.counts.gap, 30);
  assert.deepEqual(page.praised, []);
});

test("Scen: a dealer with few films plays the ready round she has films for, and a step locked to Pamela's take plays hers", () => {
  const data = bank();
  const rounds = readyRounds();
  const favourite = rounds[0];
  // The favourite round locks three of Pamela's takes; in the real bank they are hers.
  const owners = { ...dealersOf(data), ...Object.fromEntries(favourite.steps.flatMap((s) => (s.take ? [[s.take, "pamela"]] : []))) };
  const paow = buildGraph(data, { dealer: "paow" });
  // Pamela's favourite (seat 4 back to rest) has a gap for Paow; seat 4 with two cards, back to A2.1, has none.
  const opening = openingRound(paow, rounds, owners);
  assert.equal(opening?.key, "plats-4-tva");
  assert.ok(favourite.steps.some((s) => s.take));
  const steps = ownSteps(favourite.steps, "paow", owners);
  assert.ok(steps.every((s) => !s.take), "Pamela's locks are no locks for Paow");
  assert.deepEqual(ownSteps(favourite.steps, "pamela", owners), favourite.steps);
  const segments = resolveRound(paow, steps, { holeCardDown: true });
  assert.deepEqual(segments.map((s) => s.take?.id ?? s.gap), ["paow-entry-01", "paow-p4-01-deal", "MISSING"]);
  // With no films at all there is still a round to show (all gaps), never Pamela's films.
  const none = buildGraph(data, { dealer: "nyn" });
  const empty = openingRound(none, rounds, owners);
  assert.ok(empty);
  assert.ok(resolveRound(none, ownSteps(empty.steps, "nyn", owners)).every((s) => !s.take));
});

test("a decision on a take of the second dealer is written by the same route to her own record, and she leaves the queue", async (t) => {
  const base = existsSync("D:/dealer-scratch/tmp") ? "D:/dealer-scratch/tmp" : os.tmpdir();
  const root = await mkdtemp(path.join(base, "dealer-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "motions"));
  const id = "paow-p4-01-deal";
  const record = { schemaVersion: 1, id, dealer: "paow", source: { path: "assets/motions/paow-p4-01/source.mp4", frames: 169, fps: 24 }, motion: { kind: "DEAL", from: "READY", to: "P4.C1", segment: { clip: "paow-p4-01", frames: [0, 102] } }, review: { decision: "PENDING", inbox: true, userAccepted: false } };
  await writeFile(path.join(root, "motions", `${id}.json`), JSON.stringify(record, null, 2) + "\n");
  const store = reviewStore(root, () => "2026-11-13");
  const { revision } = await store.load(id);
  const saved = await store.save(id, { decision: "ACCEPTED", note: "fin giv" }, revision);
  const written = JSON.parse(await readFile(path.join(root, "motions", `${id}.json`), "utf8"));
  assert.equal(written.review.decision, "ACCEPTED");
  assert.equal(written.review.userAccepted, true);
  assert.equal(written.review.inbox, undefined, "his decision takes it out of the inbox");
  assert.match(written.review.userReview, /^Jakob 2026-11-13: fin giv$/);
  assert.deepEqual({ ...written, review: undefined }, { ...record, review: undefined }, "nothing outside review changes");
  // The bank read again: the take no longer waits, the other two still do.
  const data = bank();
  data.motions![id] = { ...data.motions![id], review: saved.review as MotionRecord["review"] };
  assert.deepEqual(awaitingJakob(buildGraph(data, { dealer: "paow" })).map((t) => t.id), ["paow-entry-01", "paow-p4-01-return-ready"]);
});

test("a take judged for Jakob does not count as waiting, in the dealer switch nor in her queue", () => {
  const data = bank();
  const forHim = applyProvisional(data.motions!["paow-entry-01"].review, { decision: "ACCEPTED", by: "huvudagenten och en oberoende granskare", mandate: "Jakob 2026-11-13: godkänn allt.", note: "Ren ingång." }, "2026-11-13T16:00:00.000Z");
  data.motions!["paow-entry-01"] = { ...data.motions!["paow-entry-01"], review: forHim as MotionRecord["review"] };
  const graphs = dealerGraphs(data, ["pamela", "paow"]);
  assert.deepEqual(dealerEntries(["pamela", "paow"], graphs, null).map((e) => [e.id, e.takes, e.waiting]), [
    ["pamela", 4, 0],
    ["paow", 3, 2],
  ]);
  const queue = reviewQueue(graphs.paow, new Map());
  assert.equal(queue.waiting, 2);
  assert.deepEqual(queue.items.map((i) => i.take.id), ["paow-p4-01-deal", "paow-p4-01-return-ready"]);
});
