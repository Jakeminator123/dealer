"use client";

// One key of the scene as a control: its label (the help on hover), its value, a brass dot when it differs from the
// baseline and a small "återställ" for that key alone. The control itself follows the key's kind in the catalogue
// (studio/lib/scene-keys.ts): switch, slider, a row of choices (a list when there are many), the felt's marks as pills,
// the felt's colours as swatches, text.
import { RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MARKS, formatValue, marksOf, marksText, type KeySpec } from "../../lib/scene-keys.ts";
import { IconButton, SegmentedControl, Select, Slider, Switch, TextField, Tooltip, cn } from "../ui";

// The felt colours as the table paints them (FELTS in src/scene3d-table.ts, first stop), for the swatches only.
const FELT_SWATCH: Record<string, string> = { green: "#134232", blue: "#16325e", vin: "#571a26", svart: "#23272a" };
const WHO = { D: "Kan bli spelarens val eller spelets förval", U: "Utvecklarens kalibrering" };

export function KeyRow({
  label,
  help,
  who,
  differs,
  value,
  resetLabel,
  onReset,
  control,
  children,
}: {
  label: string;
  help?: string;
  who?: "D" | "U";
  differs: boolean;
  /** The value written beside the label. */
  value?: ReactNode;
  resetLabel?: string;
  onReset?: () => void;
  /** A small control at the right end of the label row (a switch). */
  control?: ReactNode;
  /** The control under the label row. */
  children?: ReactNode;
}) {
  const name = (
    <span className={cn("min-w-0 truncate text-sm", differs ? "text-ink" : "text-dim")}>
      {label}
    </span>
  );
  return (
    <div className="group/row flex flex-col gap-1.5 py-2">
      <div className="flex min-h-6 items-center gap-2">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", differs ? "bg-brass" : "bg-transparent")} />
        {help ? (
          <Tooltip
            side="left"
            content={
              <span className="flex max-w-[260px] flex-col gap-0.5">
                <span>{help}</span>
                {who ? <span className="text-faint">{WHO[who]}</span> : null}
              </span>
            }
          >
            <span tabIndex={0} className="min-w-0 cursor-help truncate rounded-xs focus-visible:outline-offset-2">
              {name}
            </span>
          </Tooltip>
        ) : (
          name
        )}
        {differs ? <span className="sr-only">(ändrad mot basgrund)</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {value !== undefined ? <span className={cn("text-sm tabular-nums", differs ? "text-brass-hi" : "text-ink")}>{value}</span> : null}
          {control}
          {onReset ? (
            <IconButton
              label={resetLabel ?? "Återställ"}
              icon={<RotateCcw />}
              size="sm"
              variant="quiet"
              onClick={onReset}
              disabled={!differs}
              className={cn("size-6", differs ? "" : "invisible")}
            />
          ) : null}
        </span>
      </div>
      {children ? <div className="pl-3.5">{children}</div> : null}
    </div>
  );
}

export function KeyControl({
  spec,
  value,
  base,
  differs,
  onChange,
  onReset,
}: {
  spec: KeySpec;
  value: unknown;
  /** The baseline's value, for the reset button's words. */
  base: unknown;
  differs: boolean;
  onChange: (value: unknown) => void;
  onReset: () => void;
}) {
  const common = {
    label: spec.label,
    help: spec.help,
    who: spec.who,
    differs,
    onReset,
    resetLabel: `Återställ till basgrund: ${formatValue(spec, base)}`,
  };
  switch (spec.kind) {
    case "switch":
      return <KeyRow {...common} control={<Switch size="sm" checked={!!value} onChange={onChange} aria-label={spec.label} />} />;
    case "slider": {
      const v = Number(value);
      const special = spec.special && v === spec.special.value;
      return (
        <KeyRow {...common} value={formatValue(spec, v)}>
          <Slider value={special ? spec.min : v} min={spec.min} max={spec.max} step={spec.step} format={null} aria-label={spec.label} onChange={onChange} />
        </KeyRow>
      );
    }
    case "choice": {
      const text = String(value);
      if (spec.key === "felt")
        return (
          <KeyRow {...common} value={formatValue(spec, text)}>
            <div role="radiogroup" aria-label={spec.label} className="flex gap-2">
              {spec.options.map((o) => (
                <Tooltip key={o.value} content={o.label}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={o.value === text}
                    aria-label={o.label}
                    onClick={() => onChange(o.value)}
                    className={cn(
                      "size-7 rounded-full border shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-[box-shadow,border-color] duration-150",
                      o.value === text ? "border-brass ring-2 ring-brass/35 ring-offset-2 ring-offset-surface" : "border-line-strong hover:border-[#3a4840]",
                    )}
                    style={{ background: FELT_SWATCH[o.value] ?? "#333" }}
                  />
                </Tooltip>
              ))}
            </div>
          </KeyRow>
        );
      if (spec.options.length > 5)
        return (
          <KeyRow {...common}>
            <Select size="sm" aria-label={spec.label} value={text} onChange={onChange} options={spec.options} className="max-w-[140px]" />
          </KeyRow>
        );
      return (
        <KeyRow {...common}>
          <SegmentedControl size="sm" label={spec.label} value={text} onChange={onChange} options={spec.options} />
        </KeyRow>
      );
    }
    case "set": {
      const on = marksOf(String(value));
      const flip = (mark: string) => {
        const next = new Set(on);
        if (next.has(mark)) next.delete(mark);
        else next.add(mark);
        onChange(marksText(next));
      };
      return (
        <KeyRow {...common} value={formatValue(spec, value)}>
          <div className="flex flex-wrap gap-1.5">
            {MARKS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={on.has(m.value)}
                onClick={() => flip(m.value)}
                className={cn(
                  "h-6 rounded-full border px-2 text-xs transition-[background-color,border-color,color] duration-150",
                  on.has(m.value) ? "border-brass/45 bg-brass/12 text-brass-hi" : "border-line-strong text-faint hover:text-dim",
                )}
              >
                {m.value === "text" ? "3 TO 2" : m.label}
              </button>
            ))}
          </div>
        </KeyRow>
      );
    }
    case "text":
      return (
        <KeyRow {...common}>
          <LogoField value={String(value)} maxLength={spec.maxLength} label={spec.label} onChange={onChange} />
        </KeyRow>
      );
  }
}

// A text field that keeps what is typed while the value comes back from the scene a moment later.
function LogoField({ value, maxLength, label, onChange }: { value: string; maxLength: number; label: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [focused, setFocused] = useState(false);
  if (value !== seen) {
    setSeen(value);
    if (!focused) setText(value);
  }
  return (
    <TextField
      size="sm"
      aria-label={label}
      value={text}
      maxLength={maxLength}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}
