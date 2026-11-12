"use client";

// <Tabs label="Lista" value={tab} onChange={setTab} items={[{value: "vantar", label: "Väntar", count: 19}, …]} />
// The tab row only (role="tablist", arrow keys); the view shows the panel for `value` itself. Active tab: ink with a brass line.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type TabItem<T extends string> = { value: T; label: ReactNode; count?: number | string; icon?: ReactNode; disabled?: boolean };

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: readonly TabItem<T>[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const usable = items.map((item, i) => ({ item, i })).filter(({ item }) => !item.disabled);
    if (!step || !usable.length) return;
    event.preventDefault();
    const at = usable.findIndex((u) => u.i === index);
    const next = usable[(at + step + usable.length) % usable.length];
    onChange(next.item.value);
    refs.current[next.i]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn("flex items-end gap-1 border-b border-line", className)}>
      {items.map((item, index) => {
        const on = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "relative -mb-px inline-flex items-center gap-2 whitespace-nowrap rounded-t-sm border-b-2 font-medium transition-colors duration-150 [&_svg]:size-4 [&_svg]:shrink-0",
              size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm",
              on ? "border-brass text-ink" : "border-transparent text-dim enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-45",
              "focus-visible:outline-offset-[-2px]",
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-2xs leading-[18px] tabular-nums",
                  on ? "bg-brass/15 text-brass-hi" : "bg-overlay text-dim",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
