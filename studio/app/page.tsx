"use client";

// Spela: the one surface for all playback. A round (a list of steps the clip bank resolves, src/clip-graph.ts resolveRound)
// plays large in the lab's 3D scene or as plain films ("Inte 3D"), with one transport for both; under it the round as a
// strip of its steps, beside it the rounds to choose from and the scene's look. The header says the round in Jakob's
// notation ("A1 - A2.1 - P4C1 - A1 · 3 steg · 8,5 s"), never file names.
// Addresses (other views link here): /?runda=<his notation or the graph's sequence>, /?kant=<edge>&tagning=<take> (that take
// where it belongs: a deal with the return that continues it, a return after its deal), &vy=platt starts in "Inte 3D".
import { Box, Film } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { resolveRound } from "../../src/clip-graph.ts";
import { RoundPicker, RoundStrip } from "@/components/round";
import { BankStatus, Page } from "@/components/shell";
import { Stage, createClock, type SceneLook, type ShownLook, type StageHandle } from "@/components/stage";
import { ErrorState, Kbd, SegmentedControl, Skeleton, Switch } from "@/components/ui";
import { getPlacements } from "@/lib/api";
import { useBank } from "@/lib/bank";
import { stepFacts, useViewContext } from "@/lib/context";
import { formatJakob } from "@/lib/names";
import { addressOf, contextRound, isReference, no3d, placesOf, readAddress, readyRounds, roundFacts, roundFromText, roundParts, viewFor, type Round, type View } from "@/lib/rounds";

export default function SpelaPage() {
  return (
    <Suspense fallback={<Page title="Spela" full />}>
      <Spela />
    </Suspense>
  );
}

const VIEWS = [
  { value: "3d" as const, label: "3D", icon: <Box />, title: "Filmen i 3D-scenen" },
  { value: "platt" as const, label: "Inte 3D", icon: <Film />, title: "Filmen som den är, på sin gröna" },
];
const LOOKS = [
  { value: "levande" as const, label: "Levande", title: "Kameran lutar och gungar, skärpan följer kortet, damm och klocka" },
  { value: "stilla" as const, label: "Stilla", title: "Scenens grund i hemvyn" },
];

function Spela() {
  const params = useSearchParams();
  const query = params.toString();
  const { graph, status, error, reload } = useBank();
  const rounds = useMemo(() => readyRounds(), []);
  const [address, setAddress] = useState(() => readAddress(params));
  const [chosen, setChosen] = useState<Round | null>(null);
  const [view, setView] = useState<View>(address.view);
  // null: a double click in the scene took it to the home view, which is neither look (the control then shows none).
  const [look, setLook] = useState<ShownLook>("levande");
  const [cards, setCards] = useState(false);
  const [clock] = useState(() => createClock());
  const stage = useRef<StageHandle>(null);

  // The address changed from outside (a link from another view, back and forth in the history): it decides again. What
  // this page wrote itself (written) is already on screen.
  const [seen, setSeen] = useState(query);
  const [written, setWritten] = useState<string | null>(null);
  if (query !== seen) {
    setSeen(query);
    if (query !== written) {
      const next = readAddress(params);
      setAddress(next);
      setView(next.view);
      setChosen(null);
    }
  }
  const write = (round: Round | null, next: View) => {
    const text = addressOf(round, next);
    setWritten(text.slice(1));
    window.history.replaceState(null, "", `${window.location.pathname}${text}`);
  };

  const round = useMemo<Round | null>(() => {
    if (chosen) return chosen;
    const asked = address.asked;
    if (asked.kind === "runda") return roundFromText(asked.text, rounds);
    if (asked.kind === "kant") return graph ? contextRound(graph, asked.edge, asked.take) : null;
    return rounds[0];
  }, [chosen, address, graph, rounds]);

  // Card places from Jakob's plan: a seat's second card then knows how far its card moves (the bank's notes say so otherwise).
  const [places, setPlaces] = useState<ReturnType<typeof placesOf>>(null);
  useEffect(() => {
    let gone = false;
    getPlacements().then(
      (p) => !gone && setPlaces(placesOf(p.plan)),
      () => {},
    );
    return () => {
      gone = true;
    };
  }, []);

  const segments = useMemo(() => (graph && round?.steps.length ? resolveRound(graph, round.steps, { holeCardDown: true, places }) : []), [graph, round, places]);
  const parts = useMemo(() => roundParts(round, segments), [round, segments]);
  const notation = isReference(round) ? round.name : round?.steps.length ? formatJakob(round.steps) : "";
  const failed = status === "error" && !graph;
  // A reference film plays only as the film it is: "Inte 3D", with 3D unavailable while it is chosen.
  const shownView = viewFor(round, view);
  const blocked3d = no3d(round);
  const views = blocked3d ? VIEWS.map((v) => (v.value === "3d" ? { ...v, disabled: true, title: blocked3d } : v)) : VIEWS;
  useViewContext({ vy: "spela", val: { runda: notation, visning: shownView === "3d" ? "3D" : "Inte 3D" }, live: () => stepFacts(clock.get().pos, segments) });

  return (
    <Page
      title="Spela"
      full
      status={
        graph ? (
          <>
            <span className="min-w-0 truncate font-medium text-ink" title={notation}>
              {notation || "Ingen runda"}
            </span>
            {parts.length ? <span className="shrink-0">· {roundFacts(parts)}</span> : null}
          </>
        ) : (
          <BankStatus />
        )
      }
      actions={
        <>
          {blocked3d ? (
            <span className="text-xs text-faint" title={blocked3d}>
              Färdig film: bara Inte 3D
            </span>
          ) : null}
          <SegmentedControl
            label="Visning"
            value={shownView}
            onChange={(next) => {
              setView(next);
              write(round, next);
            }}
            options={views}
          />
        </>
      }
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_288px]">
        <div className="flex min-h-0 min-w-0 flex-col">
          {failed ? (
            <ErrorState className="min-h-0 flex-1" title="Klippbanken kunde inte läsas" error={error} onRetry={() => void reload()} />
          ) : (
            <Stage ref={stage} className="min-h-0 flex-1" parts={parts} mode={shownView} look={look} onLook={setLook} cards={cards} clock={clock} />
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
              <p className="flex h-[92px] items-center px-5 text-sm text-faint">Välj en runda till höger, eller skriv en egen.</p>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-l border-line px-4 pb-4 pt-4">
          <RoundPicker
            rounds={rounds}
            current={round}
            problems={round?.errors ?? []}
            onPick={(next) => {
              setChosen(next);
              write(next, view);
            }}
          />
          <section className="flex flex-col gap-2.5">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.09em] text-faint">Scenen</h2>
            <SegmentedControl<SceneLook | "hemvy">
              label="Scenens känsla"
              value={look ?? "hemvy"}
              onChange={(next) => next !== "hemvy" && setLook(next)}
              options={LOOKS}
              disabled={shownView === "platt"}
              className="self-start"
            />
            {look === null && shownView === "3d" ? <span className="-mt-1 text-xs text-faint">Hemvyn efter dubbelklick: välj en känsla igen.</span> : null}
            <Switch size="sm" checked={cards} onChange={setCards} disabled={shownView === "platt"} label="Rendera kort" hint={shownView === "platt" ? "Gäller 3D" : "Ritade kort i stället för filmens"} />
          </section>
          <section className="mt-auto flex flex-col gap-1.5 text-xs text-faint">
            <span className="flex items-center gap-1.5">
              <Kbd>Mellanslag</Kbd> spela, pausa
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> en ruta, även över ett klipp
            </span>
            <span>Dra i bilden för att luta, rulla för zoom, dubbelklicka för hemvy.</span>
          </section>
        </aside>
      </div>
    </Page>
  );
}
