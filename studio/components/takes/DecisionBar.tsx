"use client";

// <DecisionBar take={take} />: Jakob's decision on one take: Primär, Godkänn, Variant, Underkänn, a note, Återställ.
// Nothing is written without his click. Primär lowers an earlier Primär on the same edge to plain accepted (its note kept);
// a 409 says the record changed, reads the bank again and asks him to choose again. demo: shows and answers, never writes.
// In the online copy (lib/mode.ts) there are no buttons at all: the bar shows his verdict and note and says "Bara Jakob
// dömer", and putDecision refuses there too.
import { Check, Diamond, Lock, RotateCcw, Star, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { ApiError, NOTE_LIMIT, putDecision, type Decision } from "../../lib/api.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { takeName } from "../../lib/names.ts";
import { chosenDecision, reviewStamp, storedNote } from "../../lib/verdict.ts";
import { Badge } from "../ui/Badge";
import { cn } from "../ui/cn";
import { Spinner } from "../ui/Spinner";
import { TextArea } from "../ui/TextField";
import { useToast } from "../ui/Toast";
import { TakeChip } from "./VerdictChip";

type Choice = Exclude<Decision, "PENDING">;

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
  /** After a saved decision and the bank read again. */
  onSaved?: (decision: Decision) => void;
  className?: string;
};

export function DecisionBar(props: BarProps) {
  return isSnapshot ? <JakobJudges take={props.take} className={props.className} /> : <DecisionButtons {...props} />;
}

/** The online copy's bar: his verdict and his note as they stand, and who decides. Nothing here can be pressed. */
function JakobJudges({ take, className }: { take: Take; className?: string }) {
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
      {note ? (
        <p className="rounded-md border border-line bg-well px-3 py-2 text-sm text-ink">
          {stamp ? <span className="mr-1.5 text-faint">{stamp}:</span> : null}
          {note}
        </p>
      ) : null}
    </div>
  );
}

function DecisionButtons({ take, demo = false, compact = false, onSaved, className }: BarProps) {
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

  async function decide(decision: Decision) {
    if (demo) {
      setDemoChoice(decision === "PENDING" ? null : decision);
      setConfirmReset(false);
      toast({ tone: "info", title: `Demo: ${DONE_TEXT[decision]}`, detail: "På den här sidan sparas ingenting." });
      return;
    }
    if (!ready || saving) return;
    if (decision === "PENDING" && !confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    setSaving(decision);
    setLine(null);
    try {
      await putDecision(take.id, decision, decision === "PENDING" ? "" : note, take.revision!);
      // One Primär per edge: an earlier one becomes a plain approval, with Jakob's own note kept.
      const lowered: string[] = [];
      const failed: string[] = [];
      if (decision === "MAIN" && bank?.graph) {
        const edge = bank.graph.edge[take.edge];
        for (const other of Object.values(bank.graph.takes)) {
          if (other.id === take.id || other.edge !== take.edge || !other.explicitMain || !other.revision) continue;
          const name = takeName(other, edge?.takes);
          try {
            await putDecision(other.id, "ACCEPTED", storedNote(other.motion?.review), other.revision);
            lowered.push(name);
          } catch {
            failed.push(name);
          }
        }
      }
      setDirty(false);
      if (failed.length) toast({ tone: "bad", title: `${DONE_TEXT[decision]} sparat, men ${failed.join(", ")} är också kvar som Primär`, detail: "Läs om och sätt den andra till Godkänn." });
      else toast({ tone: "ok", title: `${DONE_TEXT[decision]} · sparat`, detail: lowered.length ? `${lowered.join(", ")} är nu godkänd i stället för Primär.` : undefined });
      setLine({ tone: "ok", text: decision === "PENDING" ? "Återställd: filmen väntar på ditt beslut igen." : `Sparat i motions/${take.id}.json.` });
      await bank?.reload();
      onSaved?.(decision);
    } catch (error) {
      if (error instanceof ApiError && error.kind === "conflict") {
        setLine({ tone: "bad", text: "Posten ändrades medan du tittade. Den är läst på nytt: välj igen." });
        await bank?.reload();
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setLine({ tone: "bad", text: `Inte sparat: ${message}` });
        toast({ tone: "bad", title: "Inte sparat", detail: message });
      }
    } finally {
      setSaving(null);
    }
  }

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
