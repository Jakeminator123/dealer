"use client";

// <NumberField label="X" unit="%" value={42.1} digits={2} min={0} max={100} step={0.1} onCommit={…} />: an exact number
// beside a handle. Written with a decimal comma (a dot is read too). Enter or leaving the field sets it; Esc takes it back;
// ↑/↓ step it (Shift: ten steps). A value outside its range is not set: the field says the range and shows the value again.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../ui/cn";
import { decimal, parseDecimal } from "../../lib/placement.ts";

export function NumberField({
  label,
  unit,
  value,
  digits = 1,
  min,
  max,
  step = 1,
  onCommit,
  disabled = false,
  className,
  title,
}: {
  label: string;
  unit?: string;
  value: number;
  digits?: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const id = useId();
  const shown = decimal(value, digits);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const say = (message: string) => {
    setError(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setError(null), 2600);
  };
  const commit = (n: number) => {
    if (!Number.isFinite(n) || n < min - 1e-9 || n > max + 1e-9) {
      say(`Mellan ${decimal(min, digits > 0 ? Math.min(digits, 2) : 0)} och ${decimal(max, digits > 0 ? Math.min(digits, 2) : 0)}`);
      setText(shown);
      return;
    }
    setError(null);
    const rounded = Number(n.toFixed(Math.max(digits, 4)));
    if (Math.abs(rounded - value) > 1e-12) onCommit(rounded);
    setText(decimal(rounded, digits));
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(parseDecimal(text));
      setEditing(false);
    } else if (event.key === "Escape") {
      setText(shown);
      setEditing(false);
      setError(null);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const by = (event.shiftKey ? 10 : 1) * step * (event.key === "ArrowUp" ? 1 : -1);
      const base = Number.isFinite(parseDecimal(text)) ? parseDecimal(text) : value;
      commit(Math.min(max, Math.max(min, base + by)));
      setEditing(false);
    }
  };
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)} title={title}>
      <label htmlFor={id} className={cn("text-xs text-dim", disabled && "opacity-45")}>
        {label}
      </label>
      <div
        className={cn(
          "flex h-8 items-center rounded-md border border-line-strong bg-well shadow-inset transition-[border-color,box-shadow] duration-150",
          "focus-within:border-brass/70 focus-within:ring-3 focus-within:ring-brass/15",
          error && "border-underkand/70",
          disabled && "opacity-45",
        )}
      >
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={text}
          aria-invalid={!!error || undefined}
          onFocus={(e) => {
            setEditing(true);
            e.currentTarget.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (editing && text !== shown) commit(parseDecimal(text));
            setEditing(false);
          }}
          onKeyDown={key}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-sm tabular-nums text-ink outline-none disabled:cursor-not-allowed"
        />
        {unit ? <span className="pr-2 text-xs text-faint">{unit}</span> : null}
      </div>
      {error ? (
        <span role="alert" className="text-2xs text-[#ef8b8b]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
