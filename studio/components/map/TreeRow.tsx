"use client";

// The row at the top of Karta (Jakob 2026-11-23: "denna fula meny"; media first, short names, small numbers). One tab per
// tree of the dealer: the tree's rest picture (A1), its name, and a thin meter for its number against his measure (22/36); a
// tree that is being built has a dot, not a word. The choice is in the address (?trad=<id>), so a link opens a given tree.
// The dealer's compositions (several trees put together) are folded behind ONE button, "Kompositioner 3": it opens a short
// list, each with the pictures of its trees, its name and its number; one that is not played (trees with different hands,
// src/composition.ts handsProblem) has a stop mark with the reason as its title, and "Ny komposition" stands last. The
// composition that is open (?komposition=<id>, CompositionKarta) is a tab beside the trees for as long as it is open.
// Prova i Casino after the tabs opens the Casino with the dealer and the chosen tree (lib/casino.ts casinoAddress, ?trad=):
// the game plays that tree's films only, and a card without a film is laid without a hand (src/game-page.ts).
// Beside a tree's meter its talk, a count of its own (lib/tree-talk.ts): her lines with a talk film in the tree, "25/25".
import { Ban, ChevronDown, Layers, Play, Plus, Speech } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HANDS_WORD, compositionWord, handsProblem, type CompositionView } from "../../../src/composition.ts";
import { countWord, type TreeView } from "../../../src/dealer-trees.ts";
import { casinoAddress } from "@/lib/casino";
import { withDealer } from "@/lib/dealer";
import type { EntryAnswer } from "@/lib/media";
import { CASINO_PRESET } from "@/lib/scene-presets";
import { talkOf, type TreeTalk } from "@/lib/tree-talk";
import { buttonClasses, cn } from "@/components/ui";
import { coverOfEntry } from "../material/Tile";
import { ProofStill } from "../proofs";
import { useMedia } from "./useOlder";

const STATE_WORD: Record<string, string> = { byggs: "byggs", vilar: "vilar" };
/** The word in Karta's address for a composition that is not saved yet. */
export const NEW_COMPOSITION = "ny";

/** A tree in a line of text (Bordet's guide): its name, its number, and its state unless the game plays it. */
export const treeChip = (v: Pick<TreeView, "tree" | "count">): string => `${v.tree.name} ${countWord(v.count)}${STATE_WORD[v.tree.state] ? ` · ${STATE_WORD[v.tree.state]}` : ""}`;

const withName = (href: string, dealer: string): string => {
  const at = href.indexOf("?");
  return `${href.slice(0, at)}${withDealer(href.slice(at), dealer)}`;
};
/** The Casino with Casino's look, the dealer named and only the tree's films: /game/?forval=…&trad=tatuerad&dealer=paow. */
export const trialHref = (dealer: string, tree: string): string => withName(casinoAddress(CASINO_PRESET, {}, null, tree), dealer);
/** The same with a composition played: /game/?forval=…&komposition=casino-tatuerad&dealer=paow. */
export const compositionHref = (dealer: string, id: string): string => withName(casinoAddress(CASINO_PRESET, {}, null, null, id), dealer);

const tab = (on: boolean) =>
  cn(
    "inline-flex h-10 shrink-0 items-center gap-2 rounded-md border py-1 pl-1 pr-2.5 text-left transition-colors duration-150",
    on ? "border-brass/70 bg-brass/10 text-ink" : "border-transparent text-dim hover:bg-raised hover:text-ink",
  );

type Media = ReadonlyMap<string, EntryAnswer>;

/** A small picture of a Material entry (a tree's A1); a dashed box where the lab has none to give. */
function Thumb({ entry, className }: { entry: EntryAnswer | undefined; className?: string }) {
  const cover = entry ? coverOfEntry(entry) : null;
  return (
    <span className={cn("relative block h-7 w-[42px] shrink-0 overflow-hidden rounded-[3px]", cover ? "bg-well" : "border border-dashed border-line-strong", className)}>
      {cover ? <ProofStill cover={cover} fps={entry?.fps ?? 30} className="absolute inset-0" /> : null}
    </span>
  );
}

/** The pictures of a composition's trees, laid over each other. */
function Thumbs({ entries, media }: { entries: readonly (string | null)[]; media: Media }) {
  return (
    <span className="flex shrink-0 items-center">
      {entries.slice(0, 3).map((entry, i) => (
        <Thumb key={`${entry}${i}`} entry={entry ? media.get(entry) : undefined} className={cn("ring-1 ring-canvas", i > 0 && "-ml-5")} />
      ))}
    </span>
  );
}

/** n/36 as a thin bar and a small number. */
function Meter({ have, total, stopped = false }: { have: number; total: number; stopped?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative block h-[3px] w-11 overflow-hidden rounded-full bg-line-strong">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", stopped ? "bg-faint" : "bg-brass/85")} style={{ width: `${total ? (100 * have) / total : 0}%` }} />
      </span>
      <span className="text-[10px] leading-none tabular-nums text-faint">
        {have}/{total}
      </span>
    </span>
  );
}

/** The tree's talk beside its meter: a small speech mark and 25/25; light red where the game has no talk film in the tree. */
function TalkCount({ talk }: { talk: TreeTalk }) {
  return (
    <span className={cn("flex items-center gap-0.5 text-[10px] leading-none tabular-nums", talk.have ? "text-faint" : "text-[#ef8b8b]/80")}>
      <Speech aria-hidden className="size-2.5" />
      {talk.have}/{talk.total}
    </span>
  );
}

/** A name over its meter; mark: a dot or a stop mark after the name. */
function Words({ name, mark, children }: { name: string; mark?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-[5px]">
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium leading-tight">
        <span className="max-w-[150px] truncate">{name}</span>
        {mark}
      </span>
      {children}
    </span>
  );
}

const StopMark = () => <Ban aria-label="Spelas inte" className="size-3.5 shrink-0 text-underkand" />;

export function TreeRow({
  trees,
  chosen,
  onChoose,
  compositions,
  composition = null,
  onCompose,
}: {
  trees: readonly TreeView[];
  chosen: string;
  onChoose: (id: string) => void;
  /** The dealer's compositions, where the lab has them; with onCompose they get their button. */
  compositions?: readonly CompositionView[];
  /** The composition that is open (NEW_COMPOSITION: one that is not saved yet), else none. */
  composition?: string | null;
  onCompose?: (id: string) => void;
}) {
  const media = useMedia();
  const picked = composition ? null : (trees.find((v) => v.tree.id === chosen) ?? null);
  const open = composition ? (compositions?.find((c) => c.def.id === composition) ?? null) : null;
  const openStop = open ? handsProblem(open) : null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div role="radiogroup" aria-label="Träd" className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {trees.map((v) => {
          const on = !composition && v.tree.id === chosen;
          const shares = v.tree.shares ? trees.find((t) => t.tree.id === v.tree.shares)?.tree.name : null;
          const state = STATE_WORD[v.tree.state];
          const rest = v.nodes.find((n) => n.node === "IDLE")?.entry;
          const talk = talkOf(v);
          return (
            <button
              key={v.tree.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChoose(v.tree.id)}
              title={`${v.tree.name}${state ? ` (${state})` : ""}: ${v.count.have} av ${v.count.total} steg har en film (Primär, Godkänd eller Variant)${talk ? `; tal: ${talk.have} av ${talk.total} repliker har en talfilm` : ""}${shares ? `; spelar ${shares}s filmer, med filmen före spelet först` : ""}`}
              className={tab(on)}
            >
              <Thumb entry={rest ? media.get(rest) : undefined} />
              <Words name={v.tree.name} mark={state ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", v.tree.state === "byggs" ? "bg-anmarkning" : "border border-faint")} /> : null}>
                <span className="flex items-center gap-2">
                  <Meter have={v.count.have} total={v.count.total} />
                  {talk ? <TalkCount talk={talk} /> : null}
                </span>
              </Words>
            </button>
          );
        })}
        {composition ? (
          <button type="button" role="radio" aria-checked onClick={() => onCompose?.(composition)} title={openStop ?? (open ? `Komposition: ${open.trees.map((t) => `${t.name} ${Math.round(t.percent)} %`).join(", ")}` : "En komposition som inte är sparad än")} className={tab(true)}>
            {open ? (
              <>
                <Thumbs entries={open.trees.map((t) => t.rest)} media={media} />
                <Words name={open.def.name} mark={openStop ? <StopMark /> : null}>
                  <Meter have={open.count.have} total={open.count.total} stopped={!!openStop} />
                </Words>
              </>
            ) : (
              <span className="flex items-center gap-1.5 px-1.5 text-[12.5px] font-medium [&_svg]:size-3.5">
                <Plus /> Ny komposition
              </span>
            )}
          </button>
        ) : null}
      </div>
      {onCompose && compositions ? <CompositionMenu compositions={compositions} composition={composition} media={media} onCompose={onCompose} /> : null}
      {picked ? (
        <Link
          href={trialHref(picked.dealer, picked.tree.id)}
          className={buttonClasses({ variant: "quiet", size: "sm" })}
          title={`Spela ${picked.tree.name} i Casinot: bara trädets filmer (${countWord(picked.count)}), ett kort utan film läggs utan hand`}
        >
          <Play /> Prova i Casino
        </Link>
      ) : null}
    </div>
  );
}

const MENU_WIDTH = 312;

/** "Kompositioner 3": one button that opens the list of the dealer's compositions, with "Ny komposition" last. */
function CompositionMenu({ compositions, composition, media, onCompose }: { compositions: readonly CompositionView[]; composition: string | null; media: Media; onCompose: (id: string) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Where the list hangs: under the button, held inside the window. null: closed.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const toggle = () => {
    const box = button.current?.getBoundingClientRect();
    setAt(at || !box ? null : { left: Math.max(8, Math.min(box.left, window.innerWidth - MENU_WIDTH - 8)), top: box.bottom + 6 });
  };
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const outside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (list.current?.contains(target) || button.current?.contains(target))) return;
      close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      button.current?.focus();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [at]);
  const choose = (id: string) => {
    setAt(null);
    onCompose(id);
  };
  const row = (on: boolean) => cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150", on ? "bg-brass/10 text-ink" : "text-dim hover:bg-raised hover:text-ink");
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={toggle}
        title="Flera träd satta samman"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12.5px] font-medium transition-colors duration-150 [&_svg]:size-3.5",
          at ? "border-brass/70 bg-brass/10 text-ink" : "border-line-strong text-dim hover:border-[#4a5a51] hover:text-ink",
        )}
      >
        <Layers /> Kompositioner
        {compositions.length ? <span className="rounded-full bg-line-strong px-1.5 text-[10.5px] leading-[16px] tabular-nums text-ink">{compositions.length}</span> : null}
        <ChevronDown className={cn("transition-transform duration-150", at && "rotate-180")} />
      </button>
      {at
        ? createPortal(
            <div ref={list} role="menu" aria-label="Kompositioner" style={{ left: at.left, top: at.top, width: MENU_WIDTH }} className="fixed z-50 flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto rounded-lg border border-line-strong bg-surface p-1.5 shadow-pop">
              {compositions.map((c) => {
                // Trees with different hands are not put together (Jakob 2026-11-23): a saved one of that kind is kept, and marked.
                const stop = handsProblem(c);
                return (
                  <button
                    key={c.def.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={composition === c.def.id}
                    onClick={() => choose(c.def.id)}
                    title={stop ?? `${c.trees.map((t) => `${t.name} ${Math.round(t.percent)} %`).join(", ")}. ${compositionWord(c.count)} steg har en film, varav ${c.count.own} egna`}
                    className={row(composition === c.def.id)}
                  >
                    <Thumbs entries={c.trees.map((t) => t.rest)} media={media} />
                    <Words name={c.def.name}>
                      <Meter have={c.count.have} total={c.count.total} stopped={!!stop} />
                      {stop ? <span className="text-[11px] leading-tight text-underkand first-letter:uppercase">{HANDS_WORD}</span> : null}
                    </Words>
                    {stop ? <span className="ml-auto"><StopMark /></span> : null}
                  </button>
                );
              })}
              {compositions.length ? <span aria-hidden className="mx-2 my-1 h-px bg-line" /> : null}
              <button type="button" role="menuitemradio" aria-checked={composition === NEW_COMPOSITION} onClick={() => choose(NEW_COMPOSITION)} title="Sätt samman två eller fler träd" className={cn(row(composition === NEW_COMPOSITION), "text-[12.5px] font-medium [&_svg]:size-3.5")}>
                <span className="grid h-7 w-[42px] shrink-0 place-items-center rounded-[3px] border border-dashed border-line-strong">
                  <Plus />
                </span>
                Ny komposition
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
