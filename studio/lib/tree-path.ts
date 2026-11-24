// A path through a tree on Karta (Jakob 2026-11-23: "kan man inte tex här också spela upp flera klipp tillsammans"): the
// nodes he clicks in order (A1, A2.3, A3P4C1, A2.3), each pair of them the tree's step between them, and the parts the stage
// plays for it back to back (lib/parts.ts). A step plays the film the tree shows on it (src/dealer-trees.ts treeSteps: the
// film the game plays there, a return the one that continues the deal shown; never a waiting or a rejected one). A step without one is a gap: the stage holds the first node's picture for a moment and goes on. The frames
// are the game's: each run of films is resolved as a round (src/clip-graph.ts resolveRound) with every step's take locked,
// so a deal is cut where its return begins, as in the game. Pure: no DOM, no network.
import { resolveRound, type Gap, type Graph, type Step } from "../../src/clip-graph.ts";
import { isAnchorAtShoe, nodeCode, stepName, type TreeNode, type ViewStep } from "../../src/dealer-trees.ts";
import { partsOf, type PlayPart } from "./parts.ts";

/** What a gap says over the held picture, in two words. */
export const PATH_GAP_WORD: Record<Gap, string> = {
  MISSING: "film saknas",
  WAITING: "väntar på dom",
  REJECTED: "film saknas",
  LOCAL_ONLY: "filen saknas",
  INVALID: "inget steg",
};

/** One step of the path: the tree's step between its two nodes (null: there is none), the take it plays, or why none. */
export type PathClip = { from: string; to: string; name: string; step: ViewStep | null; take: string | null; gap: Gap | null };

type Link = Pick<ViewStep, "from" | "to">;

/** Where the path may go next: from its last node along one of the tree's steps; the first node, any a step leaves from. */
export function nextNodes(steps: readonly Link[], path: readonly string[]): Set<string> {
  const last = path.at(-1);
  return new Set(last === undefined ? steps.map((s) => s.from) : steps.filter((s) => s.from === last).map((s) => s.to));
}

/** The path's steps in turn. A step with a film (finns) plays its take; prov waits for a verdict; saknas has nothing. */
export function pathClips(steps: readonly ViewStep[], path: readonly string[]): PathClip[] {
  return path.slice(1).map((to, k) => {
    const from = path[k];
    const step = steps.find((s) => s.from === from && s.to === to) ?? null;
    const take = step?.state === "finns" ? step.take : null;
    const gap: Gap | null = !step ? "INVALID" : take ? null : step.state === "prov" ? "WAITING" : "MISSING";
    return { from, to, name: step?.name ?? stepName(from, to), step, take, gap };
  });
}

/** The nodes a step's film is played between: a stand-in's own anchor at the shoe where it gives the step (A2.2 for A2.3). */
function playedAs(clip: PathClip): Step {
  const via = clip.step?.via ?? null;
  const swap = (node: string) => (via && isAnchorAtShoe(node) ? via : node);
  return { from: swap(clip.from), to: swap(clip.to), take: clip.take ?? undefined };
}

function gapPart(clip: PathClip, step: number, gap: Gap): PlayPart {
  return { step, edge: clip.step?.edge ?? `${clip.from}>${clip.to}`, from: clip.from, to: clip.to, take: null, path: null, start: 0, end: 0, fps: 30, speed: 1, track: null, gap, known: true };
}

/**
 * What the stage plays for the path: one part per step, in order. A run of steps with films is resolved together; a step
 * whose take the round cannot play (no file here, or not playable after all) is a gap rather than another take.
 */
export function pathParts(graph: Graph, clips: readonly PathClip[]): PlayPart[] {
  const parts: PlayPart[] = [];
  for (let i = 0; i < clips.length; ) {
    if (!clips[i].take) {
      parts.push(gapPart(clips[i], i, clips[i].gap ?? "MISSING"));
      i++;
      continue;
    }
    let j = i;
    while (j < clips.length && clips[j].take) j++;
    const run = clips.slice(i, j);
    partsOf(resolveRound(graph, run.map(playedAs))).forEach((part, k) => {
      const clip = run[k];
      parts.push(part.path && part.take === clip.take ? { ...part, step: i + k } : gapPart(clip, i + k, part.gap === "LOCAL_ONLY" ? "LOCAL_ONLY" : "MISSING"));
    });
    i = j;
  }
  return parts;
}

/** The path in the address, in his codes: "A1-A2.3-A3P4C1-A2.3". */
export const pathText = (path: readonly string[]): string => path.map((node) => nodeCode(node)).join("-");

/** The path read back from the address: each code a node of the tree; a code the tree does not have is left out. */
export function parsePath(text: string | null, nodes: readonly Pick<TreeNode, "node" | "code">[]): string[] {
  if (!text) return [];
  return text.split("-").flatMap((code) => {
    const hit = nodes.find((n) => n.code === code);
    return hit ? [hit.node] : [];
  });
}
