"use client";

// const toast = useToast(); toast({tone: "ok", title: "Sparat", detail: "Primär för A2.1 → P4C1"}): a short note in the
// lower left corner, beside the rail (clear of a side sheet and of a centred transport), that goes by itself (ok/info 3,5 s, bad 7 s; it stays while the pointer is on it). One ToastProvider in the shell.
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export type ToastTone = "ok" | "bad" | "info";
export type ToastInput = { tone?: ToastTone; title: ReactNode; detail?: ReactNode; duration?: number };
type Item = Required<Pick<ToastInput, "tone" | "duration">> & ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function useToast(): (toast: ToastInput) => void {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast används utanför ToastProvider (skalet).");
  return toast;
}

const ICON: Record<ToastTone, ReactNode> = {
  ok: <CircleCheck className="text-godkand" />,
  bad: <CircleAlert className="text-underkand" />,
  info: <Info className="text-dim" />,
};

function ToastView({ item, onDone }: { item: Item; onDone: (id: number) => void }) {
  const [held, setHeld] = useState(false);
  const left = useRef(item.duration);
  useEffect(() => {
    if (held) return;
    const started = Date.now();
    const timer = window.setTimeout(() => onDone(item.id), left.current);
    return () => {
      window.clearTimeout(timer);
      left.current = Math.max(1200, left.current - (Date.now() - started));
    };
  }, [held, item.id, onDone]);
  return (
    <div
      role={item.tone === "bad" ? "alert" : "status"}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      className="pointer-events-auto flex w-[340px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-lg border border-line-strong bg-raised py-3 pl-3.5 pr-2 shadow-pop animate-toast-in [&_svg]:size-[18px] [&_svg]:shrink-0"
    >
      <span className="mt-px">{ICON[item.tone]}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-sm font-medium text-ink">{item.title}</div>
        {item.detail ? <div className="text-xs text-dim">{item.detail}</div> : null}
      </div>
      <button
        type="button"
        aria-label="Stäng"
        onClick={() => onDone(item.id)}
        className="-my-0.5 grid size-6 place-items-center rounded-sm text-faint transition-colors hover:bg-overlay hover:text-ink [&_svg]:size-3.5"
      >
        <X />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const serial = useRef(0);
  const done = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback((input: ToastInput) => {
    const tone = input.tone ?? "info";
    const item: Item = { ...input, tone, duration: input.duration ?? (tone === "bad" ? 7000 : 3500), id: ++serial.current };
    setItems((list) => [...list.slice(-3), item]);
  }, []);
  const value = useMemo(() => toast, [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className={cn("pointer-events-none fixed bottom-4 left-[92px] z-[60] flex flex-col items-start gap-2")}>
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDone={done} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
