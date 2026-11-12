"use client";

// A new order in a few steps, all on one panel and all with defaults (under a minute): dealer → what (a picture or a step
// of film, grouped as the plan groups them; the first the dealer lacks is chosen) → place on the table → the pictures it
// starts from → how the card moves → model, length and takes → the cost against the day. "Skapa utkast" makes a draft
// (POST /api/orders) and opens "Det här skickas"; nothing is approved here.
import { Clock } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { asApiError } from "../../lib/api.ts";
import { labUrl } from "../../lib/lab.ts";
import type { DealerAnswer, EntryAnswer, MediaAnswer } from "../../lib/media.ts";
import { anchorFor, createOrder, firstLacking, type FlipAxis, type OrderAnswer, type OrdersAnswer, type StepKey } from "../../lib/orders.ts";
import { FLIP_ABOUT, FLIP_AXES, FLIP_LABEL, MODELS, SEAT_TARGETS, STEPS, TAKES_MAX, costOf, credits, stepOf } from "../../../src/order-model.ts";
import { getMedia } from "../material/client.ts";
import { Button, SegmentedControl, Sheet, Switch, TextArea, cn, useToast } from "../ui";

const POSE_WORDS: Partial<Record<StepKey, string>> = {
  "ANKARE-2.1": "Pamelas godkända ankare 2.1",
  "ANKARE-2.2": "Pamelas godkända ankare 2.2 (skon där kopieras inte)",
  MELLANBILD: "Pamelas giv till P4, ruta 42 (kortet mitt i rörelsen)",
};

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3 border-b border-line/70 pb-4 pt-3 first:pt-0 last:border-0">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-overlay text-2xs font-semibold text-dim">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {children}
      </div>
    </section>
  );
}

function Mini({ entry, label }: { entry: EntryAnswer | null; label: string }) {
  const src = entry?.served && !entry.served.endsWith(".mp4") ? labUrl(entry.served) : null;
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-12 w-[72px] shrink-0 overflow-hidden rounded-sm border border-line bg-well">
        {/* eslint-disable-next-line @next/next/no-img-element -- a lab file */}
        {src ? <img src={src} alt="" className="size-full object-cover" /> : <Clock className="absolute inset-0 m-auto size-4 text-vantar" />}
      </div>
      <div className="min-w-0 text-sm">
        <span className="text-dim">{label}: </span>
        <span className="text-ink">{entry ? entry.name : "väntar"}</span>
        {entry?.state && entry.state !== "gäller" ? <span className="text-[#f0b07a]"> · {entry.state}</span> : null}
      </div>
    </div>
  );
}

export function NewOrder({ open, onOpenChange, all, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; all: OrdersAnswer; onCreated: (a: OrderAnswer) => void }) {
  const [media, setMedia] = useState<MediaAnswer | null>(null);
  const [dealerId, setDealerId] = useState("paow");
  const [stepKey, setStepKey] = useState<StepKey | null>(null);
  const [target, setTarget] = useState("P4.C1");
  const [flip, setFlip] = useState<FlipAxis>("FREE");
  const [middle, setMiddle] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [takes, setTakes] = useState(2);
  const [base, setBase] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open && !media) void getMedia().then(setMedia, () => setMedia(null));
  }, [open, media]);
  const dealer: DealerAnswer | null = media?.dealers.find((d) => d.id === dealerId) ?? null;
  const entries = useMemo(() => dealer?.entries ?? [], [dealer]);
  const key = stepKey ?? (dealer ? firstLacking(entries) : "ANKARE-2.1");
  const step = stepOf(key)!;
  const model = MODELS[step.model];
  const seconds = duration ?? step.duration ?? 4;
  const start = anchorFor(entries, step.from);
  const startEntry = start.holds ?? (step.kind === "STILL" ? (start.candidates.find((c) => c.id === base) ?? start.candidates[0] ?? null) : null);
  const end = step.kind === "FILM" && !step.card && step.to ? anchorFor(entries, step.to).holds : null;

  useEffect(() => {
    setDuration(null);
    setMiddle(false);
    setBase(null);
  }, [key, dealerId]);

  const params = useMemo(() => {
    const p: Record<string, string | number | boolean> = {};
    if (step.kind === "STILL") Object.assign(p, { ratio: step.ratio, imageSize: step.imageSize });
    else Object.assign(p, { resolution: step.resolution ?? "1080p", duration: seconds }, step.model === "wan3" ? { ratio: "adaptive", generateAudio: false } : {});
    return p;
  }, [step, seconds]);
  const cost = all.policy ? costOf({ model: step.model, params }, takes, all.policy.prices) : null;
  const durations = model.durations ? Array.from({ length: Math.min(model.durations[1], 10) - model.durations[0] + 1 }, (_, i) => model.durations![0] + i) : [];
  // Pictures first: a new dealer needs her anchors before any film.
  const groups = [...new Set(STEPS.map((s) => s.group))].sort((a, b) => (a === "Bild" ? -1 : b === "Bild" ? 1 : 0));
  // The steps are numbered as they are shown (place and movement only where the card moves).
  let shown = 0;
  const next = () => ++shown;

  const create = async () => {
    setBusy(true);
    try {
      const made = await createOrder({
        dealer: dealerId,
        step: key,
        ...(step.card ? { target, flipAxis: flip, middle } : step.key === "MELLANBILD" ? { target } : {}),
        ...(step.kind === "FILM" ? { duration: seconds } : {}),
        ...(step.kind === "STILL" && !start.holds && startEntry ? { base: startEntry.id } : {}),
        takes,
        extra: extra.trim() || null,
      } as Parameters<typeof createOrder>[0]);
      onCreated(made);
    } catch (error) {
      toast({ tone: "bad", title: asApiError(error, "Utkastet").message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ny beställning"
      subtitle="Allt har förval. Utkastet godkänns sedan i Det här skickas."
      width={560}
      modal
      footer={
        <>
          <span className="mr-auto text-sm tabular-nums text-ink">{cost ? `${takes} × ${credits(cost.perTake)} = ${credits(cost.total)} krediter` : "Inget pris"}</span>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button variant="primary" loading={busy} disabled={!cost || !!step.off} onClick={() => void create()}>
            Skapa utkast
          </Button>
        </>
      }
    >
      <div className="flex flex-col">
        <Step n={next()} title="Dealer">
          <SegmentedControl label="Dealer" value={dealerId} onChange={setDealerId} options={(media?.dealers ?? [{ id: "paow", name: "Paow" }]).map((d) => ({ value: d.id, label: d.id === "pamela" ? `${d.name} (pausad)` : d.name }))} />
        </Step>
        <Step n={next()} title="Vad">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {groups.map((g) => (
              <div key={g} className="flex flex-col gap-1">
                <span className="text-2xs font-medium uppercase tracking-[0.06em] text-faint">{g}</span>
                {STEPS.filter((s) => s.group === g).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    disabled={!!s.off}
                    title={s.off}
                    onClick={() => setStepKey(s.key)}
                    className={cn("rounded-sm px-2 py-1 text-left text-sm", s.key === key ? "bg-brass/12 text-brass-hi ring-1 ring-brass/40" : s.off ? "text-faint" : "text-ink hover:bg-raised")}
                  >
                    {s.label}
                    {s.off ? <span className="block text-2xs text-faint">{s.off}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Step>
        {step.card || step.key === "MELLANBILD" ? (
          <Step n={next()} title="Plats på bordet">
            <SegmentedControl label="Plats" size="sm" value={target} onChange={setTarget} options={SEAT_TARGETS.map((t) => ({ value: t, label: t.replace(".C1", ""), disabled: step.key === "MELLANBILD" && t !== "P4.C1" }))} />
          </Step>
        ) : null}
        <Step n={next()} title="Bilder">
          {step.kind === "STILL" ? (
            <>
              {!start.holds && start.candidates.length > 1 ? (
                <SegmentedControl label="Dealerns bild" size="sm" value={startEntry?.id ?? ""} onChange={setBase} options={start.candidates.map((c) => ({ value: c.id, label: c.name }))} />
              ) : null}
              <Mini entry={startEntry} label={`Dealerns bild (ankare ${step.from})`} />
              <p className="text-sm text-dim">Pose: {POSE_WORDS[key]}</p>
            </>
          ) : (
            <>
              <Mini entry={start.holds} label={`Första bild (ankare ${step.from})`} />
              {step.card ? <p className="text-sm text-dim">Sista bild: samma ankare + kortet på {target}, ritat som planen (visas när utkastet är skapat).</p> : <Mini entry={end} label={`Sista bild (ankare ${step.to})`} />}
            </>
          )}
        </Step>
        {step.card ? (
          <Step n={next()} title="Hur kortet rör sig">
            <div className="flex flex-col gap-1.5">
              {FLIP_AXES.map((axis) => (
                <button key={axis} type="button" onClick={() => setFlip(axis)} className={cn("flex flex-col items-start rounded-md border px-3 py-1.5 text-left", axis === flip ? "border-brass/60 bg-brass/8" : "border-line hover:bg-raised")}>
                  <span className="text-sm text-ink">{FLIP_LABEL[axis]}</span>
                  <span className="text-xs text-dim">{FLIP_ABOUT[axis]}</span>
                </button>
              ))}
            </div>
            {model.middle ? <Switch checked={middle} onChange={setMiddle} label="Med mellanbild" hint="Kortet på kortsidan mitt i rörelsen; väntar på mellanbilden." /> : null}
          </Step>
        ) : null}
        <Step n={next()} title="Modell och längd">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ink">{model.label}</span>
            {durations.length ? <SegmentedControl label="Längd" size="sm" value={seconds} onChange={setDuration} options={durations.map((d) => ({ value: d, label: `${d} s` }))} /> : <span className="text-dim">{step.imageSize} · {step.ratio}</span>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-dim">Tagningar</span>
            <SegmentedControl label="Tagningar" size="sm" value={takes} onChange={setTakes} options={Array.from({ length: TAKES_MAX }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
          </div>
          <TextArea label="Eget tillägg (valfritt, engelska)" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={600} rows={2} />
        </Step>
        <Step n={next()} title="Kostnad">
          {cost ? (
            <p className="text-sm tabular-nums text-ink">
              {takes} × {credits(cost.perTake)} = {credits(cost.total)} krediter (högst {credits(cost.worstTotal)}) · i dag {credits(all.day.spent)} av {credits(all.day.cap)}
              {all.balance ? ` · saldo ${credits(all.balance.credits)}` : ""}
            </p>
          ) : (
            <p className="text-sm text-[#ef8b8b]">Inget pris för de här värdena i data/order-policy.json.</p>
          )}
          {cost ? <p className="text-xs text-faint">{cost.basis}</p> : null}
        </Step>
      </div>
    </Sheet>
  );
}
