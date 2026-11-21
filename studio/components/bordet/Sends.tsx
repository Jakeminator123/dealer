"use client";

// "Det här skickas" for one film of Bordet's step 3, in one glance (Jakob 2026-11-17: "Vad är det som skickas till Runway?"):
// why it cannot be ordered yet, the text it gets word for word, and the recipe with his deliberate exceptions folded under it.
// Only what step 2 does not already steer is an exception here: the hand and the side are the plan's (step 2), never chosen
// twice. A draft is made only from the list's Förhandsvisa. Once the draft is made the same panel shows the stored order
// and the way to approve it in Kön. "Förra filmen", folded: where the film has been ordered before, the takes that came of it
// (the protocol, lib/ledger.ts: the film, Jakob's verdict, the reviewer's score, the way to Granska), and nothing of the
// order's own model or text beside this recipe.
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CARD_SCALES, SHAPE_LABEL, STYLE_LABEL, TAKES_MAX, modelsFor, openEndWords, referenceCandidates, scaleWords, stepOf, stylesFor, type BankFacts, type RefCandidate } from "../../../src/order-model.ts";
import { referenceName, type FilmRow, type RowChoice } from "../../lib/bordet.ts";
import { labUrl } from "../../lib/lab.ts";
import { scoreWords, verdictWords, type LedgerRow } from "../../lib/ledger.ts";
import { orderLine, picturesInOrder, storedParts, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import { PictureCard, StatusChip } from "../order/Pictures";
import { PromptText } from "../order/PromptText";
import { Badge, SegmentedControl, Select, TextArea, buttonClasses, cn } from "../ui";
import { queueHref } from "./FilmList";

/** The last-picture choice "Utan slutbild" (RowChoice.end null, the command's --no-end). */
const NO_END = "utan-slutbild";
/** The last-picture choice "Platsens egen (receptet)" (RowChoice.end undefined): a value of its own, since "" shows "Välj…". */
const RECIPE_END = "receptets-slutbild";
/** The reference film choice "Ingen" (RowChoice.reference null): a value of its own, since "" shows "Välj…". */
const NO_REFERENCE = "ingen-referensfilm";

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

/** The takes an order brought: each film with Jakob's verdict, the reviewer's score and the way to Granska. */
function Takes({ takes }: { takes: readonly LedgerRow[] }) {
  return (
    <>
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
    </>
  );
}

export function RowSends({
  row, names, bank, dealer, choice, onChoice, made, all, last,
}: {
  row: FilmRow;
  names: Record<string, string>;
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
  const deal = step.card && step.start !== "LAND";
  // With a reference film the film's length follows it (secondsOf): no length to choose then.
  const durations = model?.durations && !line.reference ? Array.from({ length: Math.min(model.durations[1], 10) - model.durations[0] + 1 }, (_, i) => model.durations![0] + i) : [];
  const candidates: RefCandidate[] = model?.videos && bank ? referenceCandidates(bank, { dealer, step, target: row.wish.target, model }).filter((c) => c.fits) : [];
  const words = row.text ? row.text.trim().split(/\s+/).length : 0;
  return (
    <div data-sends={row.key} className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="shrink-0 whitespace-nowrap font-mono text-md font-semibold text-ink">{row.line}</h2>
        <span className="min-w-0 truncate text-xs text-dim">{row.label}</span>
        {row.chosen ? (
          <button type="button" onClick={() => onChoice(null)} className="ml-auto shrink-0 text-xs text-dim hover:text-ink hover:underline">
            Tillbaka till receptet
          </button>
        ) : null}
      </div>
      {!row.orderable && row.why ? (
        <p data-why className="rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]">
          Kan inte beställas än: {row.why}.
        </p>
      ) : null}
      {row.text ? (
        <details data-text className="rounded-md border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm text-ink">
            Texten <span className="text-xs text-dim">· {words} ord, som den skickas</span>
          </summary>
          <p className="mt-2 select-text whitespace-pre-wrap text-sm leading-6 text-ink">{row.text}</p>
        </details>
      ) : null}
      <details data-exceptions className="rounded-md border border-line px-3 py-2" open={row.chosen}>
        <summary className="cursor-pointer text-sm text-ink">
          Receptet <span className="text-xs text-dim">· {row.recipe}{line.takes > 1 ? ` · ${line.takes} tagningar` : ""}</span>
          <span className="ml-2 text-xs text-brass-hi">{row.chosen ? "undantag gjort" : "gör ett undantag"}</span>
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <Row label="Modell">
            <SegmentedControl size="sm" label="Modell" className="max-w-full flex-wrap" value={model?.id ?? ""} onChange={(id) => onChoice({ model: id })} options={modelsFor(step).filter((m) => !m.off).map((m) => ({ value: m.id, label: m.label }))} />
          </Row>
          {durations.length ? (
            <Row label="Längd, sekunder">
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
              <Select size="sm" aria-label="Referensfilm" value={line.reference?.take ?? NO_REFERENCE} onChange={(v) => onChoice({ reference: v === NO_REFERENCE ? null : v })} options={[{ value: NO_REFERENCE, label: "Ingen" }, ...candidates.map((c) => ({ value: c.take, label: referenceName(c, names), hint: c.kind === "RENDERED" ? (c.doll ? `dockan ${c.doll}` : "dockan") : c.verdict === "GODKÄND" ? "godkänd" : c.verdict.toLowerCase() }))]} className="w-56" />
            </Row>
          ) : null}
          {deal && line.shape === "ONE_WAY" ? (
            <Row label="Slutbild">
              <Select size="sm" aria-label="Slutbild" value={choice.end === null ? NO_END : (choice.end ?? RECIPE_END)} onChange={(v) => onChoice({ end: v === NO_END ? null : v === RECIPE_END ? undefined : v })} options={[{ value: RECIPE_END, label: "Platsens egen (receptet)" }, ...line.endChoices.map((e, i) => ({ value: e.id, label: e.name ?? `Kandidat ${i + 1}`, hint: "kandidat, undantag" })), { value: NO_END, label: "Utan slutbild", hint: "undantag" }]} className="w-56" />
            </Row>
          ) : null}
          {deal && line.shape === "ONE_WAY" && choice.end === null && row.wish.target ? <p className="text-xs text-dim">Undantag: {openEndWords(row.wish.target)}.</p> : null}
          {deal && line.shape === "ROUND_TRIP" ? (
            <Row label="Kortets storlek">
              <SegmentedControl size="sm" label="Kortets storlek i den här beställningen" value={choice.cardScale ?? 1} onChange={(f) => onChoice({ cardScale: f })} options={CARD_SCALES.map((f) => ({ value: f, label: scaleWords(f) }))} />
            </Row>
          ) : null}
          <TextArea label="Eget tillägg (engelska)" value={choice.extra ?? line.recipe?.extra ?? ""} maxLength={600} rows={2} onChange={(e) => onChoice({ extra: e.target.value })} />
        </div>
      </details>
      {last ? (
        <details data-last className="rounded-md border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm text-ink">
            Förra filmen
            <span className="text-xs text-dim">{last.takes.length ? ` · ${last.takes.length} ${last.takes.length === 1 ? "tagning" : "tagningar"}` : " · ingen film än"}</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {last.takes.length ? (
              <Takes takes={last.takes} />
            ) : (
              <p className="flex flex-wrap items-center gap-2 text-sm text-dim">
                <StatusChip answer={last.answer} />
                <Link href={queueHref(last.answer.order.id)} className="text-brass-hi hover:underline">
                  Öppna i Kön
                </Link>
              </p>
            )}
          </div>
        </details>
      ) : null}
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

/** A draft made from a row: what the store will send (pictures, reference film, text), and the way to approve it in Kön. */
export function DraftSends({ answer, all, names, takes = [] }: { answer: OrderAnswer; all: OrdersAnswer; names: Record<string, string>; takes?: LedgerRow[] }) {
  const { order } = answer;
  const pictures = picturesInOrder(order.pictures).filter((p) => p.goesAs !== "referenceImage");
  const dealer = all.dealers?.find((d) => d.id === order.dealer);
  const parts = storedParts(order, dealer?.look, all.plan, dealer?.name ?? order.dealer);
  const ref = order.reference.status === "FINNS" ? order.reference : null;
  return (
    <div data-draft className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip answer={answer} />
        {/* his notation, not the title stored with the order (older words, sometimes a film's id) */}
        <span className="truncate font-mono text-sm text-ink">{orderLine(order) ?? stepOf(order.step.key)?.label ?? order.step.label}</span>
      </div>
      {takes.length ? (
        <Part title="Filmen som kom">
          <Takes takes={takes} />
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
      <Link href={queueHref(order.id)} className={buttonClasses({ variant: "secondary", size: "sm", className: "self-start" })}>
        <ExternalLink />
        Det här skickas · godkänn i Kön
      </Link>
    </div>
  );
}
