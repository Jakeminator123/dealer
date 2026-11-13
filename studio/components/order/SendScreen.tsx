"use client";

// "Det här skickas": one order exactly as it would go out. One line on what it makes and its choices in words (hand,
// closed or open, the turn), the group it belongs to with its other seats, the pictures large at the top (first,
// in-between, last; or the dealer's picture and the pose), each with whose it is and, when a draft followed a newer anchor
// in Material, what it was before; then the exact text in full (selectable; the parts a choice made, Jakob's addition and
// the bans marked, from the same function the text was written with), every argument of the call by its name with what the
// model is known and not known to do (a 4K film: that it is scaled to the bank's frame), the takes and the cost against
// the day's cap and the balance. A draft can change its hand, how the card lands and turns, takes and
// free addition here, and fetch its pictures again when something has changed; "Godkänn och lägg i kön" freezes it (its
// hash in approval), after which nothing in it changes. Writes only on Jakob's click.
import { ArrowLeft, Check, ClipboardCopy, CopyPlus, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { asApiError } from "../../lib/api.ts";
import { labUrl } from "../../lib/lab.ts";
import { swedishMoment } from "../../lib/mode.ts";
import { approveOrder, changeOrder, costWords, motionWords, paramRows, picturesInOrder, referenceWords, refreshOrder, storedParts, styleWords, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import { MODELS, REF_VERDICT_LABEL, approvalWords, SHAPE_LABEL, TAKES_MAX, credits, defaultFlip, genitive, groupBudget, handChoiceOf, handsOf, requestOf, scaleWords, seatWords, stepOf, takeStates, waitWords } from "../../../src/order-model.ts";
import { Page } from "../shell";
import { Badge, Button, Dialog, SegmentedControl, TextArea, cn, useToast } from "../ui";
import { FlipChoice, HandChoiceRow, LandsChoice } from "./Choices";
import { PictureCard, StatusChip } from "./Pictures";
import { PromptText } from "./PromptText";

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

/** A draft's choices; mounted anew when the saved addition changes, so the field starts from what is saved. */
function Edit({ answer, all, onSaved }: { answer: OrderAnswer; all: OrdersAnswer; onSaved: (a: OrderAnswer) => void }) {
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
  const m = order.motion;
  const seat = m?.target ? all.plan?.seats[m.target] : null;
  return (
    <Section title="Ändra utkastet">
      {m ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-dim">Hur kortet landar</span>
            <LandsChoice value={m.side} plan={seat?.side ?? null} disabled={busy} onChange={(side) => side !== m.side && void save({ side })} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-dim">Hand</span>
            <HandChoiceRow value={handChoiceOf(m)} plan={seat ? handChoiceOf({ hand: seat.hand, pass: seat.pass }) : null} disabled={busy} onChange={(c) => c !== handChoiceOf(m) && void save(handsOf(c))} />
            {seat?.crosses && handChoiceOf(m) !== "PASS" ? <p className="text-sm text-brass-hi">Förslag: handbyte. På {seatWords(m.target)} måste vänsterhanden från skon korsa kroppen.</p> : null}
          </div>
          {m.side === "FRONT" && m.turn && m.flipAxis ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-dim">Hur kortet vänds</span>
              <FlipChoice value={m.flipAxis} suggested={defaultFlip(order.step.key, seat?.turnAt)} disabled={busy} onChange={(axis) => axis !== m.flipAxis && void save({ flipAxis: axis })} />
            </div>
          ) : null}
        </>
      ) : null}
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

export function SendScreen({ answer, all, onBack, onOpen, onSaved, onLike }: { answer: OrderAnswer; all: OrdersAnswer; onBack: () => void; onOpen: (id: string) => void; onSaved: (a: OrderAnswer) => void; onLike?: (id: string) => void }) {
  const { order } = answer;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pictures = picturesInOrder(order.pictures);
  const rows = paramRows(order);
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
  // The literal call for take 1, as order-put begin prints it; take 2 and later differ only by confirmRepeat.
  const request = requestOf(order, 1);
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

  return (
    <Page
      title="Det här skickas"
      status={
        <>
          <StatusChip answer={answer} />
          <span className="truncate text-ink">{order.title}</span>
        </>
      }
      actions={
        <>
          <Button variant="quiet" icon={<ArrowLeft />} onClick={onBack}>
            Alla beställningar
          </Button>
          {onLike ? (
            <Button variant="quiet" icon={<CopyPlus />} onClick={() => onLike(order.id)} title="Öppnar Ny beställning med alla val härifrån; bilderna hämtas som de gäller nu.">
              Ny beställning som den här
            </Button>
          ) : null}
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
          {order.summary ? <p className="font-display text-lg font-semibold leading-7 text-ink">{order.summary}</p> : null}
          <p className="flex flex-wrap items-center gap-2 text-sm text-dim">
            <Badge tone="neutral" size="md">Text: {styleWords(order)}</Badge>
            {choices ? (
              <>
                <Badge tone="variant" size="md">{choices.hand}</Badge>
                <Badge tone="brass" size="md">{choices.lands}</Badge>
                {choices.turn ? <Badge tone="neutral" size="md">{choices.turn}</Badge> : null}
                {oneWay ? <Badge tone="neutral" size="md">{SHAPE_LABEL.ONE_WAY}</Badge> : null}
                {scale !== 1 ? <Badge tone="remark" size="md">Prov: kortet {scaleWords(scale)} av planens</Badge> : null}
                {order.motion?.fromPlan ? <span>som Placering säger för {seatWords(order.motion.target)}</span> : <span>ändrat från Placering</span>}
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
                  title={`${a.order.title}${a.order.motion?.pass ? " · handbyte" : ""}`}
                  className={cn("h-7 rounded-md border px-2 text-xs tabular-nums", a.order.id === order.id ? "border-brass/60 bg-brass/12 text-brass-hi" : "border-line text-ink hover:bg-raised", a.order.approval && "opacity-60")}
                >
                  {a.order.motion?.target?.replace(".C1", "") ?? a.order.id}
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
                  {referenceWords(order.reference, order.dealer, names)} · till {order.reference.goesTo}
                  {order.reference.approvedStraight ? " · rakt godkänd" : " · inte rakt godkänd"}
                </p>
                {order.reference.dealer && order.reference.dealer !== order.dealer ? (
                  <p className="text-[#f0b07a]">{genitive(names[order.reference.dealer] ?? order.reference.dealer)} film, tillåten som referens: texten säger att den bara visar rörelsen. Hennes hand kan läcka in.</p>
                ) : null}
                {order.reference.from ? (
                  <p className="text-xs text-faint">
                    Ur {order.reference.from.path}{order.reference.from.frames ? ` (tagningen är ruta ${order.reference.from.frames[0]}–${order.reference.from.frames[1]}; hela filmen skickas)` : ""} · Jakob: {REF_VERDICT_LABEL[order.reference.from.verdict]}{order.reference.from.words ? ` ”${order.reference.from.words}”` : ""} · sha256 {order.reference.sha256.slice(0, 12)}
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
                  {styleWords(order)} · {order.prompt.text.length.toLocaleString("sv-SE")} tecken · mall {order.prompt.template}
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
            <Section title="Modell och värden" aside={<span>{model?.label ?? order.generation.model}</span>}>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 pr-3 align-top font-mono text-xs text-dim">{r.name}</td>
                      <td className="py-1.5 pr-3 align-top font-mono text-xs text-ink">{r.value}</td>
                      <td className="py-1.5 align-top text-xs text-faint">{r.note ?? ""}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5 pr-3 align-top font-mono text-xs text-dim">promptText</td>
                    <td colSpan={2} className="py-1.5 align-top text-xs text-faint">
                      texten till vänster, hela
                    </td>
                  </tr>
                </tbody>
              </table>
              {model?.delivered ? <p className="text-sm text-brass-hi">{model.delivered}</p> : null}
              {model ? <p className="text-xs text-faint">{model.note}</p> : null}
              {model?.off ? <p className="text-xs text-[#f0b07a]">Beställs inte längre: {model.off}</p> : null}
              <details className="rounded-md border border-line bg-surface px-3 py-2">
                <summary className="cursor-pointer text-sm text-ink">Anropet ordagrant</summary>
                <p className="mt-2 text-xs text-dim">Det här är allt som skickas. Resten av beställningsfilen är protokoll.</p>
                <pre className="mt-2 max-h-[420px] select-text overflow-auto whitespace-pre-wrap break-words rounded bg-well p-2 font-mono text-[11px] leading-[17px] text-ink">{JSON.stringify(request, null, 2)}</pre>
                <p className="mt-1 text-xs text-dim">
                  {order.takes > 1 ? `Tagning 2${order.takes > 2 ? `–${order.takes}` : ""}: samma anrop med "confirmRepeat": true. ` : ""}Varje &quot;$file:…&quot; byts mot filens uppladdade adress, inget annat ändras.
                </p>
                <p className="mt-1 font-mono text-xs text-faint">data/orders/{order.id}.json</p>
              </details>
            </Section>

            <Section title="Tagningar och kostnad">
              <p className="font-display text-xl font-semibold tabular-nums text-ink">{costWords(order)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-dim">Högst</dt>
                <dd className="tabular-nums text-ink">
                  {credits(order.cost.worstTotal)} krediter {order.cost.worstTotal > order.cost.total ? <span className="text-faint">(listpris; det är det som räknas mot taken)</span> : null}
                </dd>
                <dt className="text-dim">I dag</dt>
                <dd className="tabular-nums text-ink">
                  {credits(all.day.spent)} av {credits(all.day.cap)} intecknade{draft ? <span className="text-dim"> · med den här {credits(all.day.spent + order.cost.worstTotal)}</span> : null}
                </dd>
                <dt className="text-dim">Saldo</dt>
                <dd className="tabular-nums text-ink">
                  {all.balance ? `${credits(all.balance.credits)} (senast ${all.balance.at.slice(0, 10)})` : "okänt"}
                  {all.policy ? <span className="text-dim"> · golv {credits(all.policy.minBalance)}</span> : null}
                </dd>
                <dt className="text-dim">Grund</dt>
                <dd className="text-xs leading-5 text-faint">{order.cost.basis}</dd>
              </dl>
              {refusals.length ? (
                <ul className="flex flex-col gap-1 text-sm text-[#ef8b8b]">
                  {refusals.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : draft ? (
                <p className="text-sm text-[#6cc595]">Inom taken: {credits(all.policy?.maxPerOrder ?? 0)} per beställning, {credits(all.day.cap)} per dag.</p>
              ) : null}
            </Section>

            {order.notes.length ? (
              <Section title="Om beställningen">
                <ul className="flex flex-col gap-1.5 text-xs leading-5 text-dim">
                  {order.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {order.approval ? (
              <Section title="Godkänd">
                <p className="text-sm text-ink" title={order.approval.mandate ?? undefined}>
                  {approvalWords(order.approval)} {swedishMoment(order.approval.at) ?? order.approval.at} · <span className="font-mono text-xs text-dim">sha256 {order.approval.orderSha256.slice(0, 16)}</span>
                </p>
                {order.approval.mandate ? <p className="text-xs text-dim">Uppdraget: {order.approval.mandate}</p> : null}
                <ul className="flex flex-col gap-1 text-sm">
                  {takeStates(order, answer.receipt).map((s, i) => {
                    const t = answer.receipt?.takes.find((x) => x.take === i + 1);
                    return (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-20 text-dim">Tagning {i + 1}</span>
                        <Badge tone={s === "OSÄKER" ? "remark" : s === "MISSLYCKAD" ? "bad" : "neutral"}>{s}</Badge>
                        {t?.taskId ? <span className="font-mono text-xs text-faint">{t.taskId}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            ) : draft ? (
              <Edit key={`${order.id}:${order.prompt.extra ?? ""}`} answer={answer} all={all} onSaved={onSaved} />
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="Godkänn och lägg i kön?"
        description={order.title}
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
          {costWords(order)}, högst {credits(order.cost.worstTotal)}. Efter godkännandet kan inget i beställningen ändras: bilderna, texten och värdena låses med sin hash.
        </p>
        <p className="mt-2 text-dim">Inget skickas förrän du säger &quot;lägg kön&quot; till filmagenten eller huvudagenten.</p>
      </Dialog>
    </Page>
  );
}
