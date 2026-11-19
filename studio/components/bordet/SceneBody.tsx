"use client";

// Bordet's live picture (modes Scen, Råfilm and Efterarbete), in the same frame as Kortplan: the toolbar on top, the stage as
// large as the window allows, one column on the right where things are changed. Since 2026-11-17 it is the whole of the
// view Scen (whose address / now leads here): a round plays large in the lab's 3D scene, or as the films are on their green
// (Råfilm), with one transport; under it the round as a strip of its steps; over it the presets (Basgrund, Levande,
// Rumsstudien, his own); in the column the rounds to play and every key of the scene (Scen), the rounds alone (Råfilm), or
// only what is laid over the film (Efterarbete: the cards' and chips' look, "Kort och marker", with the cards' bend and gloss
// in the plan). One scene: the stage builds it and the editor (components/scene-editor) drives that same object, so it
// stays when Scen and Efterarbete change places.
// The address is Scen's: the round (?runda=<his notation>, ?kant=<edge>&tagning=<take> to play a take where it belongs)
// and the look (?forval=levande&dust=0.8, components/scene-editor/address.ts), written beside Bordet's own words (lage,
// plats). Without a round in the address it plays the chosen card's deal and back from the anchor the game deals it from
// ("A2.1 - P4C1 - A2.1"; Paow's seat 6 "A2.2 - P6C1 - A2.2", lib/bordet.ts roundFor); without a look, Basgrund, what the
// game shows (Jakob 2026-11-17: "Spela i casino bör rimligtvis vara samma som i casino, alltså som det är i runtime"), so
// "Spela i Casino" opens what the rail's Casino opens until a key
// is changed. The round plays the chosen dealer's films (lib/bank.ts); a step without a film is a gap, shown as one.
// Loaded only when one of the three is chosen (Bordet loads it on demand), so that Kortplan stays light.
import { Copy, ExternalLink, Spade } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolveRound } from "../../../src/clip-graph.ts";
import { tableGeometry } from "../../../src/card-plan.ts";
import { sceneWords } from "../../lib/bordet.ts";
import { useBank } from "../../lib/bank.ts";
import { readGeometryWord, withGeometry } from "../../lib/casino.ts";
import { stepFacts, useViewContext } from "../../lib/context.ts";
import { BANK_DEALER, filmsLine, openingRound, ownSteps, withDealer } from "../../lib/dealer.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { formatJakob } from "../../lib/names.ts";
import { addressOf, contextRound, isReference, no3d, readAddress, readyRounds, roundFacts, roundFromText, roundParts, viewFor, type Round } from "../../lib/rounds.ts";
import { BASE } from "../../lib/scene-presets.ts";
import { readSceneCardTrial, withSceneCardTrial } from "../../lib/scene-card-trial.ts";
import { RoundPicker, RoundStrip } from "../round";
import { joinParts, readLook, roundPart, useSceneEditor } from "../scene-editor";
import { Stage, createClock, type StageHandle } from "../stage";
import { ErrorState, IconButton, Skeleton, Tooltip, buttonClasses, cn, useToast } from "../ui";

export type SceneKind = "scen" | "rafilm" | "efterarbete";

/** Scen's words of an address (the round's and the look's), without Bordet's own; a look that names none is Basgrund here. */
function scenePart(all: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  all.forEach((value, key) => {
    if (sceneWords.has(key) && key !== "vy") p.append(key, value);
  });
  return p;
}

export function SceneBody({ kind, toolbar, roundText: cardRound }: { kind: SceneKind; toolbar: ReactNode; roundText: string }) {
  const search = useSearchParams();
  const geometri = readGeometryWord(search);
  const searchText = search.toString();
  const query = scenePart(new URLSearchParams(searchText)).toString();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const toast = useToast();
  const { graph, status, error, reload, dealer, dealers, owners } = useBank();
  const rounds = useMemo(() => readyRounds(), []);
  const lookOf = (p: URLSearchParams) => readLook([...p.keys()].some((k) => k !== "runda" && k !== "kant" && k !== "tagning" && k !== "robot") ? p : new URLSearchParams({ forval: BASE }));
  const [address, setAddress] = useState(() => readAddress(params));
  // The round's words of the address as they stand, until a round is chosen here.
  const [roundText, setRoundText] = useState(() => new URLSearchParams(roundPart(params)).toString());
  const [chosen, setChosen] = useState<Round | null>(null);
  const [clock] = useState(() => createClock());
  const stage = useRef<StageHandle>(null);
  const editor = useSceneEditor(() => lookOf(params));

  // The address changed from outside (a link, back and forth in the history): it decides again. What this body wrote itself
  // is already on screen.
  const [seen, setSeen] = useState(query);
  const [written, setWritten] = useState<string | null>(null);
  if (query !== seen) {
    setSeen(query);
    if (query !== written) {
      setAddress(readAddress(params));
      setChosen(null);
      setRoundText(new URLSearchParams(roundPart(params)).toString());
      editor.ask(lookOf(params));
    }
  }

  const round = useMemo<Round | null>(() => {
    if (chosen) return chosen;
    const asked = address.asked;
    if (asked.kind === "runda") return roundFromText(asked.text, rounds);
    if (asked.kind === "kant") return graph ? contextRound(graph, asked.edge, asked.take) : null;
    // No round asked: the chosen card's deal and back; a dealer other than Pamela with no film there: the ready round that
    // plays most of her films.
    const own = roundFromText(cardRound, rounds);
    if (!own.errors.length || !graph || graph.dealer === BANK_DEALER) return own;
    return openingRound(graph, rounds, owners) ?? own;
  }, [chosen, address, graph, rounds, owners, cardRound]);

  const { plan, places, placesRead } = editor;
  const segments = useMemo(
    () => (graph && placesRead && round?.steps.length ? resolveRound(graph, ownSteps(round.steps, graph.dealer, owners), { holeCardDown: true, places }) : []),
    [graph, placesRead, round, places, owners],
  );
  const parts = useMemo(() => {
    const parts = roundParts(round, segments), words = readSceneCardTrial(new URLSearchParams(searchText));
    return plan ? withSceneCardTrial(parts, segments, plan, tableGeometry(searchText), words ?? {}, words ? "film" : null) : parts;
  }, [round, segments, plan, searchText]);
  const notation = isReference(round) ? round.name : round?.steps.length ? formatJakob(round.steps) : "";
  const mode = viewFor(round, kind === "rafilm" ? "platt" : "3d");
  const flat = mode === "platt";
  const blocked3d = kind !== "rafilm" ? no3d(round) : null;
  const few = graph && dealer !== BANK_DEALER ? filmsLine(graph, dealers.find((d) => d.id === dealer)?.name ?? dealer) : null;

  // The address follows the round and the look (a moment after the hand stops), beside Bordet's own words.
  const want = joinParts(roundText, editor.lookText);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      for (const key of [...p.keys()]) if (sceneWords.has(key) && key !== "robot") p.delete(key);
      new URLSearchParams(want).forEach((value, key) => {
        if (key !== "robot" && key !== "vy") p.set(key, value);
      });
      const next = p.toString();
      if (next === window.location.search.slice(1)) return;
      setWritten(scenePart(p).toString());
      window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [want]);

  useViewContext({
    vy: "bordet",
    val: { läge: kind === "rafilm" ? "Råfilm" : kind === "efterarbete" ? "Efterarbete" : "Scen", runda: notation, forval: editor.label, andrat: String(editor.count) },
    live: () => stepFacts(clock.get().pos, segments),
  });

  const copyLink = () => {
    // The link names the dealer: it opens her round wherever it is opened, whatever that browser remembers.
    const link = `${window.location.origin}${window.location.pathname}${withDealer(window.location.search, dealer)}`;
    void navigator.clipboard.writeText(link).then(
      () => toast({ tone: "ok", title: "Länken är kopierad", detail: "Den öppnar samma runda och samma look här i studion." }),
      () => toast({ tone: "bad", title: "Kunde inte kopiera", detail: link }),
    );
  };
  const pick = (next: Round) => {
    setChosen(next);
    setRoundText(addressOf(next, "3d").slice(1));
  };

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-line px-3">
          {toolbar}
          <span data-round className="min-w-0 truncate text-sm text-dim" title={notation}>
            <span className="font-medium text-ink">{notation || "Ingen runda"}</span>
            {parts.length ? ` · ${roundFacts(parts)}` : ""}
            {few ? <span className="text-faint"> · {few}</span> : null}
          </span>
          {blocked3d ? (
            <span className="shrink-0 text-xs text-faint" title={blocked3d}>
              Färdig film: bara Råfilm
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Tooltip content="Spelet med spelmotorn och marker, i den här looken">
              <Link href={withGeometry(editor.casino, geometri)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Spade />
                Spela i Casino
              </Link>
            </Tooltip>
            <IconButton label="Kopiera länken: samma runda och look" icon={<Copy />} variant="quiet" size="sm" onClick={copyLink} />
            {!isSnapshot && editor.scenePage ? (
              <Tooltip content="Samma look på 3D-sidan, med alla reglage">
                <a href={withGeometry(editor.scenePage, geometri)} className={buttonClasses({ variant: "quiet", size: "sm" })}>
                  <ExternalLink />
                  3D-sidan
                </a>
              </Tooltip>
            ) : null}
          </div>
        </div>
        {/* The presets apply to the 3D scene; in Råfilm the bar stays where it is, dimmed, so that the picture does not jump. */}
        <div inert={flat} className={cn("shrink-0 transition-opacity duration-150", flat && "opacity-40")} title={flat ? "Förvalen gäller 3D" : undefined}>
          {editor.bar}
        </div>
        {status === "error" && !graph ? (
          <ErrorState className="min-h-0 flex-1" title="Klippbanken kunde inte läsas" error={error} onRetry={() => void reload()} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col" {...editor.pointer}>
            {/* The renderer reads the geometry when the scene is created. */}
            <Stage key={geometri} ref={stage} className="min-h-0 flex-1" parts={parts} mode={mode} clock={clock} initial={editor.initial} onScene={editor.onScene} onSceneChange={editor.onSceneChange}>
              {editor.comparing && !flat ? (
                <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-brass/50 bg-black/70 px-4 py-1.5 text-sm font-semibold text-brass-hi shadow-pop backdrop-blur-sm">Basgrund</div>
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
            <p className="flex h-[92px] items-center px-5 text-sm text-faint">{graph && !placesRead ? "Läser kortplanen…" : "Välj en runda till höger."}</p>
          )}
        </div>
      </div>
      <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
        {kind === "efterarbete" ? (
          // only what is laid over the film: the cards' and chips' look, with the cards' bend and gloss in the plan
          <div className="min-h-0 flex-1 overflow-y-auto">{editor.afterwork ?? <Skeleton className="m-4 h-10 rounded-md" />}</div>
        ) : kind === "scen" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line px-4 py-3">
              <RoundPicker rounds={rounds} current={round} problems={round?.errors ?? []} onPick={pick} />
            </div>
            {editor.panel}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <RoundPicker rounds={rounds} current={round} problems={round?.errors ?? []} onPick={pick} />
          </div>
        )}
      </aside>
    </div>
  );
}
