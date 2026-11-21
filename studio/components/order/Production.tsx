"use client";

// "Det här saknas för en runda", at the top of Beställ: the production list of the dealer chosen in the rail
// (tools/produce.ts through GET /api/production). Pictures first: the dealer's three anchors, then one small card per step a
// round needs that is not klar, each with the picture it starts from and its card drawn where the plan lays it, its state
// as a chip (colour and sign) and one line in Jakob's words. The count says how far the round is (tools/produce.ts counts it).
// Drafts are made in Kortplan's step 3, not here. "Visa alla" shows every step of the graph. Folded away it is one line, so
// the orders below still read well. Reads on load and when the tab is seen again.
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { asApiError } from "../../lib/api.ts";
import { dealerHref } from "../../lib/dealer.ts";
import { labUrl } from "../../lib/lab.ts";
import { FOR_YOU } from "../../lib/verdict.ts";
import { nodeCode } from "../../lib/names.ts";
import { PRODUCTION_CHIP, getProduction, productionCount, type Production as List, type ProductionAnchor, type ProductionRow } from "../../lib/orders.ts";
import { ANCHOR_NODE, type PlanAnswer } from "../../../src/order-model.ts";
import { CARD_COLOUR } from "../../../src/placement-model.ts";
import { CardMark } from "../placement/CardMark";
import { Badge, Skeleton, cn } from "../ui";

const W = 1764,
  H = 1174;
const CARD_FILL = CARD_COLOUR;
const ANCHOR_TONE = { gäller: "ok", kandidat: "wait", saknas: "bad" } as const;

/** The picture a step starts from, its card drawn where the plan lays it; a hatched field where it waits. */
function StepPicture({ row, plan }: { row: ProductionRow; plan: PlanAnswer | null }) {
  const p = row.picture;
  const cards = p.cards.flatMap((c) => (plan?.seats[c.target] ? [{ quad: plan.seats[c.target].quad, side: c.side }] : []));
  return (
    <div className="relative aspect-[1764/1174] w-[132px] shrink-0 overflow-hidden rounded-md border border-line bg-well">
      {p.path && p.frame === null && !p.path.endsWith(".mp4") ? (
        // eslint-disable-next-line @next/next/no-img-element -- a lab file
        <img src={labUrl(p.path)} alt="" className="size-full object-cover" loading="lazy" />
      ) : p.path ? (
        <div className="absolute inset-0 grid place-items-center text-2xs text-dim">landningsbild</div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-[repeating-linear-gradient(135deg,#0c110f_0_8px,#0a0e0c_8px_16px)] px-1 text-center text-2xs text-faint">
          <Clock className="size-3.5 text-vantar" />
          {p.waits}
        </div>
      )}
      {p.path && cards.length ? (
        // The card where the plan lays it, with a ring around it: at this size the card alone is a few pixels.
        <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {cards.map((c, i) => {
            const cx = c.quad.reduce((s, q) => s + q[0], 0) / c.quad.length,
              cy = c.quad.reduce((s, q) => s + q[1], 0) / c.quad.length;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={95} fill="none" stroke="#e8cb85" strokeWidth={9} opacity={0.9} />
                <polygon points={c.quad.map((q) => q.join(",")).join(" ")} fill={CARD_FILL[c.side]} stroke={CARD_FILL[c.side]} strokeWidth={4} strokeLinejoin="round" />
                {c.side === "FRONT" ? <CardMark quad={c.quad} /> : null}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

function StepCard({ row, plan, dealer, onOpen }: { row: ProductionRow; plan: PlanAnswer | null; dealer: string; onOpen: (id: string) => void }) {
  const chip = PRODUCTION_CHIP[row.state];
  const order = row.orders[0];
  return (
    <div className="flex gap-2.5 rounded-lg border border-line bg-surface p-2">
      <StepPicture row={row} plan={plan} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium text-ink">
          {row.label}
        </p>
        <Badge tone={chip.tone} className="self-start" title={row.words}>
          <span aria-hidden>{chip.sign}</span> {chip.word}
          {row.state === "KLAR" && row.provisional ? ` · ${FOR_YOU}` : ""}
        </Badge>
        <p className="line-clamp-2 text-xs leading-4 text-dim" title={row.method?.recipe}>
          {row.state === "KAN" || row.state === "PROV" ? (row.method?.recipe ?? row.words) : row.words}
        </p>
        {(row.state === "DOM" || (row.state === "KLAR" && row.provisional)) && row.take ? (
          <Link href={dealerHref(`/granska/?tagning=${encodeURIComponent(row.take)}`, dealer)} className="text-xs text-brass-hi hover:underline">
            {row.state === "DOM" ? "Döm i Granska" : "Se i Granska"}
          </Link>
        ) : order ? (
          <button type="button" onClick={() => onOpen(order.id)} className="self-start truncate text-xs text-brass-hi hover:underline" title={row.orders.map((o) => o.title).join(" · ")}>
            {row.orders.length > 1 ? `${row.orders.length} beställningar` : order.title}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AnchorTile({ anchor }: { anchor: ProductionAnchor }) {
  return (
    <figure className="flex w-[108px] flex-col gap-1">
      <div className="relative aspect-[1764/1174] overflow-hidden rounded-md border border-line bg-well">
        {anchor.path ? (
          // eslint-disable-next-line @next/next/no-img-element -- a lab file
          <img src={labUrl(anchor.path)} alt={nodeCode(ANCHOR_NODE[anchor.at])} className={cn("size-full object-cover", anchor.state !== "gäller" && "opacity-60")} loading="lazy" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[repeating-linear-gradient(135deg,#0c110f_0_8px,#0a0e0c_8px_16px)] text-2xs text-faint">saknas</div>
        )}
      </div>
      <figcaption className="flex items-center gap-1 text-xs text-ink">
        <span className="font-mono">{nodeCode(ANCHOR_NODE[anchor.at])}</span>
        <Badge tone={ANCHOR_TONE[anchor.state]} title={anchor.orders.length ? `På väg: ${anchor.orders.length} ${anchor.orders.length === 1 ? "beställning" : "beställningar"}` : undefined}>
          {anchor.state}
        </Badge>
      </figcaption>
    </figure>
  );
}

export function Production({ dealer, dealerName, plan, onOpen }: { dealer: string; dealerName: string; plan: PlanAnswer | null; onOpen: (id: string) => void }) {
  const [{ list, error }, setState] = useState<{ list: List | null; error: string | null }>({ list: null, error: null });
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);

  const read = useCallback(async () => {
    try {
      setState({ list: (await getProduction(dealer)).list, error: null });
    } catch (e) {
      // A lab server started before the list was built does not know the route yet.
      setState((s) => ({ ...s, error: asApiError(e, "Produktionslistan").status === 404 ? "listan visas när labbservern har startats om." : asApiError(e, "Produktionslistan").message }));
    }
  }, [dealer]);
  useEffect(() => {
    void read();
    const seen = () => document.visibilityState === "visible" && void read();
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, [read]);

  if (error && !list) return <p className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-dim">Det här saknas för en runda: {error}</p>;
  if (!list)
    return (
      <p role="status" className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-dim">
        Läser vad som saknas för en runda · {dealerName} …
        <Skeleton className="h-4 w-40 rounded-sm" />
      </p>
    );

  const missing = list.rows.filter((r) => r.needed && r.state !== "KLAR");
  const rows = all ? list.rows : missing;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-raised/40 p-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="size-4 text-dim" /> : <ChevronRight className="size-4 text-dim" />}
          {/* one heading that says what holds: nothing lacking, or what lacks */}
          <h2 className="font-display text-md font-semibold text-ink">{missing.length ? "Det här saknas för en runda" : "Allt en runda kräver är klart"}</h2>
          <span className="text-sm text-dim">· {dealerName}</span>
        </button>
        <span className="text-sm tabular-nums text-ink">{productionCount(list.counts)}</span>
        {list.counts.provisional ? (
          <span className="text-sm tabular-nums text-dim" title="Dömda av huvudagenten och en granskare när du lämnade över domen. De spelas och väntar inte på dig; Granska visar dem under Dömda åt dig, och ditt eget beslut ersätter dem.">
            · {list.counts.provisional} av de klara dömda åt dig
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {open ? (
            <button type="button" onClick={() => setAll((a) => !a)} className="text-sm text-dim hover:text-ink hover:underline">
              {all ? "Visa bara det som saknas" : `Visa alla ${list.counts.total}`}
            </button>
          ) : null}
        </div>
      </header>
      {open ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {list.anchors.map((a) => (
              <AnchorTile key={a.at} anchor={a} />
            ))}
            <p className="mb-1 max-w-[420px] text-xs leading-4 text-dim">
              {list.counts.missing} saknas på Kartan · landningsbilder: {list.landings.length ? list.landings.map((t) => nodeCode(t)).join(", ") : "ingen landningsbild finns än"}. Varje plats andra kort spelar första kortets film.
            </p>
          </div>
          {rows.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
              {rows.map((r) => (
                <StepCard key={r.edge} row={r} plan={plan} dealer={dealer} onOpen={onOpen} />
              ))}
            </div>
          ) : all ? null : (
            <p className="text-sm text-[#6cc595]">Varje steg en runda kräver har en film som gäller.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
