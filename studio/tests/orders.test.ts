// The pure part of the view Beställ (studio/lib/orders.ts) on the checkout's orders: every argument of the call shown by
// name (also for a film in 4K), what is deliberately not sent, the sections of the queue, status words with sign, the anchors a new order starts
// from, a new order asked for by address, whose a picture is, a deal's choices in words, and the text's marks made by the
// same function as the stored text. Run from the repo root: node --test "studio/tests/orders.test.ts".
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  HANDOVER, PRESET_PARAMS, SHOWN_CHIP, anchorFor, cardOf, dealAnchor, costWords, firstLacking, goesWords, gripAgainstPlan, markOf, motionWords, offsetWords, orderableCard, ownerWords, paramRows, picturesInOrder, plannedWords, presetAddress, presetOf, recipeOf,
  referenceWords, routeOf, seatKey, sections, shownWords, storedParts, styleWords, withCard, orderSaveFailure, type Order, type OrderAnswer,
} from "../lib/orders.ts";
import { ApiError } from "../lib/api.ts";
import { parseJakob } from "../lib/names.ts";
import { ALL_SEVEN, MODELS, SHOWN_LABEL, STEPS, cutIntoOf, stepOf, type StepKey } from "../../src/order-model.ts";
import { planAnswerOf } from "../../tools/order-store.ts";
import { readPlan } from "../../tools/order-images.ts";
import { orderPrompt } from "../../src/order-prompts.ts";

test("a lost or unreadable save response requires retrying the same frozen preview", () => {
  for (const error of [new ApiError("offline", 0, "network"), new ApiError("server", 500, "server"), new SyntaxError("truncated JSON")]) {
    assert.equal(orderSaveFailure(error).retrySave, true, error.message);
  }
  assert.equal(orderSaveFailure(new ApiError("underlaget har ändrats", 409, "conflict")).retrySave, false);
  assert.equal(orderSaveFailure(new ApiError("förhandsvisningen har gått ut", 428, "precondition")).retrySave, false);
});

async function drafts(): Promise<Order[]> {
  const names = (await readdir("data/orders")).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(`data/orders/${n}`, "utf8")) as Order));
}
const answer = (order: Order, extra: Partial<OrderAnswer> = {}): OrderAnswer => ({ order, revision: '"r"', hash: "h", shown: "KLAR_ATT_TRYCKA", problems: [], warnings: [], waiting: [], receipt: null, check: null, ...extra });

test("Det här skickas: every argument by its name, as the ordering agent will send it", async () => {
  const all = await drafts();
  const film = all.find((o) => o.id === "paow-giv-p4")!;
  const rows = paramRows(film);
  assert.deepEqual(rows.map((r) => [r.name, r.value]), [
    ["verktyg", "generate_video"],
    ["model", "kling-4"],
    ["resolution", "1080p"],
    ["duration", "7"],
    ["startFrame", "first.png"],
    ["endFrame", "last.png"],
    ["confirmRepeat", "true"],
    ["generateAudio", "skickas inte"],
    ["ratio", "skickas inte"],
  ]);
  const still = all.find((o) => o.id === "paow-ankare-2-1")!;
  assert.deepEqual(paramRows(still).map((r) => [r.name, r.value]), [
    ["verktyg", "generate_image"],
    ["model", "nano-banana-pro"],
    ["ratio", "4:3"],
    ["imageSize", "4K"],
    ["referenceImages[0]", "anchor.png · tag anchor"],
    ["referenceImages[1]", "pose-figure.png · tag pose"],
    ["count", "1"],
    ["confirmRepeat", "true"],
  ]);
  assert.deepEqual(picturesInOrder(film.pictures).map((p) => p.name), ["first.png", "last.png"]);
  assert.deepEqual(picturesInOrder(still.pictures).map(goesWords), ["referenceImages · @anchor", "referenceImages · @pose"]);
  assert.equal(costWords(film), "2 tagningar × 150 = 300 krediter");
  assert.equal(offsetWords(1.1), "1,1 px från planen");
});

test("Det här skickas for a film in 4K: the model, every argument, what is not sent, and that it is scaled to the bank's frame", async () => {
  const film = (await drafts()).find((o) => o.id === "paow-giv-p4")!;
  const as4k: Order = { ...film, takes: 1, generation: { ...film.generation, model: "kling-3-4k", params: { resolution: "4k", duration: 4, generateAudio: false } } };
  const rows = paramRows(as4k);
  assert.deepEqual(rows.map((r) => [r.name, r.value]), [
    ["verktyg", "generate_video"],
    ["model", "kling-3-4k"],
    ["resolution", "4k"],
    ["duration", "4"],
    ["generateAudio", "false"],
    ["startFrame", "first.png"],
    ["endFrame", "last.png"],
    ["ratio", "skickas inte"],
  ]);
  assert.match(rows.at(-1)!.note!, /16:9/, "the shape the schema does not give is said");
  assert.match(MODELS["kling-3-4k"].delivered!, /levereras i 4K och skalas i efterarbetet till bankens 1764 × 1174; 4K-originalet sparas orört som source\.mp4/);
  assert.match(MODELS["kling-3-4k"].note, /endFrame-fältets egen lista nämner den inte/);
});

test("the queue: sections, status words with sign, and the hand-over line", async () => {
  // Made from the checkout's orders but placed in each state, so the test does not move when Jakob approves one.
  const all = await drafts();
  const film = all.find((o) => o.id === "paow-giv-p4")!, still = all.find((o) => o.id === "paow-ankare-2-1")!;
  const draft = (o: Order): Order => ({ ...o, status: "UTKAST", approval: null });
  const approved = (o: Order): Order => ({ ...o, status: "GODKÄND", approval: { by: "jakob", at: "2026-11-13T00:55:00Z", orderSha256: "a".repeat(64) } });
  const list = [
    answer(draft(still)),
    answer(draft(film), { shown: "VÄNTAR", waiting: [{ dealer: "paow", label: "ankare 2.1", ready: false }] }),
    answer(approved(still), { shown: "GODKÄND" }),
    answer(approved(film), { shown: "HÄMTAD" }),
    answer({ ...draft(film), status: "AVBRUTEN" }, { shown: "AVBRUTEN" }),
  ];
  assert.deepEqual(sections(list).map((s) => [s.key, s.orders.length]), [["redo", 1], ["vantar", 1], ["kon", 1], ["lagda", 1], ["avbrutna", 1]]);
  assert.equal(shownWords(list[1]), "Väntar på ankare 2.1");
  for (const key of Object.keys(SHOWN_LABEL)) assert.ok(SHOWN_CHIP[key as keyof typeof SHOWN_CHIP].sign, key);
  assert.equal(HANDOVER, "Säg 'lägg kön' till filmagenten eller huvudagenten, så läggs godkända beställningar.");
});

test("a new order starts from the anchor that holds, else from what the dealer lacks", () => {
  const e = (id: string, role: string, node: string, state?: string, card?: string) => ({ id, role, node, state, card, served: `assets/${id}.png` });
  const paow = [e("v2", "ankare-1", "IDLE", "kandidat"), e("v1", "ankare-1", "IDLE", "kandidat"), e("old", "ankare-2.1", "READY", "ersatt"), e("card", "ankare-2.1", "READY", "gäller", "P4.C1")];
  assert.deepEqual(anchorFor(paow, "1"), { holds: null, candidates: [paow[0], paow[1]] });
  assert.equal(anchorFor(paow, "2.1").holds, null, "a picture with a card on the table is not the anchor");
  assert.equal(firstLacking(paow), "ANKARE-2.1");
  assert.equal(firstLacking([...paow, e("n", "ankare-2.1", "READY", "gäller"), e("s", "ankare-2.2", "READY-B", "gäller")]), "GIV-2.1");
});

test("a new order asked for by address: dealer, step and seat, or the deal the game deals the seat from, or all seven", async () => {
  const q = (s: string) => presetOf(new URLSearchParams(s));
  assert.deepEqual(q("ny=1&dealer=paow&steg=GIV-2.2&plats=P4.C1"), { dealer: "paow", step: "GIV-2.2", target: "P4.C1", all: false, model: null });
  // A seat without a step: the anchor the game deals it from (dealPose), never the plan's grip; Paow's seat 6 from 2.2.
  assert.deepEqual(q("ny=1&plats=P3.C1"), { dealer: null, step: "GIV-2.1", target: "P3.C1", all: false, model: null });
  assert.equal(q("ny=1&plats=P6.C1")?.step, "GIV-2.2", "Paow, the sheet's dealer, deals seat 6 from anchor 2.2");
  assert.equal(q("ny=1&dealer=paow&plats=P6.C1")?.step, `GIV-${dealAnchor("paow", "P6.C1")}`);
  assert.equal(q("ny=1&dealer=pamela&plats=P6.C1")?.step, "GIV-2.1", "Pamela deals every seat from 2.1");
  assert.deepEqual(q("ny=1&dealer=paow&steg=giv-2.2&plats=alla"), { dealer: "paow", step: "GIV-2.2", target: null, all: true, model: null });
  assert.deepEqual(q("ny=1&dealer=paow&steg=INGANG-2.1&modell=kling-3-4k"), { dealer: "paow", step: "INGANG-2.1", target: null, all: false, model: "kling-3-4k" }, "a model chosen by address");
  assert.equal(q("ny=1&steg=INGANG-2.1&modell=gen-9")?.model, null, "a model that does not exist is not chosen");
  assert.equal(q("ny=1&modell=toString")?.model, null);
  assert.ok(PRESET_PARAMS.includes("modell"), "closing the sheet takes the model out of the address");
  assert.equal(q("ny=1&steg=RETUR-2.1")?.step, "RETUR-2.1", "a return is its own film now");
  assert.equal(q("ny=1&steg=MELLANBILD")?.step, null, "a step that does not exist is not chosen");
  assert.equal(q("plats=P4.C1"), null, "without ny=1 nothing opens");
  assert.deepEqual(q("ny=1&som=paow-giv-p4"), { dealer: null, step: null, target: null, all: false, model: null, like: "paow-giv-p4" }, "a new order like an old one");
  assert.equal(q("ny=1&som=../x")?.like, undefined, "only an order's id");
  assert.ok(PRESET_PARAMS.includes("som"));
  // A seat's second card, as the picture chooses it (Jakob 2026-11-17: "A2.2 till P3C2 och tillbaka till A2.2").
  assert.deepEqual(q("ny=1&dealer=paow&steg=GIV-2.2&plats=P3.C2"), { dealer: "paow", step: "GIV-2.2", target: "P3.C2", all: false, model: null });
  assert.equal(q("ny=1&plats=p3.c2")?.target, "P3.C2");
  for (const no of ["P3.C3", "P8.C2", "D.C4", "SKO"]) assert.equal(q(`ny=1&plats=${no}`)?.target, null, no);
  assert.equal(q("ny=1&plats=D.C3")?.target,"D.C3");
  // The address "Flytta kortets plats" hands to Placering reads back as the same values.
  const back = presetAddress({ dealer: "paow", step: "GIV-2.2", target: "P3.C2", model: null });
  assert.equal(back, "/bestall/?ny=1&dealer=paow&steg=GIV-2.2&plats=P3.C2");
  assert.deepEqual(q(back.split("?")[1]), { dealer: "paow", step: "GIV-2.2", target: "P3.C2", all: false, model: null });
  assert.deepEqual(q(presetAddress({ dealer: "paow", step: "GIV-2.1", target: "P4.C1", all: true, model: "kling-4" }).split("?")[1]), { dealer: "paow", step: "GIV-2.1", target: null, all: true, model: "kling-4" });
});

test("the card an order goes to: every card of the plan, a seat's second card too; the seat field and the card number stay in step", async () => {
  const { plan, file } = await readPlan(process.cwd());
  const p = planAnswerOf(plan, file);
  assert.deepEqual(Object.keys(p.seats).filter((t) => !orderableCard(t)), [], "every card of the plan can be pressed");
  for (const no of ["P3.C3", "P8.C1", "D.C4", "SHOE", "", null]) assert.equal(orderableCard(no), false, String(no));
  assert.equal(orderableCard("D.C3"),true);
  assert.deepEqual(["P3.C2", "P3.C1", "D.C1", "D.C2"].map(seatKey), ["P3.C1", "P3.C1", "D.C1", "D.C2"]);
  assert.deepEqual(["P3.C2", "P3.C1", "D.C2"].map(cardOf), [2, 1, 1]);
  assert.deepEqual([withCard("P5.C1", 2), withCard("P3.C2", 1), withCard("D.C1", 2), withCard("D.C2", 1)], ["P5.C2", "P3.C1", "D.C1", "D.C2"]);
  // Choosing seat 5 in the field while P3 kort 2 is chosen: P5 kort 2, as the picture would show it.
  assert.equal(withCard(seatKey("P5.C1"), cardOf("P3.C2")), "P5.C2");
});

test("what is ordered, in his notation and one sentence: the edges the film is filed under, read back by his own parser", () => {
  const route = (key: StepKey, targets: string[], shape: "ROUND_TRIP" | "ONE_WAY" | null = null) => routeOf(stepOf(key)!, targets, shape, "Paow");
  const example = route("GIV-2.2", ["P3.C2"], "ROUND_TRIP");
  assert.deepEqual([example.line, example.sentence], ["A2.2 → P3C2 → A2.2", "Släp: ett kort till plats 3, kort 2, och tillbaka över skon."]);
  assert.deepEqual(parseJakob(example.line), { steps: [{ from: "READY-B", to: "P3.C2" }, { from: "P3.C2", to: "READY-B" }], errors: [] }, "the line is his notation");
  assert.deepEqual(example.nodes, ["READY-B", "P3.C2", "READY-B"]);
  assert.deepEqual(cutIntoOf(stepOf("GIV-2.2")!, "P3.C2", "ROUND_TRIP"), ["READY-B>P3.C2", "P3.C2>READY-B"], "the same edges the store files the film under");
  const said = (key: StepKey, targets: string[], shape: "ROUND_TRIP" | "ONE_WAY" | null = null) => { const r = route(key, targets, shape); return [r.line, r.sentence]; };
  assert.deepEqual(said("GIV-2.1", ["P4.C1"], "ROUND_TRIP"), ["A2.1 → P4C1 → A2.1", "Nyp: ett kort till plats 4, och tillbaka till nypet."]);
  assert.deepEqual(said("GIV-2.1", ["P4.C1"], "ONE_WAY"), ["A2.1 → P4C1", "Nyp: ett kort till plats 4, bara dit."]);
  assert.deepEqual(said("GIV-2.2", [...ALL_SEVEN], "ROUND_TRIP"), ["A2.2 → P1C1–P7C1 → A2.2", "Släp: ett kort till var och en av plats 1–7, och tillbaka över skon."]);
  assert.deepEqual(said("GIV-2.1", ["D.C2"], "ROUND_TRIP"), ["A2.1 → DC2 → A2.1", "Nyp: ett kort till dealerns hålkort, och tillbaka till nypet."]);
  assert.deepEqual(said("RETUR-2.2", ["P3.C2"], "ONE_WAY"), ["P3C2 → A2.2", "Tillbaka över skon, från kortet på plats 3, kort 2."]);
  assert.deepEqual(said("RETUR-1", ["P4.C1"], "ONE_WAY"), ["P4C1 → A1", "Tillbaka till vila, från kortet på plats 4."]);
  // A film without a card: the anchors it goes between, and nothing of how she moves (only what is sent is described).
  assert.deepEqual(said("INGANG-2.1", [], "ONE_WAY"), ["A1 → A2.1", "Från ankare 1 till ankare 2.1."]);
  assert.deepEqual(said("INGANG-2.3", [], "ONE_WAY"), ["A1 → A2.3", "Från ankare 1 till ankare 2.3."]);
  assert.deepEqual(said("GIV-2.3", ["P4.C1"], "ONE_WAY"), ["A2.3 → P4C1", "Två händer: ett kort till plats 4, bara dit."]);
  assert.deepEqual(said("VILA", [], "ONE_WAY"), ["A1 → A1", "Från och till ankare 1."]);
  assert.deepEqual(said("HALKORT", [], "ONE_WAY")[0], "A1 → DC2 upp");
  assert.deepEqual(said("ANKARE-2.2", []), ["A1 → bild A2.2", "Bild: ankare 2.2 görs ur ankare 1."]);
  // Every step has a line and a sentence, and every film's line reads back without an error.
  for (const s of STEPS) {
    const r = routeOf(s, s.card ? ["P4.C1"] : [], s.kind === "FILM" ? (s.card && s.start !== "LAND" ? "ROUND_TRIP" : "ONE_WAY") : null, "Paow");
    assert.ok(r.line && r.sentence.endsWith("."), s.key);
    if (s.kind === "FILM") assert.deepEqual(parseJakob(r.line).errors, [], `${s.key}: ${r.line}`);
  }
});

test("where a step and Placering differ, one line with the choices' own labels: the sheet before, the draft after", () => {
  const seat = (target: string, grip: "PINCH" | "DRAG") => ({ target, grip });
  const drag = stepOf("GIV-2.2")!;
  const pinch = stepOf("GIV-2.1")!;
  assert.equal(gripAgainstPlan(drag, [seat("P6.C1", "PINCH")]), "Placering säger A2.1 nyp för plats 6; steget är A2.2 släp.");
  assert.equal(gripAgainstPlan(pinch, [seat("P6.C1", "DRAG")]), "Placering säger A2.2 släp för plats 6; steget är A2.1 nyp.");
  assert.equal(gripAgainstPlan(pinch, [seat("P6.C1", "PINCH")]), null, "they agree");
  assert.equal(gripAgainstPlan(drag, ["P1.C1", "P2.C1", "P3.C1", "P5.C1"].map((t) => seat(t, "PINCH")).concat(seat("P4.C1", "DRAG"))), "Placering säger A2.1 nyp för plats 1, 2, 3 och 5; steget är A2.2 släp.", "Alla sju: the seats that differ");
  for (const key of ["RETUR-2.2", "ANKARE-2.2", "VILA"] as StepKey[]) assert.equal(gripAgainstPlan(stepOf(key)!, [seat("P6.C1", "PINCH")]), null, key);
  // a stored deal: what Placering said when it was made, against the draft
  const motion = { grip: "DRAG" as const, hand: "LH" as const, pass: false, turn: true, flipAxis: "LONG_EDGE" as const, target: "P6.C1", side: "FRONT" as const, fromPlan: true };
  assert.deepEqual(plannedWords({ motion: { ...motion, planned: { grip: "PINCH", flipAxis: "FREE" } } }), [
    "Placering sa A2.1 nyp för plats 6; steget är A2.2 släp.",
    "Placering sa ”Handleden vänder kortet på vägen” för plats 6; utkastet säger ”Rullas kring långsidan på vägen”.",
  ]);
  assert.deepEqual(plannedWords({ motion: { ...motion, planned: { grip: "DRAG", flipAxis: "LONG_EDGE" } } }), []);
  assert.deepEqual(plannedWords({ motion }), [], "an order from before 2026-11-17 says nothing");
  assert.deepEqual(plannedWords({ motion: null }), []);
});

test("a new order like an old one: every choice of it, never its pictures", async () => {
  const all = await drafts();
  const film = all.find((o) => o.id === "paow-giv-p4")!;
  // An order written before template 4 (no style: the long text) gives Kort: no new order is written Utförlig. The turn
  // and every other choice follow the old order.
  assert.equal(film.prompt.style, undefined);
  assert.deepEqual(recipeOf(film), { dealer: "paow", step: "GIV-2.1", target: "P4.C1", hand: "LH", side: "FRONT", style: "KORT", longText: true, model: "kling-4", duration: 7, takes: 2, extra: "", reference: null, shape: "ROUND_TRIP", cardScale: 1 });
  const rest = all.find((o) => o.id === "paow-vila-03")!;
  const r = recipeOf(rest);
  assert.deepEqual([r.step, r.target, r.hand, r.style, r.longText, r.model, r.duration, r.takes], ["VILA", null, null, "KORT", true, "wan3", 4, 1]);
  assert.match(r.extra, /warm, friendly smile/);
  // One stored with the style UTFÖRLIG (an aborted one of the first series) gives Kort too; its turn is not carried over (the recipe's).
  const aborted = all.find((o) => o.id === "paow-giv-2-1-p4-01")!;
  assert.equal(aborted.prompt.style, "UTFÖRLIG");
  assert.deepEqual([recipeOf(aborted).style, recipeOf(aborted).longText, "flipAxis" in recipeOf(aborted)], ["KORT", true, false]);
  for (const o of all) assert.notEqual(recipeOf(o).style, "UTFÖRLIG", `${o.id}: a new order like it is not written in the long text`);
  const trial = { ...film, prompt: { ...film.prompt, style: "KORT" as const }, motion: { ...film.motion!, hand: "LH" as const, pass: true, cardScale: 1.5 }, reference: { status: "FINNS" as const, clips: ["pamela-p4-c1-plan-deal-02"], path: "assets/orders/x/reference.mp4", sha256: "a".repeat(64), seconds: 4, goesTo: "P4.C1", approvedStraight: true, dealer: "pamela" } };
  assert.deepEqual([recipeOf(trial).hand, recipeOf(trial).style, recipeOf(trial).longText, recipeOf(trial).reference, recipeOf(trial).cardScale], ["PASS", "KORT", false, "pamela-p4-c1-plan-deal-02", 1.5]);
  assert.deepEqual([recipeOf({ ...trial, prompt: { ...trial.prompt, style: "MINIMAL" as const } }).style, recipeOf({ ...trial, prompt: { ...trial.prompt, style: "MINIMAL" as const } }).longText], ["MINIMAL", false]);
  assert.equal(referenceWords(trial.reference, "paow", { pamela: "Pamela" }), "pamela-p4-c1-plan-deal-02 · Pamelas film · 4 s", "another dealer's film is named");
  assert.equal(referenceWords(film.reference, "paow"), null);
  assert.equal(styleWords(film), "Utförlig · 414 ord", "the long text of tonight's deal");
  assert.equal(motionWords({ ...film, step: { ...film.step, key: "RETUR-2.1" } })!.turn, null, "nothing turns in a return");
});

test("whose a picture is, in words: the dealer's own, the other dealer's arm, and a mix-up", () => {
  assert.deepEqual(ownerWords({ dealer: "paow", name: "Paow", part: "whole" }, "paow"), { text: "Paow", tone: "ok" });
  assert.deepEqual(ownerWords({ dealer: "pamela", name: "Pamela", part: "arm" }, "paow"), { text: "Pamela · bara armen", tone: "wait" });
  assert.deepEqual(ownerWords({ dealer: "pamela", name: "Pamela", part: "whole" }, "paow"), { text: "Pamelas bild!", tone: "bad" });
  assert.equal(ownerWords(null, "paow").tone, "remark");
});

test("a stored deal: its choices in words, and the text marked by the function it was written with", async () => {
  const all = await drafts();
  const film = all.find((o) => o.id === "paow-giv-p4")!;
  assert.deepEqual(motionWords(film), { hand: "Vänster hela vägen", lands: "Stängt → öppet", turn: "Vänd vid platsen" });
  assert.equal(motionWords(all.find((o) => o.id === "paow-ankare-2-2")!), null);
  const { plan, file } = await readPlan(process.cwd());
  const { dealers } = JSON.parse(await readFile("data/dealers.json", "utf8"));
  const look = dealers.find((d: { id: string }) => d.id === "paow").look;
  for (const order of all.filter((o) => !o.approval)) {
    const parts = storedParts(order, look, planAnswerOf(plan, file), "Paow");
    assert.ok(parts, `${order.id}: the screen reproduces the stored text`);
    assert.equal(parts!.filter((x) => x.text).map((x) => x.text).join(" "), order.prompt.text);
  }
  const parts = storedParts(film, look, planAnswerOf(plan, file), "Paow")!;
  assert.deepEqual([...new Set(parts.filter((x) => x.text).map(markOf).filter(Boolean))], ["hand", "turn", "side", "bans"]);
  assert.equal(storedParts({ ...film, prompt: { ...film.prompt, text: film.prompt.text + " " } }, look, planAnswerOf(plan, file), "Paow"), null, "a text the function does not give is shown unmarked");
  assert.equal(storedParts(film, null, null, "Paow"), null);
});

test("an order stored in the long text (Utförlig) still shows its own text and the template it was stored with", async () => {
  const all = await drafts();
  const { plan, file } = await readPlan(process.cwd());
  const { dealers } = JSON.parse(await readFile("data/dealers.json", "utf8"));
  const look = dealers.find((d: { id: string }) => d.id === "paow").look;
  // An approved still keeps a frozen text from an older wording (order-prompts.test.ts); every other long one reproduces.
  // An order placed outside Beställ (tools/order-import.ts) carries the text that was sent, never promptFor's: nothing to reproduce.
  const long = all.filter((o) => (o.prompt.style ?? "UTFÖRLIG") === "UTFÖRLIG" && !(o.kind === "STILL" && o.approval) && !(o as { outside?: unknown }).outside);
  assert.ok(long.length >= 15, `${long.length} stored in the long text`);
  for (const order of long) {
    const parts = storedParts(order, look, planAnswerOf(plan, file), "Paow");
    assert.ok(parts, `${order.id}: the screen reproduces the stored text`);
    assert.equal(parts!.filter((x) => x.text).map((x) => x.text).join(" "), order.prompt.text, order.id);
    const again = orderPrompt(order, { name: "Paow", look }, null, { asStored: true });
    assert.deepEqual([again.style, again.template], ["UTFÖRLIG", order.prompt.template], `${order.id}: its own template name`);
    assert.match(order.prompt.template, /@3$/, `${order.id}: the long text is template 3's`);
    assert.equal(styleWords(order).split(" · ")[0], "Utförlig");
  }
});

test("the production list's states each have a chip with a sign and a word, and the count says how far a round is", async () => {
  const { PRODUCTION_CHIP, productionCount } = await import("../lib/orders.ts");
  const { ROW_STATES } = await import("../../tools/produce.ts");
  assert.deepEqual(Object.keys(PRODUCTION_CHIP).sort(), [...ROW_STATES].sort());
  const signs = Object.values(PRODUCTION_CHIP).map((c) => c.sign);
  assert.equal(new Set(signs).size, signs.length, "a sign of its own for every state, never colour alone");
  assert.equal(productionCount({ done: 5, total: 33, neededDone: 5, needed: 21 }), "5 av 33 klara · 5 av 21 som en runda kräver");
});
