"use client";

// The left rail: whose studio it is at the top (DealerSwitch: Pamela | Paow), the views with the active one marked, counts
// where they help (the chosen dealer's takes waiting for Jakob beside Granska, edges with a Primär beside Primära), whether
// the lab answers, and "Gamla labbet ↗" at the bottom (same tab). A view's link keeps the chosen dealer in the address.
// In the online copy (lib/mode.ts) there is no old lab, so that link is not drawn; instead the bot is there: the view
// Önskemål (with the answers from Jakob not yet seen) and "Fråga", which opens and closes the panel (components/bot).
import { ArrowUpRight, Clapperboard, FlaskConical, Images, Inbox, MessageCircleQuestion, ScanEye, Send, Spade, SquareDashedMousePointer, Star, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ComponentType } from "react";
import { useBank } from "../../lib/bank.ts";
import { dealerHref } from "../../lib/dealer.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { awaitingJakob, primarCount } from "../../lib/verdict.ts";
import { useBot } from "../bot/BotProvider";
import { useRequests } from "../requests/RequestsProvider";
import { cn } from "../ui/cn";
import { Tooltip } from "../ui/Tooltip";
import { DealerSwitch } from "./DealerSwitch";
import { Glossary } from "./Glossary";

type View = { href: string; label: string; hint: string; icon: ComponentType<{ className?: string }> };

export const VIEWS: readonly View[] = [
  // Scen and the old Spela are one view since 2026-11-12 (Jakob): /scen/ leads to /.
  { href: "/", label: "Scen", hint: "Scenen: spela en runda och ändra allt", icon: Clapperboard },
  { href: "/karta/", label: "Karta", hint: "Nodkartan: ankare, filmer och varianter", icon: Workflow },
  { href: "/primara/", label: "Primära", hint: "Vad som spelas nu, mot bästa godkända", icon: Star },
  { href: "/granska/", label: "Granska", hint: "Filmer som väntar på ditt beslut", icon: ScanEye },
  { href: "/prov/", label: "Prov", hint: "Jämförelsefilmer och kontaktark", icon: FlaskConical },
  { href: "/placering/", label: "Placering", hint: "Var korten och skon ligger: flytta, rikta och spara", icon: SquareDashedMousePointer },
  { href: "/material/", label: "Material", hint: "Per dealer: ingångsbild, keystone, ankare, filmer och referenser", icon: Images },
  { href: "/bestall/", label: "Beställ", hint: "Det här skickas: granska en beställning av bild eller film innan du godkänner", icon: Send },
  { href: "/game/", label: "Casino", hint: "Spela blackjack som i casinot: spelmotorn, marker och reglage, med valt förval", icon: Spade },
];

/** The views the rail shows: the online copy has no game engine and orders nothing, so Casino and Beställ are only in the lab. */
const LAB_ONLY: readonly string[] = ["/game/", "/bestall/"];
const SHOWN: readonly View[] = isSnapshot ? VIEWS.filter((view) => !LAB_ONLY.includes(view.href)) : VIEWS;

/** The view of requests to Jakob: only where the bot is (the online copy). */
export const REQUESTS_VIEW: View = { href: "/onskemal/", label: "Önskemål", hint: "Önskemål till Jakob, med status och hans svar", icon: Inbox };

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

function RailItem({ view, href, active, count, tone }: { view: View; href?: string; active: boolean; count?: string | null; tone?: "brass" | "neutral" }) {
  const Icon = view.icon;
  return (
    <Tooltip content={view.hint} side="right">
      <Link
        href={href ?? view.href}
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

/** "Fråga": opens and closes the bot's panel. Looks like a view in the rail; marked while the panel is open. */
function AskButton() {
  const bot = useBot();
  if (!bot?.enabled) return null;
  return (
    <Tooltip content={bot.open ? "Stäng Fråga" : "Fråga om dealern, eller tyck till"} side="right">
      <button
        type="button"
        aria-pressed={bot.open}
        onClick={() => bot.setOpen(!bot.open)}
        className={cn(
          "group relative mx-2 flex flex-col items-center gap-1 rounded-lg px-1 pb-1.5 pt-2 transition-colors duration-150 focus-visible:outline-offset-0",
          bot.open ? "bg-raised text-ink" : "text-dim hover:bg-raised/60 hover:text-ink",
        )}
      >
        <MessageCircleQuestion className={cn("size-5 transition-colors duration-150", bot.open ? "text-brass" : "text-dim group-hover:text-ink")} />
        <span className="text-[11px] font-medium leading-4 tracking-[0.01em]">Fråga</span>
      </button>
    </Tooltip>
  );
}

export function Rail() {
  const pathname = usePathname();
  const active = activeView(pathname);
  const bot = useBot();
  const requests = useRequests();
  const onRequests = trim(pathname ?? "/") === trim(REQUESTS_VIEW.href);
  const { graph, status, error, dealer } = useBank();
  const counts = useMemo(() => {
    if (!graph) return null;
    const p = primarCount(graph);
    return { waiting: awaitingJakob(graph).length, primar: `${p.set}/${p.total}` };
  }, [graph]);
  const offline = !!error;

  return (
    <nav aria-label="Vyer" className="flex h-full w-[76px] flex-col border-r border-line bg-surface">
      <Tooltip content="Dealer Studio" side="right">
        <Link href={dealerHref("/", dealer)} aria-label="Dealer Studio, till Scen" className="mx-auto mb-1.5 mt-3 grid size-11 place-items-center rounded-lg text-brass transition-colors hover:bg-raised/60">
          <Mark />
        </Link>
      </Tooltip>
      <DealerSwitch />
      <div className="mx-4 mb-2 mt-2.5 h-px bg-line" />
      <ul className="flex flex-col gap-1">
        {SHOWN.map((view) => (
          <li key={view.href}>
            <RailItem
              view={view}
              href={dealerHref(view.href, dealer)}
              active={active === view.href}
              count={view.href === "/granska/" ? (counts && counts.waiting > 0 ? String(counts.waiting) : null) : view.href === "/primara/" ? (counts?.primar ?? null) : null}
              tone={view.href === "/granska/" ? "brass" : "neutral"}
            />
          </li>
        ))}
        {bot?.enabled ? (
          <>
            <li aria-hidden className="mx-4 my-1 h-px bg-line" />
            <li>
              <RailItem view={REQUESTS_VIEW} active={onRequests} count={requests.unseen > 0 ? String(requests.unseen) : null} tone="brass" />
            </li>
          </>
        ) : null}
      </ul>
      <div className="mt-auto flex flex-col items-center gap-2 pb-3">
        <Glossary />
        <AskButton />
        <Tooltip
          content={
            status === "loading"
              ? "Läser klippbanken…"
              : offline
                ? `${isSnapshot ? "Kopian" : "Labbet"} svarar inte: ${error?.message}`
                : isSnapshot
                  ? "Kopian svarar · klippbanken är fryst som den var när kopian gjordes"
                  : "Labbet svarar · klippbanken läses var 4:e sekund"
          }
          side="right"
        >
          <span role="status" aria-label={offline ? `${isSnapshot ? "Kopian" : "Labbet"} svarar inte` : `${isSnapshot ? "Kopian" : "Labbet"} svarar`} className="grid size-6 place-items-center">
            <span
              className={cn(
                "size-2 rounded-full",
                status === "loading" ? "animate-pulse bg-vantar" : offline ? "bg-underkand shadow-[0_0_0_3px_rgb(224_108_108/0.2)]" : "bg-godkand/80",
              )}
            />
          </span>
        </Tooltip>
        {isSnapshot ? null : (
          <>
            <div className="mx-2 h-px w-[calc(100%-32px)] bg-line" />
            <a
              href="/lab.html?gamla=1"
              className="mx-2 flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-center text-faint transition-colors hover:bg-raised/60 hover:text-ink focus-visible:outline-offset-0"
            >
              <ArrowUpRight className="size-4" />
              <span className="text-[10.5px] font-medium leading-[13px]">
                Gamla
                <br />
                labbet
              </span>
            </a>
          </>
        )}
      </div>
    </nav>
  );
}
