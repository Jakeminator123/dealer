"use client";

// <Slider label="Glans" value={v} onChange={setV} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} />
// A native range input drawn in the studio's look (globals.css .ui-range): keyboard, wheel-free, label and value above.
import { useId, type ReactNode } from "react";
import { cn } from "./cn";

/** Swedish decimals: 0.25 → "0,25". */
const swedish = (value: number) => String(Math.round(value * 1000) / 1000).replace(".", ",");

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  format = swedish,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  /** How the value is written beside the label; null hides it. */
  format?: ((value: number) => string) | null;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const id = useId();
  const fill = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label || format ? (
        <div className="flex items-baseline justify-between gap-3">
          {label ? (
            <label htmlFor={id} className={cn("truncate text-sm text-dim", disabled && "opacity-45")}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {format ? <output htmlFor={id} className={cn("text-sm text-ink tabular-nums", disabled && "opacity-45")}>{format(value)}</output> : null}
        </div>
      ) : null}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        className="ui-range"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
    </div>
  );
}
