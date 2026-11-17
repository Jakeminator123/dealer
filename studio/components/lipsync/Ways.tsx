// <Ways facts={facts} />: Så görs munnen. One card per way her mouth is made (the bank's line films through Scoutgaming's
// renderer, the own runner on his computer, the runner on his RunPod), each with its state, where it runs, how a job gets
// there step by step (commands in code), what it gives and costs, what a new film costs, and what was measured and is not
// built, from the entry of `runs` the way names. <WhenNew />: what a new film and a new dealer need. <Licences />: the
// parts the runner is built from and whether their licence allows commercial use.
import { Cloud, Cpu, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { STATE_TONE, STATE_WORD, codeParts, commercialTone, type Licence, type Runs, type Way, type WhenNew } from "../../lib/lipsync.ts";
import { Badge } from "../ui/Badge";
import { Card, Panel } from "../ui/Card";
import { Where } from "./parts";

const ICON: Record<string, ReactNode> = {
  renderer: <Monitor aria-hidden className="size-4 text-dim" />,
  runner: <Cpu aria-hidden className="size-4 text-dim" />,
  pod: <Cloud aria-hidden className="size-4 text-dim" />,
};

function Label({ children }: { children: ReactNode }) {
  return <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-faint">{children}</p>;
}

function Step({ text }: { text: string }) {
  return (
    <>
      {codeParts(text).map((part, i) =>
        part.code ? (
          <code key={i} className="rounded bg-well px-1 py-px font-mono text-xs text-ink [overflow-wrap:anywhere]">
            {part.text}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** What was measured for a way, from its entry of runs; and what is not built. */
function measuredOf(way: Way, runs: Runs): { measured: string | null; notBuilt: string[]; price: string | null } {
  if (way.runs === "today") return { measured: `${runs.today.speed}; realtid: ${runs.today.realtime ? "ja" : "nej"}`, notBuilt: [], price: null };
  if (way.runs === "runpod") return { measured: runs.runpod.measured, notBuilt: runs.runpod.notBuilt, price: runs.runpod.pricePerHour };
  return runs.ownRunner ? { measured: runs.ownRunner.measured, notBuilt: runs.ownRunner.notBuilt, price: null } : { measured: null, notBuilt: [], price: null };
}

function WayCard({ way, runs }: { way: Way; runs: Runs }) {
  const { measured, notBuilt, price } = measuredOf(way, runs);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-2">
        {ICON[way.id] ?? null}
        <h3 className="text-md font-semibold text-ink">{way.name}</h3>
        <Badge tone={STATE_TONE[way.state]} size="md" className="ml-auto">
          {STATE_WORD[way.state]}
        </Badge>
      </header>
      <p className="text-sm text-dim">{way.where}</p>
      <div className="flex flex-col gap-1.5">
        <Label>Så kommer ett jobb dit</Label>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink marker:text-faint">
          {way.send.map((step) => (
            <li key={step}>
              <Step text={step} />
            </li>
          ))}
        </ol>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm">
        <dt className="text-xs text-faint">Ger</dt>
        <dd className="min-w-0 text-ink">{way.gives}</dd>
        <dt className="text-xs text-faint">Kostar</dt>
        <dd className="min-w-0 text-ink">{way.cost}</dd>
        {price ? (
          <>
            <dt className="text-xs text-faint">Pris per timme</dt>
            <dd className="min-w-0 text-ink">{price}</dd>
          </>
        ) : null}
        <dt className="text-xs text-faint">Ny film</dt>
        <dd className="min-w-0 text-ink">{way.prepare}</dd>
        <dt className="text-xs text-faint">Mätt</dt>
        <dd className="min-w-0 text-ink">{measured ?? <span className="text-faint">inte mätt</span>}</dd>
      </dl>
      {way.note ? <p className="rounded-md border border-anmarkning/25 bg-anmarkning/8 px-2.5 py-1.5 text-xs text-ink">{way.note}</p> : null}
      {notBuilt.length ? (
        <div className="flex flex-col gap-1">
          <Label>Inte byggt</Label>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-dim marker:text-faint">
            {notBuilt.map((thing) => (
              <li key={thing}>{thing}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Where className="mt-auto pt-1">{way.source}</Where>
    </Card>
  );
}

export function Ways({ ways, runs }: { ways: readonly Way[] | undefined; runs: Runs }) {
  if (!ways?.length) return <p className="text-sm text-faint">Inte beskrivet i data/lipsync.json.</p>;
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-3">
      {ways.map((way) => (
        <WayCard key={way.id} way={way} runs={runs} />
      ))}
    </div>
  );
}

export function WhenNewPanel({ whenNew }: { whenNew: WhenNew | undefined }) {
  if (!whenNew) return <p className="text-sm text-faint">Inte beskrivet i data/lipsync.json.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid items-start gap-4 md:grid-cols-2">
        {(
          [
            ["Ny film", whenNew.film],
            ["Ny dealer", whenNew.dealer],
          ] as const
        ).map(([title, list]) => (
          <Panel key={title} title={title}>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink marker:text-faint">
              {list.map((item) => (
                <li key={item}>
                  <Step text={item} />
                </li>
              ))}
            </ol>
          </Panel>
        ))}
      </div>
      <Where>{whenNew.where}</Where>
    </div>
  );
}

export function Licences({ licences }: { licences: readonly Licence[] | undefined }) {
  if (!licences?.length) return <p className="text-sm text-faint">Inte uppslaget.</p>;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {licences.map((l) => (
          <li key={l.what} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:items-start">
            <span className="text-sm font-medium text-ink">{l.what}</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-ink [overflow-wrap:anywhere]">{l.licence}</span>
              <Where>{l.where}</Where>
            </div>
            <Badge tone={commercialTone(l.commercial)} size="md" className="h-auto min-h-[22px] max-w-full whitespace-normal py-0.5 sm:justify-self-end">
              <span className="sr-only">Kommersiellt: </span>
              {l.commercial}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
