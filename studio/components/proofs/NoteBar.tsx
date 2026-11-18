"use client";

// Jakob's own word in Granska's part Prov, on a film or picture (file) or on the proof as a whole (file null).
// useProofNotes(): every note he has written (GET /api/proof-notes), read when the part opens and when its tab comes back,
// and a save that writes only on his click. <NoteBar notes={notes} proof={id} file={name} />: two small buttons, Bra and
// Inte bra (pressed again: taken back), and a comment; under them what he said as his ("Du: …") and the main agent's
// answer ("Huvudagenten: …"). In the online copy no button is shown, only what he has said ("Jakob: …").
import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { asApiError } from "../../lib/api.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { CHOICE_WORD, TEXT_LIMIT, getProofNotes, noteWords, notesByPlace, placeKey, putProofNote, replaceNote, speaker, type Choice, type ShownNote } from "../../lib/proof-notes.ts";
import { Button, TextArea, cn } from "../ui";

export type ProofNotes = {
  notes: readonly ShownNote[];
  get: (proof: string, file: string | null) => ShownNote | null;
  /** His word on one place; resolved when it is saved, rejected with the lab's words when it is not. */
  save: (proof: string, file: string | null, choice: Choice | null, text: string) => Promise<void>;
};

export function useProofNotes(): ProofNotes {
  const [notes, setNotes] = useState<ShownNote[]>([]);
  const [fresh, setFresh] = useState("");
  const read = useCallback(
    () =>
      getProofNotes().then(
        (answer) => {
          setNotes(answer.notes);
          setFresh(answer.newRevision ?? "");
        },
        () => {
          /* the proofs still show; his words come with the next read */
        },
      ),
    [],
  );
  useEffect(() => {
    void read();
    const seen = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, [read]);
  const byPlace = useMemo(() => notesByPlace(notes), [notes]);
  const get = useCallback((proof: string, file: string | null) => byPlace.get(placeKey(proof, file)) ?? null, [byPlace]);
  const save = useCallback(
    async (proof: string, file: string | null, choice: Choice | null, text: string) => {
      const before = byPlace.get(placeKey(proof, file));
      try {
        const saved = await putProofNote(proof, file, choice, text, before?.revision ?? fresh);
        setNotes((now) => replaceNote(now, saved));
      } catch (error) {
        const failure = asApiError(error, "Ordet");
        if (failure.kind === "conflict") void read(); // someone else wrote meanwhile: show what lies there now
        throw failure;
      }
    },
    [byPlace, fresh, read],
  );
  return useMemo(() => ({ notes, get, save }), [notes, get, save]);
}

const CHOICES: { value: Choice; icon: typeof ThumbsUp }[] = [
  { value: "bra", icon: ThumbsUp },
  { value: "inte-bra", icon: ThumbsDown },
];

export function NoteBar({ notes, proof, file, className }: { notes: ProofNotes; proof: string; file: string | null; className?: string }) {
  const note = notes.get(proof, file);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (choice: Choice | null, text: string) => {
    setBusy(true);
    setError(null);
    try {
      await notes.save(proof, file, choice, text);
      setWriting(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const said = note ? (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs leading-5">
      <p className="text-ink/90">
        <b className="font-semibold text-brass-hi">{speaker(isSnapshot)}:</b> <span className="whitespace-pre-line">{noteWords(note)}</span>
      </p>
      {note.answer ? (
        <p className="text-dim">
          <b className="font-semibold text-ink/80">Huvudagenten:</b> <span className="whitespace-pre-line">{note.answer.text}</span>
        </p>
      ) : null}
    </div>
  ) : null;

  if (isSnapshot) return said ? <div className={className}>{said}</div> : null;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div role="group" aria-label={file ? "Ditt ord om filen" : "Ditt ord om provet"} className="flex flex-wrap items-center gap-1">
        {/* Jakob 2026-11-18: "Jag förstår inte riktigt vilket alternativ jag ska välja": the buttons are his own opinion, never a task. */}
        {file ? <span className="mr-1 text-2xs text-dim">Din åsikt (frivilligt)</span> : null}
        {CHOICES.map(({ value, icon: Icon }) => {
          const on = note?.choice === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              disabled={busy}
              title={on ? `${CHOICE_WORD[value]} (klicka för att ta bort)` : CHOICE_WORD[value]}
              onClick={() => void save(on ? null : value, note?.text ?? "")}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 text-2xs font-medium transition-colors duration-150 disabled:opacity-50 [&_svg]:size-3",
                on ? (value === "bra" ? "border-[#6cc595]/60 bg-[#6cc595]/12 text-[#8fd8b0]" : "border-[#ef8b8b]/60 bg-[#ef8b8b]/12 text-[#f3a5a5]") : "border-line text-dim hover:border-line-strong hover:text-ink",
              )}
            >
              <Icon /> {CHOICE_WORD[value]}
            </button>
          );
        })}
        {!writing ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(note?.text ?? "");
              setWriting(true);
            }}
            className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium text-dim transition-colors hover:text-ink disabled:opacity-50 [&_svg]:size-3"
          >
            <MessageSquare /> {note?.text ? "Ändra kommentar" : "Kommentera"}
          </button>
        ) : null}
      </div>
      {writing ? (
        <div className="flex flex-col gap-1.5">
          <TextArea aria-label="Din kommentar" value={draft} maxLength={TEXT_LIMIT} rows={2} autoFocus onChange={(e) => setDraft(e.target.value)} />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="primary" loading={busy} onClick={() => void save(note?.choice ?? null, draft)}>
              Spara
            </Button>
            {note?.text ? (
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => void save(note.choice, "")}>
                Ta bort kommentaren
              </Button>
            ) : null}
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => setWriting(false)}>
              Avbryt
            </Button>
          </div>
        </div>
      ) : null}
      {said}
      {error ? <p className="text-xs text-[#ef8b8b]">{error}</p> : null}
    </div>
  );
}
