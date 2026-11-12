// Jakob's names for what the clip bank holds: anchors (nodes), films between them (edges), single takes, and his way of
// writing a round ("A2.1 - P4C1 - A2.1 - P4C2 - A2.1"). Pure: no DOM, no network; tests in studio/tests/names.test.ts.
import { REVEAL_NODE, parseEdge, parseNode, parseSequence, type EdgeKind, type Step, type Take } from "../../src/clip-graph.ts";

// ── Anchors ─────────────────────────────────────────────────────────────────
// His words, 2026-11-12: ankare 1 = rest, ankare 2.1 = the pinch at the shoe window, ankare 2.2 = the card handed over at
// the shoe's mouth. code is the short form used inside an edge ("A2.1 → P4C1"); name is the form used on its own.
const ANCHORS: Record<string, { code: string; name: string }> = {
  IDLE: { code: "A1", name: "A1 vila" },
  READY: { code: "A2.1", name: "A2.1 nyp" },
  "READY-B": { code: "A2.2", name: "A2.2 hand över" },
  AWAY: { code: "Borta", name: "Borta" },
  [REVEAL_NODE]: { code: "DC2 upp", name: "DC2 upp" },
};

/** The short code of a node: IDLE → "A1", READY → "A2.1", READY-B → "A2.2", P4.C1 → "P4C1", D.C1 → "DC1", REVEAL(D.C2) → "DC2 upp". */
export function nodeCode(node: string): string {
  const known = ANCHORS[node];
  if (known) return known.code;
  const card = /^(P[1-7]|D)\.C([1-3])$/.exec(node);
  return card ? `${card[1]}C${card[2]}` : node; // an experiment's own pose ("DRAWN") as the graph wrote it
}

/** A node on its own: IDLE → "A1 vila", READY → "A2.1 nyp", READY-B → "A2.2 hand över"; cards as their code. */
export const nodeName = (node: string): string => ANCHORS[node]?.name ?? nodeCode(node);

/** An edge (or its id "READY>P4.C1") in his words: "A2.1 → P4C1". */
export function edgeName(edge: { from: string; to: string } | string): string {
  const [from, to] = typeof edge === "string" ? splitEdge(edge) : [edge.from, edge.to];
  return `${nodeCode(from)} → ${nodeCode(to)}`;
}

const splitEdge = (id: string): [string, string] => {
  const cut = id.indexOf(">");
  return cut < 0 ? [id, ""] : [id.slice(0, cut), id.slice(cut + 1)];
};

// ── Takes ───────────────────────────────────────────────────────────────────
// A take's short name is read from its id within its edge: "pamela-p4-c1-plan-deal-02" on READY>P4.C1 is "Giv 02".
// Rule: drop "pamela", the card the edge is about (p4-c1) and the words that only repeat the edge (plan, deal, return,
// the hub it returns to, entry, exit, reveal, table, arrive, leave, idle on the idle edge); say what the edge does in one
// word first (Giv, Retur, Ingång, Utgång, Vänd, Kommer, Går; nothing on the idle edge); translate the remaining words
// that have a Swedish name (calm → lugn, readyb → B, edit → rättad, arkiv stays) and keep the rest, numbers as written.
// The words dropped are the same for every take of one edge, so names stay apart. Should two takes of one edge still read
// the same, both are shown by their id without "pamela-" (takeNames).
export type TakeLike = Pick<Take, "id" | "edge" | "kind">;

const WORDS: [RegExp, string][] = [
  [/\bdeep breath\b/g, "djupt andetag"],
  [/\bhand resettle\b/g, "handen läggs om"],
  [/\bfrom trial\b/g, "ur prov"],
  [/\bshoe plate\b/g, "skoplåt"],
  [/\bhead ?down\b/g, "huvudet ner"],
  [/\breadyb\b/g, "B"],
  [/\bidleb\b/g, "B"],
  [/\bcalm\b/g, "lugn"],
  [/\bedit\b/g, "rättad"],
  [/\bslow\b/g, "slow motion"],
  [/\bwide\b/g, "vid"],
  [/\bdrawn\b/g, "dragen"],
  [/\bdraw\b/g, "drag"],
  [/\bhandover\b/g, "hand över"],
  [/\bpushback\b/g, "tillbaka"],
  [/\bprobe\b/g, "prov"],
  [/\bbreath\b/g, "andning"],
  [/\bloop\b/g, "lugn vila"],
  [/\bglance\b/g, "blick"],
  [/\bsmile\b/g, "leende"],
  [/\bstretch\b/g, "sträcker sig"],
  [/\bscratch\b/g, "kliar sig"],
  [/\bcoffee\b/g, "kaffe"],
  [/\blookup\b/g, "tittar upp"],
  [/\bwink\b/g, "blinkar"],
  [/\bcough\b/g, "hostar"],
  [/\bdisappointed\b/g, "besviken"],
  [/\bnod\b/g, "nickar"],
  [/\bshrug\b/g, "rycker på axlarna"],
  [/\bstern\b/g, "sträng"],
  [/\bb\b/g, "B"],
];

const KIND_WORD: Partial<Record<EdgeKind, string>> = { DEAL: "Giv", RETURN: "Retur", ENTRY: "Ingång", REVEAL: "Vänd", ARRIVE: "Kommer", LEAVE: "Går" };

function edgeWords(take: TakeLike): { card: string[]; drop: string[]; lead: string } {
  const [, to] = splitEdge(take.edge);
  const card = /(P[1-7]|D)\.C([1-3])/.exec(take.edge);
  const slug = card ? [card[1].toLowerCase(), `c${card[2]}`] : [];
  const kind = take.kind;
  if (kind === "DEAL") return { card: slug, drop: ["plan", "deal"], lead: KIND_WORD.DEAL! };
  if (kind === "RETURN" && card) return { card: slug, drop: ["plan", "return", to.startsWith("READY") ? "ready" : "idle"], lead: KIND_WORD.RETURN! };
  if (kind === "RETURN") return { card: slug, drop: ["ready", "idle", "exit"], lead: "Utgång" };
  if (kind === "ENTRY") return { card: slug, drop: ["idle", "ready", "entry"], lead: KIND_WORD.ENTRY! };
  if (kind === "IDLE") return { card: slug, drop: ["idle"], lead: "" };
  if (kind === "REVEAL") return { card: slug, drop: ["reveal"], lead: KIND_WORD.REVEAL! };
  if (kind === "ARRIVE") return { card: slug, drop: ["table", "arrive"], lead: KIND_WORD.ARRIVE! };
  if (kind === "LEAVE") return { card: slug, drop: ["table", "leave"], lead: KIND_WORD.LEAVE! };
  return { card: slug, drop: ["plan"], lead: "" }; // an experiment whose kind is outside the model
}

/** One take's short name within its edge, without checking the other takes: "Giv 02", "Retur B 01", "Djupt andetag 01". */
export function takeName(take: TakeLike, siblings?: readonly TakeLike[]): string {
  if (siblings) return takeNames(siblings.some((s) => s.id === take.id) ? siblings : [...siblings, take]).get(take.id)!;
  const { card, drop, lead } = edgeWords(take);
  let words = take.id.split("-").filter(Boolean);
  if (words[0] === "pamela") words = words.slice(1);
  if (card.length) {
    const at = words.findIndex((w, i) => w === card[0] && words[i + 1] === card[1]);
    if (at >= 0) words.splice(at, 2);
  }
  for (const word of drop) {
    const at = words.indexOf(word);
    if (at >= 0) words.splice(at, 1);
  }
  let rest = words.join(" ");
  for (const [word, swedish] of WORDS) rest = rest.replace(word, swedish);
  const text = [lead, rest].filter(Boolean).join(" ").trim() || take.id.replace(/^pamela-/, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Short names for the takes of one edge (or any list), kept apart: takes whose names would be equal get their id instead. */
export function takeNames(takes: readonly TakeLike[]): Map<string, string> {
  const named = takes.map((t) => [t.id, takeName(t)] as const);
  const count = new Map<string, number>();
  for (const [, name] of named) count.set(name, (count.get(name) ?? 0) + 1);
  return new Map(named.map(([id, name]) => [id, (count.get(name) ?? 0) > 1 ? id.replace(/^pamela-/, "") : name]));
}

// ── Facts ───────────────────────────────────────────────────────────────────
/** Seconds in Swedish: 4 → "4,0 s". */
export const formatSeconds = (seconds: number): string => `${seconds.toFixed(1).replace(".", ",")} s`;

/** A day in Swedish, short: "10 nov". */
export function formatDay(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("sv-SE", { day: "numeric", month: "short" }).replace(/\.$/, "");
}

/** A model as people say it: "wan3" → "Wan 3", "utsnitt" → "Utsnitt". */
export const modelName = (model: string): string =>
  model.replace(/^([a-z]+)(\d+(?:\.\d+)?)$/, "$1 $2").replace(/^./, (c) => c.toUpperCase());

export type TakeFacts = { model: string; frames: number | null; seconds: number | null; day: string | null; derived: boolean };
/** What a take's facts line says. A derived take (a range of a longer film) counts its own frames. */
export function takeFacts(take: Pick<Take, "job" | "frames" | "fps" | "segment" | "receipt">): TakeFacts {
  const frames = take.segment ? take.segment.end - take.segment.start + 1 : take.frames;
  const fps = take.fps ?? 30;
  return {
    model: modelName(take.job.model || "okänd"),
    frames,
    seconds: frames !== null ? frames / fps : null,
    day: formatDay(take.receipt?.completedAt ?? take.receipt?.requestedAt ?? null),
    derived: !!take.segment,
  };
}

/** The facts as one line: "Wan 3 · 4,0 s · 120 rutor · 10 nov". */
export function factsLine(facts: TakeFacts): string {
  return [facts.model, facts.seconds !== null ? formatSeconds(facts.seconds) : null, facts.frames !== null ? `${facts.frames} rutor` : null, facts.day]
    .filter(Boolean)
    .join(" · ");
}

// ── His notation for a round ────────────────────────────────────────────────
// "A2.1 - P4C1 - A2.1 - P4C2 - A2.1": anchors and cards in the order the hand passes them. Between two of them stands
// -, –, →, > or just a space; "|", "," or a new line starts a new chain. Accepted names: A1 (vila), A2.1 (nyp),
// A2.2 (hand över), P1C1…P7C2, DC1…DC3 (with or without the dot), "DC2 upp", Borta, and the lab's own words (IDLE, READY,
// READY-B, VILA, REDO, P4.C1). The lab's own notation with pinned takes ("READY>P4.C1@<take> | …") is passed to
// parseSequence. Nothing is guessed: what cannot be read, or two neighbours with no film between them, is reported.
export type JakobRound = { steps: Step[]; errors: string[] };

const TOKENS: [RegExp, string | null][] = [
  [/A1(?:\s*vila)?(?![\p{L}\d.])/iuy, "IDLE"],
  [/A2\.1(?:\s*nyp)?(?![\p{L}\d.])/iuy, "READY"],
  [/A2\.2(?:\s*hand\s*över)?(?![\p{L}\d.])/iuy, "READY-B"],
  [/D\.?C2\s+upp(?![\p{L}\d.])/iuy, REVEAL_NODE],
  [/REVEAL\(\s*D\.?C2\s*\)/iuy, REVEAL_NODE],
  [/READY-[A-Z](?![\p{L}\d.])/iuy, null], // a hub variant, written out: READY-B
];
const GAP = /(?:[^\S\n]|[-–—→>])+/y;
const BREAK = /[^\S\n]*[|,;\n]\s*/y;
const WORD = /[^\s\-–—→>|,;]+/y;

export function parseJakob(text: string): JakobRound {
  const source = String(text ?? "");
  if (source.includes("@")) {
    const { steps, errors } = parseSequence(source);
    return { steps, errors: errors.map((part) => `Kunde inte läsa ”${part}”.`) };
  }
  // Each chain is a list of nodes; an unreadable word is null and breaks the chain there.
  const chains: (string | null)[][] = [[]];
  const errors: string[] = [];
  let at = 0;
  const here = (re: RegExp) => {
    re.lastIndex = at;
    return re.exec(source);
  };
  while (at < source.length) {
    const brk = here(BREAK);
    if (brk) {
      if (chains[chains.length - 1].length) chains.push([]);
      at += brk[0].length;
      continue;
    }
    const gap = here(GAP);
    if (gap) {
      at += gap[0].length;
      continue;
    }
    let node: string | null = null;
    let used = 0;
    for (const [re, name] of TOKENS) {
      const m = here(re);
      if (m) {
        node = name ?? m[0].toUpperCase();
        used = m[0].length;
        break;
      }
    }
    if (!node) {
      const word = here(WORD)!;
      used = word[0].length;
      node = parseNode(word[0]);
      if (!node) {
        errors.push(/^A2$/i.test(word[0]) ? "”A2” kan vara A2.1 (nyp) eller A2.2 (hand över): skriv vilken." : `Kunde inte läsa ”${word[0]}”.`);
      }
    }
    chains[chains.length - 1].push(node);
    at += used;
  }
  const steps: Step[] = [];
  for (const chain of chains) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const from = chain[i];
      const to = chain[i + 1];
      if (!from || !to) continue;
      if (parseEdge(`${from}>${to}`)) steps.push({ from, to });
      else errors.push(`${nodeCode(from)} → ${nodeCode(to)} är ingen film.`);
    }
  }
  const named = chains.flat().filter(Boolean).length;
  if (named === 1 && !errors.length) errors.push("Skriv minst två ankare, till exempel ”A2.1 - P4C1 - A2.1”.");
  return { steps, errors };
}

/** Steps back in his notation: "A2.1 - P4C1 - A2.1"; where the chain breaks, " | " starts a new one. */
export function formatJakob(steps: readonly Step[]): string {
  let out = "";
  let last: string | null = null;
  for (const step of steps) {
    if (step.from !== last) out += (out ? " | " : "") + nodeCode(step.from);
    out += " - " + nodeCode(step.to);
    last = step.to;
  }
  return out;
}
