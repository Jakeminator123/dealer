// Ny film, Bordet's guide for a new film (Kortplan's step 3; Jakob 2026-11-23: "mer likt så som en 'Wizard' … och att allt är
// sammanlänkt smart till nodträd och dealer"): the dealer, her tree and the step (Vad), the step's recipe (Hur) and what is
// sent (Skicka). This file is the guide's pure part: the address words, the step a word names and the order it is made as
// (src/order-model.ts stepOfEdge), the tree's steps as tiles, and the tree's picture an order is made from. No DOM, no
// network; the view is components/bordet/NewFilm.tsx. Test: studio/tests/new-film.test.ts.
//
// The address: /bordet/?lage=bestall&trad=<tree>&film=<the step in his notation>[&komposition=<id>]&dealer=<id>, for example
// ?lage=bestall&trad=tatuerad&film=A2.3-A3P4C2&dealer=paow. Karta's "Beställ" writes it (guideHref); Bordet writes the same
// words while the guide is open, so a reload keeps it. The way back is kartaHref.
import { REVEAL_NODE } from "../../src/clip-graph.ts";
import { TREE_ID, isCard, type StepKind, type StepState, type TreeView, type ViewStep } from "../../src/dealer-trees.ts";
import { ANCHOR_NODE, ANCHOR_ROLE, stepOf, stepOfEdge } from "../../src/order-model.ts";
import type { FilmWish } from "./bordet.ts";
import { nodeCode, parseJakob } from "./names.ts";
import { anchorFor } from "./orders.ts";

/** The words the guide owns in Bordet's address (with lage=bestall); Bordet takes them out when the guide closes. */
export const GUIDE_WORDS = ["trad", "film", "komposition"] as const;

/** A step between two of the graph's nodes, the tree's own ("READY-C" → "P4.C2"). */
export type StepPick = { from: string; to: string };
/** What the address asks of the guide: the tree, the step and the composition it came from (for the way back). */
export type Guide = { tree: string | null; pick: StepPick | null; composition: string | null };

type Params = { get(name: string): string | null };

/** "A2.3-A3P4C2", "A1-DC2 upp": a step in his notation, as the address carries it. */
export const filmCode = (p: StepPick): string => `${nodeCode(p.from)}-${nodeCode(p.to)}`;

/** The one step a film word names ("A2.3-A3P4C2"), or null where it names none or more than one. */
export function pickOf(word: string | null | undefined): StepPick | null {
  if (!word?.trim()) return null;
  const { steps, errors } = parseJakob(word);
  return !errors.length && steps.length === 1 ? { from: steps[0].from, to: steps[0].to } : null;
}

/** The guide the address asks for (?lage=bestall), or null. A word that names nothing is left out, never guessed. */
export function guideOf(p: Params): Guide | null {
  if (p.get("lage") !== "bestall") return null;
  const tree = p.get("trad"), composition = p.get("komposition");
  return { tree: tree && TREE_ID.test(tree) ? tree : null, pick: pickOf(p.get("film")), composition: composition && TREE_ID.test(composition) ? composition : null };
}

/** Bordet's guide with the dealer, the tree and the step chosen: Karta's "Beställ". */
export function guideHref(dealer: string, tree: string, pick: StepPick, composition: string | null = null): string {
  const q = new URLSearchParams({ lage: "bestall", trad: tree, film: filmCode(pick) });
  if (composition) q.set("komposition", composition);
  q.set("dealer", dealer);
  return `/bordet/?${q.toString()}`;
}

/** The way back to Karta: the composition the guide came from, else the tree with the step open. */
export function kartaHref(dealer: string, tree: string, step: string | null, composition: string | null = null): string {
  const q = new URLSearchParams(composition ? { komposition: composition } : { trad: tree, ...(step ? { steg: step } : {}) });
  q.set("dealer", dealer);
  return `/karta/?${q.toString()}`;
}

/** The card a step is about: the card it goes to or comes from, the hole card for its turn; null for a step without one. */
export const cardOf = (p: StepPick): string | null => (isCard(p.from) ? p.from : isCard(p.to) ? p.to : p.to === REVEAL_NODE ? "D.C2" : null);

/** The same step for another card chosen on the board ("A2.3 → A3P4C2" for P5C1 is "A2.3 → A3P5C1"); a step without a card stays. */
export function swapCard(p: StepPick, place: string): StepPick {
  if (!isCard(place)) return p;
  if (isCard(p.from) && p.from !== place) return { from: place, to: p.to };
  if (isCard(p.to) && p.to !== place) return { from: p.from, to: place };
  return p;
}

/** The two nodes an order's step goes between (the inverse of stepOfEdge), for an old address that named the step and card. */
export function pickOfWish(w: FilmWish): StepPick | null {
  const def = stepOf(w.step);
  if (!def || def.kind !== "FILM") return null;
  if (def.edge) {
    const cut = def.edge.indexOf(">");
    return { from: def.edge.slice(0, cut), to: def.edge.slice(cut + 1) };
  }
  const from = ANCHOR_NODE[def.from], to = ANCHOR_NODE[def.to ?? def.from];
  if (def.card) return w.target ? (def.start === "LAND" ? { from: w.target, to } : { from, to: w.target }) : null;
  return { from, to };
}

/**
 * A step the guide can show: the tree's own (step: its state, its film, what the lab reads of an order of it) or one outside the
 * tree's measure (step null: a return to rest, a deal from another anchor at the shoe). wish: the order it is made as; null where
 * no step of Beställ makes it.
 */
export type GuideItem = { id: string; from: string; to: string; kind: StepKind | null; card: string | null; name: string; state: StepState | null; step: ViewStep | null; wish: FilmWish | null };

function itemFrom(p: StepPick, step: ViewStep | null): GuideItem {
  const edge = stepOfEdge(p.from, p.to);
  return {
    id: `${p.from}>${p.to}`, from: p.from, to: p.to, kind: step?.kind ?? null, card: step?.card ?? cardOf(p),
    name: step?.name ?? `${nodeCode(p.from)} → ${nodeCode(p.to)}`, state: step?.state ?? null, step, wish: edge ? { step: edge.step, target: edge.target } : null,
  };
}

/** The step a pick names in the tree (its own, or one outside the measure). */
export const itemOf = (view: Pick<TreeView, "steps"> | null, p: StepPick): GuideItem => itemFrom(p, view?.steps.find((s) => s.id === `${p.from}>${p.to}`) ?? null);

/**
 * The guide's step for a card chosen on the board: the tree's step of the same kind to that card (from the anchor the tree
 * deals it from), else the same step with the card swapped; a step without a card stays.
 */
export function pickFor(view: Pick<TreeView, "steps"> | null, item: Pick<GuideItem, "from" | "to" | "kind">, place: string): StepPick {
  const own = item.kind && isCard(place) ? view?.steps.find((s) => s.kind === item.kind && s.card === place) : undefined;
  return own ? { from: own.from, to: own.to } : swapCard({ from: item.from, to: item.to }, place);
}

/** The same step in another tree (the giv to P4C2 from that tree's anchor at the shoe); a step outside the measure stays as it is. */
export function sameIn(view: Pick<TreeView, "steps">, item: GuideItem): StepPick {
  const s = item.kind ? view.steps.find((x) => x.kind === item.kind && x.card === item.card) : null;
  return s ? { from: s.from, to: s.to } : { from: item.from, to: item.to };
}

const SHOE_ANCHORS = ["READY", "READY-B", "READY-C"] as const;
/**
 * The steps outside the tree's measure that Bordet orders: for the card chosen on the board its return to rest (A3 → A1) and
 * its deal and return from the other anchors at the shoe, and the entry and the exit of those anchors.
 */
export function morePicks(hub: string, place: string | null): StepPick[] {
  const card = place && isCard(place) ? place : null;
  const others = SHOE_ANCHORS.filter((a) => a !== hub);
  return [
    ...(card ? [{ from: card, to: "IDLE" }, ...others.flatMap((a) => [{ from: a, to: card }, { from: card, to: a }])] : []),
    ...others.flatMap((a) => [{ from: "IDLE", to: a }, { from: a, to: "IDLE" }]),
  ];
}

/**
 * The tiles of Vad: the tree's 36 steps by state, in the order a round meets them, and the steps outside the measure. Without
 * a tree (a lab server that has no trees to answer) every step Bordet orders for the chosen card and without a card is "more".
 */
export type Tiles = { saknas: GuideItem[]; prov: GuideItem[]; finns: GuideItem[]; more: GuideItem[] };
export function tilesOf(view: Pick<TreeView, "steps" | "hub"> | null, place: string | null): Tiles {
  const tree = (view?.steps ?? []).map((s) => itemFrom(s, s));
  const loose = view ? morePicks(view.hub, place) : [...morePicks("", place), { from: "IDLE", to: "IDLE" }, { from: "IDLE", to: REVEAL_NODE }];
  const more = loose.map((p) => itemOf(view, p)).filter((i) => i.wish && !i.step);
  return { saknas: tree.filter((i) => i.state === "saknas"), prov: tree.filter((i) => i.state === "prov"), finns: tree.filter((i) => i.state === "finns"), more };
}

/** The cards with a step of the tree that has no film: what the board rings while the guide is open. */
export const gapCards = (view: Pick<TreeView, "steps">): Set<string> => new Set(view.steps.flatMap((s) => (s.state === "saknas" && s.card ? [s.card] : [])));

/** The node whose picture a tile shows: the card, else where the step goes (where it leaves the shoe for rest, the anchor it leaves). */
export const tileNode = (item: Pick<GuideItem, "from" | "to" | "card">): string => item.card ?? (item.to === "IDLE" && item.from !== "IDLE" ? item.from : item.to);

/** The tree the guide opens on: the asked one, else the first that is being built (not one that shares another), else the first the game plays. */
export function pickTree<V extends Pick<TreeView, "tree">>(views: readonly V[], asked: string | null): V | null {
  return views.find((v) => v.tree.id === asked) ?? views.find((v) => v.tree.state === "byggs" && !v.tree.shares) ?? views.find((v) => v.tree.state === "spelas" && !v.tree.shares) ?? views[0] ?? null;
}

/**
 * Whether a picture of Material is the tree's own: one of its anchors or the pictures of its nodes, or a landing made from
 * those alone. What the guide says of a picture it sends that is not (an anchor or a landing of another tree).
 */
export function treeOwns(view: Pick<TreeView, "nodes" | "tree">, entry: { id: string; role: string; builtOn?: string[] }): boolean {
  const own = new Set([...view.tree.anchors.map((a) => a.entry), ...view.nodes.flatMap((n) => (n.entry ? [n.entry] : []))]);
  return own.has(entry.id) || (entry.role === "landning" && !!entry.builtOn?.length && entry.builtOn.every((b) => own.has(b)));
}

type AnchorEntry = { id: string; role: string; state?: string; node?: string; card?: string; served: string | null };
/**
 * The tree's own picture of the anchor an order starts from (the store's NewOrder.base), where it is not the picture that holds
 * in Material: so that the film goes from the tree's picture (a tree of older anchors) and not from the newest. Null where the
 * holding picture is the tree's, where the tree has no anchor picture there, and for the return to A2.3 (made by command).
 */
export function treeBase(view: Pick<TreeView, "nodes">, wish: FilmWish, entries: readonly AnchorEntry[]): string | null {
  const def = stepOf(wish.step);
  if (!def || def.off) return null;
  const node = ANCHOR_NODE[def.from];
  const id = view.nodes.find((n) => n.node === node)?.entry ?? null;
  const entry = id ? entries.find((e) => e.id === id) : undefined;
  if (!entry || entry.role !== ANCHOR_ROLE[def.from] || entry.node !== node || entry.card || !entry.served) return null;
  return anchorFor(entries, def.from).holds?.id === id ? null : id;
}
