// Granska's queue and Jämför's choices (studio/lib/review.ts), on a small bank made here.
// Run from the repo root: node --test "studio/tests/review.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type MotionRecord } from "../../src/clip-graph.ts";
import {
  choiceEdges,
  compareFacts,
  comparePair,
  filterTakes,
  inReviewOrder,
  nextWaiting,
  previousWaiting,
  reviewGroup,
  reviewKey,
  reviewQueue,
  reviewerNotes,
  seatOf,
  seatOptions,
  verdictCounts,
} from "../lib/review.ts";
import { awaitingJakob } from "../lib/verdict.ts";

const job = (id: string, from: string, to: string, kind: string, model = "wan3"): BankJob => ({ id, kind, target: null, from, to, model, duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });
const jakob = (said: string) => `Jakob 2026-11-12: ${said}`;
type Review = NonNullable<MotionRecord["review"]>;

function bank(): BankData {
  const jobs = [
    job("p4-deal-01", "READY", "P4.C1", "DEAL"),
    job("p4-deal-02", "READY", "P4.C1", "DEAL", "kling2"),
    job("p4-deal-03", "READY", "P4.C1", "DEAL"),
    job("p4-back-01", "P4.C1", "READY", "RETURN"),
    job("p1-deal-01", "READY", "P1.C1", "DEAL"),
    job("p1-deal-02", "READY", "P1.C1", "DEAL"),
    job("entry-01", "IDLE", "READY", "ENTRY"),
    job("idle-01", "IDLE", "IDLE", "IDLE"),
    job("idle-02", "IDLE", "IDLE", "IDLE"),
    job("idle-03", "IDLE", "IDLE", "IDLE"),
    job("d-deal-01", "READY", "D.C1", "DEAL"),
    job("readyb-draw-01", "READY-B", "DRAWN", "DEAL"),
  ];
  const reviews: Record<string, Review> = {
    "p4-deal-01": { decision: "ACCEPTED", userAccepted: true, userReview: jakob("bra") },
    "p4-deal-02": { decision: "PENDING", basis: "Handen lyfter f24.", limitations: "Kortet glider f80." },
    "p4-deal-03": { decision: "REJECTED" },
    "p1-deal-01": { decision: "ACCEPTED", acceptedAs: "MAIN", userAccepted: true, userReview: jakob("primär") },
    "p1-deal-02": { decision: "ACCEPTED", acceptedAs: "VARIANT" },
    "idle-01": { decision: "PENDING" },
    "idle-02": { decision: "PENDING" },
    "idle-03": { decision: "PENDING" },
    "d-deal-01": { decision: "PENDING" },
  };
  const motions: Record<string, MotionRecord> = {};
  const media: BankData["media"] = {};
  for (const j of jobs) {
    motions[j.id] = { source: { frames: j.id === "p4-deal-02" ? 150 : 120, fps: 30 }, ...(reviews[j.id] ? { review: reviews[j.id] } : {}) };
    media![j.id] = { video: `assets/motions/${j.id}/source.mp4` };
  }
  // The return starts on frame 88 of deal 01, so deal 01 lands on 88.
  jobs[3].first = { frame: { video: "assets/motions/p4-deal-01/source.mp4", videoSha256: "", index: 88 } };
  return { jobs, motions, media, revisions: Object.fromEntries(jobs.map((j) => [j.id, `"${j.id}"`])) };
}

test("dealing order and groups follow the old lab", () => {
  const graph = buildGraph(bank());
  const e = (id: string) => graph.edge[id];
  assert.equal(reviewKey(e("IDLE>READY")), 0);
  assert.ok(reviewKey(e("READY>P1.C1")) < reviewKey(e("READY>P4.C1")));
  assert.ok(reviewKey(e("READY>P4.C1")) < reviewKey(e("P4.C1>READY")));
  assert.ok(reviewKey(e("P4.C1>READY")) < reviewKey(e("P4.C1>IDLE")));
  assert.ok(reviewKey(e("P4.C1>IDLE")) < reviewKey(e("READY>D.C1")));
  assert.ok(reviewKey(e("READY>D.C1")) < reviewKey(e("IDLE>IDLE")));
  assert.ok(reviewKey(e("IDLE>IDLE")) < reviewKey(e("READY-B>DRAWN")));
  assert.equal(reviewGroup(e("IDLE>READY")), "Ingång");
  assert.equal(reviewGroup(e("READY>P4.C1")), "P4");
  assert.equal(reviewGroup(e("READY>D.C1")), "Dealern");
  assert.equal(reviewGroup(e("IDLE>IDLE")), "Utgång och vila");
  assert.equal(reviewGroup(e("READY-B>DRAWN")), "Variant B och experiment utan kort");
  assert.equal(seatOf(e("READY>P4.C1")), "P4");
  assert.equal(seatOf(e("IDLE>IDLE")), null);
  assert.deepEqual(
    inReviewOrder(Object.values(graph.takes), graph).map((t) => t.id).slice(0, 4),
    ["entry-01", "p1-deal-01", "p1-deal-02", "p4-deal-01"],
  );
});

test("the queue is the rail's count, in dealing order; decided ones of this sitting stay ticked", () => {
  const data = bank();
  let graph = buildGraph(data);
  const waiting = awaitingJakob(graph).map((t) => t.id);
  const { items, waiting: count } = reviewQueue(graph, new Map());
  assert.equal(count, waiting.length);
  assert.equal(items.length, waiting.length);
  assert.deepEqual(new Set(items.map((i) => i.take.id)), new Set(waiting));
  assert.deepEqual(items.map((i) => i.take.id), ["entry-01", "p1-deal-02", "p4-deal-02", "p4-back-01", "d-deal-01", "idle-01", "idle-02", "idle-03", "readyb-draw-01"]);
  assert.equal(items[0].group, "Ingång");

  // He approves p4-deal-02: the bank says so after the reload; the sitting remembers it.
  data.motions!["p4-deal-02"].review = { decision: "ACCEPTED", userAccepted: true, userReview: jakob("ok") };
  graph = buildGraph(data);
  const sitting = new Map([["p4-deal-02", "ACCEPTED"]]);
  const after = reviewQueue(graph, sitting);
  assert.equal(after.waiting, awaitingJakob(graph).length);
  assert.equal(after.waiting, count - 1);
  const ticked = after.items.find((i) => i.take.id === "p4-deal-02")!;
  assert.equal(ticked.decided, "ACCEPTED");
  // The next one is the one after it in the list.
  assert.equal(nextWaiting(after.items, "p4-deal-02"), "p4-back-01");
  assert.equal(previousWaiting(after.items, "p4-back-01"), "p1-deal-02");

  // He resets it again (Ångra): it waits again and is no longer ticked.
  delete data.motions!["p4-deal-02"].review!.userReview;
  graph = buildGraph(data);
  assert.equal(reviewQueue(graph, sitting).items.find((i) => i.take.id === "p4-deal-02")!.decided, null);
});

test("the next waiting take wraps round and skips the decided ones", () => {
  const graph = buildGraph(bank());
  const { items } = reviewQueue(graph, new Map());
  const last = items[items.length - 1].take.id;
  assert.equal(nextWaiting(items, last), items[0].take.id);
  assert.equal(nextWaiting(items, null), items[0].take.id);
  assert.equal(nextWaiting(items, "not-there"), items[0].take.id);
  const marked = items.map((i, n) => (n < items.length - 1 ? { ...i, decided: "ACCEPTED" } : i));
  assert.equal(nextWaiting(marked, items[0].take.id), last);
  assert.equal(nextWaiting(marked, last), null); // nothing else waits
  assert.equal(nextWaiting([], null), null);
});

test("choices: edges with more than one playable film, most useful first", () => {
  const graph = buildGraph(bank());
  const choices = choiceEdges(graph);
  const ids = choices.map((c) => c.edge.id);
  // P4.C1 has two playable deals (the third is rejected), P1.C1 two, the idle three.
  assert.deepEqual(new Set(ids), new Set(["READY>P4.C1", "READY>P1.C1", "IDLE>IDLE"]));
  // A needed film without a Primär first, then one with a Primär, the idle last.
  assert.deepEqual(ids, ["READY>P4.C1", "READY>P1.C1", "IDLE>IDLE"]);
  const p4 = choices[0];
  assert.equal(p4.takes.length, 2);
  assert.equal(p4.primar, null);
  assert.equal(p4.waiting, 1);
  assert.equal(choices[1].primar?.id, "p1-deal-01");
});

test("the pair: B is the Primär, else what plays now; A the newest waiting take", () => {
  const graph = buildGraph(bank());
  const waiting = new Set(awaitingJakob(graph).map((t) => t.id));
  const p1 = comparePair(graph.edge["READY>P1.C1"], null, null, waiting);
  assert.equal(p1.b?.id, "p1-deal-01");
  assert.equal(p1.role, "primar");
  assert.equal(p1.a?.id, "p1-deal-02");
  // No Primär on P4.C1: B is the take that plays now.
  const p4 = comparePair(graph.edge["READY>P4.C1"], null, null, waiting);
  assert.equal(p4.b?.id, graph.edge["READY>P4.C1"].main?.id);
  assert.equal(p4.role, "spelas");
  assert.equal(p4.a?.id, "p4-deal-02");
  assert.notEqual(p4.a?.id, p4.b?.id);
  // Asked for: kept, even a rejected take; the Primär asked for as A gives B another take.
  const asked = comparePair(graph.edge["READY>P4.C1"], "p4-deal-03", "p4-deal-02", waiting);
  assert.equal(asked.a?.id, "p4-deal-03");
  assert.equal(asked.b?.id, "p4-deal-02");
  assert.equal(asked.role, "vald");
  const primarAsA = comparePair(graph.edge["READY>P1.C1"], "p1-deal-01", null, waiting);
  assert.equal(primarAsA.a?.id, "p1-deal-01");
  assert.equal(primarAsA.b?.id, "p1-deal-02");
  assert.equal(asked.takes.length, 3);
  // An unknown id falls back.
  assert.equal(comparePair(graph.edge["READY>P1.C1"], "nope", "nope", waiting).b?.id, "p1-deal-01");
});

test("facts side by side say what differs", () => {
  const graph = buildGraph(bank());
  const rows = compareFacts(graph.takes["p4-deal-02"], graph.takes["p4-deal-01"]);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual(by.model, { key: "model", label: "Modell", a: "Kling 2", b: "Wan 3", differs: true });
  assert.deepEqual(by.frames, { key: "frames", label: "Rutor", a: "150", b: "120", differs: true });
  assert.equal(by.length.a, "5,0 s");
  assert.equal(by.landing.a, "—");
  assert.equal(by.landing.b, "ruta 88");
  assert.equal(by.fps, undefined); // both 30: not a row
  const same = compareFacts(graph.takes["p1-deal-01"], graph.takes["p1-deal-02"]);
  assert.ok(same.every((r) => !r.differs));
});

test("every take: filters by verdict and seat, counts and reviewer notes", () => {
  const graph = buildGraph(bank());
  const takes = Object.values(graph.takes);
  assert.deepEqual(seatOptions(graph), ["P1", "P4", "D", "övrigt"]);
  const counts = verdictCounts(takes);
  assert.equal(counts.primar, 1);
  assert.equal(counts.variant, 1);
  assert.equal(counts.underkand, 1);
  assert.equal(counts.godkand, 1);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), takes.length);
  assert.deepEqual(filterTakes(takes, graph, { verdicts: new Set(["primar"]), seat: null }).map((t) => t.id), ["p1-deal-01"]);
  assert.deepEqual(filterTakes(takes, graph, { verdicts: new Set(), seat: "P4" }).map((t) => t.id).sort(), ["p4-back-01", "p4-deal-01", "p4-deal-02", "p4-deal-03"]);
  assert.deepEqual(filterTakes(takes, graph, { verdicts: new Set(["vantar"]), seat: "övrigt" }).map((t) => t.id), ["entry-01", "idle-01", "idle-02", "idle-03", "readyb-draw-01"]);
  assert.deepEqual(reviewerNotes(graph.takes["p4-deal-02"]), [
    { label: "Granskaren", text: "Handen lyfter f24." },
    { label: "Begränsning", text: "Kortet glider f80." },
  ]);
  assert.deepEqual(reviewerNotes(graph.takes["idle-01"]), []);
  // A take from an order carries its intake's words. They are shown while it waits, also under a provisional verdict, and
  // left out once he has judged it; what a reviewer wrote after them stays.
  const intake = { basis: "Inte granskad av Jakob: förd in från beställningen x, tagning 1. Granskaren: given 3/5.", limitations: "I inkorgen: spelas bara där steget inte har någon annan film, tills Jakob dömer den." };
  const noted = (review: Record<string, unknown>) => reviewerNotes({ motion: { review: { ...intake, ...review } } } as never);
  assert.equal(noted({ decision: "PENDING", inbox: true }).length, 2);
  assert.equal(noted({ decision: "ACCEPTED", inbox: true, provisional: { by: "huvudagent" } }).length, 2);
  assert.deepEqual(noted({ decision: "ACCEPTED", userAccepted: true }), [{ label: "Granskaren", text: "Förd in från beställningen x, tagning 1. Granskaren: given 3/5." }]);
  assert.deepEqual(noted({ decision: "REJECTED", limitations: "Kortet glider f80." }).map((n) => n.label), ["Granskaren", "Begränsning"]);
});

test("Granska: takes judged provisionally come first in the queue under their own heading, and leave it with his decision", async () => {
  const { applyProvisional, applyChange } = await import("../../tools/review-store.ts");
  const { PROVISIONAL_GROUP } = await import("../lib/review.ts");
  const data = bank();
  const prov = (decision: "ACCEPTED" | "REJECTED") => applyProvisional({ decision: "PENDING", inbox: true }, { decision, by: "huvudagenten och en oberoende granskare", mandate: "Jakob 2026-11-13: bedöm de sista filmerna.", note: "n" }, "2026-11-13T03:00:00.000Z") as Review;
  data.motions!["idle-03"] = { ...data.motions!["idle-03"], review: prov("ACCEPTED") };
  data.motions!["d-deal-01"] = { ...data.motions!["d-deal-01"], review: prov("REJECTED") };
  const graph = buildGraph(data);
  const { items, waiting } = reviewQueue(graph, new Map());
  assert.deepEqual(items.slice(0, 2).map((i) => [i.take.id, i.group]), [["d-deal-01", PROVISIONAL_GROUP], ["idle-03", PROVISIONAL_GROUP]]);
  assert.ok(items.slice(2).every((i) => i.group !== PROVISIONAL_GROUP));
  assert.equal(waiting, awaitingJakob(graph).length);
  assert.equal(nextWaiting(items, null), "d-deal-01");
  // The provisional approval plays like an approval; the provisional rejection does not play.
  assert.equal(graph.takes["idle-03"].inbox, false);
  assert.equal(graph.takes["d-deal-01"].decision, "REJECTED");
  assert.equal(graph.edge["READY>D.C1"].main, null);
  // His decision: the take leaves the provisional heading and is ticked as decided in this sitting.
  data.motions!["idle-03"] = { ...data.motions!["idle-03"], review: applyChange(data.motions!["idle-03"].review, { decision: "REJECTED", note: "" }, "2026-11-13") as Review };
  const after = reviewQueue(buildGraph(data), new Map([["idle-03", "REJECTED"]]));
  assert.deepEqual(after.items.filter((i) => i.group === PROVISIONAL_GROUP).map((i) => i.take.id), ["d-deal-01"]);
  assert.equal(after.items.find((i) => i.take.id === "idle-03")!.decided, "REJECTED");
});
