// Beställ (/bestall/): the view's calls to the lab server (tools/order-routes.ts) and the pure words and rows it shows.
// The order's shape, the exact call per take and the cost come from ../../src/order-model.ts (built in, never copied):
// "Det här skickas" lists the arguments requestOf() gives, so the screen shows what the ordering agent will send.
// In the online copy nothing is asked for or written. Tests: studio/tests/orders.test.ts.
import { ApiError } from "./api.ts";
import { labUrl } from "./lab.ts";
import { isSnapshot } from "./mode.ts";
import {
  ANCHOR_NODE, ANCHOR_ROLE, FLIP_LABEL, MODELS, SHOWN_LABEL, credits, requestOf, waitWords,
  type FlipAxis, type Order, type OrderAnswer, type OrdersAnswer, type Picture, type Shown, type StepKey,
} from "../../src/order-model.ts";

export type { Order, OrderAnswer, OrdersAnswer, Picture, Shown, FlipAxis, StepKey };

// ── Calls ───────────────────────────────────────────────────────────────────
const kind = (status: number) => (status === 409 ? "conflict" : status === 404 ? "missing" : status === 428 ? "precondition" : status === 403 || status === 413 || status === 415 ? "refused" : status >= 500 ? "server" : "invalid");

async function call<T>(path: string, what: string, init?: RequestInit): Promise<T> {
  // The online copy neither reads nor writes orders: refused before anything leaves the page.
  if (isSnapshot) throw new ApiError("Beställ finns bara i labbet.", 403, "refused");
  let response: Response;
  try {
    response = await fetch(labUrl(path), { cache: "no-store", ...init });
  } catch {
    throw new ApiError("Labbet svarar inte. Starta det med START.cmd.", 0, "network");
  }
  if (!response.ok) {
    let said = "";
    try {
      said = String((await response.json())?.error ?? "");
    } catch {}
    if (response.status === 404 && !said) throw new ApiError("Labbet känner inte vyn Beställ än: labbservern behöver startas om.", 404, "missing");
    throw new ApiError(said || `${what} gick inte (${response.status}).`, response.status, kind(response.status));
  }
  return (await response.json()) as T;
}
const send = (method: string, body: unknown, revision?: string): RequestInit => ({
  method,
  headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(revision ? { "if-match": revision } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const getOrders = () => call<OrdersAnswer>("api/orders", "Beställningarna");
export type NewOrderInput = { dealer: string; step: StepKey; target?: string | null; flipAxis?: FlipAxis; middle?: boolean; duration?: number; takes?: number; extra?: string | null };
export const createOrder = (input: NewOrderInput) => call<OrderAnswer>("api/orders", "Utkastet", send("POST", input));
export type OrderChange = { title?: string; takes?: number; flipAxis?: FlipAxis; extra?: string | null; duration?: number };
export const changeOrder = (id: string, change: OrderChange, revision: string) => call<OrderAnswer>(`api/orders/${id}`, "Ändringen", send("PUT", change, revision));
export const approveOrder = (id: string, revision: string) => call<OrderAnswer>(`api/orders/${id}/approve`, "Godkännandet", send("POST", undefined, revision));
export const refreshOrder = (id: string, revision: string) => call<OrderAnswer>(`api/orders/${id}/refresh`, "Bilderna", send("POST", undefined, revision));

// ── Words ───────────────────────────────────────────────────────────────────
export type Tone = "neutral" | "brass" | "ok" | "variant" | "wait" | "bad" | "remark";
/** A status chip: colour AND sign, never colour alone. */
export const SHOWN_CHIP: Record<Shown, { tone: Tone; sign: string }> = {
  UTKAST: { tone: "neutral", sign: "✎" },
  VÄNTAR: { tone: "wait", sign: "○" },
  KLAR_ATT_TRYCKA: { tone: "brass", sign: "●" },
  GODKÄND: { tone: "ok", sign: "✓" },
  LAGD: { tone: "variant", sign: "↑" },
  OSÄKER: { tone: "remark", sign: "?" },
  KLAR: { tone: "variant", sign: "◆" },
  HÄMTAD: { tone: "variant", sign: "↓" },
  EFTERARBETAD: { tone: "variant", sign: "◆" },
  MÄTT: { tone: "variant", sign: "◆" },
  GRANSKAD: { tone: "ok", sign: "✓" },
  INFÖRD: { tone: "ok", sign: "★" },
  MISSLYCKAD: { tone: "bad", sign: "✕" },
  AVBRUTEN: { tone: "neutral", sign: "–" },
};
/** "Väntar på ankare 2.1", "Klar att godkänna", "Godkänd, i kön". */
export function shownWords(answer: Pick<OrderAnswer, "shown" | "waiting">): string {
  if (answer.shown === "VÄNTAR" && answer.waiting.length) return `Väntar på ${waitWords(answer.waiting)}`;
  return SHOWN_LABEL[answer.shown];
}

/** "2 tagningar × 86 = 172 krediter". */
export function costWords(order: Pick<Order, "takes" | "cost">): string {
  const n = order.takes;
  return `${n} ${n === 1 ? "tagning" : "tagningar"} × ${credits(order.cost.perTake)} = ${credits(order.cost.total)} krediter`;
}

/** The pictures in the order they matter: first, in-between, last; or the dealer's picture, then the pose. */
export function picturesInOrder(pictures: readonly Picture[]): Picture[] {
  const rank = (p: Picture) => (p.goesAs === "startFrame" ? 0 : p.goesAs === "endFrame" ? 2 : p.tag === "anchor" ? 0 : p.tag === "pose" ? 1 : 1);
  return [...pictures].sort((a, b) => rank(a) - rank(b));
}

/** What a picture is in the call, in words: "startFrame", "referenceImages · @pose". */
export function goesWords(p: Picture): string {
  if (p.goesAs === "referenceImage") return p.tag ? `referenceImages · @${p.tag}` : "referenceImages";
  return p.goesAs;
}

export type ParamRow = { name: string; value: string; note?: string; picture?: string };
/**
 * Every argument of the call by its name, as requestOf() makes it for take 1 (promptText is shown on its own), then what
 * changes from take 2 and what is deliberately not sent.
 */
export function paramRows(order: Order): ParamRow[] {
  const { tool, args } = requestOf(order, 1);
  const rows: ParamRow[] = [{ name: "verktyg", value: tool, note: "Runways MCP-verktyg" }];
  const file = (ref: unknown) => String((ref as { url?: string })?.url ?? "").replace(/^\$file:/, "");
  for (const [name, value] of Object.entries(args)) {
    if (name === "promptText") continue;
    if (name === "startFrame" || name === "endFrame") rows.push({ name, value: file(value), picture: file(value), note: "laddas upp, adressen sätts in" });
    else if (name === "referenceImages") (value as unknown[]).forEach((v, i) => rows.push({ name: `${name}[${i}]`, value: `${file(v)}${(v as { tag?: string }).tag ? ` · tag ${(v as { tag?: string }).tag}` : ""}`, picture: file(v), note: "laddas upp" }));
    else if (name === "referenceVideos") (value as { durationSeconds: number }[]).forEach((v, i) => rows.push({ name: `${name}[${i}]`, value: `${file(v)} · ${String(v.durationSeconds).replace(".", ",")} s`, note: "laddas upp" }));
    else rows.push({ name, value: typeof value === "string" ? value : JSON.stringify(value), note: name === "duration" ? "sekunder" : undefined });
  }
  if (order.takes > 1) rows.push({ name: "confirmRepeat", value: "true", note: `från tagning 2 av ${order.takes}` });
  const model = MODELS[order.generation.model];
  if (model?.audio === "always") rows.push({ name: "generateAudio", value: "skickas inte", note: "ljudet är alltid på; tas bort i efterarbetet" });
  if (model?.id === "kling-4" && !("ratio" in args)) rows.push({ name: "ratio", value: "skickas inte", note: "följer första bilden" });
  return rows;
}

/** "Naturlig vändning", or nothing for a step without a turn. */
export const turnWords = (order: Pick<Order, "motion">): string | null => (order.motion?.turn ? FLIP_LABEL[order.motion.flipAxis] : null);

/** "1,1 px från planen". */
export const offsetWords = (px: number | null | undefined): string | null => (px === null || px === undefined ? null : `${String(px).replace(".", ",")} px från planen`);

/** The orders in the sections the list shows them in. */
export type Section = { key: string; title: string; orders: OrderAnswer[] };
export function sections(orders: readonly OrderAnswer[]): Section[] {
  const of = (test: (a: OrderAnswer) => boolean) => orders.filter(test);
  const before = (a: OrderAnswer) => !a.order.approval && a.order.status !== "AVBRUTEN";
  return [
    { key: "redo", title: "Klara att godkänna", orders: of((a) => before(a) && a.shown !== "VÄNTAR") },
    { key: "vantar", title: "Väntar på bilder", orders: of((a) => before(a) && a.shown === "VÄNTAR") },
    { key: "kon", title: "I kön", orders: of((a) => a.shown === "GODKÄND") },
    { key: "lagda", title: "Lagda och levererade", orders: of((a) => !!a.order.approval && a.shown !== "GODKÄND") },
    { key: "avbrutna", title: "Avbrutna", orders: of((a) => !a.order.approval && a.order.status === "AVBRUTEN") },
  ].filter((s) => s.orders.length);
}

/** A dealer's anchor for a new order: the picture that holds, else its candidates (the order then says it is one). */
export function anchorFor<E extends { role: string; state?: string; node?: string; card?: string; served: string | null }>(entries: readonly E[], at: "1" | "2.1" | "2.2"): { holds: E | null; candidates: E[] } {
  const role = ANCHOR_ROLE[at], node = ANCHOR_NODE[at];
  const mine = entries.filter((e) => e.role === role && e.node === node && !e.card && e.served);
  return { holds: mine.find((e) => e.state === "gäller") ?? null, candidates: mine.filter((e) => e.state === "kandidat") };
}

/** The step a new order starts on: the first picture or film the dealer lacks. */
export function firstLacking(entries: Parameters<typeof anchorFor>[0]): StepKey {
  if (!anchorFor(entries, "2.1").holds) return "ANKARE-2.1";
  if (!anchorFor(entries, "2.2").holds) return "ANKARE-2.2";
  return "GIV-2.1";
}

/** The line under the queue: how the approved orders get placed. */
export const HANDOVER = "Säg 'lägg kön' till filmagenten eller huvudagenten, så läggs godkända beställningar.";
