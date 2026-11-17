"use client";

// <Chain steps={facts.steps} />: the chain from the rest film to the picture in the game, top to bottom. First a strip of
// every step's scale in a few signs, left to right (a press goes to the step); then one card per step: a small drawing of
// the size in and out (the box out is the box in times the step's factor, in width and height), the scale in the speech
// lane's own words with the factors large, who does it as a coloured tag, what it does, the format in and out, and where
// it stands. A value the file calls estimated ("cirka", "skattat") is drawn with a dashed line and keeps its word; a trial
// beside the chain ("prov, inte i spelet") has a dashed card.
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ChevronRight, Equal, Lock, Minus } from "lucide-react";
import type { ComponentType } from "react";
import { DIRECTION_WORD, direction, isEstimated, isNone, isTrial, readScale, scaleHeadline, scaleParts, whoOf, type Direction, type Scale, type Step } from "../../lib/lipsync.ts";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import { SEALED, WHO_EDGE, WHO_TONE, WHO_WORD, Where, WhoTag } from "./parts";

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const DIRECTION_LOOK: Record<Direction, { icon: ComponentType<{ className?: string }>; text: string; box: string }> = {
  up: { icon: ArrowUp, text: "text-brass-hi", box: "stroke-brass fill-brass/12" },
  down: { icon: ArrowDown, text: "text-[#9db3f8]", box: "stroke-variant fill-variant/12" },
  same: { icon: Equal, text: "text-dim", box: "stroke-dim fill-dim/10" },
  mixed: { icon: ArrowUpDown, text: "text-brass-hi", box: "stroke-brass fill-brass/12" },
};

/**
 * The size in and out: the box in is fixed, the box out is it times the factors (drawn up to × 2,4). A span is drawn at both
 * ends. The drawing is as large as its boxes, standing on one line.
 */
function Boxes({ scale, dir }: { scale: Scale; dir: Direction }) {
  const side = 30, left = 1, out = left + side + 34;
  const size = (f: number) => side * Math.min(f, 2.4);
  const low = { w: size(scale.width.lo), h: size(scale.height.lo) };
  const high = { w: size(scale.width.hi), h: size(scale.height.hi) };
  const floor = Math.max(side, low.h, high.h) + 1;
  const width = Math.ceil(out + Math.max(low.w, high.w) + 1), height = Math.ceil(floor + 1);
  const arrow = floor - side / 2;
  return (
    <svg data-scale-boxes viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className="shrink-0 overflow-visible">
      <rect x={left} y={floor - side} width={side} height={side} rx={2} className="fill-overlay stroke-line-strong" strokeWidth={1.5} />
      <path d={`M${left + side + 6} ${arrow}h17`} className="stroke-faint" strokeWidth={1.5} fill="none" />
      <path d={`M${left + side + 23} ${arrow - 4}l5 4-5 4z`} className="fill-faint" />
      {high.w !== low.w || high.h !== low.h ? (
        <rect x={out} y={floor - high.h} width={high.w} height={high.h} rx={2} className={cn(DIRECTION_LOOK[dir].box, "opacity-45")} strokeWidth={1.25} strokeDasharray={scale.estimated ? "4 3" : undefined} />
      ) : null}
      <rect x={out} y={floor - low.h} width={low.w} height={low.h} rx={2} className={DIRECTION_LOOK[dir].box} strokeWidth={1.5} strokeDasharray={scale.estimated ? "4 3" : undefined} />
    </svg>
  );
}

/** The scale as the file says it, with the factors large and "(skattat)" as a mark. */
function ScaleWords({ scale }: { scale: string }) {
  if (isNone(scale)) return <p className="text-sm text-faint">Ingen skala i det här steget</p>;
  const parts = scaleParts(scale);
  // Many factors (a trial with several sizes) a step smaller, so that they still fit beside the drawing.
  const many = parts.filter((part) => part.kind === "factor").length > 2;
  return (
    <p className={cn("text-sm text-dim", many ? "leading-7" : "leading-8")}>
      {parts.map((part, i) =>
        part.kind === "factor" ? (
          <span key={i} className={cn("whitespace-nowrap font-display font-semibold tabular-nums text-ink", many ? "text-lg" : "text-xl")}>
            {part.text}
          </span>
        ) : part.kind === "estimate" ? (
          <Badge key={i} tone="remark" className="mx-1 border-dashed align-[2px]">
            skattat
          </Badge>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

function Format({ label, value }: { label: string; value: string }) {
  const estimated = isEstimated(value);
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-baseline gap-1.5 rounded-sm border bg-well px-2 py-1", estimated ? "border-dashed border-anmarkning/55" : "border-line-strong")}>
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <span className="min-w-0 text-ink [overflow-wrap:anywhere]">{value}</span>
      {estimated ? <span className="shrink-0 text-2xs text-[#f0b07a]">skattat</span> : null}
    </span>
  );
}

function StepCard({ step, last }: { step: Step; last: boolean }) {
  const scale = readScale(step.scale);
  const dir = scale ? direction(scale) : null;
  const who = whoOf(step.by);
  const trial = isTrial(step);
  const look = dir ? DIRECTION_LOOK[dir] : null;
  const formats = !(isNone(step.in) && isNone(step.out));
  return (
    <li id={`steg-${step.n}`} className="grid scroll-mt-4 grid-cols-[2rem_minmax(0,1fr)] gap-x-2.5 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-x-3">
      <div aria-hidden className="flex flex-col items-center pt-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold tabular-nums", trial ? "border-dashed border-line-strong text-dim" : "border-line-strong bg-raised text-ink")}>
          {step.n}
        </span>
        {last ? null : <span className="w-px flex-1 bg-line-strong" />}
      </div>
      <Card className={cn("mb-3 flex min-w-0 flex-col gap-3 border-l-[3px] p-3 sm:p-4 md:flex-row md:gap-6", WHO_EDGE[who.who], trial && "border-dashed bg-transparent")}>
        <h3 className="sr-only">Steg {step.n}</h3>
        <div className="flex shrink-0 flex-col gap-1 md:w-[260px]">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            {scale && dir ? (
              <Boxes scale={scale} dir={dir} />
            ) : (
              <span aria-hidden className="grid h-8 w-[95px] place-items-center rounded-md border border-dashed border-line text-faint">
                <Minus className="size-4" />
              </span>
            )}
            {look && dir ? (
              <span className={cn("mb-0.5 inline-flex items-center gap-1 text-xs font-medium", look.text)}>
                <look.icon className="size-3.5" />
                {DIRECTION_WORD[dir]}
              </span>
            ) : null}
          </div>
          <ScaleWords scale={step.scale} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <WhoTag by={step.by} />
            {who.note ? (
              <Badge tone="neutral" size="md" className="border-dashed">
                {who.note}
              </Badge>
            ) : null}
          </div>
          <p className="text-base text-ink">{step.what}</p>
          {formats ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
              <Format label="In" value={step.in} />
              <ArrowRight aria-hidden className="size-3.5 shrink-0 text-faint" />
              <Format label="Ut" value={step.out} />
            </div>
          ) : null}
          <Where>{step.where}</Where>
        </div>
      </Card>
    </li>
  );
}

/** Every step's scale in a few signs, left to right, coloured by who does it. */
function Overview({ steps }: { steps: readonly Step[] }) {
  return (
    <ol aria-label="Kedjan i korthet" className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((step, i) => {
        const scale = readScale(step.scale);
        const who = whoOf(step.by);
        const trial = isTrial(step);
        return (
          <li key={step.n} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => jump(`steg-${step.n}`)}
              title={`Steg ${step.n}: ${step.scale}`}
              className={cn(
                "flex min-h-12 flex-col items-start justify-center rounded-md border border-l-[3px] border-line-strong bg-surface px-2.5 py-1 text-left transition-colors hover:bg-raised",
                WHO_EDGE[who.who],
                (scale?.estimated || trial) && "border-dashed",
              )}
            >
              <span className="text-2xs text-faint">
                Steg {step.n}
                {trial ? " · prov" : ""}
              </span>
              <span className="text-sm font-semibold tabular-nums text-ink">{scaleHeadline(scale)}</span>
            </button>
            {i < steps.length - 1 ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-dim">
      {(Object.keys(WHO_WORD) as (keyof typeof WHO_WORD)[]).map((who) => (
        <Badge key={who} tone={WHO_TONE[who]} size="md" icon={who === "renderer" || who === "model" ? <Lock aria-hidden /> : undefined}>
          {WHO_WORD[who]}
        </Badge>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3.5 w-5 rounded-xs border border-dashed border-anmarkning" />
        streckat: skattat, eller ett prov vid sidan av
      </span>
      <span className="inline-flex items-center gap-1.5" title={SEALED}>
        <Lock aria-hidden className="size-3.5" />
        låst hos Scoutgaming
      </span>
    </div>
  );
}

export function Chain({ steps }: { steps: readonly Step[] }) {
  return (
    <div className="flex flex-col gap-4">
      <Legend />
      <Overview steps={steps} />
      <ol aria-label="Stegen" className="mt-1 flex flex-col">
        {steps.map((step, i) => (
          <StepCard key={step.n} step={step} last={i === steps.length - 1} />
        ))}
      </ol>
    </div>
  );
}
