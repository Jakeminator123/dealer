"use client";

// <Fold lines={2}>long text</Fold>: text cut to a few lines, with "Visa mer" only when there is more. Long text on demand.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui/cn";

const CLAMP: Record<number, string> = { 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4" };

export function Fold({ children, lines = 2, className, more = "Visa mer", less = "Visa mindre" }: { children: ReactNode; lines?: 1 | 2 | 3 | 4; className?: string; more?: string; less?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setOver(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, open]);
  return (
    <div className={cn("min-w-0", className)}>
      <div ref={box} className={cn(!open && CLAMP[lines])}>
        {children}
      </div>
      {over || open ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-0.5 text-xs font-medium text-brass-hi hover:text-brass hover:underline">
          {open ? less : more}
        </button>
      ) : null}
    </div>
  );
}
