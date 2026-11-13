"use client";

// <DealerSwitch />: whose studio this is, at the top of the rail under the mark: one button per dealer the bank holds takes
// of (Pamela | Paow), the chosen one marked, and beside a name the number of takes waiting for Jakob's word when there are
// any. A paused dealer (data/dealers.json) says so quietly: a small pause sign, the words in the tooltip. A click chooses
// the dealer for every view (lib/bank.ts setDealer: the address and the memory follow).
import { useBank } from "../../lib/bank.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { cn } from "../ui/cn";
import { Tooltip } from "../ui/Tooltip";

function PauseSign({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 8" aria-hidden className={cn("size-2 shrink-0", className)}>
      <rect x="1" y="1" width="2" height="6" rx="0.6" fill="currentColor" />
      <rect x="5" y="1" width="2" height="6" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export function DealerSwitch() {
  const { dealer, dealers, setDealer } = useBank();
  const who = isSnapshot ? "Jakob" : "dig";
  return (
    <div role="group" aria-label="Dealer: vems studio" className="mx-2 flex flex-col gap-2">
      <span className="text-center text-[9.5px] font-semibold uppercase leading-3 tracking-[0.12em] text-faint">Dealer</span>
      {dealers.map((d) => {
        const on = d.id === dealer;
        const tip = (
          <span className="flex max-w-64 flex-col gap-0.5">
            <span>
              {d.name} · {d.takes} {d.takes === 1 ? "tagning" : "tagningar"} · {d.waiting ? `${d.waiting} väntar på ${who}` : `inget väntar på ${who}`}
            </span>
            {d.paused ? <span className="text-dim">Pausad: {d.paused}</span> : null}
          </span>
        );
        return (
          <Tooltip key={d.id} content={tip} side="right">
            <button
              type="button"
              aria-pressed={on}
              aria-label={[d.name, d.waiting ? `${d.waiting} väntar` : null, d.paused ? "pausad" : null].filter(Boolean).join(", ")}
              onClick={() => setDealer(d.id)}
              className={cn(
                "relative flex h-7 w-full items-center justify-center gap-1 rounded-md px-1 text-[11.5px] font-medium leading-4 transition-colors duration-150 focus-visible:outline-offset-0",
                on ? "bg-raised text-ink ring-1 ring-inset ring-brass/45" : d.paused ? "text-faint hover:bg-raised/60 hover:text-dim" : "text-dim hover:bg-raised/60 hover:text-ink",
              )}
            >
              <span className="truncate">{d.name}</span>
              {d.paused ? <PauseSign className={on ? "text-dim" : "text-faint/80"} /> : null}
              {d.waiting ? (
                <span
                  className={cn(
                    "absolute -right-1.5 -top-1.5 h-4 min-w-4 rounded-full bg-brass px-1 text-center text-[10px] font-semibold leading-4 text-brass-ink tabular-nums ring-2",
                    on ? "ring-raised" : "ring-surface",
                  )}
                >
                  {d.waiting}
                </span>
              ) : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
