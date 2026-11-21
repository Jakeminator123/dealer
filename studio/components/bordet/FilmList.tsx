"use client";

// Bordet's films to order (lib/bordet.ts). WishRows is step 3's list for the chosen card (its three films from one anchor:
// the deal, the return to that anchor, the return to rest) and for the films without a card: one row per film in his
// notation with its five marks (Första bild, Slutbild, Referensfilm, Text, Pris; ready or missing, the words written on the mark,
// so the price stands on Pris), the first thing missing where it cannot be ordered yet, and "Lägg till" to put it on the list.
// FilmStrip is that list, under the picture: the films chosen across cards, their cards ringed on the stage, the sum, and
// "Förhandsvisa": the one way to a draft (the lab server's exact drafts, read before they are saved). One line over the list
// says what never goes to Runway: the card path drawn in the lab is a sketch.
import { Check, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { credits } from "../../../src/order-model.ts";
import { METHOD_STATUS_LABEL } from "../../../src/order-methods.ts";
import { sumWords, type FilmRow, type Mark } from "../../lib/bordet.ts";
import { Badge, Button, cn } from "../ui";

export type Made = Record<string, string>;
/** Kön with a draft open ("Det här skickas"), where it is approved. */
export const queueHref = (order: string) => `/bordet/?lage=ko&order=${encodeURIComponent(order)}`;

/**
 * A row's five marks as small chips: ready (✓) or missing (✗), the name and its few words written out on the chip
 * ("Slutbild A3P4C2", "Pris 64 krediter"), since a phone has no hover.
 */
export function Marks({ marks }: { marks: readonly Mark[] }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Det filmen behöver">
      {marks.map((m) => (
        <li
          key={m.name}
          data-mark={m.name}
          data-ready={m.ready ? "1" : "0"}
          className={cn("inline-flex min-h-5 items-center gap-1 rounded-sm border px-1.5 py-px text-2xs", m.ready ? "border-godkand/30 bg-godkand/10 text-[#6cc595]" : "border-anmarkning/35 bg-anmarkning/10 text-[#f0b07a]")}
        >
          <span aria-hidden>{m.ready ? "✓" : "✗"}</span>
          <span className="sr-only">{m.ready ? "klar: " : "saknas: "}</span>
          <span>{m.name}</span>
          {m.words ? <span data-mark-words className="text-ink/80">{m.words}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Step 3's rows: a film each, with its marks (the price among them), why it cannot be ordered, and the way onto the list. */
export function WishRows({ title, rows, listed, made, chosen, onChoose, onAdd }: { title: string | null; rows: readonly FilmRow[]; listed: ReadonlySet<string>; made: Made; chosen: string | null; onChoose: (r: FilmRow) => void; onAdd: (r: FilmRow) => void }) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {title ? <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{title}</span> : null}
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const on = chosen === r.key;
          const draft = made[r.key];
          return (
            <li
              key={r.key}
              data-wish={r.key}
              aria-current={on ? "true" : undefined}
              onClick={() => onChoose(r)}
              className={cn("flex cursor-pointer flex-col gap-1.5 rounded-md border px-2.5 py-2", on ? "border-brass/50 bg-brass/8" : "border-line hover:bg-raised/50")}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-ink">{r.line}</span>
                {/* the price stands on the mark Pris below; the name gets the room */}
                <span className="line-clamp-2 min-w-0 flex-1 text-xs text-dim" title={r.label}>
                  {r.label}
                </span>
                <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  {draft ? (
                    <Link href={queueHref(draft)} className="text-xs text-brass-hi hover:underline">
                      Utkast gjort
                    </Link>
                  ) : listed.has(r.key) ? (
                    <Badge tone="brass" icon={<Check />}>
                      i listan
                    </Badge>
                  ) : r.orderable ? (
                    <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => onAdd(r)} title="Lägg filmen i listan under bilden">
                      Lägg till
                    </Button>
                  ) : null}
                </span>
              </div>
              <Marks marks={r.marks} />
              {!r.orderable && r.why ? (
                <p data-why className="text-xs text-[#f0b07a]">
                  Kan inte beställas än: {r.why}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The list under the picture: a row per film, the sum, and the one way to drafts. */
export function FilmStrip({
  rows, chosen, made, blocked, held, onChoose, onRemove, onCreate, onClear, onNeed,
}: {
  rows: readonly FilmRow[];
  chosen: string | null;
  /** The drafts made from rows: the row's key → the order's id. */
  made: Made;
  /** Why no draft can be made now (the dealer is paused or cannot be ordered for, the plan is not saved), or null. */
  blocked: string | null;
  /** Nothing can be approved now (the mandate): drafts can still be made, so the button is not the bright one. */
  held: boolean;
  onChoose: (row: FilmRow) => void;
  onRemove: (row: FilmRow) => void;
  onCreate: () => void;
  onClear: () => void;
  /** The height the list needs to show every row (its header, its rows and its padding), as it changes. */
  onNeed?: (px: number) => void;
}) {
  const head = useRef<HTMLElement>(null), list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!onNeed) return;
    // the border over it (1) and the padding under the rows (8)
    const read = () => onNeed((head.current?.offsetHeight ?? 0) + (list.current?.offsetHeight ?? 0) + 9);
    read();
    const ro = new ResizeObserver(read);
    for (const el of [head.current, list.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [onNeed]);
  const open = rows.filter((r) => !made[r.key]);
  const ready = open.filter((r) => r.body);
  return (
    <section aria-label="Beställningen" className="flex shrink-0 flex-col border-t border-line bg-surface/60 lg:landscape:min-h-0 lg:landscape:flex-1 lg:landscape:shrink">
      <header ref={head} className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Beställningen</h2>
        <span data-sum className="shrink-0 whitespace-nowrap text-sm tabular-nums text-ink">
          {sumWords(open)}
        </span>
        {blocked && open.length ? <span className="min-w-0 truncate text-xs text-[#f0b07a]">{blocked}</span> : <span data-never className="min-w-0 truncate text-xs text-dim">Till Runway går bilderna, texten och ibland en referensfilm. Kortbanan är en skiss och skickas aldrig.</span>}
        <div className="ml-auto flex items-center gap-2">
          {rows.length ? (
            <Button size="sm" variant="quiet" onClick={onClear}>
              Töm
            </Button>
          ) : null}
          <Button size="sm" variant={held ? "secondary" : "primary"} disabled={!ready.length || !!blocked} onClick={onCreate} title="Läs text, bilder och pris som utkasten får, innan de sparas">
            {ready.length > 1 ? `Förhandsvisa ${ready.length} filmer` : "Förhandsvisa"}
          </Button>
        </div>
      </header>
      <div className="px-2 pb-2 lg:landscape:min-h-0 lg:landscape:flex-1 lg:landscape:overflow-y-auto">
        <ol ref={list} data-list-rows>
          {rows.length ? (
            rows.map((r) => <Row key={r.key} row={r} on={chosen === r.key} made={made[r.key] ?? null} onChoose={() => onChoose(r)} onRemove={() => onRemove(r)} />)
          ) : (
            <li className="px-2 py-2 text-sm text-faint">Välj ett kort och lägg till under Beställ.</li>
          )}
        </ol>
      </div>
    </section>
  );
}

function Row({ row, on, made, onChoose, onRemove }: { row: FilmRow; on: boolean; made: string | null; onChoose: () => void; onRemove: () => void }) {
  return (
    <li
      data-film={row.key}
      aria-current={on ? "true" : undefined}
      onClick={onChoose}
      className={cn("flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5", on ? "bg-brass/10 ring-1 ring-brass/40" : "hover:bg-raised/60")}
    >
      <span className="w-40 shrink-0 font-mono text-sm font-semibold text-ink">{row.line}</span>
      {row.method ? (
        <Badge tone={row.method.status === "gäller" ? "ok" : row.method.status === "prov" ? "wait" : "bad"}>{METHOD_STATUS_LABEL[row.method.status]}</Badge>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-xs text-dim" title={`${row.label} · ${row.recipe}`}>
        {row.recipe}
        {row.resolved.takes > 1 ? <span className="ml-1.5">· {row.resolved.takes} tagningar</span> : null}
        {/* the recipe names its reference rule already ("referensfilm: dockan"); the chip says one was found where it does not */}
        {row.reference && !/referensfilm/i.test(row.recipe) ? <span className="ml-1.5 text-[#9ec5ff]">· referensfilm</span> : null}
        {row.chosen ? <span className="ml-1.5 text-brass-hi">· ändrad</span> : null}
      </span>
      {made ? (
        <Link href={queueHref(made)} onClick={(e) => e.stopPropagation()} className="shrink-0 text-xs text-brass-hi hover:underline">
          Utkast · Det här skickas
        </Link>
      ) : row.cost !== null ? (
        <span className="shrink-0 text-sm tabular-nums text-ink">{credits(row.cost)} krediter</span>
      ) : (
        <span className="max-w-[40%] shrink-0 truncate text-xs text-[#f0b07a]" title={row.why ?? undefined}>
          {row.why ?? "kan inte beställas än"}
        </span>
      )}
      <button type="button" aria-label={`Ta bort ${row.line}`} onClick={(e) => (e.stopPropagation(), onRemove())} className="grid size-7 shrink-0 place-items-center rounded-sm text-faint hover:bg-raised hover:text-ink">
        <X className="size-4" />
      </button>
    </li>
  );
}
