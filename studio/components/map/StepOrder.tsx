"use client";

// The panel of a step of a tree that has no film (saknas) or one that waits (prov): its first and last picture side by side,
// what an order of it has and lacks (first and last picture, reference film, recipe) as the lab reads them
// (tools/dealer-tree.ts orderFacts), the estimated price, and the command that makes a draft of it, with a copy button. The
// panel only shows: it orders nothing, approves nothing and runs no command (Beställ and tools/order-new.ts do that).
import { ArrowRight, Check, Copy, Film, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Need, TreeView, ViewStep } from "../../../src/dealer-trees.ts";
import { Button, Sheet, buttonClasses, cn, useToast } from "@/components/ui";
import type { EntryAnswer } from "@/lib/media";
import { ProofStill } from "../proofs";
import { coverOfEntry } from "../material/Tile";

export const STEP_SHEET_W = 440;
const STATE_LINE = { prov: "Prov: väntar på dom", saknas: "Saknas", finns: "Finns" } as const;

function Still({ entry, code }: { entry: EntryAnswer | null; code: string }) {
  const cover = entry ? coverOfEntry(entry) : null;
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      <div className={cn("relative aspect-[4/3] overflow-hidden rounded-md", cover ? "border border-line-strong bg-well" : "border border-dashed border-line-strong")}>
        {cover ? <ProofStill cover={cover} fps={entry?.fps ?? 30} className="absolute inset-0" /> : <span className="absolute inset-0 grid place-items-center text-xs text-faint">ingen bild</span>}
      </div>
      <figcaption className="text-xs font-medium text-ink">{code}</figcaption>
    </figure>
  );
}

function Row({ label, need }: { label: string; need: Need }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-5">
      <span aria-label={need.ok ? "finns" : "saknas"} className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full", need.ok ? "bg-godkand/20 text-[#6cc595]" : "bg-underkand/20 text-[#ef8b8b]")}>
        {need.ok ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <span className="w-[92px] shrink-0 text-dim">{label}</span>
      <span className="min-w-0 break-words text-ink">{need.what}</span>
    </li>
  );
}

export function StepOrder({ view, step, media, onClose, onOpenFilms }: { view: TreeView; step: ViewStep | null; media: ReadonlyMap<string, EntryAnswer>; onClose: () => void; onOpenFilms: (() => void) | null }) {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const shown = step && step.state !== "finns" ? step : null;
  const pic = (node: string) => {
    const n = view.nodes.find((x) => x.node === node);
    return { entry: n?.entry ? (media.get(n.entry) ?? null) : null, code: n?.code ?? node };
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast({ tone: "ok", title: "Kommandot är kopierat" });
    } catch {
      toast({ tone: "bad", title: "Kunde inte kopiera", detail: "Markera texten och kopiera den själv." });
    }
  };
  const order = shown?.order ?? null;
  const from = shown ? pic(shown.from) : null;
  const to = shown ? pic(shown.to) : null;
  return (
    <Sheet open={!!shown} onOpenChange={(open) => !open && onClose()} title={shown?.name ?? ""} subtitle={shown ? `${view.tree.name} · ${STATE_LINE[shown.state]}` : ""} width={STEP_SHEET_W}>
      {shown && from && to ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <Still entry={from.entry} code={from.code} />
            <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
            <Still entry={to.entry} code={to.code} />
          </div>

          {shown.state === "prov" ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised px-3 py-2 text-sm">
              {shown.take ? (
                <span>
                  Väntar på din dom:{" "}
                  <Link href={`/granska/?tagning=${encodeURIComponent(shown.take)}`} className="font-medium text-brass-hi hover:underline">
                    {shown.take}
                  </Link>
                </span>
              ) : null}
              {shown.deliveries.length ? <span className="text-dim">Levererad, inte i banken än: {shown.deliveries.join(", ")}</span> : null}
            </div>
          ) : null}

          {view.tree.state === "vilar" ? <p className="text-sm text-dim">{view.tree.name} vilar: inget beställs till trädet nu.</p> : null}

          {order ? (
            <>
              <ul className="flex flex-col gap-2">
                <Row label="Första bild" need={order.first} />
                <Row label="Sista bild" need={order.last} />
                <Row label="Referensfilm" need={order.reference} />
                <Row label="Recept" need={order.recipe} />
              </ul>
              <p className="text-sm text-dim">
                {order.price !== null ? (
                  <>
                    Pris: <span className="font-medium tabular-nums text-ink">≈ {order.price} krediter</span> (skattat, värsta fallet)
                  </>
                ) : (
                  "Pris: kan inte skattas utan recept."
                )}
              </p>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-dim">Ett utkast av steget görs med</span>
                <div className="flex items-stretch gap-2">
                  <code className="min-w-0 flex-1 select-all break-all rounded-md border border-line bg-well px-2.5 py-2 font-mono text-[12.5px] leading-5 text-ink">{order.command}</code>
                  <Button variant="secondary" size="md" icon={copied === order.command ? <Check /> : <Copy />} onClick={() => void copy(order.command)} className="h-auto">
                    Kopiera
                  </Button>
                </div>
                <span className="text-xs text-faint">Utkastet godkänns och läggs i Beställ; panelen beställer inget.</span>
              </div>
            </>
          ) : null}

          {onOpenFilms ? (
            <button type="button" onClick={onOpenFilms} className={buttonClasses({ variant: "quiet", size: "sm", className: "self-start" })}>
              <Film /> Stegets filmer i banken
            </button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
