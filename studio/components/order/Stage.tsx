"use client";

// The picture "Ny beställning" opens on (Jakob 2026-11-17: "min labb-yta där jag kan se en typ avatar/siluett och sedan
// kort och bord"). On top his notation for what is ordered ("A2.2 → P3C2 → A2.2", lib/orders.ts routeOf) with one plain
// sentence under it; then, large, the picture the film starts from with every card place of the plan drawn on it and the
// ordered card where the plan lays it (yellow closed, blue open, at the order's size), ringed and named. A press on a place
// chooses that card, as the seat field does (Enter or Space on a focused place too). "Flytta kortets plats" opens Bordet's
// Kortplan at that card. "Siluett" lays the same places over Kortplan's neutral picture (the studio's table with a
// figure), to see where the card lies on the table, for every step (one without a card shows the table
// and the figure alone); what is sent is always the dealer's own picture.
import { Clock, Move } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { nodeCode } from "../../lib/names.ts";
import type { Route } from "../../lib/orders.ts";
import { placeName } from "../../lib/placement.ts";
import { CARD_COLOUR } from "../../../src/placement-model.ts";
import { SegmentedControl, buttonClasses, cn } from "../ui";

const W = 1764,
  H = 1174;
// a card as the films show it, the same yellow and blue as Placering (CARD_COLOUR)
const CARD_FILL = CARD_COLOUR;

/** What lies under the places: a still, one frame of a film, or a field that says what it waits for. */
export type StageBase = { src: string | null; frame?: { video: string; time: number } | null; name: string; waiting?: string | null; dim?: boolean };
/** A card drawn on the picture: filled where it is drawn on the picture that is sent, an outline where the picture holds it already. */
export type StageCard = { target: string; quad: [number, number][]; side: "FRONT" | "BACK"; filled: boolean; ring: boolean };
export type StageLook = "ankare" | "bord";

const points = (q: readonly (readonly [number, number])[]) => q.map((p) => p.join(",")).join(" ");
const centreOf = (q: readonly (readonly [number, number])[]) => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length] as const;

/** His notation with the card in brass: "A2.2 → P3C2 → A2.2". */
function RouteLine({ line }: { line: string }) {
  return (
    <p className="font-display text-xl font-semibold tracking-[-0.01em] text-ink" aria-label={`Beställs: ${line}`}>
      {line.split(" → ").map((part, i) => (
        <Fragment key={i}>
          {i ? <span className="px-1 font-normal text-dim">→</span> : null}
          <span className={/^[PD]/.test(part) ? "text-brass-hi" : undefined}>{part}</span>
        </Fragment>
      ))}
    </p>
  );
}

export function Stage({
  route,
  base,
  places,
  cards,
  chosen,
  onPick,
  move,
  look,
  onLook,
  caption,
}: {
  route: Route;
  base: StageBase;
  /** The places that can be pressed, in the plan's order (a seat's second card after its first, so it lies on top). */
  places: readonly { target: string; quad: [number, number][] }[];
  cards: readonly StageCard[];
  chosen: string | null;
  onPick: (target: string) => void;
  /** Placering at the ordered card, or null where the step has no card. */
  move: string | null;
  /** "Dealerns bild" or "Siluett", offered for every step: a step without a card shows the table and the figure without places. */
  look: StageLook;
  onLook: (look: StageLook) => void;
  caption: ReactNode;
}) {
  return (
    <section aria-label="Bilden" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RouteLine line={route.line} />
        {move ? (
          <Link href={move} className={buttonClasses({ variant: "quiet", size: "sm", className: "ml-auto" })} title="Öppnar Placering vid kortet; därifrån leder Tillbaka till beställningen hit igen">
            <Move aria-hidden />
            Flytta kortets plats
          </Link>
        ) : null}
      </div>
      <p className="-mt-1 text-sm text-ink">{route.sentence}</p>
      <div className="relative aspect-[1764/1174] overflow-hidden rounded-lg border border-line bg-well">
        {base.frame ? (
          // One frame of a film (a landing picture taken from a take): the film paused at that frame.
          <video src={`${base.frame.video}#t=${base.frame.time.toFixed(3)}`} muted playsInline preload="auto" className={cn("size-full object-cover", base.dim && "opacity-45")} aria-label={base.name} />
        ) : base.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a lab file; a static export cannot optimise
          <img src={base.src} alt={base.name} draggable={false} className={cn("size-full select-none object-cover", base.dim && "opacity-45")} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,#0c110f_0_10px,#0a0e0c_10px_20px)] text-center">
            <Clock className="size-5 text-vantar" />
            <span className="text-sm text-ink">Väntar på {base.waiting ?? "bilden"}</span>
            <span className="text-2xs text-dim">hämtas hit när den är godkänd i Material</span>
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="group" aria-label="Kortplatserna">
          {places.map((p) => {
            const on = p.target === chosen;
            return (
              <polygon
                key={p.target}
                points={points(p.quad)}
                role="button"
                tabIndex={0}
                aria-label={placeName(p.target)}
                aria-pressed={on}
                onClick={() => onPick(p.target)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPick(p.target);
                  }
                }}
                // a place to press, not a card: a dashed lilac outline, no pale rim that reads as a card's
                className="cursor-pointer fill-[#d3b4ff]/10 stroke-[#d3b4ff]/80 outline-none transition-[fill] duration-150 hover:fill-brass/55 focus-visible:fill-brass/55"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              >
                <title>{placeName(p.target)}</title>
              </polygon>
            );
          })}
          {cards.map((c) => {
            const [cx, cy] = centreOf(c.quad);
            return (
              <g key={c.target} className="pointer-events-none">
                {c.ring ? <circle cx={cx} cy={cy} r={78} fill="none" stroke="#e8cb85" strokeWidth={3} vectorEffect="non-scaling-stroke" /> : null}
                <polygon
                  points={points(c.quad)}
                  fill={c.filled ? CARD_FILL[c.side] : "none"}
                  // a drawn card is one plain colour with slightly rounded corners, no rim
                  stroke={c.filled ? CARD_FILL[c.side] : "#e8cb85"}
                  strokeWidth={c.filled ? 4 : 2.5}
                  strokeLinejoin="round"
                  strokeDasharray={c.filled ? undefined : "6 4"}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {cards
          .filter((c) => c.ring)
          .map((c) => {
            const [cx, cy] = centreOf(c.quad);
            return (
              <span
                key={c.target}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xs bg-black/70 px-1.5 py-px text-xs font-semibold tabular-nums text-brass-hi"
                style={{ left: `${(cx / W) * 100}%`, top: `${(Math.max(30, cy - 84) / H) * 100}%` }}
              >
                {nodeCode(c.target)}
              </span>
            );
          })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 text-xs leading-[17px] text-dim">
          {caption}
          {places.length ? " Tryck på en plats för att välja kortet." : ""}
        </p>
        <SegmentedControl
          label="Bilden"
          size="sm"
          value={look}
          onChange={onLook}
          options={[
            { value: "ankare", label: "Dealerns bild", title: "Dealerns egen bild, den som skickas" },
            { value: "bord", label: "Siluett", title: "Studions bord med en siluett, som i Kortplan" },
          ]}
        />
      </div>
    </section>
  );
}
