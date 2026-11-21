"use client";

// Kön. On top, whether anything can be approved now (orderingState: the mandate, the caps, the balance), then "Det här
// saknas för en runda" for the dealer chosen in the rail (Production: the production list).
// The queue: one card per order in sections (klara att godkänna, väntar på bilder, i kön, lagda), each with its pictures
// (named for which of the dealer's pictures they are), one line on what the order makes, a status chip, the model and
// length, and the cost. A click opens "Det här skickas". Under the queue the one line on how
// approved orders get placed. Placed and delivered orders are folded, newest first.
import { Clock, Film, ImageIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import { swedishMoment } from "../../lib/mode.ts";
import { HANDOVER, costWords, orderLine, orderingState, picturesInOrder, sections, styleWords, type OrderAnswer, type OrdersAnswer, type Picture } from "../../lib/orders.ts";
import { MODELS, approvalWords, credits, scaleWords, stepOf } from "../../../src/order-model.ts";
import { Card, EmptyState } from "../ui";
import { StatusChip, pictureName } from "./Pictures";
import { Production } from "./Production";
import { QueueFrame } from "./QueueFrame";

function Thumb({ picture }: { picture: Picture }) {
  const src = picture.path ? labUrl(picture.path) : null;
  return (
    <div className="relative aspect-[1764/1174] min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-well">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a lab file; a static export cannot optimise
        <img src={src} alt={pictureName(picture)} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,#0c110f_0_8px,#0a0e0c_8px_16px)] text-2xs text-faint">
          <Clock className="size-4 text-vantar" />
          Väntar på {picture.waits?.label}
        </div>
      )}
      <span className="absolute bottom-1 left-1 right-1 truncate rounded-xs bg-black/65 px-1 text-2xs text-ink">{pictureName(picture)}</span>
    </div>
  );
}

function OrderCard({ answer, dealerName, onOpen }: { answer: OrderAnswer; dealerName: string; onOpen: () => void }) {
  const { order } = answer;
  // The card names the dealer and the step in words; the line under it is the film in his notation. The title stored with
  // the order is a free text of the day it was made, in older words, and is not shown.
  const draft = !order.approval && order.status === "UTKAST";
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
          <p className="truncate font-display text-md font-semibold text-ink">{`${dealerName} · ${stepOf(order.step.key)?.label ?? order.step.label}`}</p>
          {order.group ? <p className="truncate text-xs text-brass-hi">Grupp: {order.group.label}</p> : null}
          {orderLine(order) ? <p className="mt-0.5 font-mono text-sm leading-5 text-ink">{orderLine(order)}</p> : null}
          <p className="mt-0.5 truncate text-xs text-dim">
            {what} · Text: {styleWords(order)}
            {order.reference.status === "FINNS" ? " · referensfilm" : ""}
          </p>
          {order.approval?.by === "huvudagent" ? <p className="mt-0.5 truncate text-xs text-dim">{approvalWords(order.approval)}</p> : null}
          {/* a draft says when it was made and whether it left the card plan: an old one made on a rule since replaced shows it here */}
          {draft ? (
            <p data-draft-made className="mt-0.5 truncate text-xs text-dim">
              Utkast {swedishMoment(order.created) ?? order.created.slice(0, 10)}
              {order.motion && !order.motion.fromPlan ? <span className="text-[#f0b07a]"> · ändrat från kortplanen</span> : null}
            </p>
          ) : null}
          {order.status === "AVBRUTEN" && order.setAside ? <p className="mt-0.5 text-xs text-dim">Avbruten: {order.setAside.why}</p> : null}
          {order.motion?.cardScale && order.motion.cardScale !== 1 ? <p className="mt-0.5 text-xs text-[#f0b07a]">Prov: kortet {scaleWords(order.motion.cardScale)} av planens</p> : null}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <StatusChip answer={answer} />
        <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-dim">{costWords(order)}</span>
      </div>
    </Card>
  );
}

export function OrderList({ menu, all, onOpen }: { menu: ReactNode; all: OrdersAnswer; onOpen: (id: string) => void }) {
  const list = sections(all.orders);
  // The production list is the dealer's chosen in the rail (Pamela's while the bank is read).
  const { dealer } = useBank();
  const dealerName = all.dealers?.find((d) => d.id === dealer)?.name ?? dealer;
  const ordering = orderingState(all);
  const names = new Map((all.dealers ?? []).map((d) => [d.id, d.name]));
  const cards = (s: (typeof list)[number]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-4">
      {s.orders.map((a) => (
        <OrderCard key={a.order.id} answer={a} dealerName={names.get(a.order.dealer) ?? a.order.dealer} onOpen={() => onOpen(a.order.id)} />
      ))}
    </div>
  );
  return (
    <QueueFrame
      menu={menu}
      status={
        <span className="truncate tabular-nums">
          {all.orders.length} beställningar{all.balance ? ` · saldo ${credits(all.balance.credits)} krediter` : ""}
        </span>
      }
      actions={
        // The protocol of every take (another view, /protokoll/).
        <Link href="/protokoll/" className="text-sm text-dim hover:text-ink hover:underline">
          Protokoll
        </Link>
      }
    >
      <div className="flex flex-col gap-8">
        <p data-ordering className={ordering.open ? "text-sm text-dim" : "rounded-sm bg-[#3a2a1a] px-3 py-2 text-sm text-[#f0b07a]"}>
          {ordering.words}
        </p>
        {all.problems.length ? <p className="text-sm text-[#ef8b8b]">{all.problems.join(" ")}</p> : null}
        <Production key={dealer} dealer={dealer} dealerName={dealerName} plan={all.plan ?? null} onOpen={onOpen} />
        {list.length ? (
          list.map((s) =>
            // What is placed and delivered is history: folded, so that what waits for a click stays on top.
            s.key === "lagda" || s.key === "avbrutna" ? (
              <details key={s.key} className="flex flex-col gap-3">
                <summary className="cursor-pointer border-b border-line pb-2 text-xs font-medium uppercase tracking-[0.08em] text-faint">
                  {s.title} <span className="tabular-nums text-dim">{s.orders.length}</span>
                </summary>
                <div className="pt-3">{cards({ ...s, orders: [...s.orders].sort((a, b) => b.order.created.localeCompare(a.order.created)) })}</div>
              </details>
            ) : (
              <section key={s.key} className="flex flex-col gap-3">
                <h2 className="flex items-baseline gap-2 border-b border-line pb-2 text-xs font-medium uppercase tracking-[0.08em] text-faint">
                  {s.title} <span className="tabular-nums text-dim">{s.orders.length}</span>
                </h2>
                {cards(s)}
              </section>
            ),
          )
        ) : (
          <EmptyState title="Inga beställningar än">En film beställs i Kortplan: välj ett kort, lägg filmen i listan under steg 3 Beställ och tryck Förhandsvisa.</EmptyState>
        )}
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink">{HANDOVER}</p>
      </div>
    </QueueFrame>
  );
}
