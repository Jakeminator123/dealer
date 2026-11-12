// The online copy (lib/mode.ts, NEXT_PUBLIC_DEALER_MODE=snapshot) never writes a decision: decide() through putDecision
// refuses before any request leaves the page. A file of its own because the mode is read once, when lib/mode.ts loads.
// Also Granska's tab rules for the copy (components/review/copy.ts). Run: node --test "studio/tests/decide-copy.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_DEALER_MODE = "snapshot";
const { buildGraph } = await import("../../src/clip-graph.ts");
const { putDecision } = await import("../lib/api.ts");
const { decide } = await import("../lib/decide.ts");
const { isSnapshot } = await import("../lib/mode.ts");
const { tabOf, vyFor, waitingInCopy } = await import("../components/review/copy.ts");

const graph = buildGraph({
  jobs: [{ id: "pamela-p1-c1-plan-deal-01", kind: "DEAL", target: null, from: "READY", to: "P1.C1", model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" }],
  motions: { "pamela-p1-c1-plan-deal-01": { source: { frames: 120, fps: 30 } } },
  media: { "pamela-p1-c1-plan-deal-01": { video: null } },
  revisions: { "pamela-p1-c1-plan-deal-01": '"r"' },
});

test("in the copy every decision is refused before a request is made", async () => {
  assert.ok(isSnapshot);
  const real = globalThis.fetch;
  let asked = 0;
  globalThis.fetch = (async () => {
    asked++;
    return new Response("{}");
  }) as typeof fetch;
  try {
    for (const decision of ["MAIN", "ACCEPTED", "VARIANT", "REJECTED", "PENDING"] as const)
      await assert.rejects(decide(graph.takes["pamela-p1-c1-plan-deal-01"], decision, "", graph, putDecision), (e: Error & { kind?: string }) => e.kind === "refused");
    assert.equal(asked, 0);
  } finally {
    globalThis.fetch = real;
  }
});

test("Granska opens on Alla in the copy and on the queue in the lab; the address names only the other tab", () => {
  assert.equal(tabOf(null, true), "alla");
  assert.equal(tabOf(null, false), "ko");
  assert.equal(tabOf("ko", true), "ko");
  assert.equal(tabOf("alla", false), "alla");
  assert.equal(tabOf("något", true), "alla");
  assert.equal(vyFor("alla", true), null);
  assert.equal(vyFor("ko", true), "ko");
  assert.equal(vyFor("ko", false), null);
  assert.equal(vyFor("alla", false), "alla");
});

test("the copy's queue counts what waits and how many of them have a picture or a film there", () => {
  const take = graph.takes["pamela-p1-c1-plan-deal-01"];
  const edge = graph.edge[take.edge];
  const withStill = { ...take, id: "b", media: { ...take.media, first: "assets/motions/b/first.webp" } };
  const withFilm = { ...take, id: "c", media: { ...take.media, video: "assets/motions/c/source.mp4" } };
  const items = [
    { take, edge, group: "P1", decided: null },
    { take: withStill, edge, group: "P1", decided: null },
    { take: withFilm, edge, group: "P1", decided: null },
    { take: { ...take, id: "d" }, edge, group: "P1", decided: "ACCEPTED" },
  ];
  const w = waitingInCopy(items);
  assert.deepEqual(w.items.map((i) => i.take.id), ["pamela-p1-c1-plan-deal-01", "b", "c"]);
  assert.equal(w.withPicture, 2);
  assert.equal(w.withFilm, 1);
});
