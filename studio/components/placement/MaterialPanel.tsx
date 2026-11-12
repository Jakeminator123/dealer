"use client";

// Material: the chosen card's bend and gloss in the plan (targets[id].material), with the card material study's 3D card to
// see them on (materials/source/src/card-material-study.ts, read from the lab server like the scene). The study's card is a
// preview: its side, value and landing are not saved. The value chosen here is also the face the open cards show on the
// picture. "Alla 16 kort" copies this card's material to every card, as the old tab did.
import { ArrowDownToLine, ArrowUpFromLine, Layers } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CARD_RANKS, CARD_SUITS } from "../../../src/card-overlay.ts";
import { SHOE, TARGETS, copyChoices, editMaterial, type Place, type PlacementPlan } from "../../../src/placement-model.ts";
import { labModule } from "../../lib/lab.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { decimal, placeCode } from "../../lib/placement.ts";
import { Button, SegmentedControl, Select, Slider, useToast } from "../ui";
import type { Face } from "./cardLayer.ts";
import { NumberField } from "./NumberField";
import { Section } from "./Panels";
import { draftActions } from "./useDraft.ts";

type Study = typeof import("../../../materials/source/src/card-material-study.ts");
type Controller = ReturnType<Study["mountCardMaterialStudy"]>;
export const SUIT_WORDS: Record<string, string> = { spades: "Spader", hearts: "Hjärter", diamonds: "Ruter", clubs: "Klöver" };

/** The study's 3D card. It wants its own controls by id; they are here, hidden, and driven through its controller. */
function Preview({ bend, gloss, side, face, onController }: { bend: number; gloss: number; side: "front" | "back"; face: Face; onController: (c: Controller | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<Controller | null>(null);
  const [fault, setFault] = useState(false);
  const told = useRef(onController);
  told.current = onController;
  useEffect(() => {
    let c: Controller | null = null;
    let gone = false;
    labModule<Study>("materials/source/src/card-material-study")
      .then((study) => {
        if (gone || !host.current) return;
        c = study.mountCardMaterialStudy(host.current);
        setController(c);
        told.current(c);
      })
      .catch(() => setFault(true));
    return () => {
      gone = true;
      c?.dispose();
      told.current(null);
    };
  }, []);
  useEffect(() => controller?.setBend(bend), [controller, bend]);
  useEffect(() => controller?.setGloss(gloss), [controller, gloss]);
  useEffect(() => controller?.showSide(side), [controller, side]);
  useEffect(() => controller?.setCard(face as Parameters<Controller["setCard"]>[0]), [controller, face]);
  return (
    <div ref={host} className="flex flex-col gap-1">
      <div id="cm-stage" className="relative h-[180px] overflow-hidden rounded-md border border-line bg-[#0d1416]">
        <canvas id="cm-canvas" aria-label="Kortets böjning och glans i 3D" className="block size-full" />
        {fault ? <p className="absolute inset-0 grid place-items-center text-xs text-faint">3D-kortet kunde inte starta här.</p> : null}
      </div>
      <output id="cm-status" className="min-h-4 text-2xs text-faint" aria-live="polite" />
      {/* the study's own controls, which it requires; the visible ones below drive it */}
      <div hidden>
        <select id="cm-rank" defaultValue="A">
          {CARD_RANKS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select id="cm-suit" defaultValue="spades">
          {CARD_SUITS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input id="cm-bend" type="range" min="0" max="0.18" step="0.005" defaultValue="0.07" />
        <input id="cm-gloss" type="range" min="0" max="1" step="0.01" defaultValue="0.35" />
        <button id="cm-front" type="button" />
        <button id="cm-back" type="button" />
        <button id="cm-land" type="button" />
        <button id="cm-lift" type="button" />
      </div>
    </div>
  );
}

export function MaterialPanel({ plan, id, editable, face, onFace }: { plan: PlacementPlan; id: Place; editable: boolean; face: Face; onFace: (face: Face) => void }) {
  const toast = useToast();
  const card = id === SHOE ? null : plan.targets[id];
  const [side, setSide] = useState<"front" | "back">(card?.intent.endSide === "BACK" ? "back" : "front");
  const [controller, setController] = useState<Controller | null>(null);
  const [phase, setPhase] = useState("air");
  useEffect(() => {
    if (card) setSide(card.intent.endSide === "BACK" ? "back" : "front");
  }, [id, card?.intent.endSide]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!controller) return;
    const read = setInterval(() => setPhase(controller.getState().phase), 200);
    return () => clearInterval(read);
  }, [controller]);
  if (!card) return <p className="px-4 py-6 text-sm text-faint">Välj ett kort.</p>;
  const off = !editable;
  const m = card.material;
  const start = () => {
    if (off) return;
    draftActions.begin();
    window.addEventListener("pointerup", () => draftActions.end(), { once: true });
  };
  return (
    <>
      <Section title={`Material · ${placeCode(id)}`}>
        <Preview bend={m.bend} gloss={m.gloss} side={side} face={face} onController={setController} />
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl size="sm" label="Sida i förhandsvisningen" value={side} onChange={setSide} options={[{ value: "front", label: "Framsida" }, { value: "back", label: "Baksida" }]} />
          <Button size="sm" variant="quiet" icon={<ArrowDownToLine />} disabled={!controller || phase !== "air"} onClick={() => controller?.land()}>
            Landa
          </Button>
          <Button size="sm" variant="quiet" icon={<ArrowUpFromLine />} disabled={!controller || phase !== "landed"} onClick={() => controller?.lift()}>
            Lyft
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Valör" size="sm" value={face.rank} onChange={(rank) => onFace({ ...face, rank })} options={CARD_RANKS.map((r) => ({ value: r, label: r }))} />
          <Select label="Färg" size="sm" value={face.suit} onChange={(suit) => onFace({ ...face, suit })} options={CARD_SUITS.map((s) => ({ value: s, label: SUIT_WORDS[s] }))} />
        </div>
      </Section>
      <Section title="I planen">
        <div onPointerDownCapture={start} className="flex flex-col gap-3">
          <Slider label="Böjning" value={m.bend} min={0} max={0.18} step={0.005} format={(v) => `${decimal((v * 180) / Math.PI, 1)}°`} disabled={off} onChange={(bend) => draftActions.move((p) => editMaterial(p, id, { bend }))} />
          <Slider label="Glans" value={m.gloss} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)} %`} disabled={off} onChange={(gloss) => draftActions.move((p) => editMaterial(p, id, { gloss }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Böjning" value={m.bend} digits={3} min={0} max={0.18} step={0.005} disabled={off} onCommit={(bend) => draftActions.edit((p) => editMaterial(p, id, { bend }))} />
          <NumberField label="Glans" unit="%" value={m.gloss * 100} digits={0} min={0} max={100} step={1} disabled={off} onCommit={(n) => draftActions.edit((p) => editMaterial(p, id, { gloss: n / 100 }))} />
        </div>
        <Button
          size="sm"
          icon={<Layers />}
          disabled={off}
          className="self-start"
          onClick={() => {
            draftActions.edit((p) => copyChoices(p, id, "material", TARGETS));
            toast({ tone: "ok", title: `Materialet från ${placeCode(id)} gäller nu alla 16 kort`, detail: `Böjning ${decimal(m.bend, 3)}, glans ${decimal(m.gloss, 2)}. Ångra tar tillbaka.` });
          }}
        >
          Samma material på alla 16
        </Button>
        {isSnapshot ? null : (
          <a href="/materials/markermaterial.html" className="text-xs text-brass hover:underline">
            SG-markerprovet ↗
          </a>
        )}
      </Section>
    </>
  );
}
