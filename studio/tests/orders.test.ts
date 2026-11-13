// The pure part of the view Beställ (studio/lib/orders.ts) on the checkout's orders: every argument of the call shown by
// name, what is deliberately not sent, the sections of the queue, status words with sign, the anchors a new order starts
// from, a new order asked for by address, whose a picture is, a deal's choices in words, and the text's marks made by the
// same function as the stored text. Run from the repo root: node --test "studio/tests/orders.test.ts".
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { HANDOVER, SHOWN_CHIP, anchorFor, costWords, firstLacking, goesWords, markOf, motionWords, offsetWords, ownerWords, paramRows, picturesInOrder, presetOf, sections, shownWords, storedParts, type Order, type OrderAnswer } from "../lib/orders.ts";
import { SHOWN_LABEL } from "../../src/order-model.ts";
import { planAnswerOf } from "../../tools/order-store.ts";
import { readPlan } from "../../tools/order-images.ts";

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

test("the queue: sections, status words with sign, and the hand-over line", async () => {
  const all = await drafts();
  const list = all.map((o) => answer(o, o.kind === "FILM" ? { shown: "VÄNTAR", waiting: [{ dealer: "paow", label: "ankare 2.1", ready: false }] } : o.approval ? { shown: "GODKÄND" } : {}));
  assert.deepEqual(sections(list).map((s) => [s.key, s.orders.length]), [["redo", 1], ["vantar", 1], ["kon", 1]], "Jakob approved paow-ankare-2-1 on 2026-11-13");
  assert.equal(shownWords(list.find((a) => a.order.kind === "FILM")!), "Väntar på ankare 2.1");
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

test("a new order asked for by address: dealer, step and seat, or the seat's planned grip, or all seven", async () => {
  const { plan, file } = await readPlan(process.cwd());
  const p = planAnswerOf(plan, file);
  const q = (s: string) => presetOf(new URLSearchParams(s), p);
  assert.deepEqual(q("ny=1&dealer=paow&steg=GIV-2.2&plats=P4.C1"), { dealer: "paow", step: "GIV-2.2", target: "P4.C1", all: false });
  assert.deepEqual(q("ny=1&plats=P3.C1"), { dealer: null, step: p.seats["P3.C1"].grip === "DRAG" ? "GIV-2.2" : "GIV-2.1", target: "P3.C1", all: false }, "the grip Placering plans the card with");
  assert.deepEqual(q("ny=1&dealer=paow&steg=giv-2.2&plats=alla"), { dealer: "paow", step: "GIV-2.2", target: null, all: true });
  assert.equal(q("ny=1&steg=RETUR-2.1")?.step, null, "a step that is off is not chosen");
  assert.equal(q("plats=P4.C1"), null, "without ny=1 nothing opens");
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
