"use client";

// Bordet's live picture (modes Scen, Råfilm and Efterarbete), in the same frame as Kortplan: the toolbar on top, the stage as
// large as the window allows, one column on the right where things are changed. It is the view Scen's own parts put
// together (components/stage Stage, components/scene-editor useSceneEditor, components/round RoundPicker and RoundStrip):
//   Scen         the 3D scene (room, table, light) playing a round, every key of the scene in the column, the round to play
//   Råfilm       the same round as the films are, on their green screen (Scen's "Inte 3D")
//   Efterarbete  the 3D scene, and in the column only what is laid over the film: the cards' and chips' look ("Kort och
//                marker", the cards' bend and gloss) and, under it, the chosen card's material in the plan (Placering's
//                Material: its bend and gloss, the study's 3D card, "Alla 16 kort"; saved with "Spara i kortplanen")
// It opens on the chosen card's deal and back, from the anchor the plan's grip says ("A2.1 - P4C1 - A2.1"), so the card
// chosen in Kortplan is the one that plays; the dealer is the rail's. The look it opens on is Basgrund, what the game shows
// (Jakob 2026-11-17: "Spela i casino bör rimligtvis vara samma som i casino, alltså som det är i runtime"), so that "Spela i
// Casino" opens what the rail's Casino opens until a key is changed here, and then that look (lib/casino.ts casinoAddress). Mounted only when one of the three is
// chosen (Bordet loads it on demand), so that Kortplan stays light. Nothing is written to the address from here.
import { Spade } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { resolveRound } from "../../../src/clip-graph.ts";
import { useBank } from "../../lib/bank.ts";
import { ownSteps } from "../../lib/dealer.ts";
import { isReference, readyRounds, roundFacts, roundFromText, roundParts, viewFor, type Round } from "../../lib/rounds.ts";
import { BASE } from "../../lib/scene-presets.ts";
import { RoundPicker, RoundStrip } from "../round";
import { readLook, useSceneEditor } from "../scene-editor";
import { SHOE, type Place } from "../../../src/placement-model.ts";
import { placeName } from "../../lib/placement.ts";
import type { Face } from "../placement/cardLayer.ts";
import { MaterialPanel } from "../placement/MaterialPanel";
import { useDraft } from "../placement/useDraft.ts";
import { Stage, createClock, type StageHandle } from "../stage";
import { ErrorState, Skeleton, buttonClasses, cn } from "../ui";

export type SceneKind = "scen" | "rafilm" | "efterarbete";

export function SceneBody({ kind, toolbar, roundText, place }: { kind: SceneKind; toolbar: ReactNode; roundText: string; place: Place }) {
  const draft = useDraft();
  const [face, setFace] = useState<Face>({ rank: "A", suit: "spades" });
  const { graph, status, error, reload, owners } = useBank();
  const rounds = useMemo(() => readyRounds(), []);
  const [chosen, setChosen] = useState<Round | null>(null);
  const [clock] = useState(() => createClock());
  const stage = useRef<StageHandle>(null);
  const editor = useSceneEditor(() => readLook(new URLSearchParams({ forval: BASE })));
  const round = useMemo(() => chosen ?? roundFromText(roundText, rounds), [chosen, roundText, rounds]);
  const { places, placesRead } = editor;
  const segments = useMemo(
    () => (graph && placesRead && round?.steps.length ? resolveRound(graph, ownSteps(round.steps, graph.dealer, owners), { holeCardDown: true, places }) : []),
    [graph, placesRead, round, places, owners],
  );
  const parts = useMemo(() => roundParts(round, segments), [round, segments]);
  const mode = viewFor(round, kind === "rafilm" ? "platt" : "3d");
  const flat = mode === "platt";

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-line px-3">
          {toolbar}
          <span className="truncate text-sm text-dim" title={round.text}>
            {round.name === "Egen runda" ? round.text : round.name}
            {parts.length ? ` · ${roundFacts(parts)}` : ""}
          </span>
          <Link href={editor.casino} className={buttonClasses({ variant: "secondary", size: "sm", className: "ml-auto shrink-0" })} title="Casino, med den här looken">
            <Spade />
            Spela i Casino
          </Link>
        </div>
        {flat ? null : <div className="shrink-0">{editor.bar}</div>}
        {status === "error" && !graph ? (
          <ErrorState className="min-h-0 flex-1" title="Klippbanken kunde inte läsas" error={error} onRetry={() => void reload()} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col" {...editor.pointer}>
            <Stage ref={stage} className="min-h-0 flex-1" parts={parts} mode={mode} clock={clock} initial={editor.initial} onScene={editor.onScene} onSceneChange={editor.onSceneChange} />
          </div>
        )}
        <div className="border-t border-line bg-canvas">
          {status === "loading" ? (
            <div className="flex gap-2 px-3 py-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[78px] w-[244px] rounded-lg" />
              ))}
            </div>
          ) : isReference(round) ? (
            <RoundStrip segments={[]} parts={parts} film={round.film} clock={clock} onCue={(step) => stage.current?.cue(step)} />
          ) : segments.length ? (
            <RoundStrip segments={segments} parts={parts} clock={clock} onCue={(step) => stage.current?.cue(step)} />
          ) : (
            <p className="flex h-[92px] items-center px-5 text-sm text-faint">{graph && !placesRead ? "Läser kortplanen…" : "Välj en runda till höger."}</p>
          )}
        </div>
      </div>
      <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
        {kind === "efterarbete" ? (
          // only what is laid over the film: the cards' and chips' look, then the chosen card's material in the plan
          <div className="min-h-0 flex-1 overflow-y-auto">
            {editor.afterwork ?? <Skeleton className="m-4 h-10 rounded-md" />}
            {draft.draft && place !== SHOE ? (
              <div className="border-t border-line">
                <p className="px-4 pt-4 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{placeName(place)} i kortplanen</p>
                <MaterialPanel plan={draft.draft.plan} id={place} editable={!draft.saving} face={face} onFace={setFace} />
              </div>
            ) : null}
          </div>
        ) : kind === "scen" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className={cn("max-h-[45%] shrink-0 overflow-y-auto border-b border-line px-4 py-3")}>
              <RoundPicker rounds={rounds} current={round} problems={round?.errors ?? []} onPick={setChosen} />
            </div>
            {editor.panel}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <RoundPicker rounds={rounds} current={round} problems={round?.errors ?? []} onPick={setChosen} />
          </div>
        )}
      </aside>
    </div>
  );
}
