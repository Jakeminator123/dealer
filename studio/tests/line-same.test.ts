// One recipe, one choice: Bordet's row and the store give the SAME order from the SAME line (the dealer, the step and the
// card), for every step available on the standard line and every card of the plan. Where the reference film is chosen: in ONE
// place, referenceByRule in src/order-methods.ts. The store calls it when a draft names no reference film
// (tools/order-store.ts create), the studio calls it to show the row before a draft exists (studio/lib/bordet.ts lineOf, and
// Ny beställning), and the production list calls it (tools/produce.ts); none of them has a filter of its own. This test
// builds a lab with a bank where the rule matters (the dealer's own round trip that must not be taken for a deal bara dit, a
// deal that is the deal alone, a drag from the drawn-out pose, the dummy's rendered films, a film laid with the other hand,
// a film that fails its reference check is not there to tempt it), makes each draft through the routes with nothing but the
// line, and compares it with what the row showed: the reference film, the model, the length, the takes, the shape, the
// price and the text, and where one refuses, that the other does too.
// Run: node --test "studio/tests/line-same.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { orderRoutes } from "../../tools/order-routes.ts";
import { STEPS, readCutChecks, type BankFacts, type OrdersAnswer } from "../../src/order-model.ts";
import { productionList, readProduction } from "../../tools/produce.ts";
import { recipeFor } from "../../src/order-methods.ts";
import { cardWishes, filmRow } from "../lib/bordet.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const base = existsSync("D:/dealer-scratch/tmp") ? "D:/dealer-scratch/tmp" : os.tmpdir();
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const SEATS = ["P1.C1", "P2.C1", "P3.C1", "P4.C1", "P5.C1", "P6.C1", "P7.C1", "D.C1", "D.C2"];

test("Bordet's row and the store agree for every standard step and card, and the return trial needs its named source", async (t) => {
  const root = await mkdtemp(path.join(base, "line-same-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["data", "placements", "motions", "assets/anchors/paow-bild"]) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ["data/order-policy.json", "data/dealers.json", "data/order-methods.json"]) await copyFile(path.join(repo, file), path.join(root, file));
  // The plan's places as they are, its hands and turns fixed here (the pinch, the left hand, no handbyte), so that what Jakob
  // has set for a card in Kortplan does not change what this test compares.
  const plan = JSON.parse(await readFile(path.join(repo, "placements/default.json"), "utf8"));
  for (const [card, target] of Object.entries(plan.targets as Record<string, { intent: object }>)) target.intent = { takeHand: "LH", startSide: "BACK", endSide: card === "D.C2" ? "BACK" : "FRONT", pass: false, turn: card !== "D.C2", grip: "PINCH", turnAt: "AIR" };
  await writeFile(path.join(root, "placements/default.json"), JSON.stringify(plan, null, 2) + "\n");
  // Material: every anchor of Paow holds (2.3 too), and every seat but the dealer's first card has its own landing picture
  // for the left hand (one small file serves them all), seat 4 also its A3 for the right hand, which a deal from 2.3 ends on;
  // the dealer's first card ends on a cut frame of Paow's own film, or on none.
  const still = "assets/anchors/paow-bild/anchor.png";
  await writeFile(path.join(root, still), await sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r: 0, g: 236, b: 45 } } }).png().toBuffer());
  const entries = [
    ...([["ankare-1", "IDLE"], ["ankare-2.1", "READY"], ["ankare-2.2", "READY-B"], ["ankare-2.3", "READY-C"]] as const).map(([role, node]) => ({ id: `paow-${role}`, role, name: role, path: still, node, state: "gäller" })),
    ...SEATS.filter((card) => card !== "D.C1").map((card) => ({ id:`paow-landning-${card.toLowerCase().replace(".", "-")}`, role: "landning", name: `Landning ${card}`, path: still, node: `LAND(${card})`, card, state: "gäller" })),
    { id: "paow-a3-p4", role: "landning", name: "A3 · P4", path: still, node: "LAND(P4.C1)", card: "P4.C1", hand: "RH", state: "gäller" },
  ];
  await writeFile(path.join(root, "data/media-roles.json"), JSON.stringify({ schemaVersion: 1, dealers: { paow: { name: "Paow", entries } }, measures: [] }, null, 2) + "\n");
  // The bank: what a rule must tell apart.
  const straight = { decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-13: bra" };
  const films: Record<string, Buffer> = {};
  const film = async (id: string, seconds: number, more: { review?: object; motion?: object } = {}) => {
    films[id] = Buffer.from(`film ${id}`);
    await mkdir(path.join(root, "assets/motions", id), { recursive: true });
    await writeFile(path.join(root, "assets/motions", id, "source.mp4"), films[id]);
    await writeFile(path.join(root, "motions", `${id}.json`), JSON.stringify({ source: { frames: seconds * 30, fps: 30, sha256: sha(films[id]) }, review: more.review ?? straight, ...(more.motion ? { motion: more.motion } : {}) }));
  };
  const jobs = [
    { id: "pamela-p4-c1-plan-deal-02", from: "READY", to: "LAND(P4.C1)" },          // the deal alone, approved straight: the pinch to seat 4
    { id: "pamela-p4-c1-drawn-deal-01", from: "DRAWN", to: "LAND(P4.C1)" },         // the drag to seat 4, from the drawn-out pose
    { id: "pamela-p5-c1-variant", from: "READY", to: "LAND(P5.C1)" },               // a variant: not approved straight
    { id: "pamela-p3-c1-hoger", from: "READY", to: "LAND(P3.C1)" },                 // laid with the right hand
    { id: "pamela-d-c1-deal", from: "READY", to: "LAND(D.C1)" },                    // the dealer's first card
    { id: "paow-giv-2-1-p2-03-01", from: "READY", to: "READY", dealer: "paow" },    // Paow's own round trip to seat 2
    { id: "paow-giv-2-1-d-01-01", from: "READY", to: "READY", dealer: "paow" },     // Paow's own round trip to the dealer's first card
  ];
  await film("pamela-p4-c1-plan-deal-02", 4);
  await film("pamela-p4-c1-drawn-deal-01", 5);
  await film("pamela-p5-c1-variant", 4, { review: { decision: "ACCEPTED", acceptedAs: "VARIANT", userAccepted: true } });
  await film("pamela-p3-c1-hoger", 4, { motion: { releaseHand: "RH" } });
  await film("pamela-d-c1-deal", 4);
  await film("paow-giv-2-1-p2-03-01", 7, { review: {} });
  await film("paow-giv-2-1-d-01-01", 7, { review: {} });
  const derived = [
    { id: "paow-giv-2-1-p2-03-01-deal", from: "READY", to: "P2.C1", clip: "paow-giv-2-1-p2-03-01", frames: [0, 124], dealer: "paow" }, { id: "paow-giv-2-1-p2-03-01-return", from: "P2.C1", to: "READY", clip: "paow-giv-2-1-p2-03-01", frames: [125, 209], dealer: "paow" },
    { id: "paow-giv-2-1-d-01-01-deal", from: "READY", to: "D.C1", clip: "paow-giv-2-1-d-01-01", frames: [0, 99], dealer: "paow" }, { id: "paow-giv-2-1-d-01-01-return-ready", from: "D.C1", to: "READY", clip: "paow-giv-2-1-d-01-01", frames: [100, 209], dealer: "paow" },
  ];
  for (const d of derived) await writeFile(path.join(root, "motions", `${d.id}.json`), JSON.stringify({ review: straight }));
  await writeFile(path.join(root, "data/clip-jobs.json"), JSON.stringify({ jobs, derived }));
  // The cut frame where that film's return begins lies off the plan's card (data/cut-frames.json): it is no end picture, so
  // the dealer's first card has none, for the row, the store and the production list alike.
  const cutFrames = { frames: [{ clip: "paow-giv-2-1-d-01-01", frame: 99, target: "D.C1", holds: false, problems: ["kortet ligger utanför planens kort"], windowPrinted: false, offFromPlan: 40 }] };
  await writeFile(path.join(root, "data/cut-frames.json"), JSON.stringify(cutFrames));
  // The dummy's rendered films: the pinch to seat 1 (a far seat takes nothing else) and to seat 4, the entry to anchor 2.3,
  // and the deal with two hands to seat 4 (laid with the right hand).
  const rendered: { id: string; edge: string; path: string; sha256: string; seconds: number; lays?: "RH" }[] = [];
  for (const [id, edge, seconds, lays] of [["docka-giv-p1-4", "READY>P1.C1", 3.967], ["docka-giv-p4-4", "READY>P4.C1", 3.967], ["docka-till-2-3", "IDLE>READY-C", 4], ["docka-giv-2-3-p4", "READY-C>P4.C1", 3, "RH"]] as const) {
    const bytes = Buffer.from(`docka ${id}`);
    await mkdir(path.join(root, "assets/references/docka", id), { recursive: true });
    await writeFile(path.join(root, "assets/references/docka", id, "source.mp4"), bytes);
    rendered.push({ id, edge, path: `assets/references/docka/${id}/source.mp4`, sha256: sha(bytes), seconds, ...(lays ? { lays } : {}) });
  }
  await writeFile(path.join(root, "data/rendered-references.json"), JSON.stringify({ schemaVersion: 1, about: "test", films: rendered }));

  let origin = "";
  const handle = { fn: null as null | ReturnType<typeof orderRoutes> };
  const server = http.createServer(async (req, res) => { if (!(await handle.fn!(req, res, new URL(req.url ?? "/", origin)))) res.writeHead(404).end(); });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  handle.fn = orderRoutes({ root, origin, now: () => new Date("2026-11-18T02:00:00Z"), poses: {} as never });
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const call = async (method: string, address: string, body?: unknown, match?: string) => {
    const response = await fetch(origin + address, { method, headers: { origin, ...(match ? { "if-match": match } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  };

  // The studio's side: the same facts as the page has them (the bank, Material's entries, the plan and the rendered films
  // from GET /api/orders, including the current method register).
  const all = (await call("GET", "/api/orders")).json as OrdersAnswer;
  const register = all.methods!;
  assert.deepEqual(all.rendered!.map((r) => r.id), rendered.map((r) => r.id));
  const motions: NonNullable<BankFacts["motions"]> = {};
  for (const id of [...jobs.map((j) => j.id), ...derived.map((d) => d.id)]) motions[id] = JSON.parse(await readFile(path.join(root, "motions", `${id}.json`), "utf8"));
  for (const d of derived) motions[d.id] = { ...motions[d.id], source: motions[d.clip]!.source };
  const bank: BankFacts = { jobs, derived: derived as BankFacts["derived"], motions, rendered: all.rendered, cutChecks: readCutChecks(cutFrames) };
  // The production list (node tools/produce.ts), read from the lab as the command reads a checkout, before any draft exists.
  const production = productionList((await readProduction(root, "paow")).input);
  let listed = 0;
  const shown = entries.map((e) => ({ ...e, served: e.path }));

  const made: Record<string, string | null> = {}, refused: Record<string, string> = {};
  let compared = 0;
  // The hole card's turn is left out: its pictures are drawn from a bank film that the temporary lab does not have.
  for (const step of STEPS.filter((s) => s.kind === "FILM" && !s.cards?.length)) for (const target of step.card ? SEATS : [null]) {
    const wish = { step: step.key, target }, key = `${step.key}${target ? ` ${target}` : ""}`;
    const input = { dealer: "paow", step: step.key, ...(target ? { target } : {}) };
    const inList = production.rows.find((r) => r.step === step.key && r.target === target);
    if (step.key === "RETUR-2.3") {
      assert.ok(step.off, `${key}: disabled in Beställ's form`);
      assert.ok(!cardWishes(target!, {}, "paow").some((w) => w.step === step.key), `${key}: absent from Bordet's card choices`);
      assert.equal(inList, undefined, `${key}: absent from the standard production list`);
      const preview = await call("POST", "/api/orders/preview", input);
      assert.equal(preview.status, 400, key);
      assert.match(preview.json.error, /namngiven A3-kandidat/, key);
      continue;
    }
    const row = filmRow("paow", wish, register, all.policy, { bank, entries: shown, plan: all.plan ?? null });
    // The production list's row for the same step and card says the same: it can be ordered exactly where the row can be
    // sent, and with the same reference film.
    if (inList) {
      listed++;
      assert.equal(inList.orderable !== null, !row.why, `${key}: the row says "${row.why ?? "it can be sent"}", the production list says "${inList.words}"`);
      if (!row.why) assert.equal(inList.method?.reference ?? null, row.reference?.take ?? null, `${key}: the production list's reference film`);
    }
    const preview = await call("POST", "/api/orders/preview", input);
    if (row.why) {
      // What the row cannot send, the store refuses, and for the same reason.
      assert.equal(preview.status, 400, `${key}: the row says "${row.why}", and the store made a draft`);
      assert.equal(row.body, null, key);
      // A return from a card without a landing picture: the store names the missing picture before the missing method.
      const words = row.why.startsWith("ingen metod") ? (step.start === "LAND" && target === "D.C1" ? /Ingen landningsbild gäller/ : /har ingen metod än/) : row.why.startsWith("väntar på") ? new RegExp(row.why.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : row.why.startsWith("ingen landningsbild") ? /Ingen landningsbild gäller/ : /har ingen slutbild/;
      assert.match(preview.json.error, words, key);
      refused[key] = row.why;
      continue;
    }
    assert.equal(preview.status, 200, `${key}: no preview`);
    const answer = await call("POST", "/api/orders", input, preview.json.revision);
    assert.equal(answer.status, 201, `${key}: the row can be sent, and the store refused: ${JSON.stringify(answer.json).slice(0, 300)}`);
    assert.deepEqual(row.body, { dealer: "paow", step: step.key, ...(target ? { target } : {}) }, `${key}: the row sends the line and nothing else`);
    const o = answer.json.order;
    const stored = o.reference.status === "FINNS" ? o.reference.clips[0] : null;
    // THE SAME REFERENCE FILM, from the same rule.
    assert.equal(row.reference?.take ?? null, stored, `${key}: the row shows ${row.reference?.take ?? "no reference film"}, the store took ${stored ?? "none"}`);
    const line = row.resolved;
    assert.deepEqual([line.model?.id, line.seconds, line.takes, line.shape, line.style], [o.generation.model, o.generation.params.duration, o.takes, o.step.shape, o.prompt.style], `${key}: model, length, takes, shape and style`);
    assert.equal(row.cost, o.cost.total, `${key}: the price`);
    const shownOrder = preview.json.orders[0];
    assert.deepEqual(shownOrder.prompt, o.prompt, `${key}: the exact text`);
    assert.deepEqual(shownOrder.pictures.map((p: { sha256: string }) => p.sha256), o.pictures.map((p: { sha256: string }) => p.sha256), `${key}: the same image bytes`);
    assert.equal(shownOrder.reference.sha256, o.reference.sha256, `${key}: the same reference bytes`);
    assert.deepEqual(o.notes, [`Recept ${recipeFor(register, step.key, target)!.method.id} (${recipeFor(register, step.key, target)!.method.status}) ur data/order-methods.json.`], `${key}: the recipe and no exception`);
    made[key] = stored;
    compared++;
  }
  // Three entries, two ways out and rest; the pinch to seat 1 and seat 4; the drag and the two-hand deal to seat 4.
  assert.equal(compared, 10, `${compared} orders compared`);
  assert.equal(Object.keys(refused).length, 9 * 3 - 4 + 3 * 9, "every other card waits or has no method, in the row and in the store alike");
  // The dealer's first card: its only cut frame does not hold, and it has no landing picture.
  assert.match(refused["GIV-2.1 D.C1"] ?? "", /^ingen slutbild för platsen/);
  // Every step the production list has a row for is compared (the dealer's graph: the steps of 2.1 and 2.2, rest and the ways out).
  assert.ok(listed >= 20, `${listed} steps compared with the production list`);
  // What the rule chose, said once here so that a change of rule is seen: the dummy's film first, the deal alone from the
  // bank else; the far seats only the dummy's; the drag only a drag; the two-hand deal only a film laid with the right hand.
  assert.deepEqual(
    { "GIV-2.1 P1.C1": made["GIV-2.1 P1.C1"], "GIV-2.1 P4.C1": made["GIV-2.1 P4.C1"], "GIV-2.2 P4.C1": made["GIV-2.2 P4.C1"], "GIV-2.3 P4.C1": made["GIV-2.3 P4.C1"], "INGANG-2.3": made["INGANG-2.3"], "INGANG-2.1": made["INGANG-2.1"] },
    { "GIV-2.1 P1.C1": "docka-giv-p1-4", "GIV-2.1 P4.C1": "docka-giv-p4-4", "GIV-2.2 P4.C1": "pamela-p4-c1-drawn-deal-01", "GIV-2.3 P4.C1": "docka-giv-2-3-p4", "INGANG-2.3": "docka-till-2-3", "INGANG-2.1": null },
  );
  // And what it did not take: Paow's own round trip to seat 2 (the whole film would go, and it ends at the shoe), the variant
  // to seat 5, the film laid with the right hand to seat 3.
  for (const key of ["GIV-2.1 P2.C1", "GIV-2.1 P5.C1", "GIV-2.1 P3.C1"]) assert.match(refused[key] ?? "", /^väntar på/, key);
  assert.equal(refused["RETUR-2.1 P4.C1"], "ingen metod än");
});
