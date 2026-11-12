"use client";

// <TextField label="Runda" value={v} onChange={(e) => setV(e.target.value)} hint="A2.1 - P4C1 - A2.1" error={fel} />
// <TextArea label="Anteckning" maxLength={1500} counter … />: native inputs with label, hint, error and a character count.
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export const FIELD =
  "w-full min-w-0 rounded-md border border-line-strong bg-well text-ink shadow-inset placeholder:text-faint " +
  "transition-[border-color,box-shadow,background-color] duration-150 hover:border-[#3a4840] " +
  "focus-visible:outline-none focus:border-brass/70 focus:ring-3 focus:ring-brass/15 " +
  "disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-underkand/70 aria-invalid:focus:ring-underkand/15";

type Extra = { label?: ReactNode; hint?: ReactNode; error?: ReactNode; size?: "sm" | "md" | "lg"; icon?: ReactNode; wrapperClassName?: string };

function Frame({ id, label, hint, error, counter, className, children }: { id: string; label?: ReactNode; hint?: ReactNode; error?: ReactNode; counter?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="text-sm text-dim">
          {label}
        </label>
      ) : null}
      {children}
      {error || hint || counter ? (
        <div className="flex items-start justify-between gap-3 text-xs">
          {error ? (
            <span id={`${id}-note`} role="alert" className="text-[#ef8b8b]">
              {error}
            </span>
          ) : hint ? (
            <span id={`${id}-note`} className="text-faint">
              {hint}
            </span>
          ) : (
            <span />
          )}
          {counter}
        </div>
      ) : null}
    </div>
  );
}

export const TextField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & Extra>(function TextField(
  { label, hint, error, size = "md", icon, id: given, className, wrapperClassName, ...rest },
  ref,
) {
  const own = useId();
  const id = given ?? own;
  return (
    <Frame id={id} label={label} hint={hint} error={error} className={wrapperClassName}>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-faint [&_svg]:size-4">{icon}</span> : null}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          className={cn(FIELD, size === "sm" ? "h-7 px-2.5 text-xs" : size === "lg" ? "h-10 px-3.5 text-base" : "h-8 px-3 text-sm", icon && (size === "sm" ? "pl-8" : "pl-9"), className)}
          {...rest}
        />
      </div>
    </Frame>
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<Extra, "size" | "icon"> & { counter?: boolean }
>(function TextArea({ label, hint, error, counter = false, id: given, className, wrapperClassName, maxLength, value, rows = 3, ...rest }, ref) {
  const own = useId();
  const id = given ?? own;
  const length = typeof value === "string" ? value.length : 0;
  const near = maxLength ? length / maxLength > 0.9 : false;
  return (
    <Frame
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={wrapperClassName}
      counter={counter && maxLength ? <span className={cn("shrink-0 tabular-nums", near ? "text-anmarkning" : "text-faint")}>{`${length}/${maxLength}`}</span> : null}
    >
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={cn(FIELD, "block resize-y px-3 py-2 text-sm leading-5", className)}
        {...rest}
      />
    </Frame>
  );
});
