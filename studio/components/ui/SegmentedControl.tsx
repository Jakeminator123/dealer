"use client";

// <SegmentedControl label="Visning" value={v} onChange={setV} options={[{value: "3d", label: "3D"}, {value: "flat", label: "Inte 3D"}]} />
// A row of mutually exclusive choices (a radio group): arrow keys move the choice, size="sm|md".
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type Segment<T extends string | number> = { value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean; title?: string };

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = "md",
  disabled = false,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly Segment<T>[];
  /** What is chosen, for screen readers ("Visning", "Hastighet"). */
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const usable = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled && !disabled);
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step || !usable.length) return;
    event.preventDefault();
    const at = usable.findIndex((u) => u.i === index);
    const next = usable[(at + step + usable.length) % usable.length];
    onChange(next.o.value);
    refs.current[next.i]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-well p-0.5",
        disabled && "opacity-45",
        className,
      )}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            title={option.title}
            tabIndex={on || (!options.some((o) => o.value === value) && index === 0) ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium transition-[background-color,color,box-shadow] duration-150 [&_svg]:shrink-0",
              size === "sm" ? "h-6 px-2.5 text-xs [&_svg]:size-3.5" : "h-7 px-3 text-sm [&_svg]:size-4",
              on
                ? "bg-overlay text-ink shadow-[0_1px_2px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.05)]"
                : "text-dim enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-50",
              "focus-visible:outline-offset-0",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
