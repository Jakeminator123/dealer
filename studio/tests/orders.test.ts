// The pure part of the view Beställ (studio/lib/orders.ts) on the checkout's drafts: every argument of the call shown by
// name, what is deliberately not sent, the sections of the queue, status words with sign, and the anchors a new order
// starts from. Run from the repo root: node --test "studio/tests/orders.test.ts".
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { HANDOVER, SHOWN_CHIP, anchorFor, costWords, firstLacking, goesWords, offsetWords, paramRows, picturesInOrder, sections, shownWords, type Order, type OrderAnswer } from "../lib/orders.ts";
import { SHOWN_LABEL } from "../../src/order-model.ts";

async function drafts(): Promise<Order[]> {
  const names = (await readdir("data/orders")).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(`data/orders/${n}`, "utf8")) as Order));
}
const answer = (order: Order, extra: Partial<OrderAnswer> = {}): OrderAnswer => ({ order, revision: '"r"', hash: "h", shown: "KLAR_ATT_TRYCKA", problems: [], warnings: [], waiting: [], receipt: null, check: null, ...extra });

test("Det här skickas: every argument by its name, as the ordering agent will send it", async () => {
  const all = await drafts();
  const film = all.find((o) => o.id === "paow-vandning-p4-mellanbild")!;
  const rows = paramRows(film);
  assert.deepEqual(rows.map((r) => [r.name, r.value]), [
    ["verktyg", "generate_video"],
    ["model", "kling-4"],
    ["resolution", "1080p"],
    ["duration", "4"],
    ["startFrame", "first.png"],
    ["endFrame", "last.png"],
    ["referenceImages[0]", "middle.png"],
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
    ["referenceImages[1]", "pose.png · tag pose"],
    ["count", "1"],
    ["confirmRepeat", "true"],
  ]);
  assert.deepEqual(picturesInOrder(film.pictures).map((p) => p.name), ["first.png", "middle.png", "last.png"]);
  assert.deepEqual(picturesInOrder(still.pictures).map(goesWords), ["referenceImages · @anchor", "referenceImages · @pose"]);
  assert.equal(costWords(film), "2 tagningar × 86 = 172 krediter");
  assert.equal(offsetWords(1.1), "1,1 px från planen");
});

test("the queue: sections, status words with sign, and the hand-over line", async () => {
  const all = await drafts();
  const list = all.map((o) => answer(o, o.kind === "FILM" || o.id === "paow-mellanbild-p4" ? { shown: "VÄNTAR", waiting: [{ dealer: "paow", label: "ankare 2.1", ready: false }] } : {}));
  assert.deepEqual(sections(list).map((s) => [s.key, s.orders.length]), [["redo", 2], ["vantar", 3]]);
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
