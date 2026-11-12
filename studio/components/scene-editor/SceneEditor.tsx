"use client";

// Scen: the lab for the 3D scene's looks. The scene large on the left, playing a round on a loop; every key of its state as a
// control on the right (studio/lib/scene-keys.ts), grouped and folded; presets over the scene with basgrund, what the game
// shows today, as the baseline: a key that differs from it carries a brass dot and its own "återställ". Nothing here
// changes the game: a look reaches game.html only when Jakob has approved it and someone moves it there. The address is the
// look (/scen/?forval=levande&dust=0.8), so it can be sent as a link, and the old lab's 3D page opens the same look.
// Saved: his own presets (data/scene-presets/, on his click) and, on a confirmed click, the cards' bend and gloss in his
// placement plan. In the online copy nothing is saved.
import { Copy, ExternalLink, Pause, Play } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveRound } from "../../../src/clip-graph.ts";
import type { PlacementPlan } from "../../../src/placement-model.ts";
import type { RegisterRoom } from "../../../src/scene3d-room.ts";
import type { SceneState } from "../../../src/scene3d-view.ts";
import { asApiError, getRooms } from "../../lib/api.ts";
import { useBank } from "../../lib/bank.ts";
import { useViewContext } from "../../lib/context.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { partsKey, partsOf, playable } from "../../lib/parts.ts";
import { placesOf, readyRounds } from "../../lib/rounds.ts";
import { BUILT_BLUR, sameValue, type GroupId, type SceneKey } from "../../lib/scene-keys.ts";
import { BASE, SHIPPED, differences, effective, isShipped, matchPreset, oldLabAddress, patchOf, readAddress, writeAddress } from "../../lib/scene-presets.ts";
import { Page } from "../shell";
import { SceneCanvas, type Scene } from "../stage";
import { IconButton, SegmentedControl, Skeleton, Switch, buttonClasses, useToast } from "../ui";
import { CardMaterial, useCardMaterial } from "./CardMaterial";
import { ControlPanel, type Extra } from "./ControlPanel";
import { createExtras, type Extras, type ExtrasNote, type ExtrasState, type TrayModel } from "./extras.ts";
import { KeyRow } from "./KeyControl";
import { NotYet } from "./NotYet";
import { createPatcher } from "./patcher.ts";
import { PresetBar } from "./PresetBar";
import { deletePreset, listPresets, savePreset, type Preset } from "./presetApi.ts";
import { roomItems } from "./RoomGrid";

const ROUNDS = 3;
// What the mouse changes in the scene's state behind the page's back (SceneCanvas: drag, wheel, double click), and what the
// scene may set itself (a room it does not have becomes the salon; cards that cannot be read are switched off).
const PULLED: SceneKey[] = ["yaw", "pitch", "zoom", "dx", "dy", "dz", "sway", "room", "cards"];
// The objects as the game lays them (src/game-page.ts 201-221): Jakob's tray; the shoe is the film's; chips only with bets.
const GAME_EXTRAS: ExtrasState = { tray: "jakobs", shoe: false, chips: false };
const shipped = (): Preset[] => SHIPPED.map((p) => ({ ...p, shipped: true, revision: null }));
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !["checkbox", "radio", "button", "range"].includes(t.type)));

export function SceneEditor() {
  const params = useSearchParams();
  const query = params.toString();
  const toast = useToast();
  const { graph } = useBank();

  // ── the look asked for: the address, read once and again when it changes from outside ──
  const [asked, setAsked] = useState(() => readAddress(params));
  const [origin, setOrigin] = useState(asked.forval);
  const [needApply, setNeedApply] = useState(true);
  const [seen, setSeen] = useState(query);
  const [written, setWritten] = useState<string | null>(null);
  if (query !== seen) {
    setSeen(query);
    if (query !== written) {
      const next = readAddress(params);
      setAsked(next);
      setOrigin(next.forval);
      setNeedApply(true);
    }
  }

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

  // ── the scene ──
  const [sceneKey, setSceneKey] = useState(0);
  const sceneRef = useRef<Scene | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [defaults, setDefaults] = useState<SceneState | null>(null);
  const [live, setLive] = useState<PlacementPlan | null>(null);
  const [current, setCurrent] = useState<SceneState | null>(null);
  const [comparing, setComparing] = useState(false);
  const comparingRef = useRef(false);
  const patcher = useMemo(() => createPatcher(() => sceneRef.current), []);
  useEffect(() => () => patcher.dispose(), [patcher]);

  // What the scene is built with: the look on screen when it is built again, else the address over its shipped preset (one
  // of his own is read from the lab first: until then basgrund, and the address's keys wait for it).
  const [first] = useState<Partial<SceneState>>(() => {
    const preset = SHIPPED.find((p) => p.name === asked.forval);
    return preset ? { ...preset.state, ...asked.patch } : { ...SHIPPED[0].state };
  });
  const initial = current && defaults ? patchOf(current, defaults) : first;

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

  // The address follows the look (a moment after the hand stops), so that it can be sent as a link.
  useEffect(() => {
    if (!current || !originState || comparing || needApply) return;
    const timer = window.setTimeout(() => {
      const text = writeAddress(origin, current, originState);
      if (text === window.location.search || (!text && !window.location.search)) return;
      setWritten(text.slice(1));
      window.history.replaceState(null, "", `${window.location.pathname}${text}`);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [current, originState, origin, comparing, needApply]);

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
  const pullSoon = () => {
    if (!pullFrame.current)
      pullFrame.current = requestAnimationFrame(() => {
        pullFrame.current = 0;
        pull();
      });
  };

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

  // ── the cards' material in the placement plan ──
  const card = useCardMaterial({ live, onSaved: () => !live && setSceneKey((k) => k + 1) });

  // ── the round on a loop ──
  // The first three of Spela's ready-made rounds that play the bank's films: seat 4 (Jakob's "väldigt bra"), seat 4 with
  // both cards, and every seat.
  const rounds = useMemo(() => readyRounds().filter((r) => r.steps.length && !r.errors.length).slice(0, ROUNDS), []);
  const [roundKey, setRoundKey] = useState(() => rounds[0]?.key ?? "");
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const places = useMemo(() => placesOf(card.plan), [card.plan]);
  const parts = useMemo(() => {
    const round = rounds.find((r) => r.key === roundKey);
    if (!graph || !round || !card.read) return [];
    return partsOf(resolveRound(graph, round.steps, { holeCardDown: true, places })).filter(playable);
  }, [graph, rounds, roundKey, places, card.read]);
  // The round starts again only when its films change, not when the bank is read again and says the same.
  const key = partsKey(parts);
  const partsNow = useRef(parts);
  useEffect(() => {
    partsNow.current = parts;
  });
  useEffect(() => {
    const run = partsNow.current;
    if (!scene || !run.length) return;
    scene.players.play(
      run.map((p) => ({ path: p.path!, start: p.start, end: p.end, rate: p.speed, ...(p.fps !== 30 ? { fps: p.fps } : {}) })),
      { loop: true, cut: true },
    );
    if (!playingRef.current) scene.players.toggle(true);
  }, [scene, key]);
  const togglePlay = () => {
    const s = sceneRef.current;
    if (!s) return;
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
    s.players.toggle(!next);
  };

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
  const count = differ.size;
  useViewContext({ vy: "scen", val: { forval: originPreset?.name ?? BASE, andrat: String(count) } });
  const status = current ? (
    <>
      <span className="font-medium text-ink">{active ? presetOf(active)?.label : (originPreset?.label ?? "Basgrund")}</span>
      {!active ? <span className="text-faint">ändrad</span> : null}
      <span>·</span>
      <span className={count ? "text-brass-hi" : undefined}>{count ? `${count} reglage skiljer från basgrund` : "det spelet visar i dag"}</span>
    </>
  ) : (
    <span>Bygger scenen…</span>
  );

  return (
    <Page
      title="Scen"
      full
      status={status}
      actions={
        <>
          <IconButton
            label="Kopiera länken till looken"
            icon={<Copy />}
            variant="quiet"
            onClick={() =>
              void navigator.clipboard.writeText(window.location.href).then(
                () => toast({ tone: "ok", title: "Länken är kopierad", detail: "Den öppnar samma look här i studion." }),
                () => toast({ tone: "bad", title: "Kunde inte kopiera", detail: window.location.href }),
              )
            }
          />
          {current && defaults ? (
            <a href={oldLabAddress(current, defaults, { shoe: want.shoe })} className={buttonClasses({ variant: "quiet", size: "sm" })}>
              Öppna i gamla 3D-labbet <ExternalLink />
            </a>
          ) : null}
        </>
      }
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_clamp(320px,26vw,380px)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <PresetBar
            presets={presets}
            active={active}
            origin={originPreset?.name ?? BASE}
            changed={changedFromOrigin}
            canSave={canSave}
            comparing={comparing}
            onPick={pick}
            onSave={saveAs}
            onDelete={remove}
            onCompare={compare}
            onResetAll={() => pick(BASE)}
          />
          <div
            className="relative min-h-0 flex-1 bg-well"
            onPointerMove={(e) => e.buttons && pullSoon()}
            onPointerUp={pullSoon}
            onWheel={pullSoon}
            onDoubleClick={pullSoon}
          >
            <SceneCanvas
              key={sceneKey}
              className="absolute inset-0"
              initial={initial}
              onReady={(made, defs, plan?: unknown) => {
                sceneRef.current = made;
                setScene(made);
                setDefaults(defs);
                // the plan the scene was built with, when SceneCanvas hands it out: then bend and gloss show before they are saved
                setLive(plan && typeof plan === "object" && "targets" in plan ? (plan as PlacementPlan) : null);
                setCurrent((was) => was ?? ({ ...made.state } as SceneState));
                if (!playingRef.current) made.players.toggle(true);
              }}
              onChange={() => {
                const s = sceneRef.current;
                if (s && s.players.paused === playingRef.current && s.players.count) {
                  playingRef.current = !s.players.paused;
                  setPlaying(!s.players.paused);
                }
                pullSoon();
              }}
            />
            {comparing ? (
              <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-brass/50 bg-black/70 px-4 py-1.5 text-sm font-semibold text-brass-hi shadow-pop backdrop-blur-sm">
                Basgrund
              </div>
            ) : null}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/55 p-1 pr-1.5 backdrop-blur-sm">
              <IconButton label={playing ? "Pausa" : "Spela"} kbd="Mellanslag" icon={playing ? <Pause /> : <Play />} size="sm" variant="quiet" className="rounded-full text-ink" onClick={togglePlay} />
              <SegmentedControl
                size="sm"
                label="Runda"
                value={roundKey}
                onChange={setRoundKey}
                options={rounds.map((r) => ({ value: r.key, label: r.name, title: r.text }))}
                className="border-transparent bg-transparent"
              />
            </div>
            <p className="pointer-events-none absolute bottom-4 right-4 hidden text-xs text-white/45 xl:block">Dra för att vrida · rulla för zoom · dubbelklicka för hemvy · håll B för basgrund</p>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-l border-line bg-surface/50">
          {current && baseline ? (
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
          )}
        </aside>
      </div>
    </Page>
  );
}
