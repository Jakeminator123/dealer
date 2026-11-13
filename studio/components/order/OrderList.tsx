"use client";

// Above the queue, "Det här saknas för en runda" for the dealer chosen in the rail (Production: the production list).
// The queue: one card per order in sections (klara att godkänna, väntar på bilder, i kön, lagda), each with its pictures
// (named for which of the dealer's pictures they are), one line on what the order makes, a status chip, the model and
// length, and the cost. A click opens "Det här skickas". Under the queue the one line on how
// approved orders get placed.
import { Clock, Film, ImageIcon, Plus } from "lucide-react";
import Link from "next/link";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import { HANDOVER, costWords, picturesInOrder, sections, styleWords, type OrderAnswer, type OrdersAnswer, type Picture } from "../../lib/orders.ts";
import { MODELS, approvalWords, credits, scaleWords } from "../../../src/order-model.ts";
import { Page } from "../shell";
import { Button, Card, EmptyState } from "../ui";
import { StatusChip } from "./Pictures";
import { Production } from "./Production";

function Thumb({ picture }: { picture: Picture }) {
  const src = picture.path ? labUrl(picture.path) : null;
  return (
    <div className="relative aspect-[1764/1174] min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-well">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a lab file; a static export cannot optimise
        <img src={src} alt={picture.label} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,#0c110f_0_8px,#0a0e0c_8px_16px)] text-2xs text-faint">
          <Clock className="size-4 text-vantar" />
          Väntar på {picture.waits?.label}
        </div>
      )}
      <span className="absolute bottom-1 left-1 right-1 truncate rounded-xs bg-black/65 px-1 text-2xs text-ink">{picture.label}</span>
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
          {order.group ? <p className="truncate text-xs text-brass-hi">Grupp: {order.group.label}</p> : null}
          {order.summary ? <p className="mt-0.5 text-sm leading-5 text-ink">{order.summary}</p> : null}
          <p className="mt-0.5 truncate text-xs text-dim">
            {what} · {styleWords(order)}
            {order.reference.status === "FINNS" ? " · referensfilm" : ""}
          </p>
          {order.approval?.by === "huvudagent" ? <p className="mt-0.5 truncate text-xs text-dim" title={order.approval.mandate}>{approvalWords(order.approval)}</p> : null}
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

export function OrderList({ all, onOpen, onNew, onChanged }: { all: OrdersAnswer; onOpen: (id: string) => void; onNew: () => void; onChanged?: () => void }) {
  const list = sections(all.orders);
  // The production list is the dealer's chosen in the rail (Pamela's while the bank is read).
  const { dealer } = useBank();
  const dealerName = all.dealers?.find((d) => d.id === dealer)?.name ?? dealer;
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
        <>
          {/* The protocol of every take (another view, /protokoll/). */}
          <Link href="/protokoll/" className="text-sm text-dim hover:text-ink hover:underline">
            Protokoll
          </Link>
          <Button variant="primary" icon={<Plus />} onClick={onNew}>
            Ny beställning
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        {all.problems.length ? <p className="text-sm text-[#ef8b8b]">{all.problems.join(" ")}</p> : null}
        <Production key={dealer} dealer={dealer} dealerName={dealerName} plan={all.plan ?? null} onOpen={onOpen} onMade={() => onChanged?.()} />
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
