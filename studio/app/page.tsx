"use client";

// Scen: the one view of the 3D scene (Jakob 2026-11-12: "/studio/ and /studio/scen/ should be the same thing", "exactly one
// view for how it looks when one can change things"; the other view, with the game switched on, is Casino). A round plays
// large in the lab's 3D scene, or as plain films ("Inte 3D"), with one transport; under it the round as a strip of its
// steps; over it the presets (Basgrund, Levande, Rumsstudien, his own); beside it one panel with two tabs: Runda (the
// rounds to play) and Scen (every key of the scene, grouped, searchable, each with its reset). One scene: the stage builds
// it and the editor (components/scene-editor) drives that same object. "Spela i Casino" opens the game with this look.
// The header says the round in Jakob's notation ("A1 - A2.1 - P4C1 - A1 · 3 steg · 8,5 s"), never file names.
// The address is the round and the look (components/scene-editor/address.ts): /?runda=<his notation>&vy=platt&forval=
// levande&dust=0.8; /?kant=<edge>&tagning=<take> plays that take where it belongs. A look that names no preset is
// Levande; the old /scen/ addresses lead here (app/scen/page.tsx). The round plays the chosen dealer's films (lib/bank.ts): a
// step locked to another dealer's take plays hers, a dealer other than Pamela opens on the ready round that plays most of her
// films, and the header says how many of the 33 she has; a step without a film is a gap, shown as one. The address's
// ?dealer= is kept as it stands when the page writes its round and look.
import { Box, Copy, ExternalLink, Film, Spade } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { resolveRound } from "../../src/clip-graph.ts";
import { RoundPicker, RoundStrip } from "@/components/round";
import { joinParts, readLook, roundPart, useSceneEditor } from "@/components/scene-editor";
import { BankStatus, Page } from "@/components/shell";
import { Stage, createClock, type StageHandle } from "@/components/stage";
import { ErrorState, IconButton, Kbd, SegmentedControl, Skeleton, Tabs, Tooltip, buttonClasses, cn, useToast } from "@/components/ui";
import { useBank } from "@/lib/bank";
import { stepFacts, useViewContext } from "@/lib/context";
import { DEALER_PARAM, DEFAULT_DEALER, filmsLine, openingRound, ownSteps, withDealer, withoutDealer } from "@/lib/dealer";
import { isSnapshot } from "@/lib/mode";
import { formatJakob } from "@/lib/names";
import { addressOf, contextRound, isReference, no3d, readAddress, readyRounds, roundFacts, roundFromText, roundParts, viewFor, type Round, type View } from "@/lib/rounds";

export default function ScenPage() {
  return (
    <Suspense fallback={<Page title="Scen" full />}>
      <Scen />
    </Suspense>
  );
}

const VIEWS = [
  { value: "3d" as const, label: "3D", icon: <Box />, title: "Filmen i 3D-scenen" },
  { value: "platt" as const, label: "Inte 3D", icon: <Film />, title: "Filmen som den är, på sin gröna" },
];
type Tab = "runda" | "scen";

function Scen() {
  // The address without the dealer's word: that word is the rail's, and a change of it is no new round or look.
  const query = withoutDealer(useSearchParams().toString()).slice(1);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const toast = useToast();
  const { graph, status, error, reload, dealer, dealers, owners } = useBank();
  const rounds = useMemo(() => readyRounds(), []);
  const [address, setAddress] = useState(() => readAddress(params));
  // The round's words of the address as they stand, until a round or the view is chosen here.
  const [roundText, setRoundText] = useState(() => roundPart(params));
  const [chosen, setChosen] = useState<Round | null>(null);
  const [view, setView] = useState<View>(address.view);
  const [tab, setTab] = useState<Tab>("runda");
  const [clock] = useState(() => createClock());
  const stage = useRef<StageHandle>(null);
  const editor = useSceneEditor(() => readLook(params));

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
      setRoundText(roundPart(params));
      editor.ask(readLook(params));
    }
  }

  const round = useMemo<Round | null>(() => {
    if (chosen) return chosen;
    const asked = address.asked;
    if (asked.kind === "runda") return roundFromText(asked.text, rounds);
    if (asked.kind === "kant") return graph ? contextRound(graph, asked.edge, asked.take) : null;
    // Pamela opens on her favourite; another dealer on the ready round that plays most of her films.
    if (graph && graph.dealer !== DEFAULT_DEALER) return openingRound(graph, rounds, owners) ?? rounds[0];
    return rounds[0];
  }, [chosen, address, graph, rounds, owners]);

  // The round waits for Jakob's placement plan (a seat's second card then knows how far its card moves), so that it does
  // not start once without it and again with it.
  const { places, placesRead } = editor;
  const segments = useMemo(
    () => (graph && placesRead && round?.steps.length ? resolveRound(graph, ownSteps(round.steps, graph.dealer, owners), { holeCardDown: true, places }) : []),
    [graph, placesRead, round, places, owners],
  );
  const parts = useMemo(() => roundParts(round, segments), [round, segments]);
  const notation = isReference(round) ? round.name : round?.steps.length ? formatJakob(round.steps) : "";
  const failed = status === "error" && !graph;
  // A reference film plays only as the film it is: "Inte 3D", with 3D unavailable while it is chosen.
  const shownView = viewFor(round, view);
  const flat = shownView === "platt";
  const blocked3d = no3d(round);
  const views = blocked3d ? VIEWS.map((v) => (v.value === "3d" ? { ...v, disabled: true, title: blocked3d } : v)) : VIEWS;
  const shownTab: Tab = flat ? "runda" : tab;
  // A dealer other than Pamela: how many of the films a whole round needs she has (the rest are gaps in the strip).
  const few = graph && dealer !== DEFAULT_DEALER ? filmsLine(graph, dealers.find((d) => d.id === dealer)?.name ?? dealer) : null;

  // The address follows the round and the look (a moment after the hand stops), so that the view can be sent as a link.
  const want = joinParts(roundText, editor.lookText);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (want === withoutDealer(window.location.search)) return;
      setWritten(want.slice(1));
      window.history.replaceState(null, "", `${window.location.pathname}${withDealer(want, new URLSearchParams(window.location.search).get(DEALER_PARAM))}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [want]);

  useViewContext({
    vy: "scen",
    val: { runda: notation, forval: editor.label, andrat: String(editor.count), visning: flat ? "Inte 3D" : "3D" },
    live: () => stepFacts(clock.get().pos, segments),
  });

  const copyLink = () => {
    // The link names the dealer: it opens her round wherever it is opened, whatever that browser remembers.
    const link = `${window.location.origin}${window.location.pathname}${withDealer(want, dealer)}`;
    void navigator.clipboard.writeText(link).then(
      () => toast({ tone: "ok", title: "Länken är kopierad", detail: "Den öppnar samma runda och samma look här i studion." }),
      () => toast({ tone: "bad", title: "Kunde inte kopiera", detail: link }),
    );
  };

  return (
    <Page
      title="Scen"
      full
      status={
        graph ? (
          <>
            <span className="min-w-0 truncate font-medium text-ink" title={notation}>
              {notation || "Ingen runda"}
            </span>
            {parts.length ? <span className="shrink-0">· {roundFacts(parts)}</span> : null}
            {few ? <span className="shrink-0 text-faint">· {few}</span> : null}
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
              setRoundText(addressOf(round, next).slice(1));
            }}
            options={views}
          />
          <Tooltip content="Spelet med spelmotorn och marker, i den här looken">
            <Link href={editor.casino} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <Spade />
              Spela i Casino
            </Link>
          </Tooltip>
          <IconButton label="Kopiera länken: samma runda och look" icon={<Copy />} variant="quiet" onClick={copyLink} />
          {!isSnapshot && editor.oldLab ? (
            <Tooltip content="Samma look på gamla labbets 3D-sida">
              <a href={editor.oldLab} aria-label="Öppna i gamla 3D-labbet" className={buttonClasses({ variant: "quiet", size: "sm", className: "px-2" })}>
                <ExternalLink />
              </a>
            </Tooltip>
          ) : null}
        </>
      }
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_clamp(296px,23vw,360px)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          {/* The presets apply to the 3D scene; in "Inte 3D" the bar stays where it is, dimmed, so that the picture does not jump. */}
          <div inert={flat} className={cn("transition-opacity duration-150", flat && "opacity-40")} title={flat ? "Förvalen gäller 3D" : undefined}>
            {editor.bar}
          </div>
          {failed ? (
            <ErrorState className="min-h-0 flex-1" title="Klippbanken kunde inte läsas" error={error} onRetry={() => void reload()} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col" {...editor.pointer}>
              <Stage
                ref={stage}
                className="min-h-0 flex-1"
                parts={parts}
                mode={shownView}
                clock={clock}
                initial={editor.initial}
                onScene={editor.onScene}
                onSceneChange={editor.onSceneChange}
              >
                {editor.comparing && !flat ? (
                  <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-brass/50 bg-black/70 px-4 py-1.5 text-sm font-semibold text-brass-hi shadow-pop backdrop-blur-sm">
                    Basgrund
                  </div>
                ) : null}
              </Stage>
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
              <p className="flex h-[92px] items-center px-5 text-sm text-faint">{graph && !placesRead ? "Läser placeringsplanen…" : "Välj en runda till höger, eller skriv en egen."}</p>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-l border-line bg-surface/50">
          <Tabs<Tab>
            label="Panelen"
            value={shownTab}
            onChange={setTab}
            items={[
              { value: "runda", label: "Runda" },
              { value: "scen", label: flat ? "Scen · gäller 3D" : "Scen", disabled: flat },
            ]}
            className="shrink-0 px-3"
          />
          {shownTab === "scen" ? (
            editor.panel
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4 pt-4">
              <RoundPicker
                rounds={rounds}
                current={round}
                problems={round?.errors ?? []}
                onPick={(next) => {
                  setChosen(next);
                  setRoundText(addressOf(next, view).slice(1));
                }}
              />
              <section className="mt-auto flex flex-col gap-1.5 text-xs text-faint">
                <span className="flex items-center gap-1.5">
                  <Kbd>Mellanslag</Kbd> spela, pausa
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd> en ruta, även över ett klipp
                </span>
                {flat ? null : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Kbd>B</Kbd> håll för basgrund
                    </span>
                    <span>Dra i bilden för att vrida, rulla för zoom, dubbelklicka för hemvy.</span>
                  </>
                )}
              </section>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}
