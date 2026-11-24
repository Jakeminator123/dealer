"use client";

// Ny film: Bordet's guide for a new film, Kortplan's step 3 (Jakob 2026-11-23: "menyerna … blir smartare, och mer likt så som
// en 'Wizard' hade varit om man skulle vilja beställa nya klipp och att allt är sammanlänkt smart till nodträd och dealer").
// Three parts, one shown at a time:
//   Vad     the dealer, her tree and the step: the tree's steps as tiles with their pictures, those without a film first, the
//           ones with a film folded; "Fler steg" holds what Bordet orders outside the tree's measure (the chosen card's return
//           to rest, the other anchors at the shoe). A step with a card chooses that card on the board, and a card chosen on
//           the board moves the step to it; the board rings the cards that lack a film in the tree.
//   Hur     the step's recipe in plain words: its film where it has one, the five marks, the pictures the server will send
//           (the last is the step's end picture), the reference film, the text and his exceptions (Sends.tsx)
//   Skicka  exactly what is sent and its price, the server's draft before it is saved, and "Spara utkastet"; afterwards the
//           draft, the way to Kön and the way back to the tree in Karta. A deal from A2.3 to a player's card or one of the
//           dealer's own is saved from the doll (Jakob 2026-11-23: "EN väg och ETT ställe man använder dockan"): its film of
//           his saved standard is made first, about a minute, and goes as the reference (lib/orders.ts orderDoll,
//           tools/doll-order.ts); "Utan dockan" saves the recipe's draft instead. Where the doll lays a dealer's card with
//           another side than the plan says, Hur and Skicka say so before anything is made (the tool would stop there).
// Karta's "Beställ" opens it on a step (lib/new-film.ts guideHref). It approves nothing: the draft is approved in Kön.
import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { genitive, stepOf } from "../../../src/order-model.ts";
import { isCard, type TreeView } from "../../../src/dealer-trees.ts";
import { useBank } from "../../lib/bank.ts";
import { asApiError } from "../../lib/api.ts";
import { sentence, type FilmRow } from "../../lib/bordet.ts";
import type { EntryAnswer } from "../../lib/media.ts";
import { kartaHref, tileNode, tilesOf, treeOwns, type GuideItem } from "../../lib/new-film.ts";
import { orderDoll, picturesInOrder, type CreatedOrders, type DollOrdered, type NewOrderInput, type Order, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import type { Trees } from "../map/useTrees";
import { treeChip } from "../map/TreeRow";
import { coverOfEntry } from "../material/Tile";
import { PreviewOrder, PreviewPictures, useDraftSave, usePreview } from "../order/OrderPreview";
import { pictureName } from "../order/Pictures";
import { ProofStill } from "../proofs";
import { TakeCard } from "../takes";
import { Badge, Button, SegmentedControl, Skeleton, buttonClasses, cn, useToast } from "../ui";
import type { SideClash, StandardState } from "./DollPanel";
import { Marks } from "./FilmList";
import { DraftSends } from "./Sends";

export type Phase = "vad" | "hur" | "skicka";
const STATE_CHIP = { saknas: { tone: "remark", word: "saknas" }, prov: { tone: "wait", word: "väntar på dom" }, finns: { tone: "ok", word: "finns" } } as const;
/**
 * A deal saved from the doll: the card, and his saved standard for it as the lab has it. `clash`: the doll's side of a
 * dealer's card and the saved plan's where they differ (DollPanel.tsx sideClash), else null.
 */
export type DollWay = { place: string; standard: StandardState; treePicture: string | null; clash: SideClash | null };

/** The doll lays a dealer's card with another side than the plan: said before the draft is asked for, with what to do. */
function Clash({ doll }: { doll: DollWay }) {
  if (!doll.clash) return null;
  return (
    <p data-side-clash role="alert" className="rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]">
      Dockan lägger {doll.place} {doll.clash.doll}, kortplanen säger {doll.clash.plan}. Välj samma sida i docklabbet och spara, eller ändra kortplanen (steg 2).
    </p>
  );
}

export function NewFilm({
  dealer, dealers, onDealer, trees, view, onTree, item, phase, onPhase, onPick, place, row, body, sends, entries, names, ordering, blocked, made, orders, composition, onCreated, doll, onDollMade,
}: {
  dealer: string;
  /** The dealers films can be ordered for (not paused). */
  dealers: readonly { id: string; name: string }[];
  onDealer: (id: string) => void;
  trees: Trees;
  /** The chosen tree (lib/new-film.ts pickTree), or null without trees. */
  view: TreeView | null;
  onTree: (id: string) => void;
  item: GuideItem | null;
  phase: Phase;
  onPhase: (p: Phase) => void;
  onPick: (item: GuideItem) => void;
  /** The card chosen on the board: "Fler steg" are its. */
  place: string;
  /** The film the step is ordered as (lib/bordet.ts filmRow), or null where no step of Beställ makes it. */
  row: FilmRow | null;
  /** The body of the draft: the row's, with the tree's anchor picture where it is not the one that holds (treeBase). */
  body: NewOrderInput | null;
  /** The recipe, the reference film, the text and his exceptions for the row (Sends.tsx RowSends). */
  sends: ReactNode;
  /** The dealer's pictures in Material. */
  entries: readonly EntryAnswer[];
  names: Record<string, string>;
  ordering: { open: boolean; words: string } | null;
  blocked: string | null;
  /** The draft made of the film in this visit, as the store answers it, or null. */
  made: OrderAnswer | null;
  orders: OrdersAnswer | null;
  /** The composition Karta's "Beställ" came from: the way back leads there. */
  composition: string | null;
  onCreated: (answer: CreatedOrders) => void;
  /** The film is saved from the doll (a deal from A2.3 to a player's card, the dealer's own doll), or null. */
  doll: DollWay | null;
  onDollMade: (made: DollOrdered) => void;
}) {
  const { graph } = useBank();
  const preview = usePreview(phase === "vad" ? null : body);
  const byId = new Map(entries.map((e) => [e.id, e] as const));
  /** The picture of a node: the tree's, else the one that holds in Material. */
  const pictureOf = (node: string): EntryAnswer | null => {
    const own = view?.nodes.find((n) => n.node === node)?.entry;
    if (own && byId.has(own)) return byId.get(own)!;
    return entries.find((e) => e.state === "gäller" && e.served && (isCard(node) ? e.role === "landning" && e.card === node : e.role.startsWith("ankare") && e.node === node && !e.card)) ?? null;
  };
  // A picture sent that is another tree's anchor or landing is said, never hidden (the store takes the one that holds).
  const foreign = (order: Order) =>
    view
      ? picturesInOrder(order.pictures).filter((p) => {
          const e = p.from?.entry ? byId.get(p.from.entry) : undefined;
          return !!e && (e.role.startsWith("ankare") || e.role === "landning") && !treeOwns(view, e);
        })
      : [];
  // The server's draft of the body as it stands now (usePreview answers for this body only).
  const shown = preview.preview?.orders[0];

  return (
    <div data-new-film className="flex flex-col gap-4 px-4 pb-4">
      <SegmentedControl
        size="sm"
        label="Ny film"
        value={phase}
        onChange={onPhase}
        options={[
          { value: "vad", label: "Vad" },
          { value: "hur", label: "Hur", disabled: !item },
          { value: "skicka", label: "Skicka", disabled: !item },
        ]}
        className="self-start"
      />
      {phase === "vad" ? (
        <Choose dealer={dealer} dealers={dealers} onDealer={onDealer} trees={trees} view={view} onTree={onTree} item={item} onPick={onPick} place={place} pictureOf={pictureOf} />
      ) : item ? (
        <>
          <Head item={item} view={view} onBack={() => onPhase("vad")} />
          {phase === "hur" ? (
            <How item={item} row={row} body={body} sends={sends} graph={graph} order={shown ?? null} loading={preview.loading} foreign={shown ? foreign(shown) : []} view={view} pictureOf={pictureOf} doll={doll} onNext={() => onPhase("skicka")} />
          ) : (
            <Send
              key={`${dealer}|${item.id}`}
              item={item}
              row={row}
              body={body}
              order={shown ?? null}
              preview={preview}
              foreign={shown ? foreign(shown) : []}
              view={view}
              dealer={dealer}
              names={names}
              ordering={ordering}
              blocked={blocked}
              made={made}
              orders={orders}
              composition={composition}
              onCreated={onCreated}
              doll={doll}
              onDollMade={onDollMade}
              onAgain={() => onPhase("vad")}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Vad ─────────────────────────────────────────────────────────────────────
function Choose({ dealer, dealers, onDealer, trees, view, onTree, item, onPick, place, pictureOf }: { dealer: string; dealers: readonly { id: string; name: string }[]; onDealer: (id: string) => void; trees: Trees; view: TreeView | null; onTree: (id: string) => void; item: GuideItem | null; onPick: (item: GuideItem) => void; place: string; pictureOf: (node: string) => EntryAnswer | null }) {
  const tiles = tilesOf(view, place);
  const choosable = (trees.answer?.trees ?? []).filter((v) => !v.tree.shares || v.tree.id === view?.tree.id);
  const grid = (list: readonly GuideItem[]) => (
    <div className="grid grid-cols-3 gap-2">
      {list.map((i) => (
        <Tile key={i.id} item={i} entry={pictureOf(tileNode(i))} active={item?.id === i.id} onPick={() => onPick(i)} />
      ))}
    </div>
  );
  return (
    <>
      {dealers.length > 1 ? <SegmentedControl size="sm" label="Dealer" value={dealer} onChange={onDealer} options={dealers.map((d) => ({ value: d.id, label: d.name }))} className="max-w-full flex-wrap self-start" /> : null}
      {trees.state === "loading" ? (
        <Skeleton className="h-40 rounded-md" />
      ) : choosable.length ? (
        <SegmentedControl size="sm" label="Träd" value={view?.tree.id ?? ""} onChange={onTree} options={choosable.map((v) => ({ value: v.tree.id, label: treeChip(v) }))} className="max-w-full flex-wrap self-start" />
      ) : (
        <p className="text-sm text-dim">
          {trees.state === "ready" ? `${dealers.find((d) => d.id === dealer)?.name ?? dealer} har inget nodträd än.` : (trees.error ?? "Träden kunde inte läsas.")} Stegen nedan gäller kortet på bilden.
        </p>
      )}
      {view?.tree.state === "vilar" ? <p className="text-sm text-dim">{view.tree.name} vilar.</p> : null}
      {view ? (
        <>
          {tiles.saknas.length ? (
            <Group title="Saknas" count={tiles.saknas.length} note={`Ringade kort på bilden saknar film i ${view.tree.name}.`}>
              {grid(tiles.saknas)}
            </Group>
          ) : (
            <p className="text-sm text-[#6cc595]">Alla steg i {view.tree.name} har film eller väntar på dom.</p>
          )}
          {tiles.prov.length ? (
            <Group title="Väntar på dom" count={tiles.prov.length}>
              {grid(tiles.prov)}
            </Group>
          ) : null}
          {tiles.finns.length ? (
            <Fold title="Finns" count={tiles.finns.length} open={item?.state === "finns"}>
              {grid(tiles.finns)}
            </Fold>
          ) : null}
        </>
      ) : null}
      {tiles.more.length ? (
        <Fold title="Fler steg" count={tiles.more.length} hint={view ? "utanför trädets mått: till vila, andra ankare vid skon" : undefined} open={!view || (!!item && !item.step)}>
          {grid(tiles.more)}
        </Fold>
      ) : null}
    </>
  );
}

function Group({ title, count, note, children }: { title: string; count: number; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
        {title} <span className="font-normal tabular-nums normal-case tracking-normal text-dim">{count}</span>
      </h3>
      {children}
      {note ? <p className="text-xs text-dim">{note}</p> : null}
    </section>
  );
}

function Fold({ title, count, hint, open, children }: { title: string; count: number; hint?: string; open: boolean; children: ReactNode }) {
  return (
    <details open={open} className="rounded-md border border-line px-3 py-2">
      <summary className="cursor-pointer text-sm text-ink">
        {title} <span className="text-xs tabular-nums text-dim">· {count}{hint ? ` · ${hint}` : ""}</span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** A step as a tile: its picture (the card's, or where it goes) and its name in his notation. */
function Tile({ item, entry, active, onPick }: { item: GuideItem; entry: EntryAnswer | null; active: boolean; onPick: () => void }) {
  const cover = entry ? coverOfEntry(entry) : null;
  return (
    <button type="button" data-step={item.id} onClick={onPick} aria-pressed={active} title={item.name} className="flex min-w-0 flex-col gap-1 rounded-md text-left focus-visible:outline-offset-2">
      <span className={cn("relative block aspect-[3/2] w-full overflow-hidden rounded-md border", cover ? "border-line-strong bg-well" : "border-dashed border-line-strong", active && "ring-2 ring-brass/70")}>
        {cover && entry ? <ProofStill cover={cover} fps={entry.fps ?? 30} className="absolute inset-0" /> : <span className="absolute inset-0 grid place-items-center text-2xs text-faint">ingen bild</span>}
      </span>
      <span className="truncate font-mono text-2xs text-ink">{item.name}</span>
    </button>
  );
}

// ── Hur and Skicka ──────────────────────────────────────────────────────────
/** The chosen step: his notation, its name, its state in the tree, and the way back to the tiles. */
function Head({ item, view, onBack }: { item: GuideItem; view: TreeView | null; onBack: () => void }) {
  const chip = item.state ? STATE_CHIP[item.state] : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-md font-semibold text-ink">{item.name}</h3>
        {chip ? <Badge tone={chip.tone}>{chip.word}</Badge> : null}
        <Button size="sm" variant="quiet" icon={<ArrowLeft />} onClick={onBack} className="ml-auto">
          Byt steg
        </Button>
      </div>
      <p className="truncate text-xs text-dim">
        {[view?.tree.name, item.wish ? stepOf(item.wish.step)?.label : null, !item.step && view ? "utanför trädets mått" : null].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

/** The step's two pictures as the tree has them, while the server's draft is not there (or cannot be made). */
function TreeStills({ item, pictureOf }: { item: GuideItem; pictureOf: (node: string) => EntryAnswer | null }) {
  const still = (node: string, word: string) => {
    const entry = pictureOf(node);
    const cover = entry ? coverOfEntry(entry) : null;
    return (
      <figure className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("relative block aspect-[3/2] w-full overflow-hidden rounded-md border", cover ? "border-line-strong bg-well" : "border-dashed border-line-strong")}>
          {cover && entry ? <ProofStill cover={cover} fps={entry.fps ?? 30} className="absolute inset-0" /> : <span className="absolute inset-0 grid place-items-center text-2xs text-faint">ingen bild</span>}
        </span>
        <figcaption className="text-xs text-dim">{word}</figcaption>
      </figure>
    );
  };
  return (
    <div className="flex items-center gap-2">
      {still(item.from, "Första bild")}
      <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
      {still(item.to, "Slutbild")}
    </div>
  );
}

/** A picture sent that is another tree's: said under the pictures. */
function Foreign({ pictures, view }: { pictures: readonly Order["pictures"][number][]; view: TreeView | null }) {
  if (!pictures.length || !view) return null;
  return <p className="text-xs text-[#f0b07a]">{pictures.map((p) => pictureName(p)).join(", ")}: inte {genitive(view.tree.name)} egen bild. Det är bilden som gäller i Material som skickas.</p>;
}

function How({ item, row, body, sends, graph, order, loading, foreign, view, pictureOf, doll, onNext }: { item: GuideItem; row: FilmRow | null; body: NewOrderInput | null; sends: ReactNode; graph: ReturnType<typeof useBank>["graph"]; order: Order | null; loading: boolean; foreign: Order["pictures"]; view: TreeView | null; pictureOf: (node: string) => EntryAnswer | null; doll: DollWay | null; onNext: () => void }) {
  const take = item.step?.take && (item.state === "finns" || item.state === "prov") ? (graph?.takes[item.step.take] ?? null) : null;
  const off = item.wish ? stepOf(item.wish.step)?.off : null;
  return (
    <div className="flex flex-col gap-4">
      {take ? <TakeCard take={take} play still="film" extra={item.state === "finns" ? "Steget har film: en ny blir en tagning till." : "Väntar på din dom i Granska."} /> : null}
      {row ? <Marks marks={row.marks} /> : <p className="text-sm text-[#f0b07a]">Inget steg i Beställ gör {item.name}.</p>}
      {order ? <PreviewPictures order={order} /> : <TreeStills item={item} pictureOf={pictureOf} />}
      {body && loading && !order ? <p role="status" className="text-xs text-dim">Hämtar bilderna som skickas …</p> : null}
      <Foreign pictures={foreign} view={view} />
      {off && item.step?.order?.command ? <Command text={item.step.order.command} /> : null}
      {doll?.clash ? <Clash doll={doll} /> : doll ? <p data-doll-way-note className="text-xs text-dim">Givet sparas från dockan (Skicka): dockans film av din sparade standard blir referensfilm. Valen nedan gäller bara om du sparar utan dockan.</p> : null}
      {sends}
      <Button variant="primary" icon={<ArrowRight />} disabled={!body} onClick={onNext} className="self-start" title={body ? "Det som skickas, med pris" : (row?.why ? sentence(row.why) : undefined)}>
        Skicka
      </Button>
    </div>
  );
}

/** The command that makes a draft of a step the guide does not (the return to A2.3), to copy. */
function Command({ text }: { text: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "ok", title: "Kommandot är kopierat" });
    } catch {
      toast({ tone: "bad", title: "Kunde inte kopiera", detail: "Markera texten och kopiera den själv." });
    }
  };
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 select-all break-words rounded-md border border-line bg-well px-2.5 py-2 font-mono text-[12.5px] leading-5 text-ink">{text}</code>
      <Button variant="secondary" size="sm" icon={<Copy />} onClick={() => void copy()} className="h-auto">
        Kopiera
      </Button>
    </div>
  );
}

function Send({
  item, row, body, order, preview, foreign, view, dealer, names, ordering, blocked, made, orders, composition, onCreated, doll, onDollMade, onAgain,
}: {
  item: GuideItem;
  row: FilmRow | null;
  body: NewOrderInput | null;
  order: Order | null;
  preview: ReturnType<typeof usePreview>;
  foreign: Order["pictures"];
  view: TreeView | null;
  dealer: string;
  names: Record<string, string>;
  ordering: { open: boolean; words: string } | null;
  blocked: string | null;
  made: OrderAnswer | null;
  orders: OrdersAnswer | null;
  composition: string | null;
  onCreated: (answer: CreatedOrders) => void;
  doll: DollWay | null;
  onDollMade: (made: DollOrdered) => void;
  onAgain: () => void;
}) {
  const { save, saving, failure } = useDraftSave(onCreated);
  // The doll's way, unless he chose the recipe's ("Utan dockan"); its film is made before the draft, so it takes a minute.
  const [recipe, setRecipe] = useState(false);
  const [dolling, setDolling] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const held = !!ordering && !ordering.open;
  const back = view ? (
    <Link href={kartaHref(dealer, view.tree.id, item.step?.id ?? null, composition)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <ArrowLeft />
      Tillbaka till {composition ? "kompositionen" : view.tree.name} i Karta
    </Link>
  ) : null;
  if (made && orders)
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm text-[#6cc595]">
          <Check className="size-4" /> Utkastet är sparat. Det godkänns i Kön.
        </p>
        <DraftSends answer={made} all={orders} names={names} />
        <div className="flex flex-wrap gap-2">
          {back}
          <Button size="sm" variant="quiet" onClick={onAgain}>
            Ny film
          </Button>
        </div>
      </div>
    );
  if (doll && !recipe) {
    const st = doll.standard;
    const from = st.state === "läst" ? (st.standard ? `din sparade standard ${st.standard.name}${st.standard.cardTempo !== 1 ? ` (kortets fart ${Math.round(st.standard.cardTempo * 100)} %)` : ""}` : "Naturlig (ingen sparad standard för kortet)") : st.state === "läser" ? "din sparade standard (läser …)" : "din sparade standard";
    const orderIt = () => {
      setDolling({ busy: true });
      orderDoll(dealer, doll.place).then(
        (m) => (setDolling({ busy: false }), onDollMade(m)),
        (cause) => setDolling({ busy: false, error: asApiError(cause, "Dockans beställning").message }),
      );
    };
    return (
      <div data-doll-way className="flex flex-col gap-4">
        {held ? <p data-ordering className="rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]">{ordering!.words} Utkastet kan sparas, men inget kan godkännas så länge.</p> : null}
        <div className="flex flex-col gap-1 rounded-md border border-brass/30 bg-brass/5 px-3 py-2.5 text-sm leading-5">
          <span className="font-semibold text-ink">Från dockan</span>
          <span className="text-dim">
            Dockans film av {from} till {doll.place}, giv och återgång i en film, blir referensfilm (mall 15). Filmen görs först, ungefär en minut; sedan ligger utkastet i Kön med bilderna, texten och priset.
          </span>
          {doll.treePicture ? <span className="text-xs text-[#f0b07a]">A2.3-bilden blir den som gäller i Material, inte trädets egen ({doll.treePicture}).</span> : null}
        </div>
        <Clash doll={doll} />
        {blocked ? <p className="text-sm text-[#f0b07a]">{blocked}</p> : null}
        {dolling.error ? <p role="alert" className="text-sm text-[#f0b07a]">{dolling.error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={held ? "secondary" : "primary"} disabled={!!blocked || dolling.busy} loading={dolling.busy} onClick={orderIt}>
            {dolling.busy ? `Gör dockans film till ${doll.place} …` : "Spara utkastet"}
          </Button>
          {back}
          <Button size="sm" variant="quiet" disabled={dolling.busy} onClick={() => setRecipe(true)} title="Spara receptets utkast, med referensfilmen och valen i Hur">
            Utan dockan
          </Button>
        </div>
        <p className="text-xs text-faint">Ett utkast beställer inget: det godkänns i Kön och läggs sedan hos Runway. Det som är sparat i docklabbet är det som beställs; reglage som inte är sparade följer inte med.</p>
      </div>
    );
  }
  const ready = !!body && !!order && !preview.loading && !preview.error;
  // An uncertain save is tried again with the same body and revision (useDraftSave keeps them), never a new one.
  const trySave = () => {
    if (failure?.frozen) void save(failure.frozen.input, failure.frozen.revision);
    else if (body && preview.preview && ready) void save(body, preview.preview.revision);
  };
  return (
    <div className="flex flex-col gap-4">
      {held ? <p data-ordering className="rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]">{ordering!.words} Utkastet kan sparas, men inget kan godkännas så länge.</p> : null}
      {blocked ? <p className="text-sm text-[#f0b07a]">{blocked}</p> : null}
      {!body ? <p className="text-sm text-[#f0b07a]">{row?.why ? sentence(row.why) : `${item.name} kan inte skickas härifrån.`}</p> : null}
      {body && preview.loading ? <p role="status" className="text-sm text-dim">Hämtar texten och bilderna …</p> : null}
      {preview.error ? (
        <p role="alert" className="text-sm text-[#f0b07a]">
          {preview.error}{" "}
          <button type="button" onClick={preview.reload} className="text-brass-hi hover:underline">
            Försök igen
          </button>
        </p>
      ) : null}
      {order ? <PreviewOrder order={order} names={names} /> : null}
      <Foreign pictures={foreign} view={view} />
      {failure ? <p role="alert" className="text-sm text-[#f0b07a]">{failure.message}{failure.frozen ? " Svaret saknas; utkastet kan redan vara sparat. Försök igen med samma underlag för att få tillbaka det." : ""}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={held ? "secondary" : "primary"} disabled={!!blocked || (!failure?.frozen && !ready)} loading={saving} onClick={trySave}>
          {failure?.frozen ? "Försök spara samma utkast igen" : "Spara utkastet"}
        </Button>
        {back}
      </div>
      <p className="text-xs text-faint">Ett utkast beställer inget: det godkänns i Kön och läggs sedan hos Runway.</p>
    </div>
  );
}
