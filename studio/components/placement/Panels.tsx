"use client";

// The column's panels for the chosen place in Bordet's Kortplan. Step 1, Var kortet landar: PlacePanel (where the card lies,
// and whether it is checked; the card's own direction and shape only where the table is card by card, since on the real
// perspective the lens draws every card) and TablePanel (what holds for every card: the real perspective, the table's
// direction, its one Perspektiv). Step 2, Hur det kommer dit: MotionPanel (handbyte, how the card lands, the one line of what
// the recipe does with it, the card's way; folded under "Kortplanens avsikt" where the doll is the card's way). A real card has no size of its own here (Jakob 2026-11-17: "kör vi 1.0 så kanske
// det är bra"; its size is adjusted only in Efterarbete). Every change goes to the draft as one step (a slider's drag is one
// step); nothing is saved here, and the plan keeps every field it has, also those no panel shows.
import { Crosshair, Grid2x2, RotateCcw, Square, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { planTaper, throughLens } from "../../../src/card-plan.ts";
import {
  CARD_COLOUR, PLANE_HEADINGS, PLAYER_TARGETS, SHOE, TABLE_PERSPECTIVE, TARGETS, copyChoices, dealerAngle, editIntent, editPlace, resetPlace, setTablePerspective, setTableProjection, snapPlace, straightenPlayers,
  type Intent, type Place, type PlacementPlan,
} from "../../../src/placement-model.ts";
import { PLAN_VIEW, decimal, motionSteps, placeCode } from "../../lib/placement.ts";
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
const SIDES = [
  { value: "BACK" as const, label: "Stängt", icon: swatch(CARD_COLOUR.BACK) },
  { value: "FRONT" as const, label: "Öppet", icon: swatch(CARD_COLOUR.FRONT) },
];

// ── Bordets perspektiv ──
// One number for the whole plan on the real perspective, and only the cards' shape (src/card-plan.ts planShape; Jakob
// 2026-11-17: "Om alla kort är exakt lika stora, blir de väldigt tvådimensionella", and 2026-11-18 when a lens also shrank the
// dealer's cards: "Kortet i skon är större än korten som ligger närmare oss"): how much narrower a card's far edge is drawn,
// as the share at seat 4, from a real card's own 96 % down to 80 %. Every card keeps its real size and place. "Din plan" is
// seat 4's own stored taper (87 % since 11 Nov), which the plan draws with when no value is saved.
const percent = (v: number) => `${Math.round(v * 100)} %`;
function TableDepth({ plan, off }: { plan: PlacementPlan; off: boolean }) {
  const value = planTaper(plan);
  const span = TABLE_PERSPECTIVE.max - TABLE_PERSPECTIVE.min;
  const own = planTaper({ targets: plan.targets, tableProjection: undefined });
  const marks = [
    { value: own, label: "Din plan", set: null },
    { value: TABLE_PERSPECTIVE.max, label: "Riktigt kort", set: TABLE_PERSPECTIVE.max },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <OneStep disabled={off}>
        <Slider label="Perspektiv, alla kort" value={value} min={TABLE_PERSPECTIVE.min} max={TABLE_PERSPECTIVE.max} step={TABLE_PERSPECTIVE.step} format={percent} disabled={off} onChange={(v) => draftActions.move((p) => setTablePerspective(p, v))} />
      </OneStep>
      <div aria-hidden className="relative mx-[7px] -mt-1 h-1.5">
        {marks.map((m) => (
          <span key={m.label} className="absolute top-0 h-1.5 w-px bg-faint" style={{ left: `${((m.value - TABLE_PERSPECTIVE.min) / span) * 100}%` }} />
        ))}
      </div>
      <div className="relative mx-[7px] h-4">
        {marks.map((m) => (
          <button
            key={m.label}
            type="button"
            disabled={off}
            aria-pressed={Math.abs(value - m.value) < 0.005}
            onClick={() => draftActions.edit((p) => setTablePerspective(p, m.set))}
            // under its tick: the real camera's at the right end, ending there; the others starting just left of theirs
            style={m.value >= TABLE_PERSPECTIVE.max ? { right: "-7px" } : { left: `calc(${((m.value - TABLE_PERSPECTIVE.min) / span) * 100}% - 0.75rem)` }}
            className="absolute top-0 whitespace-nowrap rounded-sm px-1 text-2xs text-dim underline decoration-dotted underline-offset-2 hover:text-ink disabled:opacity-45 aria-pressed:text-ink aria-pressed:no-underline"
          >
            {`${m.label} ${percent(m.value)}`}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 1: the place ──
export function PlacePanel({ plan, id, editable }: { plan: PlacementPlan; id: Place; editable: boolean }) {
  const view = PLAN_VIEW;
  const [snap, setSnap] = useState("10");
  const off = !editable;
  const edit = (fn: (p: PlacementPlan) => PlacementPlan) => draftActions.edit(fn);
  const point = id === SHOE ? plan.shoe[view] : plan.targets[id].geometry[view];
  const place = (
    <Section title="Läge">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Från vänster" unit="%" value={point.u * 100} digits={2} min={0} max={100} step={0.1} disabled={off} onCommit={(n) => edit((p) => editPlace(p, id, view, { u: n / 100 }))} />
        <NumberField label="Från botten" unit="%" value={point.v * 100} digits={2} min={0} max={100} step={0.1} disabled={off} onCommit={(n) => edit((p) => editPlace(p, id, view, { v: n / 100 }))} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Snäpp till" size="sm" value={snap} onChange={setSnap} options={[5, 10, 20].map((n) => ({ value: String(n), label: `${n} px` }))} className="w-24 shrink-0" disabled={off} />
        <Button size="sm" icon={<Grid2x2 />} disabled={off} onClick={() => edit((p) => snapPlace(p, id, view, Number(snap)))}>
          {id === SHOE ? "Snäpp" : "Snäpp · 5°"}
        </Button>
        <Button size="sm" variant="quiet" icon={<RotateCcw />} disabled={off} onClick={() => edit((p) => resetPlace(p, id, view))} title="Platsen tillbaka till startförslaget" className="ml-auto">
          Startförslag
        </Button>
      </div>
    </Section>
  );
  if (id === SHOE) return place;

  const g = plan.targets[id].geometry[view];
  // On the real perspective the lens gives every card its direction, shape and size: nothing of the card's own is shown.
  const lens = throughLens(plan, view);
  return (
    <>
      {place}
      {lens ? null : (
        <Section title="Kortets riktning och form">
          <OneStep disabled={off}>
            <Slider label="Riktning" value={g.angle} min={-180} max={180} step={1} format={(v) => `${Math.round(v)}°`} disabled={off} onChange={(angle) => draftActions.move((p) => editPlace(p, id, view, { angle }))} />
          </OneStep>
          <div className="flex flex-wrap items-end gap-1.5">
            <NumberField label="Grader" unit="°" value={g.angle} digits={1} min={-180} max={180} step={1} disabled={off} onCommit={(angle) => edit((p) => editPlace(p, id, view, { angle }))} className="w-24" />
            <Button size="sm" disabled={off} onClick={() => edit((p) => editPlace(p, id, view, { angle: 0 }))}>
              0°
            </Button>
            <Button size="sm" disabled={off} onClick={() => edit((p) => editPlace(p, id, view, { angle: g.angle + 90 }))}>
              +90°
            </Button>
            <Button size="sm" icon={<Crosshair />} disabled={off} title="Rikta kortet mot mitten av dealerns två kort" onClick={() => edit((p) => editPlace(p, id, view, { angle: dealerAngle(p, id, view) }))}>
              Mot dealern
            </Button>
          </div>
          <OneStep disabled={off}>
            <Slider label="Perspektiv" value={g.taper} min={0.4} max={1.6} step={0.01} format={(v) => `${Math.round(v * 100)} %`} disabled={off} onChange={(taper) => draftActions.move((p) => editPlace(p, id, view, { taper }))} />
          </OneStep>
          <div className="flex items-end gap-1.5">
            <NumberField label="Bortre kant" unit="%" value={g.taper * 100} digits={0} min={40} max={160} step={1} disabled={off} onCommit={(n) => edit((p) => editPlace(p, id, view, { taper: n / 100 }))} className="w-24" />
            <Button size="sm" icon={<Square />} disabled={off} onClick={() => edit((p) => editPlace(p, id, view, { taper: 1 }))}>
              Rak · 100 %
            </Button>
          </div>
        </Section>
      )}
      <Section title="Kontroll">
        <Switch checked={g.reviewed} disabled={off} onChange={(reviewed) => edit((p) => editPlace(p, id, view, { reviewed }))} label="Kontrollerad" />
      </Section>
    </>
  );
}

// ── Step 2: the way there ──
/**
 * What steers the card's way: handbyte and how it lands. The plan's other motion fields (the grip, the hand that takes, the
 * sides at the shoe, the turn) stay in the plan as they are, but choose nothing: the anchor and its recipe decide them
 * (lib/bordet.ts motionLine, which `line` is). `anchor`: the anchor the card's films go from ("A2.3"), named on the way.
 * `lit`: the step the card path shows now, while it plays this card ("Spela kortbanan" over the picture); null otherwise.
 * `fold`: where the doll is the card's way (Jakob 2026-11-24: step 2 "ger allt dubbelt"), the panel is folded under
 * "Kortplanens avsikt" with one line of what it says, "closed" or "open" to begin with; without it the panel stands as it is.
 */
export function MotionPanel({ plan, id, editable, lit, line, anchor, fold }: { plan: PlacementPlan; id: Place; editable: boolean; lit: string | null; line: string | null; anchor: string; fold?: "closed" | "open" }) {
  const toast = useToast();
  if (id === SHOE) return null;
  const off = !editable;
  const i = plan.targets[id].intent;
  const set = <K extends keyof Intent>(key: K, value: Intent[K]) => draftActions.edit((p) => editIntent(p, id, key, value));
  const way = motionSteps(id, i, anchor);
  const panel = (
    <>
      <Section title="Det som styr">
        <Switch checked={i.pass} disabled={off} onChange={(v) => set("pass", v)} label="Handbyte" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-dim">Vid landning</span>
          <SegmentedControl size="sm" label="Sida vid landning" value={i.endSide} disabled={off} onChange={(s) => set("endSide", s)} options={SIDES} />
        </div>
        {line ? (
          <p data-motion-line className="rounded-md border border-line bg-raised/40 px-3 py-2 text-sm leading-5 text-ink">
            {line}
          </p>
        ) : null}
      </Section>
      {/* The steps of the card's way; "Spela kortbanan" over the picture plays them and lights the one it shows. */}
      <Section title="Kortbanan" aside={lit ? <span className="text-2xs text-[#d3b4ff]">spelar</span> : null}>
        <ol className="flex flex-wrap items-center gap-1" aria-label="Kortets väg">
          {way.steps.map((s, n) => (
            <li key={s.id} className="flex items-center gap-1">
              {n ? <span aria-hidden className="text-faint">→</span> : null}
              <span data-step={s.id} aria-current={lit === s.id ? "step" : undefined} className={cn("flex flex-col rounded-md border px-2 py-1 leading-tight", lit === s.id ? "border-[#d3b4ff] bg-[#d3b4ff]/18 ring-1 ring-[#d3b4ff]/60" : "border-line-strong bg-raised")}>
                <b className="text-xs font-semibold text-brass-hi">{s.label}</b>
                <span className="text-2xs text-dim">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>
      {/* copying a dealer's card to the players would make every player's card land as the hole card: players only */}
      {PLAYER_TARGETS.includes(id) ? (
      <Section title="Alla spelarkort">
        <Button
          size="sm"
          icon={<Users />}
          disabled={off}
          onClick={() => {
            draftActions.edit((p) => copyChoices(p, id, "intent", PLAYER_TARGETS));
            toast({ tone: "ok", title: `Rörelsen från ${placeCode(id)} gäller nu alla 14 spelarkort`, detail: "Dealerns tre kort är orörda. Ångra tar tillbaka." });
          }}
          className="self-start"
        >
          Samma rörelse på alla 14
        </Button>
      </Section>
      ) : null}
    </>
  );
  if (!fold) return panel;
  return (
    <details key={id} data-plan-intent open={fold === "open"}>
      <summary className="cursor-pointer px-4 py-2.5 text-sm text-ink hover:bg-raised/40">
        Kortplanens avsikt <span className="text-xs text-dim">· {i.pass ? "handbyte" : "utan handbyte"} · {i.endSide === "BACK" ? "stängt" : "öppet"}</span>
      </summary>
      {panel}
    </details>
  );
}

// ── Step 1: the table, for every card ──
export function TablePanel({ plan, editable }: { plan: PlacementPlan; editable: boolean }) {
  const view = PLAN_VIEW;
  const off = !editable;
  const projection = plan.tableProjection ?? { mode: "flat" as const, heading: 0 };
  const flat = projection.mode === "flat";
  const lens = throughLens(plan, view);
  const checked = TARGETS.filter((t) => plan.targets[t].geometry[view].reviewed).length;
  return (
    <>
      <Section title="Bordet" aside={<span className="text-xs text-faint">{`${checked} av ${TARGETS.length} kontrollerade`}</span>}>
        <Switch
          checked={flat}
          disabled={off}
          onChange={(on) => draftActions.edit((p) => setTableProjection(p, { mode: on ? "flat" : "individual", heading: projection.heading }))}
          label="Verkligt perspektiv"
          hint={flat ? "Alla kort i verklig storlek genom samma kamera som dealern." : "Varje kort med egen riktning och form."}
        />
        {flat ? (
          <Select
            label="Bordets riktning"
            size="sm"
            value={String(projection.heading)}
            disabled={off}
            onChange={(v) => draftActions.edit((p) => setTableProjection(p, { mode: "flat", heading: Number(v) }))}
            options={PLANE_HEADINGS.map((h) => ({ value: String(h), label: h === 0 ? "0° · rak" : `${decimal(h, 0)}°` }))}
            className="w-32"
          />
        ) : null}
        {lens ? <TableDepth plan={plan} off={off} /> : null}
        <p className="text-2xs text-faint">Slår du om Verkligt perspektiv eller byter riktning blir alla platser okontrollerade igen.</p>
      </Section>
      {flat ? null : (
        <Section title="Spelarkorten">
          <Button size="sm" disabled={off} onClick={() => draftActions.edit((p) => straightenPlayers(p, view))} className="self-start">
            Riktning 0° på alla 14
          </Button>
        </Section>
      )}
    </>
  );
}
