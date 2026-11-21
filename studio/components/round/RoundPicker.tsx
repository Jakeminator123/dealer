"use client";

// <RoundPicker rounds={readyRounds()} current={round} problems={round?.errors ?? []} onPick={(round) => …} />: the Runda tab.
// At the top "Bygg en runda" (Jakob 2026-11-17: "varför ska man inte få lägga in egna vägar utifrån vilka noder som
// finns"): the round as a path of chips in his notation, the same path as text in a field, in step both ways (typing fills
// the chips, a node pressed writes the text), and under it one button per node that can follow the last one. Which nodes
// can follow, and whether the bank has a film the round plays there, comes from the graph (lib/rounds.ts nextSteps); a step
// without one is dashed with "ingen film" and is not added (a click says why), and a path typed with one plays it as a gap,
// which the line under the field names. Ångra, Rensa, Spela. The path starts as the round on screen. Below it, small, the
// ready-made rounds as examples: each loads its path and plays it, and he can go on from there. At the bottom, folded,
// the reference films (the V6 film and the whole deals of the old public page): finished films, not rounds.
import { ChevronRight, Film, Play, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { WHY_LABEL, type Gap, type Graph } from "../../../src/clip-graph.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { edgeName, formatJakob, nodeCode, nodeName, takeName } from "../../lib/names.ts";
import {
  EMPTY_PATH,
  NO_FILM,
  addNode,
  isCard,
  isReference,
  lastNode,
  nextSteps,
  ownRound,
  pathNodes,
  pathOf,
  pathProblems,
  pathText,
  readPath,
  samePath,
  startNodes,
  stepGaps,
  stepWord,
  undoStep,
  type NextStep,
  type Path,
  type Round,
} from "../../lib/rounds.ts";
import { verdictOf } from "../../lib/verdict.ts";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { IconButton } from "../ui/IconButton";
import { TextField } from "../ui/TextField";

const HEADING = "text-2xs font-semibold uppercase tracking-[0.09em] text-faint";
const SEAT_ROWS = [1, 2].map((card) => ["P1", "P2", "P3", "P4", "P5", "P6", "P7"].map((seat) => `${seat}.C${card}`));
const DEALER_ROW = ["D.C1", "D.C2", "D.C3"];

/** A line under the field: what could not be read (bad), a step without a film (gap), or why a dashed node is not added (info). */
type Note = { text: string; tone: "bad" | "gap" | "info"; title?: string };

export function RoundPicker({
  rounds,
  current,
  problems = [],
  onPick,
  className,
}: {
  rounds: Round[];
  current: Round | null;
  /** What could not be read in the round on screen (from the address). */
  problems?: string[];
  onPick(round: Round): void;
  className?: string;
}) {
  const graph = useOptionalBank()?.graph ?? null;
  const examples = rounds.filter((r) => !/^P\d$/.test(r.name) && !isReference(r));
  const seats = rounds.filter((r) => /^P\d$/.test(r.name));
  const references = rounds.filter(isReference);

  // The builder holds the round on screen until he changes it, and again whenever another round comes on screen.
  const shownKey = current ? `${current.key}#${current.text}` : "";
  const [seen, setSeen] = useState(shownKey);
  const [draft, setDraft] = useState<Path | null>(null); // null: the round on screen
  const [typed, setTyped] = useState<string | null>(null); // null: the field shows the path
  const [said, setSaid] = useState<Note | null>(null);
  if (seen !== shownKey) {
    setSeen(shownKey);
    setDraft(null);
    setTyped(null);
    setSaid(null);
  }

  const onScreen = useMemo(() => pathOf(current), [current]);
  const path = draft ?? onScreen;
  const text = typed ?? pathText(path);
  const changed = typed !== null || !samePath(path, onScreen);
  const last = lastNode(path);
  const next = useMemo(() => (graph && last ? nextSteps(graph, last) : []), [graph, last]);
  const gaps = useMemo(() => (graph ? stepGaps(graph, path.steps) : []), [graph, path]);
  const holes = pathProblems(path.steps, gaps);

  const edit = (to: Path) => {
    setDraft(to);
    setTyped(null);
    setSaid(null);
  };
  const pick = (round: Round) => {
    setDraft(null);
    setTyped(null);
    setSaid(null);
    onPick(round);
  };
  const play = (p: Path) => {
    if (!p.steps.length) {
      setSaid({ text: p.head ? `Lägg till ett steg efter ${nodeCode(p.head)}.` : "Välj var rundan börjar.", tone: "bad" });
      return;
    }
    pick(ownRound(p.steps, rounds));
  };
  const submit = () => {
    if (typed === null) return play(path);
    const reference = references.find((r) => r.key === typed.trim().toLowerCase());
    if (reference) return pick(reference);
    // Nothing is guessed: a path with a word that could not be read is not played in part.
    const read = readPath(typed, graph);
    if (!read.path) return setSaid({ text: read.error ?? "Kunde inte läsa rundan.", tone: "bad" });
    play(read.path);
  };

  const note: Note | null =
    said ??
    (holes.length
      ? { text: `${holes[0]}, spelas som lucka${holes.length > 1 ? ` · ${holes.length - 1} steg till utan film` : ""}`, tone: "gap", title: holes.join("\n") }
      : !changed && problems.length
        ? { text: problems[0], tone: "bad", title: problems.join("\n") }
        : null);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <section aria-label="Bygg en runda" className="flex flex-col gap-2">
        <div className="flex items-center gap-0.5">
          <h2 className={cn(HEADING, "mr-auto")}>Bygg en runda</h2>
          <IconButton label="Ångra sista steget" icon={<Undo2 />} size="sm" disabled={!path.head} onClick={() => edit(undoStep(path))} />
          <IconButton label="Rensa" icon={<X />} size="sm" disabled={!path.head} onClick={() => edit(EMPTY_PATH)} />
        </div>
        <Chips path={path} gaps={gaps} />
        <form
          className="flex items-start gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            aria-label="Rundan i din notation"
            wrapperClassName="flex-1"
            placeholder="A1 - A2.1 - A3P4C1 - A2.1 - A1"
            value={text}
            onChange={(e) => {
              const value = e.target.value;
              setTyped(value);
              setSaid(null);
              // A path that reads fills the chips at once; one that does not yet waits for Spela to say why.
              const read = readPath(value, graph);
              if (read.path) setDraft(read.path);
            }}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={note?.tone === "bad" ? true : undefined}
          />
          <Button type="submit" variant={changed ? "primary" : "secondary"} icon={<Play />} disabled={!text.trim()}>
            Spela
          </Button>
        </form>
        {note ? (
          <p
            role={note.tone === "bad" ? "alert" : undefined}
            title={note.title}
            className={cn("text-xs", note.tone === "bad" ? "text-[#ef8b8b]" : note.tone === "gap" ? "text-[#f0b07a]" : "text-dim")}
          >
            {note.text}
          </p>
        ) : null}
        <NextNodes graph={graph} last={last} next={next} onAdd={(node) => {
          const route = next.find((n) => n.node === node)?.route;
          edit(route ? route.reduce((p, s) => addNode(p, s.to), path) : addNode(path, node));
        }} onMissing={(text) => setSaid({ text, tone: "info" })} />
      </section>

      <section aria-label="Exempel" className="flex flex-col gap-1.5">
        <h2 className={HEADING}>Exempel</h2>
        <div className="flex flex-wrap gap-1">
          {examples.map((round) => (
            <Example key={round.key} round={round} on={current?.key === round.key} onPick={pick} title={round.sub ?? formatJakob(round.steps)}>
              {round.name}
            </Example>
          ))}
        </div>
        {seats.length ? (
          <div className="flex items-center gap-1">
            <span className="mr-0.5 shrink-0 text-2xs text-faint">En plats</span>
            {seats.map((round) => (
              <Example key={round.key} round={round} on={current?.key === round.key} onPick={pick} title={formatJakob(round.steps)} className="flex-1 px-0 tabular-nums">
                {round.name}
              </Example>
            ))}
          </div>
        ) : null}
      </section>

      {references.length ? (
        <details className="group" open={isReference(current) || undefined}>
          <summary className={cn(HEADING, "inline-flex cursor-pointer list-none items-center gap-1 rounded-sm hover:text-ink [&::-webkit-details-marker]:hidden")}>
            <ChevronRight aria-hidden className="size-3.5 transition-transform duration-150 group-open:rotate-90" />
            Referensfilmer
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {references.map((round) => {
              const on = current?.key === round.key;
              return (
                <button
                  key={round.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(round)}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-md border border-dashed px-3 py-2 text-left transition-[border-color,background-color] duration-150",
                    on ? "border-brass/60 bg-brass/10" : "border-line-strong bg-transparent hover:border-brass/40 hover:bg-raised",
                  )}
                >
                  <span className={cn("flex items-center gap-1.5 text-sm font-semibold", on ? "text-brass-hi" : "text-ink")}>
                    <Film aria-hidden className="size-3.5 text-faint" />
                    {round.name}
                  </span>
                  <span className="text-xs text-dim">{round.sub}</span>
                </button>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** The path as chips: A1 → A2.1 → P4C1 → A2.1; the node it ends on (where the next step starts) in brass, a step without a film dashed. */
function Chips({ path, gaps }: { path: Path; gaps: readonly (Gap | null)[] }) {
  const nodes = pathNodes(path);
  if (!nodes.length) return null;
  return (
    <ol aria-label="Rundans väg" className="flex max-h-[136px] flex-wrap items-center gap-x-1 gap-y-1.5 overflow-y-auto">
      {nodes.map((n, i) => {
        const gap = n.step !== null ? (gaps[n.step] ?? null) : null;
        const end = i === nodes.length - 1;
        return (
          <li key={i} className="flex items-center gap-1">
            {i > 0 ? (
              <span aria-hidden className="text-xs text-faint">
                {n.broken ? "|" : "→"}
              </span>
            ) : null}
            <span
              title={gap && n.step !== null ? `Steg ${n.step + 1}: ${NO_FILM[gap]}` : nodeName(n.node)}
              className={cn(
                "rounded-sm border px-1.5 py-px text-xs font-semibold tabular-nums",
                gap ? "border-dashed border-underkand/55 text-[#ef8b8b]" : end ? "border-brass/60 bg-brass/10 text-brass-hi" : "border-line-strong bg-raised text-ink",
              )}
            >
              {nodeCode(n.node)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "Nästa steg": one button per node that can follow the last one (or "Börja i": where a round can start). Anchors as
 * buttons with what the film does (ingång, retur, vila …), the cards as the table's grid: P1–P7 for card 1 and 2 from the
 * camera's left, the dealer's under them. A step without a film is dashed; a click on it says why instead of adding it.
 */
function NextNodes({
  graph,
  last,
  next,
  onAdd,
  onMissing,
}: {
  graph: Graph | null;
  last: string | null;
  next: NextStep[];
  onAdd(node: string): void;
  onMissing(text: string): void;
}) {
  if (!graph) return <p className="text-xs text-faint">Läser banken…</p>;
  const start = !last;
  const items: { node: string; plays: boolean; word: string; title: string; why?: string; via?: string | null }[] = start
    ? startNodes(graph).map((node) => ({ node, plays: true, word: nodeName(node).replace(nodeCode(node), "").trim(), title: nodeName(node) }))
    : next.map((n) => ({
        node: n.node,
        plays: n.plays,
        via: n.via,
        word: n.via ? `via ${nodeCode(n.via)}` : n.plays ? stepWord(n.step) : "ingen film",
        title: n.plays ? `${playsTitle(graph, n)}${n.via ? ` · väg: ${formatJakob(n.route)}` : ''}` : `${edgeName(n.step)}: ${NO_FILM[n.gap ?? "MISSING"]}`,
        why: n.plays ? undefined : `${edgeName(n.step)}: ${NO_FILM[n.gap ?? "MISSING"]}.`,
      }));
  const anchors = items.filter((i) => !isCard(i.node));
  const cards = new Map(items.filter((i) => isCard(i.node)).map((i) => [i.node, i]));
  const press = (item: (typeof items)[number]) => (item.plays ? onAdd(item.node) : onMissing(item.why ?? item.title));

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <h3 className={HEADING}>{last ? `Nästa steg efter ${nodeCode(last)}` : "Börja i"}</h3>
      {!items.length ? <p className="text-xs text-faint">Inget steg går vidare härifrån.</p> : null}
      {anchors.length ? (
        <div className="flex flex-wrap gap-1">
          {anchors.map((item) => (
            <button
              key={item.node}
              type="button"
              aria-disabled={!item.plays || undefined}
              title={item.title}
              onClick={() => press(item)}
              className={cn(
                "flex min-w-[52px] flex-col items-start rounded-md border px-2 py-1 text-left transition-[border-color,background-color] duration-150",
                item.plays ? "border-line-strong bg-raised hover:border-brass/50 hover:bg-overlay" : "cursor-not-allowed border-dashed border-line-strong bg-transparent",
              )}
            >
              <span className={cn("text-sm font-semibold leading-5", item.plays ? "text-ink" : "text-faint")}>{nodeCode(item.node)}</span>
              {item.word ? <span className={cn("text-2xs", item.plays ? "text-dim" : "text-faint/80")}>{item.word}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {cards.size ? (
        <div className="grid grid-cols-7 gap-1">
          {[...SEAT_ROWS, DEALER_ROW].flatMap((row, r) =>
            row.map((node, c) => {
              const item = cards.get(node);
              const place = r === 2 ? (c === 0 ? "col-start-3" : "") : "";
              if (!item) return <span key={node} aria-hidden className={place} />;
              return (
                <button
                  key={node}
                  type="button"
                  aria-disabled={!item.plays || undefined}
                  aria-label={`${nodeCode(node)}${item.via ? ` via ${nodeCode(item.via)}` : ''}`}
                  title={item.title}
                  onClick={() => press(item)}
                  className={cn(
                    "h-7 rounded-sm border text-2xs font-semibold tabular-nums transition-[border-color,background-color,color] duration-150",
                    place,
                    item.plays ? "border-line-strong bg-raised text-ink hover:border-brass/50 hover:bg-overlay" : "cursor-not-allowed border-dashed border-line-strong text-faint/70",
                  )}
                >
                  {nodeCode(node)}{item.via ? " ↗" : ""}
                </button>
              );
            }),
          )}
        </div>
      ) : null}
      {items.some((i) => i.via) ? <p className="text-2xs text-dim">↗ Via annat ankare. Hela vägen läggs till när du väljer kortet.</p> : null}
      {items.some((i) => !i.plays) ? <p className="text-2xs text-faint">Streckad: ingen spelbar väg från detta ankare.</p> : null}
    </div>
  );
}

/** A node that plays, on hover: the step, the take the round plays there, its verdict, and why it is that one. */
function playsTitle(graph: Graph, n: NextStep): string {
  if (!n.take) return edgeName(n.step);
  const verdict = verdictOf(n.take);
  return [edgeName(n.step), takeName(n.take, graph.edge[n.take.edge]?.takes), `${verdict.sign} ${verdict.label}`, n.why === "SHARED" ? WHY_LABEL.SHARED : null].filter(Boolean).join(" · ");
}

/** An example: a small chip that loads its round's path into the builder and plays it. */
function Example({
  round,
  on,
  onPick,
  title,
  className,
  children,
}: {
  round: Round;
  on: boolean;
  onPick(round: Round): void;
  title: string;
  className?: string;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={() => onPick(round)}
      className={cn(
        "h-6 rounded-sm border px-2 text-xs transition-[border-color,background-color,color] duration-150",
        on ? "border-brass/60 bg-brass/12 text-brass-hi" : "border-line bg-surface text-dim hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
