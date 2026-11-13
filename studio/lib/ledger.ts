// The order protocol (Protokoll, /protokoll/; node tools/order-ledger.ts): one row per take of every order, joined from
// the three places that already hold it and that nothing else joins. What was sent: data/orders/<id>.json (model, length,
// the exact text and its template, the deal's choices, the pictures, a reference film, the cost). What happened to the
// take: assets/orders/<id>/receipt.json (tools/order-put.ts; the independent reviewer's verdict is the note of the step
// GRANSKAD, "Oberoende granskare: given 2,5/5 …", or the one kept beside the take by order-put's review, the newer of the
// two). Jakob's verdict: the clip bank's records motions/<id>.json of the takes
// tools/register-order.ts brought in (each names its order and take), and for a still the state of the picture in
// data/media-roles.json whose receipt came from the take. Then a summary per method: how many takes, the reviewer's mean,
// and how many Jakob accepted, kept as a variant, rejected or has not judged; always with the count, two takes are little.
// Pure: no fs, no network; it reads whatever it is given and never fails on a missing or half-written part. The reading is
// tools/order-ledger.ts (the command and GET /api/orders/ledger), the view studio/components/ledger/. Tests:
// tools/order-ledger.test.ts.
import { FLIP_LABEL, MODELS, SHOWN_LABEL } from "../../src/order-model.ts";
import { SAID_WITHOUT_NOTE, type Verdict } from "./verdict.ts";

// ── Input ───────────────────────────────────────────────────────────────────
/** A picture of the register (data/media-roles.json) with what its receipt says it was made from. */
export type StillInput = {
  id: string;
  dealer: string;
  name: string | null;
  path: string | null;
  state: string | null;
  stateBy: string | null;
  /** The receipt's original and output hashes (assets/anchors/<id>/receipt.json). */
  shas: string[];
  /** The receipt's "by": "… beställningen paow-ankare-2-1, tagning 1, lagad kopia …". */
  by: string | null;
};
export type LedgerInput = {
  /** The order files as read (anything: a half-written one is passed over with a word in problems). */
  orders: unknown[];
  /** Receipt per order id, null where there is none. */
  receipts: Record<string, unknown>;
  /** The clip bank's records by id (motions/<id>.json); only those that name an order are used. */
  records: Record<string, unknown>;
  stills?: StillInput[];
  /** Whose each clip is (src/clip-graph.ts dealersOf), for a reference film. */
  owners?: Record<string, string>;
  /** Dealer names (data/dealers.json). */
  dealers?: Record<string, string>;
  problems?: string[];
};

// ── Output ──────────────────────────────────────────────────────────────────
export type StepGroup = "ingang" | "giv" | "retur" | "vila" | "bild" | "ovrigt";
export const STEP_GROUPS: readonly StepGroup[] = ["ingang", "giv", "retur", "vila", "bild", "ovrigt"];
export const STEP_GROUP_LABEL: Record<StepGroup, string> = { ingang: "Ingång", giv: "Giv", retur: "Retur", vila: "Vila", bild: "Bild", ovrigt: "Övrigt" };

/** How a take was asked for, as a few plain facts. key: everything but the text's length, with the step. */
export type Method = {
  key: string;
  model: string;
  modelLabel: string;
  seconds: number | null;
  resolution: string | null;
  /** The text's style (prompt.style when the order has one: Kort, Minimal, Utförlig), else its template. */
  style: string;
  template: string | null;
  words: number;
  /** The text ends in a list of what must not happen ("Nothing of this happens: …"). */
  ban: boolean;
  /** How the card turns: "Vänd vid platsen", "Stängt hela vägen"; null without a card. */
  turn: string | null;
  /** "Vänster", "Höger", "Handbyte"; null without a card. */
  hand: string | null;
  landing: "öppet" | "stängt" | null;
  reference: { has: boolean; whose: string | null };
  pictures: number;
};

/** Jakob's (or a reviewer's) word on one part of a take: the whole film, its deal, its return, a corrected copy, a picture. */
export type Part = {
  id: string;
  part: "whole" | "deal" | "return" | "fix";
  label: string;
  verdict: Verdict;
  byJakob: boolean;
  detail: string | null;
  /** Jakob's own words, without "Jakob 2026-11-13: ". */
  words: string | null;
  stamp: string | null;
};

export type Scores = { score: number | null; deal: number | null; back: number | null };

export type LedgerRow = {
  key: string;
  order: string;
  take: number;
  title: string;
  dealer: string;
  dealerName: string;
  kind: "FILM" | "STILL";
  created: string;
  step: { key: string; group: StepGroup; label: string; target: string | null; seat: string | null };
  method: Method;
  status: { code: string; label: string; placed: boolean; at: string | null };
  cost: { credits: number | null; spent: boolean };
  /** The independent reviewer: the score in the note (score is the whole, else the deal), and the note itself. */
  reviewer: (Scores & { note: string }) | null;
  /** Jakob's verdict on the take: on its main part (the whole, else the deal, else the picture). */
  owner: { verdict: Verdict; byJakob: boolean; detail: string | null; words: string | null };
  parts: Part[];
  see: {
    /** The film in the bank (assets/motions/<clip>/source.mp4), its rate and length and the deal's landing frame. */
    film: string | null;
    fps: number | null;
    frames: number | null;
    landing: number | null;
    /** The picture in Material (a still). */
    picture: string | null;
    /** A picture of the order that the lab hands out (its first or anchor picture) when there is nothing of the take. */
    stand: string | null;
    /** Where the receipt says the delivered file lies (not handed out by the lab). */
    file: string | null;
    orderFile: string;
    /** Studio addresses: "Det här skickas", Granska for the main part, Material for a picture. */
    send: string;
    review: string | null;
    material: string | null;
  };
};

export type Ledger = { schemaVersion: 1; rows: LedgerRow[]; problems: string[] };

// ── Small readers ───────────────────────────────────────────────────────────
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

/** "INGANG-2.1" → ingång, "GIV-2.2" → giv, a still → bild. */
export function stepGroupOf(key: string | null, kind: string | null): StepGroup {
  const k = (key ?? "").toUpperCase();
  if (kind === "STILL" || k.startsWith("ANKARE")) return "bild";
  if (k.startsWith("INGANG")) return "ingang";
  if (k.startsWith("GIV")) return "giv";
  if (k.startsWith("RETUR")) return "retur";
  if (k.startsWith("VILA")) return "vila";
  return "ovrigt";
}

/** "P4.C1" → "plats 4", "P4.C2" → "plats 4, kort 2", "D.C1" → "dealern". */
export function seatOf(target: string | null): string | null {
  const m = /^P(\d)\.C(\d)$/.exec(target ?? "");
  if (m) return `plats ${m[1]}${m[2] === "1" ? "" : `, kort ${m[2]}`}`;
  return /^D\./.test(target ?? "") ? "dealern" : null;
}

const STYLES: Record<string, string> = { kort: "Kort", minimal: "Minimal", utforlig: "Utförlig", "utförlig": "Utförlig" };
/** The text's style: prompt.style when there is one, else a style word in the template, else the template; unknown stays as written. */
export function styleOf(prompt: Obj): string {
  const own = str(prompt.style);
  if (own) return STYLES[own.toLowerCase()] ?? own;
  const template = str(prompt.template);
  const word = /(kort|minimal|utf[oö]rlig)/i.exec(template ?? "")?.[1]?.toLowerCase();
  if (word) return STYLES[word] ?? word;
  return template ?? "okänd mall";
}

/** Words in a text. */
export const wordsIn = (text: string | null) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);

/** A list of what must not happen: the field when the order says, else the closing list of the text. */
export function hasBanList(prompt: Obj): boolean {
  for (const key of ["ban", "banList", "negative"]) if (typeof prompt[key] === "boolean") return prompt[key] as boolean;
  return /\b(?:nothing of this happens|none of this happens|avoid|negative prompt|do not show)\b/i.test(str(prompt.text) ?? "");
}

const HAND_WORD: Record<string, string> = { LH: "Vänster", RH: "Höger", PASS: "Handbyte" };

/** The method of an order: model, length, the text and the deal's choices. */
export function methodOf(order: Obj, owners: Record<string, string> = {}): Method {
  const generation = obj(order.generation), params = obj(generation.params), prompt = obj(order.prompt), motion = isObj(order.motion) ? order.motion : null;
  const step = obj(order.step), reference = obj(order.reference);
  const model = str(generation.model) ?? "okänd";
  const modelLabel = MODELS[model]?.label ?? model;
  const seconds = num(params.duration);
  const resolution = str(params.resolution) ?? str(params.imageSize);
  const text = [str(prompt.text), str(prompt.extra) && !(str(prompt.text) ?? "").includes(str(prompt.extra)!) ? str(prompt.extra) : null].filter(Boolean).join(" ");
  const side = motion ? (str(motion.side) ?? (motion.turn ? "FRONT" : "BACK")) : null;
  const flip = motion ? str(motion.flipAxis) : null;
  const turn = !motion ? null : side === "BACK" ? "Stängt hela vägen" : flip ? (FLIP_LABEL as Record<string, string>)[flip] ?? flip : "Vänds";
  const hand = !motion ? null : motion.pass === true ? HAND_WORD.PASS : (HAND_WORD[str(motion.hand) ?? ""] ?? str(motion.hand));
  const landing = !motion ? null : side === "BACK" ? "stängt" : "öppet";
  const has = reference.status === "FINNS";
  const clip = has ? str(list(reference.clips)[0]) : null;
  const whose = clip ? (owners[clip] ?? /^([a-z0-9]+)-/.exec(clip)?.[1] ?? null) : null;
  const pictures = list(order.pictures).filter((p) => isObj(p) && (str(p.path) || p.waits)).length;
  const style = styleOf(prompt);
  const ban = hasBanList(prompt);
  const group = stepGroupOf(str(step.key), str(order.kind));
  const key = [group, model, seconds ?? "", resolution ?? "", style, ban ? "ban" : "", turn ?? "", hand ?? "", landing ?? "", has ? `ref:${whose ?? "?"}` : "", pictures].join("|");
  return { key, model, modelLabel, seconds, resolution, style, template: str(prompt.template), words: wordsIn(text), ban, turn, hand, landing, reference: { has, whose }, pictures };
}

/** The method as short chips: "Kling 4", "7 s", "film-giv@3 · 414 ord", "förbudslista", "Vänd vid platsen", "Vänster", "öppet", "ingen referens", "2 bilder". */
export function methodChips(m: Method, options: { words?: boolean } = {}): string[] {
  const out = [m.modelLabel];
  if (m.seconds !== null) out.push(`${String(m.seconds).replace(".", ",")} s`);
  out.push(options.words === false ? m.style : `${m.style} · ${m.words} ord`);
  if (m.ban) out.push("förbudslista");
  if (m.turn) out.push(m.turn);
  if (m.hand) out.push(m.hand);
  if (m.landing && m.turn !== "Stängt hela vägen") out.push(`landar ${m.landing}`);
  out.push(m.reference.has ? `referens${m.reference.whose ? `: ${m.reference.whose}` : ""}` : "ingen referens");
  out.push(`${m.pictures} ${m.pictures === 1 ? "bild" : "bilder"}`);
  return out;
}

// ── The reviewer ────────────────────────────────────────────────────────────
/**
 * The scores in a reviewer's note: "3/5" is the whole; "given 2/5, returen 1/5" gives the deal and the return. score is the
 * whole, else the deal, else the return. Decimal comma or point.
 */
export function scoresOf(note: string | null | undefined): Scores {
  const out: Scores = { score: null, deal: null, back: null };
  const re = /(?:\b(given|giv|deal|dealen|returen|retur|return|tillbaka)\b[^0-9/]{0,12})?(\d+(?:[.,]\d+)?)\s*\/\s*5\b/gi;
  let whole: number | null = null;
  for (const m of String(note ?? "").matchAll(re)) {
    const value = Number(m[2].replace(",", "."));
    if (!(value >= 0 && value <= 5)) continue;
    const word = (m[1] ?? "").toLowerCase();
    if (/^(given|giv|deal|dealen)$/.test(word)) out.deal ??= value;
    else if (/^(returen|retur|return|tillbaka)$/.test(word)) out.back ??= value;
    else whole ??= value;
  }
  out.score = whole ?? out.deal ?? out.back;
  return out;
}

/**
 * The reviewer's note of a take: the verdict kept beside it (review, tools/order-put.ts review) or the last GRANSKAD step,
 * whichever is newer; else a note that is the independent reviewer's.
 */
export function reviewerNote(history: unknown, review?: unknown): string | null {
  const steps = list(history).filter(isObj);
  const graded = steps.filter((h) => h.status === "GRANSKAD" && str(h.note)).pop();
  const beside = isObj(review) && str(review.note) ? review : null;
  if (beside && (!graded || String(beside.at ?? "") >= String(graded.at ?? ""))) return str(beside.note);
  const note = str(graded?.note) ?? str(steps.filter((h) => /oberoende granskare/i.test(String(h.note ?? ""))).pop()?.note);
  return note;
}

// ── Jakob ───────────────────────────────────────────────────────────────────
const SAID = /^\S+ \d{4}-\d{2}-\d{2}: /;
/** Jakob's own words in a record ("Jakob 2026-11-13: Denna är bra" → "Denna är bra"), and the name and day. */
export function jakobWords(review: Obj): { words: string | null; stamp: string | null } {
  const text = str(review.userReview);
  if (!text) return { words: null, stamp: null };
  // The store's words for a decision made without a note (lib/verdict.ts) are not his.
  const words = text.replace(SAID, "").trim();
  return { words: words && !SAID_WITHOUT_NOTE.includes(words) ? words : null, stamp: /^(\S+ \d{4}-\d{2}-\d{2}):/.exec(text)?.[1] ?? null };
}

/** The verdict a bank record's review stands for, as the views show it (lib/verdict.ts verdictOf, from the record alone). */
export function recordVerdict(review: Obj): { verdict: Verdict; byJakob: boolean; detail: string | null } {
  const said = !!str(review.userReview), accepted = review.userAccepted === true;
  const decision = str(review.decision) ?? "PENDING";
  if (decision === "REJECTED") return { verdict: "underkand", byJakob: said, detail: null };
  if (decision === "SECONDARY") return { verdict: "underkand", byJakob: said, detail: "sekundär" };
  if (decision === "ACCEPTED") {
    const as = str(review.acceptedAs);
    return { verdict: as === "MAIN" ? "primar" : as === "VARIANT" ? "variant" : "godkand", byJakob: accepted || said, detail: null };
  }
  return { verdict: "vantar", byJakob: false, detail: null };
}

/** A picture's state in Material as a verdict: gäller is accepted, ersatt is set aside, kandidat waits. */
export function stillVerdict(still: Pick<StillInput, "state" | "stateBy">): { verdict: Verdict; byJakob: boolean; detail: string | null } {
  const byJakob = /^jakob\b/i.test(still.stateBy ?? "");
  if (still.state === "gäller") return { verdict: "godkand", byJakob, detail: null };
  if (still.state === "ersatt") return { verdict: "underkand", byJakob, detail: "ersatt" };
  return { verdict: "vantar", byJakob: false, detail: null };
}

const PART_LABEL: Record<Part["part"], string> = { whole: "Filmen", deal: "Given", return: "Returen", fix: "Rättad kopia" };
const PART_RANK: Record<Part["part"], number> = { whole: 0, deal: 1, return: 2, fix: 3 };

// ── The rows ────────────────────────────────────────────────────────────────
const href = (path: string, dealer: string) => `${path}${path.includes("?") ? "&" : "?"}dealer=${encodeURIComponent(dealer)}`;

/** One row per take of every order that can be read; the newest order first. */
export function ledgerOf(input: LedgerInput): Ledger {
  const problems = [...(input.problems ?? [])];
  const owners = input.owners ?? {}, names = input.dealers ?? {};
  // The bank's records by the order and take they came from.
  const byTake = new Map<string, { id: string; record: Obj }[]>();
  for (const [id, record] of Object.entries(input.records ?? {})) {
    if (!isObj(record)) continue;
    const ref = obj(record.order), order = str(ref.id), take = num(ref.take);
    if (!order || take === null) continue;
    const key = `${order}#${take}`;
    byTake.set(key, [...(byTake.get(key) ?? []), { id, record }]);
  }
  const rows: LedgerRow[] = [];
  for (const raw of input.orders ?? []) {
    if (!isObj(raw) || !str(raw.id)) { problems.push("En beställning utan id hoppades över."); continue; }
    const order = raw, id = str(order.id)!, dealer = str(order.dealer) ?? "okänd", kind = order.kind === "STILL" ? "STILL" : "FILM";
    const step = obj(order.step), motion = obj(order.motion), target = str(motion.target);
    const group = stepGroupOf(str(step.key), kind);
    const method = methodOf(order, owners);
    const receipt = isObj(input.receipts?.[id]) ? (input.receipts[id] as Obj) : null;
    const takes = Math.max(1, Math.min(8, Math.floor(num(order.takes) ?? 1)));
    const approved = isObj(order.approval) && order.status === "GODKÄND";
    const perTake = num(obj(order.cost).perTake);
    const pictures = list(order.pictures).filter(isObj);
    const standPicture = (kind === "FILM" ? [pictures.find((p) => p.goesAs === "startFrame"), pictures.find((p) => p.goesAs === "endFrame")] : [pictures.find((p) => p.tag === "anchor"), pictures[0]]).find((p) => p && str(p.path));
    for (let take = 1; take <= takes; take++) {
      const entry = list(receipt?.takes).filter(isObj).find((t) => num(t.take) === take) ?? null;
      const code = order.status === "AVBRUTEN" ? "AVBRUTEN" : entry ? (str(entry.status) ?? "OSÄKER") : approved ? "INTE_LAGD" : "UTKAST";
      const placed = !!entry && !!(str(entry.requestedAt) || str(entry.taskId));
      const label = code === "INTE_LAGD" ? "Godkänd, inte lagd" : code === "UTKAST" ? "Utkast, inte lagd" : ((SHOWN_LABEL as Record<string, string>)[code] ?? code);
      const history = list(entry?.history).filter(isObj);
      const at = str(history[history.length - 1]?.at) ?? str(entry?.requestedAt) ?? null;
      const note = reviewerNote(entry?.history, entry?.review);
      const reviewer = note ? { ...scoresOf(note), note } : null;
      // Jakob's word: the bank's records for a film, the register's picture for a still.
      const parts: Part[] = [];
      let film: string | null = null, fps: number | null = null, frames: number | null = null, landing: number | null = null, picture: string | null = null, material: string | null = null;
      for (const { id: recordId, record } of byTake.get(`${id}#${take}`) ?? []) {
        const source = obj(record.source), ref = obj(record.order), fix = num(ref.fix);
        if (!film && !fix && str(source.path)) { film = str(source.path); fps = num(source.fps); frames = num(source.frames); }
        if (!isObj(record.review)) continue;
        const m = obj(record.motion), part: Part["part"] = fix ? "fix" : m.kind === "DEAL" ? "deal" : m.kind === "RETURN" ? "return" : "whole";
        if (part === "deal") landing = num(list(obj(m.segment).frames)[1]) ?? landing;
        const v = recordVerdict(record.review), w = jakobWords(record.review);
        parts.push({ id: recordId, part, label: fix ? `${PART_LABEL.fix} ${fix}` : PART_LABEL[part], ...v, ...w });
      }
      if (kind === "STILL") {
        const sha = str(entry?.sha256);
        for (const still of input.stills ?? []) {
          const by = still.by ?? "";
          const named = new RegExp(`beställningen ${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, tagning ${take}\\b`).test(by);
          const same = !!sha && still.shas.includes(sha);
          if (!same && !named) continue;
          const v = stillVerdict(still), part: Part["part"] = same ? "whole" : "fix";
          // Material keeps no words of his for a picture, only who set its state and when (stateBy, the stamp).
          parts.push({ id: still.id, part, label: same ? (still.name ?? "Bilden") : `${PART_LABEL.fix}: ${still.name ?? still.id}`, ...v, words: null, stamp: /^(\S+ \d{4}-\d{2}-\d{2})/.exec(still.stateBy ?? "")?.[1] ?? null });
          if (same && still.path) { picture = still.path; material = href(`/material/?bild=${encodeURIComponent(still.id)}`, dealer); }
        }
        if (!picture) {
          const fixed = parts.find((p) => p.part === "fix");
          const still = fixed ? input.stills?.find((s) => s.id === fixed.id) : null;
          if (still?.path) { picture = still.path; material = href(`/material/?bild=${encodeURIComponent(still.id)}`, dealer); }
        }
      }
      parts.sort((a, b) => PART_RANK[a.part] - PART_RANK[b.part]);
      const main = parts.find((p) => p.part === "whole") ?? parts.find((p) => p.part === "deal") ?? parts[0] ?? null;
      const owner = main ? { verdict: main.verdict, byJakob: main.byJakob, detail: main.detail, words: main.words } : { verdict: "vantar" as Verdict, byJakob: false, detail: null, words: null };
      const reviewTake = kind === "FILM" && main && main.part !== "fix" ? main.id : kind === "FILM" ? (parts[0]?.id ?? null) : null;
      rows.push({
        key: `${id}#${take}`,
        order: id,
        take,
        title: str(order.title) ?? id,
        dealer,
        dealerName: names[dealer] ?? dealer.charAt(0).toUpperCase() + dealer.slice(1),
        kind,
        created: str(order.created) ?? "",
        step: { key: str(step.key) ?? "", group, label: str(step.label) ?? str(step.key) ?? "", target, seat: seatOf(target) },
        method,
        status: { code, label, placed, at },
        cost: { credits: perTake, spent: placed && code !== "MISSLYCKAD" },
        reviewer,
        owner,
        parts,
        see: {
          film,
          fps,
          frames,
          landing,
          picture,
          stand: standPicture ? str(standPicture.path) : null,
          file: str(entry?.file),
          orderFile: `data/orders/${id}.json`,
          send: href(`/bestall/?order=${encodeURIComponent(id)}`, dealer),
          review: reviewTake ? href(`/granska/?tagning=${encodeURIComponent(reviewTake)}`, dealer) : null,
          material,
        },
      });
    }
  }
  rows.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : a.order.localeCompare(b.order) || a.take - b.take));
  return { schemaVersion: 1, rows, problems };
}

// ── The summary ─────────────────────────────────────────────────────────────
/** What the summary groups by: every fact of the method (with the step), or one of them. */
export type GroupBy = "metod" | "modell" | "text" | "vandning" | "referens" | "langd";
export const GROUP_BY: readonly GroupBy[] = ["metod", "modell", "text", "vandning", "referens", "langd"];
export const GROUP_BY_LABEL: Record<GroupBy, string> = { metod: "Metod", modell: "Modell", text: "Text", vandning: "Vändning", referens: "Referens", langd: "Längd" };

export type SummaryRow = {
  key: string;
  /** The method's chips (by "metod"), or the one fact grouped by. */
  facts: string[];
  step: StepGroup | null;
  /** Takes of these orders, placed or not. */
  takes: number;
  placed: number;
  notPlaced: number;
  /** Takes with a reviewer's score, and the mean of their score; backMean: of the returns where a note gives one. */
  scored: number;
  mean: number | null;
  backMean: number | null;
  words: number | null;
  /** Jakob's own verdicts on the placed takes (accepted counts Primär too); open: placed takes he has not judged. */
  accepted: number;
  variant: number;
  rejected: number;
  open: number;
  credits: number;
  orders: string[];
};

function groupKey(row: LedgerRow, by: GroupBy): { key: string; facts: string[]; step: StepGroup | null } {
  const m = row.method;
  switch (by) {
    case "metod": return { key: m.key, facts: methodChips(m, { words: false }), step: row.step.group };
    case "modell": return { key: m.model, facts: [m.modelLabel], step: null };
    case "text": return { key: `${m.style}|${m.ban}`, facts: [m.style, ...(m.ban ? ["förbudslista"] : [])], step: null };
    case "vandning": return { key: m.turn ?? "-", facts: [m.turn ?? "Inget kort"], step: null };
    case "referens": return { key: m.reference.has ? `ja|${m.reference.whose ?? ""}` : "nej", facts: [m.reference.has ? `Referens${m.reference.whose ? `: ${m.reference.whose}` : ""}` : "Ingen referens"], step: null };
    case "langd": return { key: String(m.seconds ?? "-"), facts: [m.seconds === null ? "Bild" : `${String(m.seconds).replace(".", ",")} s`], step: null };
  }
}

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null);

/** The rows by method: counts, the reviewer's mean, Jakob's verdicts. Best first: the higher mean, then more accepted, then more takes. */
export function summarize(rows: readonly LedgerRow[], by: GroupBy = "metod"): SummaryRow[] {
  const groups = new Map<string, { head: ReturnType<typeof groupKey>; rows: LedgerRow[] }>();
  for (const row of rows) {
    const head = groupKey(row, by);
    const g = groups.get(head.key) ?? { head, rows: [] };
    g.rows.push(row);
    groups.set(head.key, g);
  }
  const out: SummaryRow[] = [];
  for (const { head, rows: own } of groups.values()) {
    const placed = own.filter((r) => r.status.placed);
    const scores = own.map((r) => r.reviewer?.score).filter((s): s is number => typeof s === "number");
    const backs = own.map((r) => r.reviewer?.back).filter((s): s is number => typeof s === "number");
    const jakob = (v: Verdict[]) => placed.filter((r) => r.owner.byJakob && v.includes(r.owner.verdict)).length;
    const accepted = jakob(["godkand", "primar"]), variant = jakob(["variant"]), rejected = jakob(["underkand"]);
    out.push({
      key: head.key,
      facts: head.facts,
      step: head.step,
      takes: own.length,
      placed: placed.length,
      notPlaced: own.length - placed.length,
      scored: scores.length,
      mean: mean(scores),
      backMean: mean(backs),
      words: own.length ? Math.round(own.reduce((s, r) => s + r.method.words, 0) / own.length) : null,
      accepted,
      variant,
      rejected,
      open: placed.length - accepted - variant - rejected,
      credits: placed.reduce((s, r) => s + (r.cost.spent ? (r.cost.credits ?? 0) : 0), 0),
      orders: [...new Set(own.map((r) => r.order))],
    });
  }
  return out.sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1) || b.accepted + b.variant - (a.accepted + a.variant) || b.placed - a.placed || a.key.localeCompare(b.key));
}

// ── Filters and words ───────────────────────────────────────────────────────
export type LedgerFilter = { group?: StepGroup | null; dealer?: string | null; placedOnly?: boolean };
export function filterRows(rows: readonly LedgerRow[], filter: LedgerFilter): LedgerRow[] {
  return rows.filter((r) => (!filter.group || r.step.group === filter.group) && (!filter.dealer || r.dealer === filter.dealer) && (!filter.placedOnly || r.status.placed));
}

/** The facts every one of these lists shares, in the order of the first: said once above them instead of on every line. */
export function sharedFacts(lists: readonly (readonly string[])[]): string[] {
  if (lists.length < 2) return [];
  return lists[0].filter((f) => lists.every((l) => l.includes(f)));
}

/** "2,5" or "–". */
export const scoreWords = (n: number | null) => (n === null ? "–" : String(n).replace(".", ","));

/** Jakob's verdict in words for the command: "godkänd", "underkänd (granskare)", "väntar". */
const VERDICT_WORD: Record<Verdict, string> = { primar: "primär", godkand: "godkänd", variant: "variant", vantar: "väntar", underkand: "underkänd" };
export function verdictWords(v: { verdict: Verdict; byJakob: boolean }): string {
  if (v.verdict === "vantar") return "ej dömd";
  return v.byJakob ? VERDICT_WORD[v.verdict] : `${VERDICT_WORD[v.verdict]} (granskare)`;
}
