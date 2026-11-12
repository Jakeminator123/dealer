"use client";

// The cards' bend and gloss. They are no keys of the scene: each card has its own in Jakob's placement plan
// (placements/default.json, targets[id].material, read by the rendered cards in src/scene3d-deal.ts), and the old lab sets
// them "to all cards" (src/lab-ui.ts). Here two sliders set all sixteen at once. The plan is his file: it is written only
// when he presses "Spara till planen" and confirms, through /api/placements against the revision read, and the game reads
// the same plan. The scene shows a change before it is saved only when it hands out the plan it was built with (a third
// argument to SceneCanvas's onReady); without that the scene is built again after the save, to show it.
import { Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TARGETS, type PlacementPlan } from "../../../src/placement-model.ts";
import { asApiError, getPlacements } from "../../lib/api.ts";
import { decimal } from "../../lib/scene-keys.ts";
import { Button, Dialog, Slider, useToast } from "../ui";
import { KeyRow } from "./KeyControl";
import { cardLookOf, savePlan, withCardLook, type CardLook } from "./presetApi.ts";

export type CardMaterialState = ReturnType<typeof useCardMaterial>;

const same = (a: CardLook, b: CardLook) => Math.abs(a.bend - b.bend) < 1e-9 && Math.abs(a.gloss - b.gloss) < 1e-9;

export function useCardMaterial({ live, onSaved }: { live: PlacementPlan | null; onSaved: () => void }) {
  const [saved, setSaved] = useState<{ plan: PlacementPlan; revision: string } | null>(null);
  const [look, setLook] = useState<CardLook | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  const read = useCallback(async () => {
    try {
      const p = await getPlacements();
      setSaved({ plan: p.plan, revision: p.revision });
      setLook(cardLookOf(p.plan).look);
      setFault(null);
    } catch (error) {
      setFault(asApiError(error, "Placeringsplanen").message);
    }
  }, []);
  useEffect(() => {
    // the plan is read once when the view opens; a save or a conflict reads it again
    void read();
  }, [read]);

  // The scene's own plan object, when it hands it out: the cards take the new values at their next frame.
  useEffect(() => {
    if (!live || !look) return;
    for (const id of TARGETS) if (live.targets[id]) live.targets[id].material = { bend: look.bend, gloss: look.gloss };
  }, [live, look]);

  const facts = saved ? cardLookOf(saved.plan) : null;
  const changed = !!(look && facts && (!facts.even || !same(look, facts.look)));
  return {
    look,
    facts,
    fault,
    changed,
    /** The plan as saved, for the card places of a round; null before it is read. */
    plan: saved?.plan ?? null,
    /** The plan has been read, or could not be. */
    read: saved !== null || fault !== null,
    preview: !!live,
    set: (patch: Partial<CardLook>) => setLook((was) => (was ? { ...was, ...patch } : was)),
    undo: () => facts && setLook(facts.look),
    /** Writes bend and gloss to all sixteen cards of the plan. Only from his confirmed click. */
    async save() {
      if (!saved || !look) return;
      try {
        const next = await savePlan(withCardLook(saved.plan, look), saved.revision);
        setSaved({ plan: next.plan, revision: next.revision });
        setLook(cardLookOf(next.plan).look);
        onSavedRef.current();
      } catch (error) {
        const e = asApiError(error, "Placeringsplanen");
        if (e.kind === "conflict") void read();
        throw e;
      }
    },
  };
}

const range = (r: [number, number], digits: number) => (r[0] === r[1] ? decimal(r[0], digits) : `${decimal(r[0], digits)}–${decimal(r[1], digits)}`);

export function CardMaterial({ state, cardsOn, canSave }: { state: CardMaterialState; cardsOn: boolean; canSave: boolean }) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const { look, facts, fault } = state;
  if (fault) return <p className="py-2 text-sm text-[#ef8b8b]">{fault}</p>;
  if (!look || !facts) return <p className="py-2 text-sm text-faint">Läser placeringsplanen…</p>;
  const before = `böjning ${range(facts.range.bend, 3)}, glans ${range(facts.range.gloss, 2)}`;
  return (
    <div className="flex flex-col">
      <KeyRow
        label="Kortens böjning"
        help="Hur mycket ett kort i handen böjer sig. Samma värde på alla 16 kort i placeringsplanen."
        differs={look.bend !== facts.look.bend}
        value={decimal(look.bend, 3)}
        onReset={() => state.set({ bend: facts.look.bend })}
        resetLabel={`Tillbaka till planens: ${decimal(facts.look.bend, 3)}`}
      >
        <Slider value={look.bend} min={0} max={0.18} step={0.005} format={null} aria-label="Kortens böjning" onChange={(bend) => state.set({ bend })} />
      </KeyRow>
      <KeyRow
        label="Kortens glans"
        help="Kortens blanka yta mot rummets ljus. Samma värde på alla 16 kort i placeringsplanen."
        differs={look.gloss !== facts.look.gloss}
        value={decimal(look.gloss, 2)}
        onReset={() => state.set({ gloss: facts.look.gloss })}
        resetLabel={`Tillbaka till planens: ${decimal(facts.look.gloss, 2)}`}
      >
        <Slider value={look.gloss} min={0} max={1} step={0.01} format={null} aria-label="Kortens glans" onChange={(gloss) => state.set({ gloss })} />
      </KeyRow>
      <div className="flex flex-col gap-2 py-2 pl-3.5">
        <p className="text-xs text-faint">
          I planen nu: {before}
          {facts.even ? "" : " (olika per kort)"}.{" "}
          {!cardsOn ? "Syns med Renderade kort på. " : ""}
          {state.preview ? "" : "Scenen visar ändringen först när den är sparad."}
        </p>
        {canSave ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={<Save />} disabled={!state.changed} onClick={() => setAsking(true)}>
              Spara till planen
            </Button>
            {state.changed ? (
              <Button size="sm" variant="quiet" onClick={state.undo}>
                Ångra
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="Spara kortens material i planen?"
        description="Placeringsplanen är din fil, och spelet läser samma plan: korten ändras där också."
        footer={
          <>
            <Button variant="quiet" onClick={() => setAsking(false)}>
              Avbryt
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await state.save();
                  toast({ tone: "ok", title: "Sparat i placeringsplanen", detail: `Alla 16 kort: böjning ${decimal(look.bend, 3)}, glans ${decimal(look.gloss, 2)}` });
                  setAsking(false);
                } catch (error) {
                  toast({ tone: "bad", title: "Planen sparades inte", detail: asApiError(error).message });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Spara
            </Button>
          </>
        }
      >
        <p>
          Alla 16 kort får böjning <b className="tabular-nums">{decimal(look.bend, 3)}</b> och glans <b className="tabular-nums">{decimal(look.gloss, 2)}</b>.
        </p>
        <p className="mt-1 text-dim">Förut: {before}. Vill du tillbaka sätter du de värdena och sparar igen.</p>
      </Dialog>
    </div>
  );
}
