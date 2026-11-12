// What a take was made from, out of the bank's own data (Jakob 2026-11-12: "which references has this to do with, and what
// makes this get produced"): its first and last picture and where each came from, the model, the length, the prompt and
// the purpose the order was written with; for a cut-out take the clip and frames it is cut from, for a corrected copy the
// clip it corrects. The words of the job's notes and prompt stay as the bank has them (they were written in English).
// Pure: no DOM; tests in studio/tests/made-from.test.ts. The fold that shows it is Origin.tsx.
import { clipOfVideo, type Graph, type ImageRef, type Take } from "../../../src/clip-graph.ts";
import { edgeName, formatSeconds, modelName, takeName } from "../../lib/names.ts";

/** One end of the take: the picture to show (a still of the bank, or a frame of a film), its words and the job's note. */
export type OriginPicture = {
  /** A still the bank has ("assets/motions/<id>/first.png", in the copy .webp). */
  still: string | null;
  /** Else a frame of a film to draw ("assets/motions/<clip>/source.mp4", frame n). */
  frame: { video: string; index: number } | null;
  words: string;
  note: string | null;
};

export type Origin = {
  how: "genererad" | "utsnitt" | "rattad";
  model: string;
  length: string | null;
  first: OriginPicture;
  last: OriginPicture | null;
  /** A cut-out take: the clip and the frames, both shown. */
  cutFrom: { clip: string; words: string; start: number; end: number } | null;
  /** A corrected copy: the clip it was made from. */
  editOf: { clip: string; words: string } | null;
  prompt: string | null;
  purpose: string | null;
};

/** A clip of the bank in Jakob's words: "A2.1 → P4C1 · Giv 02"; an unknown clip by its id without "pamela-". */
export function clipWords(graph: Pick<Graph, "takes" | "edge"> | null, clip: string): string {
  const take = graph?.takes[clip];
  if (!take) return clip.replace(/^pamela-/, "");
  return `${edgeName(take.edge)} · ${takeName(take, graph?.edge[take.edge]?.takes)}`;
}

/** Where a picture of a job came from, in words. */
function refWords(graph: Pick<Graph, "takes" | "edge"> | null, ref: ImageRef | undefined): { words: string; frame: OriginPicture["frame"] } {
  if (ref?.frame && typeof ref.frame.video === "string" && Number.isInteger(ref.frame.index)) {
    const clip = clipOfVideo(ref.frame.video);
    return { words: `ruta ${ref.frame.index} ur ${clip ? clipWords(graph, clip) : "en film"}`, frame: { video: ref.frame.video, index: ref.frame.index } };
  }
  const path = typeof ref?.file?.path === "string" ? ref.file.path : null;
  if (!path) return { words: "ingen", frame: null };
  const motion = /^assets\/motions\/([a-z0-9-]+)\/([^/]+)$/.exec(path);
  if (motion) return { words: `bilden ${motion[2]} från ${clipWords(graph, motion[1])}`, frame: null };
  const anchor = /^assets\/anchors\/(.+)$/.exec(path);
  if (anchor) return { words: `ankarbilden ${anchor[1]}`, frame: null };
  if (path.startsWith("assets/")) return { words: `bilden ${path.slice("assets/".length)}`, frame: null };
  // A picture outside the bank's folders: in the copy its path is a token (tools/studio-freeze.ts tokenFor).
  if (path.startsWith("lokal/")) return { words: "en bild som bara finns hos Jakob", frame: null };
  return { words: `en bild utanför klippbanken (${path.split(/[\\/]/).slice(-2).join("/")})`, frame: null };
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function originOf(take: Pick<Take, "id" | "job" | "media" | "segment" | "editOf" | "frames" | "fps">, graph: Pick<Graph, "takes" | "edge"> | null): Origin {
  const job = take.job;
  const frames = take.segment ? take.segment.end - take.segment.start + 1 : take.frames;
  const fps = take.fps ?? 30;
  const seconds = frames !== null ? frames / fps : job.duration > 0 ? job.duration : null;
  const length = [seconds !== null ? formatSeconds(seconds) : null, frames !== null ? `${frames} rutor` : null].filter(Boolean).join(" · ") || null;
  const start = refWords(graph, job.first);
  const end = job.last ? refWords(graph, job.last) : null;
  const how: Origin["how"] = take.segment ? "utsnitt" : take.editOf ? "rattad" : "genererad";
  return {
    how,
    model: how === "utsnitt" ? "Utsnitt (ingen modell)" : modelName(job.model || "okänd"),
    length,
    first: { still: take.media.first ?? null, frame: take.media.first ? null : start.frame, words: start.words, note: text(job.first?.note) },
    last: end
      ? { still: take.media.last ?? null, frame: take.media.last ? null : end.frame, words: end.words, note: text(job.last?.note) }
      : how === "genererad"
        ? { still: take.media.last ?? null, frame: null, words: "ingen: filmen beställdes från startbilden ensam", note: null }
        : null,
    cutFrom: take.segment ? { clip: take.segment.clip, words: clipWords(graph, take.segment.clip), start: take.segment.start, end: take.segment.end } : null,
    editOf: take.editOf ? { clip: take.editOf, words: clipWords(graph, take.editOf) } : null,
    prompt: text(job.promptText),
    purpose: text(job.purpose),
  };
}
