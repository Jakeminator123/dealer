// Ny beställning with several seats ("Alla sju"): each seat turns as its recipe says (data/order-methods.json; the plan's turn
// where the recipe leaves it to Placering), unless one turn is named for the whole order (studio/lib/orders.ts seatFlip,
// cardBody; the fault found 2026-11-17 was the first seat's turn sent for every seat). And what Bordet's row shows as the
// text is the text the store writes. Run against the order routes on a temporary copy of the data with a plan where two seats turn differently, as
// tools/order-routes.test.ts runs them. Pictures are tiny PNGs; nothing is sent anywhere.
// Run: node --test "studio/tests/new-order-seats.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { committedText } from "../../tools/committed.ts";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { a3Candidates, landingNode, stepOf } from "../../src/order-model.ts";
import { recipeHands } from "../../src/order-methods.ts";
import { orderRoutes } from "../../tools/order-routes.ts";
import type { Entry, Register } from "../lib/media.ts";
import { cardBody, seatFlip } from "../lib/orders.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const base = existsSync("D:/dealer-scratch/tmp") ? "D:/dealer-scratch/tmp" : os.tmpdir();

async function lab(t: { after(fn: () => Promise<void> | void): void }) {
  const root = await mkdtemp(path.join(base, "new-order-seats-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["data", "placements", "assets/anchors/paow-vila"]) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ["data/order-policy.json", "data/dealers.json", "data/order-methods.json"]) await copyFile(path.join(repo, file), path.join(root, file));
  // The plan: P1 turned at its place, P2 rolled about the long side on the way, P3 the wrist (the plan's own default).
  const plan = JSON.parse(committedText("placements/default.json", repo)); // as committed, not as he last saved it
  for (const id of ["P1.C1", "P2.C1", "P3.C1"]) Object.assign(plan.targets[id].intent, { startSide: "BACK", endSide: "FRONT", turn: true });
  Object.assign(plan.targets["P1.C1"].intent, { turnAt: "PLACE" });
  Object.assign(plan.targets["P2.C1"].intent, { turnAt: "AIR", flipAxis: "LONG_EDGE" });
  Object.assign(plan.targets["P3.C1"].intent, { turnAt: "AIR", flipAxis: "FREE" });
  await writeFile(path.join(root, "placements/default.json"), JSON.stringify(plan, null, 2) + "\n");
  const register = { schemaVersion: 1, dealers: { paow: { name: "Paow", entries: [{ id: "paow-vila", role: "ankare-1", name: "Vila", path: "assets/anchors/paow-vila/anchor.png", node: "IDLE", state: "gäller" }] } }, measures: [] };
  await writeFile(path.join(root, "data/media-roles.json"), JSON.stringify(register, null, 2) + "\n");
  await writeFile(path.join(root, "data/clip-jobs.json"), '{"jobs": []}');
  await writeFile(path.join(root, "assets/anchors/paow-vila/anchor.png"), await sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r: 0, g: 236, b: 45 } } }).png().toBuffer());
  let origin = "";
  const handle = { fn: null as null | ReturnType<typeof orderRoutes> };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    if (!(await handle.fn!(req, res, url))) res.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  handle.fn = orderRoutes({ root, origin, now: () => new Date("2026-11-17T21:00:00Z"), poses: {} as never });
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const request = async (method: string, address: string, body?: unknown, match?: string) => {
    const response = await fetch(origin + address, { method, headers: { origin, ...(match ? { "if-match": match } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  };
  async function call(method: string, address: string, body?: unknown) {
    if (method === "POST" && address === "/api/orders") {
      const preview = await request(method, "/api/orders/preview", body);
      if (preview.status !== 200) return preview;
      return request(method, address, body, preview.json.revision);
    }
    return request(method, address, body);
  }
  return { root, call, request, plan };
}

type Stored = { order: { group: { id: string } | null; motion: { target: string; flipAxis: string | null } } };
const seats = ["P1.C1", "P2.C1", "P3.C1"].map((target) => ({ target, hand: "LH" as const, pass: false, side: "FRONT" as const }));
/** The lab has no end pictures and no reference films, so the deals here are the exception that needs neither: tur och retur without a reference film. */
const TUR = { reference: null, duration: 7 };

test("several seats without a chosen turn: no turn is sent, and each seat gets its recipe's turn, whatever the plan says", async (t) => {
  const { call, plan } = await lab(t);
  const card = cardBody({ shape: "ROUND_TRIP", deal: true, cardScale: 1 });
  assert.equal("flipAxis" in card, false, "the body names no turn");
  const made = await call("POST", "/api/orders", { dealer: "paow", step: "GIV-2.1", seats, takes: 1, ...card, ...TUR });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  const orders = ((await call("GET", "/api/orders")).json.orders as (Stored & { order: { motion: { planned: { flipAxis: string } } } })[]).filter((a) => a.order.group);
  const turns: Record<string, string | null> = Object.fromEntries(orders.map((a) => [a.order.motion.target, a.order.motion.flipAxis]));
  // From anchor 2.1 the recipe turns the card on the way; what Placering said for each card is kept beside it.
  assert.deepEqual(turns, { "P1.C1": "FREE", "P2.C1": "FREE", "P3.C1": "FREE" });
  assert.deepEqual(Object.fromEntries(orders.map((a) => [a.order.motion.target, a.order.motion.planned.flipAxis])), { "P1.C1": "AT_PLACE", "P2.C1": "LONG_EDGE", "P3.C1": "FREE" });
  // the sheet shows each seat the turn the store gives it: the recipe's
  const seatPlan = (id: string) => ({ turnAt: plan.targets[id].intent.turnAt, flipAxis: plan.targets[id].intent.flipAxis });
  for (const [id, turn] of Object.entries(turns)) assert.equal(seatFlip("GIV-2.1", seatPlan(id), "FREE"), turn, id);
  // where a recipe leaves the turn to Placering, the plan's own is the seat's
  assert.deepEqual(["P1.C1", "P2.C1", "P3.C1"].map((id) => seatFlip("GIV-2.1", seatPlan(id), null)), ["AT_PLACE", "LONG_EDGE", "FREE"]);
});

test("several seats in an order that names a turn (the store's exception, not offered in the studio): that turn for every seat", async (t) => {
  const { call } = await lab(t);
  const card = cardBody({ shape: "ROUND_TRIP", deal: true, cardScale: 1 });
  assert.equal((await call("POST", "/api/orders", { dealer: "paow", step: "GIV-2.1", seats, takes: 1, ...card, flipAxis: "LONG_EDGE", ...TUR })).status, 201);
  const orders = ((await call("GET", "/api/orders")).json.orders as Stored[]).filter((a) => a.order.group);
  assert.deepEqual(orders.map((a) => a.order.motion.flipAxis).sort(), ["LONG_EDGE", "LONG_EDGE", "LONG_EDGE"]);
  assert.equal(seatFlip("GIV-2.1", { turnAt: "PLACE", flipAxis: "FREE" }, "LONG_EDGE"), "LONG_EDGE");
});

test("the card's part of a body: tur och retur or bara dit only for a deal, the trial scale only when not 1", () => {
  assert.deepEqual(cardBody({ shape: "ONE_WAY", deal: true, cardScale: 1 }), { shape: "ONE_WAY" });
  assert.deepEqual(cardBody({ shape: "ONE_WAY", deal: false, cardScale: 1 }), {});
  assert.deepEqual(cardBody({ shape: "ROUND_TRIP", deal: true, cardScale: 1.25 }), { shape: "ROUND_TRIP", cardScale: 1.25 });
});

test("a named A3 follows the selected place and the hand that lays the card", async (t) => {
  const { root, request } = await lab(t);
  const mediaFile = path.join(root, "data/media-roles.json");
  const media = JSON.parse(await readFile(mediaFile, "utf8")) as Register;
  const candidate = (id: string, target: string, hand: "LH" | "RH"): Entry => ({
    id, name: id, role: "landning", path: `assets/anchors/${id}/anchor.png`, state: "kandidat", node: landingNode(target), card: target, hand,
  });
  const p4 = candidate("paow-a3-p4-rh", "P4.C1", "RH");
  const p5 = candidate("paow-a3-p5-rh", "P5.C1", "RH");
  const otherDealer = candidate("pamela-a3-p4-rh", "P4.C1", "RH");
  const entries = [p4, p5, candidate("paow-a3-p4-lh", "P4.C1", "LH"), candidate("paow-a3-p4-c2-rh", "P4.C2", "RH")];
  media.dealers.paow.entries.push(...entries);
  media.dealers.pamela = { name: "Pamela", entries: [otherDealer] };
  for (const entry of [...entries, otherDealer]) {
    const output = path.join(root, entry.path!);
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(path.join(root, "assets/anchors/paow-vila/anchor.png"), output);
  }
  await writeFile(mediaFile, JSON.stringify(media));

  const step = stepOf("GIV-2.3")!;
  const lays = recipeHands(step, null, { hand: "LH" }).lays;
  assert.equal(lays, "RH");
  assert.deepEqual(a3Candidates(media.dealers.paow.entries, "P4.C1", lays).map((entry) => entry.id), [p4.id]);
  assert.deepEqual(a3Candidates(media.dealers.paow.entries, "P5.C1", lays).map((entry) => entry.id), [p5.id]);
  const input = { dealer: "paow", step: step.key, target: "P4.C1", end: p4.id, reference: null };
  const preview = await request("POST", "/api/orders/preview", input);
  assert.equal(preview.status, 200);
  assert.equal(preview.json.orders[0].pictures[1].from.entry, p4.id);

  const stale = await request("POST", "/api/orders/preview", { ...input, target: "P5.C1" });
  assert.equal(stale.status, 400);
  assert.match(stale.json.error, /ingen A3-kandidat för plats 5/);
  const changed = { ...input, target: "P5.C1", end: p5.id };
  assert.equal((await request("POST", "/api/orders", changed, preview.json.revision)).status, 409);
  const current = await request("POST", "/api/orders/preview", changed);
  assert.equal(current.status, 200);
  assert.equal(current.json.orders[0].pictures[1].from.entry, p5.id);
  const saved = await request("POST", "/api/orders", changed, current.json.revision);
  assert.equal(saved.status, 201);
  assert.equal(saved.json.order.pictures[1].from.entry, p5.id);
});

// (the hole card is left out: its pictures are drawn from a bank film that the temporary lab does not have)
test("what a row of Bordet shows as the text is, word for word, the text the store writes into the draft", async (t) => {
  const { call, request } = await lab(t);
  const { filmRow } = await import("../lib/bordet.ts");
  const before = (await call("GET", "/api/orders")).json as import("../../src/order-model.ts").OrdersAnswer;
  const register = before.methods!;
  // The lab has no end pictures and no reference films: a deal is ordered here as the exception that needs neither.
  const round = { shape: "ROUND_TRIP", reference: null, duration: 7 };
  const cases: { step: string; target: string | null; choice?: Record<string, unknown> }[] = [
    { step: "GIV-2.1", target: "P4.C1", choice: round },
    { step: "GIV-2.1", target: "P1.C1", choice: round },
    { step: "GIV-2.1", target: "P2.C1", choice: { ...round, side: "BACK", hand: "PASS", extra: "Slowly." } },
    { step: "GIV-2.2", target: "P3.C1", choice: { ...round, style: "MINIMAL", cardScale: 1.25 } },
    // the line itself: the dealer and the step, the recipe's text (rest with the recipe's own addition)
    { step: "INGANG-2.1", target: null },
    { step: "UTGANG", target: null },
    { step: "VILA", target: null },
  ];
  let compared = 0;
  for (const c of cases) {
    const wish = { step: c.step as never, target: c.target }, choice = (c.choice ?? {}) as never;
    const row = filmRow("paow", wish, register, null, { bank: null, choice, entries: [], plan: before.plan ?? null });
    assert.ok(row.body, `${c.step} ${c.target}: a body (${row.why})`);
    if (!c.choice) assert.deepEqual(row.body, { dealer: "paow", step: c.step }, "the line: the dealer and the step, nothing else");
    const preview = await request("POST", "/api/orders/preview", row.body);
    assert.equal(preview.status, 200);
    const shown = preview.json.orders[0];
    const made = await request("POST", "/api/orders", row.body, preview.json.revision);
    assert.equal(made.status, 201, `${c.step} ${c.target}: ${JSON.stringify(made.json).slice(0, 300)}`);
    assert.equal(shown.prompt.text, made.json.order.prompt.text, `${c.step} ${c.target}: the text shown is the text stored`);
    assert.deepEqual([shown.generation.params.duration, shown.takes, shown.generation.params.resolution], [made.json.order.generation.params.duration, made.json.order.takes, made.json.order.generation.params.resolution], `${c.step} ${c.target}: length, takes and resolution too`);
    compared++;
  }
  assert.equal(compared, cases.length);
});
