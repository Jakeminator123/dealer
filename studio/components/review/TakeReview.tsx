"use client";

// <TakeReview take={take} edge={edge} … />: one take, large, for Jakob's decision: its name in his words (the step
// "A2.1 → P4C1" and the take's short name), the film, what a reviewer noted (two lines, more on demand), the decision
// bar, "Ursprung" (what the film was made from, folded), and "Jämför mot primär" when the step has another film. Space
// plays, ← → step a frame.
import { ArrowLeftRight, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, type Ref } from "react";
import { describeEdge, type Edge, type Take } from "../../../src/clip-graph.ts";
import type { Decision } from "../../lib/api.ts";
import { edgeName, factsLine, takeFacts, takeNames } from "../../lib/names.ts";
import { comparePair, playableFilm, reviewerNotes } from "../../lib/review.ts";
import { VERDICT_LABEL, type Verdict } from "../../lib/verdict.ts";
import { compareHref } from "../compare/ChoiceList";
import { FilmPlayer, type FilmMark, type FilmPlayerHandle } from "../player";
import { DecisionBar, TakeChip } from "../takes";
import type { DecisionBarHandle } from "../takes/DecisionBar";
import { Origin } from "../takes/Origin";
import { useBank } from "../../lib/bank.ts";
import { IconButton, buttonClasses, cn } from "../ui";
import { Fold } from "./Fold";

const DECIDED: Record<string, Verdict> = { MAIN: "primar", ACCEPTED: "godkand", VARIANT: "variant", REJECTED: "underkand" };

export type LastDecision = { id: string; name: string; decision: Decision };

export function TakeReview({
  take,
  edge,
  position,
  waiting,
  onStep,
  onSaved,
  last,
  onUndo,
  undoing,
  playerRef,
  barRef,
}: {
  take: Take;
  edge: Edge;
  /** Its place among the takes that wait (1-based), or null when it is not one of them. */
  position: number | null;
  waiting: number;
  /** To the waiting take before (-1) or after (1) without deciding. */
  onStep: ((n: -1 | 1) => void) | null;
  onSaved: (decision: Decision) => void;
  /** The decision just made, for "Ångra". */
  last: LastDecision | null;
  onUndo: () => void;
  /** "Ångra" opened this take again but could not take its decision back: he chooses again. */
  undoing: boolean;
  playerRef?: Ref<FilmPlayerHandle>;
  /** The decision bar, so that "Ångra" can make its Återställ write. */
  barRef?: Ref<DecisionBarHandle>;
}) {
  const name = useMemo(() => takeNames(edge.takes).get(take.id) ?? take.id, [edge.takes, take.id]);
  const notes = reviewerNotes(take);
  const facts = factsLine(takeFacts(take));
  const others = edge.takes.filter((t) => t.id !== take.id && playableFilm(t));
  const pair = others.length ? comparePair(edge, take.id) : null;
  const marks: FilmMark[] = take.landingFrame !== null ? [{ frame: take.landingFrame, label: "Landning", kind: "landing" }] : [];
  const decisionBox = useRef<HTMLDivElement>(null);
  const { graph } = useBank();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-4 pt-4 [scrollbar-gutter:stable]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 font-display text-lg font-medium text-dim">{edgeName(edge)}</span>
            <h2 className="min-w-0 truncate font-display text-xl font-semibold tracking-[-0.01em] text-ink" title={take.id}>
              {name}
            </h2>
            <TakeChip take={take} />
          </div>
          <span className="truncate text-xs text-faint">{[edge.experiment ? "Experiment utanför modellen" : describeEdge(edge), facts].join(" · ")}</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {last && last.id !== take.id ? (
            <span className="flex items-center gap-1 rounded-md border border-line bg-surface py-0.5 pl-2.5 pr-0.5 text-xs text-dim">
              <span className="max-w-44 truncate">
                {last.name}: {VERDICT_LABEL[DECIDED[last.decision] ?? "vantar"].toLowerCase()}
              </span>
              <button type="button" onClick={onUndo} className={buttonClasses({ variant: "quiet", size: "sm", className: "h-6 px-2 text-xs" })}>
                <Undo2 /> Ångra
              </button>
            </span>
          ) : null}
          {pair?.a && pair.b ? (
            <Link href={compareHref(edge.id, take.id, pair.b.id)} className={buttonClasses({ variant: "secondary", size: "md" })}>
              <ArrowLeftRight /> {pair.b.explicitMain ? "Jämför mot primär" : "Jämför mot den som spelas"}
            </Link>
          ) : null}
          {onStep ? (
            <span className="flex items-center gap-0.5">
              <IconButton label="Föregående som väntar" icon={<ChevronLeft />} onClick={() => onStep(-1)} />
              <span className="min-w-16 text-center text-sm text-dim tabular-nums">{position ? `${position} av ${waiting}` : `${waiting} väntar`}</span>
              <IconButton label="Nästa som väntar" icon={<ChevronRight />} onClick={() => onStep(1)} />
            </span>
          ) : null}
        </div>
      </div>

      <FilmPlayer
        ref={playerRef}
        key={take.id}
        src={take.media.video ?? null}
        fps={take.fps}
        frames={take.frames}
        range={take.segment}
        speed={take.speed}
        marks={marks}
        keys
        label={`Film: ${name}`}
        className="min-h-[min(400px,55vh)] flex-1"
      />

      {notes.length ? (
        <Fold lines={2} className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm leading-5 text-dim">
          {notes.map((n, i) => (
            <span key={n.label}>
              {i ? " " : ""}
              <b className="font-semibold text-ink/85">{n.label}:</b> {n.text}
            </span>
          ))}
        </Fold>
      ) : null}

      <div ref={decisionBox} className={cn("rounded-lg border bg-surface px-4 py-3", undoing ? "border-brass/50" : "border-line")}>
        {undoing ? <p className="mb-2 text-sm text-brass-hi">Ångra: beslutet kunde inte tas tillbaka. Välj igen, eller Återställ så väntar den igen.</p> : null}
        <DecisionBar ref={barRef} take={take} compact onSaved={onSaved} />
      </div>

      <Origin take={take} graph={graph} className="px-1" />
    </div>
  );
}
