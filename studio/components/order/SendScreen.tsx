"use client";

// "Det här skickas" in Kön: one order exactly as it would go out. One line on what it makes and its choices in words (hand,
// closed or open, the turn), the group it belongs to with its other seats, the pictures large at the top (first,
// in-between, last; or the dealer's picture and the pose), each with whose it is and, when a draft followed a newer anchor
// in Material, what it was before; then the exact text in full (selectable; the parts a choice made, Jakob's addition and
// the bans marked, from the same function the text was written with), the model with its length and what it is known and
// not known to do, the takes and the cost, and whether anything can be approved now (orderingState). A draft can change its
// takes and free addition here (the hand, the side and the turn are the plan's and the recipe's), and fetch its pictures
// again when something has changed; "Godkänn och lägg i kön" freezes it, after which nothing in it changes. Writes only on
// Jakob's click.
import { ArrowLeft, Check, ClipboardCopy, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { asApiError } from "../../lib/api.ts";
import { labUrl } from "../../lib/lab.ts";
import { swedishMoment } from "../../lib/mode.ts";
import { referenceName } from "../../lib/bordet.ts";
import { mandateText } from "../../lib/verdict.ts";
import { cardCode } from "../../lib/names.ts";
import { approveOrder, changeOrder, costWords, motionWords, orderLine, orderingState, picturesInOrder, refreshOrder, storedParts, styleWords, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import { MODELS, REF_VERDICT_LABEL, SHOWN_LABEL, approvalWords, SHAPE_LABEL, TAKES_MAX, credits, genitive, groupBudget, scaleWords, seatWords, stepOf, takeStates, waitWords } from "../../../src/order-model.ts";
import { Badge, Button, Dialog, SegmentedControl, TextArea, cn, useToast } from "../ui";
import { PictureCard, StatusChip } from "./Pictures";
import { PromptText } from "./PromptText";
import { QueueFrame } from "./QueueFrame";

function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      <header className="flex items-baseline gap-3 border-b border-line pb-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-faint">{title}</h2>
        {aside ? <div className="ml-auto flex items-center gap-2 text-xs text-dim">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

const capital = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
/** A note stored with the order, without a command in brackets ("(node tools/…)") or a register's path ("ur data/….json"). */
const noteWords = (note: string) => note.replace(/\s*\((?:node|python)\s[^)]*\)/g, "").replace(/\s+ur\s+data\/[\w./-]+\.json/g, "");

/** A draft's own choices (its takes, Jakob's addition); mounted anew when the saved addition changes, so the field starts from what is saved. */
function Edit({ answer, onSaved }: { answer: OrderAnswer; onSaved: (a: OrderAnswer) => void }) {
  const { order } = answer;
  const [extra, setExtra] = useState(order.prompt.extra ?? "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (change: Parameters<typeof changeOrder>[1]) => {
    setBusy(true);
    try {
      onSaved(await changeOrder(order.id, change, answer.revision));
    } catch (error) {
      toast({ tone: "bad", title: asApiError(error, "Ändringen").message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Ändra utkastet">
      <div className="flex items-center gap-3">
        <span className="text-sm text-dim">Tagningar</span>
        <SegmentedControl label="Tagningar" size="sm" value={order.takes} disabled={busy} onChange={(n) => void save({ takes: n })} options={Array.from({ length: TAKES_MAX }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
      </div>
      <TextArea label="Eget tillägg (engelska, före förbuden)" value={extra} maxLength={600} counter rows={2} onChange={(e) => setExtra(e.target.value)} />
      <div className="flex justify-end">
        <Button size="sm" loading={busy} disabled={extra === (order.prompt.extra ?? "")} onClick={() => void save({ extra: extra.trim() || null })}>
          Spara tillägget
        </Button>
      </div>
    </Section>
  );
}

export function SendScreen({ menu, answer, all, onBack, onOpen, onSaved }: { menu: ReactNode; answer: OrderAnswer; all: OrdersAnswer; onBack: () => void; onOpen: (id: string) => void; onSaved: (a: OrderAnswer) => void }) {
  const { order } = answer;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pictures = picturesInOrder(order.pictures);
  const model = MODELS[order.generation.model];
  const draft = !order.approval && order.status === "UTKAST";
  const refusals = answer.check?.refusals ?? [];
  const canApprove = draft && !answer.problems.length && !refusals.length;
  const why = answer.problems[0] ?? refusals[0] ?? null;
  const ready = answer.waiting.length > 0 && answer.waiting.every((w) => w.ready);
  const dealer = all.dealers?.find((d) => d.id === order.dealer);
  const parts = storedParts(order, dealer?.look, all.plan, dealer?.name ?? order.dealer);
  const choices = motionWords(order);
  const names = Object.fromEntries((all.dealers ?? []).map((d) => [d.id, d.name]));
  const scale = order.motion?.cardScale ?? 1;
  const oneWay = order.step.shape === "ONE_WAY" && order.motion && stepOf(order.step.key)?.start !== "LAND";
  const ordering = orderingState(all);
  // The heading in his notation from the step and the card, never the title stored with the order: a free text from the
  // one who made it, in older words ("ankare 2.3 C") and sometimes with a film's id.
  const line = orderLine(order);
  const stepLabel = stepOf(order.step.key)?.label ?? order.step.label;
  const dealerName = dealer?.name ?? names[order.dealer] ?? order.dealer;
  const heading = `${dealerName} · ${line ?? stepLabel}`;
  const doll = order.reference.status === "FINNS" && order.reference.dealer === "docka";
  const p = order.generation.params;
  // The model's length and size in words ("4 s · 1080p"); the call itself is the store's.
  const values = [typeof p.duration === "number" ? `${String(p.duration).replace(".", ",")} s` : null, p.resolution ?? p.imageSize ?? null].filter((v) => v !== null && v !== undefined).map(String);
  // Why there is no reference film, in words of today (not the words stored when the draft was made).
  const noReference = order.reference.status === "FINNS" ? null : order.reference.status === "SAKNAS" ? order.reference.why : !model?.videos ? `${model?.label ?? order.generation.model} tar ingen referensfilm tillsammans med första och sista bild.` : order.kind === "STILL" ? "En bild har ingen referensfilm." : "Ingen referensfilm vald.";
  const seatPlan = order.motion?.target ? all.plan?.seats[order.motion.target] : null;
  const planned = seatPlan && order.motion ? { quad: seatPlan.quad, side: order.motion.side } : null;
  // The other drafts of its group ("Alla sju"), by seat, and what the group costs against today's cap.
  const group = order.group ? all.orders.filter((a) => a.order.group?.id === order.group!.id).sort((a, b) => (a.order.motion?.target ?? "").localeCompare(b.order.motion?.target ?? "")) : [];
  const open = group.filter((a) => !a.order.approval);
  const budget = group.length > 1 && all.policy && open.length ? groupBudget(order.cost, open.length, all.policy, all.day.spent, all.balance?.credits ?? 0) : null;

  const approve = async () => {
    setBusy(true);
    try {
      onSaved(await approveOrder(order.id, answer.revision));
      setAsking(false);
      toast({ tone: "ok", title: "Godkänd och lagd i kön" });
    } catch (error) {
      toast({ tone: "bad", title: asApiError(error, "Godkännandet").message });
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      onSaved(await refreshOrder(order.id, answer.revision));
    } catch (error) {
      toast({ tone: "bad", title: asApiError(error, "Bilderna").message });
    } finally {
      setBusy(false);
    }
  };
  const copy = () => void navigator.clipboard?.writeText(order.prompt.text).then(() => toast({ tone: "ok", title: "Texten är kopierad" }), () => {});
  // Sent only once a take has left the queue: an approved order waits in it until the main agent lays the queue. One set
  // aside (a draft or an approved order) or with every take stopped before it left never went.
  const states = takeStates(order, answer.receipt);
  const sent = !!order.approval && states.some((s) => s !== "GODKÄND" && s !== "AVBRUTEN");
  const never = !sent && (order.status === "AVBRUTEN" || (!!order.approval && states.every((s) => s === "AVBRUTEN")));
  const barWords = sent ? "Det här skickades" : never ? "Det här skickades aldrig" : order.approval ? "Det här skickas när kön läggs" : "Det här skickas";

  return (
    <QueueFrame
      menu={menu}
      bar={<span className="text-sm font-medium text-ink">{barWords}</span>}
      status={
        <>
          <StatusChip answer={answer} />
          <span className="truncate text-ink">{heading}</span>
        </>
      }
      actions={
        <>
          <Button variant="quiet" icon={<ArrowLeft />} onClick={onBack}>
            Alla beställningar
          </Button>
          <span className="whitespace-nowrap text-sm tabular-nums text-dim">
            {model?.label} · {credits(order.cost.total)} krediter
          </span>
          {draft ? (
            <Button variant="primary" icon={<Check />} disabled={!canApprove} title={why ?? undefined} onClick={() => setAsking(true)}>
              Godkänn och lägg i kön
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap items-baseline gap-x-3">
            {line ? <span className="font-mono text-lg font-semibold leading-7 text-ink">{line}</span> : null}
            <span className="text-sm text-dim">{stepLabel}</span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-dim">
            <Badge tone="neutral" size="md">Text: {styleWords(order)}</Badge>
            {choices ? (
              <>
                <Badge tone="variant" size="md">{choices.hand}</Badge>
                <Badge tone="brass" size="md">{choices.lands}</Badge>
                {choices.turn ? <Badge tone="neutral" size="md">{choices.turn}</Badge> : null}
                {oneWay ? <Badge tone="neutral" size="md">{SHAPE_LABEL.ONE_WAY}</Badge> : null}
                {scale !== 1 ? <Badge tone="remark" size="md">Prov: kortet {scaleWords(scale)} av planens</Badge> : null}
                {order.motion?.fromPlan ? <span>som kortplanen säger för {seatWords(order.motion.target)}</span> : <span>ändrat från kortplanen</span>}
              </>
            ) : null}
          </p>
        </div>
        {order.status === "AVBRUTEN" && order.setAside ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink">
            Avbruten {swedishMoment(order.setAside.at) ?? order.setAside.at} av {order.setAside.by}: {order.setAside.why}
          </p>
        ) : null}
        {group.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm">
            <span className="text-dim">Grupp</span>
            <span className="text-ink">{order.group!.label}</span>
            <div className="flex flex-wrap gap-1">
              {group.map((a) => (
                <button
                  key={a.order.id}
                  type="button"
                  onClick={() => onOpen(a.order.id)}
                  className={cn("h-7 rounded-md border px-2 text-xs tabular-nums", a.order.id === order.id ? "border-brass/60 bg-brass/12 text-brass-hi" : "border-line text-ink hover:bg-raised", a.order.approval && "opacity-60")}
                >
                  {(a.order.motion?.target ? cardCode(a.order.motion.target) : null) ?? "utan kort"}
                  {a.order.motion?.pass ? " · byte" : ""}
                  {a.order.approval ? " ✓" : ""}
                </button>
              ))}
            </div>
            {budget ? <span className="ml-auto text-xs text-dim">{budget.words[0]}</span> : null}
          </div>
        ) : null}
        {draft && answer.refresh && answer.shown !== "VÄNTAR" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brass/25 bg-brass/6 px-4 py-3 text-sm">
            <span className="text-ink">{answer.refresh}</span>
            <Button size="sm" className="ml-auto" icon={<RefreshCw />} loading={busy} onClick={() => void refresh()}>
              Hämta bilderna igen
            </Button>
          </div>
        ) : null}
        {answer.shown === "VÄNTAR" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-vantar/25 bg-vantar/6 px-4 py-3 text-sm">
            <span className="text-ink">
              {why} {ready ? "Det finns nu: hämta bilderna hit." : `När ${waitWords(answer.waiting)} är ${new Set(answer.waiting.map((w) => w.label)).size > 1 ? "godkända" : "godkänd"} i Material hämtas bilderna hit av sig själv.`}
            </span>
            <Link href={`/material/?dealer=${order.dealer}`} className="text-brass-hi hover:underline">
              Till Material
            </Link>
            <Button size="sm" className="ml-auto" icon={<RefreshCw />} disabled={!ready} loading={busy} onClick={() => void refresh()}>
              Hämta bilderna
            </Button>
          </div>
        ) : null}
        {answer.problems.filter((p) => !p.startsWith("Väntar")).length || answer.warnings.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {answer.problems.filter((p) => !p.startsWith("Väntar")).map((p) => (
              <li key={p} className="flex gap-2 text-[#ef8b8b]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {p}
              </li>
            ))}
            {answer.warnings.map((w) => (
              <li key={w} className="flex gap-2 text-[#f0b07a]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        ) : null}

        <div className={cn("grid gap-5", pictures.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
          {pictures.map((p) => (
            <PictureCard key={p.name} picture={p} owner={answer.owners ? (answer.owners[p.name] ?? null) : undefined} dealer={order.dealer} planned={p.from?.built && planned ? planned : null} />
          ))}
        </div>

        <Section title="Referensfilm">
          {order.reference.status === "FINNS" ? (
            <div className="flex items-start gap-4">
              <video src={labUrl(order.reference.path)} controls muted playsInline className="w-[480px] rounded-lg border border-line bg-well" />
              <div className="flex flex-col gap-1.5 text-sm text-dim">
                <p>
                  {referenceName({ dealer: order.reference.dealer ?? order.dealer, edge: order.reference.from?.edge ?? `READY>${order.reference.goesTo}`, goesTo: order.reference.goesTo }, names)} · {String(order.reference.seconds).replace(".", ",")} s
                  {doll ? null : order.reference.approvedStraight ? " · rakt godkänd" : " · inte rakt godkänd"}
                </p>
                {/* the doll's film is rendered from the plan, not a take from the bank: no verdict of his, no hand to leak in */}
                {doll ? (
                  <p>Dockans film: den visar bara rörelsen.</p>
                ) : order.reference.dealer && order.reference.dealer !== order.dealer ? (
                  <p className="text-[#f0b07a]">{capital(genitive(names[order.reference.dealer] ?? order.reference.dealer))} film, tillåten som referens: texten säger att den bara visar rörelsen. Handen i den filmen kan läcka in.</p>
                ) : null}
                {order.reference.from && !doll ? (
                  <p className="text-xs text-faint">
                    Jakob: {REF_VERDICT_LABEL[order.reference.from.verdict]}{order.reference.from.words ? ` ”${order.reference.from.words}”` : ""}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className={cn("text-sm", order.reference.status === "SAKNAS" ? "text-[#ef8b8b]" : "text-dim")}>{noReference}</p>
          )}
        </Section>

        <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-8">
          <Section
            title="Texten som skickas"
            aside={
              <>
                <span className="tabular-nums">
                  {styleWords(order)} · {order.prompt.text.length.toLocaleString("sv-SE")} tecken
                </span>
                <Button size="sm" variant="quiet" icon={<ClipboardCopy />} onClick={copy}>
                  Kopiera
                </Button>
              </>
            }
          >
            <PromptText text={order.prompt.text} parts={parts} />
          </Section>

          <div className="flex flex-col gap-7">
            <Section title="Modell">
              <p className="text-sm text-ink">{[model?.label ?? order.generation.model, ...values].join(" · ")}</p>
              {model?.delivered ? <p className="text-sm text-brass-hi">{model.delivered}</p> : null}
              {model ? <p className="text-xs text-faint">{model.note}</p> : null}
              {model?.off ? <p className="text-xs text-[#f0b07a]">Beställs inte längre: {model.off}</p> : null}
            </Section>

            <Section title="Tagningar och kostnad">
              <p className="font-display text-xl font-semibold tabular-nums text-ink">{costWords(order)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-dim">Högst</dt>
                <dd className="tabular-nums text-ink">
                  {credits(order.cost.worstTotal)} krediter {order.cost.worstTotal > order.cost.total ? <span className="text-faint">(listpris; det är det som räknas mot taken)</span> : null}
                </dd>
                <dt className="text-dim">Saldo</dt>
                <dd className="tabular-nums text-ink">{all.balance ? `${credits(all.balance.credits)} krediter (${swedishMoment(all.balance.at) ?? all.balance.at.slice(0, 10)})` : "okänt"}</dd>
              </dl>
              {draft ? (
                <p data-ordering className={ordering.open ? "text-sm text-dim" : "rounded-sm bg-[#3a2a1a] px-2.5 py-1.5 text-sm text-[#f0b07a]"}>
                  {ordering.words}
                </p>
              ) : null}
              {refusals.length ? (
                <ul className="flex flex-col gap-1 text-sm text-[#ef8b8b]">
                  {refusals.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </Section>

            {order.approval ? (
              <Section title="Godkänd">
                <p className="text-sm text-ink">
                  {approvalWords(order.approval)} {swedishMoment(order.approval.at) ?? order.approval.at}
                </p>
                {order.approval.mandate ? <p className="text-xs text-dim">Uppdraget: {mandateText(order.approval.mandate)}</p> : null}
                <ul className="flex flex-col gap-1 text-sm">
                  {states.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-20 text-dim">Tagning {i + 1}</span>
                      <Badge tone={s === "OSÄKER" ? "remark" : s === "MISSLYCKAD" ? "bad" : "neutral"}>{SHOWN_LABEL[s] ?? s}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {/* What the store wrote into the order when it was made: frozen with it, in the words of that day (an older
                order's notes name files and ids), so folded away rather than shown as the order's description, and
                shown without the commands and register paths a frozen note may carry (noteWords). */}
            {order.notes.length ? (
              <details data-notes className="group text-xs leading-5 text-dim">
                <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-[0.08em] text-faint hover:text-dim">Mer om beställningen</summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {order.notes.map((n) => (
                    <li key={n}>{noteWords(n)}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {draft ? (
              <Edit key={`${order.id}:${order.prompt.extra ?? ""}`} answer={answer} onSaved={onSaved} />
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="Godkänn och lägg i kön?"
        description={heading}
        footer={
          <>
            <Button variant="quiet" onClick={() => setAsking(false)}>
              Avbryt
            </Button>
            <Button variant="primary" icon={<Check />} loading={busy} onClick={() => void approve()}>
              Godkänn
            </Button>
          </>
        }
      >
        <p>
          {costWords(order)}, högst {credits(order.cost.worstTotal)}. Efter godkännandet kan inget i beställningen ändras: bilderna, texten, modellen och priset låses.
        </p>
        <p className="mt-2 text-dim">Inget skickas förrän du säger &quot;lägg kön&quot; till huvudagenten.</p>
      </Dialog>
    </QueueFrame>
  );
}
