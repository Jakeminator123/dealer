"use client";

// A new order, all on one sheet with defaults for everything. Left, the choices in Jakob's words: dealer → what (the step,
// with the anchor it starts from said in a line) → place on the table (one seat, or "Alla sju": one draft per seat in a
// group) → how the card lands (stängt → stängt, stängt → öppet; the plan's choice marked "enligt Placering") → which hand
// (vänster hela vägen, höger hela vägen, handbyte as a tick; handbyte suggested where the left hand would cross her body)
// → how the card turns → model, length, takes and his own addition. Right, what the choices turn into, changing as he
// sets them: one line in Swedish, the pictures (first, last with the card drawn where the plan says, or the dealer's
// picture and the pose) each with whose it is, the exact text with the parts a choice made marked (from promptFor, the
// function the store writes the draft's text with), and the cost of all of it against the limits. "Skapa utkast" makes
// the draft(s) (POST /api/orders) and opens "Det här skickas"; nothing is approved here. Opened with values from the
// address (presetOf); the view mounts it anew per address, so the choices start from what the address asks.
import { Clock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { asApiError } from "../../lib/api.ts";
import { labUrl } from "../../lib/lab.ts";
import type { DealerAnswer, EntryAnswer, MediaAnswer } from "../../lib/media.ts";
import { anchorFor, createOrder, firstLacking, stepGroups, type OrderAnswer, type OrdersAnswer, type Preset, type StepKey } from "../../lib/orders.ts";
import {
  ALL_SEVEN, CROSSING_WHY, FLIP_LABEL, HAND_LABEL, LANDS_LABEL, MODELS, SEAT_TARGETS, STEPS, TAKES_MAX,
  costOf, credits, defaultFlip, genitive, groupBudget, handChoiceOf, handsOf, seatList, seatWords, startWords, stepOf, summaryOf,
  type FlipAxis, type HandChoice, type Owner, type SeatPlan,
} from "../../../src/order-model.ts";
import { promptFor } from "../../../src/order-prompts.ts";
import { getMedia } from "../material/client.ts";
import { Button, SegmentedControl, Sheet, TextArea, cn, useToast } from "../ui";
import { FlipChoice, HandChoiceRow, LandsChoice } from "./Choices";
import { OwnerChip } from "./Pictures";
import { PromptText } from "./PromptText";

const W = 1764,
  H = 1174;
const CARD_FILL = { BACK: "#e6c229", FRONT: "#2f6fd8" } as const;

function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex gap-3 border-b border-line/70 pb-4 pt-3 first:pt-0 last:border-0">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-overlay text-2xs font-semibold text-dim">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="flex items-baseline gap-2 text-sm font-medium text-ink">
          {title}
          {aside ? <span className="ml-auto text-xs font-normal text-dim">{aside}</span> : null}
        </h3>
        {children}
      </div>
    </section>
  );
}

/** A picture as it will go out: a thumbnail, its short name, whose it is; the card drawn over it where the plan says. */
function Thumb({ src, name, owner, dealer, waiting, drawn, cards }: { src: string | null; name: string; owner: Owner | null; dealer: string; waiting?: string | null; drawn?: boolean; cards?: { quad: [number, number][]; side: "FRONT" | "BACK"; faint?: boolean }[] }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <div className="relative aspect-[1764/1174] overflow-hidden rounded-md border border-line bg-well">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a lab file
          <img src={src} alt={name} className="size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,#0c110f_0_10px,#0a0e0c_10px_20px)] text-center">
            <Clock className="size-5 text-vantar" />
            <span className="text-sm text-ink">Väntar på {waiting ?? "bilden"}</span>
            <span className="text-2xs text-dim">{drawn ? "kortet ritas på den när den är godkänd i Material" : "hämtas hit när den är godkänd i Material"}</span>
          </div>
        )}
        {cards?.length ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {cards.map((c, i) => (
              <polygon key={i} points={c.quad.map((p) => p.join(",")).join(" ")} fill={c.faint ? "none" : CARD_FILL[c.side]} stroke={c.faint ? "#e8cb85" : "#0b0d0c"} strokeWidth={c.faint ? 3 : 2} strokeDasharray={c.faint ? "10 8" : undefined} opacity={c.faint ? 0.7 : 1} />
            ))}
          </svg>
        ) : null}
      </div>
      <figcaption className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
        <span className="truncate text-ink">{name}</span>
        <OwnerChip owner={owner} dealer={dealer} />
      </figcaption>
    </figure>
  );
}

const served = (e: EntryAnswer | null) => (e?.served && !e.served.endsWith(".mp4") ? labUrl(e.served) : null);
const entryName = (e: EntryAnswer | null, dealerName: string, at: string) => `${genitive(dealerName)} ankare ${at}${e && e.state && e.state !== "gäller" ? ` · ${/kandidat\s*\d+/i.exec(e.name)?.[0] ?? e.state}` : ""}`;

export function NewOrder({ open, onOpenChange, all, preset, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; all: OrdersAnswer; preset: Preset | null; onCreated: (a: OrderAnswer) => void }) {
  const [media, setMedia] = useState<MediaAnswer | null>(null);
  const [dealerId, setDealerId] = useState(preset?.dealer ?? "paow");
  const [stepKey, setStepKey] = useState<StepKey | null>(preset?.step ?? null);
  const [target, setTarget] = useState(preset?.target ?? "P4.C1");
  const [allSeven, setAllSeven] = useState(preset?.all ?? false);
  // null: what Placering says for the card.
  const [side, setSide] = useState<"FRONT" | "BACK" | null>(null);
  const [hand, setHand] = useState<HandChoice | null>(null);
  const [passEverywhere, setPassEverywhere] = useState(false);
  const [flip, setFlip] = useState<{ key: string; axis: FlipAxis } | null>(null);
  const [duration, setDuration] = useState<{ key: string; seconds: number } | null>(null);
  const [takes, setTakes] = useState(2);
  const [base, setBase] = useState<{ key: string; id: string } | null>(null);
  const [extra, setExtra] = useState("");
  const [shownSeat, setShownSeat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open && !media) void getMedia().then(setMedia, () => setMedia(null));
  }, [open, media]);
  const dealer: DealerAnswer | null = media?.dealers.find((d) => d.id === dealerId) ?? null;
  const dealerName = dealer?.name ?? all.dealers?.find((d) => d.id === dealerId)?.name ?? dealerId;
  const look = all.dealers?.find((d) => d.id === dealerId)?.look ?? null;
  const entries = dealer?.entries ?? [];
  const key = stepKey ?? (dealer ? firstLacking(entries) : "ANKARE-2.1");
  const step = stepOf(key)!;
  const model = MODELS[step.model];
  const plan = all.plan ?? null;
  const seconds = duration?.key === key ? duration.seconds : (step.duration ?? 4);
  const start = anchorFor(entries, step.from);
  const startEntry = start.holds ?? (step.kind === "STILL" ? (start.candidates.find((c) => c.id === (base?.key === `${dealerId}:${key}` ? base.id : null)) ?? start.candidates[0] ?? null) : null);
  const end = step.kind === "FILM" && !step.card && step.to ? anchorFor(entries, step.to).holds : null;

  // ── The seats and what each gets ──
  const targets = step.card ? (allSeven ? ALL_SEVEN : [target]) : [];
  const seatOf = (t: string): SeatPlan | null => plan?.seats[t] ?? null;
  const crossing = ALL_SEVEN.filter((t) => seatOf(t)?.crosses);
  const handsAt = (t: string) => {
    const s = seatOf(t);
    if (hand === null) return { hand: s?.hand ?? ("LH" as const), pass: s?.pass ?? false };
    if (hand === "PASS" && allSeven && !passEverywhere) return { hand: "LH" as const, pass: !!s?.crosses };
    return handsOf(hand);
  };
  const sideAt = (t: string) => side ?? seatOf(t)?.side ?? "FRONT";
  const planSides = [...new Set(targets.map((t) => seatOf(t)?.side ?? "FRONT"))];
  const planHands = [...new Set(targets.map((t) => handChoiceOf({ hand: seatOf(t)?.hand ?? "LH", pass: seatOf(t)?.pass })))];
  const shownSide = side ?? (planSides.length === 1 ? planSides[0] : null);
  const shownHand: HandChoice = hand ?? (planHands.length === 1 ? planHands[0] : "LH");
  const open_ = targets.some((t) => sideAt(t) === "FRONT");
  const suggestedFlip = defaultFlip(key, seatOf(targets[0] ?? "P4.C1")?.turnAt);
  const flipAxis = flip?.key === key ? flip.axis : suggestedFlip;
  const focus = step.card ? (shownSeat && targets.includes(shownSeat) ? shownSeat : targets[0]) : null;
  const motionAt = (t: string) => ({ grip: step.grip ?? ("PINCH" as const), ...handsAt(t), turn: sideAt(t) === "FRONT", flipAxis, side: sideAt(t), target: t });

  // ── What it turns into ──
  const focusSeat = focus ? seatOf(focus) : null;
  const motion = focus ? motionAt(focus) : null;
  const prompt = look ? promptFor({ dealer: { name: dealerName, look }, step: key, model: step.model, motion, place: focusSeat ? { x: focusSeat.centre[0], y: focusSeat.centre[1] } : null, extra: extra.trim() || null }) : null;
  const summary = summaryOf(step, dealerName, motion);
  const params: Record<string, string | number | boolean> =
    step.kind === "STILL" ? { ratio: step.ratio!, imageSize: step.imageSize! } : { resolution: step.resolution ?? "1080p", duration: seconds, ...(step.model === "wan3" ? { ratio: "adaptive", generateAudio: false } : {}) };
  const cost = all.policy ? costOf({ model: step.model, params }, takes, all.policy.prices) : null;
  const count = Math.max(1, targets.length);
  const budget = cost && all.policy ? groupBudget(cost, count, all.policy, all.day.spent, all.balance?.credits ?? 0) : null;
  const durations = model.durations ? Array.from({ length: Math.min(model.durations[1], 10) - model.durations[0] + 1 }, (_, i) => model.durations![0] + i) : [];
  const groups = stepGroups();
  const pose = all.poses?.find((p) => p.step === key) ?? null;
  const me: Owner = { dealer: dealerId, name: dealerName, part: "whole" };
  let shown = 0;
  const next = () => ++shown;

  const pictures: ReactNode =
    step.kind === "STILL" ? (
      <>
        <Thumb src={served(startEntry)} name={`Dealerns bild · ${entryName(startEntry, dealerName, step.from)}`} owner={me} dealer={dealerId} waiting={startEntry ? null : `ankare ${step.from}`} />
        <Thumb src={pose ? labUrl(`${pose.served}${startEntry ? `?anchor=${encodeURIComponent(startEntry.id)}` : ""}`) : null} name="Pose · bara armen, handen och skon" owner={pose?.owner ?? null} dealer={dealerId} waiting="posebilden" />
      </>
    ) : (
      <>
        <Thumb src={served(start.holds)} name={`Första bild · ${entryName(start.holds, dealerName, step.from)}`} owner={me} dealer={dealerId} waiting={start.holds ? null : `ankare ${step.from}`} />
        {step.card && focus && focusSeat ? (
          <Thumb
            src={served(start.holds)}
            name={`Sista bild · samma + kortet ${sideAt(focus) === "BACK" ? "stängt" : "öppet"} på ${seatWords(focus)}`}
            owner={me}
            dealer={dealerId}
            waiting={start.holds ? null : `ankare ${step.from}`}
            drawn
            cards={[...targets.filter((t) => t !== focus).map((t) => ({ quad: seatOf(t)!.quad, side: sideAt(t), faint: true })), { quad: focusSeat.quad, side: sideAt(focus) }]}
          />
        ) : (
          <Thumb src={served(end)} name={`Sista bild · ${entryName(end, dealerName, step.to ?? step.from)}`} owner={me} dealer={dealerId} waiting={end ? null : `ankare ${step.to}`} />
        )}
      </>
    );

  const create = async () => {
    setBusy(true);
    try {
      const common = { dealer: dealerId, step: key, takes, extra: extra.trim() || null, ...(step.kind === "FILM" ? { duration: seconds } : {}) };
      const card = step.card ? { flipAxis } : {};
      const made = !step.card
        ? await createOrder({ ...common, ...(step.kind === "STILL" && !start.holds && startEntry ? { base: startEntry.id } : {}) })
        : allSeven
          ? await createOrder({ ...common, ...card, seats: targets.map((t) => ({ target: t, ...handsAt(t), side: sideAt(t) })) })
          : await createOrder({ ...common, ...card, target, ...handsAt(target), side: sideAt(target) });
      onCreated(made);
    } catch (error) {
      toast({ tone: "bad", title: asApiError(error, "Utkastet").message });
    } finally {
      setBusy(false);
    }
  };

  const recommend = (() => {
    if (!step.card || !plan) return null;
    if (allSeven)
      return crossing.length ? `Förslag: handbyte på ${seatList(crossing)}. Där ${CROSSING_WHY}.` : "Vänsterhanden når alla sju utan att korsa kroppen.";
    const s = seatOf(target);
    if (!s?.crosses) return `Vänsterhanden når ${seatWords(target)} utan att korsa kroppen.`;
    return shownHand === "PASS" ? `Handbyte, som föreslaget: på ${seatWords(target)} ${CROSSING_WHY}.` : `Förslag: handbyte. På ${seatWords(target)} ${CROSSING_WHY}.`;
  })();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ny beställning"
      subtitle="Allt har förval. Till höger ser du vad valen blir; utkastet godkänns sedan i Det här skickas."
      width={1280}
      modal
      footer={
        <>
          <span className="mr-auto text-sm tabular-nums text-ink">
            {cost ? `${count > 1 ? `${count} utkast × ` : ""}${takes} × ${credits(cost.perTake)} = ${credits(cost.total * count)} krediter` : "Inget pris"}
            {budget && budget.fitToday < count ? <span className="ml-2 text-[#f0b07a]">· {count > 1 ? `räcker till ${budget.fitToday} av ${count} i dag` : "ryms inte i dag"}</span> : null}
          </span>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button variant="primary" loading={busy} disabled={!cost || !!step.off || (step.card && !plan)} onClick={() => void create()}>
            {count > 1 ? `Skapa ${count} utkast` : "Skapa utkast"}
          </Button>
        </>
      }
    >
      <div className="-my-4 grid h-[calc(100%+2rem)] grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6">
        {/* The choices */}
        <div className="min-h-0 overflow-y-auto py-4 pr-2">
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
            <p className="rounded-sm bg-raised px-2.5 py-1.5 text-sm text-ink">{startWords(step)}</p>
          </Step>
          {step.card ? (
            <>
              <Step n={next()} title="Plats på bordet">
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    label="Plats"
                    size="sm"
                    value={allSeven ? "" : target}
                    onChange={(t) => {
                      setTarget(t);
                      setAllSeven(false);
                    }}
                    options={SEAT_TARGETS.map((t) => ({ value: t, label: t === "D.C1" ? "Dealer" : t.replace(".C1", ""), title: seatOf(t)?.crosses ? `${seatWords(t)}: vänsterhanden korsar kroppen` : seatWords(t) }))}
                  />
                  <button type="button" onClick={() => setAllSeven(true)} className={cn("h-7 rounded-md border px-2.5 text-sm", allSeven ? "border-brass/60 bg-brass/12 text-brass-hi" : "border-line text-ink hover:bg-raised")}>
                    Alla sju
                  </button>
                </div>
                <p className="text-xs text-dim">{allSeven ? "Första kortet till varje spelare: ett utkast per plats, i en grupp, var och ett med sin text och sin sista bild." : `Ett kort till ${seatWords(target)}.`}</p>
              </Step>
              <Step n={next()} title="Hur kortet landar">
                <LandsChoice value={shownSide} plan={planSides.length === 1 ? planSides[0] : null} onChange={setSide} />
                {!side && planSides.length > 1 ? <p className="text-xs text-dim">Placering säger olika per plats; utan val följer varje plats sin.</p> : null}
              </Step>
              <Step n={next()} title="Hand">
                <HandChoiceRow value={shownHand} plan={planHands.length === 1 ? planHands[0] : null} onChange={setHand} />
                {shownHand === "PASS" && allSeven && crossing.length && crossing.length < 7 ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-dim">Handbyte på</span>
                    <SegmentedControl label="Handbyte på" size="sm" value={passEverywhere ? "alla" : "korsar"} onChange={(v) => setPassEverywhere(v === "alla")} options={[{ value: "korsar", label: `${seatList(crossing)} (förslaget)` }, { value: "alla", label: "alla sju" }]} />
                  </div>
                ) : null}
                {recommend ? (
                  <p className={cn("text-sm", recommend.startsWith("Förslag") ? "text-brass-hi" : "text-dim")}>
                    {recommend}
                    {recommend.startsWith("Förslag") && shownHand !== "PASS" ? (
                      <button type="button" className="ml-2 text-brass-hi underline underline-offset-2" onClick={() => setHand("PASS")}>
                        Ta förslaget
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </Step>
              {open_ ? (
                <Step n={next()} title="Hur kortet vänds">
                  <FlipChoice value={flipAxis} suggested={suggestedFlip} onChange={(axis) => setFlip({ key, axis })} />
                </Step>
              ) : null}
            </>
          ) : null}
          <Step n={next()} title={step.kind === "STILL" ? "Bild, modell och tagningar" : "Modell, längd och tagningar"}>
            {step.kind === "STILL" && !start.holds && start.candidates.length > 1 ? (
              <SegmentedControl label="Dealerns bild" size="sm" value={startEntry?.id ?? ""} onChange={(id) => setBase({ key: `${dealerId}:${key}`, id })} options={start.candidates.map((c) => ({ value: c.id, label: c.name }))} />
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-ink">{model.label}</span>
              {durations.length ? <SegmentedControl label="Längd" size="sm" value={seconds} onChange={(s) => setDuration({ key, seconds: s })} options={durations.map((d) => ({ value: d, label: `${d} s` }))} /> : <span className="text-dim">{step.imageSize} · {step.ratio}</span>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-dim">Tagningar</span>
              <SegmentedControl label="Tagningar" size="sm" value={takes} onChange={setTakes} options={Array.from({ length: TAKES_MAX }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
            </div>
            <TextArea label="Eget tillägg (valfritt, engelska)" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={600} rows={2} />
          </Step>
        </div>

        {/* What it turns into */}
        <div className="min-h-0 overflow-y-auto border-l border-line py-4 pl-6">
          <div className="flex flex-col gap-5">
            <p className="font-display text-lg font-semibold leading-7 text-ink">{summary}</p>
            {step.card && motion ? (
              <p className="-mt-3 text-sm text-dim">
                {HAND_LABEL[handChoiceOf(motion)]} · {LANDS_LABEL[motion.side]}
                {motion.side === "FRONT" ? ` · ${FLIP_LABEL[flipAxis]}` : ""}
                {allSeven ? ` · visar ${seatWords(focus)} av sju` : ""}
              </p>
            ) : null}
            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Bilderna som skickas</h4>
              <div className="grid grid-cols-2 gap-3">{pictures}</div>
              {step.kind === "STILL" ? <p className="text-xs text-dim">Posebilden är bara armen, handen och skon ur {pose?.label ?? "den andra dealerns bild"}; resten av henne är bortklippt, och det gröna görs som ankarets.</p> : null}
            </section>
            <section className="flex flex-col gap-1.5">
              <h4 className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Kostnad</h4>
              {cost && budget ? (
                <>
                  <p className="text-md tabular-nums text-ink">
                    {count > 1 ? `${count} utkast × ` : ""}
                    {takes} tagningar × {credits(cost.perTake)} = {credits(budget.total)} krediter
                    {budget.worstTotal > budget.total ? <span className="text-dim"> (högst {credits(budget.worstTotal)})</span> : null}
                  </p>
                  {budget.words.map((w) => (
                    <p key={w} className={cn("text-sm", /räcker till|inget|avstängda/.test(w) ? "text-[#f0b07a]" : "text-dim")}>
                      {w}
                    </p>
                  ))}
                  <p className="text-xs text-faint">
                    Taken: {credits(all.policy?.maxPerOrder ?? 0)} per beställning, {credits(all.day.cap)} per dag, golv {credits(all.policy?.minBalance ?? 0)}. {cost.basis}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#ef8b8b]">Inget pris för de här värdena i data/order-policy.json.</p>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h4 className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.08em] text-faint">
                Texten som skickas
                {prompt ? <span className="font-normal normal-case tracking-normal text-dim">{prompt.text.length.toLocaleString("sv-SE")} tecken · mall {prompt.template}</span> : null}
              </h4>
              {allSeven && step.card ? (
                <SegmentedControl label="Visa texten för" size="sm" value={focus ?? ""} onChange={setShownSeat} options={targets.map((t) => ({ value: t, label: `${t.replace(".C1", "")}${handsAt(t).pass ? " · byte" : ""}` }))} />
              ) : null}
              {prompt ? <PromptText text={prompt.text} parts={prompt.parts} /> : <p className="text-sm text-[#f0b07a]">Labbservern behöver startas om för att visa texten här (den saknar dealerns utseende och planen).</p>}
            </section>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
