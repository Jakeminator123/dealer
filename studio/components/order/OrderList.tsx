"use client";

// The queue: one card per order in sections (klara att godkänna, väntar på bilder, i kön, lagda), each with its pictures,
// a status chip, the model and length, and the cost. A click opens "Det här skickas". Under the queue the one line on how
// approved orders get placed.
import { Clock, Film, ImageIcon, Plus } from "lucide-react";
import { labUrl } from "../../lib/lab.ts";
import { HANDOVER, costWords, picturesInOrder, sections, type OrderAnswer, type OrdersAnswer, type Picture } from "../../lib/orders.ts";
import { MODELS, credits } from "../../../src/order-model.ts";
import { Page } from "../shell";
import { Button, Card, EmptyState } from "../ui";
import { StatusChip } from "./Pictures";

function Thumb({ picture }: { picture: Picture }) {
  const src = picture.path ? labUrl(picture.path) : picture.preview ? labUrl(picture.preview.path) : null;
  return (
    <div className="relative aspect-[1764/1174] min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-well">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a lab file; a static export cannot optimise
        <img src={src} alt={picture.label} className={picture.path ? "size-full object-cover" : "size-full object-cover opacity-60"} loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,#0c110f_0_8px,#0a0e0c_8px_16px)] text-2xs text-faint">
          <Clock className="size-4 text-vantar" />
          {picture.waits?.label}
        </div>
      )}
      <span className="absolute bottom-1 left-1 rounded-xs bg-black/65 px-1 text-2xs text-ink">
        {picture.label}
        {!picture.path && picture.preview ? <span className="text-[#f0b07a]"> · förhandsvisning</span> : null}
      </span>
    </div>
  );
}

function OrderCard({ answer, onOpen }: { answer: OrderAnswer; onOpen: () => void }) {
  const { order } = answer;
  const pics = picturesInOrder(order.pictures);
  const shown = order.kind === "FILM" ? pics.filter((p) => p.goesAs !== "referenceImage") : pics;
  const model = MODELS[order.generation.model];
  const p = order.generation.params;
  const what = [model?.label ?? order.generation.model, p.duration ? `${String(p.duration).replace(".", ",")} s` : null, p.resolution ?? p.imageSize ?? null].filter(Boolean).join(" · ");
  return (
    <Card interactive className="cursor-pointer p-3" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}>
      <div className="flex gap-2">
        {shown.slice(0, 2).map((pic) => (
          <Thumb key={pic.name} picture={pic} />
        ))}
      </div>
      <div className="mt-3 flex items-start gap-2">
        {order.kind === "FILM" ? <Film className="mt-0.5 size-4 shrink-0 text-dim" /> : <ImageIcon className="mt-0.5 size-4 shrink-0 text-dim" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-md font-semibold text-ink">{order.title}</p>
          <p className="truncate text-xs text-dim">
            {what}
            {pics.some((x) => x.name === "middle.png") ? " · med mellanbild" : ""}
            {order.group ? ` · ${order.group.label}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <StatusChip answer={answer} />
        <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-dim">{costWords(order)}</span>
      </div>
    </Card>
  );
}

export function OrderList({ all, onOpen, onNew }: { all: OrdersAnswer; onOpen: (id: string) => void; onNew: () => void }) {
  const list = sections(all.orders);
  return (
    <Page
      title="Beställ"
      status={
        <span className="truncate tabular-nums">
          {all.orders.length} beställningar · i dag {credits(all.day.spent)} av {credits(all.day.cap)} krediter{all.balance ? ` · saldo ${credits(all.balance.credits)}` : ""}
          {all.policy && !all.policy.enabled ? " · avstängt" : ""}
        </span>
      }
      actions={
        <Button variant="primary" icon={<Plus />} onClick={onNew}>
          Ny beställning
        </Button>
      }
    >
      <div className="flex flex-col gap-8">
        {all.problems.length ? <p className="text-sm text-[#ef8b8b]">{all.problems.join(" ")}</p> : null}
        {list.length ? (
          list.map((s) => (
            <section key={s.key} className="flex flex-col gap-3">
              <h2 className="flex items-baseline gap-2 border-b border-line pb-2 text-xs font-medium uppercase tracking-[0.08em] text-faint">
                {s.title} <span className="tabular-nums text-dim">{s.orders.length}</span>
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-4">
                {s.orders.map((a) => (
                  <OrderCard key={a.order.id} answer={a} onOpen={() => onOpen(a.order.id)} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <EmptyState title="Inga beställningar än">Gör en ny: dealer, steg, bilder och modell, med förval.</EmptyState>
        )}
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink">{HANDOVER}</p>
      </div>
    </Page>
  );
}
