// Bordet's step 2 and 3 for one card with handbyte and one without (the decisions of 2026-11-21): the anchor the films go from
// (A2.3 with handbyte, else the anchor the game deals the card from), the card's three films, the five marks, and that the
// row tells the truth: the step, the first and the last picture, the reference film, the length, the price and the text the
// row shows are the ones the store's preview freezes. Also the reference rule for the dummy's films of A2.3 → A3P4C2 (a film
// made again comes first; a deal bara dit never takes a round trip), the words of step 2, the game's line, the motion's steps
// and the ordering block's state. The lab is a temporary copy; Jakob's plan (placements/default.json) is only read.
// Run: node --test "studio/tests/bordet-line.test.ts"
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
import { LANDS_LABEL, modelFor, readCutChecks, stepOf, type BankFacts, type MandateBudget, type OrdersAnswer, type RenderedReference } from "../../src/order-model.ts";
import { NOT_YET, methodFor, recipeWords, referenceByRule } from "../../src/order-methods.ts";
import type { Intent } from "../../src/placement-model.ts";
import { MARK_NAMES, type FilmWish, cardWishes, filmRow, gameLine, hasRound, motionLine, roundFor, stepTwoSummary, sumWords, wishAnchor } from "../lib/bordet.ts";
import { dealAnchor, orderingState } from "../lib/orders.ts";
import { motionSteps } from "../lib/placement.ts";

const repo = path.resolve(import.meta.dirname, "../..");
const base = existsSync("D:/dealer-scratch/tmp") ? "D:/dealer-scratch/tmp" : os.tmpdir();
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// The dummy's films A2.3 → A3P4C2 as data/rendered-references.json lists them (in that order, laid with the right hand):
// the two earlier ones and svep24d, made again after them.
const P4C2_FILMS = [["docka-2-3-p4c2-h24-omgrepp", 4], ["docka-2-3-p4c2-h24-cykel", 4], ["docka-2-3-p4c2-svep24d", 3]] as const;
const film = (id: string, edge: string, seconds: number, more: Partial<RenderedReference> = {}): RenderedReference => ({ id, edge, path: `assets/references/docka/${id}/source.mp4`, sha256: sha(Buffer.from(`docka ${id}`)), seconds, lays: "RH", check: null, ...more });

test("the reference rule: the film made again comes first, and a deal bara dit never takes a round trip", () => {
  const step = stepOf("GIV-2.3")!, model = modelFor(step, "kling-4");
  const want = { dealer: "paow", step, target: "P4.C2", model, lays: "RH" as const };
  const chosen = (films: RenderedReference[], shape: "ONE_WAY" | "ROUND_TRIP" = "ONE_WAY") => referenceByRule({ rendered: films }, "renderad", { ...want, shape })?.take ?? null;
  const listed = P4C2_FILMS.map(([id, s]) => film(id, "READY-C>P4.C2", s));
  // svep24d is listed after h24-cykel: it comes first.
  assert.equal(chosen(listed), "docka-2-3-p4c2-svep24d");
  // A film that goes back to its anchor (its register says ROUND_TRIP) is no reference for a deal bara dit, even listed last;
  // a round trip may take it.
  const cycle = film("docka-2-3-p4c2-h24-cykel", "READY-C>P4.C2", 4, { shape: "ROUND_TRIP" });
  assert.equal(chosen([film("docka-2-3-p4c2-svep24d", "READY-C>P4.C2", 3), cycle]), "docka-2-3-p4c2-svep24d");
  assert.equal(chosen([cycle]), null, "a deal bara dit waits rather than take a round trip");
  assert.equal(chosen([cycle], "ROUND_TRIP"), "docka-2-3-p4c2-h24-cykel");
  // A one-hand film is no reference for the two-hand deal (the right hand lays the card).
  assert.equal(chosen([film("docka-2-3-p4c2-svep24d", "READY-C>P4.C2", 3, { lays: "LH" })]), null);
});

test("step 2 and the card's films: from A2.3 with handbyte, from the game's anchor without", () => {
  const pass = { pass: true, endSide: "FRONT", turnAt: "AIR", flipAxis: "FREE" } as const, plain = { ...pass, pass: false };
  // The anchor: handbyte chooses A2.3; without it the game's (A2.1 for seat 4, A2.2 for Paow's seat 6).
  assert.equal(wishAnchor("paow", "P4.C2", pass), "2.3");
  assert.equal(wishAnchor("paow", "P4.C2", plain), "2.1");
  assert.equal(wishAnchor("paow", "P6.C1", plain), "2.2");
  assert.equal(wishAnchor("paow", "P6.C1", pass), "2.3");
  // Three films per card: the deal, the return to the same anchor and the return to A1.
  assert.deepEqual(cardWishes("P4.C2", pass, "paow").map((w) => w.step), ["GIV-2.3", "RETUR-2.3", "RETUR-1"]);
  assert.deepEqual(cardWishes("P4.C1", plain, "paow").map((w) => w.step), ["GIV-2.1", "RETUR-2.1", "RETUR-1"]);
  assert.deepEqual(cardWishes("P6.C1", plain, "paow").map((w) => w.step), ["GIV-2.2", "RETUR-2.2", "RETUR-1"]);
  assert.deepEqual(cardWishes("shoe", pass, "paow"), []);
  assert.deepEqual(cardWishes("P4.C2", null, "paow"), []);
  // Step 2's header names the same anchor as step 3; never the plan's grip.
  assert.equal(stepTwoSummary("paow", "P4.C2", { pass: true, endSide: "FRONT" }), `A2.3 · handbyte · ${LANDS_LABEL.FRONT}`);
  assert.equal(stepTwoSummary("paow", "P4.C1", { pass: false, endSide: "BACK" }), `A2.1 · utan handbyte · ${LANDS_LABEL.BACK}`);
  assert.equal(stepTwoSummary("paow", "shoe", null), "Välj ett kort");
  // The game's line, where the films go from another anchor than the game deals the card from today.
  assert.equal(gameLine("paow", "P4.C2", pass), "Spelet ger plats 4, kort 2 från A2.1 i dag; filmen spelas när rundan namnger den.");
  assert.equal(gameLine("paow", "P4.C2", plain), null);
  // The round stays the game's until the bank has the A2.3 films both ways.
  assert.equal(roundFor("P4.C2", "paow"), "A2.1 - A3P4C2 - A2.1");
  assert.equal(roundFor("P4.C2", "paow", "2.3"), "A2.3 - A3P4C2 - A2.3");
  const take = (decision: string) => ({ takes: [{ hub: "READY-C", decision }] });
  const graph = (back: string) => ({ edge: { "READY>P4.C2": take("ACCEPTED"), "P4.C2>READY": take(back) }, experiments: [] }) as never;
  assert.equal(hasRound(graph("ACCEPTED"), "P4.C2", "2.3"), true);
  assert.equal(hasRound(graph("REJECTED"), "P4.C2", "2.3"), false);
  assert.equal(hasRound(null, "P4.C2", "2.3"), false);
  // The motion's steps from the anchor the films go from: with handbyte never A2.2 or the grip "Släp", whatever grip the plan still holds.
  const intent: Intent = { takeHand: "LH", startSide: "BACK", endSide: "FRONT", pass: true, turn: true, grip: "DRAG", turnAt: "AIR", flipAxis: "FREE" };
  const said = motionSteps("P4.C2", intent, `A${wishAnchor("paow", "P4.C2", intent)}`).steps;
  assert.equal(said[0].label, "A2.3");
  assert.equal(said.find((s) => s.id === "take")?.label, "Drar ut");
  const noDrag = (steps: { label: string; detail: string }[]) => steps.every((s) => !/A2\.2/.test(`${s.label} ${s.detail}`) && s.label !== "Släp");
  assert.ok(noDrag(said), JSON.stringify(said));
  assert.ok(noDrag(motionSteps("P4.C2", intent).steps), "anchorOf: handbyte is A2.3 without Bordet too");
});

test("the ordering block's state in one line", () => {
  const budget = (status: MandateBudget["status"], available = 500): MandateBudget => ({ status, mandate: null, at: "2026-11-21T13:00:00Z", hourlyReserved: 0, totalReserved: 0, available });
  const policy = { enabled: true, minBalance: 100, balance: { credits: 5000, at: "", source: "" }, mandateBudget: budget("missing") } as unknown as NonNullable<OrdersAnswer["policy"]>;
  const answer = (p: Partial<typeof policy> | null, spent = 0) => ({ policy: p ? { ...policy, ...p } : null, day: { date: "2026-11-21", spent, cap: 1000 }, balance: null });
  assert.deepEqual(orderingState(null).open, false);
  assert.match(orderingState(answer(null)).words, /kunde inte läsas/);
  assert.match(orderingState(answer({ enabled: false })).words, /avstängda/);
  assert.deepEqual(orderingState(answer({})), { open: false, words: "Inget giltigt beställningsmandat. Nya betalda anrop är spärrade." });
  const dayFull = orderingState(answer({ mandateBudget: undefined }, 1000));
  assert.equal(dayFull.open, false);
  assert.match(dayFull.words, /Dagens tak är nått/);
  assert.match(orderingState(answer({ mandateBudget: undefined, balance: { credits: 100, at: "", source: "" } })).words, /nere vid golvet/);
  assert.deepEqual(orderingState(answer({ mandateBudget: undefined })), { open: true, words: "I dag 0 av 1 000 krediter intecknade." });
});

test("Bordet's rows for a card with handbyte and one without say what the store's preview freezes", async (t) => {
  const root = await mkdtemp(path.join(base, "bordet-line-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["data", "placements", "motions", "assets/anchors/paow-bild"]) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ["data/order-policy.json", "data/dealers.json", "data/order-methods.json"]) await copyFile(path.join(repo, file), path.join(root, file));
  // The plan's places as they are (read from his plan, written only into this temporary lab), its motions fixed here: seat
  // 4's second card with handbyte, every other card without.
  const plan = JSON.parse(await readFile(path.join(repo, "placements/default.json"), "utf8"));
  for (const [card, target] of Object.entries(plan.targets as Record<string, { intent: object }>)) target.intent = { takeHand: "LH", startSide: "BACK", endSide: card === "D.C2" ? "BACK" : "FRONT", pass: card === "P4.C2", turn: card !== "D.C2", grip: "PINCH", turnAt: "AIR", flipAxis: "FREE" };
  await writeFile(path.join(root, "placements/default.json"), JSON.stringify(plan, null, 2) + "\n");
  // Material: Paow's four anchors, seat 4's first card's landing picture for the left hand, and A3P4C2 for the right hand
  // (the hand that lays the card after the handbyte). One small picture serves them all.
  const still = "assets/anchors/paow-bild/anchor.png";
  await writeFile(path.join(root, still), await sharp({ create: { width: 1764, height: 1174, channels: 3, background: { r: 0, g: 236, b: 45 } } }).png().toBuffer());
  const entries = [
    ...([["ankare-1", "IDLE"], ["ankare-2.1", "READY"], ["ankare-2.2", "READY-B"], ["ankare-2.3", "READY-C"]] as const).map(([role, node]) => ({ id: `paow-${role}`, role, name: role, path: still, node, state: "gäller" })),
    { id: "paow-landning-p4-c1", role: "landning", name: "A3P4C1", path: still, node: "LAND(P4.C1)", card: "P4.C1", state: "gäller" },
    { id: "paow-a3-p4c2-rh", role: "landning", name: "A3P4C2", path: still, node: "LAND(P4.C2)", card: "P4.C2", hand: "RH", state: "gäller" },
  ];
  await writeFile(path.join(root, "data/media-roles.json"), JSON.stringify({ schemaVersion: 1, dealers: { paow: { name: "Paow", entries } }, measures: [] }, null, 2) + "\n");
  await writeFile(path.join(root, "data/clip-jobs.json"), JSON.stringify({ jobs: [], derived: [] }));
  await writeFile(path.join(root, "data/cut-frames.json"), JSON.stringify({ frames: [] }));
  // The dummy's films: the three to A3P4C2 from A2.3 as the register lists them, and the pinch to seat 4 from A2.1.
  const rendered = [...P4C2_FILMS.map(([id, s]) => film(id, "READY-C>P4.C2", s)), film("docka-giv-p4-4", "READY>P4.C1", 3.967, { lays: undefined })];
  for (const r of rendered) {
    await mkdir(path.join(root, path.dirname(r.path)), { recursive: true });
    await writeFile(path.join(root, r.path), Buffer.from(`docka ${r.id}`));
  }
  await writeFile(path.join(root, "data/rendered-references.json"), JSON.stringify({ schemaVersion: 1, about: "test", films: rendered }));

  let origin = "";
  const handle = { fn: null as null | ReturnType<typeof orderRoutes> };
  const server = http.createServer(async (req, res) => { if (!(await handle.fn!(req, res, new URL(req.url ?? "/", origin)))) res.writeHead(404).end(); });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  handle.fn = orderRoutes({ root, origin, now: () => new Date("2026-11-18T02:00:00Z"), poses: {} as never });
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const call = async (method: string, address: string, body?: unknown) => {
    const response = await fetch(origin + address, { method, headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  };

  // The page's facts, from GET /api/orders as Bordet has them.
  const all = (await call("GET", "/api/orders")).json as OrdersAnswer;
  const bank: BankFacts = { jobs: [], derived: [], motions: {}, rendered: all.rendered, cutChecks: readCutChecks({ frames: [] }) };
  const shown = entries.map((e) => ({ ...e, served: e.path }));
  const rowOf = (wish: FilmWish) => filmRow("paow", wish, all.methods!, all.policy, { bank, entries: shown, plan: all.plan ?? null, dealers: all.dealers, marks: all.marks });
  const words = (row: ReturnType<typeof rowOf>) => Object.fromEntries(row.marks.map((m) => [m.name, `${m.ready ? "" : "✗ "}${m.words}`]));

  for (const [card, intent] of [["P4.C2", plan.targets["P4.C2"].intent], ["P4.C1", plan.targets["P4.C1"].intent]] as const) {
    const wishes = cardWishes(card, intent, "paow");
    const rows = wishes.map(rowOf);
    for (const row of rows) assert.deepEqual(row.marks.map((m) => m.name), [...MARK_NAMES], `${row.key}: the five marks in their order`);
    const [deal, back, rest] = rows;
    // The deal can be ordered: the row says what the preview freezes.
    assert.ok(deal.orderable, `${deal.key}: ${deal.why}`);
    assert.equal(deal.why, null);
    const preview = await call("POST", "/api/orders/preview", deal.body);
    assert.equal(preview.status, 200, `${deal.key}: ${preview.json.error}`);
    const o = preview.json.orders[0];
    const picture = (goesAs: string) => o.pictures.find((p: { goesAs: string }) => p.goesAs === goesAs)?.from?.entry ?? null;
    assert.equal(o.step.key, deal.wish.step, `${deal.key}: the step`);
    assert.equal(o.step.shape, deal.resolved.shape, `${deal.key}: bara dit`);
    assert.equal(picture("startFrame"), `paow-ankare-${wishAnchor("paow", card, intent)}`, `${deal.key}: the first picture is the anchor the films go from`);
    assert.equal(picture("endFrame"), deal.resolved.end?.kind === "LANDNING" ? deal.resolved.end.entry.id : null, `${deal.key}: the last picture`);
    assert.deepEqual(o.reference.clips, [deal.reference!.take], `${deal.key}: the reference film`);
    assert.equal(o.generation.model, deal.resolved.model!.id, `${deal.key}: the model`);
    assert.equal(o.generation.params.duration, deal.resolved.seconds, `${deal.key}: the length`);
    assert.equal(o.cost.total, deal.cost, `${deal.key}: the price`);
    assert.equal(o.prompt.text, deal.text, `${deal.key}: the text, word for word`);
    assert.equal(words(deal).Text, `${o.prompt.text.trim().split(/\s+/).length} ord`);
    // The returns are listed and cannot be ordered yet (they are not built); the store does not make them either.
    for (const r of [back, rest]) {
      assert.ok(!r.orderable && r.body === null && r.cost === null && r.why, `${r.key}: listed, not orderable`);
      assert.equal(r.recipe, NOT_YET, `${r.key}: no recipe shown for what cannot be ordered`);
      assert.doesNotMatch(recipeWords(methodFor(all.methods!, r.wish.step, card), card), /bara given|tur och retur/, `${r.key}: a return is no deal`);
      assert.equal(words(r).Text, `✗ ${NOT_YET}`, `${r.key}: no recipe to write it with yet`);
      assert.equal((await call("POST", "/api/orders/preview", { dealer: "paow", step: r.wish.step, target: card })).status, 400, `${r.key}: the store refuses it too`);
    }
    if (card === "P4.C2") {
      // With handbyte: A2.3 → A3P4C2, the right hand's A3, the dummy's film made last, 3 s, 64 credits.
      assert.deepEqual(rows.map((r) => r.line), ["A2.3 → A3P4C2", "A3P4C2 → A2.3", "A3P4C2 → A1"]);
      assert.deepEqual({ ...words(deal), Text: "" }, { "Första bild": "A2.3", Slutbild: "A3P4C2", Referensfilm: "dockan", Text: "", Pris: "64 krediter" });
      assert.equal(deal.reference!.take, "docka-2-3-p4c2-svep24d");
      assert.equal(deal.recipe, "Kling 4 · 1080p · 3 s · bara given, slutar på A3P4C2 · höger hand vänder kortet och lägger det · referensfilm: dockan");
      assert.deepEqual([o.motion.grip, o.motion.hand, o.motion.pass, o.motion.flipAxis], ["TWO_HANDS", "LH", true, "FREE"]);
      // The return from the right hand's A3: its first picture is there; it waits for its recipe.
      assert.equal(words(back)["Första bild"], "A3P4C2");
      assert.equal(sumWords(rows), "3 filmer · 1 kan beställas · 64 krediter");
      assert.equal(motionLine("paow", card, intent, all.methods!), "A2.3 · vänster hand drar ut, höger hand vänder kortet och lägger det · rörelsen följer dockfilmen");
    } else {
      // Without handbyte: from the anchor the game deals the card from, laid by the left hand.
      assert.equal(dealAnchor("paow", card), "2.1");
      assert.deepEqual(rows.map((r) => r.line), ["A2.1 → A3P4C1", "A3P4C1 → A2.1", "A3P4C1 → A1"]);
      assert.deepEqual({ ...words(deal), Text: "", Pris: "" }, { "Första bild": "A2.1", Slutbild: "A3P4C1", Referensfilm: "dockan", Text: "", Pris: "" });
      assert.equal(deal.reference!.take, "docka-giv-p4-4");
      assert.equal(o.motion.pass, false);
      assert.doesNotMatch(deal.recipe, /höger hand/);
      assert.equal(gameLine("paow", card, intent), null);
      assert.equal(motionLine("paow", card, intent, all.methods!), "A2.1 · vänster hand nyper kortet och vänder det på vägen · rörelsen följer dockfilmen, annars en godkänd giv");
    }
  }
  assert.equal(sumWords([]), "Inga filmer");
  assert.equal(sumWords([{ orderable: false, cost: null }]), "1 film · kan inte beställas än");
  assert.equal(sumWords([{ orderable: false, cost: null }, { orderable: false, cost: null }]), "2 filmer · ingen kan beställas än");
});
