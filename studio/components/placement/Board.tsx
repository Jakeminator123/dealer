"use client";

// The picture, as large as the area allows, with the cards on it and the handles on the chosen one. Under the cards lies a
// still in the view's own pixels (the neutral backdrop, or the V6 picture) or a film at a frame. The cards are drawn three
// ways: "Färg" (the default) and "Kontur" draw a card as the films show it, a plain yellow back (closed) and a plain blue
// face (open), filled or as an outline, over the quads (placement-model planQuad, CARD_COLOUR); "Efterarbete: spelets kort"
// lays the playback's own rendered cards with their print (cardLayer.ts), what the game draws afterwards. Over that lies one SVG in the
// view's own pixels with the handles:
//   drag a card or the shoe: move it · the round handle beyond the far edge: riktning (Shift: 15°) · a near corner: size
//   (Shift: same shape) · a far corner: perspektiv. Arrow keys: a pixel (Shift ten); on the round handle a degree (Shift 15).
// On a flat table (Plant bord) only moving is possible, as in the old tab: size, riktning and perspektiv follow P4C1.
// Ctrl + wheel zooms. Every gesture is one step for Ångra; nothing is saved from here.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { CARD_COLOUR, SHOE, SHOE_CARD, TARGETS, VIEWS, WINDOW_CARD, angleToward, defaultPlan, editPlace, fromPixels, planQuad, toPixels, type Intent, type Place, type PlacementPlan, type View } from "../../../src/placement-model.ts";
import { nudged, placeCode, sideWord, sizeFromCorner, taperFromCorner, turnHandle, type Pt } from "../../lib/placement.ts";
import { PATH_SECONDS, pathFrame, type PathPhase } from "../../lib/placement-path.ts";
import { cn } from "../ui/cn";
import { createCardLayer, stillSource, type CardLayer, type Face, type Source } from "./cardLayer.ts";
import { draftActions } from "./useDraft.ts";

export type Look = "kort" | "farg" | "kontur";
export type Backdrop = { kind: "still"; src: string } | { kind: "film"; src: string; fps: number; frame: number };
/** The card path playing: for which card, at which speed (1, or 0.5 half speed), and the step name shown by the picture. */
export type PathRun = { id: string; key: number; speed: number; step: string | null };

const COLOUR = CARD_COLOUR;
/** The chosen card's (or the shoe's) marking: a colour no card has, so it is not read as a card's rim. */
const SELECTED = "#ff4fd8";
/** A card as the films show it: one plain colour with slightly rounded corners (its own colour round it), no rim. */
const plain = (colour: string) => ({ fill: colour, stroke: colour, strokeWidth: 4, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const });
const pts = (q: readonly Pt[]) => q.map((p) => `${p.x},${p.y}`).join(" ");
type Grip = "move" | "turn" | "size" | "taper";

/** Arrow keys over a run of presses are one step: the run ends after a short pause. */
function useKeyRun() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return useCallback((fn: (plan: PlacementPlan) => PlacementPlan) => {
    if (!timer.current) draftActions.begin();
    else clearTimeout(timer.current);
    draftActions.move(fn);
    timer.current = setTimeout(() => {
      timer.current = null;
      draftActions.end();
    }, 700);
  }, []);
}
export { useKeyRun };

export function Board({
  plan,
  other,
  view,
  selected,
  onSelect,
  editable,
  look,
  allCards,
  grid,
  changed,
  backdrop,
  shoeCard,
  onBackdropMissing,
  face,
  zoom,
  onZoom,
  path,
  onPhase,
  onCardsFailed,
  videoRef,
  label,
  className,
}: {
  plan: PlacementPlan;
  /** The other plan, for the dashed outlines of where the changed cards lie there (the saved plan, or the draft while the saved one is shown); null to draw none. */
  other: PlacementPlan | null;
  view: View;
  selected: Place;
  onSelect: (id: Place) => void;
  editable: boolean;
  look: Look;
  allCards: boolean;
  grid: boolean;
  changed: ReadonlySet<Place>;
  backdrop: Backdrop;
  /**
   * Paint the card in the shoe's window plain yellow (Färg, Kontur): on the V6 picture over the game's own back there, on the
   * neutral picture over its film card and the window's pale edge; null under a film, whose own card is lifted out.
   */
  shoeCard: "v6" | "neutral" | null;
  /** The still could not be read (not on this machine): the view shows another. */
  onBackdropMissing?: () => void;
  face: Face;
  zoom: number;
  onZoom: (zoom: number) => void;
  path: PathRun | null;
  onPhase: (phase: PathPhase) => void;
  onCardsFailed: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** A short name of what lies under the cards, shown in the picture's corner. */
  label: string;
  className?: string;
}) {
  const W = VIEWS[view].width;
  const H = VIEWS[view].height;
  const flat = plan.tableProjection?.mode === "flat";
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<CardLayer | null>(null);
  const source = useRef<Source | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });

  // ── size: the picture fits the area, times the zoom; larger than the area it scrolls ──
  useLayoutEffect(() => {
    const el = wrap.current!;
    const read = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = wrap.current!;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      onZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom, onZoom]);
  const ratio = W / H;
  const pad = 20;
  const fit = Math.max(160, Math.min(area.w - pad * 2, (area.h - pad * 2) * ratio));
  const boxW = fit * zoom;
  const boxH = boxW / ratio;
  const unit = W / Math.max(1, boxW); // the view's pixels per screen pixel: handles keep their size on screen

  // ── the playback's cards ──
  const ids = allCards ? TARGETS : TARGETS.filter((id) => id === selected);
  const want = useRef({ plan, view, ids, face, look });
  want.current = { plan, view, ids, face, look };
  const failed = useRef(onCardsFailed);
  failed.current = onCardsFailed;
  const pending = useRef(0);
  const schedule = useCallback(() => {
    if (pending.current) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      const w = want.current;
      if (w.look !== "kort" || !source.current || !layer.current) {
        layer.current?.clear();
        return;
      }
      void layer.current.draw(source.current, w.plan, w.view, w.ids, w.face).then((ok) => {
        if (!ok) failed.current();
      });
    });
  }, []);
  useEffect(() => {
    layer.current = createCardLayer(host.current!);
    return () => {
      cancelAnimationFrame(pending.current);
      pending.current = 0;
      layer.current?.dispose();
      layer.current = null;
    };
  }, []);
  const idsKey = ids.join();
  useEffect(schedule, [plan, view, idsKey, face, look, schedule]);

  // A new picture or film under the cards: nothing is drawn on the old one meanwhile. (Before any load event can come.)
  const backdropKey = `${backdrop.kind}:${backdrop.src}`;
  useLayoutEffect(() => {
    source.current = null;
    layer.current?.clear();
  }, [backdropKey]);

  // ── a film under the cards: its frame, and the cards drawn again whenever the picture changes ──
  useEffect(() => {
    if (backdrop.kind !== "film") return;
    const video = videoRef.current;
    if (!video) return;
    let callback = 0;
    const ready = () => {
      if (video.videoWidth) {
        source.current = video;
        schedule();
      }
    };
    const loop = () => {
      schedule();
      if (!video.paused) callback = video.requestVideoFrameCallback(loop);
    };
    const play = () => {
      callback = video.requestVideoFrameCallback(loop);
    };
    const meta = () => {
      if (backdrop.frame > 0 && Math.abs(video.currentTime * backdrop.fps - backdrop.frame) > 0.5) video.currentTime = (backdrop.frame + 0.001) / backdrop.fps;
    };
    video.addEventListener("loadedmetadata", meta);
    video.addEventListener("loadeddata", ready);
    video.addEventListener("seeked", ready);
    video.addEventListener("play", play);
    if (video.readyState >= 1) meta();
    if (video.readyState >= 2) ready();
    return () => {
      video.removeEventListener("loadedmetadata", meta);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("seeked", ready);
      video.removeEventListener("play", play);
      if (callback) video.cancelVideoFrameCallback(callback);
    };
    // the frame is read once when the film is loaded; afterwards the film bar moves it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdropKey, schedule, videoRef]);

  // ── gestures ──
  const drag = useRef<{ grip: Grip; id: Place; du: number; dv: number } | null>(null);
  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const el = (e.target as Element).closest<SVGElement>("[data-place]");
    if (!el) return;
    const id = el.dataset.place!;
    const grip = (el.dataset.grip as Grip | undefined) ?? "move";
    e.preventDefault();
    onSelect(id);
    if (!editable) return;
    const a = at(e);
    const p = fromPixels(a.x, a.y, view);
    const point = id === SHOE ? plan.shoe[view] : plan.targets[id].geometry[view];
    drag.current = { grip, id, du: p.u - point.u, dv: p.v - point.v };
    draftActions.begin();
    svg.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const shift = e.shiftKey;
    draftActions.move((now) => {
      if (d.grip === "move") {
        const u = fromPixels(p.x, p.y, view);
        return editPlace(now, d.id, view, { u: u.u - d.du, v: u.v - d.dv });
      }
      const g = now.targets[d.id].geometry[view];
      if (d.grip === "turn") {
        let angle = angleToward(g, fromPixels(p.x, p.y, view), view);
        if (shift) angle = Math.round(angle / 15) * 15;
        return editPlace(now, d.id, view, { angle });
      }
      if (d.grip === "size") return editPlace(now, d.id, view, sizeFromCorner(g, view, p, shift));
      return editPlace(now, d.id, view, { taper: taperFromCorner(g, view, p) });
    });
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    draftActions.end();
    svg.current?.querySelector<SVGElement>(`[data-place="${d.id}"][data-grip="${d.grip === "turn" ? "turn" : "move"}"]`)?.focus({ preventScroll: true });
  };
  const keyRun = useKeyRun();
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const el = (e.target as Element).closest<SVGElement>("[data-place]");
    if (!el) return;
    const id = el.dataset.place!;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
      return;
    }
    if (!e.key.startsWith("Arrow")) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    if (!editable) return;
    const turn = el.dataset.grip === "turn";
    keyRun((now) => nudged(now, id, view, e.key, e.shiftKey, turn) ?? now);
  };

  // ── what is drawn ──
  const shown = TARGETS.filter((id) => allCards || id === selected);
  const target = selected === SHOE ? null : plan.targets[selected];
  const q = target ? planQuad(plan, selected, view) : null;
  const shoe = toPixels(plan.shoe[view], view);
  const r = 6 * unit;
  const handles = editable && q && target;
  return (
    <div ref={wrap} className={cn("relative flex min-h-0 min-w-0 overflow-auto bg-well [scrollbar-gutter:stable]", className)}>
      <div data-picture className="relative m-auto shrink-0 overflow-hidden rounded-md shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_18px_50px_rgb(0_0_0/0.45)]" style={{ width: boxW, height: boxH }}>
        {backdrop.kind === "still" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={backdrop.src}
            src={backdrop.src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              source.current = stillSource(e.currentTarget);
              schedule();
            }}
            onError={onBackdropMissing}
            className="absolute inset-0 size-full select-none object-fill"
          />
        ) : (
          <video key={backdrop.src} ref={videoRef} src={backdrop.src} muted playsInline preload="auto" disablePictureInPicture className="absolute inset-0 size-full object-fill" />
        )}
        <div ref={host} className={cn("absolute inset-0", look !== "kort" && "hidden")} />
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-label="Kortplatser på bordet"
          className="absolute inset-0 size-full touch-none select-none outline-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={key}
        >
          <defs>
            <pattern id="placering-grid" width="88.1" height="58.7" patternUnits="userSpaceOnUse">
              <path d="M 88.1 0 L 0 0 0 58.7" fill="none" stroke="white" strokeOpacity=".13" strokeWidth="1" />
            </pattern>
          </defs>
          {grid ? <rect width="100%" height="100%" fill="url(#placering-grid)" pointerEvents="none" /> : null}
          {look !== "kort" && shoeCard ? (
            // the card standing in the shoe's window, plain yellow as in the films with no pale rim round it: the V6 picture's own
            // card (SHOE_CARD) there, the films' card (WINDOW_CARD) on the neutral picture, where it hides the picture's pale window edge
            <polygon points={pts(shoeCard === "v6" ? SHOE_CARD[view] : windowCard(plan, view))} {...plain(COLOUR.BACK)} pointerEvents="none">
              <title>Kortet i skon · stängt</title>
            </polygon>
          ) : null}
          {other && changed.size
            ? shown
                .filter((id) => changed.has(id) && other.targets[id])
                .map((id) => (
                  <polygon key={`was-${id}`} points={pts(planQuad(other, id, view))} fill="none" stroke="#d9b96a" strokeOpacity={0.75} strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                ))
            : null}
          {shown.map((id) => {
            const t = plan.targets[id];
            const quad = planQuad(plan, id, view);
            const c = toPixels(t.geometry[view], view);
            const on = id === selected;
            const colour = COLOUR[t.intent.endSide];
            const fill = look === "farg" ? colour : look === "kontur" ? colour : "transparent";
            return (
              <g key={id}>
                <polygon
                  data-place={id}
                  data-grip="move"
                  tabIndex={0}
                  role="button"
                  aria-label={`${placeCode(id)}, ${sideWord(t.intent.endSide)}`}
                  points={pts(quad)}
                  fill={fill}
                  fillOpacity={look === "kontur" ? 0.1 : 1}
                  // a card is a plain shape with rounded corners (its own colour round it); only the chosen one is marked, in pink
                  stroke={on ? SELECTED : look === "farg" ? colour : look === "kontur" ? colour : "transparent"}
                  strokeWidth={on ? 2.5 : look === "farg" ? 4 : 2}
                  strokeLinejoin="round"
                  strokeDasharray={!on && look === "kontur" ? "5 3" : undefined}
                  vectorEffect="non-scaling-stroke"
                  className={cn("outline-none", editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", look === "kort" && !on && "hover:stroke-white/40")}
                >
                  <title>{`${placeCode(id)} · ${sideWord(t.intent.endSide)}`}</title>
                </polygon>
                {on || id.endsWith("1") ? (
                  <text
                    x={c.x}
                    y={Math.max(...quad.map((p) => p.y)) + 18 * unit}
                    textAnchor="middle"
                    pointerEvents="none"
                    style={{ fontSize: 12 * unit, fontWeight: 600, fill: "white", paintOrder: "stroke", stroke: "#111827", strokeWidth: 4 * unit, strokeLinejoin: "round" }}
                  >
                    {on ? placeCode(id) : placeCode(id).replace(/C\d$/, "")}
                  </text>
                ) : null}
              </g>
            );
          })}
          {q && target ? <Handles quad={q} id={selected} unit={unit} flat={flat} editable={!!handles} /> : null}
          <g>
            <polygon
              data-place={SHOE}
              data-grip="move"
              tabIndex={0}
              role="button"
              aria-label="Skon: startpunkten"
              points={`${shoe.x},${shoe.y - r} ${shoe.x + r},${shoe.y} ${shoe.x},${shoe.y + r} ${shoe.x - r},${shoe.y}`}
              // hollow, so that the card in the window stays plain yellow under it
              fill="transparent"
              stroke={selected === SHOE ? SELECTED : "#2b2338"}
              strokeWidth={selected === SHOE ? 2.5 : 2}
              vectorEffect="non-scaling-stroke"
              className={cn("outline-none", editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
            >
              <title>Skon: där korten tas</title>
            </polygon>
            <text x={shoe.x + 34 * unit} y={shoe.y - 44 * unit} textAnchor="start" pointerEvents="none" style={{ fontSize: 10 * unit, fontWeight: 600, fill: "white", paintOrder: "stroke", stroke: "#111827", strokeWidth: 4 * unit }}>
              SKO
            </text>
          </g>
          {path && plan.targets[path.id] ? <PathLayer key={path.key} plan={plan} id={path.id} view={view} speed={path.speed} onPhase={onPhase} /> : null}
        </svg>
        <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-sm border border-white/25 bg-[#121815]/75 px-2 py-1 text-2xs font-medium text-white">{label}</span>
        {path?.step ? (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 flex flex-col rounded-sm border border-[#d3b4ff]/50 bg-[#1b1426]/85 px-2 py-1">
            <span data-path-step className="text-xs font-medium text-[#f3eaff]">
              {placeCode(path.id)} · {path.step}
            </span>
            <span className="text-2xs text-[#cdbfe0]">En skiss av rörelsen, inte en film</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The chosen card's handles: the far edge's round handle (riktning), the near corners (size), the far corners (perspektiv). */
function Handles({ quad, id, unit, flat, editable }: { quad: Pt[]; id: string; unit: number; flat: boolean; editable: boolean }) {
  if (!editable || flat)
    return (
      <g pointerEvents="none">
        {quad.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.8 * unit} fill={SELECTED} stroke="#142337" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    );
  const turn = turnHandle(quad, 24 * unit);
  const s = 4.5 * unit;
  return (
    <g>
      <line x1={turn.from.x} y1={turn.from.y} x2={turn.at.x} y2={turn.at.y} stroke={SELECTED} strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      {[0, 1].map((i) => (
        <circle key={`t${i}`} data-place={id} data-grip="taper" cx={quad[i].x} cy={quad[i].y} r={s} fill="#121815" stroke={SELECTED} strokeWidth={2} vectorEffect="non-scaling-stroke" className="cursor-ew-resize">
          <title>Dra: perspektiv</title>
        </circle>
      ))}
      {[2, 3].map((i) => (
        <rect key={`s${i}`} data-place={id} data-grip="size" x={quad[i].x - s} y={quad[i].y - s} width={2 * s} height={2 * s} rx={unit} fill={SELECTED} stroke="#142337" strokeWidth={1} vectorEffect="non-scaling-stroke" className={i === 2 ? "cursor-nwse-resize" : "cursor-nesw-resize"}>
          <title>Dra: storlek (Shift: samma form)</title>
        </rect>
      ))}
      <circle data-place={id} data-grip="turn" tabIndex={0} role="button" aria-label={`Riktning ${placeCode(id)}`} cx={turn.at.x} cy={turn.at.y} r={7 * unit} fill={SELECTED} stroke="#d9b96a" strokeWidth={3} vectorEffect="non-scaling-stroke" className="cursor-crosshair outline-none">
        <title>Dra: riktning (Shift: 15°) · pilar: 1° (Shift: 15°)</title>
      </circle>
    </g>
  );
}

/** The window card as the films show it, where the plan's shoe point stands: moved as far as that point is from the start proposal's. */
function windowCard(plan: PlacementPlan, view: View): Pt[] {
  const at = toPixels(plan.shoe[view], view);
  const was = toPixels(defaultPlan().shoe[view], view);
  return WINDOW_CARD[view].map((p) => ({ x: p.x + at.x - was.x, y: p.y + at.y - was.y }));
}

/**
 * "Spela kortbanan": the schematic run from the shoe's window to the card and the hand back (lib/placement-path.ts), again
 * and again until it is stopped; `speed` 0.5 is half speed. The step shown is handed up as it changes, for the step chips.
 */
function PathLayer({ plan, id, view, speed, onPhase }: { plan: PlacementPlan; id: string; view: View; speed: number; onPhase: (phase: PathPhase) => void }) {
  const [t, setT] = useState(0);
  const rate = useRef(speed);
  const told = useRef(onPhase);
  useEffect(() => {
    rate.current = speed;
    told.current = onPhase;
  });
  useEffect(() => {
    let last = performance.now();
    let at = 0;
    let frame = 0;
    const tick = (now: number) => {
      at = (at + ((now - last) / 1000) * (rate.current / PATH_SECONDS)) % 1;
      last = now;
      setT(at);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const intent: Intent = plan.targets[id].intent;
  const f = pathFrame(t, windowCard(plan, view), planQuad(plan, id, view), intent);
  useEffect(() => {
    told.current(f.phase);
  }, [f.phase]);
  const h = f.hand;
  const ink = h.palm ? "#5b4680" : "#f3eaff";
  return (
    <g pointerEvents="none" data-phase={f.phase} data-seconds={f.seconds.toFixed(2)}>
      <path d={f.arc} fill="none" stroke="#d3b4ff" strokeWidth={2.5} strokeDasharray="9 8" vectorEffect="non-scaling-stroke" />
      <polygon points={pts(f.points)} {...plain(COLOUR[f.side])} />
      {/* the hand: a plain shape, its back dark and its palm light, so that the wrist's turn reads */}
      <g opacity={intent.grip === "DRAG" ? 0.82 : 0.95}>
        <polygon points={pts(h.wrist)} fill="#2b2338" stroke="#f3eaff" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polygon points={pts(h.outline)} fill={h.palm ? "#efe3ff" : "#6b5590"} stroke={ink} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polygon points={pts(h.thumb)} fill={h.palm ? "#e2d1f7" : "#7d67a3"} stroke={ink} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {h.crease ? <polyline points={pts(h.crease)} fill="none" stroke="#5b4680" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
        <text x={h.label.x} y={h.label.y + h.size * 0.14} textAnchor="middle" fontSize={Math.max(12, h.size * 0.38)} fontWeight={700} fill={ink}>
          {f.handName === "LH" ? "V" : "H"}
        </text>
      </g>
    </g>
  );
}

