// Bordet's pure helpers (studio/lib/bordet.ts): the stage's camera, the one card shape, and step 3's list of films with the
// method's recipe, price and the body of POST /api/orders, which must be the production list's own draft (tools/produce.ts).
// Run: node --test "studio/tests/bordet.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STEPS, stepOf } from "../../src/order-model.ts";
import { methodFor, readMethods, type Method } from "../../src/order-methods.ts";
import { INTENT_DEFAULTS, SHOE, defaultPlan, planQuad } from "../../src/placement-model.ts";
import { draftOf } from "../../tools/produce.ts";
import {
  OTHER_STEPS, ZOOM_MAX, actualCamera, bordetOrderAddress, bordetSceneAddress, sceneWords, cardPath, cardWishes, clampCamera, closeUp, filmRow, fitCamera, lastOrder, orderBody, otherWishes, panBy, pictureOrigin, referenceName, sendsOf, straightReference, sumWords, wishKey, withChoice, zoomAt,
} from "../lib/bordet.ts";

const picture = { w: 1762, h: 1174 };
const area = { w: 1000, h: 700 };

test("Anpassa lays the whole picture in the stage, in its middle", () => {
  const c = fitCamera(area, picture);
  assert.ok(Math.abs(c.scale - 1000 / 1762) < 1e-9);
  const o = pictureOrigin(c, area);
  assert.ok(Math.abs(o.left) < 1e-9);
  assert.ok(Math.abs(o.top - (700 - 1174 * c.scale) / 2) < 1e-9);
});

test("the wheel zooms towards the pointer: the picture's point under it stays", () => {
  const c = fitCamera(area, picture);
  const at = { x: 730, y: 420 };
  const before = pictureOrigin(c, area);
  const point = { x: (at.x - before.left) / c.scale, y: (at.y - before.top) / c.scale };
  const z = zoomAt(c, 2, at, area, picture);
  const after = pictureOrigin(z, area);
  assert.ok(Math.abs(z.scale - c.scale * 2) < 1e-9);
  assert.ok(Math.abs(after.left + point.x * z.scale - at.x) < 1e-6);
  assert.ok(Math.abs(after.top + point.y * z.scale - at.y) < 1e-6);
});

test("the camera stays sane: scale between the fit and the most (never smaller than Anpassa), the picture never pans out of the stage", () => {
  const c = fitCamera(area, picture);
  assert.equal(clampCamera({ ...c, scale: 100 }, area, picture).scale, ZOOM_MAX);
  assert.ok(Math.abs(clampCamera({ ...c, scale: 0.01 }, area, picture).scale - c.scale) < 1e-9);
  const big = actualCamera(c, area, picture);
  assert.equal(big.scale, 1);
  const far = panBy(big, 100000, 100000, area, picture);
  const o = pictureOrigin(far, area);
  assert.ok(o.left <= 1e-6 && o.top <= 1e-6, "the picture's top left corner stays at or beyond the stage's");
  // smaller than the stage: it stays in the middle whatever the drag
  const small = panBy(c, 500, 0, area, picture);
  assert.equal(small.x, picture.w / 2);
});

test("Närbild puts the chosen card in the middle, large", () => {
  const q = planQuad(defaultPlan(), "P4.C1", "native");
  const c = closeUp(q, area, picture);
  const cx = (Math.max(...q.map((p) => p.x)) + Math.min(...q.map((p) => p.x))) / 2;
  assert.ok(Math.abs(c.x - cx) < 1e-6);
  assert.ok(c.scale > fitCamera(area, picture).scale * 2);
});

test("one card shape: rounded corners a share of the card's own side, the same look at every size", () => {
  const q = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 140 }, { x: 0, y: 140 }];
  const d = cardPath(q);
  assert.match(d, /^M0,8Q0,0 8,0L92,0Q100,0 100,8L100,132Q100,140 92,140L8,140Q0,140 0,132Z$/);
  // twice as large: the same path, every number doubled
  const big = cardPath(q.map((p) => ({ x: p.x * 2, y: p.y * 2 })));
  assert.equal(big, d.replace(/\d+(\.\d+)?/g, (n) => String(Number(n) * 2)));
});

test("a card's films: the deal from the anchor the plan's grip says, its return, the return to rest; the shoe has none", () => {
  const pinch = cardWishes("P4.C1", { grip: "PINCH" }).map((w) => w.step);
  const drag = cardWishes("P6.C1", { grip: "DRAG" }).map((w) => w.step);
  assert.deepEqual(pinch, ["GIV-2.1", "RETUR-2.1", "RETUR-1"]);
  assert.deepEqual(drag, ["GIV-2.2", "RETUR-2.2", "RETUR-1"]);
  assert.deepEqual(cardWishes(SHOE, { grip: "PINCH" }), []);
  // every film step of the model is offered somewhere in step 3
  const offered = new Set([...pinch, ...drag, ...OTHER_STEPS]);
  for (const s of STEPS.filter((x) => x.kind === "FILM" && !x.off)) assert.ok(offered.has(s.key), `${s.key} kan inte läggas till`);
});

const register = readMethods(JSON.parse(readFileSync(new URL("../../data/order-methods.json", import.meta.url), "utf8"))).register;

test("a film in his notation", () => {
  assert.ok(register, "data/order-methods.json reads");
  const line = (step: string, target: string | null) => filmRow("paow", { step: step as never, target }, register, null).line;
  assert.equal(line("GIV-2.1", "P4.C1"), "A2.1 → P4C1 → A2.1");
  assert.equal(line("GIV-2.2", "P3.C2"), "A2.2 → P3C2 → A2.2");
  assert.equal(line("RETUR-2.1", "P4.C1"), "P4C1 → A2.1");
  assert.equal(line("RETUR-1", "P4.C1"), "P4C1 → A1");
  assert.equal(line("INGANG-2.1", null), "A1 → A2.1");
  assert.equal(line("UTGANG-2.2", null), "A2.2 → A1");
});

test("the body sent for a film is the production list's own draft, without what the page cannot set", () => {
  assert.ok(register);
  const wishes = [...cardWishes("P4.C1", { grip: "PINCH" }), ...cardWishes("P6.C1", { grip: "DRAG" }), ...cardWishes("D.C1", { grip: "PINCH" }), ...otherWishes()];
  let compared = 0;
  for (const w of wishes) {
    const method = methodFor(register, w.step, w.target);
    const body = orderBody("paow", w, method);
    if (!method || method.status === "saknas" || method.reference !== "ingen") {
      assert.equal(body, null, `${wishKey(w)}: no body without a whole method`);
      continue;
    }
    // a method still being tried is ordered as the list's trial: one take (its title is the store's here)
    const draft = draftOf({ dealer: { id: "paow", name: "Paow" } }, { label: "x", edge: "x" }, { step: w.step, target: w.target }, method as Method, null, method.status === "prov");
    const same = Object.fromEntries(Object.entries(draft).filter(([k]) => !["notes", "createdBy", "title"].includes(k)));
    assert.deepEqual(body, same, wishKey(w));
    compared++;
  }
  assert.ok(compared >= 5);
});

test("a film's price is the method's model, seconds and takes at the policy's prices; the sum says what has none", () => {
  assert.ok(register);
  const policy = JSON.parse(readFileSync(new URL("../../data/order-policy.json", import.meta.url), "utf8"));
  const row = filmRow("paow", { step: "GIV-2.1", target: "P4.C1" }, register, policy);
  const method = methodFor(register, "GIV-2.1", "P4.C1")!;
  assert.ok(row.cost !== null && row.cost > 0);
  assert.equal(row.recipe.startsWith(method.model === "kling-4" ? "Kling 4" : ""), true);
  const none = filmRow("paow", { step: "RETUR-2.1", target: "P4.C1" }, register, policy);
  assert.equal(none.cost, null);
  assert.equal(none.why, "ingen metod än");
  assert.match(sumWords([row, none]), /^2 filmer · [\d  ]+ krediter · 1 utan pris$/);
  assert.equal(sumWords([]), "Inga filmer");
  assert.equal(stepOf("GIV-2.1")!.card, true);
  void INTENT_DEFAULTS;
});

// ── Step 3's choices, its reference film and what is sent ──
test("his choices on a row go under the keys Ny beställning sends, and only those the routes take", () => {
  assert.ok(register);
  const routes = readFileSync(new URL("../../tools/order-routes.ts", import.meta.url), "utf8");
  const allowed = JSON.parse(/const NEW_KEYS = (\[[^\]]+\])/.exec(routes)![1].replace(/'/g, '"')) as string[];
  const wish = { step: "GIV-2.1" as const, target: "P4.C1" };
  const base = orderBody("paow", wish, methodFor(register, wish.step, wish.target));
  const chosen = withChoice("paow", wish, base, { model: "wan3", duration: 6, takes: 2, style: "MINIMAL", shape: "ONE_WAY", hand: "PASS", side: "BACK", flipAxis: "LONG_EDGE", cardScale: 1.25, extra: " Slowly. " });
  assert.ok(chosen);
  for (const key of Object.keys(chosen!)) assert.ok(allowed.includes(key), `${key} tas inte av POST /api/orders`);
  assert.equal(chosen!.model, "wan3");
  assert.deepEqual([chosen!.hand, chosen!.pass, chosen!.side, chosen!.flipAxis, chosen!.extra], ["LH", true, "BACK", "LONG_EDGE", "Slowly."]);
  // the step's own model is not named; nothing chosen is the method's body unchanged
  assert.equal("model" in withChoice("paow", wish, base, { model: "kling-4" })!, false);
  assert.deepEqual(withChoice("paow", wish, base, {}), base);
  // no method and nothing chosen: nothing can be sent; a choice gives Ny beställning's defaults with it
  const none = { step: "RETUR-1" as const, target: "P4.C1" };
  assert.equal(withChoice("paow", none, orderBody("paow", none, methodFor(register, none.step, none.target)), {}), null);
  assert.deepEqual(withChoice("paow", none, null, { takes: 1 }), { dealer: "paow", step: "RETUR-1", target: "P4.C1", duration: 3, takes: 1, style: "KORT", extra: null });
});

test("a method that wants a reference film takes the production list's: a straight-approved deal to the same seat", async () => {
  const { readBank, straightReferences } = await import("../../tools/produce.ts");
  const bank = await readBank(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  for (const target of ["P1.C1", "P4.C1", "P6.C1", "D.C1"])
    for (const dealer of ["paow", "pamela"]) assert.equal(straightReference(bank as never, dealer, "GIV-2.1", target, "kling-4")?.take ?? null, straightReferences(bank as never, dealer, "GIV-2.1", target, "kling-4")[0]?.take ?? null, `${dealer} ${target}`);
  // the body carries it, and without one the method's model for that case (or nothing)
  const method = { ...methodFor(register, "GIV-2.1", "P4.C1")!, reference: "samma-plats-rakt-godkänd" as const, noReferenceModel: "wan3" };
  assert.equal(orderBody("paow", { step: "GIV-2.1", target: "P4.C1" }, method, "pamela-p4-c1-plan-deal-02")!.reference, "pamela-p4-c1-plan-deal-02");
  assert.equal(orderBody("paow", { step: "GIV-2.1", target: "P4.C1" }, method, null)!.model, "wan3");
  assert.equal(orderBody("paow", { step: "GIV-2.1", target: "P4.C1" }, { ...method, noReferenceModel: null }, null), null);
  assert.equal(referenceName({ dealer: "pamela", edge: "READY>P4.C1", goesTo: "P4.C1" }, { pamela: "Pamela" }), "Pamelas giv till plats 4");
  assert.equal(referenceName({ dealer: "paow", edge: "P2.C1>READY", goesTo: "P2.C1" }, { paow: "Paow" }), "Paows retur från plats 2");
});

test("what is sent for a row: the anchor first, the anchor with the plan's card last, the text, model, length, takes", () => {
  const anchor = { id: "a21", role: "ankare-2.1", node: "READY", state: "gäller", served: "assets/anchors/a21/anchor.png", name: "Nyp" };
  const quad: [number, number][] = [[800, 1060], [900, 1060], [905, 1130], [795, 1130]];
  const seat = { target: "P4.C1", centre: [850, 1095] as [number, number], quad, side: "FRONT" as const, startSide: "BACK" as const, hand: "LH" as const, pass: false, grip: "PINCH" as const, turnAt: "AIR" as const, flipAxis: "FREE" as const, crosses: false };
  const body = { dealer: "paow", step: "GIV-2.1" as const, target: "P4.C1", takes: 1, style: "KORT" as const, duration: 7, shape: "ROUND_TRIP" as const, extra: null };
  const s = sendsOf({ dealer: { id: "paow", name: "Paow", look: "a young woman" }, body, entries: [anchor], plan: { seats: { "P4.C1": seat } } })!;
  assert.equal(s.first.entry?.id, "a21");
  assert.equal(s.last.entry?.id, "a21");
  assert.equal(s.drawn, true);
  assert.deepEqual(s.last.cards, [{ quad, side: "FRONT" }]);
  assert.equal(s.model, "Kling 4");
  assert.equal(s.seconds, 7);
  assert.equal(s.takes, 1);
  assert.ok(s.prompt && s.prompt.text.length > 100);
  // bara dit: the last picture is the landing picture, nothing drawn
  const oneWay = sendsOf({ dealer: { id: "paow", name: "Paow", look: "x" }, body: { ...body, shape: "ONE_WAY" }, entries: [anchor], plan: { seats: { "P4.C1": seat } } })!;
  assert.equal(oneWay.drawn, false);
  assert.equal(oneWay.last.waiting, "landningsbilden");
});

test("Beställ's old address leads to Bordet's Beställ with its words", () => {
  assert.equal(bordetOrderAddress(new URLSearchParams("order=paow-giv-2-1-p4-05")), "/bordet/?lage=bestall&ko=1&order=paow-giv-2-1-p4-05");
  assert.equal(bordetOrderAddress(new URLSearchParams("ny=1&dealer=paow&steg=GIV-2.2&plats=P4.C1")), "/bordet/?lage=bestall&ko=1&ny=1&dealer=paow&steg=GIV-2.2&plats=P4.C1");
});

test("Granska filmen: a film's last order is the newest of the same dealer, step and card that is not set aside", () => {
  const a = (id: string, created: string, step: string, target: string | null, status = "UTKAST", dealer = "paow") => ({ order: { id, dealer, status, created, step: { key: step }, motion: target ? { target } : null } });
  const list = [a("x1", "2026-11-17T10:00Z", "GIV-2.1", "P4.C1"), a("x2", "2026-11-17T12:00Z", "GIV-2.1", "P4.C1"), a("x3", "2026-11-17T13:00Z", "GIV-2.1", "P4.C1", "AVBRUTEN"), a("x4", "2026-11-17T14:00Z", "GIV-2.1", "P5.C1"), a("x5", "2026-11-17T15:00Z", "GIV-2.1", "P4.C1", "UTKAST", "pamela"), a("x6", "2026-11-17T09:00Z", "VILA", null)];
  assert.equal(lastOrder(list, "paow", { step: "GIV-2.1", target: "P4.C1" })?.order.id, "x2");
  assert.equal(lastOrder(list, "paow", { step: "VILA", target: null })?.order.id, "x6");
  assert.equal(lastOrder(list, "paow", { step: "RETUR-1", target: "P4.C1" }), null);
  // the newest that brought a film comes before a newer one still on its way
  assert.equal(lastOrder(list, "paow", { step: "GIV-2.1", target: "P4.C1" }, (id) => id === "x1")?.order.id, "x1");
});

test("Scen's addresses lead to Bordet's Scen or Råfilm with the same round and look; the studio opens on Bordet", () => {
  const q = (text: string) => new URLSearchParams(text);
  assert.equal(bordetSceneAddress(q("")), "/bordet/");
  assert.equal(bordetSceneAddress(q("dealer=paow&robot=1")), "/bordet/?dealer=paow&robot=1");
  assert.equal(bordetSceneAddress(q("runda=A2.1+-+P4C1+-+A2.1&forval=levande&dust=0.8")), "/bordet/?lage=scen&runda=A2.1+-+P4C1+-+A2.1&forval=levande&dust=0.8");
  assert.equal(bordetSceneAddress(q("kant=READY%3EP2.C1&tagning=paow-giv-2-1-p2-01")), "/bordet/?lage=scen&kant=READY%3EP2.C1&tagning=paow-giv-2-1-p2-01");
  assert.equal(bordetSceneAddress(q("runda=v6-filmen&vy=platt")), "/bordet/?lage=rafilm&runda=v6-filmen");
  assert.equal(bordetSceneAddress(q("forval=levande&room=la&dust=0.8&sway=0&zoom=1.1")), "/bordet/?lage=scen&forval=levande&room=la&dust=0.8&sway=0&zoom=1.1");
  // none of Bordet's own words is a word of the scene
  for (const own of ["lage", "plats", "ko", "order", "ny", "som", "dealer", "steg", "modell"]) assert.equal(sceneWords.has(own), false, own);
});
