"use client";

// The pictures of an order, large: what each is in the call (startFrame, endFrame, referenceImages · @pose), where it comes
// from, and on a picture with a drawn card a magnified inset of the card with the plan's outline over it and "1,1 px från
// planen". A picture that waits shows what it waits for; a preview (the card drawn on a stand-in) says so in amber and is
// never sent. A click opens the picture over the whole window (Z: full size, Esc closes).
import * as RD from "@radix-ui/react-dialog";
import { Clock, Maximize2, Minimize2, X } from "lucide-react";
import { useState } from "react";
import { labUrl } from "../../lib/lab.ts";
import { SHOWN_CHIP, goesWords, offsetWords, shownWords, type OrderAnswer, type Picture } from "../../lib/orders.ts";
import type { Drawn } from "../../../src/order-model.ts";
import { Badge, IconButton, cn } from "../ui";

const W = 1764,
  H = 1174;

export function StatusChip({ answer, size = "sm" }: { answer: Pick<OrderAnswer, "shown" | "waiting">; size?: "sm" | "md" }) {
  const chip = SHOWN_CHIP[answer.shown];
  return (
    <Badge tone={chip.tone} size={size}>
      <span aria-hidden>{chip.sign}</span> {shownWords(answer)}
    </Badge>
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

/** One picture of an order. */
export function PictureCard({ picture, className }: { picture: Picture; className?: string }) {
  const [open, setOpen] = useState(false);
  const own = picture.path ? labUrl(picture.path) : null;
  const preview = !own && picture.preview ? labUrl(picture.preview.path) : null;
  const src = own ?? preview;
  const drawn = picture.drawn ?? picture.preview?.drawn ?? null;
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className="flex items-baseline gap-2">
        <span className="font-display text-md font-semibold text-ink">{picture.label}</span>
        <code className="truncate font-mono text-xs text-faint">{goesWords(picture)}</code>
        {drawn ? (
          <Badge tone={preview ? "remark" : "brass"} className="ml-auto">
            kortet {drawn.target} · {offsetWords(drawn.measuredOffsetPx)}
          </Badge>
        ) : null}
      </figcaption>
      <div className={cn("relative aspect-[1764/1174] overflow-hidden rounded-lg border bg-well", preview ? "border-anmarkning/50" : "border-line")}>
        {src ? (
          <button type="button" onClick={() => setOpen(true)} className="block size-full cursor-zoom-in" aria-label={`Visa ${picture.label} stort`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a lab file; next/image cannot optimise in a static export */}
            <img src={src} alt={picture.label} draggable={false} className={cn("size-full object-contain", preview && "opacity-80")} />
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,#0c110f_0_10px,#0a0e0c_10px_20px)] text-center">
            <Clock className="size-6 text-vantar" />
            <span className="text-md text-ink">Väntar på {picture.waits?.label ?? "bilden"}</span>
            <span className="max-w-[80%] text-xs text-dim">Den skapas och kopieras hit när den är godkänd i Material.</span>
          </div>
        )}
        {preview ? <span className="pointer-events-none absolute left-2 top-2 rounded-xs bg-[#2a1c0f]/90 px-1.5 py-0.5 text-2xs font-medium text-[#f0b07a]">Förhandsvisning · skickas inte</span> : null}
        {drawn && src ? (
          <div className="pointer-events-none absolute bottom-2 right-2">
            <CardInset src={src} drawn={drawn} />
          </div>
        ) : null}
      </div>
      {preview ? <p className="text-xs text-[#f0b07a]">{picture.preview!.note}</p> : null}
      <p className="truncate text-xs text-dim" title={picture.from?.path ?? undefined}>
        {picture.from?.built ? `Ritad: ${picture.from.built}${drawn ? " (i rutan: kortet förstorat, planens kontur streckad)" : ""}` :picture.from?.note ? `Ur: ${picture.from.note}${picture.from.frame !== undefined ? `, ruta ${picture.from.frame}` : ""}` : picture.waits ? `Väntar på ${picture.waits.label}` : ""}
        {picture.sha256 ? <span className="ml-2 font-mono text-faint">sha256 {picture.sha256.slice(0, 12)}</span> : null}
      </p>
      {src ? <PictureViewer src={src} title={picture.label} open={open} onOpenChange={setOpen} /> : null}
    </figure>
  );
}
