"use client";

// <Select label="Rum" value={id} onChange={setId} options={[{value: "salong", label: "Salong", hint: "byggd"}]} />
// A dropdown list in the studio's look (Radix Select: the OS list would look like Windows, and keyboard search comes with it).
import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export type SelectOption = { value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean };

export function Select({
  value,
  onChange,
  options,
  label,
  placeholder = "Välj…",
  size = "md",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Shown above the field; without it give aria-label. */
  label?: ReactNode;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="text-sm text-dim">
          {label}
        </label>
      ) : null}
      <RS.Root value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
        <RS.Trigger
          id={id}
          aria-label={label ? undefined : ariaLabel}
          className={cn(
            "group inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-line-strong bg-well text-left text-ink shadow-inset",
            "transition-[border-color,background-color] duration-150 enabled:hover:border-[#3a4840] disabled:cursor-not-allowed disabled:opacity-45",
            "data-[state=open]:border-brass/70 data-[placeholder]:text-faint focus-visible:outline-none focus-visible:border-brass/70 focus-visible:ring-3 focus-visible:ring-brass/15",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
          )}
        >
          <span className="truncate">
            <RS.Value placeholder={placeholder} />
          </span>
          <RS.Icon asChild>
            <ChevronDown className="size-4 shrink-0 text-dim transition-transform duration-150 group-data-[state=open]:rotate-180" />
          </RS.Icon>
        </RS.Trigger>
        <RS.Portal>
          <RS.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              "z-50 max-h-[min(var(--radix-select-content-available-height),360px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden",
              "rounded-lg border border-line-strong bg-raised shadow-pop data-[state=open]:animate-pop-in",
            )}
          >
            <RS.Viewport className="p-1">
              {options.map((option) => (
                <RS.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-7 pr-3 text-sm text-ink outline-none",
                    "data-[highlighted]:bg-overlay data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
                  )}
                >
                  <RS.ItemIndicator className="absolute left-2 inline-flex">
                    <Check className="size-3.5 text-brass" />
                  </RS.ItemIndicator>
                  <RS.ItemText>{option.label}</RS.ItemText>
                  {option.hint ? <span className="ml-auto pl-3 text-xs text-faint">{option.hint}</span> : null}
                </RS.Item>
              ))}
            </RS.Viewport>
          </RS.Content>
        </RS.Portal>
      </RS.Root>
    </div>
  );
}
