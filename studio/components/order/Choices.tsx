"use client";

// The choices of a deal as large buttons with a line under each, shared by the sheet "Ny beställning" and the draft's
// "Ändra utkastet": how the card lands (stängt → stängt, stängt → öppet), which hand deals (vänster hela vägen, höger hela
// vägen, handbyte) and how the card turns. "enligt Placering" marks the choice the plan makes for the card. The sheet's
// model choice too: the models that can make the step, the step's own marked "förval".
import type { ReactNode } from "react";
import { FLIP_ABOUT, FLIP_AXES, FLIP_LABEL, HAND_ABOUT, HAND_LABEL, LANDS_ABOUT, LANDS_LABEL, type FlipAxis, type HandChoice, type ModelDef } from "../../../src/order-model.ts";
import { Badge, Switch, cn } from "../ui";

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
          disabled={disabled}
          title={
            <>
              {m.label}
              <span className="text-xs tabular-nums text-dim">{what(m)}</span>
            </>
          }
          about={m.about}
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
