"use client";

// The panel of a step of a tree that has no film (saknas) or one that waits (prov): its first and last picture side by side
// (a click opens one large),
// what an order of it has and lacks (first and last picture, reference film, recipe) as the lab reads them
// (tools/dealer-tree.ts orderFacts), and, unless the tree rests, the estimated price and the command that makes a draft of
// it, with a copy button. The step's takes that did not hold lie in Granska, a link away. The panel only shows: it orders
// nothing, approves nothing and runs no command (Beställ and tools/order-new.ts do that).
import { ArrowRight, ArrowUpRight, Check, Copy, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Need, TreeView, ViewStep } from "../../../src/dealer-trees.ts";
import { Button, Sheet, cn, useToast } from "@/components/ui";
import { useBank } from "@/lib/bank";
import type { EntryAnswer } from "@/lib/media";
import { takeName } from "@/lib/names";
import { ProofStill } from "../proofs";
import { coverOfEntry } from "../material/Tile";

export const STEP_SHEET_W = 440;
const STATE_LINE = { prov: "Prov: väntar på dom", saknas: "Saknas", finns: "Finns" } as const;

/** One of the step's two pictures; a click opens it large. */
function Still({ entry, code, onOpen }: { entry: EntryAnswer | null; code: string; onOpen?: (entry: EntryAnswer) => void }) {
  const cover = entry ? coverOfEntry(entry) : null;
  const box = cn("relative block aspect-[4/3] w-full overflow-hidden rounded-md", cover ? "border border-line-strong bg-well" : "border border-dashed border-line-strong");
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      {cover && entry && onOpen ? (
        <button type="button" aria-label={`${code}: visa stort`} onClick={() => onOpen(entry)} className={cn(box, "cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass")}>
          <ProofStill cover={cover} fps={entry.fps ?? 30} className="absolute inset-0" />
        </button>
      ) : (
        <div className={box}>
          {cover ? <ProofStill cover={cover} fps={entry?.fps ?? 30} className="absolute inset-0" /> : <span className="absolute inset-0 grid place-items-center text-xs text-faint">ingen bild</span>}
        </div>
      )}
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

/** The command with its quoted step kept on one line: "A1 - A1" and "A2.3 - A3P4C2" are never broken. */
function Command({ text }: { text: string }) {
  const at = text.indexOf('"');
  return at < 0 ? text : (
    <>
      {text.slice(0, at)}
      <span className="whitespace-nowrap">{text.slice(at)}</span>
    </>
  );
}

export function StepOrder({ view, step, media, onClose, onOpen }: { view: TreeView; step: ViewStep | null; media: ReadonlyMap<string, EntryAnswer>; onClose: () => void; onOpen?: (entry: EntryAnswer) => void }) {
  const toast = useToast();
  const { graph } = useBank();
  const [copied, setCopied] = useState<string | null>(null);
  const shown = step && step.state !== "finns" ? step : null;
  // The take waiting for his verdict, by its name in his words (never its id).
  const waits = shown?.state === "prov" && shown.take ? shown.take : null;
  const waiting = waits ? (graph?.takes[waits] ?? null) : null;
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
            <Still entry={from.entry} code={from.code} onOpen={onOpen} />
            <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
            <Still entry={to.entry} code={to.code} onOpen={onOpen} />
          </div>

          {shown.state === "prov" ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised px-3 py-2 text-sm">
              {shown.take ? (
                <span>
                  Väntar på din dom:{" "}
                  <Link href={`/granska/?tagning=${encodeURIComponent(shown.take)}`} className="font-medium text-brass-hi hover:underline">
                    {waiting ? takeName(waiting, graph?.edge[waiting.edge]?.takes) : "öppna i Granska"}
                  </Link>
                </span>
              ) : null}
              {shown.deliveries.length ? <span className="text-dim">Levererad, inte i banken än{shown.deliveries.length > 1 ? ` (${shown.deliveries.length})` : ""}</span> : null}
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
              {view.tree.state !== "vilar" ? (
                <>
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
                      <code className="min-w-0 flex-1 select-all break-words rounded-md border border-line bg-well px-2.5 py-2 font-mono text-[12.5px] leading-5 text-ink">
                        <Command text={order.command} />
                      </code>
                      <Button variant="secondary" size="md" icon={copied === order.command ? <Check /> : <Copy />} onClick={() => void copy(order.command)} className="h-auto">
                        Kopiera
                      </Button>
                    </div>
                    <span className="text-xs text-faint">Utkastet godkänns och läggs i Beställ; panelen beställer inget.</span>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {/* A step without a film whose takes all fell (rejected, failed): they lie in Granska; Karta's films panel shows none of them. */}
          {shown.takes > 0 && !waits ? (
            <Link href={{ pathname: "/granska/", query: { vy: "alla" } }} className="inline-flex items-center gap-1 self-start text-xs text-faint hover:text-ink">
              {shown.takes} {shown.takes === 1 ? "tagning" : "tagningar"} i Granska
              <ArrowUpRight className="size-3" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
