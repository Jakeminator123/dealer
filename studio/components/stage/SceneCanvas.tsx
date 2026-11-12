"use client";

// <SceneCanvas initial={{mode: "lean"}} onReady={(scene, defaults, plan) => …} ref={sceneRef} className="absolute inset-0" />
// The lab's own 3D scene (src/scene3d-view.ts, read from the lab server at run time) in a React view. It makes its own
// <canvas> in a host element, builds the scene's data as the lab's page does (src/scene3d-ui.ts: the contract, Jakob's
// placement plan, the room pictures and the rooms of data/scene-rooms.json), starts it, keeps it sized to the host, and
// wires the lab page's mouse: drag to turn or lean, wheel to zoom, double click for the home view. With keys (default on)
// Space plays and pauses the scene's film and the arrow keys step one frame, as on the lab page; a view with its own
// transport turns them off. The card track of the film on screen is followed, so focus "follow" and rendered cards work.
// Unmounting disposes the scene and removes the canvas (a canvas whose context is released cannot be used again); it is
// safe when React runs the effect twice and when the view goes while the scene is still loading. Nothing here is about
// rounds: the caller plays films with scene.players.
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import type { PlacementPlan } from "../../../src/placement-model.ts";
import type { CardTrack } from "../../../src/scene3d-geometry.ts";
import type * as SceneView from "../../../src/scene3d-view.ts";
import { getContract, getPlacements, getRooms } from "../../lib/api.ts";
import { useOptionalBank } from "../../lib/bank.ts";
import { labModule, labUrl } from "../../lib/lab.ts";
import { cn } from "../ui/cn";
import { Spinner } from "../ui/Spinner";
import type { Scene } from "./engines.ts";

export type { Scene };
export type SceneState = SceneView.SceneState;

const URLS = { plate: "assets/scene/room.png", panorama: "assets/scene/panorama-vegas.jpg", la: "assets/scene/panorama-la.jpg", skog: "assets/scene/panorama-skog.jpg" };

type Media = Record<string, { video?: string | null; overrides?: string | null }>;

export function SceneCanvas({
  initial,
  onReady,
  onChange,
  onError,
  keys = true,
  className,
  children,
  ref,
}: {
  /** Scene state set before the first frame (read once, when the scene is built). */
  initial?: Partial<SceneState>;
  /**
   * The scene is built and running; defaults is the scene's DEFAULTS, plan the placement plan object it was built with
   * (the rendered cards read each card's bend and gloss from it every frame, so a change made there shows at once).
   */
  onReady?: (scene: Scene, defaults: SceneState, plan: PlacementPlan | null) => void;
  /** Anything in the scene changed (a film came on screen, a setting): the scene's own onChange. */
  onChange?: () => void;
  onError?: (error: Error) => void;
  /** Space and the arrow keys drive the scene's film, as on the lab page. */
  keys?: boolean;
  className?: string;
  /** Laid over the picture. */
  children?: ReactNode;
  /** The scene, once built (null before and after). */
  ref?: Ref<Scene | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [fault, setFault] = useState<string | null>(null);
  const bank = useOptionalBank();
  // The latest props for code that runs inside the scene's callbacks and listeners.
  const latest = useRef({ initial, onReady, onChange, onError, keys, media: undefined as Media | undefined });
  useEffect(() => {
    latest.current = { initial, onReady, onChange, onError, keys, media: bank?.bank?.media as Media | undefined };
  });
  useImperativeHandle<Scene | null, Scene | null>(ref, () => sceneRef.current, [status]);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    let gone = false;
    let scene: Scene | null = null;
    const undo: (() => void)[] = [];
    const canvas = document.createElement("canvas");
    canvas.className = "block touch-none select-none cursor-grab active:cursor-grabbing";
    canvas.setAttribute("aria-label", "3D-scenen: dra för att vrida, rulla för zoom, dubbelklicka för hemvy");
    box.appendChild(canvas);

    // The card track of the clip on screen (src/scene3d-ui.ts followTrack): never the previous clip's track on this clip's frames.
    const tracks = new Map<string, CardTrack | null>();
    let trackedPath = "";
    const json = (url: string) =>
      fetch(labUrl(url))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    async function follow() {
      if (!scene) return;
      const path = scene.players.path;
      if (path === trackedPath) return;
      trackedPath = path;
      const id = /^\/?assets\/motions\/([a-z0-9-]+)\/source\.mp4$/.exec(path)?.[1];
      scene.setTrack(id ? (tracks.get(id) ?? null) : null);
      if (!id || tracks.has(id)) return;
      tracks.set(id, null);
      const track = (await json(`assets/tracking/${id}/card-track.json`)) as (CardTrack & { cardInFront?: unknown }) | null;
      // the clip bank's frames where the card is drawn in front of the hand (card-overlay.ts reads them off the track)
      const overrides = Object.values(latest.current.media ?? {}).find((m) => m.video && labUrl(m.video) === labUrl(path) && m.overrides)?.overrides;
      if (track && overrides) track.cardInFront = ((await json(overrides)) as { cardInFront?: unknown } | null)?.cardInFront ?? [];
      if (gone || !scene) return;
      tracks.set(id, track);
      if (labUrl(scene.players.path) === labUrl(path)) scene.setTrack(track);
    }

    (async () => {
      const [contract, placements, rooms, view] = await Promise.all([
        getContract(),
        getPlacements(),
        getRooms().catch(() => null),
        labModule<typeof SceneView>("scene3d-view"),
      ]);
      if (gone) return;
      const plan = ((placements as { plan?: unknown }).plan ?? placements) as PlacementPlan | null;
      const made = view.createScene(canvas, box, {
        contract,
        plan: plan as never,
        urls: URLS,
        rooms: rooms?.rooms.length ? rooms.rooms : undefined,
        onChange: () => {
          void follow();
          latest.current.onChange?.();
        },
        onMissingRoom: () => {},
      });
      scene = made;
      Object.assign(made.state, latest.current.initial ?? {});
      made.rebuild();
      made.start();
      const observer = new ResizeObserver(() => made.resize());
      observer.observe(box);
      undo.push(() => observer.disconnect());
      undo.push(wire(made, canvas, () => latest.current.keys));
      sceneRef.current = made;
      setStatus("ready");
      latest.current.onReady?.(made, view.DEFAULTS, plan && typeof plan === "object" && "targets" in plan ? plan : null);
    })().catch((error: Error) => {
      if (gone) return;
      setStatus("error");
      setFault(error?.message ?? String(error));
      latest.current.onError?.(error);
    });

    return () => {
      gone = true;
      for (const fn of undo) fn();
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
      canvas.remove();
    };
  }, []);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={host} className="absolute inset-0 grid place-items-center" />
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-sm text-dim backdrop-blur-sm">
            <Spinner size="sm" /> Bygger scenen…
          </span>
        </div>
      ) : null}
      {status === "error" ? (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="font-display text-md font-semibold text-ink">Scenen kunde inte byggas</p>
            <p className="mt-1 text-sm text-dim">{fault}</p>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

// The lab page's mouse and keys (src/scene3d-ui.ts): drag turns the view ("look") or moves it ("lean"), the wheel zooms,
// a double click goes home. Returns what takes them off again.
function wire(scene: Scene, canvas: HTMLCanvasElement, keys: () => boolean): () => void {
  const state = scene.state;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  let drag: { x: number; y: number; from: SceneState } | null = null;
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, from: { ...state } };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const perPixel = 45 / Math.max(1, canvas.clientHeight);
    if (state.mode === "look") {
      state.yaw = clamp(drag.from.yaw + dx * perPixel, -60, 60);
      state.pitch = clamp(drag.from.pitch + dy * perPixel, -35, 25);
    } else {
      state.dx = clamp(drag.from.dx - dx * 0.0016, -0.9, 0.9);
      state.dy = clamp(drag.from.dy + dy * 0.0016, -0.3, 0.5);
    }
  };
  const up = () => {
    drag = null;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    state.zoom = clamp(state.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 2.5);
  };
  const home = () => scene.home();
  const key = (e: KeyboardEvent) => {
    if (!keys() || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t instanceof HTMLInputElement)) return;
    if (e.code === "Space") {
      e.preventDefault();
      scene.players.toggle();
    } else if (e.code === "ArrowRight") void scene.players.step(1);
    else if (e.code === "ArrowLeft") void scene.players.step(-1);
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("dblclick", home);
  window.addEventListener("keydown", key);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("dblclick", home);
    window.removeEventListener("keydown", key);
  };
}
