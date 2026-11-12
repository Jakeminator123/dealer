"use client";

// <Stage parts={parts} mode="3d|platt" initial={look} onScene={(scene, defaults, plan) => …} clock={clock} ref={stageRef}>
//   {what lies over the picture}
// </Stage>
// The one surface for playback: the round's parts in the lab's 3D scene or as plain films ("Inte 3D"), with one transport for
// both. Switching mode keeps the place (same step, same frame) and whether it plays. The scene is built the first time 3D is
// shown and then kept (stopped while the flat films are on screen), so switching back is at once. Space plays and pauses,
// the arrow keys step one frame, also across a cut. A step without a film shows a card for a moment and the round goes on.
// The stage does not choose the scene's look: it is built with `initial`, and onScene hands the scene out, so that a view
// can change it (the Scen view's editor drives this same object: one scene, never a second canvas).
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import type { PlacementPlan } from "../../../src/placement-model.ts";
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

export type StageHandle = {
  cue(step: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  step(dir: 1 | -1): void;
  where(): Position | null;
};

export function Stage({
  parts,
  mode,
  initial,
  onScene,
  onSceneChange,
  clock: given,
  autoplay = true,
  className,
  children,
  ref,
}: {
  parts: PlayPart[];
  mode: StageMode;
  /** Scene state the 3D scene is built with (read once, when 3D is first shown). */
  initial?: Partial<SceneState>;
  /** The 3D scene is built and running: defaults is the scene's DEFAULTS, plan the placement plan it was built with. */
  onScene?: (scene: Scene, defaults: SceneState, plan: PlacementPlan | null) => void;
  /** Anything in the 3D scene changed (a film came on screen, a setting): the scene's own onChange. */
  onSceneChange?: () => void;
  /** Where the stage is, for others to show (the round strip); one of its own when not given. */
  clock?: Clock;
  autoplay?: boolean;
  className?: string;
  /** Laid over the picture area. */
  children?: ReactNode;
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
  const engine3d = useRef<Engine | null>(null);
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
      engine3d.current?.dispose();
      engine3d.current = null;
    },
    [ctl],
  );

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
      <div className="relative min-h-0 flex-1 bg-well">
        {want3d ? (
          <SceneCanvas
            className={cn("absolute inset-0", mode !== "3d" && "invisible")}
            keys={false}
            initial={initial}
            onChange={onSceneChange}
            onReady={(made, defaults, plan) => {
              engine3d.current?.dispose();
              const engine = createSceneEngine(made);
              engine3d.current = engine;
              ctl.setEngine("3d", engine);
              onScene?.(made, defaults, plan);
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
        {children}
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
