// What a view shows, in Jakob's words, for the bot's panel: the view's name and what is chosen there, read from the
// view's own address (?kant=…&tagning=…) and the clip bank. Raw ids stay in the address; the words go in val. Pure: no
// DOM, no React.
import type { Graph, Segment } from "../../../src/clip-graph.ts";
import { stepName } from "../../../src/dealer-trees.ts";
import type { Proof } from "../../lib/api.ts";
import { edgeName, nodeName, takeName } from "../../lib/names.ts";
import { proofFiles, proofTitle } from "../../lib/proofs.ts";
import { verdictOf } from "../../lib/verdict.ts";
import type { Position } from "../../lib/parts.ts";

export type Val = Record<string, string>;
type Params = { get(name: string): string | null };

export const VIEW_NAMES: Record<string, string> = {
  bordet: "Bordet",
  karta: "Karta",
  jamfor: "Jämför",
  granska: "Granska",
  prov: "Prov",
  onskemal: "Önskemål",
};

export const viewName = (vy: string): string => VIEW_NAMES[vy] ?? vy.charAt(0).toUpperCase() + vy.slice(1);

/** Only the words that say something: empty and missing values are left out, every value trimmed. */
export function cleanVal(val: Record<string, string | null | undefined> | null | undefined): Val {
  const out: Val = {};
  for (const [key, value] of Object.entries(val ?? {})) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) out[key] = text;
  }
  return out;
}

/** A take's short name among its edge's takes, or null when the bank does not know it. */
function takeWords(graph: Graph | null, id: string | null): string | null {
  if (!id) return null;
  const take = graph?.takes[id];
  if (!take) return id.replace(/^pamela-/, "");
  return takeName(take, graph?.edge[take.edge]?.takes);
}

/** A step of a tree as the address writes it ("READY-C>P4.C2") in his words: "A2.3 → A3P4C2". */
function stepWords(id: string | null): string | null {
  const cut = id ? id.indexOf(">") : -1;
  return id && cut > 0 ? stepName(id.slice(0, cut), id.slice(cut + 1)) : null;
}

/**
 * Karta: the tree, the step and the film chosen, and its take: {trad: "Tatuerad", steg: "A2.3 → A3P4C2", kant: "A2.1 → P4C1",
 * tagning: "Giv 02", omdome: "Godkänd"}. trees: the trees' names by id (GET /api/trees); without them the address's id is said.
 */
export function describeKarta(graph: Graph | null, params: Params, trees?: ReadonlyMap<string, string>): Val {
  const trad = params.get("trad");
  const kant = params.get("kant");
  const tagning = params.get("tagning");
  const take = tagning ? graph?.takes[tagning] : undefined;
  return cleanVal({
    trad: trad ? (trees?.get(trad) ?? trad) : null,
    steg: stepWords(params.get("steg")),
    kant: kant ? edgeName(kant) : null,
    tagning: takeWords(graph, tagning),
    omdome: take ? verdictOf(take).label : null,
    plats: params.get("plats") ? nodeName(params.get("plats")!) : null,
  });
}

/** Granska: the take open, on its film: {kant, tagning, omdome}; "Alla" when every take is listed. */
export function describeGranska(graph: Graph | null, params: Params): Val {
  if (params.get("vy") === "alla") return { lista: "Alla tagningar" };
  const id = params.get("tagning");
  const take = id ? graph?.takes[id] : undefined;
  return cleanVal({
    kant: take ? edgeName(take.edge) : null,
    tagning: takeWords(graph, id),
    omdome: take ? verdictOf(take).label : null,
  });
}

/** Jämför: the film and the pair: {kant: "A2.1 → P4C1", par: "Giv 02 mot Giv 03"}. */
export function describeJamfor(graph: Graph | null, params: Params): Val {
  const kant = params.get("kant");
  const a = takeWords(graph, params.get("a"));
  const b = takeWords(graph, params.get("b"));
  return cleanVal({ kant: kant ? edgeName(kant) : null, par: a && b ? `${a} mot ${b}` : (a ?? b) });
}

/** Prov: the proof open and its film or picture: {prov: "V6-referens", fil: "Kortstorlek"}. */
export function describeProv(proofs: readonly Proof[] | null, params: Params): Val {
  const id = params.get("prov");
  if (!id) return {};
  const proof = proofs?.find((p) => p.id === id) ?? null;
  const file = params.get("fil");
  let fil: string | null = file;
  if (proof && file) {
    const files = proofFiles(proof);
    fil = [...files.films, ...files.pictures].find((e) => e.file.name === file)?.name ?? file;
  }
  return cleanVal({ prov: proof ? proofTitle(proof) : id, fil });
}

/** Spela, read when a question is asked: the step on screen and its film: {steg: "2/3", film: "A2.1 → P4C1 · Giv 02", ruta: "88"}. */
export function stepFacts(pos: Position | null, segments: readonly Pick<Segment, "id" | "take">[]): Val {
  if (!pos || !segments.length) return {};
  const segment = segments[pos.step];
  if (!segment) return {};
  const take = segment.take;
  return cleanVal({
    steg: `${pos.step + 1}/${segments.length}`,
    film: [edgeName(segment.id), take ? takeName(take) : "ingen tagning"].join(" · "),
    ruta: String(pos.frame),
  });
}

/** The chip's words: "Karta · A2.1 → P4C1 · Giv 02". The verdict and other extras stay out of the chip. */
export function contextLine(namn: string, val: Val, keep = 2): string {
  const shown = Object.entries(val)
    .filter(([key]) => !["omdome", "ruta"].includes(key))
    .slice(0, keep)
    .map(([, value]) => value);
  return [namn, ...shown].join(" · ");
}
