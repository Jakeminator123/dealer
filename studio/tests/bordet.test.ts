// Bordet's pure helpers (studio/lib/bordet.ts): the stage's camera, the one card shape, and step 3's list of films: each with
// its step's one recipe, what the store will resolve for it (lineOf), its price, and the body of POST /api/orders, which is
// the line (the dealer, the step and the card, as the production list drafts it) and his exceptions, nothing else.
// Run: node --test "studio/tests/bordet.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STEPS, stepOf, type BankFacts } from "../../src/order-model.ts";
import { methodFor, readMethods, recipeFor, type Method } from "../../src/order-methods.ts";
import { INTENT_DEFAULTS, SHOE, defaultPlan, planQuad } from "../../src/placement-model.ts";
import { draftOf } from "../../tools/produce.ts";
import {
  OTHER_STEPS, ZOOM_MAX, actualCamera, bordetOrderAddress, bordetSceneAddress, sceneWords, cardPath, cardWishes, clampCamera, closeUp, filmRow, fitCamera, lastOrder, lineOf, orderBody, otherWishes, panBy, pictureOrigin, referenceName, sendsOf, sumWords, wishKey, zoomAt,
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

test("a card's films: the deal from the anchor the game deals it from (Paow's seat 6 from 2.2), its return, the return to rest, the deal with two hands; the shoe has none", () => {
  const pinch = cardWishes("P4.C1", { grip: "PINCH" }, "paow").map((w) => w.step);
  const drag = cardWishes("P6.C1", { grip: "PINCH" }, "paow").map((w) => w.step);
  assert.deepEqual(pinch, ["GIV-2.1", "RETUR-2.1", "RETUR-1", "GIV-2.3"]);
  assert.deepEqual(drag, ["GIV-2.2", "RETUR-2.2", "RETUR-1", "GIV-2.3"]);
  assert.ok(OTHER_STEPS.includes("INGANG-2.3"), "the entry to anchor 2.3 is on the list of films without a card");
  assert.deepEqual(cardWishes(SHOE, { grip: "PINCH" }, "paow"), []);
  assert.deepEqual(cardWishes("P6.C1", { grip: "DRAG" }, "pamela").map((w) => w.step)[0], "GIV-2.1", "the plan's grip is not the source: Pamela's game deals seat 6 from 2.1");
  // every film step of the model is offered somewhere in step 3
  const offered = new Set([...pinch, ...drag, ...OTHER_STEPS]);
  for (const s of STEPS.filter((x) => x.kind === "FILM" && !x.off)) assert.ok(offered.has(s.key), `${s.key} kan inte läggas till`);
});

const register = readMethods(JSON.parse(readFileSync(new URL("../../data/order-methods.json", import.meta.url), "utf8"))).register;

test("a film in his notation", () => {
  assert.ok(register, "data/order-methods.json reads");
  const line = (step: string, target: string | null) => filmRow("paow", { step: step as never, target }, register, null).line;
  // A deal is bara dit by its recipe: the notation says the anchor and the card, and the way back only where it is chosen.
  assert.equal(line("GIV-2.1", "P4.C1"), "A2.1 → P4C1");
  assert.equal(line("GIV-2.2", "P3.C2"), "A2.2 → P3C2");
  assert.equal(line("GIV-2.3", "P4.C1"), "A2.3 → P4C1");
  assert.equal(line("INGANG-2.3", null), "A1 → A2.3");
  assert.equal(filmRow("paow", { step: "GIV-2.1", target: "P4.C1" }, register, null, { choice: { shape: "ROUND_TRIP" } }).line, "A2.1 → P4C1 → A2.1");
  assert.equal(line("RETUR-2.1", "P4.C1"), "P4C1 → A2.1");
  assert.equal(line("RETUR-1", "P4.C1"), "P4C1 → A1");
  assert.equal(line("INGANG-2.1", null), "A1 → A2.1");
  assert.equal(line("UTGANG-2.2", null), "A2.2 → A1");
});

test("the body sent for a film is the line: the dealer, the step and the card, as the production list drafts it", () => {
  assert.ok(register);
  const wishes = [...cardWishes("P4.C1", { grip: "PINCH" }, "paow"), ...cardWishes("P6.C1", { grip: "PINCH" }, "paow"), ...cardWishes("D.C1", { grip: "PINCH" }, "paow"), ...otherWishes()];
  let compared = 0;
  for (const w of wishes) {
    const method = methodFor(register, w.step, w.target);
    const body = orderBody("paow", w);
    assert.deepEqual(body, { dealer: "paow", step: w.step, ...(w.target ? { target: w.target } : {}) }, `${wishKey(w)}: nothing but the line`);
    if (!method || method.status === "saknas") continue;
    // the production list's draft for the same step is the same line, with its own notes, title and who made it
    const draft = draftOf({ dealer: { id: "paow", name: "Paow" } }, { label: "x", edge: "x" }, { step: w.step, target: w.target }, method as Method, null, method.status === "prov");
    const same = Object.fromEntries(Object.entries(draft).filter(([k]) => !["notes", "createdBy", "title"].includes(k)));
    assert.deepEqual(body, same, wishKey(w));
    compared++;
  }
  assert.ok(compared >= 8);
});

test("a film's price is the recipe's model, seconds and takes at the policy's prices; a film that cannot be ordered has none and says why", () => {
  assert.ok(register);
  const policy = JSON.parse(readFileSync(new URL("../../data/order-policy.json", import.meta.url), "utf8"));
  // The entry holds as a method and needs nothing but its anchors: the line can be ordered.
  const row = filmRow("paow", { step: "INGANG-2.1", target: null }, register, policy);
  const method = methodFor(register, "INGANG-2.1", null)!;
  assert.deepEqual([row.why, row.body], [null, { dealer: "paow", step: "INGANG-2.1" }]);
  assert.ok(row.cost !== null && row.cost > 0);
  assert.equal(row.recipe.startsWith(method.model === "wan3" ? "WAN 3" : ""), true);
  assert.deepEqual([row.resolved.model?.id, row.resolved.seconds, row.resolved.takes], [method.model, method.seconds, method.takes]);
  // A return has no method yet: no default, no price, no body.
  const none = filmRow("paow", { step: "RETUR-2.1", target: "P4.C1" }, register, policy);
  assert.deepEqual([none.cost, none.body, none.why], [null, null, "ingen metod än"]);
  // A deal bara dit to a seat without an end picture says so plainly, and is not sent.
  const noEnd = filmRow("paow", { step: "GIV-2.1", target: "P4.C1" }, register, policy);
  assert.deepEqual([noEnd.cost, noEnd.body, noEnd.why], [null, null, "ingen slutbild för platsen"]);
  assert.match(sumWords([row, none]), /^2 filmer · [\d  ]+ krediter · 1 utan pris$/);
  assert.equal(sumWords([]), "Inga filmer");
  assert.equal(stepOf("GIV-2.1")!.card, true);
  void INTENT_DEFAULTS;
});

// ── Step 3's choices, its reference film and what is sent ──
test("his exceptions on a row go under the keys the store reads, and only those the routes take; nothing chosen is the line alone", () => {
  assert.ok(register);
  const routes = readFileSync(new URL("../../tools/order-routes.ts", import.meta.url), "utf8");
  const allowed = JSON.parse(/const NEW_KEYS = (\[[^\]]+\])/.exec(routes)![1].replace(/'/g, '"')) as string[];
  const wish = { step: "GIV-2.1" as const, target: "P4.C1" };
  const chosen = orderBody("paow", wish, { model: "wan3", duration: 6, takes: 2, style: "MINIMAL", shape: "ROUND_TRIP", reference: null, hand: "PASS", side: "BACK", cardScale: 1.25, extra: " Slowly. " })!;
  for (const key of Object.keys(chosen)) assert.ok(allowed.includes(key), `${key} tas inte av POST /api/orders`);
  assert.deepEqual([chosen.model, chosen.duration, chosen.takes, chosen.style, chosen.shape, chosen.reference], ["wan3", 6, 2, "MINIMAL", "ROUND_TRIP", null]);
  assert.deepEqual([chosen.hand, chosen.pass, chosen.side, "flipAxis" in chosen, chosen.extra, chosen.cardScale], ["LH", true, "BACK", false, "Slowly.", 1.25]);
  assert.deepEqual(orderBody("paow", wish, {}), { dealer: "paow", step: "GIV-2.1", target: "P4.C1" });
  assert.equal("cardScale" in orderBody("paow", wish, { cardScale: 1 })!, false);
  // a step without a method cannot be sent until the model and the length are said, as an exception
  const none = { step: "RETUR-1" as const, target: "P4.C1" };
  const landing = { id: "l", role: "landning", node: "LAND(P4.C1)", card: "P4.C1", state: "gäller", served: "assets/anchors/l/anchor.png" };
  assert.equal(filmRow("paow", none, register, null, { entries: [landing] }).body, null);
  assert.equal(filmRow("paow", none, register, null, { entries: [landing], choice: { model: "wan3" } }).why, "ingen metod än: säg längden");
  assert.deepEqual(filmRow("paow", none, register, null, { entries: [landing], choice: { model: "wan3", duration: 3 } }).body, { dealer: "paow", step: "RETUR-1", target: "P4.C1", model: "wan3", duration: 3 });
  assert.equal(filmRow("paow", none, register, null, { choice: { model: "wan3", duration: 3 } }).why, "ingen landningsbild gäller för platsen");
});

test("the line as the store resolves it: the recipe, the reference film its rule finds, the film as long as the reference, the seat's own end picture", () => {
  assert.ok(register);
  const straight = { decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-13: bra" };
  const trip = (clip: string, target: string, cut: number) => [{ id: `${clip}-deal`, from: "READY", to: target, clip, frames: [0, cut] as [number, number], dealer: "paow" }, { id: `${clip}-return`, from: target, to: "READY", clip, frames: [cut + 1, cut + 60] as [number, number], dealer: "paow" }];
  const bank: BankFacts = {
    jobs: [{ id: "pamela-p4-c1-plan-deal-02", from: "READY", to: "LAND(P4.C1)" }],
    derived: [...trip("paow-giv-2-1-p4-04-01", "P4.C1", 108), ...trip("paow-giv-2-1-p1-06-01", "P1.C1", 112)],
    motions: { "pamela-p4-c1-plan-deal-02": { source: { frames: 120, fps: 30 }, review: straight }, "paow-giv-2-1-p4-04-01-return": { review: straight }, "paow-giv-2-1-p1-06-01-return": { review: straight }, "paow-giv-2-1-p4-04-01": { source: { frames: 169, fps: 24 } } },
  };
  const of = (target: string, choice = {}, more: Partial<Parameters<typeof lineOf>[0]> = {}) => lineOf({ dealer: "paow", wish: { step: "GIV-2.1", target }, methods: register, bank, entries: [], plan: null, choice, ...more });
  // Seat 4: Kling 4, bara dit, one take (a trial); Pamela's approved deal by rule, 4 s as that film; the cut frame of Paow's own film.
  const p4 = of("P4.C1");
  assert.deepEqual([p4.model?.id, p4.shape, p4.takes, p4.style, p4.flipAxis, p4.reference?.take, p4.seconds, p4.wanted, p4.why], ["kling-4", "ONE_WAY", 1, "KORT", "FREE", "pamela-p4-c1-plan-deal-02", 4, true, null]);
  assert.deepEqual(p4.end && p4.end.kind === "SNITTRUTA" ? [p4.end.cut.clip, p4.end.cut.frame] : null, ["paow-giv-2-1-p4-04-01", 108]);
  assert.equal(recipeFor(register, "GIV-2.1", "P4.C1")!.seconds, 3, "without a reference film the recipe's three seconds");
  // The row for it: the line as body, a price, and the cut frame shown as the last picture.
  const row = filmRow("paow", { step: "GIV-2.1", target: "P4.C1" }, register, JSON.parse(readFileSync(new URL("../../data/order-policy.json", import.meta.url), "utf8")), { bank });
  assert.deepEqual([row.body, row.why, row.line, row.reference?.take], [{ dealer: "paow", step: "GIV-2.1", target: "P4.C1" }, null, "A2.1 → P4C1", "pamela-p4-c1-plan-deal-02"]);
  assert.ok(row.cost !== null && row.cost > 0);
  const anchor = { id: "a21", role: "ankare-2.1", node: "READY", state: "gäller", served: "assets/anchors/a21/anchor.png", name: "Nyp" };
  const sent = sendsOf({ dealer: { id: "paow", name: "Paow", look: "x" }, wish: row.wish, line: row.resolved, entries: [anchor], plan: null, bank })!;
  assert.deepEqual([sent.first.entry?.id, sent.last.entry?.served, sent.last.entry?.frame, sent.last.entry?.fps, sent.last.name, sent.drawn], ["a21", "assets/motions/paow-giv-2-1-p4-04-01/source.mp4", 108, 24, "Sista bild · platsens slutbild: ruta 108 ur paow-giv-2-1-p4-04-01", false]);
  assert.deepEqual([sent.model, sent.seconds, sent.takes, sent.resolution], ["Kling 4", 4, 1, "1080p"]);
  assert.match(sent.prompt!.text, /^Locked camera, one continuous shot\. Video 1 shows only the movement/);
  // Seat 1 has its own end picture, but its recipe takes only the dummy's film, and there is none: it waits.
  const p1 = of("P1.C1");
  assert.deepEqual([p1.end?.kind, p1.reference, p1.why], ["SNITTRUTA", null, "väntar på dockans film till platsen"]);
  // Seat 5 has no end picture of its own: said plainly, before anything about the reference film.
  assert.equal(of("P5.C1").why, "ingen slutbild för platsen");
  // A landing picture for the seat comes before the cut frame, and one seat's picture is never another seat's.
  const landing = { id: "paow-landning-p5", role: "landning", node: "LAND(P5.C1)", card: "P5.C1", state: "gäller", served: "assets/anchors/x/anchor.png" };
  assert.equal(of("P5.C1", {}, { entries: [landing] }).end?.kind, "LANDNING");
  assert.equal(of("P4.C1", {}, { entries: [landing] }).end?.kind, "SNITTRUTA");
  assert.equal(of("P6.C1", {}, { entries: [landing] }).end, null);
  // A handbyte (his exception, or the plan's): the hand at the card is the right one, and no cut frame or reference shows that.
  assert.equal(of("P4.C1", { hand: "PASS" }).why, "ingen slutbild för platsen med höger hand vid kortet");
  // His exceptions: no reference film (then the recipe's 3 s), another film, another model, tur och retur.
  assert.deepEqual([of("P4.C1", { reference: null }).reference, of("P4.C1", { reference: null }).seconds, of("P4.C1", { reference: null }).why], [null, 3, null]);
  assert.deepEqual([of("P4.C1", { model: "wan3" }).model?.id, of("P4.C1", { model: "wan3" }).reference, of("P4.C1", { model: "wan3" }).why], ["wan3", null, null]);
  const round = of("P5.C1", { shape: "ROUND_TRIP", reference: null });
  assert.deepEqual([round.shape, round.end, round.why], ["ROUND_TRIP", null, null]);
  // The dummy's film for the seat comes first where the rule takes it.
  const docka = { ...bank, rendered: [{ id: "docka-giv-p4-4", edge: "READY>P4.C1", path: "assets/references/docka/docka-giv-p4-4/source.mp4", sha256: "a".repeat(64), seconds: 3.967 }] };
  assert.deepEqual([of("P4.C1", {}, { bank: docka }).reference?.take, of("P4.C1", {}, { bank: docka }).seconds], ["docka-giv-p4-4", 4]);
  assert.equal(referenceName({ dealer: "docka", edge: "READY>P4.C1", goesTo: "P4.C1" }, {}), "Dockans giv till plats 4");
  assert.equal(referenceName({ dealer: "pamela", edge: "READY>P4.C1", goesTo: "P4.C1" }, { pamela: "Pamela" }), "Pamelas giv till plats 4");
  assert.equal(referenceName({ dealer: "pamela", edge: "DRAWN>LAND(P4.C1)", goesTo: "P4.C1" }, { pamela: "Pamela" }), "Pamelas giv till plats 4");
  assert.equal(referenceName({ dealer: "paow", edge: "P2.C1>READY", goesTo: "P2.C1" }, { paow: "Paow" }), "Paows retur från plats 2");
});

test("what is sent for a round trip (an exception): the anchor first, the anchor with the plan's card last, the text, model, length, takes", () => {
  const anchor = { id: "a21", role: "ankare-2.1", node: "READY", state: "gäller", served: "assets/anchors/a21/anchor.png", name: "Nyp" };
  const quad: [number, number][] = [[800, 1060], [900, 1060], [905, 1130], [795, 1130]];
  const seat = { target: "P4.C1", centre: [850, 1095] as [number, number], quad, side: "FRONT" as const, startSide: "BACK" as const, hand: "LH" as const, pass: false, grip: "PINCH" as const, turnAt: "AIR" as const, flipAxis: "FREE" as const, crosses: false };
  const wish = { step: "GIV-2.1" as const, target: "P4.C1" }, plan = { seats: { "P4.C1": seat } };
  const choice = { shape: "ROUND_TRIP" as const, reference: null, duration: 7 };
  const line = lineOf({ dealer: "paow", wish, methods: register, bank: null, entries: [anchor], plan, choice });
  const s = sendsOf({ dealer: { id: "paow", name: "Paow", look: "a young woman" }, wish, line, choice, entries: [anchor], plan })!;
  assert.equal(s.first.entry?.id, "a21");
  assert.equal(s.last.entry?.id, "a21");
  assert.equal(s.drawn, true);
  assert.deepEqual(s.last.cards, [{ quad, side: "FRONT" }]);
  assert.equal(s.model, "Kling 4");
  assert.equal(s.seconds, 7);
  assert.equal(s.takes, 1);
  assert.ok(s.prompt && s.prompt.text.length > 100);
  // bara dit (the recipe) to a seat without an end picture: the last picture says so, nothing is drawn
  const bare = lineOf({ dealer: "paow", wish, methods: register, bank: null, entries: [anchor], plan });
  const oneWay = sendsOf({ dealer: { id: "paow", name: "Paow", look: "x" }, wish, line: bare, entries: [anchor], plan })!;
  assert.equal(oneWay.drawn, false);
  assert.deepEqual([oneWay.last.waiting, oneWay.last.name], ["platsens slutbild", "Sista bild · plats 4 har ingen slutbild"]);
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
