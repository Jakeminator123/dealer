"use client";

// Bordet's picture (Kortplan), as large as the area allows, with the cards on it and the handles on the chosen one.
// Under the cards lies a doll's picture (the chosen dealer's own until another is chosen) or a film of hers at a frame, in
// the bank's picture's pixels (the plan's one view, PLAN_VIEW). A card
// is drawn as the films show it, a plain yellow back (closed) or a plain blue face (open), over the quads (placement-model
// src/card-plan.ts planCardQuad: real cards through the table's lens on "Verkligt perspektiv", CARD_COLOUR); how the game
// prints it is afterwork. Over that lies one SVG in the view's own pixels with the handles:
//   drag a card or the shoe: move it · the round handle beyond the far edge: riktning (Shift: 15°) · a near corner: size
//   (Shift: same shape) · a far corner: perspektiv. Arrow keys: a pixel (Shift ten); on the round handle a degree (Shift 15).
// On the plan's table (Verkligt perspektiv: a real card, 1,00, through the lens) only moving is possible: the card's size,
// riktning and perspektiv are the lens's, and its size is adjusted only in Efterarbete.
// The stage (lib/bordet.ts camera): it opens with the whole picture laid in it ("Anpassa"); the wheel zooms towards the
// pointer, a drag where there is no card pans, and the control in the corner has Anpassa, 100 %, Spelet (the size the game
// draws the film at in a window of this size, following the window until another zoom is chosen) and Närbild (the chosen
// card in the middle). The cards are one shape (CardShape: rounded corners a share of the card's own side) in the picture's
// pixels, and the handles keep their size on screen, so both stay crisp and look the same at every zoom. Every gesture is one
// step for Ångra; nothing is saved from here.
import { Focus, Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SVGProps } from "react";
import { CARD_COLOUR, SHOE, TARGETS, VIEWS, WINDOW_CARD, angleToward, defaultPlan, editPlace, fromPixels, toPixels, type Place, type PlacementPlan, type Side, type View } from "../../../src/placement-model.ts";
import { planCardQuad } from "../../../src/card-plan.ts";
import { actualCamera, cardPath, clampCamera, closeUp, fitCamera, fitScale, gameCamera, gameScale, panBy, pictureOrigin, scaleWords, zoomAt, type Camera, type Size } from "../../lib/bordet.ts";
import { PLAN_VIEW, centreOf, nudged, placeCode, sideWord, sizeFromCorner, taperFromCorner, turnHandle, type Pt } from "../../lib/placement.ts";
import { IconButton } from "../ui";
import { cn } from "../ui/cn";
import { CardMark } from "./CardMark";
import { draftActions } from "./useDraft.ts";

export type Backdrop = { kind: "still"; src: string } | { kind: "film"; src: string; fps: number; frame: number };

const COLOUR = CARD_COLOUR;
/** The chosen card's (or the shoe's) marking: a colour no card has, so it is not read as a card's rim. */
const SELECTED = "#ff4fd8";
/** A card on the order list (Bordet's step 3): a brass ring round it. */
const MARKED = "#e8cb85";
type Grip = "move" | "turn" | "size" | "taper";

/**
 * Every card on the stage, one shape: yellow (closed) or blue (open), the films' own colours (CARD_COLOUR), with
 * rounded corners and no rim (Jakob 2026-11-17); each side carries its own marks, the same on every card (CardMark, Jakob
 * 2026-11-20 and 2026-11-24). `grow` widens it by that many picture pixels all round (the shoe's card,
 * to cover the backdrop's pale window edge).
 */
export function CardShape({ quad, side, grow = 0, ...rest }: { quad: readonly Pt[]; side: Side; grow?: number } & Omit<SVGProps<SVGPathElement>, "d" | "fill" | "stroke">) {
  const colour = COLOUR[side];
  return (
    <>
      <path d={cardPath(quad)} fill={colour} stroke={grow ? colour : "none"} strokeWidth={grow * 2} strokeLinejoin="round" {...rest} />
      <CardMark quad={quad} side={side} />
    </>
  );
}

const onResize = (changed: () => void) => {
  window.addEventListener("resize", changed);
  return () => window.removeEventListener("resize", changed);
};
/** The window's size, following every resize: what the game would have for its picture ("Spelet"). Nothing before the page is in a window. */
function useWindowSize(): Size {
  const size = useSyncExternalStore(onResize, () => `${window.innerWidth} ${window.innerHeight}`, () => "0 0");
  return useMemo(() => {
    const [w, h] = size.split(" ").map(Number);
    return { w, h };
  }, [size]);
}

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
  selected,
  onSelect,
  editable,
  allCards,
  grid,
  changed,
  backdrop,
  shoeCard,
  videoRef,
  label,
  marked,
  className,
}: {
  plan: PlacementPlan;
  /** The other plan, for the dashed outlines of where the changed cards lie there (the saved plan, or the draft while the saved one is shown); null to draw none. */
  other: PlacementPlan | null;
  selected: Place;
  onSelect: (id: Place) => void;
  editable: boolean;
  allCards: boolean;
  grid: boolean;
  changed: ReadonlySet<Place>;
  backdrop: Backdrop;
  /** Paint the card in the shoe's window yellow with its marks over the doll picture's film card and the window's pale edge; false under a film, which shows its own card. */
  shoeCard: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** A short name of what lies under the cards, shown in the picture's corner. */
  label: string;
  /** Cards with a ring round them (Bordet: the cards on the order list). */
  marked?: ReadonlySet<Place>;
  className?: string;
}) {
  const view = PLAN_VIEW;
  const W = VIEWS[view].width;
  const H = VIEWS[view].height;
  const flat = plan.tableProjection?.mode === "flat";
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });

  // ── the stage's camera: null is "Anpassa" (the whole picture, following the stage's size); else zoomed and panned ──
  useLayoutEffect(() => {
    const el = wrap.current!;
    const read = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const picture = { w: W, h: H };
  const [held, setHeld] = useState<Camera | null>(null);
  // "Spelet": the scale is the game's for the window and follows it; a pan keeps it, any other zoom ends it (zoomTo, and the wheel).
  const [asGame, setAsGame] = useState(false);
  const zoomTo = (c: Camera | null) => {
    setAsGame(false);
    setHeld(c);
  };
  const [heldView, setHeldView] = useState(view);
  if (heldView !== view) {
    setHeldView(view);
    zoomTo(null);
  }
  const win = useWindowSize();
  const camera = !held ? fitCamera(area, picture) : asGame ? gameCamera(held, win, area, picture) : clampCamera(held, area, picture);
  const cam = useRef({ camera, area, picture });
  useLayoutEffect(() => {
    cam.current = { camera, area, picture };
  });
  useEffect(() => {
    const el = wrap.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const { camera: c, area: a, picture: p } = cam.current;
      setAsGame(false);
      setHeld(zoomAt(c, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), { x: e.clientX - r.left, y: e.clientY - r.top }, a, p));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  // A drag where there is no card (or with the middle button) pans the picture.
  const pan = useRef<{ x: number; y: number; from: Camera } | null>(null);
  const panDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    pan.current = { x: e.clientX, y: e.clientY, from: camera };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const panMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (p) setHeld(panBy(p.from, e.clientX - p.x, e.clientY - p.y, area, picture));
  };
  const panUp = () => void (pan.current = null);
  const origin = pictureOrigin(camera, area);
  const boxW = W * camera.scale;
  const boxH = H * camera.scale;
  const unit = 1 / Math.max(1e-6, camera.scale); // the view's pixels per screen pixel: handles keep their size on screen

  // ── a film under the cards: at its frame when loaded; afterwards the film bar moves it ──
  const backdropKey = `${backdrop.kind}:${backdrop.src}`;
  useEffect(() => {
    if (backdrop.kind !== "film") return;
    const video = videoRef.current;
    if (!video) return;
    const meta = () => {
      if (backdrop.frame > 0 && Math.abs(video.currentTime * backdrop.fps - backdrop.frame) > 0.5) video.currentTime = (backdrop.frame + 0.001) / backdrop.fps;
    };
    video.addEventListener("loadedmetadata", meta);
    if (video.readyState >= 1) meta();
    return () => video.removeEventListener("loadedmetadata", meta);
    // the frame is read once when the film is loaded; afterwards the film bar moves it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdropKey, videoRef]);

  // ── gestures ──
  const drag = useRef<{ grip: Grip; id: Place; du: number; dv: number } | null>(null);
  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const el = (e.target as Element).closest<SVGElement>("[data-place]");
    // no card under the pointer: the stage pans (the event goes on to it)
    if (!el) return;
    e.stopPropagation();
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
  const q = target ? planCardQuad(plan, selected, view) : null;
  const shoe = toPixels(plan.shoe[view], view);
  const r = 6 * unit;
  const handles = editable && q && target;
  const chosenQuad = q ?? (selected === SHOE ? windowCard(plan, view) : null);
  return (
    <div
      ref={wrap}
      data-stage
      className={cn("relative min-h-0 min-w-0 cursor-grab touch-none overflow-hidden bg-well active:cursor-grabbing", className)}
      onPointerDown={panDown}
      onPointerMove={panMove}
      onPointerUp={panUp}
      onPointerCancel={panUp}
      onDoubleClick={(e) => {
        if (!(e.target as Element).closest("[data-place], [data-zoom]")) zoomTo(null);
      }}
    >
      <div data-picture className="absolute overflow-hidden shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_18px_50px_rgb(0_0_0/0.45)]" style={{ left: origin.left, top: origin.top, width: boxW, height: boxH }}>
        {backdrop.kind === "still" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={backdrop.src}
            src={backdrop.src}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full select-none object-fill"
          />
        ) : (
          <video key={backdrop.src} ref={videoRef} src={backdrop.src} muted playsInline preload="auto" disablePictureInPicture className="absolute inset-0 size-full object-fill" />
        )}
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
          {shoeCard ? (
            // the card standing in the shoe's window, yellow with its marks as in the films and no pale rim round it: the films' card
            // (WINDOW_CARD), where it hides the pale window edge of the doll's picture
            <CardShape quad={windowCard(plan, view)} side="BACK" grow={2} pointerEvents="none">
              <title>Kortet i skon · stängt</title>
            </CardShape>
          ) : null}
          {other && changed.size
            ? shown
                .filter((id) => changed.has(id) && other.targets[id])
                .map((id) => (
                  <path key={`was-${id}`} d={cardPath(planCardQuad(other, id, view))} fill="none" stroke="#d9b96a" strokeOpacity={0.75} strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                ))
            : null}
          {marked?.size
            ? [...marked]
                .filter((id) => id !== SHOE && plan.targets[id])
                .map((id) => {
                  const quad = planCardQuad(plan, id, view);
                  const c = centreOf(quad);
                  const reach = Math.max(...quad.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
                  return <circle key={`mark-${id}`} data-marked={id} cx={c.x} cy={c.y} r={reach * 1.6} fill="none" stroke={MARKED} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
                })
            : null}
          {shown.map((id) => {
            const t = plan.targets[id];
            const quad = planCardQuad(plan, id, view);
            const c = toPixels(t.geometry[view], view);
            const on = id === selected;
            return (
              <g key={id}>
                {/* a card is a plain shape with rounded corners; only the chosen one is marked, in pink, round it */}
                <CardShape
                  quad={quad}
                  side={t.intent.endSide}
                  data-place={id}
                  data-grip="move"
                  tabIndex={0}
                  role="button"
                  aria-label={`${placeCode(id)}, ${sideWord(t.intent.endSide)}`}
                  className={cn("outline-none", editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
                >
                  <title>{`${placeCode(id)} · ${sideWord(t.intent.endSide)}`}</title>
                </CardShape>
                {on ? <path d={cardPath(quad)} fill="none" stroke={SELECTED} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
                {/* one label per seat: the chosen card's full code where it is in the seat, else the seat at its first card */}
                {on || (id.endsWith("1") && id.split(".")[0] !== selected.split(".")[0]) ? (
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
        </svg>
      </div>
      {/* what lies under the cards: in the stage's corner, in sight at every zoom */}
      {label ? <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-sm border border-white/25 bg-[#121815]/75 px-2 py-1 text-2xs font-medium text-white">{label}</span> : null}
      <ZoomControl
        camera={camera}
        fitted={!held}
        game={{ on: !!held && asGame, title: gameTitle(gameScale(win), fitScale(area, picture)) }}
        onOut={() => zoomTo(zoomAt(camera, 1 / 1.25, { x: area.w / 2, y: area.h / 2 }, area, picture))}
        onIn={() => zoomTo(zoomAt(camera, 1.25, { x: area.w / 2, y: area.h / 2 }, area, picture))}
        onFit={() => zoomTo(null)}
        onActual={() => zoomTo(actualCamera(camera, area, picture))}
        onGame={() => {
          setHeld(camera);
          setAsGame(true);
        }}
        onClose={chosenQuad ? () => zoomTo(closeUp(chosenQuad, area, picture)) : null}
      />
    </div>
  );
}

/**
 * The hover text of "Spelet", in plain words: the size the game has in a window like this one. Where the game draws the
 * film smaller than the whole picture lies on the stage (an upright window in one column, where the stage is nearly as wide
 * as the window), the whole picture is shown, since the stage never zooms out past it, and the text says so.
 */
const gameTitle = (game: number, fit: number) =>
  game < fit - 0.005
    ? `Spelet visar filmen mindre än så här i det här fönstret (${scaleWords({ scale: game })}): här visas hela bilden`
    : `Lika stort som spelet visar filmen i ett fönster av den här storleken (${scaleWords({ scale: game })})`;

/** The stage's zoom, in its upper right corner (over the room, not the table): −, the scale, +, Anpassa, 100 %, Spelet (the game's size in this window) and Närbild (the chosen card). */
function ZoomControl({
  camera, fitted, game, onOut, onIn, onFit, onActual, onGame, onClose,
}: {
  camera: Camera;
  fitted: boolean;
  /** "Spelet": whether the stage follows the game's size now, and the button's hover text. */
  game: { on: boolean; title: string };
  onOut: () => void;
  onIn: () => void;
  onFit: () => void;
  onActual: () => void;
  onGame: () => void;
  onClose: (() => void) | null;
}) {
  const word = "h-7 whitespace-nowrap rounded-sm px-2 text-xs text-dim hover:bg-raised hover:text-ink aria-pressed:bg-brass/12 aria-pressed:text-brass-hi";
  // On a stage narrower than the row (a phone) the buttons wrap to a second line, so that none is cut off at the left edge.
  return (
    <div data-zoom onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} className="absolute right-2.5 top-2.5 flex max-w-[calc(100%-1.25rem)] cursor-default flex-wrap items-center justify-end gap-0.5 rounded-md border border-line bg-surface/90 p-0.5 shadow-pop backdrop-blur-sm">
      <IconButton label="Zooma ut" size="sm" icon={<Minus />} onClick={onOut} />
      <span data-zoom-scale className="min-w-12 text-center text-xs tabular-nums text-ink">
        {scaleWords(camera)}
      </span>
      <IconButton label="Zooma in" size="sm" icon={<Plus />} onClick={onIn} />
      <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
      <button type="button" aria-pressed={fitted} onClick={onFit} title="Hela bilden på ytan (dubbelklick)" className={cn(word, "flex items-center gap-1")}>
        <Maximize className="size-3.5" />
        Anpassa
      </button>
      <button type="button" aria-pressed={Math.abs(camera.scale - 1) < 0.005} onClick={onActual} title="En bildpunkt per skärmpunkt" className={word}>
        100 %
      </button>
      <button type="button" data-zoom-game aria-pressed={game.on} onClick={onGame} title={game.title} className={word}>
        Spelet
      </button>
      <button type="button" disabled={!onClose} onClick={onClose ?? undefined} title="Det valda kortet nära" className={cn(word, "flex items-center gap-1 disabled:opacity-40")}>
        <Focus className="size-3.5" />
        Närbild
      </button>
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
