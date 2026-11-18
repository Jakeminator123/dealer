// Archiving a clip by hand, in Karta's step panel (Jakob 2026-11-18: "så jag får välja de som är primära eller radera eller
// arkivera"): out of play and out of the lists, its film, its record and his verdict kept and back with it on Ta tillbaka.
// The field is review.archived {by, at, where} on the take's motion record, written by tools/review-store.ts saveArchive
// through PUT /api/clip-bank/archive/<id>. Pure, in the manner of Material's pictures (components/material/choice.ts): the
// words of the buttons, what the confirm says before anything is written, and which takes of a step are archived. What the
// game plays afterwards is read from the game's own rule, the same way Karta's "Spelas nu" reads it (lib/edge-stats.ts playing
// on the bank as the game reads it), never guessed. An archived Primär leaves the step without a Primär until he chooses one:
// nothing here picks one for him. Tests in studio/tests/archive.test.ts.
import { buildGraph, type BankData, type Edge, type Graph, type Take } from "../../src/clip-graph.ts";
import { hubDeals } from "../../src/game-director.ts";
import { playing, primaryOf, type Playing } from "./edge-stats.ts";
import { edgeName, takeName } from "./names.ts";
import { gameGraph, usesOf } from "./primaries.ts";

const REST = "IDLE>IDLE";

/** The words of the two changes, the same wherever they are offered (as Material's ACTION for a picture). */
export const ARCHIVE_ACTION = {
  archive: { button: "Arkivera", done: "är arkiverad", hint: "Ur spel och ur listorna. Raderas inte; går att ta tillbaka." },
  restore: { button: "Ta tillbaka", done: "är tillbaka", hint: "Tillbaka i steget, med sin dom." },
} as const;

/** The bank as it would be with `id` archived (true) or taken back (false); nothing else changes, and the bank given is left as it was. */
export function withArchived(bank: BankData, id: string, archived: boolean): BankData {
  const own = bank.motions?.[id] ?? {};
  const review = { ...own.review };
  if (archived) review.archived = { by: "Jakob", where: "Karta" };
  else delete review.archived;
  return { ...bank, motions: { ...bank.motions, [id]: { ...own, review } } };
}

/** The takes of a step he has archived, in the bank's order. */
export const archivedOf = (edge: Pick<Edge, "takes">): Take[] => edge.takes.filter((t) => t.archived);

/**
 * What the game plays on a take's step once the take is archived (true) or taken back (false). now: what Karta's "Spelas
 * nu" will say there (playing on the game's graph, one film per seat as the game plays, with the seats it deals from anchor
 * 2.2). loop: for the rest, how many films chance then picks among (the rest is a loop, not one film); null for other steps.
 */
export function stepAfter(bank: BankData, dealer: string, take: Pick<Take, "id" | "edge">, archived: boolean): { now: Playing; loop: number | null } {
  const after = withArchived(bank, take.id, archived);
  const game = gameGraph(after, dealer);
  const now = playing(game.edge[take.edge] ? game : buildGraph(after, { dealer }), take.edge, hubDeals(after, dealer));
  const loop = take.edge === REST ? [...usesOf(game, REST).values()].filter((use) => use.kind === "loop").length : null;
  return { now, loop };
}

const films = (n: number) => `${n} ${n === 1 ? "film" : "filmer"}`;

/** "spelet spelar då Giv 03 här": what the game does on the step afterwards, as the tail of a sentence. */
function gameWords(after: { now: Playing; loop: number | null }, take: Pick<Take, "id" | "edge">, graph: Pick<Graph, "edge">, then: "då" | "sedan"): string {
  const edge = graph.edge[take.edge];
  if (edge?.experiment) return "spelet spelar aldrig det här steget (ett experiment)";
  if (after.loop !== null) return after.loop ? `vilan slumpar ${then} bland ${films(after.loop)}` : `vilan har ${then} ingen film att slumpa bland`;
  const plays = after.now.take;
  if (!plays) return `spelet har ${then} ingen film här: inget annat klipp i steget kan spelas`;
  if (plays.id === take.id) return `spelet spelar den ${then} här`;
  const name = takeName(plays, graph.edge[plays.edge]?.takes);
  return `spelet spelar ${then} ${name}${plays.edge !== take.edge ? ` (${edgeName(plays.edge)})` : ""} här`;
}
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/**
 * What the confirm says before a take is archived. The first line is the consequence: for his Primär, that the step then has
 * no Primär until he chooses one, with what the game would then play; for any other take, what the game then plays on the
 * step, plainly when nothing can. The second: nothing is deleted, the verdict stays, and where Ta tillbaka is.
 */
export function archiveLines(bank: BankData, dealer: string, take: Take, graph: Pick<Graph, "edge">): string[] {
  const after = stepAfter(bank, dealer, take, true);
  return [
    take.explicitMain ? sentence(`Steget har sedan ingen Primär tills du väljer en; ${gameWords(after, take, graph, "då")}`) : sentence(gameWords(after, take, graph, "sedan")),
    "Filmen raderas inte och domen på den står kvar. Ta tillbaka finns under Arkiverade här i steget.",
  ];
}

/**
 * What the confirm says before a take is taken back: it comes back with its verdict (a Primär as Primär), and what the game
 * then plays on the step. Should the step have got another Primär meanwhile, both are named and the choice is left to him.
 */
export function restoreLines(bank: BankData, dealer: string, take: Take, graph: Pick<Graph, "edge">): string[] {
  const edge = graph.edge[take.edge];
  const other = take.explicitMain && edge ? primaryOf({ takes: edge.takes.filter((t) => t.id !== take.id) }) : null;
  const lines = [sentence(`Den kommer tillbaka i steget${take.explicitMain ? " som Primär" : ""}, med sin dom; ${gameWords(stepAfter(bank, dealer, take, false), take, graph, "då")}`)];
  if (other) lines.push(`${takeName(other, edge?.takes)} är också Primär i steget: välj en av dem med Gör primär efteråt.`);
  return lines;
}
