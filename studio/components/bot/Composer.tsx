"use client";

// Where the question is written: the picture waiting to go (with "Rita" to mark it again), the text (Enter sends,
// Shift+Enter a new line), "Bild", the level (Snabb, Grundlig) and the brass send button, which turns into a stop button
// while the answer comes. A picture can also be pasted (Ctrl+V) or dropped on the panel.
import { ArrowUp, Pencil, Square, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { QUESTION_LIMIT, type Niva } from "../../lib/bot-client.ts";
import { cn } from "../ui/cn";
import { SegmentedControl } from "../ui/SegmentedControl";
import { useBot } from "./BotProvider";
import { PictureMenu } from "./PictureMenu";

const LEVEL_HINT: Record<Niva, string> = { snabb: "Svarar på några sekunder", grundlig: "Tänker längre, kan ta en minut" };

export function LevelSwitch() {
  const bot = useBot()!;
  return (
    <SegmentedControl
      size="sm"
      label="Nivå"
      value={bot.level}
      onChange={bot.setLevel}
      options={(["snabb", "grundlig"] as const).map((value) => ({
        value,
        title: LEVEL_HINT[value],
        label: <span className={cn(bot.level === value && "text-brass-hi")}>{value === "snabb" ? "Snabb" : "Grundlig"}</span>,
      }))}
    />
  );
}

export function Composer({ autoFocus }: { autoFocus?: boolean }) {
  const bot = useBot()!;
  const field = useRef<HTMLTextAreaElement>(null);
  const text = bot.draft;
  const can = text.trim().length > 0 && !bot.busy;

  // The field grows with the text, up to about eight lines.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 188)}px`;
  }, [text]);
  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
  }, [autoFocus]);

  return (
    <div className="flex flex-col gap-2">
      {bot.attachment ? (
        <div className="flex items-center gap-3 rounded-md border border-line bg-canvas/50 p-1.5 pr-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bot.attachment.url} alt="Bilden som skickas med" className="h-12 w-auto max-w-24 rounded-xs border border-line object-cover" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs font-medium text-ink">Bild skickas med</span>
            <span className="text-2xs text-faint">{bot.attachment.shapes.length ? `${bot.attachment.shapes.length} markeringar` : "Utan markeringar"}</span>
          </div>
          <button type="button" onClick={() => bot.editPicture(bot.attachment!, "fraga")} className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-dim hover:bg-raised hover:text-ink">
            <Pencil className="size-3.5" /> Rita
          </button>
          <button type="button" aria-label="Ta bort bilden" title="Ta bort bilden" onClick={() => bot.setAttachment(null)} className="grid size-7 place-items-center rounded-sm text-faint hover:bg-raised hover:text-ink">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex flex-col rounded-lg border border-line-strong bg-well shadow-inset transition-[border-color,box-shadow] focus-within:border-brass/60 focus-within:ring-3 focus-within:ring-brass/12">
        <textarea
          ref={field}
          rows={1}
          value={text}
          maxLength={QUESTION_LIMIT}
          placeholder={bot.lines.length ? "Fråga vidare…" : "Fråga något om dealern…"}
          aria-label="Din fråga"
          onChange={(e) => bot.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (can) bot.ask();
            }
          }}
          className="block max-h-[188px] min-h-[44px] w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[14px] leading-[21px] text-ink outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
          <PictureMenu busy={bot.taking} onPick={(choice) => void bot.takePicture(choice, "fraga")} />
          <LevelSwitch />
          <span className="flex-1" />
          {bot.busy ? (
            <button type="button" onClick={bot.stop} aria-label="Stoppa svaret" title="Stoppa svaret" className="grid size-8 place-items-center rounded-full border border-line-strong bg-overlay text-ink transition-colors hover:bg-[#2a3530]">
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => bot.ask()}
              disabled={!can}
              aria-label="Skicka frågan"
              title="Skicka (Enter)"
              className="grid size-8 place-items-center rounded-full bg-brass text-brass-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-[background-color,opacity] hover:bg-brass-hi active:bg-brass-lo disabled:cursor-not-allowed disabled:bg-overlay disabled:text-faint disabled:shadow-none"
            >
              <ArrowUp className="size-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
