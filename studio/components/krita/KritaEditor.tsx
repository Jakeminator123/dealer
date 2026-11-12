"use client";

// <KritaEditor open blob shapes onCancel onDone />: the pen. A picture large in a dialog, and over it pen, arrow, frame
// and text in four colours and two widths, with undo and redo (Ctrl+Z, Ctrl+Shift+Z). Drawn with Pointer Events on one
// canvas (mouse, touch and stylus alike; touch-action none), shapes kept as a list in the picture's pixels and drawn again
// on every change. "Använd bilden" exports one PNG of at most 1600 px (components/krita/draw.ts).
// Built on Radix Dialog directly rather than the kit's Dialog: the picture needs the whole box, and Esc while writing a
// text must end the text, not the dialog.
import * as RD from "@radix-ui/react-dialog";
import { ArrowUpRight, Eraser, Minus, Pencil, Redo2, Square, Type, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { IconButton } from "../ui/IconButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Spinner } from "../ui/Spinner";
import { drawShape, drawShapes, exportPicture } from "./draw";
import {
  COLOURS,
  COLOUR_ORDER,
  addShape,
  canRedo,
  canUndo,
  clearShapes,
  emptyHistory,
  extendStroke,
  fitInside,
  isMark,
  redo,
  textSize,
  toPicture,
  undo,
  type Colour,
  type History,
  type Point,
  type Shape,
  type Tool,
  type Weight,
} from "./model";

export type Marked = { url: string; w: number; h: number; blob: Blob; shapes: Shape[] };

const TOOLS = [
  { value: "pen" as const, label: "Penna", icon: <Pencil /> },
  { value: "arrow" as const, label: "Pil", icon: <ArrowUpRight /> },
  { value: "rect" as const, label: "Ram", icon: <Square /> },
  { value: "text" as const, label: "Text", icon: <Type /> },
];
const WEIGHTS = [
  { value: "tunn" as const, label: "Tunn", icon: <Minus className="stroke-[1.5]" />, title: "Tunn linje" },
  { value: "tjock" as const, label: "Tjock", icon: <Minus className="stroke-[3.5]" />, title: "Tjock linje" },
];

type Writing = { id: number; at: Point; value: string };

export function KritaEditor({
  open,
  blob,
  shapes,
  onCancel,
  onDone,
}: {
  open: boolean;
  blob: Blob | null;
  /** Marks made earlier on the same picture, to go on with. */
  shapes?: Shape[];
  onCancel: () => void;
  onDone: (marked: Marked) => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [history, setHistory] = useState<History>(() => emptyHistory(shapes ?? []));
  const [tool, setTool] = useState<Tool>("pen");
  const [colour, setColour] = useState<Colour>("red");
  const [weight, setWeight] = useState<Weight>("tjock");
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Shape | null>(null);
  const textField = useRef<HTMLTextAreaElement>(null);

  // A new picture: read it, start from its earlier marks. The last picture is let go only when the next one comes: the
  // dialog still draws it while it fades out.
  const held = useRef<ImageBitmap | null>(null);
  useEffect(() => {
    if (!open || !blob) return;
    let gone = false;
    setFailed(null);
    setBitmap(null);
    setHistory(emptyHistory(shapes ?? []));
    setWriting(null);
    createImageBitmap(blob).then(
      (b) => {
        if (gone) return b.close();
        held.current?.close();
        held.current = b;
        setBitmap(b);
      },
      () => !gone && setFailed("Bilden gick inte att öppna."),
    );
    return () => {
      gone = true;
    };
    // shapes are read once per picture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blob]);

  // The picture as large as the box allows.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || !open) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [open, bitmap]);

  const size = bitmap && box ? fitInside(bitmap.width, bitmap.height, Math.max(80, box.w - 32), Math.max(80, box.h - 32), true) : null;

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c || !bitmap || !size) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(size.w * ratio);
    const h = Math.round(size.h * ratio);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d")!;
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, w, h);
      ctx.setTransform(w / bitmap.width, 0, 0, h / bitmap.height, 0, 0);
      drawShapes(ctx, history.present, bitmap.width, bitmap.height);
      if (draft.current) drawShape(ctx, draft.current, bitmap.width, bitmap.height);
    } catch {
      /* a picture already let go (the dialog fading out): nothing to draw */
    }
  }, [bitmap, size, history]);

  useEffect(redraw, [redraw]);

  const point = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect();
    return toPicture(e.clientX, e.clientY, rect, bitmap!.width, bitmap!.height);
  };

  // The text being written, also in a ref: a click elsewhere and the field's blur both end it, and only the first counts.
  const writingRef = useRef<Writing | null>(null);
  const textSerial = useRef(0);
  const startText = (at: Point) => {
    const next = { id: ++textSerial.current, at, value: "" };
    writingRef.current = next;
    setWriting(next);
  };
  /** The text as a shape, or null when nothing was written. */
  const textShape = (w: Writing | null): Shape | null => {
    if (!w) return null;
    const shape: Shape = { kind: "text", colour, weight, at: w.at, text: w.value.trim() };
    return isMark(shape) ? shape : null;
  };
  const finishText = (keep: boolean, id?: number) => {
    const w = writingRef.current;
    if (!w || (id !== undefined && w.id !== id)) return;
    writingRef.current = null;
    setWriting(null);
    const shape = keep ? textShape(w) : null;
    if (shape) setHistory((h) => addShape(h, shape));
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!bitmap || e.button > 0) return;
    e.preventDefault();
    const p = point(e);
    finishText(true);
    if (tool === "text") {
      startText(p);
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer tracks: the stroke still follows the moves it gets */
    }
    draft.current = tool === "pen" ? { kind: "pen", colour, weight, points: [p] } : { kind: tool, colour, weight, from: p, to: p };
    redraw();
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = draft.current;
    if (!d || !bitmap) return;
    if (d.kind === "pen") {
      const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
      let points = d.points;
      for (const ev of events.length ? events : [e.nativeEvent]) points = extendStroke(points, point(ev));
      draft.current = { ...d, points };
    } else if (d.kind === "arrow" || d.kind === "rect") draft.current = { ...d, to: point(e) };
    redraw();
  };

  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = draft.current;
    draft.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d && isMark(d, bitmap ? Math.max(bitmap.width, bitmap.height) * 0.004 : 4)) setHistory((h) => addShape(h, d));
    else redraw();
  };

  const keys = (e: KeyboardEvent) => {
    if (writing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      setHistory(redo);
    }
  };

  const done = async () => {
    if (!bitmap || !blob) return;
    setBusy(true);
    const text = textShape(writingRef.current);
    finishText(false);
    const present = text ? [...history.present, text] : history.present;
    // One frame for the button's spinner before the export holds the thread.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const out = exportPicture(bitmap, bitmap.width, bitmap.height, present);
      onDone({ ...out, blob, shapes: present });
    } catch {
      setFailed("Bilden gick inte att spara.");
    }
    setBusy(false);
  };

  useEffect(() => {
    if (writing) requestAnimationFrame(() => textField.current?.focus());
  }, [writing]);

  const scale = bitmap && size ? size.w / bitmap.width : 1;
  const fontPx = bitmap ? textSize(weight, bitmap.width, bitmap.height) * scale : 16;

  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <RD.Content
          data-capture="skip"
          onKeyDown={keys}
          onEscapeKeyDown={(e) => {
            if (writing) {
              e.preventDefault();
              finishText(false);
            }
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex h-[min(900px,calc(100dvh-32px))] w-[min(1320px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-xl border border-line-strong bg-surface shadow-pop focus:outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-fade-out",
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
            <div className="mr-1 flex min-w-0 flex-col">
              <RD.Title className="font-display text-md font-semibold text-ink">Markera i bilden</RD.Title>
              <RD.Description className="text-xs text-dim">Rita, peka med en pil, ringa in eller skriv.</RD.Description>
            </div>
            <span aria-hidden className="h-6 w-px bg-line" />
            <SegmentedControl
              label="Verktyg"
              value={tool}
              onChange={(t) => {
                finishText(true);
                setTool(t);
              }}
              options={TOOLS}
            />
            <div role="radiogroup" aria-label="Färg" className="flex items-center gap-1.5 rounded-md border border-line bg-well px-2 py-1">
              {COLOUR_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={colour === c}
                  aria-label={COLOURS[c].label}
                  title={COLOURS[c].label}
                  onClick={() => setColour(c)}
                  className={cn(
                    "size-5 rounded-full transition-[box-shadow,transform] duration-150 focus-visible:outline-offset-1",
                    colour === c ? "scale-110 shadow-[0_0_0_2px_var(--color-well),0_0_0_3.5px_var(--color-ink)]" : "hover:scale-110",
                  )}
                  style={{ background: COLOURS[c].hex }}
                />
              ))}
            </div>
            <SegmentedControl label="Linje" value={weight} onChange={setWeight} options={WEIGHTS} />
            <div className="flex items-center gap-0.5">
              <IconButton label="Ångra" kbd="Ctrl+Z" icon={<Undo2 />} disabled={!canUndo(history)} onClick={() => setHistory(undo)} />
              <IconButton label="Gör om" kbd="Ctrl+Shift+Z" icon={<Redo2 />} disabled={!canRedo(history)} onClick={() => setHistory(redo)} />
              <IconButton label="Ta bort alla markeringar" icon={<Eraser />} disabled={!history.present.length} onClick={() => setHistory(clearShapes)} />
            </div>
            <RD.Close asChild>
              <IconButton label="Stäng utan bild" icon={<X />} className="ml-auto" />
            </RD.Close>
          </div>

          <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden bg-well">
            {failed ? (
              <p className="grid h-full place-items-center text-sm text-[#ef8b8b]">{failed}</p>
            ) : !bitmap || !size ? (
              <div className="grid h-full place-items-center text-dim">
                <Spinner size="lg" label="Öppnar bilden" />
              </div>
            ) : (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: size.w, height: size.h }}>
                <canvas
                  ref={canvas}
                  aria-label="Bilden att rita i"
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  className={cn("block size-full touch-none select-none rounded-sm shadow-[0_0_0_1px_var(--color-line-strong),0_12px_40px_-12px_rgb(0_0_0/0.8)]", tool === "text" ? "cursor-text" : "cursor-crosshair")}
                  style={{ width: size.w, height: size.h }}
                />
                {writing ? (
                  <textarea
                    ref={textField}
                    rows={1}
                    value={writing.value}
                    aria-label="Text i bilden"
                    placeholder="Skriv…"
                    onChange={(e) => {
                      const next = { ...writing, value: e.target.value };
                      writingRef.current = next;
                      setWriting(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        finishText(true, writing.id);
                      }
                    }}
                    onBlur={() => finishText(true, writing.id)}
                    className="absolute min-w-24 resize-none overflow-hidden whitespace-pre rounded-xs border border-dashed border-white/50 bg-black/25 px-1 font-semibold leading-[1.25] outline-none [field-sizing:content] placeholder:text-white/40"
                    style={{ left: writing.at.x * scale - 5, top: writing.at.y * scale - fontPx * 0.66, fontSize: fontPx, color: COLOURS[colour].hex }}
                  />
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <p className="min-w-0 flex-1 truncate text-xs text-faint">
              {tool === "text" ? "Klicka där texten ska stå, skriv, tryck Enter." : "Dra i bilden. Fungerar med mus, finger och penna."}
            </p>
            <RD.Close asChild>
              <Button variant="quiet">Avbryt</Button>
            </RD.Close>
            <Button variant="primary" loading={busy} disabled={!bitmap} onClick={() => void done()}>
              Använd bilden
            </Button>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
