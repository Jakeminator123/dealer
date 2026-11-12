"use client";

// "Gör primär" on the Primära page: one click makes the take Primär and lowers an earlier Primär on its edge (the same two
// steps as DecisionBar, in lib/primaries.ts makePrimary), then reads the bank again so the row shows the new state.
// A 409 (the record changed while he looked) is said in plain Swedish and the bank is read again.
import { useCallback, useState } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { useToast } from "@/components/ui";
import { ApiError, putDecision } from "@/lib/api";
import { useBank } from "@/lib/bank";
import { edgeName, takeName } from "@/lib/names";
import { makePrimary } from "@/lib/primaries";

export type RowLine = { tone: "ok" | "bad"; text: string };

export function useMakePrimary() {
  const { graph, reload } = useBank();
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, RowLine>>({});

  const make = useCallback(
    async (take: Take) => {
      if (!graph || saving) return;
      const name = takeName(take, graph.edge[take.edge]?.takes);
      setSaving(take.id);
      setLines((l) => {
        const next = { ...l };
        delete next[take.edge];
        return next;
      });
      try {
        const { lowered, failed } = await makePrimary(take, graph, putDecision);
        if (failed.length) toast({ tone: "bad", title: `${name} är Primär, men ${failed.join(", ")} är också kvar som Primär`, detail: "Läs om och sätt den andra till Godkänn på kartan." });
        else toast({ tone: "ok", title: `${name} är Primär · sparat`, detail: lowered.length ? `${lowered.join(", ")} är nu godkänd i stället för Primär.` : `Spelas först i steget ${edgeName(take.edge)}.` });
        await reload();
      } catch (error) {
        if (error instanceof ApiError && error.kind === "conflict") {
          setLines((l) => ({ ...l, [take.edge]: { tone: "bad", text: "Inte sparat: tagningen ändrades medan du tittade. Banken är läst på nytt, titta på raden och välj igen." } }));
          await reload();
        } else {
          const message = error instanceof Error ? error.message : String(error);
          setLines((l) => ({ ...l, [take.edge]: { tone: "bad", text: `Inte sparat: ${message}` } }));
        }
      } finally {
        setSaving(null);
      }
    },
    [graph, saving, toast, reload],
  );

  return { make, saving, lines };
}
