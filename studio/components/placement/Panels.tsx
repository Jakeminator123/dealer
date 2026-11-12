"use client";

// The inspector's panels for the chosen place: Plats (where it lies and the card's three measures: riktning, lutning,
// perspektiv), Rörelse (how the dealer takes, turns and lays it) and Bordet (what holds for every card: the flat table, one
// size for all, the files). Every change goes to the draft as one step (a slider's drag is one step); nothing is saved here.
import { Crosshair, Download, Grid2x2, Play, RotateCcw, Square, Upload, Users } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  CARD_SCALE, PLANE_HEADINGS, PLAYER_TARGETS, SHOE, TARGETS, TECHNIQUES, applyTechnique, copyChoices, dealerAngle, editIntent, editPlace, otherHand,
  planQuad, resetPlace, scaleCards, setTableProjection, snapPlace, straightenPlayers, techniqueOf, toPixels,
  type Intent, type Place, type PlacementPlan, type Technique, type View,
} from "../../../src/placement-model.ts";
import { VIEW_WORD, decimal, handWord, motionSteps, placeCode, quadSize } from "../../lib/placement.ts";
import { DRAFT_FILE, draftText, planeComparison, planeFile, readDraftText } from "../../lib/placement-files.ts";
import { Button, SegmentedControl, Select, Slider, Switch, useToast } from "../ui";
import { cn } from "../ui/cn";
import { NumberField } from "./NumberField";
import { draftActions } from "./useDraft.ts";

// ── pieces ──
export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
/** A slider's drag (or a run of its keys) is one step for Ångra. */
function OneStep({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const start = () => {
    if (disabled) return;
    draftActions.begin();
    window.addEventListener("pointerup", () => draftActions.end(), { once: true });
  };
  return (
    <div onPointerDownCapture={start} onKeyDownCapture={() => !disabled && draftActions.begin()} onKeyUpCapture={() => draftActions.end()} onBlurCapture={() => draftActions.end()}>
      {children}
    </div>
  );
}
const swatch = (colour: string) => <span aria-hidden className="inline-block size-2.5 rounded-[2px] border border-black/30" style={{ background: colour }} />;
const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Plats ──
export function PlacePanel({ plan, view, id, editable, onTable }: { plan: PlacementPlan; view: View; id: Place; editable: boolean; onTable: () => void }) {
  const [snap, setSnap] = useState("10");
  const off = !editable;
  const edit = (fn: (p: PlacementPlan) => PlacementPlan) => draftActions.edit(fn);
  const point = id === SHOE ? plan.shoe[view] : plan.targets[id].geometry[view];
  const px = toPixels(point, view);
  const place = (
    <Section title="Läge" aside={<span className="text-xs tabular-nums text-faint">{`${Math.round(px.x)}, ${Math.round(px.y)} px`}</span>}>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Från vänster" unit="%" value={point.u * 100} digits={2} min={0} max={100} step={0.1} disabled={off} onCommit={(n) => edit((p) => editPlace(p, id, view, { u: n / 100 }))} />
        <NumberField label="Från botten" unit="%" value={point.v * 100} digits={2} min={0} max={100} step={0.1} disabled={off} onCommit={(n) => edit((p) => editPlace(p, id, view, { v: n / 100 }))} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Snäpp till" size="sm" value={snap} onChange={setSnap} options={[5, 10, 20].map((n) => ({ value: String(n), label: `${n} px` }))} className="w-24 shrink-0" disabled={off} />
        <Button size="sm" icon={<Grid2x2 />} disabled={off} onClick={() => edit((p) => snapPlace(p, id, view, Number(snap)))}>
          {id === SHOE ? "Snäpp" : "Snäpp · 5°"}
        </Button>
        <Button size="sm" variant="quiet" icon={<RotateCcw />} disabled={off} onClick={() => edit((p) => resetPlace(p, id, view))} title="Platsen tillbaka till startförslaget i den här vyn" className="ml-auto">
          Startförslag
        </Button>
      </div>
    </Section>
  );
  if (id === SHOE) return place;

  const t = plan.targets[id];
  const g = t.geometry[view];
  const flat = plan.tableProjection?.mode === "flat";
  const shape = off || flat;
  const size = quadSize(planQuad(plan, id, view));
  return (
    <>
      <Section title="Sida vid landning">
        <SegmentedControl
          label="Sida vid landning"
          value={t.intent.endSide}
          disabled={off}
          onChange={(side) => edit((p) => editIntent(p, id, "endSide", side))}
          options={[
            { value: "BACK", label: "Stängt", icon: swatch("#ffff00") },
            { value: "FRONT", label: "Öppet", icon: swatch("#0000ff") },
          ]}
          className="self-start"
        />
      </Section>
      {place}
      <Section title="Kortets mått">
        {flat ? (
          <p className="text-xs text-[#f0b07a]">
            Plant bord: följer P4C1.{" "}
            <button type="button" onClick={onTable} className="underline decoration-dotted underline-offset-2 hover:text-ink">
              Bordet
            </button>
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <OneStep disabled={shape}>
            <Slider label="Riktning" value={g.angle} min={-180} max={180} step={1} format={(v) => `${Math.round(v)}°`} disabled={shape} onChange={(angle) => draftActions.move((p) => editPlace(p, id, view, { angle }))} />
          </OneStep>
          <div className="flex items-end gap-1.5">
            <NumberField label="Grader" unit="°" value={g.angle} digits={1} min={-180} max={180} step={1} disabled={shape} onCommit={(angle) => edit((p) => editPlace(p, id, view, { angle }))} className="w-24" />
            <Button size="sm" disabled={shape} onClick={() => edit((p) => editPlace(p, id, view, { angle: 0 }))}>
              0°
            </Button>
            <Button size="sm" disabled={shape} onClick={() => edit((p) => editPlace(p, id, view, { angle: g.angle + 90 }))}>
              +90°
            </Button>
            <Button size="sm" icon={<Crosshair />} disabled={shape} title="Rikta kortet mot mitten av dealerns två kort" onClick={() => edit((p) => editPlace(p, id, view, { angle: dealerAngle(p, id, view) }))}>
              Mot dealern
            </Button>
          </div>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-dim">Lutning</span>
          <span className="text-ink" title="På bordet ligger kortet plant">
            plant
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <OneStep disabled={shape}>
            <Slider label="Perspektiv" value={g.taper} min={0.4} max={1.6} step={0.01} format={(v) => `${Math.round(v * 100)} %`} disabled={shape} onChange={(taper) => draftActions.move((p) => editPlace(p, id, view, { taper }))} />
          </OneStep>
          <div className="flex items-end gap-1.5">
            <NumberField label="Bortre kant" unit="%" value={g.taper * 100} digits={0} min={40} max={160} step={1} disabled={shape} onCommit={(n) => edit((p) => editPlace(p, id, view, { taper: n / 100 }))} className="w-24" />
            <Button size="sm" icon={<Square />} disabled={shape} onClick={() => edit((p) => editPlace(p, id, view, { taper: 1 }))}>
              Rak · 100 %
            </Button>
          </div>
        </div>
      </Section>
      <Section title="Storlek" aside={<span className="text-xs tabular-nums text-faint">{size.text}</span>}>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Bredd" unit="%" value={g.width * 100} digits={2} min={0.5} max={25} step={0.1} disabled={shape} onCommit={(n) => edit((p) => editPlace(p, id, view, { width: n / 100 }))} />
          <NumberField label="Höjd" unit="%" value={g.height * 100} digits={2} min={0.5} max={25} step={0.1} disabled={shape} onCommit={(n) => edit((p) => editPlace(p, id, view, { height: n / 100 }))} />
        </div>
      </Section>
      <Section title="Kontroll">
        <Switch checked={g.reviewed} disabled={off} onChange={(reviewed) => edit((p) => editPlace(p, id, view, { reviewed }))} label={`Kontrollerad i ${VIEW_WORD[view]}`} />
      </Section>
    </>
  );
}

// ── Rörelse ──
const TECHNIQUE_WORDS: Record<Technique, string> = {
  "pinch-air": "Nyp och vänd i luften",
  "drag-place": "Släp och vänd vid platsen",
  "drag-closed": "Släp och lägg stängt",
};
export function MotionPanel({ plan, id, editable, playing, onPlay }: { plan: PlacementPlan; id: Place; editable: boolean; playing: boolean; onPlay: () => void }) {
  const toast = useToast();
  if (id === SHOE) return <p className="px-4 py-6 text-sm text-faint">Välj ett kort.</p>;
  const off = !editable;
  const i = plan.targets[id].intent;
  const technique = techniqueOf(i);
  const set = <K extends keyof Intent>(key: K, value: Intent[K]) => draftActions.edit((p) => editIntent(p, id, key, value));
  const way = motionSteps(id, i);
  const sides = [
    { value: "BACK" as const, label: "Stängt", icon: swatch("#ffff00") },
    { value: "FRONT" as const, label: "Öppet", icon: swatch("#0000ff") },
  ];
  return (
    <>
      <Section title="Teknik">
        <div className="flex flex-col gap-1.5">
          {(Object.keys(TECHNIQUES) as Technique[]).map((name) => (
            <Button key={name} size="sm" aria-pressed={technique === name} disabled={off} onClick={() => draftActions.edit((p) => ({ ...p, targets: { ...p.targets, [id]: { ...p.targets[id], intent: applyTechnique(p.targets[id].intent, name) } } }))} className="justify-start">
              {TECHNIQUE_WORDS[name]}
            </Button>
          ))}
        </div>
      </Section>
      <Section title="Val">
        <Row label="Hand som tar">
          <SegmentedControl size="sm" label="Hand som tar kortet" value={i.takeHand} disabled={off} onChange={(h) => set("takeHand", h)} options={[{ value: "LH", label: "Vänster" }, { value: "RH", label: "Höger" }]} />
        </Row>
        <Row label="Grepp vid skon">
          <SegmentedControl size="sm" label="Grepp vid skon" value={i.grip} disabled={off} onChange={(grip) => set("grip", grip)} options={[{ value: "PINCH", label: "A2.1 nyp" }, { value: "DRAG", label: "A2.2 hand över" }]} />
        </Row>
        <Row label="Vid upptag">
          <SegmentedControl size="sm" label="Sida vid upptag" value={i.startSide} disabled={off} onChange={(s) => set("startSide", s)} options={sides} />
        </Row>
        <Row label="Vid landning">
          <SegmentedControl size="sm" label="Sida vid landning" value={i.endSide} disabled={off} onChange={(s) => set("endSide", s)} options={sides} />
        </Row>
        <Switch checked={i.pass} disabled={off} onChange={(v) => set("pass", v)} label="Handbyte" />
        <Switch checked={i.turn} disabled={off} onChange={(v) => set("turn", v)} label="Vänd kortet" />
        <Row label="Vänds">
          <SegmentedControl size="sm" label="Var kortet vänds" value={i.turnAt} disabled={off || !i.turn} onChange={(v) => set("turnAt", v)} options={[{ value: "AIR", label: "I luften" }, { value: "PLACE", label: "Vid platsen" }]} />
        </Row>
        <Row label="Hand vid släpp">
          <span className="text-sm text-ink">{handWord(i.pass ? otherHand(i.takeHand) : i.takeHand).replace(/^./, (c) => c.toUpperCase())}</span>
        </Row>
      </Section>
      <Section
        title="Kortbanan"
        aside={
          <Button size="sm" variant={playing ? "secondary" : "quiet"} aria-pressed={playing} icon={<Play />} onClick={onPlay}>
            {playing ? "Stoppa" : "Spela"}
          </Button>
        }
      >
        <ol className="flex flex-wrap items-center gap-1" title={way.code} aria-label="Kortets väg">
          {way.steps.map((s, n) => (
            <li key={s.id} className="flex items-center gap-1">
              {n ? <span aria-hidden className="text-faint">→</span> : null}
              <span className="flex flex-col rounded-md border border-line-strong bg-raised px-2 py-1 leading-tight">
                <b className="text-xs font-semibold text-brass-hi">{s.label}</b>
                <span className="text-2xs text-dim">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Alla spelarkort">
        <Button
          size="sm"
          icon={<Users />}
          disabled={off}
          onClick={() => {
            draftActions.edit((p) => copyChoices(p, id, "intent", PLAYER_TARGETS));
            toast({ tone: "ok", title: `Rörelsen från ${placeCode(id)} gäller nu alla 14 spelarkort`, detail: "Dealerns två kort är orörda. Ångra tar tillbaka." });
          }}
          className="self-start"
        >
          Samma rörelse på alla 14
        </Button>
      </Section>
    </>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-dim">{label}</span>
      {children}
    </div>
  );
}

// ── Bordet ──
export function TablePanel({ plan, view, id, editable }: { plan: PlacementPlan; view: View; id: Place; editable: boolean }) {
  const toast = useToast();
  const off = !editable;
  const [factor, setFactor] = useState(1);
  const file = useRef<HTMLInputElement>(null);
  const projection = plan.tableProjection ?? { mode: "flat" as const, heading: 0 };
  const flat = projection.mode === "flat";
  const card = id === SHOE ? "P4.C2" : id;
  const now = quadSize(planQuad(plan, card, view)).text;
  const after = factor !== 1 ? quadSize(planQuad(scaleCards(plan, view, factor).plan, card, view)).text : null;
  const checked = TARGETS.filter((t) => plan.targets[t].geometry[view].reviewed).length;
  return (
    <>
      <Section title="Bordet" aside={<span className="text-xs text-faint">{`${checked} av 16 kontrollerade · ${VIEW_WORD[view]}`}</span>}>
        <Switch
          checked={flat}
          disabled={off}
          onChange={(on) => draftActions.edit((p) => setTableProjection(p, { mode: on ? "flat" : "individual", heading: projection.heading }))}
          label="Plant bord"
          hint={flat ? "Alla kort i P4C1:s form. Kameran är inte kalibrerad." : "Varje kort med egen riktning och perspektiv."}
        />
        {flat ? (
          <div className="flex items-end gap-2">
            <Select
              label="Bordets riktning"
              size="sm"
              value={String(projection.heading)}
              disabled={off}
              onChange={(v) => draftActions.edit((p) => setTableProjection(p, { mode: "flat", heading: Number(v) }))}
              options={PLANE_HEADINGS.map((h) => ({ value: String(h), label: h === 0 ? "0° · rak" : `${decimal(h, 0)}°` }))}
              className="w-32"
            />
            <Button size="sm" variant="quiet" icon={<Download />} onClick={() => download(planeFile(view), JSON.stringify(planeComparison(plan, view), null, 2) + "\n")}>
              Jämförelse
            </Button>
          </div>
        ) : null}
        <p className="text-2xs text-faint">Byte av bord avmarkerar alla platser.</p>
      </Section>
      <Section title="Kortstorlek, alla kort" aside={<span className="text-xs tabular-nums text-faint">{VIEW_WORD[view]}</span>}>
        <div className="flex items-end gap-2">
          <NumberField label="Faktor" value={factor} digits={2} min={CARD_SCALE.min} max={CARD_SCALE.max} step={CARD_SCALE.step} disabled={off} onCommit={setFactor} className="w-24" />
          <Button
            size="sm"
            disabled={off || factor === 1}
            onClick={() => {
              const result = scaleCards(plan, view, factor);
              const before = now;
              draftActions.edit(() => result.plan);
              setFactor(1);
              toast({
                tone: "ok",
                title: `Alla 16 kort ×${decimal(factor, 2)} i ${VIEW_WORD[view]}`,
                detail: `${placeCode(card)}: ${before} → ${quadSize(planQuad(result.plan, card, view)).text}.${result.limited.length ? ` ${result.limited.map(placeCode).join(", ")} ${factor > 1 ? "nådde kanten eller största storlek" : "nådde minsta storlek"}.` : ""} Ångra tar tillbaka.`,
              });
            }}
          >
            Skala alla
          </Button>
        </div>
        <p className="text-xs tabular-nums text-dim">
          {placeCode(card)} nu {now}
          {after ? ` · efter ${after}` : ""}
          {flat ? " · plant bord: P4C1:s storlek" : ""}
        </p>
      </Section>
      <Section title="Spelarkorten">
        <Button size="sm" disabled={off || flat} onClick={() => draftActions.edit((p) => straightenPlayers(p, view))} className="self-start">
          Riktning 0° på alla 14
        </Button>
      </Section>
      <Section title="Utkastet som fil">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Download />} onClick={() => download(DRAFT_FILE, draftText(plan))}>
            Spara som fil
          </Button>
          <Button size="sm" icon={<Upload />} disabled={off} onClick={() => file.current?.click()}>
            Läs in fil
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const next = readDraftText(await f.text(), f.size);
                draftActions.replace(next);
                toast({ tone: "ok", title: "Filen är inläst som utkast", detail: "Inget på disk ändras förrän du sparar." });
              } catch (error) {
                toast({ tone: "bad", title: "Filen lästes inte in", detail: (error as Error).message });
              }
            }}
          />
        </div>
      </Section>
    </>
  );
}
