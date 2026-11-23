// The online copy (lib/mode.ts, NEXT_PUBLIC_DEALER_MODE=snapshot) never writes a decision: decide() through putDecision
// refuses before any request leaves the page, and so does putArchive (a clip is archived in the lab only). A file of its own because the mode is read once, when lib/mode.ts loads.
// Run: node --test "studio/tests/decide-copy.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_DEALER_MODE = "snapshot";
const { buildGraph } = await import("../../src/clip-graph.ts");
const { putArchive, putDecision } = await import("../lib/api.ts");
const { decide } = await import("../lib/decide.ts");
const { isSnapshot } = await import("../lib/mode.ts");

const graph = buildGraph({
  jobs: [{ id: "paow-p1-c1-plan-deal-01", kind: "DEAL", target: null, from: "READY", to: "P1.C1", model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" }],
  motions: { "paow-p1-c1-plan-deal-01": { source: { frames: 120, fps: 30 } } },
  media: { "paow-p1-c1-plan-deal-01": { video: null } },
  revisions: { "paow-p1-c1-plan-deal-01": '"r"' },
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
      await assert.rejects(decide(graph.takes["paow-p1-c1-plan-deal-01"], decision, "", graph, putDecision), (e: Error & { kind?: string }) => e.kind === "refused");
    // Archiving a take and taking it back are his in the lab only, as a decision is.
    for (const archived of [true, false]) await assert.rejects(putArchive("paow-p1-c1-plan-deal-01", archived, '"r"'), (e: Error & { kind?: string }) => e.kind === "refused");
    assert.equal(asked, 0);
  } finally {
    globalThis.fetch = real;
  }
});
