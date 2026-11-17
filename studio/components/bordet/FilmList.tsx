"use client";

// Bordet's step 3, Beställ (lib/bordet.ts): the films to order as a list. AddFilms is the one-click choice of films for the
// chosen card (its deal from the anchor the plan's grip says, the returns) and of the films without a card; FilmStrip is the
// list itself, under the picture: one row per film in his notation, with the method of record's recipe and price, its card
// ringed on the stage, and the sum. "Skapa utkast" makes each film a draft through the order path every draft takes
// (POST /api/orders, the body the production list would send); approval and sending stay in Beställ's "Det här skickas".
// "Beställ" on a row opens Ny beställning with the film chosen instead, to change it there.
import { ExternalLink, Plus, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { credits, stepOf } from "../../../src/order-model.ts";
import { METHOD_STATUS_LABEL } from "../../../src/order-methods.ts";
import { sumWords, wishKey, type FilmRow, type FilmWish } from "../../lib/bordet.ts";
import { presetAddress } from "../../lib/orders.ts";
import { Badge, Button, buttonClasses, cn } from "../ui";

/** A button per film that can be added: its notation, and its step's group as a quiet word. */
export function AddFilms({ title, wishes, rows, listed, onAdd }: { title: string; wishes: readonly FilmWish[]; rows: (w: FilmWish) => Pick<FilmRow, "line">; listed: ReadonlySet<string>; onAdd: (w: FilmWish) => void }) {
  if (!wishes.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {wishes.map((w) => {
          const on = listed.has(wishKey(w));
          return (
            <button
              key={wishKey(w)}
              type="button"
              data-add={wishKey(w)}
              disabled={on}
              onClick={() => onAdd(w)}
              title={stepOf(w.step)?.label}
              className={cn("flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm tabular-nums", on ? "border-brass/40 bg-brass/10 text-brass-hi" : "border-line-strong text-ink hover:bg-raised")}
            >
              {on ? null : <Plus className="size-3.5 text-dim" />}
              <span className="font-medium">{rows(w).line}</span>
              <span className="text-2xs text-dim">{stepOf(w.step)?.group}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type Made = Record<string, string>;

/** The list under the picture: a row per film, the sum, and the drafts made from it. */
export function FilmStrip({
  rows, dealer, chosen, made, busy, blocked, onChoose, onRemove, onCreate, onClear,
}: {
  rows: readonly FilmRow[];
  dealer: string;
  chosen: string | null;
  /** The drafts made from rows: the row's key → the order's id. */
  made: Made;
  busy: boolean;
  /** Why no draft can be made now (the plan is not saved, the dealer cannot be ordered for), or null. */
  blocked: string | null;
  onChoose: (row: FilmRow) => void;
  onRemove: (row: FilmRow) => void;
  onCreate: () => void;
  onClear: () => void;
}) {
  const open = rows.filter((r) => !made[r.key]);
  const ready = open.filter((r) => r.body);
  return (
    <section aria-label="Beställningen" className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface/60">
      <header className="flex h-10 shrink-0 items-center gap-3 px-3">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Beställningen</h2>
        <span data-sum className="text-sm tabular-nums text-ink">
          {sumWords(open)}
        </span>
        {blocked && open.length ? <span className="truncate text-xs text-[#f0b07a]">{blocked}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {rows.length ? (
            <Button size="sm" variant="quiet" onClick={onClear}>
              Töm
            </Button>
          ) : null}
          <Button size="sm" variant="primary" loading={busy} disabled={!ready.length || !!blocked} onClick={onCreate} title="Utkasten godkänns i Beställ, Det här skickas">
            {ready.length > 1 ? `Skapa ${ready.length} utkast` : "Skapa utkast"}
          </Button>
        </div>
      </header>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {rows.length ? (
          rows.map((r) => <Row key={r.key} row={r} dealer={dealer} on={chosen === r.key} made={made[r.key] ?? null} onChoose={() => onChoose(r)} onRemove={() => onRemove(r)} />)
        ) : (
          <li className="px-2 py-2 text-sm text-faint">Inga filmer än. Lägg till i steg 3.</li>
        )}
      </ol>
    </section>
  );
}

function Row({ row, dealer, on, made, onChoose, onRemove }: { row: FilmRow; dealer: string; on: boolean; made: string | null; onChoose: () => void; onRemove: () => void }) {
  const cell: ReactNode = made ? (
    <Link href={`/bestall/?order=${encodeURIComponent(made)}`} className="text-xs text-brass-hi hover:underline">
      Utkast · Det här skickas
    </Link>
  ) : row.why && row.method?.status !== "saknas" ? (
    <span className="text-xs text-[#f0b07a]">{row.why}</span>
  ) : null;
  return (
    <li
      data-film={row.key}
      aria-current={on ? "true" : undefined}
      onClick={onChoose}
      className={cn("grid cursor-pointer grid-cols-[minmax(150px,auto)_minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-md px-2 py-1.5", on ? "bg-brass/10 ring-1 ring-brass/40" : "hover:bg-raised/60")}
    >
      <span className="font-mono text-sm font-semibold text-ink">{row.line}</span>
      <span className="min-w-0 truncate text-xs text-dim" title={`${row.label} · ${row.recipe}`}>
        {row.method ? (
          <Badge tone={row.method.status === "gäller" ? "ok" : row.method.status === "prov" ? "wait" : "bad"} className="mr-1.5">
            {METHOD_STATUS_LABEL[row.method.status]}
          </Badge>
        ) : null}
        {row.method?.status === "saknas" ? null : row.recipe}
      </span>
      <span className="w-28 text-right text-sm tabular-nums text-ink">{row.cost !== null ? `${credits(row.cost)} krediter` : "–"}</span>
      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {cell}
        {!made && row.wish ? (
          <Link
            href={presetAddress({ dealer, step: row.wish.step, target: row.wish.target, model: row.body?.model ?? null })}
            className={buttonClasses({ variant: "quiet", size: "sm", className: "px-2" })}
            title="Öppna i Ny beställning för att ändra den där"
          >
            <ExternalLink />
            Beställ
          </Link>
        ) : null}
      </span>
      <button type="button" aria-label={`Ta bort ${row.line}`} onClick={(e) => (e.stopPropagation(), onRemove())} className="grid size-7 place-items-center rounded-sm text-faint hover:bg-raised hover:text-ink">
        <X className="size-4" />
      </button>
    </li>
  );
}
