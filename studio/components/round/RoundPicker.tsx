"use client";

// <RoundPicker rounds={readyRounds()} current={round} onPick={(round) => …} />: the rounds Jakob can play. The ready-made
// ones as chips in his notation (his favourite to seat 4, the V6 deal, every seat, one seat at a time), and a field that
// takes his notation ("A2.1 - P4C1 - A2.1 - P4C2 - A2.1") and says in plain Swedish what it could not read.
import { CornerDownLeft } from "lucide-react";
import { useState } from "react";
import { formatJakob } from "../../lib/names.ts";
import { roundFromText, type Round } from "../../lib/rounds.ts";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { TextField } from "../ui/TextField";

export function RoundPicker({
  rounds,
  current,
  problems = [],
  onPick,
  className,
}: {
  rounds: Round[];
  current: Round | null;
  /** What could not be read in the round on screen (from the address). */
  problems?: string[];
  onPick(round: Round): void;
  className?: string;
}) {
  const big = rounds.filter((r) => !/^P\d$/.test(r.name));
  const seats = rounds.filter((r) => /^P\d$/.test(r.name));
  const [draft, setDraft] = useState<string | null>(null); // null: the field shows the round on screen
  const [errors, setErrors] = useState<string[]>([]);
  const shown = current ? formatJakob(current.steps) : "";
  const submit = () => {
    const text = (draft ?? shown).trim();
    if (!text) return;
    const round = roundFromText(text, rounds);
    setErrors(round.errors);
    // Nothing is guessed: a round with a word that could not be read is not played in part.
    if (round.steps.length && !round.errors.length) {
      onPick(round);
      setDraft(null);
    }
  };
  const pick = (round: Round) => {
    setDraft(null);
    setErrors([]);
    onPick(round);
  };
  const notes = errors.length ? errors : draft === null ? problems : [];

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <section className="flex flex-col gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.09em] text-faint">Rundor</h2>
        <div className="flex flex-col gap-1.5">
          {big.map((round) => {
            const on = current?.key === round.key;
            const facts = round.key === "alla" ? `${round.steps.length} steg, alla platser och dealern` : formatJakob(round.steps);
            return (
              <button
                key={round.key}
                type="button"
                aria-pressed={on}
                onClick={() => pick(round)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-[border-color,background-color] duration-150",
                  on ? "border-brass/60 bg-brass/10" : "border-line bg-surface hover:border-line-strong hover:bg-raised",
                )}
              >
                <span className={cn("text-sm font-semibold", on ? "text-brass-hi" : "text-ink")}>{round.name}</span>
                <span className="truncate text-xs text-dim" title={formatJakob(round.steps)}>
                  {facts}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex flex-col gap-1.5">
          <span className="text-xs text-dim">En plats: A1 - A2.1 - giv - A1</span>
          <div className="grid grid-cols-7 gap-1">
            {seats.map((round) => {
              const on = current?.key === round.key;
              return (
                <button
                  key={round.key}
                  type="button"
                  aria-pressed={on}
                  title={formatJakob(round.steps)}
                  onClick={() => pick(round)}
                  className={cn(
                    "h-7 rounded-sm border text-xs font-semibold tabular-nums transition-[border-color,background-color,color] duration-150",
                    on ? "border-brass/60 bg-brass/12 text-brass-hi" : "border-line bg-surface text-dim hover:border-line-strong hover:text-ink",
                  )}
                >
                  {round.name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.09em] text-faint">Egen runda</h2>
        <form
          className="flex items-start gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            aria-label="Runda i din notation"
            wrapperClassName="flex-1"
            placeholder="A2.1 - P4C1 - A2.1"
            value={draft ?? shown}
            onChange={(e) => {
              setDraft(e.target.value);
              setErrors([]);
            }}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={errors.length ? true : undefined}
          />
          <Button type="submit" variant="secondary" icon={<CornerDownLeft />} disabled={!(draft ?? shown).trim()}>
            Spela
          </Button>
        </form>
        {notes.length ? (
          <ul role="alert" className="flex flex-col gap-1 text-xs text-[#ef8b8b]">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-faint">A1 vila · A2.1 nyp · A2.2 hand över · P1C1…P7C2 · DC1, DC2, ”DC2 upp”. | börjar en ny kedja.</p>
        )}
      </section>
    </div>
  );
}
