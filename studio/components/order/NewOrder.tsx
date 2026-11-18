"use client";

// A new order along one straight line (2026-11-18). A person chooses three things: the dealer, what (the step, which says the
// anchor a film starts from) and, for a film with a card, the place on the table (one seat and its card 1 or 2, or "Alla sju").
// Everything else is the step's ONE recipe (data/order-methods.json, src/order-methods.ts recipeFor), shown in a box as what
// will be ordered: model, resolution, seconds, shape, the last picture, the reference film, the text and the takes. The sheet
// sends only the dealer, the step and the card, and the store fills in the recipe; whatever is set under "Undantag från
// receptet" (folded) is a deliberate exception, sent as such and named in the draft's notes. It opens on the picture (Stage):
// his notation for what is ordered ("A2.1 → P4C1") over the picture the film starts from with every card place of the plan on
// it; a press on a place chooses that card. Förhandsvisa opens the server's pictures, reference film, generated values
// and text. Saving then makes the exact draft(s) and opens "Det här skickas". Opened with values from the address
// (presetOf); with som=<id> every choice of that order is chosen as an exception (recipeOf), the pictures fetched fresh from
// what holds now and the text written with today's template. Only the dealers of data/dealers.json are offered.
import { useEffect, useState, type ReactNode } from "react";
import { useBank } from "../../lib/bank.ts";
import { labUrl } from "../../lib/lab.ts";
import type { DealerAnswer, EntryAnswer, MediaAnswer } from "../../lib/media.ts";
import {
  SECOND_CARD, SECOND_CARD_WORDS, SHEET_DEALER, anchorFor, cardBody, cardOf, seatFlip, firstLacking, gripAgainstPlan, orderableCard, recipeOf, routeOf, seatKey, stepGroups, withCard,
  type NewOrderInput, type OrderAnswer, type OrdersAnswer, type Preset, type StepKey,
} from "../../lib/orders.ts";
import { kortplanHref } from "../../lib/bordet.ts";
import {
  ALL_SEVEN, FLIP_LABEL, HAND_LABEL, LANDS_LABEL, SEAT_TARGETS, SHAPE_LABEL, STEPS, TAKES_MAX,
  a3Candidates, costOf, credits, genitive, groupBudget, handChoiceOf, handsOf, landingMissing, landingOf, lengthFor, modelFor, modelsFor, paramsOf, referenceCandidates, scaleQuad, scaleWords, seatEndMissing, seatEndOf, seatList, seatWords, stepOf, stylesFor,
  type BankFacts, type HandChoice, type ModelDef, type SeatPlan, type Shape, type TextStyle,
} from "../../../src/order-model.ts";
import { METHOD_STATUS_LABEL, recipeFor, recipeHands, recipeWords, referenceByRule, referenceWaits, secondsOf } from "../../../src/order-methods.ts";
import { NEUTRAL_BACKDROP } from "../../../src/placement-model.ts";
import { getMedia } from "../material/client.ts";
import { Badge, Button, SegmentedControl, Select, Sheet, TextArea, cn } from "../ui";
import { HandChoiceRow, LandsChoice, ModelChoice, ReferenceChoice, ScaleChoice, ShapeChoice, TextChoice } from "./Choices";
import { OrderPreview } from "./OrderPreview";
import { Stage, type StageBase, type StageCard, type StageLook } from "./Stage";

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

const served = (e: EntryAnswer | null) => (e?.served && !e.served.endsWith(".mp4") ? labUrl(e.served) : null);
/** A register entry that is one frame of a film, as the film and the moment to show. */
const frameOf = (e: EntryAnswer | null) => (e?.served?.endsWith(".mp4") && e.frame !== undefined ? { video: labUrl(e.served), time: (e.frame + 0.5) / (e.fps ?? 24) } : null);
/** "1080p", "4K": a film's resolution or a still's size as the screens write it. */
const resolutionWords = (p: Record<string, string | number | boolean>) => String(p.resolution ?? p.imageSize ?? "").replace(/k$/, "K");
const entryName = (e: EntryAnswer | null, dealerName: string, at: string) => `${genitive(dealerName)} ankare ${at}${e && e.state && e.state !== "gäller" ? ` · ${/kandidat\s*\d+/i.exec(e.name)?.[0] ?? e.state}` : ""}`;

export function NewOrder({ open, onOpenChange, all, preset, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; all: OrdersAnswer; preset: Preset | null; onCreated: (a: OrderAnswer) => void }) {
  // "Ny beställning som den här": every choice of that order (its pictures are fetched fresh when the draft is made).
  const like = preset?.like ? (all.orders.find((a) => a.order.id === preset.like)?.order ?? null) : null;
  const r = like ? recipeOf(like) : null;
  const [media, setMedia] = useState<MediaAnswer | null>(null);
  const [dealerId, setDealerId] = useState(r?.dealer ?? preset?.dealer ?? SHEET_DEALER);
  const [stepKey, setStepKey] = useState<StepKey | null>(r?.step ?? preset?.step ?? null);
  const [target, setTarget] = useState(r?.target ?? preset?.target ?? "P4.C1");
  const [allSeven, setAllSeven] = useState(preset?.all ?? false);
  // null: what Placering says for the card.
  const [side, setSide] = useState<"FRONT" | "BACK" | null>(r?.side ?? null);
  const [hand, setHand] = useState<HandChoice | null>(r?.hand ?? null);
  const [passEverywhere, setPassEverywhere] = useState(false);
  const [duration, setDuration] = useState<{ key: string; seconds: number } | null>(r?.duration ? { key: r.step, seconds: r.duration } : null);
  // The model chosen for a step (key null: asked for by address, for whatever step the sheet opens on).
  const [modelChoice, setModelChoice] = useState<{ key: string | null; id: string } | null>(r ? { key: r.step, id: r.model } : preset?.model ? { key: preset.step, id: preset.model } : null);
  // Every exception starts unset (null, and for the reference film undefined): the recipe's value is then what is ordered.
  const [takesChoice, setTakes] = useState<number | null>(r?.takes ?? null);
  const [base, setBase] = useState<{ key: string; id: string } | null>(null);
  const [endChoice, setEndChoice] = useState<{ key: string; id: string } | null>(null);
  const [extraChoice, setExtra] = useState<string | null>(r ? r.extra : null);
  const [styleChoice, setStyle] = useState<TextStyle | null>(r?.style ?? null);
  const [shapeChoice, setShape] = useState<Shape | null>(r?.shape ?? null);
  // undefined: the film the recipe's rule finds; null: none (an exception); a take: that film (an exception).
  const [refChoice, setRef] = useState<string | null | undefined>(r ? r.reference : undefined);
  const [scaleChoice, setScale] = useState(r?.cardScale ?? 1);
  // The picture under the places: the dealer's own (what is sent) or Kortplan's neutral table (Siluett).
  const [stageLook, setStageLook] = useState<StageLook>("ankare");
  const [pending, setPending] = useState<NewOrderInput | null>(null);
  const { bank } = useBank();

  useEffect(() => {
    if (open && !media) void getMedia().then(setMedia, () => setMedia(null));
  }, [open, media]);
  // Only a dealer of data/dealers.json can be ordered for; the register may hold others (a separate track).
  const orderable = (media?.dealers ?? []).filter((d) => !all.dealers || all.dealers.some((x) => x.id === d.id));
  const dealer: DealerAnswer | null = orderable.find((d) => d.id === dealerId) ?? null;
  const dealerName = dealer?.name ?? all.dealers?.find((d) => d.id === dealerId)?.name ?? dealerId;
  const entries = dealer?.entries ?? [];
  const key = stepKey ?? (dealer ? firstLacking(entries) : "ANKARE-2.1");
  const step = stepOf(key)!;
  // The step's one recipe for the card chosen: everything that is not set as an exception below comes from it.
  const recipe = recipeFor(all.methods ?? null, key, step.card ? target : null);
  const models = modelsFor(step);
  const model = (modelChoice && (modelChoice.key === null || modelChoice.key === key) ? modelFor(step, modelChoice.id) : null) ?? modelFor(step, recipe?.model) ?? models[0];
  const plan = all.plan ?? null;
  const takes = takesChoice ?? recipe?.takes ?? 1;
  const extra = extraChoice ?? recipe?.extra ?? "";
  const start = anchorFor(entries, step.from);
  const startEntry = start.holds ?? (step.kind === "STILL" ? (start.candidates.find((c) => c.id === (base?.key === `${dealerId}:${key}` ? base.id : null)) ?? start.candidates[0] ?? null) : null);
  // The anchor a film ends on: an entry or a rest, and a return (from the landing picture back to its anchor).
  const end = step.kind === "FILM" && (!step.card || step.start === "LAND") && step.to ? anchorFor(entries, step.to).holds : null;

  // ── The seats and what each gets ──
  // "Alla sju" is for a deal; a return is ordered seat by seat.
  const seven = allSeven && step.start !== "LAND";
  const targets = step.card ? (seven ? ALL_SEVEN : [target]) : [];
  const seatOf = (t: string): SeatPlan | null => plan?.seats[t] ?? null;
  const crossing = ALL_SEVEN.filter((t) => seatOf(t)?.crosses);
  const handsAt = (t: string) => {
    const s = seatOf(t);
    // Nothing chosen: the recipe's hand for a deal (the hand at the shoe all the way), else what Placering says for the card.
    if (hand === null) return recipe?.hand && step.start !== "LAND" ? { hand: recipe.hand, pass: false } : { hand: s?.hand ?? ("LH" as const), pass: s?.pass ?? false };
    if (hand === "PASS" && seven && !passEverywhere) return { hand: "LH" as const, pass: !!s?.crosses };
    return handsOf(hand);
  };
  const sideAt = (t: string) => side ?? seatOf(t)?.side ?? "FRONT";
  const planSides = [...new Set(targets.map((t) => seatOf(t)?.side ?? "FRONT"))];
  const planHands = [...new Set(targets.map((t) => handChoiceOf({ hand: seatOf(t)?.hand ?? "LH", pass: seatOf(t)?.pass })))];
  const shownSide = side ?? (planSides.length === 1 ? planSides[0] : null);
  // Nothing chosen: the recipe's hand for a deal, else the plan's where every seat says the same.
  const shownHand: HandChoice = hand ?? (recipe?.hand && step.start !== "LAND" ? recipe.hand : planHands.length === 1 ? planHands[0] : "LH");
  const open_ = targets.some((t) => sideAt(t) === "FRONT");
  // How the card turns: what Kortplan's Rörelse says for the (first) card, unless chosen here.
  // Each seat turns as the plan says for it unless one turn is chosen for the whole order; only a chosen one is sent, so that
  // with "Alla sju" every seat keeps its own (the store takes each seat's from the plan when the order names none).
  const flipAt = (t: string) => seatFlip(key, seatOf(t), recipe?.turn ?? null);
  // The grip is the step's; where Placering plans the card(s) with the other one, the sheet says so.
  const gripLine = gripAgainstPlan(step, targets.map(seatOf));
  const focus = step.card ? targets[0] : null;
  const motionAt = (t: string) => ({ grip: step.grip ?? ("PINCH" as const), ...handsAt(t), turn: sideAt(t) === "FRONT", flipAxis: flipAt(t), side: sideAt(t), target: t });

  // ── The text's style, bara dit or tur och retur, the seat's end picture, the card's size, the reference film, the length ──
  const styles = stylesFor(step.kind, step);
  const style: TextStyle = styleChoice && styles.includes(styleChoice) ? styleChoice : (recipe?.style ?? "KORT");
  const deal = step.card && step.start !== "LAND";
  const shape: Shape | null = step.kind !== "FILM" ? null : deal ? (shapeChoice ?? recipe?.shape ?? "ONE_WAY") : "ONE_WAY";
  const oneWay = deal && shape === "ONE_WAY";
  // The bank with the dummy's rendered films (the lab's clip bank does not list them; the store's answer does).
  const bankFacts: BankFacts | null = bank ? { ...(bank as BankFacts), rendered: all.rendered ?? [], cutChecks: all.cutChecks } : null;
  // The hand that lays the card: from anchor 2.3 always the other hand; else the one chosen or the plan's.
  const laysAt = (t: string): "LH" | "RH" => {
    if (step.grip === "TWO_HANDS") return "RH";
    const hands = hand === null ? recipeHands(step, recipe, seatOf(t)) : handsAt(t);
    return hands.pass ? "RH" : hands.hand;
  };
  // A deal bara dit ends on the seat's own end picture (its landing picture, else the cut frame of the bank's film to the
  // seat), or a named A3 candidate for an individual seat. A return starts on its seat's landing picture.
  const endHand = laysAt(target);
  const endKey = `${dealerId}:${key}:${target}:${endHand}`;
  const endChoices = oneWay && !seven ? a3Candidates(entries, target, endHand) : [];
  const chosenEnd = endChoice?.key === endKey ? endChoices.find((entry) => entry.id === endChoice.id) ?? null : null;
  if (endChoice && !chosenEnd) setEndChoice(null);
  const endAt = (t: string) => seatEndOf(entries, bankFacts, { dealer: dealerId, step, target: t, hand: laysAt(t), chosen: t === target ? chosenEnd?.id : undefined });
  const landing = step.card ? landingOf(entries, focus) : null;
  const lacking = oneWay ? targets.filter((t) => !endAt(t)) : step.start === "LAND" ? targets.filter((t) => !landingOf(entries, t)) : [];
  const landingWhy = lacking.length ? (oneWay ? seatEndMissing(dealerName, lacking[0], step.from) : landingMissing(dealerName, lacking[0])) + (lacking.length > 1 ? ` (saknas för ${seatList(lacking)})` : "") : null;
  const scalable = deal && shape === "ROUND_TRIP";
  const cardScale = scalable ? scaleChoice : 1;
  const candidates = model.videos && bankFacts ? referenceCandidates(bankFacts, { dealer: dealerId, step, target: focus, model }) : [];
  // The reference film: the one the recipe's rule finds for the step and the seat, unless he has chosen another or none.
  const ruleAt = (t: string | null) => (recipe && recipe.reference !== "ingen" && model.videos ? referenceByRule(bankFacts, recipe.reference, { dealer: dealerId, step, target: t, model, shape, lays: t ? laysAt(t) : null }) : null);
  const byRule = ruleAt(focus);
  const chosenRef = refChoice === undefined ? byRule : refChoice ? (candidates.find((c) => c.take === refChoice && c.fits) ?? null) : null;
  const reference = model.videos ? (chosenRef?.take ?? null) : null;
  // Where the recipe wants a reference film and its rule finds none for a seat, nothing is ordered: the step waits.
  const waiting = refChoice === undefined && recipe && recipe.reference !== "ingen" && model.videos ? (step.card ? targets : [null]).filter((t) => !ruleAt(t)) : [];
  const referenceWhy = waiting.length ? `${step.label}${waiting[0] ? ` till ${seatWords(waiting[0])}` : ""} ${referenceWaits(recipe!.reference, step)}${waiting.length > 1 ? ` (gäller ${seatList(waiting.filter((t): t is string => !!t))})` : ""}. Inget beställs utan den.` : null;
  // The length: his own; else the reference film's (the text says "with the same timing"); else the recipe's.
  const seconds = lengthFor(model, duration?.key === key ? duration.seconds : (secondsOf(model, recipe?.seconds ?? null, chosenRef) ?? model.durations?.[0] ?? 4));
  const names = Object.fromEntries((all.dealers ?? []).map((d) => [d.id, d.name]));

  // ── What it turns into ──
  const motion = focus ? motionAt(focus) : null;
  // An estimate while choosing. The server returns the final cost for each draft in the preview.
  const params = paramsOf(step, model, step.kind === "FILM" ? { duration: seconds, resolution: recipe?.resolution } : {});
  const cost = all.policy ? costOf({ model: model.id, params }, takes, all.policy.prices) : null;
  const count = Math.max(1, targets.length);
  const budget = cost && all.policy ? groupBudget(cost, count, all.policy, all.day.spent, all.balance?.credits ?? 0) : null;
  const durations = model.durations ? Array.from({ length: Math.min(model.durations[1], 10) - model.durations[0] + 1 }, (_, i) => model.durations![0] + i) : [];
  // Each model's resolution and price per take for the length chosen (within what that model takes).
  const modelWhat = (m: ModelDef) => {
    const p = paramsOf(step, m, step.kind === "FILM" ? { duration: lengthFor(m, seconds), resolution: recipe?.resolution } : {});
    const c = all.policy ? costOf({ model: m.id, params: p }, 1, all.policy.prices) : null;
    return [resolutionWords(p), c ? `${credits(c.perTake)} krediter per tagning` : "inget pris"].filter(Boolean).join(" · ");
  };
  const groups = stepGroups();
  let shown = 0;
  const next = () => ++shown;


  // ── The picture it opens on ──
  // A press on a place, like the seat field: that card alone ("Alla sju" ends).
  const pick = (t: string) => {
    setTarget(t);
    setAllSeven(false);
  };
  const route = routeOf(step, targets, shape, dealerName);
  const places = step.card && plan ? Object.values(plan.seats).filter((s) => orderableCard(s.target)) : [];
  // "Siluett" can be chosen for every step: a step without a card shows the table and the figure without places.
  const onTable = stageLook === "bord";
  // The picture the film starts from: the anchor; a return's landing picture (or, where none holds, the anchor it ends on);
  // a still's dealer's picture.
  const dealerBase: StageBase =
    step.kind === "STILL"
      ? { src: served(startEntry), name: `Dealerns bild · ${entryName(startEntry, dealerName, step.from)}`, waiting: startEntry ? null : `ankare ${step.from}` }
      : step.start === "LAND"
        ? landing
          ? { src: served(landing), frame: frameOf(landing), name: `${genitive(dealerName)} landning på ${seatWords(focus)}` }
          : { src: served(end), name: entryName(end, dealerName, step.to ?? step.from), waiting: end ? null : `ankare ${step.to}`, dim: true }
        : { src: served(start.holds), name: entryName(start.holds, dealerName, step.from), waiting: start.holds ? null : `ankare ${step.from}` };
  const stageBase: StageBase = onTable ? { src: labUrl(NEUTRAL_BACKDROP.native), name: "Studions bord med siluett" } : dealerBase;
  // The ordered card(s) where the plan lays them, at the order's size; in a return the landing picture holds the card already.
  const stageCards: StageCard[] = step.cards?.length
    ? step.cards.flatMap((c) => (seatOf(c.target) ? [{ target: c.target, quad: seatOf(c.target)!.quad, side: c.before, filled: true, ring: true }] : []))
    : step.card
      ? targets.flatMap((t) => {
          const s = seatOf(t);
          return s ? [{ target: t, quad: step.start === "LAND" ? s.quad : scaleQuad(s.quad, cardScale).quad, side: sideAt(t), filled: onTable || !(step.start === "LAND" && landing), ring: t === focus }] : [];
        })
      : [];
  const moved = step.card ? focus : (step.target ?? null);
  const move = moved ? kortplanHref(moved) : null;
  const caption = onTable
    ? places.length || stageCards.length
      ? "Studions bord med en siluett visar kortets plats."
      : "Studions bord med en siluett i ankare 1."
    : step.kind === "STILL"
      ? `${dealerBase.name}: bilden som ändras.`
      : step.cards?.length
        ? `${dealerBase.name} med hålkortet stängt: första bilden.`
        : step.start === "LAND"
          ? landing
            ? `${dealerBase.name}: första bilden.`
            : `Ingen landningsbild för ${seatWords(focus)} än; bilden är ${dealerBase.name}.`
          : step.card
            ? oneWay
              ? `${dealerBase.name}: första bilden. Kortet visar var det landar; sista bilden är platsens egen slutbild.`
              : `${dealerBase.name} med ${seven ? "korten där planen lägger dem" : "kortet där planen lägger det"}: skiss av kortets läge.`
            : `${dealerBase.name}: första bilden.`;

  const prepare = () => {
    // The line: the dealer, the step and the card. The store fills in the recipe; only what he has set against it is sent.
    const common = {
      dealer: dealerId, step: key,
      ...(!recipe || takes !== recipe.takes ? { takes } : {}),
      ...(extraChoice !== null && extra.trim() !== (recipe?.extra ?? "") ? { extra: extra.trim() || null } : {}),
      ...(!recipe || style !== recipe.style ? { style } : {}),
      ...(!recipe || model.id !== recipe.model ? { model: model.id } : {}),
      ...(step.kind === "FILM" && (!recipe || duration?.key === key) ? { duration: seconds } : {}),
      ...(refChoice !== undefined && model.videos ? { reference } : {}),
    };
    const card = step.card ? cardBody({ shape: !recipe || (deal && shape !== recipe.shape) ? shape : null, deal: !!deal, cardScale }) : {};
    // The hand and the side only where he chose them: without a choice the store takes what Placering says for each card.
    const seatOwn = (t: string) => ({ ...(hand !== null ? handsAt(t) : {}), ...(side !== null ? { side: sideAt(t) } : {}) });
    setPending(!step.card
      ? { ...common, ...(step.kind === "STILL" && !start.holds && startEntry ? { base: startEntry.id } : {}) }
      : seven
        ? { ...common, ...card, seats: targets.map((t) => ({ target: t, ...seatOwn(t) })) }
        : { ...common, ...card, target, ...seatOwn(target), ...(chosenEnd ? { end: chosenEnd.id } : {}) });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ny beställning"
      subtitle="Välj vad och kortets plats. Resten är stegets recept; utkastet godkänns sedan i Det här skickas."
      width={1280}
      // On a phone the sheet takes the whole width (the default leaves 96 px of the page beside it).
      className="max-sm:w-screen!"
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
          <Button variant="primary" disabled={!!step.off || (step.card && !plan) || !!model.off} title={model.off ?? undefined} onClick={prepare}>
            Förhandsvisa
          </Button>
        </>
      }
    >
      {/* Wide: the picture and what it turns into on the left, the choices on the right, each scrolling on its own. On a
          phone one column: the picture, the choices, then what it turns into (the left column's box gives way, "contents"). */}
      <div className="flex flex-col gap-6 lg:-my-4 lg:grid lg:h-[calc(100%+2rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:py-4 lg:pr-2">
          <div className="order-1">
            <Stage route={route} base={stageBase} places={places} cards={stageCards} chosen={step.card && !seven ? target : null} onPick={pick} move={move} look={stageLook} onLook={setStageLook} caption={caption} />
          </div>
          {/* What it turns into */}
          <div className="order-3 flex flex-col gap-5">
            {step.card && motion ? (
              <p className="text-sm text-dim">
                {HAND_LABEL[handChoiceOf(motion)]} · {LANDS_LABEL[motion.side]}
                {motion.side === "FRONT" && step.start !== "LAND" ? ` · ${FLIP_LABEL[motion.flipAxis]}` : ""}
                {shape && deal ? ` · ${SHAPE_LABEL[shape]}` : ""}
                {cardScale !== 1 ? ` · prov: kortet ${scaleWords(cardScale)} av planens` : ""}
                {seven ? ` · visar ${seatWords(focus)} av sju` : ""}
              </p>
            ) : null}
            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Uppskattad kostnad</h4>
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
          </div>
        </div>

        {/* The choices */}
        <div className="order-2 min-w-0 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-line lg:py-4 lg:pl-6">
          <Step n={next()} title="Dealer">
            <SegmentedControl label="Dealer" value={dealerId} onChange={setDealerId} options={(orderable.length ? orderable : (all.dealers ?? [{ id: "paow", name: "Paow" }])).map((d) => ({ value: d.id, label: d.id === "pamela" ? `${d.name} (pausad)` : d.name }))} />
            {like ? <p className="text-xs text-brass-hi">Som {like.title}: alla val därifrån; bilderna hämtas som de gäller nu.</p> : null}
            {r?.longText ? (
              <p className="text-xs text-dim">Texten skrivs med dagens korta mall.</p>
            ) : null}
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
            {gripLine ? (
              <p data-plan-differs className="text-sm text-[#f0b07a]">
                {gripLine}
              </p>
            ) : null}
          </Step>
          {step.card ? (
            <>
              <Step n={next()} title="Plats på bordet">
                <div className="flex flex-wrap items-center gap-2">
                  {/* A player's seat keeps the card number chosen (P3 kort 2 → P5 kort 2); the dealer's two cards are seats. */}
                  <SegmentedControl
                    label="Plats"
                    size="sm"
                    className="max-w-full flex-wrap"
                    value={seven ? "" : seatKey(target)}
                    onChange={(t) => pick(withCard(t, cardOf(target)))}
                    options={SEAT_TARGETS.map((t) => ({ value: t, label: t === "D.C1" ? "Dealer" : t === "D.C2" ? "Hålkort" : t.replace(".C1", ""), title: seatOf(t)?.crosses ? `${seatWords(t)}: vänsterhanden korsar kroppen` : seatWords(t) }))}
                  />
                  {step.start !== "LAND" ? (
                    <button type="button" onClick={() => setAllSeven(true)} className={cn("h-7 rounded-md border px-2.5 text-sm", seven ? "border-brass/60 bg-brass/12 text-brass-hi" : "border-line text-ink hover:bg-raised")}>
                      Alla sju
                    </button>
                  ) : null}
                </div>
                {!seven && /^P/.test(target) ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-dim">Kort</span>
                    <SegmentedControl
                      label="Kort"
                      size="sm"
                      value={cardOf(target)}
                      onChange={(n) => pick(withCard(target, n))}
                      options={[
                        { value: 1 as const, label: "1", title: `Första kortet på ${seatWords(withCard(target, 1))}` },
                        { value: 2 as const, label: "2", title: `Andra kortet på ${seatWords(withCard(target, 1))}` },
                      ]}
                    />
                  </div>
                ) : null}
                <p className="text-xs text-dim">
                  {seven ? "Första kortet till varje spelare: ett utkast per plats, i en grupp, var och ett med sin text och sin sista bild." : `Ett kort till ${seatWords(target)}.`}
                  {!seven && SECOND_CARD.test(target) ? ` ${SECOND_CARD_WORDS}` : ""}
                </p>
              </Step>
            </>
          ) : null}
          {/* The recipe: what is ordered when nothing else is said. One line, and plainly what keeps the order from being made. */}
          <section data-recipe className="my-3 flex flex-col gap-1.5 rounded-md border border-brass/30 bg-brass/5 px-3 py-2.5">
            <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
              Receptet
              {recipe ? (
                <Badge tone={recipe.method.status === "gäller" ? "ok" : "wait"} size="sm">
                  {METHOD_STATUS_LABEL[recipe.method.status]}
                </Badge>
              ) : null}
            </h3>
            <p className="text-sm leading-5 text-ink">{recipe ? recipeWords(recipe.method) : "Ingen metod än för det här steget: inget är förvalt. Välj modell och längd själv under Undantag."}</p>
            {landingWhy || referenceWhy ? <p data-blocked className="text-sm leading-5 text-[#ef8b8b]">{landingWhy ?? referenceWhy}</p> : null}
          </section>
          <details data-exceptions className="group rounded-md border border-line px-3 py-2" open={!recipe || !!like}>
            <summary className="cursor-pointer text-sm text-ink">
              Undantag från receptet <span className="text-xs text-dim">· ett val här är ett medvetet avsteg och står i utkastets anteckningar</span>
            </summary>
            <div className="mt-3">
          {step.kind === "FILM" || styles.length > 1 ? (
            <Step n={next()} title="Text">
              <TextChoice value={style} styles={styles} recipe={recipe?.style ?? null} onChange={setStyle} />
            </Step>
          ) : null}
          {step.card ? (
            <>
              {deal ? (
                <Step n={next()} title="Bara dit eller tur och retur">
                  <ShapeChoice value={shape ?? "ONE_WAY"} recipe={recipe?.shape ?? null} missing={oneWay && lacking.length ? landingWhy : null} onChange={setShape} />
                </Step>
              ) : null}
              {oneWay && seven ? (
                <p className="px-8 text-xs text-dim">Välj en plats i taget för att använda en A3-kandidat som sista bild.</p>
              ) : endChoices.length ? (
                <Step n={next()} title="Sista bild">
                  <Select
                    size="sm"
                    aria-label="Sista bild"
                    value={chosenEnd?.id ?? ""}
                    onChange={(id) => { setEndChoice(id ? { key: endKey, id } : null); setPending(null); }}
                    options={[{ value: "", label: "Platsens egen (receptet)" }, ...endChoices.map((entry) => ({ value: entry.id, label: entry.name, hint: "kandidat, undantag" }))]}
                  />
                </Step>
              ) : null}
              <Step n={next()} title={step.start === "LAND" ? "Hur kortet ligger på platsen" : "Hur kortet landar"}>
                <LandsChoice value={shownSide} plan={planSides.length === 1 ? planSides[0] : null} onChange={setSide} />
                {!side && planSides.length > 1 ? <p className="text-xs text-dim">Placering säger olika per plats; utan val följer varje plats sin.</p> : null}
              </Step>
              <Step n={next()} title="Hand">
                <HandChoiceRow value={shownHand} plan={planHands.length === 1 ? planHands[0] : null} onChange={setHand} />
                {shownHand === "PASS" && seven && crossing.length && crossing.length < 7 ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-dim">Handbyte på</span>
                    <SegmentedControl label="Handbyte på" size="sm" value={passEverywhere ? "alla" : "korsar"} onChange={(v) => setPassEverywhere(v === "alla")} options={[{ value: "korsar", label: `${seatList(crossing)} (där handen korsar kroppen)` }, { value: "alla", label: "alla sju" }]} />
                  </div>
                ) : null}
              </Step>
              {scalable ? (
                <Step n={next()} title="Kortets storlek i den här beställningen" aside={cardScale !== 1 ? "prov" : undefined}>
                  <ScaleChoice value={scaleChoice} onChange={setScale} />
                  <p className="text-xs text-dim">{cardScale === 1 ? "Som planen säger (placements/default.json)." : `Sista bilden ritar kortet ${scaleWords(cardScale)} av planens kring sin mitt; planen ändras inte. Utkastet märks som prov.`}</p>
                </Step>
              ) : null}
            </>
          ) : null}
          <Step n={next()} title={step.kind === "STILL" ? "Bild, modell och tagningar" : "Modell, längd och tagningar"}>
            {step.kind === "STILL" && !start.holds && start.candidates.length > 1 ? (
              <SegmentedControl label="Dealerns bild" size="sm" value={startEntry?.id ?? ""} onChange={(id) => setBase({ key: `${dealerId}:${key}`, id })} options={start.candidates.map((c) => ({ value: c.id, label: c.name }))} />
            ) : null}
            {models.length > 1 ? (
              <>
                <ModelChoice models={models} value={model.id} recipe={recipe?.model ?? null} what={modelWhat} onChange={(id) => setModelChoice({ key, id })} />
                {model.delivered ? <p className="text-sm text-brass-hi">{model.delivered}</p> : null}
                {recipe && model.id !== recipe.model ? <p className="text-xs leading-[17px] text-dim">{model.note}</p> : null}
              </>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {models.length > 1 ? <span className="text-dim">Längd</span> : <span className="text-ink">{model.label}</span>}
              {durations.length ? <SegmentedControl label="Längd" size="sm" className="max-w-full flex-wrap" value={seconds} onChange={(s) => setDuration({ key, seconds: s })} options={durations.map((d) => ({ value: d, label: `${d} s` }))} /> : <span className="text-dim">{step.imageSize} · {step.ratio}</span>}
              {durations.length ? <span className="text-dim">{resolutionWords(params)}</span> : null}
            </div>
            {model.videos ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-dim">Referensfilm</span>
                <ReferenceChoice candidates={candidates} value={reference} rule={byRule?.take ?? null} dealer={dealerId} names={names} range={model.referenceSeconds ?? null} onChange={setRef} />
              </div>
            ) : step.kind === "FILM" ? (
              <p className="text-xs text-dim">{model.label} tar ingen referensfilm tillsammans med första och sista bild.</p>
            ) : null}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-dim">Tagningar</span>
              <SegmentedControl label="Tagningar" size="sm" value={takes} onChange={setTakes} options={Array.from({ length: TAKES_MAX }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
            </div>
            <TextArea label="Eget tillägg (valfritt, engelska)" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={600} rows={2} />
          </Step>
            </div>
          </details>
        </div>
      </div>
      {open && pending ? <OrderPreview input={pending} onClose={() => setPending(null)} onCreated={(answer) => { setPending(null); onCreated(answer); }} /> : null}
    </Sheet>
  );
}
