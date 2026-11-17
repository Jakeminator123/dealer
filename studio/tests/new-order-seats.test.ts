// Ny beställning with several seats ("Alla sju"): each seat turns as the plan says for it unless Jakob chose one turn for the
// whole order (studio/lib/orders.ts seatFlip, cardBody; the fault found 2026-11-17 was the first seat's turn sent for every
// seat). Run against the order routes on a temporary copy of the data with a plan where two seats turn differently, as
// tools/order-routes.test.ts runs them. Pictures are tiny PNGs; nothing is sent anywhere.
// Run: node --test "studio/tests/new-order-seats.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { orderRoutes } from "../../tools/order-routes.ts";
import { cardBody, seatFlip } from "../lib/orders.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const base = existsSync("D:/dealer-scratch/tmp") ? "D:/dealer-scratch/tmp" : os.tmpdir();

async function lab(t: { after(fn: () => Promise<void> | void): void }) {
  const root = await mkdtemp(path.join(base, "new-order-seats-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["data", "placements", "assets/anchors/paow-vila"]) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ["data/order-policy.json", "data/dealers.json"]) await copyFile(path.join(repo, file), path.join(root, file));
  // The plan: P1 turned at its place, P2 rolled about the long side on the way, P3 the wrist (the plan's own default).
  const plan = JSON.parse(await readFile(path.join(repo, "placements/default.json"), "utf8"));
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
  const call = async (method: string, address: string, body?: unknown) => {
    const response = await fetch(origin + address, { method, headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  };
  return { call, plan };
}

type Stored = { order: { group: { id: string } | null; motion: { target: string; flipAxis: string | null } } };
const seats = ["P1.C1", "P2.C1", "P3.C1"].map((target) => ({ target, hand: "LH" as const, pass: false, side: "FRONT" as const }));

test("several seats without a chosen turn: no turn is sent, and each seat keeps the plan's own", async (t) => {
  const { call, plan } = await lab(t);
  const card = cardBody({ chosenFlip: null, shape: "ROUND_TRIP", deal: true, cardScale: 1 });
  assert.equal("flipAxis" in card, false, "the body names no turn");
  const made = await call("POST", "/api/orders", { dealer: "paow", step: "GIV-2.1", seats, takes: 1, ...card });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  const orders = ((await call("GET", "/api/orders")).json.orders as Stored[]).filter((a) => a.order.group);
  const turns: Record<string, string | null> = Object.fromEntries(orders.map((a) => [a.order.motion.target, a.order.motion.flipAxis]));
  assert.deepEqual(turns, { "P1.C1": "AT_PLACE", "P2.C1": "LONG_EDGE", "P3.C1": "FREE" });
  // the sheet shows each seat the turn the store gives it
  const seatPlan = (id: string) => ({ turnAt: plan.targets[id].intent.turnAt, flipAxis: plan.targets[id].intent.flipAxis });
  for (const [id, turn] of Object.entries(turns)) assert.equal(seatFlip("GIV-2.1", seatPlan(id), null), turn, id);
});

test("several seats with a chosen turn: that turn for every seat", async (t) => {
  const { call } = await lab(t);
  const card = cardBody({ chosenFlip: "LONG_EDGE", shape: "ROUND_TRIP", deal: true, cardScale: 1 });
  assert.equal(card.flipAxis, "LONG_EDGE");
  assert.equal((await call("POST", "/api/orders", { dealer: "paow", step: "GIV-2.1", seats, takes: 1, ...card })).status, 201);
  const orders = ((await call("GET", "/api/orders")).json.orders as Stored[]).filter((a) => a.order.group);
  assert.deepEqual(orders.map((a) => a.order.motion.flipAxis).sort(), ["LONG_EDGE", "LONG_EDGE", "LONG_EDGE"]);
  assert.equal(seatFlip("GIV-2.1", { turnAt: "PLACE", flipAxis: "FREE" }, "LONG_EDGE"), "LONG_EDGE");
});

test("the card's part of a body: tur och retur or bara dit only for a deal, the trial scale only when not 1", () => {
  assert.deepEqual(cardBody({ chosenFlip: null, shape: "ONE_WAY", deal: true, cardScale: 1 }), { shape: "ONE_WAY" });
  assert.deepEqual(cardBody({ chosenFlip: null, shape: "ONE_WAY", deal: false, cardScale: 1 }), {});
  assert.deepEqual(cardBody({ chosenFlip: "FREE", shape: "ROUND_TRIP", deal: true, cardScale: 1.25 }), { flipAxis: "FREE", shape: "ROUND_TRIP", cardScale: 1.25 });
});
