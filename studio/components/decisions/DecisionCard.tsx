"use client";

// <DecisionCard decision={d} />: one thing that waits for Jakob, or one he has answered. What to look at comes first (the
// proof's film, played in the card, or its picture), then the short question, one sentence on what his answer leads to, a
// page of the lab to open or an address to open on the phone, the answer chips and a note. A press on a chip saves at once
// (lib/decisions.ts putAnswer, which writes only this entry's answer, with its time); another chip changes the answer, and
// "Ångra svaret" (pressed twice) takes it back. Nothing is written without his press.
import { Check, Copy, ExternalLink, FlaskConical, Globe, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { asApiError } from "../../lib/api.ts";
import { KIND_WORD, NOTE_LIMIT, answeredAt, askedDay, chosenLabel, linkHref, openWord, pageHref, proofHref, putAnswer, type Kind, type ShownDecision } from "../../lib/decisions.ts";
import { labUrl } from "../../lib/lab.ts";
import { Badge } from "../ui/Badge";
import { Button, buttonClasses } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import { IconButton } from "../ui/IconButton";
import { TextField } from "../ui/TextField";
import { useToast } from "../ui/Toast";
import { applySaved, refreshDecisions } from "./useDecisions";

function KindTag({ kind }: { kind: Kind }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-sm border px-1.5 text-2xs font-semibold uppercase tracking-[0.06em]",
        kind === "gora" ? "border-brass/35 bg-brass/10 text-brass-hi" : "border-line bg-canvas/60 text-dim",
      )}
    >
      {KIND_WORD[kind]}
    </span>
  );
}

/** The proof's film (with the player's own controls, inline on a phone too) or picture, as large as the card allows. */
function Media({ decision }: { decision: ShownDecision }) {
  const shown = decision.shown!;
  const src = labUrl(shown.path);
  return (
    <div className="flex items-center bg-well lg:w-[54%] lg:shrink-0">
      {shown.kind === "video" ? (
        // #t=0.1: a phone's browser shows the film's first picture instead of a black box before it is played.
        <video src={`${src}#t=0.1`} controls playsInline preload="metadata" className="aspect-video w-full bg-well object-contain" />
      ) : (
        <Link href={proofHref(decision.proof!, shown.name)} aria-label="Öppna bilden i Prov" className="block w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- a lab file; next/image cannot optimise in a static export */}
          <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="aspect-video w-full object-contain" />
        </Link>
      )}
    </div>
  );
}

/** An address outside the lab, to open on the phone: as text, a link, and a button that copies it. */
function OutsideLink({ link }: { link: string }) {
  const toast = useToast();
  const href = linkHref(link);
  const copy = () =>
    void navigator.clipboard.writeText(href).then(
      () => toast({ tone: "ok", title: "Adressen är kopierad", detail: href }),
      () => toast({ tone: "bad", title: "Kunde inte kopiera", detail: href }),
    );
  return (
    <span className="inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-line-strong bg-well pl-2.5 pr-0.5 shadow-inset">
      <Globe aria-hidden className="size-3.5 shrink-0 text-dim" />
      <a href={href} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-xs text-ink hover:text-brass-hi">
        {link}
      </a>
      <IconButton label="Kopiera adressen" icon={<Copy />} size="sm" variant="quiet" onClick={copy} />
    </span>
  );
}

export function DecisionCard({ decision }: { decision: ShownDecision }) {
  const toast = useToast();
  const stored = decision.answer?.note ?? "";
  // What he types; null while he has not typed, so that the field shows the note as stored.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const note = draft ?? stored;
  const chosen = decision.answer?.value ?? null;
  const answered = !!decision.answer;
  const noteChanged = answered && draft !== null && draft.trim() !== stored;

  useEffect(() => {
    if (!confirmUndo) return;
    const timer = window.setTimeout(() => setConfirmUndo(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmUndo]);

  async function save(value: string | null, what: string) {
    if (saving) return;
    setSaving(what);
    try {
      const { decision: next } = await putAnswer(decision.id, value, value === null ? "" : note, decision.revision);
      setDraft(null);
      setConfirmUndo(false);
      applySaved(next);
      if (value === null) toast({ tone: "info", title: "Svaret är borttaget", detail: "Frågan väntar på dig igen." });
      else toast({ tone: "ok", title: what === "note" ? "Anteckningen är sparad" : `Sparat: ${chosenLabel(next) ?? value}`, detail: answered ? undefined : "Den ligger nu under Besvarade, där du kan ändra svaret." });
    } catch (error) {
      const e = asApiError(error, "Svaret");
      if (e.kind === "conflict" || e.kind === "missing") {
        toast({ tone: "bad", title: e.kind === "missing" ? "Frågan finns inte längre" : "Frågan ändrades medan du tittade", detail: "Den är läst på nytt: titta och svara igen." });
        void refreshDecisions();
      } else toast({ tone: "bad", title: "Inte sparat", detail: e.message });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <article aria-label={decision.question} className={cn("flex flex-col", decision.shown && "lg:flex-row")}>
        {decision.shown ? <Media decision={decision} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <KindTag kind={decision.kind} />
            {decision.cost ? (
              <Badge tone="remark" size="md" className="h-auto min-h-[22px] min-w-0 max-w-full shrink whitespace-normal py-0.5">
                {decision.cost}
              </Badge>
            ) : null}
            <span className="text-xs text-faint">
              {decision.from} · {askedDay(decision.asked)}
            </span>
            {decision.proof && decision.shown ? (
              <Link href={proofHref(decision.proof, decision.shown.name)} className="ml-auto inline-flex items-center gap-1 text-xs text-dim hover:text-ink [&_svg]:size-3.5">
                <FlaskConical aria-hidden />
                Hela provet
              </Link>
            ) : null}
          </div>

          <h2 className="text-balance font-display text-lg font-semibold leading-6 text-ink">{decision.question}</h2>
          <p className="text-sm text-dim">{decision.leads}</p>
          {decision.missing ? <p className="text-xs text-faint">{decision.missing}</p> : null}

          {decision.page || decision.link ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {decision.page ? (
                <a href={pageHref(decision.page)} className={buttonClasses({ variant: "secondary", size: "md" })}>
                  <ExternalLink />
                  {openWord(decision.page)}
                </a>
              ) : null}
              {decision.link ? <OutsideLink link={decision.link} /> : null}
            </div>
          ) : null}

          <div role="group" aria-label="Ditt svar" className="mt-1 flex flex-wrap gap-2">
            {decision.chips.map((chip) => {
              const on = chosen === chip.value;
              return (
                <Button
                  key={chip.value}
                  variant={on ? "primary" : "secondary"}
                  size="lg"
                  aria-pressed={on}
                  loading={saving === chip.value}
                  disabled={!!saving && saving !== chip.value}
                  icon={on ? <Check /> : undefined}
                  onClick={() => {
                    if (!on) void save(chip.value, chip.value);
                  }}
                  className="h-auto min-h-10 whitespace-normal py-2 text-left"
                >
                  {chip.label}
                </Button>
              );
            })}
          </div>

          {decision.answer ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
              <span>
                Ditt svar, {answeredAt(decision.answer.at)}. Tryck ett annat val för att ändra.
              </span>
              <button
                type="button"
                disabled={!!saving}
                onClick={() => (confirmUndo ? void save(null, "undo") : setConfirmUndo(true))}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-sm px-2 font-medium transition-colors disabled:opacity-45 [&_svg]:size-3.5",
                  confirmUndo ? "bg-underkand/15 text-[#f29c9c] hover:bg-underkand/22" : "text-dim hover:bg-raised hover:text-ink",
                )}
              >
                <RotateCcw aria-hidden />
                {confirmUndo ? "Tryck igen: svaret tas bort" : "Ångra svaret"}
              </button>
            </div>
          ) : null}

          <div className="flex items-start gap-2">
            <TextField
              aria-label="Anteckning"
              placeholder={answered ? "Anteckning" : "Anteckning, om du vill"}
              value={note}
              maxLength={NOTE_LIMIT}
              disabled={!!saving}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && noteChanged) void save(chosen, "note");
              }}
              wrapperClassName="min-w-0 flex-1"
            />
            {noteChanged ? (
              <Button variant="secondary" loading={saving === "note"} onClick={() => void save(chosen, "note")}>
                Spara
              </Button>
            ) : null}
          </div>
        </div>
      </article>
    </Card>
  );
}
