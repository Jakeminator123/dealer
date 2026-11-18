"use client";

// The exceptions a draft can say against its step's recipe, as buttons that carry a name and nothing else (Jakob 2026-11-17:
// only what is sent to Runway is described; what a choice does is said by the text that is sent, shown beside these): how
// the card lands (stängt → stängt, stängt → öppet), which hand deals (vänster hela vägen, höger hela vägen, handbyte), how
// the card turns, tur och retur or bara dit, the model, the text's style, the card's size in one order, and a reference film.
// "enligt Placering" marks what the plan says for the card; "receptet" marks what the step's recipe says
// (data/order-methods.json). Shared by the sheet "Ny beställning" and the draft's "Ändra utkastet".
import { useState, type ReactNode } from "react";
import {
  CARD_SCALES, HAND_LABEL, LANDS_LABEL, REF_MATCH_LABEL, REF_VERDICT_LABEL, SHAPE_LABEL, STYLE_ABOUT, STYLE_LABEL, genitive, scaleWords, secondsWords,
  type HandChoice, type ModelDef, type RefCandidate, type Shape, type TextStyle,
} from "../../../src/order-model.ts";
import { labUrl } from "../../lib/lab.ts";
import { Badge, SegmentedControl, Switch, cn } from "../ui";

export function ChoiceCard({ on, title, about, badge, disabled, onClick }: { on: boolean; title: ReactNode; about?: ReactNode; badge?: ReactNode; disabled?: boolean; onClick: () => void }) {
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
      {about ? <span className="text-xs leading-[17px] text-dim">{about}</span> : null}
    </button>
  );
}

export const PlanBadge = () => (
  <Badge tone="neutral" size="sm" className="whitespace-nowrap">
    enligt Placering
  </Badge>
);
/** Marks the value the step's recipe says (data/order-methods.json): anything else is a deliberate exception. */
export const RecipeBadge = () => (
  <Badge tone="neutral" size="sm" className="whitespace-nowrap">
    receptet
  </Badge>
);

/** Stängt → stängt or stängt → öppet; `plan` is what Placering says (null when the seats differ). */
export function LandsChoice({ value, plan, onChange, disabled }: { value: "FRONT" | "BACK" | null; plan: "FRONT" | "BACK" | null; onChange: (side: "FRONT" | "BACK") => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Hur kortet landar" className="flex gap-2">
      {(["BACK", "FRONT"] as const).map((side) => (
        <ChoiceCard key={side} on={value === side} disabled={disabled} title={LANDS_LABEL[side]} badge={plan === side ? <PlanBadge /> : null} onClick={() => onChange(side)} />
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
          <ChoiceCard key={h} on={value === h} disabled={disabled} title={HAND_LABEL[h]} badge={plan === h ? <PlanBadge /> : null} onClick={() => onChange(h)} />
        ))}
      </div>
      <div className={cn("rounded-md border px-3 py-2", value === "PASS" ? "border-brass/60 bg-brass/8" : "border-line")}>
        <Switch checked={value === "PASS"} disabled={disabled} onChange={(on) => onChange(on ? "PASS" : "LH")} label={<span className="flex items-center gap-2">{HAND_LABEL.PASS}{plan === "PASS" ? <PlanBadge /> : null}</span>} />
      </div>
    </div>
  );
}

/** The models that can make the step, the recipe's first and marked; `what` gives each one's resolution and price. */
export function ModelChoice({ models, value, recipe, what, onChange, disabled }: { models: readonly ModelDef[]; value: string; recipe: string | null; what: (m: ModelDef) => string; onChange: (id: string) => void; disabled?: boolean }) {
  const ordered = [...models].sort((a, b) => Number(b.id === recipe) - Number(a.id === recipe));
  return (
    <div role="radiogroup" aria-label="Modell" className="flex flex-col gap-1.5">
      {ordered.map((m) => (
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
          badge={m.id === recipe ? <RecipeBadge /> : null}
          onClick={() => onChange(m.id)}
        />
      ))}
    </div>
  );
}

/** The text: Kort and Minimal, the styles a new order can have (stylesFor); a still has only Kort and no choice. */
export function TextChoice({ value, styles, onChange, disabled, recipe = "KORT" }: { value: TextStyle; styles: readonly TextStyle[]; onChange: (style: TextStyle) => void; disabled?: boolean; recipe?: TextStyle | null }) {
  return (
    <div role="radiogroup" aria-label="Text" className="flex gap-2">
      {styles.map((s) => (
        <ChoiceCard key={s} on={value === s} disabled={disabled} title={STYLE_LABEL[s]} about={STYLE_ABOUT[s]} badge={s === recipe ? <RecipeBadge /> : null} onClick={() => onChange(s)} />
      ))}
    </div>
  );
}

/** Bara dit or tur och retur; the recipe's is marked. `missing`: why bara dit cannot be ordered to the seat (it has no end picture). */
export function ShapeChoice({ value, missing, onChange, disabled, recipe = "ONE_WAY" }: { value: Shape; missing: string | null; onChange: (shape: Shape) => void; disabled?: boolean; recipe?: Shape | null }) {
  return (
    <div role="radiogroup" aria-label="Bara dit eller tur och retur" className="flex gap-2">
      {(["ONE_WAY", "ROUND_TRIP"] as const).map((s) => (
        <ChoiceCard key={s} on={value === s} disabled={disabled} title={SHAPE_LABEL[s]} about={s === "ONE_WAY" && missing ? "Platsen har ingen slutbild." : undefined} badge={s === recipe ? <RecipeBadge /> : null} onClick={() => onChange(s)} />
      ))}
    </div>
  );
}

/** The card's size in this order: som planen, 125 %, 150 %, 200 %; another than the plan's is a trial. */
export function ScaleChoice({ value, onChange, disabled }: { value: number; onChange: (factor: number) => void; disabled?: boolean }) {
  return <SegmentedControl label="Kortets storlek" size="sm" value={value} disabled={disabled} onChange={onChange} options={CARD_SCALES.map((f) => ({ value: f, label: scaleWords(f) }))} />;
}

const VERDICT_TONE = { GODKÄND: "ok", VARIANT: "variant", EJ_DÖMD: "neutral", UNDERKÄND: "bad" } as const;

/**
 * A reference film: ingen, or a film that shows the step (the dummy's rendered film for the seat first, then the bank's
 * takes, the same step and seat first). Each with whose it is, Jakob's verdict and words, its length; one the model cannot
 * take is shown greyed with why. `rule`: the film the recipe's rule finds, marked. The chosen one plays beside the list.
 */
export function ReferenceChoice({ candidates, value, dealer, names, range, onChange, disabled, rule = null }: { candidates: readonly RefCandidate[]; value: string | null; dealer: string; names: Record<string, string>; range: [number, number] | null; onChange: (take: string | null) => void; disabled?: boolean; rule?: string | null }) {
  const [all, setAll] = useState(false);
  const shown = all ? candidates : candidates.slice(0, 6);
  const chosen = candidates.find((c) => c.take === value) ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Referensfilm" className="flex flex-col gap-1">
        <ChoiceCard on={!value} disabled={disabled} title="Ingen" onClick={() => onChange(null)} />
        {shown.map((c) => {
          const rendered = c.kind === "RENDERED", other = !rendered && c.dealer !== dealer;
          return (
            <ChoiceCard
              key={c.take}
              on={value === c.take}
              disabled={disabled || !c.fits}
              title={
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate font-mono text-xs">{c.take}</span>
                  <Badge tone={rendered ? "neutral" : other ? "wait" : "ok"} size="sm">
                    {rendered ? "dockans film" : other ? `${genitive(names[c.dealer] ?? c.dealer)} film` : "egen"}
                  </Badge>
                  {rendered ? null : (
                    <Badge tone={VERDICT_TONE[c.verdict]} size="sm">
                      {REF_VERDICT_LABEL[c.verdict]}
                    </Badge>
                  )}
                  <span className="text-xs tabular-nums text-dim">{secondsWords(c.seconds)}</span>
                  {c.take === rule ? <RecipeBadge /> : null}
                </span>
              }
              about={[
                REF_MATCH_LABEL[c.match],
                c.frames ? `hela filmen ${c.film} skickas (tagningen är ruta ${c.frames[0]}–${c.frames[1]}${c.also.length ? ", returen följer med" : ""})` : null,
                !c.fits && range ? `för ${c.seconds !== null && c.seconds < range[0] ? "kort" : "lång"}: modellen tar ${range[0]}–${range[1]} s` : null,
                c.check && !c.check.pass ? "faller i kontrollen av referensfilmer" : null,
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
          {chosen.kind !== "RENDERED" && chosen.dealer !== dealer ? <p className="text-xs text-[#f0b07a]">{genitive(names[chosen.dealer] ?? chosen.dealer)} film: tillåten som referens. Hennes hand kan läcka in.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
