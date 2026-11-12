"use client";

// <Stage parts={parts} mode="3d|platt" look="levande|stilla" onLook={setLook} cards clock={clock} ref={stageRef} />
// The one surface for playback: the round's parts in the lab's 3D scene or as plain films ("Inte 3D"), with one transport for
// both. Switching mode keeps the place (same step, same frame) and whether it plays. The scene is built the first time 3D is
// shown and then kept (stopped while the flat films are on screen), so switching back is at once. Space plays and pauses,
// the arrow keys step one frame, also across a cut. A step without a film shows a card for a moment and the round goes on.
// The scene's look: Levande is what Jakob remembers of the 3D lab (the camera leans and sways, focus follows the card, dust,
// the clock); Stilla is the scene's own defaults in the home view. cards draws rendered cards (3D only). A double click in
// the scene goes to the home view and stops the sway (the scene's home()), which is neither look: the stage then says so
// with onLook(null), and a look chosen after that (Levande again) is applied anew.
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { GAP_LABEL } from "../../../src/clip-graph.ts";
import { edgeName } from "../../lib/names.ts";
import { positionAt, type PlayPart, type Position } from "../../lib/parts.ts";
import { cn } from "../ui/cn";
import { createClock, type Clock } from "./clock.ts";
import { createController, type StageMode } from "./controller.ts";
import { createSceneEngine, type Engine, type Scene } from "./engines.ts";
import { FlatStage, PictureBox } from "./FlatStage";
import { SceneCanvas, type SceneState } from "./SceneCanvas";
import { Transport } from "./Transport";

export type { StageMode };
export type SceneLook = "levande" | "stilla";
/** The look the scene shows: one of the two, or null after a double click took it to the home view by hand. */
export type ShownLook = SceneLook | null;
/** Levande, on top of the scene's defaults: found in the logs and shown in the proof 3d-kanslan (2026-11-12). */
export const LEVANDE: Partial<SceneState> = { mode: "lean", sway: true, focus: "follow", dust: 0.6, clock: true };
const STILLA_KEYS = ["mode", "sway", "focus", "dust", "clock"] as const;

export type StageHandle = {
  cue(step: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  step(dir: 1 | -1): void;
  where(): Position | null;
};

function applyLook(scene: Scene, defaults: SceneState, look: SceneLook) {
  if (look === "levande") {
    scene.home();
    scene.set(LEVANDE);
  } else {
    scene.set(Object.fromEntries(STILLA_KEYS.map((k) => [k, defaults[k]])) as Partial<SceneState>);
    scene.home();
  }
}

export function Stage({
  parts,
  mode,
  look = "levande",
  onLook,
  cards = false,
  clock: given,
  autoplay = true,
  className,
  ref,
}: {
  parts: PlayPart[];
  mode: StageMode;
  /** null: leave the scene as it is (the home view a double click gave it). */
  look?: ShownLook;
  /** The look changed in the scene itself: null after a double click (home view, sway stopped). */
  onLook?: (look: ShownLook) => void;
  cards?: boolean;
  /** Where the stage is, for others to show (the round strip); one of its own when not given. */
  clock?: Clock;
  autoplay?: boolean;
  className?: string;
  ref?: Ref<StageHandle>;
}) {
  const own = useMemo(() => createClock(), []);
  const clock = given ?? own;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [gap, setGap] = useState<number | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [want3d, setWant3d] = useState(mode === "3d");
  if (mode === "3d" && !want3d) setWant3d(true); // the scene is built the first time 3D is asked for
  const [ctl] = useState(() => createController({ clock, mode, autoplay, onPlaying: setPlaying, onGap: setGap, onError: setFault }));
  const scene = useRef<{ scene: Scene; defaults: SceneState; engine: Engine } | null>(null);
  const applied = useRef<{ look: ShownLook; cards: boolean } | null>(null);
  const lookCall = useRef(onLook);
  useEffect(() => {
    lookCall.current = onLook;
  });
  const [sceneReady, setSceneReady] = useState(false);
  const wasPlaying = useRef(false);

  useEffect(() => ctl.setParts(parts), [ctl, parts]);
  useEffect(() => ctl.setMode(mode), [ctl, mode]);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      ctl.tick();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [ctl]);
  useEffect(
    () => () => {
      ctl.pause();
      ctl.setEngine("3d", null);
      scene.current?.engine.dispose();
      scene.current = null;
    },
    [ctl],
  );

  // The look and the rendered cards, once the scene is there and whenever they change.
  useEffect(() => {
    const s = scene.current;
    if (!sceneReady || !s) return;
    const was = applied.current;
    if (was && was.look !== look && look) applyLook(s.scene, s.defaults, look);
    if (was ? was.cards !== cards : cards) s.scene.set({ cards });
    applied.current = { look, cards };
  }, [sceneReady, look, cards]);

  // Keys: Space plays and pauses, the arrows step one frame; not while typing in a field.
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(t.type)));
    let held = false;
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        held = true;
        if (!e.repeat) ctl.toggle();
      } else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        ctl.step(e.code === "ArrowRight" ? 1 : -1);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !held) return;
      held = false;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [ctl]);

  // For the screenshot script and the console; not an interface for other pages.
  useEffect(() => {
    const hook = {
      where: () => ctl.where(),
      log: () => ctl.log(),
      clearLog: () => ctl.clearLog(),
      cuts: () => ctl.cuts(),
      cue: (step: number) => ctl.cue(step),
      step: (dir: 1 | -1) => ctl.step(dir),
      play: () => ctl.play(),
      playFrom: (step: number, frame: number) => ctl.playFrom({ step, frame }),
      pause: () => ctl.pause(),
      get playing() {
        return ctl.playing;
      },
      get mode() {
        return ctl.mode;
      },
    };
    const w = window as unknown as { studioSpela?: unknown };
    w.studioSpela = hook;
    return () => {
      if (w.studioSpela === hook) delete w.studioSpela;
    };
  }, [ctl]);

  useImperativeHandle(ref, () => ({ cue: ctl.cue, play: ctl.play, pause: ctl.pause, toggle: ctl.toggle, step: ctl.step, where: ctl.where }), [ctl]);

  const gapPart = gap !== null ? parts[gap] : null;
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        className="relative min-h-0 flex-1 bg-well"
        onDoubleClick={(event) => {
          // The scene's own double click (SceneCanvas) has just gone home and stopped the sway: neither look is on screen now.
          if (mode !== "3d" || !(event.target instanceof HTMLCanvasElement) || !applied.current) return;
          if (applied.current.look === null) return;
          applied.current = { ...applied.current, look: null };
          lookCall.current?.(null);
        }}
      >
        {want3d ? (
          <SceneCanvas
            className={cn("absolute inset-0", mode !== "3d" && "invisible")}
            keys={false}
            initial={{ ...(look === "levande" ? LEVANDE : {}), cards }}
            onReady={(made, defaults) => {
              scene.current?.engine.dispose();
              const engine = createSceneEngine(made);
              scene.current = { scene: made, defaults, engine };
              applied.current = { look, cards };
              ctl.setEngine("3d", engine);
              setSceneReady(true);
            }}
          />
        ) : null}
        <FlatStage className={mode !== "platt" ? "invisible" : undefined} onEngine={(engine) => ctl.setEngine("platt", engine)} />
        {gapPart ? (
          <PictureBox>
            <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-[2px]">
              <div className="rounded-xl border border-dashed border-underkand/45 bg-surface/95 px-7 py-5 text-center shadow-pop">
                <div className="text-2xs font-medium uppercase tracking-[0.08em] text-faint">Steg {gapPart.step + 1} · lucka</div>
                <div className="mt-1 font-display text-2xl font-semibold text-ink">{edgeName(gapPart.edge)}</div>
                <div className="mt-1 text-sm text-dim">Ingen film att spela: {GAP_LABEL[gapPart.gap ?? "MISSING"]}</div>
              </div>
            </div>
          </PictureBox>
        ) : null}
        {fault ? (
          <div role="alert" className="absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-full border border-underkand/40 bg-surface/95 px-3 py-1 text-sm text-[#ef8b8b] shadow-pop">{fault}</span>
          </div>
        ) : null}
      </div>
      <Transport
        parts={parts}
        clock={clock}
        playing={playing}
        speed={speed}
        loop={loop}
        onToggle={ctl.toggle}
        onStep={ctl.step}
        onSpeed={(next) => {
          setSpeed(next);
          ctl.setSpeed(next);
        }}
        onLoop={(next) => {
          setLoop(next);
          ctl.setLoop(next);
        }}
        onScrub={(share, first) => {
          if (first) {
            wasPlaying.current = ctl.playing;
            ctl.pause();
          }
          ctl.seek(positionAt(parts, share));
        }}
        onScrubEnd={() => {
          if (wasPlaying.current) ctl.play();
          wasPlaying.current = false;
        }}
      />
    </div>
  );
}
