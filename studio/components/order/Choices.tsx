"use client";

// The choices of a deal as large buttons with a line under each, shared by the sheet "Ny beställning" and the draft's
// "Ändra utkastet": how the card lands (stängt → stängt, stängt → öppet), which hand deals (vänster hela vägen, höger hela
// vägen, handbyte) and how the card turns. "enligt Placering" marks the choice the plan makes for the card. The sheet's
// model choice too: the models that can make the step, the step's own marked "förval"; the text's style (Kort förval,
// Minimal, Utförlig), tur och retur or bara dit, the card's size in one order, and a reference film from the bank.
import { useState, type ReactNode } from "react";
import {
  CARD_SCALES, FLIP_ABOUT, FLIP_AXES, FLIP_LABEL, HAND_ABOUT, HAND_LABEL, LANDS_ABOUT, LANDS_LABEL, REF_MATCH_LABEL, REF_VERDICT_LABEL, SHAPE_ABOUT, SHAPE_LABEL, STYLE_ABOUT, STYLE_LABEL, genitive, scaleWords, secondsWords,
  type FlipAxis, type HandChoice, type ModelDef, type RefCandidate, type Shape, type TextStyle,
} from "../../../src/order-model.ts";
import { labUrl } from "../../lib/lab.ts";
import { Badge, SegmentedControl, Switch, cn } from "../ui";

export function ChoiceCard({ on, title, about, badge, disabled, onClick }: { on: boolean; title: ReactNode; about: ReactNode; badge?: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left disabled:opacity-50", on ? "border-brass/60 bg-brass/8" : "border-line hover:border-line-strong hover:bg-raised")}
    >
      <span className="flex w-full items-center gap-2 text-sm text-ink">
        {title}
        {badge ? <span className="ml-auto">{badge}</span> : null}
      </span>
      <span className="text-xs leading-[17px] text-dim">{about}</span>
    </button>
  );
}

export const PlanBadge = () => (
  <Badge tone="neutral" size="sm" className="whitespace-nowrap">
    enligt Placering
  </Badge>
);

/** Stängt → stängt or stängt → öppet; `plan` is what Placering says (null when the seats differ). */
export function LandsChoice({ value, plan, onChange, disabled }: { value: "FRONT" | "BACK" | null; plan: "FRONT" | "BACK" | null; onChange: (side: "FRONT" | "BACK") => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Hur kortet landar" className="flex gap-2">
      {(["BACK", "FRONT"] as const).map((side) => (
        <ChoiceCard key={side} on={value === side} disabled={disabled} title={LANDS_LABEL[side]} about={LANDS_ABOUT[side]} badge={plan === side ? <PlanBadge /> : null} onClick={() => onChange(side)} />
      ))}
    </div>
  );
}

/** Vänster hela vägen or höger hela vägen, and handbyte as a tick (left takes the card, gives it to the right). */
export function HandChoiceRow({ value, plan, onChange, disabled }: { value: HandChoice; plan: HandChoice | null; onChange: (choice: HandChoice) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Hand" className="flex gap-2">
        {(["LH", "RH"] as const).map((h) => (
          <ChoiceCard key={h} on={value === h} disabled={disabled} title={HAND_LABEL[h]} about={HAND_ABOUT[h]} badge={plan === h ? <PlanBadge /> : null} onClick={() => onChange(h)} />
        ))}
      </div>
      <div className={cn("rounded-md border px-3 py-2", value === "PASS" ? "border-brass/60 bg-brass/8" : "border-line")}>
        <Switch checked={value === "PASS"} disabled={disabled} onChange={(on) => onChange(on ? "PASS" : "LH")} label={<span className="flex items-center gap-2">{HAND_LABEL.PASS}{plan === "PASS" ? <PlanBadge /> : null}</span>} hint={HAND_ABOUT.PASS} />
      </div>
    </div>
  );
}

/** The models that can make the step, its own first and marked "förval"; `what` gives each one's resolution and price. */
export function ModelChoice({ models, value, own, what, onChange, disabled }: { models: readonly ModelDef[]; value: string; own: string; what: (m: ModelDef) => string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Modell" className="flex flex-col gap-1.5">
      {models.map((m) => (
        <ChoiceCard
          key={m.id}
          on={value === m.id}
          disabled={disabled || !!m.off}
          title={
            <>
              {m.label}
              <span className="text-xs tabular-nums text-dim">{what(m)}</span>
            </>
          }
          about={m.off ? `Beställs inte längre. ${m.off}` : m.about}
          badge={m.id === own ? (
            <Badge tone="neutral" size="sm">
              förval
            </Badge>
          ) : null}
          onClick={() => onChange(m.id)}
        />
      ))}
    </div>
  );
}

/** How the card turns (only when it lands open). */
export function FlipChoice({ value, onChange, disabled, suggested }: { value: FlipAxis; onChange: (axis: FlipAxis) => void; disabled?: boolean; suggested?: FlipAxis }) {
  return (
    <div role="radiogroup" aria-label="Hur kortet vänds" className="flex flex-col gap-1.5">
      {FLIP_AXES.map((axis) => (
        <ChoiceCard
          key={axis}
          on={value === axis}
          disabled={disabled}
          title={FLIP_LABEL[axis]}
          about={FLIP_ABOUT[axis]}
          badge={suggested === axis ? (
            <Badge tone="neutral" size="sm">
              förval
            </Badge>
          ) : null}
          onClick={() => onChange(axis)}
        />
      ))}
    </div>
  );
}

const Forval = () => (
  <Badge tone="neutral" size="sm">
    förval
  </Badge>
);

/** The text: Kort (förval), Minimal, Utförlig; a still offers Kort and Utförlig. */
export function TextChoice({ value, styles, onChange, disabled }: { value: TextStyle; styles: readonly TextStyle[]; onChange: (style: TextStyle) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Text" className="flex gap-2">
      {styles.map((s) => (
        <ChoiceCard key={s} on={value === s} disabled={disabled} title={STYLE_LABEL[s]} about={STYLE_ABOUT[s]} badge={s === "KORT" ? <Forval /> : null} onClick={() => onChange(s)} />
      ))}
    </div>
  );
}

/** Tur och retur or bara dit; bara dit needs the seat's landing picture (`missing` says what lacks). */
export function ShapeChoice({ value, missing, onChange, disabled }: { value: Shape; missing: string | null; onChange: (shape: Shape) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Tur och retur eller bara dit" className="flex gap-2">
      {(["ROUND_TRIP", "ONE_WAY"] as const).map((s) => (
        <ChoiceCard key={s} on={value === s} disabled={disabled || (s === "ONE_WAY" && !!missing)} title={SHAPE_LABEL[s]} about={s === "ONE_WAY" && missing ? "Landningsbild saknas för platsen." : SHAPE_ABOUT[s]} badge={s === "ROUND_TRIP" ? <Forval /> : null} onClick={() => onChange(s)} />
      ))}
    </div>
  );
}

/** The card's size in this order: som planen (förval), 125 %, 150 %, 200 %; another than the plan's is a trial. */
export function ScaleChoice({ value, onChange, disabled }: { value: number; onChange: (factor: number) => void; disabled?: boolean }) {
  return <SegmentedControl label="Kortets storlek" size="sm" value={value} disabled={disabled} onChange={onChange} options={CARD_SCALES.map((f) => ({ value: f, label: scaleWords(f) }))} />;
}

const VERDICT_TONE = { GODKÄND: "ok", VARIANT: "variant", EJ_DÖMD: "neutral", UNDERKÄND: "bad" } as const;

/**
 * A reference film: ingen, or a take of the bank, the same step and seat first, the dealer's own before another dealer's.
 * Each with whose it is (another dealer's named), Jakob's verdict and words, its length; one the model cannot take is shown
 * greyed with why. The chosen one plays beside the list.
 */
export function ReferenceChoice({ candidates, value, dealer, names, range, onChange, disabled }: { candidates: readonly RefCandidate[]; value: string | null; dealer: string; names: Record<string, string>; range: [number, number] | null; onChange: (take: string | null) => void; disabled?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? candidates : candidates.slice(0, 6);
  const chosen = candidates.find((c) => c.take === value) ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Referensfilm" className="flex flex-col gap-1">
        <ChoiceCard on={!value} disabled={disabled} title="Ingen" about="Bilderna och texten bär rörelsen." onClick={() => onChange(null)} />
        {shown.map((c) => {
          const other = c.dealer !== dealer;
          return (
            <ChoiceCard
              key={c.take}
              on={value === c.take}
              disabled={disabled || !c.fits}
              title={
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate font-mono text-xs">{c.take}</span>
                  <Badge tone={other ? "wait" : "ok"} size="sm">
                    {other ? `${genitive(names[c.dealer] ?? c.dealer)} film` : "egen"}
                  </Badge>
                  <Badge tone={VERDICT_TONE[c.verdict]} size="sm">
                    {REF_VERDICT_LABEL[c.verdict]}
                  </Badge>
                  <span className="text-xs tabular-nums text-dim">{secondsWords(c.seconds)}</span>
                </span>
              }
              about={[
                REF_MATCH_LABEL[c.match],
                c.frames ? `hela filmen ${c.film} skickas (tagningen är ruta ${c.frames[0]}–${c.frames[1]}${c.also.length ? ", returen följer med" : ""})` : null,
                !c.fits && range ? `för ${c.seconds !== null && c.seconds < range[0] ? "kort" : "lång"}: modellen tar ${range[0]}–${range[1]} s` : null,
                c.words ? `Jakob: ”${c.words}”` : null,
              ].filter(Boolean).join(" · ")}
              onClick={() => onChange(c.take)}
            />
          );
        })}
      </div>
      {candidates.length > shown.length || all ? (
        <button type="button" className="self-start text-xs text-brass-hi underline underline-offset-2" onClick={() => setAll(!all)}>
          {all ? "Visa färre" : `Visa alla (${candidates.length})`}
        </button>
      ) : null}
      {chosen ? (
        <div className="flex flex-col gap-1">
          <video src={labUrl(chosen.path)} controls muted playsInline preload="metadata" className="w-full rounded-md border border-line bg-well" />
          {chosen.dealer !== dealer ? <p className="text-xs text-[#f0b07a]">{genitive(names[chosen.dealer] ?? chosen.dealer)} film: tillåten som referens. Texten säger att den bara visar rörelsen; hennes hand kan läcka in.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
