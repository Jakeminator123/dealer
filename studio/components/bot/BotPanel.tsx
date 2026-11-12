"use client";

// The panel's parts, used both docked beside the view (BotDock, from 1200 px) and as the kit's Sheet below that:
// the header's buttons, the body (the conversation, or the request card), and the foot (the view's chip, the question
// field and one faint line about what the answers rest on; or the card's two buttons).
import { Eye, Plus, RotateCcw, SquarePen, X } from "lucide-react";
import { useBot } from "./BotProvider";
import { Conversation } from "./Conversation";
import { Composer } from "./Composer";
import { contextLine } from "./describe";
import { RequestActions, RequestCard } from "../requests/RequestCard";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { IconButton } from "../ui/IconButton";

export function PanelActions() {
  const bot = useBot()!;
  return (
    <>
      <Button variant="quiet" size="sm" icon={<SquarePen />} onClick={() => bot.startRequest(null)} disabled={!!bot.request} title="Skriv ett önskemål, en fråga eller ett fel till Jakob">
        Tyck till
      </Button>
      <IconButton label="Börja om samtalet" icon={<RotateCcw />} size="sm" onClick={bot.clear} disabled={!bot.lines.length && !bot.request} />
    </>
  );
}

function ContextChip() {
  const bot = useBot()!;
  const view = bot.view;
  if (!view) return null;
  if (!bot.contextOn)
    return (
      <button
        type="button"
        onClick={() => bot.setContextOn(true)}
        className="inline-flex h-6 items-center gap-1 self-start rounded-full border border-dashed border-line-strong px-2 text-2xs text-faint transition-colors hover:border-dim hover:text-dim"
      >
        <Plus className="size-3" /> Ta med vyn ({view.namn})
      </button>
    );
  const text = contextLine(view.namn, view.val);
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 self-start rounded-full border border-line-strong bg-raised pl-2 pr-0.5 text-xs text-ink" title={`Följer med frågan: ${contextLine(view.namn, view.val, 6)}`}>
      <Eye className="size-3.5 shrink-0 text-dim" />
      <span className="truncate">{text}</span>
      <button type="button" aria-label="Skicka inte med vyn" title="Skicka inte med vyn" onClick={() => bot.setContextOn(false)} className="grid size-5 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-overlay hover:text-ink">
        <X className="size-3" />
      </button>
    </span>
  );
}

export function PanelBody() {
  const bot = useBot()!;
  return bot.request ? <RequestCard /> : <Conversation lines={bot.lines} />;
}

export function PanelFoot({ autoFocus }: { autoFocus?: boolean }) {
  const bot = useBot()!;
  if (bot.request) return <RequestActions />;
  return (
    <div className="flex w-full flex-col gap-2">
      <ContextChip />
      <Composer autoFocus={autoFocus} />
      <p className={cn("truncate text-center text-2xs text-faint")}>
        {bot.fake ? "Provläge med låtsassvar" : `Underlag ${bot.underlag ?? "från kopian"}`} · Boten kan ha fel; Jakob avgör.
      </p>
    </div>
  );
}
