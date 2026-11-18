"use client";

// Archiving a clip by hand in Karta's step panel, beside Gör primär (Jakob 2026-11-18: "så jag får välja de som är primära
// eller radera eller arkivera"), and the folded "Arkiverade (n)" with Ta tillbaka. In the manner of Material's pictures
// (components/material/StateDecision.tsx): each click opens a confirm that says what follows (lib/archive.ts: for a Primär
// that the step then has none, and what the game then plays; plainly when nothing can) before anything is written. The write
// is his alone (PUT /api/clip-bank/archive/<id>: by Jakob, where Karta), against the take's revision like a verdict. No file
// is deleted or moved; the verdict stays on the take and comes back with it. Never in the online copy.
import * as RD from "@radix-ui/react-dialog";
import { Archive, ChevronDown, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Edge, Take } from "../../../src/clip-graph.ts";
import { TakeChip, TakeThumb } from "@/components/takes";
import { Button, cn, useToast } from "@/components/ui";
import { asApiError, putArchive } from "@/lib/api";
import { ARCHIVE_ACTION, archiveLines, archivedOf, restoreLines } from "@/lib/archive";
import { useBank } from "@/lib/bank";
import { isSnapshot } from "@/lib/mode";
import { takeName } from "@/lib/names";

type Asking = { take: Take; archive: boolean } | null;

/** The confirm and the one write, shared by the Arkivera buttons and the folded list: ask(take, true) archives, ask(take, false) takes back. */
export function useArchive() {
  const { bank, graph, dealer, reload } = useBank();
  const toast = useToast();
  const [asking, setAsking] = useState<Asking>(null);
  const [busy, setBusy] = useState(false);
  const words = asking ? ARCHIVE_ACTION[asking.archive ? "archive" : "restore"] : null;
  const name = asking && graph ? takeName(asking.take, graph.edge[asking.take.edge]?.takes) : "";
  const lines = useMemo(
    () => (asking && bank && graph ? (asking.archive ? archiveLines : restoreLines)(bank, dealer, asking.take, graph) : []),
    [asking, bank, graph, dealer],
  );

  const confirm = async () => {
    if (!asking || !words) return;
    setBusy(true);
    try {
      await putArchive(asking.take.id, asking.archive, asking.take.revision ?? "");
      toast({ tone: "ok", title: `${name} ${words.done}`, detail: asking.archive ? "Går att ta tillbaka under Arkiverade i steget." : undefined });
      setAsking(null);
      await reload();
    } catch (error) {
      const e = asApiError(error, words.button);
      toast({ tone: "bad", title: e.kind === "conflict" ? "Inte sparat: tagningen ändrades medan du tittade. Banken är läst på nytt; titta igen och välj." : e.message });
      if (e.kind === "conflict") {
        setAsking(null);
        await reload();
      }
    } finally {
      setBusy(false);
    }
  };

  // A dialog over the step's panel: its own layer above the panel's (z-40) and the film viewer's (z-50).
  const dialog = (
    <RD.Root open={!!asking} onOpenChange={(open) => !open && !busy && setAsking(null)}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <RD.Content className="fixed left-1/2 top-1/2 z-[61] flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-line-strong bg-surface p-5 shadow-pop focus:outline-none">
          <RD.Title className="font-display text-lg font-semibold text-ink">{words ? `${words.button}: ${name}?` : ""}</RD.Title>
          <RD.Description asChild>
            <div className="flex flex-col gap-2 text-sm text-ink">
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </RD.Description>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="quiet" onClick={() => setAsking(null)} disabled={busy}>
              Avbryt
            </Button>
            <Button variant="secondary" icon={asking?.archive ? <Archive /> : <Undo2 />} loading={busy} onClick={() => void confirm()}>
              {words?.button ?? ""}
            </Button>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
  return { ask: (take: Take, archive: boolean) => setAsking({ take, archive }), dialog };
}

/**
 * The step's archived takes, folded at the foot of its panel: "Arkiverade (n)", each with its still (the film under the
 * pointer, as every take's still), its name, the verdict that comes back with it, and Ta tillbaka. open: start unfolded
 * (the address names one of them). Nothing when there are none, and nothing in the online copy.
 */
export function ArchivedTakes({ edge, onRestore, open: startOpen = false }: { edge: Edge; onRestore: (take: Take) => void; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const list = archivedOf(edge);
  if (!list.length || isSnapshot) return null;
  return (
    <section className="flex flex-col gap-1.5" aria-label="Arkiverade">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="Klipp du har arkiverat i steget: ur spel och ur listorna, inte raderade"
        className="flex items-center gap-1.5 self-start rounded-md py-1 text-xs font-medium text-faint hover:text-ink"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "")} />
        Arkiverade ({list.length})
      </button>
      {open
        ? list.map((t) => (
            <div key={t.id} id={`tagning-${t.id}`} className="flex scroll-mt-4 items-center gap-2.5 rounded-lg border border-dashed border-line px-2 py-1.5">
              <TakeThumb take={t} still="film" className="w-[96px] shrink-0 opacity-80" />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span className="max-w-full truncate text-sm font-medium text-dim" title={t.id}>
                  {takeName(t, edge.takes)}
                </span>
                <TakeChip take={t} size="sm" />
              </span>
              <Button variant="secondary" size="sm" icon={<Undo2 />} onClick={() => onRestore(t)} title={ARCHIVE_ACTION.restore.hint}>
                {ARCHIVE_ACTION.restore.button}
              </Button>
            </div>
          ))
        : null}
    </section>
  );
}
