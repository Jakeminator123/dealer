"use client";

// "Det här skickas": one order exactly as it would go out. The pictures large at the top (first, in-between, last; or the
// dealer's picture and the pose), then the exact text in full (selectable; the turn, Jakob's addition and the bans
// marked), every argument of the call by its name, the takes and the cost against the day's cap and the balance. A draft
// can change its turn, takes and free addition here; "Godkänn och lägg i kön" freezes it (its hash in approval), after
// which nothing in it changes. Writes only on Jakob's click.
import { ArrowLeft, Check, ClipboardCopy, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { asApiError } from "../../lib/api.ts";
import { labUrl } from "../../lib/lab.ts";
import { swedishMoment } from "../../lib/mode.ts";
import { approveOrder, changeOrder, costWords, paramRows, picturesInOrder, refreshOrder, turnWords, type FlipAxis, type OrderAnswer, type OrdersAnswer } from "../../lib/orders.ts";
import { FLIP_ABOUT, FLIP_AXES, FLIP_LABEL, MODELS, TAKES_MAX, credits, takeStates, waitWords } from "../../../src/order-model.ts";
import { BANS_FILM, BANS_STILL, turnSentence } from "../../../src/order-prompts.ts";
import { Page } from "../shell";
import { Badge, Button, Dialog, SegmentedControl, TextArea, cn, useToast } from "../ui";
import { PictureCard, StatusChip } from "./Pictures";

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

/** The text as it goes, with the turn sentence, the free addition and the bans marked (the characters are not changed). */
function MarkedText({ answer }: { answer: OrderAnswer }) {
  const { order } = answer;
  const marks = useMemo(() => {
    const list: { text: string; className: string; title: string }[] = [];
    if (order.motion?.turn) list.push({ text: turnSentence(order.motion.flipAxis, order.motion.grip), className: "bg-brass/12 text-brass-hi", title: `Vändningen: ${FLIP_LABEL[order.motion.flipAxis]}` });
    if (order.prompt.extra) list.push({ text: order.prompt.extra, className: "bg-variant/12 text-[#b6c6fa]", title: "Ditt tillägg" });
    list.push({ text: order.kind === "STILL" ? BANS_STILL : BANS_FILM, className: "text-[#ef9a9a]", title: "Det som inte får hända" });
    return list;
  }, [order]);
  const parts: ReactNode[] = [];
  let rest = order.prompt.text,
    key = 0;
  while (rest) {
    const hits = marks.map((m) => ({ m, at: rest.indexOf(m.text) })).filter((h) => h.at >= 0).sort((a, b) => a.at - b.at);
    if (!hits.length) {
      parts.push(rest);
      break;
    }
    const { m, at } = hits[0];
    if (at) parts.push(rest.slice(0, at));
    parts.push(
      <span key={key++} className={cn("rounded-xs", m.className)} title={m.title}>
        {m.text}
      </span>,
    );
    rest = rest.slice(at + m.text.length);
  }
  return <p className="select-text whitespace-pre-wrap rounded-lg border border-line bg-well px-4 py-3 font-mono text-[13px] leading-[22px] text-ink">{parts}</p>;
}

function Edit({ answer, onSaved }: { answer: OrderAnswer; onSaved: (a: OrderAnswer) => void }) {
  const { order } = answer;
  const [extra, setExtra] = useState(order.prompt.extra ?? "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => setExtra(order.prompt.extra ?? ""), [order.prompt.extra]);
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
      {order.motion?.turn ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-dim">Hur kortet vänds</span>
          <div className="flex flex-col gap-1.5">
            {FLIP_AXES.map((axis) => (
              <button
                key={axis}
                type="button"
                disabled={busy}
                onClick={() => axis !== order.motion!.flipAxis && void save({ flipAxis: axis as FlipAxis })}
                className={cn("flex flex-col items-start rounded-md border px-3 py-2 text-left", axis === order.motion!.flipAxis ? "border-brass/60 bg-brass/8" : "border-line hover:border-line-strong hover:bg-raised")}
              >
                <span className="text-sm text-ink">{FLIP_LABEL[axis]}</span>
                <span className="text-xs text-dim">{FLIP_ABOUT[axis]}</span>
              </button>
            ))}
          </div>
        </div>
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

export function SendScreen({ answer, all, onBack, onSaved }: { answer: OrderAnswer; all: OrdersAnswer; onBack: () => void; onSaved: (a: OrderAnswer) => void }) {
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
        {answer.shown === "VÄNTAR" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-vantar/25 bg-vantar/6 px-4 py-3 text-sm">
            <span className="text-ink">
              {why} {ready ? "Det finns nu: hämta bilderna hit." : `När ${waitWords(answer.waiting)} är ${new Set(answer.waiting.map((w) => w.label)).size > 1 ? "godkända" : "godkänd"} i Material hämtas bilderna hit med knappen.`}
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
            <PictureCard key={p.name} picture={p} />
          ))}
        </div>

        <Section title="Referensfilm">
          {order.reference.status === "FINNS" ? (
            <div className="flex items-start gap-4">
              <video src={labUrl(order.reference.path)} controls muted playsInline className="w-[480px] rounded-lg border border-line bg-well" />
              <p className="text-sm text-dim">
                {order.reference.clips.join(", ")} · {String(order.reference.seconds).replace(".", ",")} s · till {order.reference.goesTo}
                {order.reference.approvedStraight ? "" : " · inte rakt godkänd"}
              </p>
            </div>
          ) : (
            <p className={cn("text-sm", order.reference.status === "SAKNAS" ? "text-[#ef8b8b]" : "text-dim")}>{order.reference.why}</p>
          )}
        </Section>

        <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-8">
          <Section
            title="Texten som skickas"
            aside={
              <>
                <span className="tabular-nums">
                  {order.prompt.text.length.toLocaleString("sv-SE")} tecken · mall {order.prompt.template}
                </span>
                <Button size="sm" variant="quiet" icon={<ClipboardCopy />} onClick={copy}>
                  Kopiera
                </Button>
              </>
            }
          >
            <MarkedText answer={answer} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
              {turnWords(order) ? (
                <span>
                  <span className="mr-1 inline-block size-2 rounded-xs bg-brass/50" />
                  vändningen: {turnWords(order)}
                </span>
              ) : null}
              {order.prompt.extra ? (
                <span>
                  <span className="mr-1 inline-block size-2 rounded-xs bg-variant/50" />
                  ditt tillägg
                </span>
              ) : null}
              <span>
                <span className="mr-1 inline-block size-2 rounded-xs bg-underkand/60" />
                det som inte får hända
              </span>
            </div>
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
              {model ? <p className="text-xs text-faint">{model.note}</p> : null}
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
                <p className="text-sm text-ink">
                  Av Jakob {swedishMoment(order.approval.at) ?? order.approval.at} · <span className="font-mono text-xs text-dim">sha256 {order.approval.orderSha256.slice(0, 16)}</span>
                </p>
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
              <Edit answer={answer} onSaved={onSaved} />
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
