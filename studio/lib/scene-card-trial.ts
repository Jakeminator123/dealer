import type { TableGeometry } from "../../src/card-plan.ts";
import type { CardRecord } from "../../src/card-overlay.ts";
import type { Segment } from "../../src/clip-graph.ts";
import { cardOptions, cardWords, continuesCardSource, type CardWords } from "../../src/game-film.ts";
import { createLayout, type Slot, type TableCards } from "../../src/game-table.ts";
import type { PlacementPlan } from "../../src/placement-model.ts";
import type { PlayPart } from "./parts.ts";

export function readSceneCardTrial(params: Pick<URLSearchParams, "get">): CardWords | null {
  return params.get("kort") === "liggande" ? cardWords(params) : null;
}

/** Give playable deal/return pairs resolved by the lab round the same card options as a game part. */
export function withSceneCardTrial(parts: PlayPart[], segments: readonly Segment[], plan: PlacementPlan, geometry: TableGeometry, words: CardWords): PlayPart[] {
  type Own = { label: string; shoeDraw: number; slot: Slot };
  const ownByStep = new Map<number, Own>(), ownByTarget = new Map<string, Own>();
  const table: TableCards = { hands: [], dealer: [] }, records: CardRecord[] = [];
  for (let i = 0; i + 1 < segments.length; i++) {
    const deal = segments[i], back = segments[i + 1], label = deal.edge?.target ?? "";
    if (deal.kind !== "DEAL" || back.kind !== "RETURN" || back.from !== label || !parts[i]?.path || !parts[i + 1]?.path) continue;
    const target = /^(D|P([1-7]))\.C([1-3])$/.exec(label);
    if (!target) continue;
    let own = ownByTarget.get(label);
    if (!own) {
      const owner = target[1] === "D" ? "D" : "P", seat = Number(target[2] ?? 0), index = Number(target[3]) - 1;
      const shoeDraw = ownByTarget.size + 1;
      own = { label, shoeDraw, slot: { owner, seat, hand: 0, hands: 1, index } };
      ownByTarget.set(label, own);
      if (owner === "D") table.dealer[index] = shoeDraw;
      else {
        let hand = table.hands.find(hand => hand.seat === seat);
        if (!hand) { hand = { seat, cards: [] }; table.hands.push(hand); }
        hand.cards[index] = shoeDraw;
      }
      // A lab round has no game state. Use one sample rank and respect the take's recorded face-down landing.
      records.push({ target: label, shoeDraw, r: "A", s: "spades", faceDown: (deal.take?.endSide ?? deal.side) === "BACK" });
    }
    ownByStep.set(i, own);
    ownByStep.set(i + 1, own);
  }
  if (!ownByStep.size) return parts;
  const layout = createLayout(plan, { geometry }), placed = new Set<number>();
  return parts.map((part, i) => {
    const own = ownByStep.get(i) ?? null;
    // The entry has no dealt card yet, but the shoe window must already use the round's carry mode and colours.
    if (!part.path) return part;
    const returning = own && segments[i].kind === "RETURN", lying = [...placed].filter(n => n !== own?.shoeDraw);
    const cards = cardOptions({ own, lying, kind: returning ? "RETURN" : own ? "DEAL" : undefined }, table, records, layout, "film", words);
    if (returning) {
      const deal = segments[i - 1];
      // The studio plans with track paths; the renderer reads the actual landing after loading them.
      if (deal.film?.target === own.label && continuesCardSource(deal, segments[i], parts[i - 1].track, part.track)) cards.filmContinuesDeal = true;
      placed.add(own.shoeDraw);
    }
    return { ...part, cards };
  });
}
