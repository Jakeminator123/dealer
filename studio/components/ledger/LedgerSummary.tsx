"use client";

// <LedgerSummary rows={rows} unplaced={false} />: what works, at a glance. One line per method (or per one fact of it:
// model, text, turn, reference, length), best first: how many takes, the reviewer's mean with how many it rests on, and
// Jakob's own verdicts on the placed takes as counts with the views' signs. Never a share alone: two takes are little
// evidence. What every line shares is said once above the table; methods with nothing placed only when unplaced is on.
import { useMemo, useState } from "react";
import { GROUP_BY, GROUP_BY_LABEL, STEP_GROUP_LABEL, scoreWords, sharedFacts, summarize, type GroupBy, type LedgerRow } from "../../lib/ledger.ts";
import { VERDICT_LABEL, VERDICT_SIGN } from "../../lib/verdict.ts";
import { Badge, SegmentedControl, cn } from "../ui";

function Count({ n, tone, sign, label }: { n: number; tone: "ok" | "variant" | "bad" | "wait"; sign: string; label: string }) {
  return (
    <Badge tone={n ? tone : "neutral"} size="md" title={`${label}: ${n}`} className={cn("min-w-10 justify-center", !n && "opacity-40")}>
      <span aria-hidden>{sign}</span>
      {n}
    </Badge>
  );
}

export function LedgerSummary({ rows, unplaced = false }: { rows: readonly LedgerRow[]; unplaced?: boolean }) {
  const [by, setBy] = useState<GroupBy>("metod");
  const summary = useMemo(() => summarize(rows, by).filter((s) => unplaced || s.placed), [rows, by, unplaced]);
  const shared = useMemo(() => new Set(by === "metod" ? sharedFacts(summary.map((s) => s.facts)) : []), [summary, by]);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Vad fungerar</h2>
        <SegmentedControl label="Jämför efter" size="sm" value={by} onChange={setBy} options={GROUP_BY.map((g) => ({ value: g, label: GROUP_BY_LABEL[g] }))} />
        <span className="ml-auto text-xs text-faint">Bäst först · granskarens medel av 5 · Jakobs omdömen på lagda tagningar</span>
      </div>
      {shared.size ? (
        <p className="-mt-1 flex flex-wrap items-center gap-1 text-xs text-faint">
          Alla har:
          {[...shared].map((f) => (
            <Badge key={f}>{f}</Badge>
          ))}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs font-medium uppercase tracking-[0.06em] text-faint">
              {by === "metod" ? <th className="px-3 py-2 font-medium">Steg</th> : null}
              <th className="px-3 py-2 font-medium">{GROUP_BY_LABEL[by]}</th>
              <th className="px-3 py-2 text-right font-medium">Tagningar</th>
              <th className="px-3 py-2 font-medium">Granskaren</th>
              <th className="px-3 py-2 font-medium">
                Jakob <span className="normal-case tracking-normal">✓ godkänd ◆ variant ✕ underkänd ○ ej dömd</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Krediter</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.key} className="border-b border-line/60 last:border-0 hover:bg-raised/40">
                {by === "metod" ? <td className="whitespace-nowrap px-3 py-2 align-top text-dim">{s.step ? STEP_GROUP_LABEL[s.step] : ""}</td> : null}
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    {s.facts.map((f, i) =>
                      shared.has(f) ? null : (
                        <Badge key={f} tone={i === 0 ? "brass" : "neutral"}>
                          {f}
                        </Badge>
                      ),
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-ink">
                  {s.placed}
                  {s.notPlaced ? <span className="text-faint"> + {s.notPlaced} ej lagd{s.notPlaced === 1 ? "" : "a"}</span> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums">
                  {s.mean === null ? (
                    <span className="text-faint">–</span>
                  ) : (
                    <>
                      <span className="font-display text-md font-semibold text-ink">{scoreWords(s.mean)}</span>
                      <span className="text-faint"> /5 · {s.scored} st</span>
                      {s.backMean !== null ? <span className="text-faint"> · retur {scoreWords(s.backMean)}</span> : null}
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  {s.placed ? (
                    <div className="flex gap-1">
                      <Count n={s.accepted} tone="ok" sign={VERDICT_SIGN.godkand} label={VERDICT_LABEL.godkand} />
                      <Count n={s.variant} tone="variant" sign={VERDICT_SIGN.variant} label={VERDICT_LABEL.variant} />
                      <Count n={s.rejected} tone="bad" sign={VERDICT_SIGN.underkand} label={VERDICT_LABEL.underkand} />
                      <Count n={s.open} tone="wait" sign={VERDICT_SIGN.vantar} label="Inte dömd av Jakob" />
                    </div>
                  ) : (
                    <span className="text-xs text-faint">inget lagt</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-dim">{s.credits || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
