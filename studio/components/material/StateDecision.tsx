"use client";

// Jakob's choice of a picture by hand, in the viewer's header (2026-11-18: "Jag vill också kunna manuellt ändra typ ankare
// och klipp så jag får välja de som är primära eller radera eller arkivera"): the changes the picture's state allows
// (state.ts offered), in state.ts's words: Gör till den som gäller · Lägg åt sidan · Arkivera · Ta tillbaka. Each click opens a
// confirm that says in one line what follows (the pictures set aside, and how many clips are built on what holds now and
// become marked as older: studio/lib/lineage.ts consequenceOfHolding) before anything is written. Arkivera never deletes:
// the picture leaves the lists and comes back as a candidate with Ta tillbaka. Only on his click, never in the online copy.
import * as RD from "@radix-ui/react-dialog";
import { Archive, Check, PauseCircle, Undo2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { asApiError } from "../../lib/api.ts";
import type { Lineage } from "../../lib/lineage.ts";
import type { EntryAnswer, State } from "../../lib/media.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { Button, useToast } from "../ui";
import { setPictureState } from "./client.ts";
import { changeLines } from "./choice.ts";
import { ACTION, isDecidable, offered } from "./state.ts";

const ICON: Record<State, ReactNode> = { "gäller": <Check />, ersatt: <PauseCircle />, arkiverad: <Archive />, kandidat: <Undo2 /> };

export function StateDecision({
  entry,
  dealerEntries,
  lineage,
  revision,
  onDecided,
}: {
  entry: EntryAnswer;
  /** Every picture of the shown dealer: what a choice sets aside and what is built on it is read from them. */
  dealerEntries: readonly EntryAnswer[];
  lineage: Lineage;
  revision: string | null;
  onDecided: () => void;
}) {
  const [asking, setAsking] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (isSnapshot || !isDecidable(entry) || !revision) return null;
  const choices = offered(entry.state);
  if (!choices.length) return null;
  const said = asking ? changeLines(entry, asking, dealerEntries, lineage) : null;

  const decide = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      const done = await setPictureState(entry.id, asking, revision);
      toast({ tone: "ok", title: `${entry.name} ${ACTION[asking].done}`, detail: done.replaced.length ? `Lagda åt sidan: ${done.replaced.map((r) => r.name).join(", ")}` : undefined });
      setAsking(null);
      onDecided();
    } catch (error) {
      const e = asApiError(error, "Ändringen");
      toast({ tone: "bad", title: e.kind === "conflict" ? "Inte sparat: materialet ändrades medan du tittade. Det är läst på nytt; titta igen och välj." : e.message });
      if (e.kind === "conflict") {
        setAsking(null);
        onDecided();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {choices.map((to) => (
        <Button key={to} variant={to === "gäller" ? "primary" : "secondary"} size="sm" icon={ICON[to]} onClick={() => setAsking(to)}>
          {ACTION[to].button}
        </Button>
      ))}
      {/* A dialog inside the viewer: its own layer above the viewer's (z-50). */}
      <RD.Root open={!!asking} onOpenChange={(o) => !o && setAsking(null)}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-[60] bg-black/60" />
          <RD.Content className="fixed left-1/2 top-1/2 z-[61] flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-line-strong bg-surface p-5 shadow-pop focus:outline-none">
            <RD.Title className="font-display text-lg font-semibold text-ink">{asking ? `${ACTION[asking].button}: ${entry.name}?` : ""}</RD.Title>
            <RD.Description asChild>
              <div className="flex flex-col gap-2 text-sm text-ink">
                {said?.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {said?.aside.length ? (
                  <div>
                    <p className="text-dim">De här bilderna läggs åt sidan:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {said.aside.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </RD.Description>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="quiet" onClick={() => setAsking(null)}>
                Avbryt
              </Button>
              <Button variant={asking === "gäller" ? "primary" : "secondary"} loading={busy} onClick={() => void decide()}>
                {asking ? ACTION[asking].button : ""}
              </Button>
            </div>
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </>
  );
}
