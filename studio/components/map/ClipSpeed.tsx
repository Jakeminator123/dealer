"use client";

// "Fart" beside a film in a step's panel on Karta (Jakob 2026-11-23: "spela upp dealerklipp i 1.5x eller 2x ... den nya
// standarden för respektive klipp"): the film's own speed, 1× (as filmed), 1,25×, 1,5× or 2×. One click writes the field
// playbackSpeed on the film in data/clip-jobs.json through the lab (PUT /api/clip-speed, tools/clip-speed.ts) and reads the
// bank again, so the stills here play at it at once. In the game the film goes at that speed times the round's tempo, the
// tempo never past 2× (src/game-film.ts filmRate). Not for a rest or talk film, which always go as filmed, and never in the
// online copy.
import { useState } from "react";
import type { Take } from "../../../src/clip-graph.ts";
import { TEMPO_CHOICES, tempoWord } from "../../../src/composition.ts";
import { SegmentedControl, cn, useToast } from "@/components/ui";
import { useBank } from "@/lib/bank";
import { labUrl } from "@/lib/lab";
import { isSnapshot } from "@/lib/mode";

async function putSpeed(id: string, speed: number): Promise<void> {
  const response = await fetch(labUrl("api/clip-speed"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, speed }) });
  if (response.ok) return;
  let error = "";
  try {
    error = String((await response.json())?.error ?? "");
  } catch {}
  // An older lab server has no such address until it is restarted.
  throw new Error(error || (response.status === 404 ? "Labbservern behöver startas om för att kunna spara farten." : `Farten kunde inte sparas (${response.status}).`));
}

export function ClipSpeed({ take, name, className }: { take: Take; name: string; className?: string }) {
  const { reload } = useBank();
  const toast = useToast();
  const [saving, setSaving] = useState<number | null>(null);
  if (isSnapshot || take.kind === "IDLE") return null;
  const choose = async (speed: number) => {
    if (saving !== null || speed === take.speed) return;
    setSaving(speed);
    try {
      await putSpeed(take.id, speed);
      await reload();
      toast({ tone: "ok", title: `${name}: fart ${tempoWord(speed)} · sparat`, detail: speed === 1 ? "Filmen går som filmat." : "Så går filmen från nu, här och i spelet." });
    } catch (error) {
      toast({ tone: "bad", title: "Farten sparades inte", detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(null);
    }
  };
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-dim", className)} title="Filmens egen fart: så går den här och i spelet. 1× är som filmat.">
      Fart
      <SegmentedControl size="sm" label={`Fart för ${name}`} value={saving ?? take.speed} disabled={saving !== null} onChange={(speed) => void choose(speed)} options={TEMPO_CHOICES.map((c) => ({ value: c, label: tempoWord(c) }))} />
    </span>
  );
}
