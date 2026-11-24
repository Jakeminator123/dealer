"use client";

// The pictures of an order, large: which picture it is (Första bild, Sista bild, the dealer's picture; an older still's pose), whose it is,
// where it comes from, and on a picture with a drawn card a magnified inset of the card with the plan's outline over it and "1,1 px från
// planen". A picture that waits shows what it waits for (never another dealer's picture in its place). A click opens the
// picture over the whole window (Z: full size, Esc closes).
import * as RD from "@radix-ui/react-dialog";
import { Clock, Maximize2, Minimize2, X } from "lucide-react";
import { useState } from "react";
import { labUrl } from "../../lib/lab.ts";
import { swedishMoment } from "../../lib/mode.ts";
import { cardCode } from "../../lib/names.ts";
import { SHOWN_CHIP, offsetWords, ownerWords, shownWords, type OrderAnswer, type Owner, type Picture } from "../../lib/orders.ts";
import type { Drawn } from "../../../src/order-model.ts";
import type { WayAnswer } from "../../../src/order-ways.ts";
import { CARD_COLOUR } from "../../../src/placement-model.ts";
import { CardMark } from "../placement/CardMark";
import { Badge, IconButton, cn } from "../ui";

const W = 1764,
  H = 1174;

/** What a frozen label may carry that is not his words: a file's name, a path or a script, a hash, a frame number, P5.C1. */
const TECHNICAL = /\.(?:png|jpe?g|webp|mp4|py|ts|json)\b|\/|\bsha\b|\(f\d+\)|\bP\d\.C\d\b/i;

/**
 * A picture's name: its name in Material today where the orders' answer gives it (named), else the label frozen with the
 * order, which an older order wrote in older words ("Paows ankare 2.3", "A3 · P4"); where the label's words after the
 * role name a file, a path, a script or a hash ("Första bild · anchor.png"), only the role ("Första bild").
 */
export const pictureName = (picture: Picture): string => {
  if ("named" in picture && typeof picture.named === "string" && picture.named) return picture.named;
  return TECHNICAL.test(picture.label) ? picture.label.split(" · ")[0] : picture.label;
};

/** Whose a picture is, so that a mix-up cannot pass unseen: green for the dealer's own, amber for an arm only, red else. */
export function OwnerChip({ owner, dealer, className }: { owner: Owner | null | undefined; dealer: string; className?: string }) {
  const { text, tone } = ownerWords(owner, dealer);
  return (
    <Badge tone={tone} className={className} title={tone === "bad" ? "En annan dealers bild ligger aldrig i ett utkast." : `Bilden är ${text}`}>
      {text}
    </Badge>
  );
}

export function StatusChip({ answer, size = "sm" }: { answer: Pick<OrderAnswer, "shown" | "waiting">; size?: "sm" | "md" }) {
  const chip = SHOWN_CHIP[answer.shown];
  return (
    <Badge tone={chip.tone} size={size}>
      <span aria-hidden>{chip.sign}</span> {shownWords(answer)}
    </Badge>
  );
}

const WAY_TONE = { håller: "ok", föll: "bad", oprövat: "wait" } as const;
/**
 * Whether the way a film is made holds, by the recipe (src/order-ways.ts, counted from Jakob's own verdicts): "Håller",
 * "Föll: <his words>" or "Oprövat: en pilot först", then the way in a line. `why`: also the reason an approval stops, where
 * the page shows it nowhere else.
 */
export function WayChip({ way, why = false, className }: { way: WayAnswer | null | undefined; why?: boolean; className?: string }) {
  if (!way) return null;
  return (
    <div data-way={way.state} className={cn("flex min-w-0 flex-col gap-1", className)}>
      <p className="flex min-w-0 items-center gap-2 text-xs text-dim" title={way.stop ?? way.basis}>
        <Badge tone={WAY_TONE[way.state]} className="max-w-full shrink overflow-hidden text-ellipsis">{way.chip}</Badge>
        <span className="truncate">{way.words}</span>
      </p>
      {why && way.stop ? <p data-way-stop className="rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]">{way.stop}</p> : null}
    </div>
  );
}

/** The card, magnified: the drawn pixels with the plan's outline dashed over them; the card fills about half the inset. */
export function CardInset({ src, drawn, size = 132 }: { src: string; drawn: Drawn; size?: number }) {
  const h = Math.round(size * 0.72);
  const xs = drawn.quad.map((p) => p[0]);
  const zoom = Math.min(4, Math.max(1, (size * 0.5) / Math.max(1, Math.max(...xs) - Math.min(...xs))));
  const [cx, cy] = drawn.centre;
  const left = cx * zoom - size / 2,
    top = cy * zoom - h / 2;
  const points = drawn.quad.map(([x, y]) => `${x * zoom - left},${y * zoom - top}`).join(" ");
  return (
    <div className="relative overflow-hidden rounded-md border border-white/15 shadow-pop" style={{ width: size, height: h, backgroundImage: `url(${src})`, backgroundSize: `${W * zoom}px ${H * zoom}px`, backgroundPosition: `${-left}px ${-top}px`, imageRendering: "pixelated" }}>
      <svg className="absolute inset-0" width={size} height={h} aria-hidden>
        <polygon points={points} fill="none" stroke="#e8cb85" strokeWidth={1.25} strokeDasharray="4 3" />
      </svg>
      <span className="absolute bottom-1 left-1 rounded-xs bg-black/65 px-1 text-2xs text-ink" title="Kortet förstorat; planens kontur streckad">förstorat</span>
    </div>
  );
}

function PictureViewer({ src, title, open, onOpenChange }: { src: string; title: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [close, setClose] = useState(false);
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-[#060807]" />
        <RD.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "z" || e.key === "Z") {
              setClose((c) => !c);
              e.preventDefault();
            }
          }}
          className="fixed inset-0 z-50 flex flex-col bg-[#060807] focus:outline-none"
        >
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/6 px-5">
            <RD.Title className="min-w-0 truncate font-display text-md font-semibold text-ink">{title}</RD.Title>
            <span className="text-xs text-faint">{close ? "full storlek" : "hela bilden"} · Z växlar</span>
            <div className="ml-auto flex gap-1.5">
              <IconButton label={close ? "Hela bilden" : "Full storlek"} kbd="Z" icon={close ? <Minimize2 /> : <Maximize2 />} onClick={() => setClose((c) => !c)} />
              <RD.Close asChild>
                <IconButton label="Stäng" kbd="Esc" icon={<X />} />
              </RD.Close>
            </div>
          </header>
          <div className={cn("min-h-0 flex-1", close ? "overflow-auto" : "overflow-hidden p-4")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a lab file at its own size */}
            <img src={src} alt={title} draggable={false} className={cn("select-none", close ? "max-w-none" : "size-full object-contain")} />
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** One picture of an order, with whose it is when the answer says. */
export function PictureCard({ picture, owner, dealer, planned, className }: { picture: Picture; owner?: Owner | null; dealer?: string; planned?: { quad: [number, number][]; side: "FRONT" | "BACK" } | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const src = picture.path ? labUrl(picture.path) : null;
  const drawn = picture.drawn ?? null;
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className="flex flex-wrap items-center gap-2">
        <span className="font-display text-md font-semibold text-ink">{pictureName(picture)}</span>
        {owner !== undefined && dealer ? <OwnerChip owner={owner} dealer={dealer} /> : null}
        {drawn ? (
          <Badge tone="brass" className="ml-auto">
            kortet {cardCode(drawn.target) ?? drawn.target} · {drawn.side === "BACK" ? "stängt" : "öppet"} · {offsetWords(drawn.measuredOffsetPx)}
          </Badge>
        ) : null}
      </figcaption>
      <div className="relative aspect-[1764/1174] overflow-hidden rounded-lg border border-line bg-well">
        {src ? (
          <button type="button" onClick={() => setOpen(true)} className="block size-full cursor-zoom-in" aria-label={`Visa ${pictureName(picture)} stort`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a lab file; next/image cannot optimise in a static export */}
            <img src={src} alt={pictureName(picture)} draggable={false} className="size-full object-contain" />
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,#0c110f_0_10px,#0a0e0c_10px_20px)] text-center">
            <Clock className="size-6 text-vantar" />
            <span className="text-md text-ink">Väntar på {picture.waits?.label ?? "bilden"}</span>
            <span className="max-w-[80%] text-xs text-dim">
              {picture.from?.built ? `Ritas när den är godkänd i Material: ${picture.from.built}.` : "Den kopieras hit när den är godkänd i Material."}
            </span>
            {planned ? (
              <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full" aria-label="Där kortet ritas">
                <polygon points={planned.quad.map((p) => p.join(",")).join(" ")} fill={CARD_COLOUR[planned.side]} stroke={CARD_COLOUR[planned.side]} strokeWidth={4} strokeLinejoin="round" />
                {planned.side === "FRONT" ? <CardMark quad={planned.quad} /> : null}
              </svg>
            ) : null}
          </div>
        )}
        {drawn && src ? (
          <div className="pointer-events-none absolute bottom-2 right-2">
            <CardInset src={src} drawn={drawn} />
          </div>
        ) : null}
      </div>
      <p className="truncate text-xs text-dim">
        {picture.from?.built ? `Ritad: ${picture.from.built}${drawn ? " (i rutan: kortet förstorat, planens kontur streckad)" : ""}` :picture.from?.note ? `Ur: ${picture.from.note}${picture.from.frame !== undefined ? `, ruta ${picture.from.frame}` : ""}` : picture.waits ? `Väntar på ${picture.waits.label}` : ""}
      </p>
      {drawn ? (
        // The drawn card's pixels come from a frame of another film: only the card itself is taken, nothing of the person in it.
        <p className="text-xs text-dim">
          Bara kortet är ritat in; resten är första bilden.
          {drawn.scale ? <span className="ml-1 text-[#f0b07a]">Prov: kortet {Math.round(drawn.scale * 100)} % av planens.</span> : null}
        </p>
      ) : null}
      {picture.replaced ? (
        <p className="text-xs text-[#f0b07a]">
          Bytt {swedishMoment(picture.replaced.at) ?? picture.replaced.at}, efter valet i Material. Var: {picture.replaced.was}.
        </p>
      ) : null}
      {picture.cut?.matched ? (
        <p className="text-xs text-dim">
          Det gröna är justerat till ankarets.
        </p>
      ) : null}
      {src ? <PictureViewer src={src} title={pictureName(picture)} open={open} onOpenChange={setOpen} /> : null}
    </figure>
  );
}
