"use client";

// <DecisionBar take={take} />: Jakob's decision on one take: Primär, Godkänn, Variant, Underkänn, a note, Återställ, and
// under the buttons one quiet line on what each choice does to what is played (decision-help.ts).
// Nothing is written without his click. Primär lowers an earlier Primär on the same edge to plain accepted (its note kept);
// a 409 says the record changed, reads the bank again and asks him to choose again. demo: shows and answers, never writes.
// In the online copy (lib/mode.ts) there are no buttons at all: the bar shows his verdict and note and says "Bara Jakob
// dömer", and putDecision refuses there too. The write itself, with the Primär rule, is lib/decide.ts (one copy).
// ref (DecisionBarHandle): reset() makes the same write as "Återställ", for a button of his elsewhere ("Ångra" in the
// review queue); the caller calls it only from his click there. It skips Återställ's second click: "Ångra" is the click.
import { Check, Diamond, Lock, RotateCcw, Star, X } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { ApiError, NOTE_LIMIT, putDecision, type Decision } from "../../lib/api.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { decide as write } from "../../lib/decide.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { chosenDecision, reviewStamp, storedNote } from "../../lib/verdict.ts";
import { Badge } from "../ui/Badge";
import { cn } from "../ui/cn";
import { Spinner } from "../ui/Spinner";
import { TextArea } from "../ui/TextField";
import { useToast } from "../ui/Toast";
import { TakeChip } from "./VerdictChip";
import { decisionHelp } from "./decision-help.ts";

type Choice = Exclude<Decision, "PENDING">;

/** One quiet line under the buttons: what each choice does to what is played (decision-help.ts). A list of many bars
 * (the map's take panel) shows it once above them and passes help={false} to each. */
export function DecisionHelp({ edge, className }: { edge: string; className?: string }) {
  const { parts, rest } = decisionHelp(edge);
  return (
    <p className={cn("text-2xs leading-4 text-faint", className)}>
      {parts.map((p, i) => (
        <span key={p.word}>
          {i ? " · " : ""}
          <span className="text-dim">{p.word}</span> {p.text}
        </span>
      ))}
      .{rest ? ` ${rest}` : ""}
    </p>
  );
}

const CHOICES: { decision: Choice; label: string; done: string; icon: ReactNode; on: string; hover: string; sign: string }[] = [
  {
    decision: "MAIN",
    label: "Primär",
    done: "Primär",
    icon: <Star />,
    sign: "text-brass",
    on: "border-brass bg-brass text-brass-ink [&_svg]:text-brass-ink [&_svg]:fill-brass-ink",
    hover: "enabled:hover:border-brass/60 enabled:hover:bg-brass/10",
  },
  {
    decision: "ACCEPTED",
    label: "Godkänn",
    done: "Godkänd",
    icon: <Check />,
    sign: "text-godkand",
    on: "border-godkand/70 bg-godkand/18 text-[#7fd3a5]",
    hover: "enabled:hover:border-godkand/50 enabled:hover:bg-godkand/10",
  },
  {
    decision: "VARIANT",
    label: "Variant",
    done: "Variant",
    icon: <Diamond />,
    sign: "text-variant",
    on: "border-variant/70 bg-variant/18 text-[#aabff9] [&_svg]:fill-current",
    hover: "enabled:hover:border-variant/50 enabled:hover:bg-variant/10",
  },
  {
    decision: "REJECTED",
    label: "Underkänn",
    done: "Underkänd",
    icon: <X />,
    sign: "text-underkand",
    on: "border-underkand/70 bg-underkand/18 text-[#f29c9c]",
    hover: "enabled:hover:border-underkand/50 enabled:hover:bg-underkand/10",
  },
];
const DONE_TEXT: Record<Decision, string> = { MAIN: "Primär", ACCEPTED: "Godkänd", VARIANT: "Variant", REJECTED: "Underkänd", PENDING: "Återställd" };

type Line = { tone: "info" | "ok" | "bad"; text: string } | null;

type BarProps = {
  take: Take;
  /** Shows the bar and lets the buttons answer, but never writes (the kit page). */
  demo?: boolean;
  /** Leaves out the line that says where the decision is saved. */
  compact?: boolean;
  /** The line on what each choice does (default on). */
  help?: boolean;
  /** After a saved decision and the bank read again. */
  onSaved?: (decision: Decision) => void;
  className?: string;
  ref?: Ref<DecisionBarHandle>;
};

export type DecisionBarHandle = {
  /** The same write as "Återställ" on the bar's take (it waits again, its note goes); true when it was saved. */
  reset(): Promise<boolean>;
};

export function DecisionBar(props: BarProps) {
  return isSnapshot ? <JakobJudges take={props.take} help={props.help ?? true} className={props.className} ref={props.ref} /> : <DecisionButtons {...props} />;
}

/** The online copy's bar: his verdict and his note as they stand, and who decides. Nothing here can be pressed. */
function JakobJudges({ take, help, className, ref }: { take: Take; help: boolean; className?: string; ref?: Ref<DecisionBarHandle> }) {
  useImperativeHandle(ref, () => ({ reset: async () => false }), []);
  const note = storedNote(take.motion?.review);
  const stamp = reviewStamp(take.motion?.review);
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <TakeChip take={take} />
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 py-1 text-sm text-dim">
          <Lock aria-hidden className="size-3.5 text-brass" />
          Bara Jakob dömer
        </span>
      </div>
      {help ? <DecisionHelp edge={take.edge} /> : null}
      {note ? (
        <p className="rounded-md border border-line bg-well px-3 py-2 text-sm text-ink">
          {stamp ? <span className="mr-1.5 text-faint">{stamp}:</span> : null}
          {note}
        </p>
      ) : null}
    </div>
  );
}

function DecisionButtons({ take, demo = false, compact = false, help = true, onSaved, className, ref }: BarProps) {
  const bank = useOptionalBank();
  const toast = useToast();
  const stored = storedNote(take.motion?.review);
  const [note, setNote] = useState(stored);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<Decision | null>(null);
  const [line, setLine] = useState<Line>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [demoChoice, setDemoChoice] = useState<Choice | null | undefined>(undefined);
  const shownFor = useRef(take.id);

  // A new take, or his stored note changed on disk while he has not typed: the field shows what is stored.
  useEffect(() => {
    if (shownFor.current !== take.id) {
      shownFor.current = take.id;
      setNote(stored);
      setDirty(false);
      setLine(null);
      setConfirmReset(false);
      setDemoChoice(undefined);
    } else if (!dirty) setNote(stored);
  }, [take.id, stored, dirty]);

  useEffect(() => {
    if (!confirmReset) return;
    const timer = window.setTimeout(() => setConfirmReset(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmReset]);

  const chosen = demo && demoChoice !== undefined ? demoChoice : chosenDecision(take);
  const ready = take.stage === "DONE" && !!take.revision;
  const blocked = take.stage !== "DONE" ? "Beslut kan sättas när filmen är klar." : !take.revision ? "Kan inte sparas ännu: tagningen har ingen post i motions/." : null;
  const can = (demo || ready) && !saving;
  const hasWord = !!take.motion?.review?.userReview;

  // A button of the bar: Återställ asks for a second click first.
  function decide(decision: Decision) {
    if (!demo && decision === "PENDING" && !confirmReset) {
      if (ready && !saving) setConfirmReset(true);
      return;
    }
    void save(decision);
  }

  async function save(decision: Decision): Promise<boolean> {
    if (demo) {
      setDemoChoice(decision === "PENDING" ? null : decision);
      setConfirmReset(false);
      toast({ tone: "info", title: `Demo: ${DONE_TEXT[decision]}`, detail: "På den här sidan sparas ingenting." });
      return false;
    }
    if (!ready || saving) return false;
    setConfirmReset(false);
    setSaving(decision);
    setLine(null);
    try {
      // One Primär per edge: an earlier one becomes a plain approval, with Jakob's own note kept (lib/decide.ts).
      const { lowered, failed } = await write(take, decision, note, bank?.graph ?? null, putDecision);
      setDirty(false);
      if (failed.length) toast({ tone: "bad", title: `${DONE_TEXT[decision]} sparat, men ${failed.join(", ")} är också kvar som Primär`, detail: "Läs om och sätt den andra till Godkänn." });
      else toast({ tone: "ok", title: `${DONE_TEXT[decision]} · sparat`, detail: lowered.length ? `${lowered.join(", ")} är nu godkänd i stället för Primär.` : undefined });
      setLine({ tone: "ok", text: decision === "PENDING" ? "Återställd: filmen väntar på ditt beslut igen." : `Sparat i motions/${take.id}.json.` });
      await bank?.reload();
      onSaved?.(decision);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.kind === "conflict") {
        setLine({ tone: "bad", text: "Posten ändrades medan du tittade. Den är läst på nytt: välj igen." });
        await bank?.reload();
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setLine({ tone: "bad", text: `Inte sparat: ${message}` });
        toast({ tone: "bad", title: "Inte sparat", detail: message });
      }
      return false;
    } finally {
      setSaving(null);
    }
  }

  // Made anew on every render (no deps), so a reset asked for right after a render reads this take and its revision.
  useImperativeHandle(ref, () => ({ reset: () => save("PENDING") }));

  const stamp = reviewStamp(take.motion?.review);
  const hint: Line =
    line ??
    (blocked && !demo
      ? { tone: "info", text: blocked }
      : demo
        ? { tone: "info", text: "Demoläge: knapparna svarar men ingenting sparas." }
        : compact
          ? null
          : { tone: "info", text: stamp ? `Senast: ${stamp}. Ett klick sparar ditt beslut och anteckningen.` : "Ett klick sparar ditt beslut och anteckningen. Inget annat ändras." });

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Beslut" className="flex flex-wrap items-center gap-1.5">
          {CHOICES.map((c) => {
            const on = chosen === c.decision;
            return (
              <button
                key={c.decision}
                type="button"
                aria-pressed={on}
                disabled={!can}
                onClick={() => void decide(c.decision)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-[background-color,border-color,color] duration-150",
                  "disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
                  on ? c.on : cn("border-line-strong bg-raised text-ink shadow-inset", c.hover),
                )}
              >
                {saving === c.decision ? <Spinner size="sm" label="Sparar" /> : <span className={cn(!on && c.sign, "inline-flex")}>{c.icon}</span>}
                {on ? c.done : c.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {demo ? <Badge tone="brass">Demo</Badge> : null}
          <button
            type="button"
            disabled={!can || (!hasWord && chosen === null && !demo)}
            onClick={() => void decide("PENDING")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4",
              confirmReset ? "bg-underkand/15 text-[#f29c9c] hover:bg-underkand/22" : "text-dim enabled:hover:bg-raised enabled:hover:text-ink",
            )}
          >
            {saving === "PENDING" ? <Spinner size="sm" label="Sparar" /> : <RotateCcw />}
            {confirmReset ? "Klicka igen: anteckningen tas bort" : "Återställ"}
          </button>
        </div>
      </div>
      {help ? <DecisionHelp edge={take.edge} /> : null}
      <TextArea
        aria-label="Anteckning"
        placeholder="Anteckning (sparas med beslutet)"
        value={note}
        maxLength={NOTE_LIMIT}
        counter
        rows={2}
        disabled={!can}
        onChange={(event) => {
          setNote(event.target.value);
          setDirty(true);
        }}
        className="min-h-[60px]"
        hint={
          hint ? (
            <span role={hint.tone === "bad" ? "alert" : undefined} className={hint.tone === "bad" ? "text-[#ef8b8b]" : hint.tone === "ok" ? "text-[#6cc595]" : "text-faint"}>
              {hint.text}
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
