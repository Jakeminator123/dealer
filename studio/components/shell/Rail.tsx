"use client";

// The left rail: the six views with the active one marked, counts where they help (takes waiting for Jakob beside Granska,
// edges with a Primär beside Primära), whether the lab answers, and "Gamla labbet ↗" at the bottom (same tab).
import { ArrowUpRight, FlaskConical, Play, ScanEye, SlidersHorizontal, Star, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ComponentType } from "react";
import { useBank } from "../../lib/bank.ts";
import { awaitingJakob, primarCount } from "../../lib/verdict.ts";
import { cn } from "../ui/cn";
import { Tooltip } from "../ui/Tooltip";

type View = { href: string; label: string; hint: string; icon: ComponentType<{ className?: string }> };

export const VIEWS: readonly View[] = [
  { href: "/", label: "Spela", hint: "Spela en runda i scenen", icon: Play },
  { href: "/karta/", label: "Karta", hint: "Nodkartan: ankare, filmer och varianter", icon: Workflow },
  { href: "/primara/", label: "Primära", hint: "Vad som spelas nu, mot bästa godkända", icon: Star },
  { href: "/granska/", label: "Granska", hint: "Filmer som väntar på ditt beslut", icon: ScanEye },
  { href: "/prov/", label: "Prov", hint: "Jämförelsefilmer och kontaktark", icon: FlaskConical },
  { href: "/scen/", label: "Scen", hint: "Rum, ljus, bord, kort och kamera", icon: SlidersHorizontal },
];

const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/** The view a path belongs to ("/jamfor/" belongs to none). */
export function activeView(pathname: string | null): string | null {
  const here = trim(pathname ?? "/");
  return VIEWS.find((v) => trim(v.href) === here)?.href ?? null;
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <rect x="8.5" y="5.5" width="15" height="21" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(-8 16 16)" />
      <path d="M16 11.2 19.6 16 16 20.8 12.4 16Z" fill="currentColor" transform="rotate(-8 16 16)" />
    </svg>
  );
}

function RailItem({ view, active, count, tone }: { view: View; active: boolean; count?: string | null; tone?: "brass" | "neutral" }) {
  const Icon = view.icon;
  return (
    <Tooltip content={view.hint} side="right">
      <Link
        href={view.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative mx-2 flex flex-col items-center gap-1 rounded-lg px-1 pb-1.5 pt-2 transition-colors duration-150",
          active ? "bg-raised text-ink" : "text-dim hover:bg-raised/60 hover:text-ink",
          "focus-visible:outline-offset-0",
        )}
      >
        {active ? <span aria-hidden className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brass" /> : null}
        <span className="relative">
          <Icon className={cn("size-5 transition-colors duration-150", active ? "text-brass" : "text-dim group-hover:text-ink")} />
          {count ? (
            <span
              className={cn(
                "absolute -top-1.5 left-3.5 h-4 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 tabular-nums ring-2",
                active ? "ring-raised" : "ring-surface",
                tone === "brass" ? "bg-brass text-brass-ink" : "bg-overlay text-dim",
              )}
            >
              {count}
            </span>
          ) : null}
        </span>
        <span className="text-[11px] font-medium leading-4 tracking-[0.01em]">{view.label}</span>
      </Link>
    </Tooltip>
  );
}

export function Rail() {
  const pathname = usePathname();
  const active = activeView(pathname);
  const { graph, status, error } = useBank();
  const counts = useMemo(() => {
    if (!graph) return null;
    const p = primarCount(graph);
    return { waiting: awaitingJakob(graph).length, primar: `${p.set}/${p.total}` };
  }, [graph]);
  const offline = !!error;

  return (
    <nav aria-label="Vyer" className="flex h-full w-[76px] flex-col border-r border-line bg-surface">
      <Tooltip content="Dealer Studio" side="right">
        <Link href="/" aria-label="Dealer Studio, till Spela" className="mx-auto mb-2 mt-3 grid size-11 place-items-center rounded-lg text-brass transition-colors hover:bg-raised/60">
          <Mark />
        </Link>
      </Tooltip>
      <div className="mx-4 mb-2 h-px bg-line" />
      <ul className="flex flex-col gap-1">
        {VIEWS.map((view) => (
          <li key={view.href}>
            <RailItem
              view={view}
              active={active === view.href}
              count={view.href === "/granska/" ? (counts && counts.waiting > 0 ? String(counts.waiting) : null) : view.href === "/primara/" ? (counts?.primar ?? null) : null}
              tone={view.href === "/granska/" ? "brass" : "neutral"}
            />
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col items-center gap-2 pb-3">
        <Tooltip content={status === "loading" ? "Läser klippbanken…" : offline ? `Labbet svarar inte: ${error?.message}` : "Labbet svarar · klippbanken läses var 4:e sekund"} side="right">
          <span role="status" aria-label={offline ? "Labbet svarar inte" : "Labbet svarar"} className="grid size-6 place-items-center">
            <span
              className={cn(
                "size-2 rounded-full",
                status === "loading" ? "animate-pulse bg-vantar" : offline ? "bg-underkand shadow-[0_0_0_3px_rgb(224_108_108/0.2)]" : "bg-godkand/80",
              )}
            />
          </span>
        </Tooltip>
        <div className="mx-2 h-px w-[calc(100%-32px)] bg-line" />
        <a
          href="/lab.html"
          className="mx-2 flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-faint transition-colors hover:bg-raised/60 hover:text-ink focus-visible:outline-offset-0"
        >
          <ArrowUpRight className="size-4" />
          <span className="text-[10.5px] font-medium leading-[13px]">
            Gamla
            <br />
            labbet
          </span>
        </a>
      </div>
    </nav>
  );
}
