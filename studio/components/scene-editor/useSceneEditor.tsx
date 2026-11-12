"use client";

// const editor = useSceneEditor(firstLook): the scene editor of the Scen view (app/page.tsx), without a scene of its own.
// The view's stage builds the one scene and hands it here (editor.onScene); the editor drives that same object: every key
// of its state as a control (studio/lib/scene-keys.ts) in the panel, presets in the bar over the scene with basgrund, what
// the game shows today, as the baseline (a key that differs from it carries a brass dot and its own "återställ"), "Jämför
// med basgrund" (or hold B), the objects on the table and the cards' bend and gloss. Nothing here changes the game: a look
// reaches game.html only when Jakob has approved it and someone moves it there; "Spela i Casino" shows it there to try.
// The look travels in the address (address.ts): editor.lookText says it, and editor.ask takes a new one from outside.
// Saved: his own presets (data/scene-presets/, on his click) and, on a confirmed click, the cards' bend and gloss in his
// placement plan. In the online copy nothing is saved.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PlacementPlan } from "../../../src/placement-model.ts";
import type { RegisterRoom } from "../../../src/scene3d-room.ts";
import type { SceneState } from "../../../src/scene3d-view.ts";
import { asApiError, getRooms } from "../../lib/api.ts";
import { casinoAddress } from "../../lib/casino.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { placesOf } from "../../lib/rounds.ts";
import { BUILT_BLUR, sameValue, type GroupId, type SceneKey } from "../../lib/scene-keys.ts";
import { BASE, SHIPPED, differences, effective, isShipped, matchPreset, oldLabAddress, patchOf } from "../../lib/scene-presets.ts";
import type { Scene } from "../stage";
import { SegmentedControl, Skeleton, Switch, useToast } from "../ui";
import { askedPart, lookPart, type LookAsk } from "./address.ts";
import { CardMaterial, useCardMaterial } from "./CardMaterial";
import { ControlPanel, type Extra } from "./ControlPanel";
import { createExtras, type Extras, type ExtrasNote, type ExtrasState, type TrayModel } from "./extras.ts";
import { KeyRow } from "./KeyControl";
import { NotYet } from "./NotYet";
import { createPatcher } from "./patcher.ts";
import { PresetBar } from "./PresetBar";
import { deletePreset, listPresets, savePreset, type Preset } from "./presetApi.ts";
import { roomItems } from "./RoomGrid";

// What the mouse changes in the scene's state behind the page's back (SceneCanvas: drag, wheel, double click), and what the
// scene may set itself (a room it does not have becomes the salon; cards that cannot be read are switched off).
const PULLED: SceneKey[] = ["yaw", "pitch", "zoom", "dx", "dy", "dz", "sway", "room", "cards"];
// The objects as the game lays them (src/game-page.ts 201-221): Jakob's tray; the shoe is the film's; chips only with bets.
const GAME_EXTRAS: ExtrasState = { tray: "jakobs", shoe: false, chips: false };
const shipped = (): Preset[] => SHIPPED.map((p) => ({ ...p, shipped: true, revision: null }));
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !["checkbox", "radio", "button", "range"].includes(t.type)));

export type SceneEditor = ReturnType<typeof useSceneEditor>;

export function useSceneEditor(firstLook: () => LookAsk) {
  const toast = useToast();

  // ── the look asked for: the address, read once and again when it changes from outside (ask) ──
  const [asked, setAsked] = useState(firstLook);
  const [origin, setOrigin] = useState(asked.forval);
  const [needApply, setNeedApply] = useState(true);
  /** The address asked for another look (call it while rendering, as the address is read). */
  const ask = (next: LookAsk) => {
    setAsked(next);
    setOrigin(next.forval);
    setNeedApply(true);
  };

  // ── presets: the three that ship at once, the lab's list when it answers ──
  const [presets, setPresets] = useState<Preset[]>(shipped);
  const [presetsRead, setPresetsRead] = useState(false);
  const reloadPresets = useCallback(async () => {
    try {
      setPresets((await listPresets()).presets);
    } catch (error) {
      toast({ tone: "bad", title: "Förvalen kunde inte läsas", detail: asApiError(error).message });
    } finally {
      setPresetsRead(true);
    }
  }, [toast]);
  useEffect(() => {
    void reloadPresets();
  }, [reloadPresets]);
  const presetOf = useCallback((name: string) => presets.find((p) => p.name === name) ?? null, [presets]);

  // ── the rooms of the register ──
  const [register, setRegister] = useState<RegisterRoom[]>([]);
  useEffect(() => {
    let gone = false;
    getRooms().then(
      (r) => !gone && setRegister(r.rooms),
      () => {},
    );
    return () => {
      gone = true;
    };
  }, []);
  const rooms = useMemo(() => roomItems(register), [register]);
  const blurOf = useCallback((room: string) => register.find((r) => r.id === room)?.blur ?? BUILT_BLUR[room] ?? 11, [register]);

  // ── the scene, as the stage hands it over ──
  const sceneRef = useRef<Scene | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [defaults, setDefaults] = useState<SceneState | null>(null);
  const [live, setLive] = useState<PlacementPlan | null>(null);
  const [current, setCurrent] = useState<SceneState | null>(null);
  const [comparing, setComparing] = useState(false);
  const comparingRef = useRef(false);
  const patcher = useMemo(() => createPatcher(() => sceneRef.current), []);
  useEffect(() => () => patcher.dispose(), [patcher]);

  // What the scene is built with: the address over its shipped preset (one of his own is read from the lab first: until
  // then basgrund, and the address's keys wait for it).
  const shippedAsked = SHIPPED.find((p) => p.name === asked.forval);
  const initial: Partial<SceneState> = shippedAsked ? { ...shippedAsked.state, ...asked.patch } : { ...SHIPPED[0].state };

  const baseline = useMemo(() => (defaults ? effective(defaults, presetOf(BASE)?.state ?? SHIPPED[0].state) : null), [defaults, presetOf]);
  const originState = useMemo(() => (defaults ? effective(defaults, (presetOf(origin) ?? presetOf(BASE))?.state ?? {}) : null), [defaults, presetOf, origin]);
  const differ = useMemo(() => new Set(current && baseline ? differences(current, baseline) : []), [current, baseline]);
  const active = current && defaults ? (matchPreset(current, defaults, presets)?.name ?? null) : null;
  const changedFromOrigin = !!(current && originState && differences(current, originState).length);

  // The look the address asks for, once the scene is there and the preset it names is known.
  useEffect(() => {
    const s = sceneRef.current;
    if (!needApply || !s || !defaults || !(presetsRead || isShipped(origin))) return;
    let preset = presetOf(origin);
    if (!preset) {
      toast({ tone: "info", title: `Förvalet ${origin} finns inte`, detail: "Basgrunden visas i stället." });
      preset = presetOf(BASE);
    }
    const target = effective(effective(defaults, preset?.state ?? {}), asked.patch);
    patcher.now(patchOf(target, { ...s.state })); // the scene is told first; the panel follows it
    setCurrent(target);
    setOrigin(preset?.name ?? BASE);
    setNeedApply(false);
  }, [needApply, scene, defaults, presetsRead, origin, asked, presetOf, patcher, toast]);

  // What the mouse did to the scene comes back into the panel; keys still on their way to the scene are not read back.
  const pull = useCallback(() => {
    const s = sceneRef.current;
    if (!s || comparingRef.current) return;
    const pending = patcher.pending();
    setCurrent((was) => {
      if (!was) return was;
      let next: SceneState | null = null;
      for (const key of PULLED) {
        if (pending.has(key) || sameValue(s.state[key], was[key])) continue;
        next ??= { ...was };
        (next as Record<string, unknown>)[key] = s.state[key];
      }
      return next ?? was;
    });
  }, [patcher]);
  const pullFrame = useRef(0);
  const pullSoon = useCallback(() => {
    if (!pullFrame.current)
      pullFrame.current = requestAnimationFrame(() => {
        pullFrame.current = 0;
        pull();
      });
  }, [pull]);
  useEffect(() => () => cancelAnimationFrame(pullFrame.current), []);

  // ── changes ──
  const change = (key: SceneKey, value: unknown) => {
    const patch = { [key]: value } as Partial<SceneState>;
    if (key === "room") patch.blur = blurOf(String(value)); // each room with the blur that suits it, as the lab and the game do
    setCurrent((was) => (was ? { ...was, ...patch } : was));
    patcher.set(patch);
  };
  const pick = (name: string) => {
    const s = sceneRef.current;
    const preset = presetOf(name);
    if (!s || !defaults || !preset) return;
    const target = effective(defaults, preset.state);
    patcher.now(patchOf(target, { ...s.state }));
    setCurrent(target);
    setOrigin(name);
  };
  const compare = useCallback(
    (on: boolean) => {
      const s = sceneRef.current;
      if (on === comparingRef.current || !s || !current || !baseline) return;
      comparingRef.current = on;
      setComparing(on);
      // a cut, not the shimmer, when the room differs: the comparison is at once
      if (on) patcher.now({ ...patchOf(baseline, { ...s.state }), roomShift: "cut" });
      else {
        s.set({ ...patchOf(current, { ...s.state }), roomShift: "cut" });
        s.set({ roomShift: current.roomShift });
      }
    },
    [current, baseline, patcher],
  );
  // Hold B to see the baseline.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyB" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      compare(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyB") compare(false);
    };
    const leave = () => compare(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", leave);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", leave);
    };
  }, [compare]);

  // ── the objects on the table ──
  const [want, setWant] = useState<ExtrasState>(GAME_EXTRAS);
  const [note, setNote] = useState<ExtrasNote>(null);
  const extras = useRef<Extras | null>(null);
  useEffect(() => {
    if (!scene) return;
    const made = createExtras(scene, setNote);
    extras.current = made;
    return () => {
      made.dispose();
      if (extras.current === made) extras.current = null;
    };
  }, [scene]);
  useEffect(() => {
    void extras.current?.apply(want);
  }, [scene, want]);
  const chipGloss = current?.chipGloss;
  useEffect(() => {
    if (chipGloss !== undefined) extras.current?.gloss(chipGloss);
  }, [scene, chipGloss]);

  // ── the cards' material in the placement plan (its card places also tell the round how far a second card moves) ──
  const card = useCardMaterial({ live, onSaved: () => {} });
  const places = useMemo(() => placesOf(card.plan), [card.plan]);

  // ── saving ──
  const canSave = !isSnapshot;
  const saveAs = async (name: string, label: string, about: string, revision: string | null) => {
    if (!current || !defaults) return;
    await savePreset(name, { label, about, state: patchOf(current, defaults) }, revision);
    await reloadPresets();
    setOrigin(name);
    toast({ tone: "ok", title: `Sparat som ${label}`, detail: "Finns bland förvalen; adressen pekar på det." });
  };
  const remove = async (p: Preset) => {
    if (!p.revision) return;
    await deletePreset(p.name, p.revision);
    await reloadPresets();
    if (origin === p.name) setOrigin(BASE);
  };

  // ── what the panel shows beside the keys ──
  const trayModels = [
    { value: "byggd" as const, label: "Byggd", title: "Scenens eget markerbräde (reglaget Markerbräde)" },
    { value: "jakobs" as const, label: "Jakobs", title: "Jakobs bricka, som spelet lägger den" },
    { value: "huset" as const, label: "Husets marker", title: "Brickan med husets egna marker (prov)" },
  ];
  const extraRows: Partial<Record<GroupId, Extra[]>> = {
    bord: [
      {
        id: "tray-model",
        label: "Brickans modell",
        words: "bricka marker bräde tray jakobs huset",
        node: (
          <KeyRow
            label="Brickans modell"
            help="Brickan i bordet. Spelet lägger Jakobs; den och husets tar markerbrädets plats."
            differs={want.tray !== GAME_EXTRAS.tray}
            onReset={() => setWant({ ...want, tray: GAME_EXTRAS.tray })}
            resetLabel="Återställ till spelets: Jakobs"
          >
            <SegmentedControl size="sm" label="Brickans modell" value={want.tray} onChange={(tray: TrayModel) => setWant({ ...want, tray })} options={trayModels} />
            {note?.what === "tray" ? <p className="mt-1.5 text-xs text-[#f0b07a]">{note.text}</p> : null}
          </KeyRow>
        ),
      },
      {
        id: "shoe",
        label: "Sko i 3D",
        words: "sko shoe prov modell",
        node: (
          <KeyRow
            label="Sko i 3D"
            help="Prov: Jakobs skomodell står där filmens sko står, och filmens sko ritas inte. En hand som sträcks in över skon klipps."
            differs={want.shoe}
            control={<Switch size="sm" checked={want.shoe} onChange={(shoe) => setWant({ ...want, shoe })} aria-label="Sko i 3D" />}
          >
            {note?.what === "shoe" ? <p className="text-xs text-[#f0b07a]">{note.text}</p> : null}
          </KeyRow>
        ),
      },
    ],
    kort: [
      {
        id: "chips",
        label: "Insatser på bordet",
        words: "marker insatser chips glans",
        node: (
          <KeyRow
            label="Insatser på bordet"
            help="Lägger marker på plats 2, 4 och 6, så att markernas glans syns."
            differs={false}
            control={<Switch size="sm" checked={want.chips} onChange={(chips) => setWant({ ...want, chips })} aria-label="Insatser på bordet" />}
          >
            {note?.what === "chips" ? <p className="text-xs text-[#f0b07a]">{note.text}</p> : null}
          </KeyRow>
        ),
      },
      {
        id: "card-material",
        label: "Kortens böjning och glans",
        words: "kort böjning glans material plan",
        node: <CardMaterial state={card} cardsOn={!!current?.cards} canSave={canSave} />,
      },
    ],
  };

  const originPreset = presetOf(origin) ?? presetOf(BASE);
  const settled = !!(current && originState && !needApply);
  // The keys that differ from the preset the look started from: what a link carries beside the preset's name.
  const keys = settled ? patchOf(current!, originState!) : asked.patch;
  const forval = settled ? (originPreset?.name ?? BASE) : asked.forval;

  const bar = (
    <PresetBar
      presets={presets}
      active={active}
      origin={originPreset?.name ?? BASE}
      changed={changedFromOrigin}
      differ={current ? differ.size : null}
      canSave={canSave && !!current}
      comparing={comparing}
      onPick={pick}
      onSave={saveAs}
      onDelete={remove}
      onCompare={compare}
      onResetAll={() => pick(BASE)}
    />
  );
  const panel =
    current && baseline ? (
      <ControlPanel
        current={current}
        baseline={baseline}
        differ={differ}
        rooms={rooms}
        extras={extraRows}
        onChange={change}
        onReset={(k) => change(k, baseline[k])}
        footer={<NotYet />}
      />
    ) : (
      <div className="flex flex-col gap-3 p-4" aria-busy>
        <Skeleton className="h-8 w-full rounded-md" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );

  return {
    ask,
    /** What the stage builds the scene with. */
    initial,
    /** The stage's scene is built: from now on the editor drives it. */
    onScene: (made: Scene, defs: SceneState, plan: PlacementPlan | null) => {
      sceneRef.current = made;
      setScene(made);
      setDefaults(defs);
      setLive(plan);
      setCurrent((was) => was ?? ({ ...made.state } as SceneState));
    },
    /** The scene's own onChange: a room it does not have, cards it cannot read. */
    onSceneChange: pullSoon,
    /** For the area round the scene: what the mouse does to the camera comes back into the panel. */
    pointer: {
      onPointerMove: (e: PointerEvent) => {
        if (e.buttons) pullSoon();
      },
      onPointerUp: pullSoon,
      onWheel: pullSoon,
      onDoubleClick: pullSoon,
    },
    /** The scene is there and the panel can show it. */
    ready: !!(current && baseline),
    comparing,
    /** The preset the look started from, its label, and how many keys differ from basgrund. */
    forval,
    label: originPreset?.label ?? "Basgrund",
    changed: changedFromOrigin,
    count: differ.size,
    /** The look as the address writes it: "forval=levande&dust=0.8". */
    lookText: settled ? lookPart(forval, current!, originState!) : askedPart(asked),
    /** The Casino view with this look. */
    casino: casinoAddress(forval, keys),
    /** The same look on the old lab's 3D page. */
    oldLab: current && defaults ? oldLabAddress(current, defaults, { shoe: want.shoe }) : null,
    /** Card places from Jakob's plan for the round; read: the plan has been read, or could not be. */
    places,
    placesRead: card.read,
    bar,
    panel,
  };
}
