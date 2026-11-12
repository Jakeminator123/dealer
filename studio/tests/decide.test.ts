// Jakob's decision as it is written (studio/lib/decide.ts), through the studio's real writer (putDecision in lib/api.ts)
// against a fake fetch: no lab server, nothing written anywhere. DecisionBar's buttons, its reset() for "Ångra" in Granska,
// and "Gör primär" on Primära all go through decide(). Run: node --test "studio/tests/decide.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type MotionRecord } from "../../src/clip-graph.ts";
import { putDecision } from "../lib/api.ts";
import { decide, makePrimary } from "../lib/decide.ts";
import { makePrimary as fromPrimaries } from "../lib/primaries.ts";

type Review = NonNullable<MotionRecord["review"]>;
const jakob = (extra: Review = {}): Review => ({ decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-12: bra.", ...extra });
function bank(rows: [id: string, from: string, to: string, kind: string, review: Review | null][]): BankData {
  const jobs: BankJob[] = [];
  const motions: Record<string, MotionRecord> = {};
  const media: BankData["media"] = {};
  const revisions: Record<string, string> = {};
  for (const [id, from, to, kind, review] of rows) {
    jobs.push({ id, kind, target: null, from, to, model: "wan3", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: {}, purpose: "" });
    motions[id] = { source: { frames: 120, fps: 30 }, ...(review ? { review } : {}) };
    media[id] = { video: `assets/motions/${id}/source.mp4` };
    revisions[id] = `"${id}"`;
  }
  return { jobs, motions, media, revisions };
}
const graph = buildGraph(
  bank([
    ["pamela-p1-c1-plan-deal-01", "READY", "P1.C1", "DEAL", jakob({ acceptedAs: "MAIN", userReview: "Jakob 2026-11-11: förra primär." })],
    ["pamela-p1-c1-plan-deal-02", "READY", "P1.C1", "DEAL", jakob()],
    ["pamela-p1-c1-plan-deal-03", "READY", "P1.C1", "DEAL", null],
    ["pamela-p2-c1-plan-deal-01", "READY", "P2.C1", "DEAL", jakob({ acceptedAs: "MAIN" })],
  ]),
);

// ── A fake fetch: records every request and answers as review-store does, or with a status for one id ──
type Call = { method: string; url: string; ifMatch: string | null; body: { decision: string; note: string } | null };
function fakeFetch(fail: Record<string, number> = {}) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as Call["body"]) : null;
    calls.push({ method: init?.method ?? "GET", url, ifMatch: headers.get("if-match"), body });
    const id = decodeURIComponent(url.split("/").pop() ?? "");
    if (fail[id]) return new Response(JSON.stringify({ error: "ändrad" }), { status: fail[id] });
    return new Response(JSON.stringify({ id, review: {}, revision: `"${id}-2"` }), { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real) };
}

test("Primär: one PUT for the take with its note, then the earlier Primär on the edge lowered with its own note; nothing else", async () => {
  const f = fakeFetch();
  try {
    const result = await decide(graph.takes["pamela-p1-c1-plan-deal-02"], "MAIN", "min nya anteckning", graph, putDecision);
    assert.deepEqual(
      f.calls.map((c) => [c.method, c.url, c.ifMatch, c.body]),
      [
        ["PUT", "/api/clip-bank/review/pamela-p1-c1-plan-deal-02", '"pamela-p1-c1-plan-deal-02"', { decision: "MAIN", note: "min nya anteckning" }],
        ["PUT", "/api/clip-bank/review/pamela-p1-c1-plan-deal-01", '"pamela-p1-c1-plan-deal-01"', { decision: "ACCEPTED", note: "förra primär." }],
      ],
    );
    assert.deepEqual(result, { lowered: ["Giv 01"], failed: [] });
  } finally {
    f.restore();
  }
});

test("the Primära page's makePrimary is the same rule: his stored note kept, the same two writes", async () => {
  assert.equal(fromPrimaries, makePrimary, "lib/primaries.ts hands on lib/decide.ts, it has no copy of its own");
  const f = fakeFetch();
  try {
    await makePrimary(graph.takes["pamela-p1-c1-plan-deal-02"], graph, putDecision);
    assert.deepEqual(
      f.calls.map((c) => [c.url.split("/").pop(), c.body]),
      [
        ["pamela-p1-c1-plan-deal-02", { decision: "MAIN", note: "bra." }],
        ["pamela-p1-c1-plan-deal-01", { decision: "ACCEPTED", note: "förra primär." }],
      ],
    );
  } finally {
    f.restore();
  }
});

test("Återställ, and Ångra in Granska (the bar's reset): one PUT that sets the take waiting again, its note gone", async () => {
  const f = fakeFetch();
  try {
    const result = await decide(graph.takes["pamela-p2-c1-plan-deal-01"], "PENDING", "anteckning som inte ska med", graph, putDecision);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].body, { decision: "PENDING", note: "" });
    assert.equal(f.calls[0].ifMatch, '"pamela-p2-c1-plan-deal-01"');
    assert.deepEqual(result, { lowered: [], failed: [] });
  } finally {
    f.restore();
  }
});

test("Godkänn, Variant and Underkänn write the take alone, and Primär without a read bank lowers nothing", async () => {
  for (const decision of ["ACCEPTED", "VARIANT", "REJECTED"] as const) {
    const f = fakeFetch();
    try {
      await decide(graph.takes["pamela-p1-c1-plan-deal-03"], decision, "", graph, putDecision);
      assert.deepEqual(f.calls.map((c) => c.body?.decision), [decision]);
    } finally {
      f.restore();
    }
  }
  const f = fakeFetch();
  try {
    await decide(graph.takes["pamela-p1-c1-plan-deal-02"], "MAIN", "", null, putDecision);
    assert.equal(f.calls.length, 1);
  } finally {
    f.restore();
  }
});

test("a 409 on the take itself is thrown and nothing more is written; a failed lowering is reported, not hidden", async () => {
  let f = fakeFetch({ "pamela-p1-c1-plan-deal-02": 409 });
  try {
    await assert.rejects(decide(graph.takes["pamela-p1-c1-plan-deal-02"], "MAIN", "", graph, putDecision), (e: Error & { kind?: string }) => e.kind === "conflict");
    assert.equal(f.calls.length, 1);
  } finally {
    f.restore();
  }
  f = fakeFetch({ "pamela-p1-c1-plan-deal-01": 409 });
  try {
    assert.deepEqual(await decide(graph.takes["pamela-p1-c1-plan-deal-02"], "MAIN", "", graph, putDecision), { lowered: [], failed: ["Giv 01"] });
  } finally {
    f.restore();
  }
});

test("a take without a record is never written", async () => {
  const f = fakeFetch();
  try {
    await assert.rejects(decide({ ...graph.takes["pamela-p1-c1-plan-deal-03"], revision: null }, "ACCEPTED", "", graph, putDecision));
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});
