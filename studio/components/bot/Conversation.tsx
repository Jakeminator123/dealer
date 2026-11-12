"use client";

// The conversation in the panel: the person's lines to the right in a raised box (with the picture and the view they
// were asked from), the bot's answers as running text with their sources, a calm "tänker…" while the model thinks (the
// thorough level can be silent for a minute; the heartbeat keeps the seconds going), errors in plain Swedish with
// "Försök igen", and before the first question four questions to click.
import { ArrowRight, Check, CircleAlert, Copy, Eye, FilePlus2, MessagesSquare, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../ui/cn";
import { AnswerText, CiteMark } from "./AnswerText";
import { useBot } from "./BotProvider";
import { contextLine } from "./describe";
import { citedNumbers, parseAnswer, plainAnswer } from "./markdown";
import type { BotLine, DuLine, InfoLine, Line } from "./thread";

export const SUGGESTIONS = ["Vad är läget i banken?", "Vad väntar på Jakob?", "Hur hänger det här ihop med Scoutgaming?", "Vad är ankare 2.1?"];

function Empty({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 pb-[8vh] pt-6">
      <div className="flex flex-col gap-1.5 px-1">
        <span aria-hidden className="mb-2 grid size-10 place-items-center rounded-full border border-line-strong bg-raised text-dim">
          <MessagesSquare className="size-[18px]" />
        </span>
        <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">Fråga om dealern</h2>
        <p className="text-sm text-dim">Svaren kommer ur projektets underlag, med källa på varje påstående.</p>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-lg border border-line bg-canvas/40">
        {SUGGESTIONS.map((q, i) => (
          <li key={q} className={cn(i > 0 && "border-t border-line")}>
            <button
              type="button"
              onClick={() => onAsk(q)}
              className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm text-ink transition-colors hover:bg-raised focus-visible:outline-offset-[-2px]"
            >
              <span className="min-w-0 flex-1">{q}</span>
              <ArrowRight className="size-4 shrink-0 text-faint transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-dim" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Question({ line }: { line: DuLine }) {
  return (
    <div className="flex flex-col items-end gap-1 pl-8">
      <div className="flex max-w-full flex-col gap-2 rounded-lg rounded-br-xs border border-line-strong/70 bg-raised px-3 py-2 text-[14px] leading-[21px] text-ink shadow-inset">
        {line.bild ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.bild} alt="Bilden du skickade" className="max-h-40 w-auto self-end rounded-sm border border-line object-contain" />
        ) : line.harBild ? (
          <span className="text-xs text-faint">(med bild)</span>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{line.text}</p>
      </div>
      {line.vy ? (
        <span className="flex max-w-full items-center gap-1 truncate text-2xs text-faint">
          <Eye className="size-3 shrink-0" />
          <span className="truncate">{contextLine(line.vy.namn, line.vy.val)}</span>
        </span>
      ) : null}
    </div>
  );
}

function Thinking({ line }: { line: BotLine }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - line.started) / 1000));
  const quiet = now - line.beat > 20_000;
  return (
    <div role="status" className="flex flex-col gap-1 py-1">
      <span className="flex items-center gap-2.5 text-sm text-dim">
        <span aria-hidden className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-dim" style={{ animationDelay: `${i * 180}ms` }} />
          ))}
        </span>
        Tänker…
      </span>
      {seconds >= 5 ? (
        <span className="pl-[34px] text-xs text-faint">
          {line.niva === "grundlig" ? "Grundlig tar en stund" : "Snart"} · {seconds} s{quiet ? " · väntar på svar" : ""}
        </span>
      ) : null}
    </div>
  );
}

/** A section's own name for its chip: "HANDOFF › Läget i banken" → "Läget i banken". */
function shortTitle(title: string): string {
  const parts = title.split(/\s*[›>»·]\s*/).filter(Boolean);
  const name = parts[parts.length - 1] ?? title;
  return name.length > 26 ? `${name.slice(0, 25)}…` : name;
}

function Answer({ line, last }: { line: BotLine; last: boolean }) {
  const bot = useBot()!;
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const streaming = line.status === "skriver";
  const blocks = useMemo(() => parseAnswer(line.text, line.kallor, streaming), [line.text, line.kallor, streaming]);
  // The sources the text cites, numbered as it numbers them; when it is done, also those the server says it used.
  const cited = useMemo(() => {
    const set = new Set(citedNumbers(blocks));
    line.kallor.forEach((k, i) => line.used?.includes(k.id) && set.add(i + 1));
    return set;
  }, [blocks, line.kallor, line.used]);
  const shown = line.kallor.map((k, i) => ({ ...k, n: i + 1 })).filter((k) => cited.has(k.n));
  const toggle = (n: number) => setOpen((o) => (o === n ? null : n));
  const openSource = open ? line.kallor[open - 1] : null;

  if (line.status === "tanker") return <Thinking line={line} />;
  return (
    <div className="flex flex-col gap-2.5" aria-busy={streaming || undefined}>
      {line.text ? <AnswerText blocks={blocks} streaming={streaming} open={open} onCite={toggle} /> : null}
      {line.status === "stoppad" ? <span className="text-xs text-faint">Stoppad.</span> : null}
      {line.status === "fel" && line.fel ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-underkand/30 bg-underkand/8 px-3 py-2.5 text-sm text-[#efa3a3]">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-underkand" />
          <span className="min-w-0 flex-1">{line.fel.text}</span>
          {line.fel.kod !== "utloggad" ? (
            <button type="button" onClick={() => bot.retry(line.id)} disabled={bot.busy} className="-my-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-ink hover:bg-underkand/15 disabled:opacity-45">
              <RotateCcw className="size-3.5" /> Försök igen
            </button>
          ) : null}
        </div>
      ) : null}
      {shown.length && line.status !== "fel" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-2xs font-medium uppercase tracking-[0.08em] text-faint">Källor</span>
            {shown.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => toggle(k.n)}
                aria-expanded={open === k.n}
                title={k.titel}
                className={cn(
                  "inline-flex h-6 max-w-[200px] items-center gap-1.5 rounded-sm border pl-1 pr-2 text-xs transition-colors",
                  open === k.n ? "border-line-strong bg-overlay text-ink" : "border-line bg-canvas/50 text-dim hover:border-line-strong hover:text-ink",
                )}
              >
                <span className="grid h-4 min-w-4 place-items-center rounded-[3px] bg-overlay px-0.5 text-[10px] font-semibold tabular-nums text-dim">{k.n}</span>
                <span className="truncate">{shortTitle(k.titel)}</span>
              </button>
            ))}
          </div>
          {openSource ? (
            <p className="flex items-start gap-2 rounded-md border border-line bg-canvas/60 px-2.5 py-2 text-xs text-dim animate-fade-in">
              <CiteMark n={open!} active />
              <span className="min-w-0 flex-1 pt-px text-ink">{openSource.titel}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {line.status === "klar" || line.status === "stoppad" ? (
        <div className={cn("-ml-1.5 flex items-center gap-1 transition-opacity", last ? "opacity-100" : "opacity-70 hover:opacity-100 focus-within:opacity-100")}>
          <button
            type="button"
            onClick={() => bot.startRequest(line.id)}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium text-dim transition-colors hover:bg-raised hover:text-ink"
          >
            <FilePlus2 className="size-3.5" /> Gör till önskemål
          </button>
          <button
            type="button"
            aria-label={copied ? "Kopierat" : "Kopiera svaret"}
            title={copied ? "Kopierat" : "Kopiera svaret"}
            onClick={() => {
              void navigator.clipboard?.writeText(plainAnswer(line.text)).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              });
            }}
            className="grid size-7 place-items-center rounded-sm text-faint transition-colors hover:bg-raised hover:text-ink"
          >
            {copied ? <Check className="size-3.5 text-godkand" /> : <Copy className="size-3.5" />}
          </button>
          {line.niva === "grundlig" ? <span className="ml-auto pr-1 text-2xs text-faint">Grundlig</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Info({ line }: { line: InfoLine }) {
  return (
    <div className="flex items-center gap-2 border-y border-line py-2 text-xs text-dim">
      <Check className="size-3.5 shrink-0 text-godkand" />
      <span className="min-w-0 flex-1 truncate">{line.text}</span>
      {line.href ? (
        <Link href={line.href} className="shrink-0 font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-dim">
          {line.link}
        </Link>
      ) : null}
    </div>
  );
}

/** The scrolling element around an element. */
const scroller = (el: HTMLElement | null): HTMLElement | null => {
  for (let at = el?.parentElement ?? null; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (/(auto|scroll)/.test(style.overflowY)) return at;
  }
  return null;
};

export function Conversation({ lines }: { lines: Line[] }) {
  const bot = useBot()!;
  const end = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = lines.length;
  const lastText = lines[count - 1]?.roll === "bot" ? (lines[count - 1] as BotLine).text.length : 0;

  // Follow the answer as it grows, unless the person has scrolled up to read.
  useEffect(() => {
    const box = scroller(end.current);
    if (!box) return;
    const onScroll = () => {
      stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const box = scroller(end.current);
    if (box && stick.current) box.scrollTop = box.scrollHeight;
  }, [count, lastText]);
  // A new question always brings the end into view.
  useLayoutEffect(() => {
    stick.current = true;
  }, [count]);

  if (!lines.length) return <Empty onAsk={(q) => bot.ask(q)} />;
  const lastBot = [...lines].reverse().find((l) => l.roll === "bot")?.id;
  return (
    <div className="flex flex-col gap-5 pb-2 pt-4">
      {lines.map((line) =>
        line.roll === "du" ? <Question key={line.id} line={line} /> : line.roll === "bot" ? <Answer key={line.id} line={line} last={line.id === lastBot} /> : <Info key={line.id} line={line} />,
      )}
      <div ref={end} />
    </div>
  );
}
