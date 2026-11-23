"use client";

// Karta's Komposition (Jakob 2026-11-23: "kombinera två eller fler nodträd ... som ett större nodträd"; "'A2.3'-klippet ska
// göras 20% och 80% A2.1"). He picks the trees, sets each tree's share and how two trees meet (the same picture, a bridge
// film, a plain cut, or not at all), and sees at once what each of the 36 steps is covered by: the film that plays, a bar
// with the trees' shares, and a mark when the step is played with the seat's film (återbruk), borrowed from another tree
// (lånat) or missing. A step opens its films, where a variant gets a share of its own, and for each tree that lacks the
// step's own film "Beställ till <träd>" (Bordet's guide Ny film on that tree and step, lib/new-film.ts guideHref). Spara writes
// data/dealer-compositions.json through the lab (tools/dealer-composition.ts); Prova i Casino plays the saved composition
// (?komposition=<id>). The rules, and the words, are src/composition.ts; this file only draws them.
// The address: /karta/?komposition=<id> (ny: a new one).
import { ArrowLeftRight, CornerDownRight, Hand, Play, Repeat, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { buildGraph, type Graph } from "../../../src/clip-graph.ts";
import {
  checkComposition,
  compositionView,
  compositionWord,
  linkOf,
  type BridgeDef,
  type CompositionAnswer,
  type CompositionDef,
  type CompositionView,
  type Cover,
  type CoverPart,
  stepKey as coverKey,
} from "../../../src/composition.ts";
import { nodeCode, type StepKind, type TreeAnswer } from "../../../src/dealer-trees.ts";
import { Page } from "@/components/shell";
import { TakeThumb } from "@/components/takes";
import { Button, EmptyState, Select, Skeleton, Slider, Switch, buttonClasses, cn, useToast } from "@/components/ui";
import { useBank } from "@/lib/bank";
import type { EntryAnswer } from "@/lib/media";
import { guideHref } from "@/lib/new-film";
import { ProofStill } from "../proofs";
import { coverOfEntry } from "../material/Tile";
import { RowStill } from "./RowStill";
import { NEW_COMPOSITION, TreeRow, compositionHref } from "./TreeRow";
import { removeComposition, saveComposition, useCompositions } from "./useCompositions";
import { useMedia } from "./useOlder";

/** One colour per tree, in the order of the dealer's trees: the bars under the steps and the dots beside the names. */
const TREE_COLORS = ["#d9b96a", "#7f9cf5", "#4fb27f", "#e39b5b"];

/** An id from a name: "Casino + Tatuerad" is "casino-tatuerad". */
const slug = (name: string): string =>
  name.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const pairKey = (a: string, b: string) => [a, b].sort().join("|");
const percentWord = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} %`;

type Set = (patch: Record<string, string | null>) => void;

export function CompositionKarta({ answer, id, set }: { answer: TreeAnswer; id: string; set: Set }) {
  const { bank, dealer, readAt } = useBank();
  const compositions = useCompositions(dealer, readAt);
  const graph = useMemo(() => (bank ? buildGraph(bank, { mode: "CARD", dealer }) : null), [bank, dealer]);
  const got = compositions.answer;
  const saved = got?.compositions.find((c) => c.def.id === id) ?? null;
  const status = (
    <TreeRow
      trees={answer.trees}
      chosen=""
      onChoose={(tree) => set({ komposition: null, trad: tree, steg: null, kant: null, tagning: null, vag: null })}
      compositions={got?.compositions ?? []}
      composition={id}
      onCompose={(next) => set({ komposition: next, steg: null })}
    />
  );
  return (
    <Page title="Karta" full status={status}>
      {got ? (
        <Editor key={`${got.dealer}:${id}:${saved ? JSON.stringify(saved.def) : "ny"}`} trees={answer} got={got} saved={saved} graph={graph} dealer={answer.dealer} set={set} reload={compositions.reload} />
      ) : compositions.state === "loading" ? (
        <div className="grid h-full place-items-center p-10">
          <Skeleton className="h-[60%] w-[80%]" />
        </div>
      ) : (
        <EmptyState title="Kompositioner finns inte här än">{compositions.error ?? "Labbservern behöver startas om för att kunna läsa dem."}</EmptyState>
      )}
    </Page>
  );
}

// ── The editor ──────────────────────────────────────────────────────────────
/** A new composition: the tree with rest films and the next one, 80 and 20, meeting where a saved composition already has a bridge film. */
function firstDraft(got: CompositionAnswer, films: ReadonlyMap<string, BridgeDef>): CompositionDef {
  const [first, second] = [...got.trees].sort((a, b) => Number(b.restFilms) - Number(a.restFilms));
  const trees = [first, second].filter(Boolean).map((t, i) => ({ tree: t.tree, share: i ? 20 : 80 }));
  const bridge = first?.rest && second?.rest ? films.get(pairKey(first.rest, second.rest)) : undefined;
  // A name no saved composition has, so that a new one can be saved as it stands.
  const base = [first, second].filter(Boolean).map((t) => t.name).join(" + "), names = new Set(got.compositions.map((c) => c.def.name));
  let name = base;
  for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
  return { id: "", name, trees, ...(bridge ? { bridges: [bridge] } : {}) };
}

function Editor({ trees, got, saved, graph, dealer, set, reload }: { trees: TreeAnswer; got: CompositionAnswer; saved: CompositionView | null; graph: Graph | null; dealer: string; set: Set; reload: () => void }) {
  const toast = useToast();
  const media = useMedia();
  // The bridge films the dealer's saved compositions already use, by the two pictures: what "Brygga" can choose.
  const films = useMemo(() => new Map(got.compositions.flatMap((c) => c.def.bridges ?? []).filter((b) => b.ab || b.ba).map((b) => [pairKey(b.a, b.b), b] as const)), [got]);
  const [draft, setDraft] = useState<CompositionDef>(() => saved?.def ?? firstDraft(got, films));
  const [stepKey, setStepKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const taken = useMemo(() => new Set([...trees.trees.map((v) => v.tree.id), ...got.compositions.map((c) => c.def.id), NEW_COMPOSITION]), [trees, got]);
  const id = saved ? saved.def.id : slug(draft.name);
  const def: CompositionDef = { ...draft, id };
  const view = useMemo(() => compositionView({ ...draft, id: id || NEW_COMPOSITION }, trees.trees, got.takes), [draft, id, trees, got]);
  const problems = [...checkComposition(def, trees.trees.map((v) => v.tree.id)), ...(!saved && taken.has(id) ? [`"${id}" finns redan: välj ett annat namn.`] : [])];
  const dirty = !saved || JSON.stringify(saved.def) !== JSON.stringify(def);
  const colorOf = (tree: string) => TREE_COLORS[Math.max(0, got.trees.findIndex((t) => t.tree === tree)) % TREE_COLORS.length];
  const nameOf = (tree: string) => got.trees.find((t) => t.tree === tree)?.name ?? tree;
  const step = view.steps.find((s) => s.key === stepKey) ?? null;
  // The composition's trees (not resting) whose own step has no film: "Beställ till <träd>" opens Bordet's guide on it.
  const orderLinks = step
    ? view.trees
        .filter((t) => t.share > 0 && t.state !== "vilar")
        .flatMap((t) => {
          const s = trees.trees.find((v) => v.tree.id === t.tree)?.steps.find((x) => coverKey(x) === step.key && x.state === "saknas");
          return s ? [{ tree: t.tree, href: guideHref(dealer, t.tree, { from: s.from, to: s.to }, saved?.def.id ?? null) }] : [];
        })
    : [];

  const setShare = (tree: string, share: number | null) =>
    setDraft((d) => ({ ...d, trees: share === null ? d.trees.filter((t) => t.tree !== tree) : d.trees.some((t) => t.tree === tree) ? d.trees.map((t) => (t.tree === tree ? { ...t, share } : t)) : [...d.trees, { tree, share }] }));
  const setJoin = (a: string, b: string, how: string) =>
    setDraft((d) => {
      const others = (d.bridges ?? []).filter((x) => pairKey(x.a, x.b) !== pairKey(a, b));
      const bridges = how === "film" && films.get(pairKey(a, b)) ? [...others, films.get(pairKey(a, b))!] : how === "klipp" ? [...others, { a, b }] : others;
      const next: CompositionDef = { ...d, bridges };
      if (!bridges.length) delete next.bridges;
      return next;
    });
  // A film's share among its step's films. The first share set on a step gives the rest to the step's best film, so 20 on a variant is 80/20.
  const setFilm = (part: CoverPart, film: string, share: number) =>
    setDraft((d) => {
      const shares = { ...(d.shares ?? {}) };
      const best = part.films.find((f) => f.percent === 100 && !part.films.some((x) => (shares[x.id] ?? 0) > 0))?.id;
      if (best && best !== film) shares[best] = Math.max(0, 100 - share);
      shares[film] = share;
      for (const key of Object.keys(shares)) if (!(shares[key] > 0)) delete shares[key];
      const next: CompositionDef = { ...d, shares };
      if (!Object.keys(shares).length) delete next.shares;
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      await saveComposition(dealer, def);
      toast({ tone: "ok", title: "Sparat", detail: `${def.name} ${compositionWord(view.count)}` });
      reload();
      if (!saved) set({ komposition: def.id });
    } catch (e) {
      toast({ tone: "bad", title: "Kompositionen sparades inte", detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!saved) return;
    setBusy(true);
    try {
      await removeComposition(dealer, saved.def.id);
      toast({ tone: "ok", title: "Borttagen", detail: saved.def.name });
      reload();
      set({ komposition: null });
    } catch (e) {
      toast({ tone: "bad", title: "Kompositionen togs inte bort", detail: e instanceof Error ? e.message : String(e) });
      setBusy(false);
    }
  };

  const inside = view.trees;
  const pairs = inside.flatMap((a, i) => inside.slice(i + 1).map((b) => [a, b] as const));
  return (
    <div className="absolute inset-0 flex min-h-0 gap-6 overflow-auto p-6">
      {/* ── left: the trees, their shares and where they meet ── */}
      <div className="flex w-[340px] shrink-0 flex-col gap-5">
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, 60) }))}
          aria-label="Kompositionens namn"
          placeholder="Namn"
          className="w-full rounded-md border border-line-strong bg-well px-3 py-2 font-display text-lg font-semibold text-ink placeholder:text-faint focus:border-brass/70 focus-visible:outline-none"
        />

        <div className="flex flex-col gap-3">
          {got.trees.map((t) => {
            const mine = draft.trees.find((x) => x.tree === t.tree);
            const shown = view.trees.find((x) => x.tree === t.tree);
            return (
              <div key={t.tree} className={cn("rounded-lg border p-3 transition-opacity", mine ? "border-line-strong bg-surface" : "border-line opacity-60")}>
                <div className="flex items-center gap-2.5">
                  <Still entry={t.rest ? media.get(t.rest) : undefined} code="A1" />
                  <Still entry={t.shoe ? media.get(t.shoe) : undefined} code={nodeCode(t.hub)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(t.tree) }} />
                      <span className="truncate">{t.name}</span>
                    </div>
                    <div className="text-xs tabular-nums text-dim">
                      {t.have}/36{view.home === t.tree ? " · vilar här" : ""}
                    </div>
                  </div>
                  <Switch size="sm" checked={!!mine} onChange={(on) => setShare(t.tree, on ? (draft.trees.length ? 20 : 100) : null)} aria-label={`${t.name} med i kompositionen`} />
                </div>
                {mine ? (
                  <Slider
                    className="mt-2.5"
                    label={mine.share > 0 ? "Andel" : "Lånar bara ut"}
                    value={mine.share}
                    onChange={(share) => setShare(t.tree, share)}
                    min={0}
                    max={100}
                    step={5}
                    format={() => (shown ? percentWord(shown.percent) : "")}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {pairs.map(([a, b]) => (
          <div key={`${a.tree}-${b.tree}`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center gap-1.5 text-xs text-dim">
              <ArrowLeftRight className="size-3.5" /> {a.name} möter {b.name}
            </div>
            <Meet word="I vilan" a={a.rest} b={b.rest} codes={["A1", "A1"]} media={media} bridges={draft.bridges} film={!!(a.rest && b.rest && films.get(pairKey(a.rest, b.rest)))} onChange={(how) => a.rest && b.rest && setJoin(a.rest, b.rest, how)} />
            <Meet word="Vid skon" a={a.shoe} b={b.shoe} codes={[nodeCode(a.hub), nodeCode(b.hub)]} media={media} bridges={draft.bridges} film={!!(a.shoe && b.shoe && films.get(pairKey(a.shoe, b.shoe)))} onChange={(how) => a.shoe && b.shoe && setJoin(a.shoe, b.shoe, how)} />
          </div>
        ))}

        {view.looks.length > 1 ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-anmarkning/60 bg-anmarkning/10 p-3 text-sm text-ink">
            <Hand className="size-4 shrink-0 text-anmarkning" />
            <span className="min-w-0 flex-1">Händerna skiljer mellan träden i samma runda</span>
            <span className="flex shrink-0 gap-1">
              {view.looks.map((entry) => (
                <Still key={entry} entry={media.get(entry)} code="" />
              ))}
            </span>
          </div>
        ) : null}

        <div className="flex items-end gap-3">
          <div>
            <div className="font-display text-3xl font-semibold tabular-nums text-ink">{compositionWord(view.count)}</div>
            <div className="text-xs text-dim">spelbart · varav egna {view.count.own}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {saved ? <Button variant="quiet" size="sm" icon={<Trash2 />} disabled={busy} onClick={() => void remove()} aria-label="Ta bort kompositionen" title="Ta bort kompositionen" /> : null}
            <Button variant={dirty ? "primary" : "secondary"} icon={<Save />} loading={busy} disabled={!dirty || problems.length > 0} onClick={() => void save()}>
              Spara
            </Button>
          </div>
        </div>
        {saved && !dirty ? (
          <Link href={compositionHref(dealer, saved.def.id)} className={buttonClasses({ variant: "secondary" })} title={`Spela ${saved.def.name} i Casinot`}>
            <Play /> Prova i Casino
          </Link>
        ) : (
          <span className="text-xs text-dim">{problems[0] ?? "Spara, så kan den provas i Casinot."}</span>
        )}
        {view.problems.map((p) => (
          <span key={p} className="text-xs text-[#ef8b8b]">
            {p}
          </span>
        ))}
      </div>

      {/* ── right: the 36 steps and what covers each ── */}
      <div className="flex min-w-[720px] flex-1 flex-col gap-4">
        <Marks />
        <div className="grid grid-cols-8 gap-2">
          {(["vila", "ingang", "utgang", "halkort"] as StepKind[]).map((kind) => {
            const s = view.steps.find((x) => x.kind === kind)!;
            return <Tile key={s.key} step={s} label={s.name} graph={graph} colorOf={colorOf} active={s.key === stepKey} onPick={() => setStepKey(s.key === stepKey ? null : s.key)} className="col-span-2" />;
          })}
        </div>
        <div className="grid grid-cols-[52px_repeat(8,minmax(0,1fr))] items-center gap-x-2 gap-y-1.5">
          <span />
          {["P1", "P2", "P3", "P4", "P5", "P6", "P7", "Dealern"].map((seat) => (
            <span key={seat} className="text-center text-xs font-medium text-dim">
              {seat}
            </span>
          ))}
          {(["giv", "retur"] as StepKind[]).flatMap((kind) =>
            [1, 2].map((n) => (
              <Row key={`${kind}${n}`} label={`${kind === "giv" ? "Giv" : "Retur"} ${n}`}>
                {["P1", "P2", "P3", "P4", "P5", "P6", "P7", "D"].map((seat) => {
                  const s = view.steps.find((x) => x.key === `${kind}:${seat}.C${n}`)!;
                  return <Tile key={s.key} step={s} graph={graph} colorOf={colorOf} active={s.key === stepKey} onPick={() => setStepKey(s.key === stepKey ? null : s.key)} />;
                })}
              </Row>
            )),
          )}
        </div>
        {step ? <StepFilms step={step} graph={graph} colorOf={colorOf} nameOf={nameOf} reuse={got.reuse} orders={orderLinks} held={dirty} onShare={setFilm} onOpen={(tree, edge, take) => set({ komposition: null, trad: tree, steg: null, kant: edge, tagning: take })} /> : null}
        <Reuse rows={got.reuse} />
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────
function Still({ entry, code }: { entry: EntryAnswer | undefined; code: string }) {
  const cover = entry ? coverOfEntry(entry) : null;
  return (
    <span className={cn("relative block h-10 w-[60px] shrink-0 overflow-hidden rounded-sm", cover ? "border border-line-strong bg-well" : "border border-dashed border-line-strong")} title={entry?.name ?? code}>
      {cover ? <ProofStill cover={cover} fps={entry?.fps ?? 30} className="absolute inset-0" /> : null}
      {code ? <span className={cn("absolute bottom-0.5 left-0.5 rounded-xs px-1 text-[10px] font-semibold leading-[14px]", cover ? "bg-black/65 text-ink" : "text-dim")}>{code}</span> : null}
    </span>
  );
}

/** How two trees meet at one place: their two pictures, and the choice between them. The same picture needs none. */
function Meet({ word, a, b, codes, media, bridges, film, onChange }: { word: string; a: string | null; b: string | null; codes: [string, string]; media: ReadonlyMap<string, EntryAnswer>; bridges: readonly BridgeDef[] | undefined; film: boolean; onChange: (how: string) => void }) {
  const link = linkOf(bridges, a, b);
  const how = link === "same" ? "samma" : link ? (link.film ? "film" : "klipp") : "ingen";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-dim">{word}</span>
      <Still entry={a ? media.get(a) : undefined} code={codes[0]} />
      <Still entry={b ? media.get(b) : undefined} code={codes[1]} />
      {how === "samma" ? (
        <span className="text-xs text-godkand">samma bild</span>
      ) : (
        <Select
          size="sm"
          className="min-w-0 flex-1"
          aria-label={`${word}: hur träden möts`}
          value={how}
          onChange={onChange}
          options={[
            { value: "ingen", label: "Möts inte" },
            { value: "klipp", label: "Rent klipp" },
            { value: "film", label: "Brygga 0,2 s", disabled: !film, hint: film ? undefined : "ingen film" },
          ]}
        />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-xs text-dim">{label}</span>
      {children}
    </>
  );
}

const MARK: Record<string, { icon: ReactNode; word: string }> = {
  aterbruk: { icon: <Repeat />, word: "återbruk: platsens film, kortet ritat på sin plats" },
  lanat: { icon: <CornerDownRight />, word: "lånat: ett träd saknar steget och lånar det" },
};

function Marks() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dim">
      {Object.entries(MARK).map(([key, m]) => (
        <span key={key} className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">
          {m.icon} {m.word}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 rounded-xs border border-dashed border-underkand/70" /> saknas: kortet läggs utan hand
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full bg-variant" /> variant med egen andel
      </span>
    </div>
  );
}

/** A step: the film that plays it most, the trees' shares as a bar, and its mark. */
function Tile({ step, label, graph, colorOf, active, onPick, className }: { step: Cover; label?: string; graph: Graph | null; colorOf: (tree: string) => string; active: boolean; onPick: () => void; className?: string }) {
  const part = [...step.parts].sort((a, b) => b.percent - a.percent)[0];
  const film = part ? [...part.films].sort((a, b) => b.percent - a.percent)[0] : undefined;
  const take = film && graph ? graph.takes[film.id] : undefined;
  const mark = MARK[step.state];
  const title = `${step.name}: ${step.parts.length ? step.parts.map((p) => `${p.tree} ${percentWord(p.percent)}${p.how === "aterbruk" ? " (återbruk)" : ""}`).join(", ") : "saknas"}${step.lacking.length ? ` · ${step.lacking.join(", ")} lånar` : ""}`;
  return (
    <button type="button" onClick={onPick} title={title} aria-pressed={active} className={cn("group/tile flex min-w-0 flex-col gap-1 rounded-md text-left focus-visible:outline-offset-2", className)}>
      <span className={cn("relative block aspect-[3/2] w-full overflow-hidden rounded-md border", step.parts.length ? "border-line-strong bg-well" : "border-dashed border-underkand/70", active && "ring-2 ring-brass/70")}>
        {take ? <TakeThumb take={take} still="film" className="absolute inset-0" /> : null}
        {mark ? <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-black/65 text-ink [&_svg]:size-3">{mark.icon}</span> : null}
        {step.variants ? <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-variant" /> : null}
        {label ? <span className="absolute bottom-1 left-1 rounded-xs bg-black/65 px-1.5 text-[11px] font-medium leading-[16px] text-ink">{label}</span> : null}
      </span>
      <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-line">
        {step.parts.filter((p) => p.percent > 0).map((p) => (
          <span key={p.tree} style={{ width: `${p.percent}%`, background: colorOf(p.tree) } as CSSProperties} />
        ))}
      </span>
    </button>
  );
}

/** The chosen step's films, tree by tree: each film plays here, and a variant gets a share of its own. */
function StepFilms({ step, graph, colorOf, nameOf, reuse, orders, held, onShare, onOpen }: { step: Cover; graph: Graph | null; colorOf: (tree: string) => string; nameOf: (tree: string) => string; reuse: CompositionAnswer["reuse"]; orders: readonly { tree: string; href: string }[]; held: boolean; onShare: (part: CoverPart, film: string, share: number) => void; onOpen: (tree: string, edge: string, take: string) => void }) {
  const moved = step.card ? reuse.find((r) => r.card === step.card) : undefined;
  const reach = step.reach === "skon" ? "vid skon" : step.reach === "vila" ? "via vilan" : "utan väg dit: kortet läggs utan hand";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-base font-semibold text-ink">{step.name}</span>
        {step.lacking.length ? <span className="text-xs text-dim">{step.lacking.map(nameOf).join(", ")} saknar steget och lånar det {reach}</span> : null}
        {!step.parts.length ? <span className="text-xs text-[#ef8b8b]">Inget träd har en film: kortet läggs utan hand</span> : null}
      </div>
      {/* Leaving for Bordet would lose what is not saved: the way to order waits for Spara. */}
      {orders.length ? (
        held ? (
          <span className="text-xs text-dim">Spara kompositionen för att beställa steget härifrån.</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {orders.map((o) => (
              <Link key={o.tree} href={o.href} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Beställ till {nameOf(o.tree)}
              </Link>
            ))}
          </div>
        )
      ) : null}
      {step.parts.map((part) => (
        <div key={part.tree} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-ink">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: colorOf(part.tree) }} />
            <span className="font-medium">{nameOf(part.tree)}</span>
            <span className="tabular-nums text-dim">{percentWord(part.percent)}</span>
            {part.via ? <span className="text-xs text-dim">från {nodeCode(part.via)}</span> : null}
            {part.how === "aterbruk" ? (
              <span className="text-xs text-dim">
                spelar filmen för {part.of?.replace(".C", " kort ")}
                {moved ? `, kortet ritat ${String(moved.game).replace(".", ",")} px bort i spelets storlek` : ""}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            {part.films.map((film) => {
              const take = graph?.takes[film.id];
              return (
                <div key={film.id} className="flex w-[132px] flex-col gap-1">
                  {take ? <RowStill take={take} onOpen={() => onOpen(part.tree, take.edge, take.id)} /> : <span className="grid aspect-[3/2] w-full place-items-center rounded-md border border-dashed border-line-strong text-xs text-dim">ingen film här</span>}
                  <label className="flex items-center gap-1.5 text-xs text-dim">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(film.percent)}
                      onChange={(e) => onShare(part, film.id, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      aria-label={`Andel för ${film.id}`}
                      className="w-14 rounded-sm border border-line-strong bg-well px-1.5 py-0.5 text-right tabular-nums text-ink focus:border-brass/70 focus-visible:outline-none"
                    />
                    % {film.verdict === "primar" ? "· Primär" : film.verdict === "variant" ? "· Variant" : ""}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * How far the drawn card is moved when a card plays another card's film, in the game's size: a seat's later cards its first
 * card's film, the dealer's second card her first's and her later cards her third's. Up to what the second card is moved
 * today is drawn calm; further is marked, since the hand then lays the card somewhere else than it lands.
 */
function Reuse({ rows }: { rows: CompositionAnswer["reuse"] }) {
  if (!rows.length) return null;
  const seats = rows.filter((r) => r.card.startsWith("P")), dealer = rows.filter((r) => r.card.startsWith("D"));
  const today = Math.max(...seats.filter((r) => r.card.endsWith(".C2")).map((r) => r.game), 0);
  const most = Math.max(...rows.map((r) => r.game), 1);
  const px = (n: number) => String(Math.round(n)).replace(".", ",");
  const line = (label: string, list: typeof rows) => {
    if (!list.length) return null;
    const low = Math.min(...list.map((r) => r.game)), high = Math.max(...list.map((r) => r.game)), far = high > today + 0.5;
    return (
      <div key={label} className="flex items-center gap-2 text-xs" title={`${list.map((r) => `${r.card}: ${px(r.game)} px (${String(r.cards).replace(".", ",")} kortbredder) med filmen för ${r.film}`).join(" · ")}`}>
        <span className="w-24 shrink-0 text-dim">{label}</span>
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span className={cn("absolute inset-y-0 left-0 rounded-full", far ? "bg-anmarkning" : "bg-godkand")} style={{ width: `${(100 * high) / most}%` }} />
        </span>
        <span className={cn("w-24 shrink-0 text-right tabular-nums", far ? "text-anmarkning" : "text-dim")}>{low === high ? `${px(high)} px` : `${px(low)}–${px(high)} px`}</span>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">Återbruk: så långt flyttas kortet från där handen lägger det</span>
        <span className="text-xs text-dim">spelets storlek · grönt: som kort 2 i dag</span>
      </div>
      {[2, 3, 4, 5, 6, 7].map((n) => line(`Plats, kort ${n}`, seats.filter((r) => r.card.endsWith(`.C${n}`))))}
      {dealer.map((r) => line(`Dealern, kort ${r.card.slice(3)}`, [r]))}
    </div>
  );
}
