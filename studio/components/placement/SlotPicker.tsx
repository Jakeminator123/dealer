"use client";

// The places to choose from, laid out as the table is seen: Plats 1–7 from the camera's left, then the dealer, each with its
// two cards, and the shoe. A card's button carries its landing side (yellow: closed, blue: open, as the films colour them),
// a brass dot when it differs from the saved plan, and a tick when it is checked in the view shown.
import { Check } from "lucide-react";
import { SHOE, type PlacementPlan, type Place, type View } from "../../../src/placement-model.ts";
import { SEATS, placeName } from "../../lib/placement.ts";
import { cn } from "../ui/cn";

export function SlotPicker({ plan, view, selected, changed, onSelect }: { plan: PlacementPlan; view: View; selected: Place; changed: ReadonlySet<Place>; onSelect: (id: Place) => void }) {
  const button = (id: Place, text: string, wide = false) => {
    const on = id === selected;
    const t = id === SHOE ? null : plan.targets[id];
    const checked = !!t?.geometry[view].reviewed;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={on}
        aria-label={placeName(id)}
        title={`${placeName(id)}${checked ? " · kontrollerad" : ""}${changed.has(id) ? " · ändrad" : ""}`}
        onClick={() => onSelect(id)}
        className={cn(
          "relative grid h-8 place-items-center overflow-hidden rounded-md border text-sm font-medium tabular-nums transition-colors duration-150 focus-visible:outline-offset-1",
          wide && "px-4",
          on ? "border-brass bg-brass text-brass-ink" : "border-line-strong bg-raised text-ink hover:border-[#3a4840] hover:bg-overlay",
        )}
      >
        {text}
        {t ? <span aria-hidden className={cn("absolute inset-x-0 bottom-0 h-[3px]", t.intent.endSide === "BACK" ? "bg-[#ffff00]" : "bg-[#3b5bff]")} /> : null}
        {changed.has(id) ? <span aria-hidden className={cn("absolute right-1 top-1 size-1.5 rounded-full", on ? "bg-brass-ink" : "bg-brass")} /> : null}
        {checked ? <Check aria-hidden className={cn("absolute left-0.5 top-0.5 size-2.5", on ? "text-brass-ink" : "text-godkand")} /> : null}
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="Platser">
      <div className="grid grid-cols-8 gap-1 text-center text-2xs text-faint">
        {SEATS.map((s) => (
          <span key={s}>{s === "D" ? "Dealer" : s.slice(1)}</span>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1">{SEATS.map((s) => button(`${s}.C1`, "1"))}</div>
      <div className="grid grid-cols-8 gap-1">{SEATS.map((s) => button(`${s}.C2`, "2"))}</div>
      <div className="flex">{button(SHOE, "Sko", true)}</div>
    </div>
  );
}
