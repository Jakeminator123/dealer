"use client";

// Where the panel lives. From 1200 px it is docked as the shell's right column (about 400 px, dragged between 360 and
// 560 by its left edge, double-click for 400), and the kit's other side panels (a film's takes on Karta) dock to its left
// instead of under it. Below 1200 px it is the kit's Sheet over the right edge. Closed, a round brass button in the lower
// right opens it (and "Fråga" in the rail). Esc closes it; a picture can be pasted into it or dropped on it.
// It also hosts the pen (one editor for the question and the request) and the welcome of the first visit.
import { ImageDown, MessageCircleQuestion, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KritaEditor } from "../krita/KritaEditor";
import { pictureIn } from "../krita/capture";
import { Badge } from "../ui/Badge";
import { Sheet } from "../ui/Dialog";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import { cn } from "../ui/cn";
import { WIDTH, useBot } from "./BotProvider";
import { PanelActions, PanelBody, PanelFoot } from "./BotPanel";
import { Welcome } from "./Welcome";

/** Whether the window is at least this wide (false before the first render in the browser). */
export function useWide(min = 1200): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${min}px)`);
    const read = () => setWide(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, [min]);
  return wide;
}

/** Paste and drop of a picture anywhere in the panel. */
function usePictureDrop() {
  const bot = useBot()!;
  const [over, setOver] = useState(false);
  const target = bot.request ? "onskemal" : "fraga";
  return {
    over,
    handlers: {
      onPaste: (e: React.ClipboardEvent) => {
        if (e.defaultPrevented) return;
        const file = pictureIn(e.clipboardData.items, e.clipboardData.files);
        if (!file) return;
        e.preventDefault();
        void bot.takePicture(file, target);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const file = pictureIn(e.dataTransfer.items, e.dataTransfer.files);
        if (!file) return;
        e.preventDefault();
        void bot.takePicture(file, target);
      },
    },
  };
}

function DropVeil({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-brass/60 bg-canvas/85 text-sm text-ink animate-fade-in">
      <span className="flex items-center gap-2">
        <ImageDown className="size-5 text-brass" /> Släpp bilden här
      </span>
    </div>
  );
}

function ResizeHandle() {
  const bot = useBot()!;
  const [drag, setDrag] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Panelens bredd"
      aria-valuemin={WIDTH.min}
      aria-valuemax={WIDTH.max}
      aria-valuenow={bot.width}
      tabIndex={0}
      title="Dra för att ändra bredden"
      data-drag={drag || undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
      }}
      onPointerMove={(e) => {
        if (drag) bot.setWidth(window.innerWidth - e.clientX);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDrag(false);
      }}
      onDoubleClick={() => bot.setWidth(WIDTH.start)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") bot.setWidth(bot.width + 16);
        if (e.key === "ArrowRight") bot.setWidth(bot.width - 16);
      }}
      className="group absolute inset-y-0 -left-[5px] z-20 w-[9px] cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span className="absolute inset-y-0 left-1 w-px transition-colors group-hover:bg-line-strong group-focus-visible:bg-brass group-data-[drag]:bg-brass/70" />
    </div>
  );
}

function Title() {
  const bot = useBot()!;
  return (
    <span className="flex items-center gap-2">
      Fråga
      {bot.fake ? (
        <Badge tone="neutral" title="Låtsassvar, ingen riktig bot (?fejk=1)">
          prov
        </Badge>
      ) : null}
    </span>
  );
}

function Docked() {
  const bot = useBot()!;
  const panel = useRef<HTMLElement>(null);
  const { over, handlers } = usePictureDrop();

  // Esc in the panel closes it, before any side panel of the view hears it (Radix listens on the document).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !panel.current?.contains(e.target as Node)) return;
      if (panel.current.querySelector("[role=menu]")) return; // the picture menu closes first
      e.stopPropagation();
      bot.setOpen(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [bot]);

  return (
    <aside ref={panel} data-capture="skip" data-bot-panel aria-label="Fråga" className="relative flex h-dvh min-h-0 min-w-0 flex-col border-l border-line bg-surface animate-fade-in" {...handlers}>
      <ResizeHandle />
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-line pl-5 pr-2.5">
        <h2 className="font-display text-md font-semibold text-ink">
          <Title />
        </h2>
        <div className="ml-auto flex items-center gap-0.5">
          <PanelActions />
          <IconButton label="Stäng" kbd="Esc" icon={<X />} onClick={() => bot.setOpen(false)} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 [scrollbar-gutter:stable]">
        <PanelBody />
      </div>
      <div className="shrink-0 border-t border-line bg-surface px-4 pb-2.5 pt-3">
        <PanelFoot autoFocus />
      </div>
      <DropVeil on={over} />
    </aside>
  );
}

function AsSheet() {
  const bot = useBot()!;
  const { over, handlers } = usePictureDrop();
  return (
    <Sheet
      open={bot.open}
      onOpenChange={bot.setOpen}
      title={<Title />}
      width={440}
      actions={<PanelActions />}
      className="[&>div:nth-child(2)]:flex [&>div:nth-child(2)]:flex-col [&>div:nth-child(2)]:py-0"
      footer={
        <div data-bot-panel className="w-full" {...handlers}>
          <PanelFoot autoFocus />
        </div>
      }
    >
      <div data-bot-panel className="flex min-h-full flex-1 flex-col" {...handlers}>
        <PanelBody />
        <DropVeil on={over} />
      </div>
    </Sheet>
  );
}

function Fab() {
  const bot = useBot()!;
  if (bot.open) return null;
  return (
    <Tooltip content="Fråga om dealern, eller tyck till" side="left">
      <button
        type="button"
        data-capture="skip"
        aria-label="Fråga"
        onClick={() => bot.setOpen(true)}
        className={cn(
          // Above the bottom row where views keep their own controls (Karta's experiments, Spela's keys).
          "fixed bottom-24 right-5 z-30 grid size-12 place-items-center rounded-full bg-brass text-brass-ink animate-pop-in",
          "shadow-[0_10px_28px_-8px_rgb(0_0_0/0.85),0_0_0_1px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.3)] transition-[background-color,transform] duration-150 hover:scale-[1.04] hover:bg-brass-hi active:bg-brass-lo",
        )}
      >
        <MessageCircleQuestion className="size-[22px]" />
      </button>
    </Tooltip>
  );
}

/** The panel's column in the shell's grid: null when closed or narrow. */
export function DockColumn({ wide }: { wide: boolean }) {
  const bot = useBot();
  if (!bot?.enabled || !wide || !bot.open) return null;
  return <Docked />;
}

/** Everything of the bot that is not the column: the narrow sheet, the button, the pen, the welcome, the side-panel rule. */
export function BotLayer({ wide }: { wide: boolean }): ReactNode {
  const bot = useBot();
  if (!bot?.enabled) return null;
  const docked = wide && bot.open;
  return (
    <>
      {docked ? (
        <style>
          {/* The view's side panels dock left of this one. */}
          {`[role="dialog"].fixed.right-0:not([data-bot-panel]){right:${bot.width}px!important}`}
        </style>
      ) : null}
      {!wide ? <AsSheet /> : null}
      <Fab />
      <KritaEditor open={!!bot.editor} blob={bot.editor?.blob ?? null} shapes={bot.editor?.shapes} onCancel={() => bot.closeEditor(null)} onDone={(m) => bot.closeEditor(m)} />
      <Welcome />
    </>
  );
}
