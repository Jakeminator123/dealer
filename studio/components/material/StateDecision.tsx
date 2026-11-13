"use client";

// Godkänn / Underkänn on a candidate picture in the viewer. Godkänn makes it hold (gäller) and the other candidates of the
// same role, position and card become ersatt; the confirm dialog names them before anything is written. Underkänn sets
// it aside (ersatt) after its own confirm. Only on Jakob's click, never in the online copy.
import * as RD from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { asApiError } from "../../lib/api.ts";
import type { EntryAnswer } from "../../lib/media.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { Button, useToast } from "../ui";
import { setPictureState } from "./client.ts";
import { isDecidable, replacedBy } from "./state.ts";

export function StateDecision({ entry, row, revision, onDecided }: { entry: EntryAnswer; row: readonly EntryAnswer[]; revision: string | null; onDecided: () => void }) {
  const [asking, setAsking] = useState<"gäller" | "ersatt" | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (isSnapshot || entry.state !== "kandidat" || !isDecidable(entry) || !revision) return null;
  const replaced = replacedBy(row, entry);

  const decide = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      const done = await setPictureState(entry.id, asking, revision);
      toast({ tone: "ok", title: asking === "gäller" ? `${entry.name} gäller` : `${entry.name} är underkänd`, detail: done.replaced.length ? `Ersatta: ${done.replaced.map((r) => r.name).join(", ")}` : undefined });
      setAsking(null);
      onDecided();
    } catch (error) {
      toast({ tone: "bad", title: asApiError(error, "Domen").message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="primary" size="sm" icon={<Check />} onClick={() => setAsking("gäller")}>
        Godkänn
      </Button>
      <Button variant="secondary" size="sm" icon={<X />} onClick={() => setAsking("ersatt")}>
        Underkänn
      </Button>
      {/* A dialog inside the viewer: its own layer above the viewer's (z-50). */}
      <RD.Root open={!!asking} onOpenChange={(o) => !o && setAsking(null)}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-[60] bg-black/60" />
          <RD.Content className="fixed left-1/2 top-1/2 z-[61] flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl border border-line-strong bg-surface p-5 shadow-pop focus:outline-none">
            <RD.Title className="font-display text-lg font-semibold text-ink">{asking === "gäller" ? `Godkänn ${entry.name}?` : `Underkänn ${entry.name}?`}</RD.Title>
            <RD.Description asChild>
              <div className="flex flex-col gap-2 text-sm text-ink">
                {asking === "gäller" ? (
                  <>
                    <p>Bilden gäller från nu. Filmer och bilder beställs från den.</p>
                    {replaced.length ? (
                      <div>
                        <p className="text-dim">De här bilderna blir ersatta:</p>
                        <ul className="mt-1 list-disc pl-5">
                          {replaced.map((r) => (
                            <li key={r.id}>{r.name}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-dim">Inga andra bilder ersätts.</p>
                    )}
                  </>
                ) : (
                  <p>Bilden blir ersatt och används inte. Det går inte att ångra här.</p>
                )}
              </div>
            </RD.Description>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="quiet" onClick={() => setAsking(null)}>
                Avbryt
              </Button>
              <Button variant={asking === "gäller" ? "primary" : "danger"} loading={busy} onClick={() => void decide()}>
                {asking === "gäller" ? "Godkänn" : "Underkänn"}
              </Button>
            </div>
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </>
  );
}
