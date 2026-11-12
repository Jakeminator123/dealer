"use client";

// <PictureMenu onPick disabled />: "Bild" and its three ways to a picture: the view, the whole tab (where the browser
// can), a file. A small menu of its own (the kit has none): opens upwards, closes on a click outside and on Esc.
import { AppWindow, Camera, ChevronDown, ImagePlus, ImageUp } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Spinner } from "../ui/Spinner";
import { cn } from "../ui/cn";
import { canCaptureTab } from "../krita/capture";

type Choice = "vy" | "flik" | File;

function Item({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-overlay focus-visible:bg-overlay focus-visible:outline-none [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-dim"
    >
      {icon}
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-ink">{title}</span>
        <span className="text-xs text-faint">{hint}</span>
      </span>
    </button>
  );
}

export function PictureMenu({ onPick, busy = false, className, label = "Bild" }: { onPick: (choice: Choice) => void; busy?: boolean; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => setTab(canCaptureTab()), []);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  const pick = (choice: Choice) => {
    setOpen(false);
    onPick(choice);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-dim transition-colors hover:bg-raised hover:text-ink aria-expanded:bg-raised aria-expanded:text-ink disabled:opacity-60"
      >
        {busy ? <Spinner size="xs" label="Tar bild" /> : <Camera className="size-3.5" />}
        {busy ? "Tar bild…" : label}
        {busy ? null : <ChevronDown className="size-3 opacity-70" />}
      </button>
      {open ? (
        <div id={id} role="menu" aria-label="Bild" className="absolute bottom-full left-0 z-30 mb-1.5 w-64 rounded-lg border border-line-strong bg-raised p-1 shadow-pop animate-pop-in">
          <Item icon={<ImageUp />} title="Ta bild av vyn" hint="Det du ser bredvid panelen" onClick={() => pick("vy")} />
          {tab ? <Item icon={<AppWindow />} title="Hela fliken" hint="Välj fliken i webbläsarens ruta" onClick={() => pick("flik")} /> : null}
          <Item icon={<ImagePlus />} title="Välj en bild…" hint="Eller klistra in med Ctrl+V, eller släpp den här" onClick={() => file.current?.click()} />
        </div>
      ) : null}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (chosen) pick(chosen);
        }}
      />
    </div>
  );
}
