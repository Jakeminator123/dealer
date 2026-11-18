"use client";

// "Det här skickas" for one film of Bordet's list, in one glance (Jakob 2026-11-17: "Vad är det som skickas till Runway?"):
// exactly what goes and nothing else. Before a draft exists: the first picture, the last picture (the anchor with the card
// drawn where the plan lays it, marked so), the reference film by whose film it is or "ingen referensfilm", the text word for
// word (promptFor, the function the store writes the draft's text with) and model, length and takes: all of it the step's one
// recipe as the store will resolve it (lib/bordet.ts lineOf). Under it, folded, the exceptions he can make against the recipe,
// by name only (no descriptions that never go to Runway); how the card turns is not among them: the recipe says it (Jakob
// 2026-11-18: "litew skitsamma vilken vridning som gjörs", as long as every turn is a good one). After the draft is made: the same from the
// stored order (its pictures, its reference film, its text, the call's values), and the way to its "Det här skickas" with
// the approval. No card path and no JSON of the plan is ever sent.
// Granska filmen (the sketch's step 4): where the film has been ordered before, its last order with the takes that came of
// it (the protocol, lib/ledger.ts: the film, Jakob's verdict, the reviewer's score, the way to Granska) beside everything
// that was sent for it.
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  CARD_SCALES, HAND_CHOICES, HAND_LABEL, LANDS_LABEL, SHAPE_LABEL, STYLE_LABEL, TAKES_MAX, credits, handChoiceOf, modelsFor, referenceCandidates, scaleWords, stepOf, stylesFor,
  type BankFacts, type PlanAnswer, type RefCandidate,
} from "../../../src/order-model.ts";
import { referenceName, type FilmRow, type RowChoice, type Sends } from "../../lib/bordet.ts";
import { labUrl } from "../../lib/lab.ts";
import { scoreWords, verdictWords, type LedgerRow } from "../../lib/ledger.ts";
import { paramRows, picturesInOrder, storedParts, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import { PictureCard, PreviewPicture, StatusChip } from "../order/Pictures";
import { PromptText } from "../order/PromptText";
import { Badge, SegmentedControl, Select, TextArea, buttonClasses, cn } from "../ui";

const served = (e: Sends["first"]["entry"]) => (e?.served && !e.served.endsWith(".mp4") ? labUrl(e.served) : null);
const frameOf = (e: Sends["first"]["entry"]) => (e?.served?.endsWith(".mp4") && e.frame !== undefined ? { video: labUrl(e.served), time: (e.frame + 0.5) / (e.fps ?? 24) } : null);

function Part({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
        {title}
        {aside ? <span className="ml-auto font-normal normal-case tracking-normal text-dim">{aside}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/** The reference film that goes, by whose film it is, with the film itself; or "ingen referensfilm". */
function Reference({ film, wanted, names }: { film: { path: string; dealer: string; edge: string; goesTo: string | null } | null; wanted: boolean; names: Record<string, string> }) {
  if (!film) return <p className={cn("text-sm", wanted ? "text-[#f0b07a]" : "text-dim")}>{wanted ? "Receptet vill ha en referensfilm, och ingen finns till platsen: inget beställs utan den." : "Ingen referensfilm"}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <p data-reference className="text-sm font-medium text-ink">
        {referenceName(film, names)}
      </p>
      <video src={labUrl(film.path)} controls muted playsInline preload="metadata" className="w-full rounded-md border border-line bg-well" />
    </div>
  );
}

export function RowSends({
  row, sends, names, plan, bank, dealer, choice, onChoice, made, all, last,
}: {
  row: FilmRow;
  sends: Sends | null;
  names: Record<string, string>;
  plan: PlanAnswer | null;
  bank: BankFacts | null;
  dealer: string;
  choice: RowChoice;
  onChoice: (patch: RowChoice | null) => void;
  /** The draft made from the row, as the store answers it, or null. */
  made: OrderAnswer | null;
  all: OrdersAnswer | null;
  /** The film's last order before this list (the same dealer, step and card), with the protocol's rows of its takes. */
  last: { answer: OrderAnswer; takes: LedgerRow[] } | null;
}) {
  if (made && all) return <DraftSends answer={made} all={all} names={names} takes={last?.answer.order.id === made.order.id ? last.takes : []} />;
  const step = stepOf(row.wish.step)!;
  // What the store will resolve for the row: the recipe, with his exceptions over it.
  const line = row.resolved;
  const model = line.model;
  const seat = row.wish.target ? (plan?.seats[row.wish.target] ?? null) : null;
  const deal = step.card && step.start !== "LAND";
  const durations = model?.durations ? Array.from({ length: Math.min(model.durations[1], 10) - model.durations[0] + 1 }, (_, i) => model.durations![0] + i) : [];
  const candidates: RefCandidate[] = model?.videos && bank ? referenceCandidates(bank, { dealer, step, target: row.wish.target, model }).filter((c) => c.fits) : [];
  const side = line.side;
  const hand = handChoiceOf(line.hands);
  // the pictures are the dealer's own: her anchors (a picture of another dealer never goes in a draft)
  const own = { dealer, name: names[dealer] ?? dealer, part: "whole" as const };
  return (
    <div data-sends={row.key} className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-md font-semibold text-ink">{row.line}</h2>
        {row.chosen ? (
          <button type="button" onClick={() => onChoice(null)} className="ml-auto text-xs text-dim hover:text-ink hover:underline">
            Tillbaka till receptet
          </button>
        ) : null}
      </div>
      {row.why ? (
        <p data-why className="rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]">
          Kan inte beställas än: {row.why}.
        </p>
      ) : null}
      {sends ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <PreviewPicture src={served(sends.first.entry)} frame={frameOf(sends.first.entry)} name={sends.first.name} owner={own} dealer={dealer} waiting={sends.first.waiting} cards={sends.first.cards} drawn={sends.first.cards.length > 0} />
            <PreviewPicture src={served(sends.last.entry)} frame={frameOf(sends.last.entry)} name={sends.last.name} owner={own} dealer={dealer} waiting={sends.last.waiting} cards={sends.last.cards} drawn={sends.last.cards.length > 0} />
          </div>
          {sends.drawn ? <p className="-mt-2 text-xs text-brass-hi">Kortet i sista bilden ritas från kortplanen, i filmernas gula eller blå.</p> : null}
          <Part title="Referensfilm">
            <Reference film={row.reference} wanted={row.wanted} names={names} />
          </Part>
          <Part title="Texten" aside={sends.prompt ? `${STYLE_LABEL[sends.prompt.style]} · ${sends.prompt.text.split(/\s+/).filter(Boolean).length} ord` : undefined}>
            {sends.prompt ? <PromptText text={sends.prompt.text} parts={sends.prompt.parts} /> : <p className="text-sm text-[#f0b07a]">Dealerns utseende saknas i svaret: texten kan inte visas.</p>}
          </Part>
          <p data-values className="text-sm tabular-nums text-ink">
            {sends.model} · {sends.seconds ? `${sends.seconds} s · ` : ""}
            {sends.resolution} · {sends.takes} {sends.takes === 1 ? "tagning" : "tagningar"}
            {row.cost !== null ? ` · ${credits(row.cost)} krediter` : ""}
          </p>
        </>
      ) : row.why ? null : (
        <p className="text-sm text-dim">Inget skickas för den här.</p>
      )}
      {last && all ? (
        <details data-last={last.answer.order.id} className="rounded-md border border-line px-3 py-2" open={last.takes.some((t) => !!t.see.film)}>
          <summary className="cursor-pointer text-sm text-ink">
            Granska filmen · förra beställningen {last.answer.order.id}
            {last.takes.length ? ` · ${last.takes.length} ${last.takes.length === 1 ? "tagning" : "tagningar"}` : ""}
          </summary>
          <div className="mt-3">
            <DraftSends answer={last.answer} all={all} names={names} takes={last.takes} />
          </div>
        </details>
      ) : null}
      <details data-exceptions className="rounded-md border border-line px-3 py-2" open={row.chosen}>
        <summary className="cursor-pointer text-sm text-ink">
          Receptet <span className="text-xs text-dim">· {row.recipe}</span>
          <span className="ml-2 text-xs text-brass-hi">{row.chosen ? "undantag gjort" : "gör ett undantag"}</span>
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <Row label="Modell">
            <SegmentedControl size="sm" label="Modell" className="max-w-full flex-wrap" value={model?.id ?? ""} onChange={(id) => onChoice({ model: id })} options={modelsFor(step).filter((m) => !m.off).map((m) => ({ value: m.id, label: m.label }))} />
          </Row>
          {durations.length ? (
            <Row label="Längd">
              <SegmentedControl size="sm" label="Längd" className="max-w-full flex-wrap" value={line.seconds ?? 0} onChange={(d) => onChoice({ duration: d })} options={durations.map((d) => ({ value: d, label: `${d}` }))} />
            </Row>
          ) : null}
          <Row label="Tagningar">
            <SegmentedControl size="sm" label="Tagningar" value={line.takes} onChange={(n) => onChoice({ takes: n })} options={Array.from({ length: TAKES_MAX }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
          </Row>
          {stylesFor(step.kind, step).length > 1 ? (
            <Row label="Text">
              <SegmentedControl size="sm" label="Text" value={line.style} onChange={(s) => onChoice({ style: s })} options={stylesFor(step.kind, step).filter((s) => s !== "UTFÖRLIG").map((s) => ({ value: s, label: STYLE_LABEL[s] }))} />
            </Row>
          ) : null}
          {deal ? (
            <Row label="Form">
              <SegmentedControl size="sm" label="Bara dit eller tur och retur" value={line.shape ?? "ONE_WAY"} onChange={(s) => onChoice({ shape: s })} options={(["ONE_WAY", "ROUND_TRIP"] as const).map((s) => ({ value: s, label: SHAPE_LABEL[s] }))} />
            </Row>
          ) : null}
          {model?.videos ? (
            <Row label="Referensfilm">
              <Select size="sm" aria-label="Referensfilm" value={line.reference?.take ?? ""} onChange={(v) => onChoice({ reference: v || null })} options={[{ value: "", label: "Ingen" }, ...candidates.map((c) => ({ value: c.take, label: referenceName(c, names), hint: c.kind === "RENDERED" ? "dockan" : c.verdict === "GODKÄND" ? "godkänd" : c.verdict.toLowerCase() }))]} className="w-56" />
            </Row>
          ) : null}
          {step.card ? (
            <>
              {step.grip !== "TWO_HANDS" ? (
                <Row label="Hand">
                  <SegmentedControl size="sm" label="Hand" value={hand} onChange={(h) => onChoice({ hand: h })} options={HAND_CHOICES.map((h) => ({ value: h, label: HAND_LABEL[h].replace(" hela vägen", "") }))} />
                </Row>
              ) : null}
              {/* The last picture of a deal bara dit shows the card's side, so the side is chosen only where the last picture is drawn. */}
              {!deal || line.shape === "ROUND_TRIP" ? (
                <Row label="Sidan">
                  <SegmentedControl size="sm" label="Hur kortet landar" value={side} onChange={(s) => onChoice({ side: s })} options={(["BACK", "FRONT"] as const).map((s) => ({ value: s, label: LANDS_LABEL[s] }))} />
                </Row>
              ) : null}
              {deal && line.shape === "ROUND_TRIP" ? (
                <Row label="Kortets storlek">
                  <SegmentedControl size="sm" label="Kortets storlek i den här beställningen" value={choice.cardScale ?? 1} onChange={(f) => onChoice({ cardScale: f })} options={CARD_SCALES.map((f) => ({ value: f, label: scaleWords(f) }))} />
                </Row>
              ) : null}
            </>
          ) : null}
          <TextArea label="Eget tillägg (engelska)" value={choice.extra ?? line.recipe?.extra ?? ""} maxLength={600} rows={2} onChange={(e) => onChoice({ extra: e.target.value })} />
        </div>
      </details>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-dim">{label}</span>
      {children}
    </div>
  );
}

/** A draft made from a row: the same, from the stored order (what the store will send), and the way to approve it. */
export function DraftSends({ answer, all, names, takes = [] }: { answer: OrderAnswer; all: OrdersAnswer; names: Record<string, string>; takes?: LedgerRow[] }) {
  const { order } = answer;
  const pictures = picturesInOrder(order.pictures).filter((p) => p.goesAs !== "referenceImage");
  const dealer = all.dealers?.find((d) => d.id === order.dealer);
  const parts = storedParts(order, dealer?.look, all.plan, dealer?.name ?? order.dealer);
  const values = paramRows(order).filter((r) => !r.picture && r.name !== "verktyg");
  const ref = order.reference.status === "FINNS" ? order.reference : null;
  return (
    <div data-draft={order.id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip answer={answer} />
        <span className="truncate text-sm text-ink">{order.title}</span>
      </div>
      {takes.length ? (
        <Part title="Filmen som kom">
          {takes.map((t) => (
            <div key={t.key} data-take={t.key} className="flex flex-col gap-1.5">
              {t.see.film ? <video src={labUrl(t.see.film)} controls muted playsInline preload="metadata" className="w-full rounded-md border border-line bg-well" /> : <p className="text-sm text-dim">{t.status.label}</p>}
              <p className="flex flex-wrap items-center gap-2 text-xs text-dim">
                <span className="text-ink">Tagning {t.take}</span>
                <Badge tone={t.owner.verdict === "underkand" ? "bad" : t.owner.verdict === "vantar" ? "wait" : "ok"}>{verdictWords(t.owner)}</Badge>
                {t.reviewer ? <span>granskaren {scoreWords(t.reviewer.score)}/5</span> : null}
                {t.see.review ? (
                  <Link href={t.see.review} className="text-brass-hi hover:underline">
                    Döm i Granska
                  </Link>
                ) : null}
              </p>
            </div>
          ))}
          <p className="text-xs text-faint">Det som skickades för filmen står under den.</p>
        </Part>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {pictures.map((p) => (
          <PictureCard key={p.name} picture={p} owner={answer.owners ? (answer.owners[p.name] ?? null) : undefined} dealer={order.dealer} />
        ))}
      </div>
      <Part title="Referensfilm">
        <Reference film={ref ? { path: ref.path, dealer: ref.dealer ?? order.dealer, edge: ref.from?.edge ?? (ref.goesTo ? `READY>${ref.goesTo}` : ""), goesTo: ref.goesTo ?? null } : null} wanted={order.reference.status === "SAKNAS"} names={names} />
      </Part>
      <Part title="Texten">
        <PromptText text={order.prompt.text} parts={parts} />
      </Part>
      <Part title="Värdena">
        <p className="font-mono text-xs leading-5 text-ink">{values.map((r) => `${r.name}: ${r.value}`).join(" · ")}</p>
      </Part>
      <Link href={`/bordet/?lage=bestall&ko=1&order=${encodeURIComponent(order.id)}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "self-start" })}>
        <ExternalLink />
        Det här skickas · godkänn
      </Link>
      <Badge tone="neutral" className="self-start">
        data/orders/{order.id}.json
      </Badge>
    </div>
  );
}
