"use client";

// The bot's answer as running text on the panel's surface (no bubble): paragraphs, lists, bold, and the source marks as
// small numbered chips that open the source's title. While it streams, a brass caret stands after the last word.
import { Fragment, type ReactNode } from "react";
import { cn } from "../ui/cn";
import type { Block, Inline } from "./markdown";

function Caret() {
  return <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-brass" />;
}

export function CiteMark({ n, active, onClick }: { n: number; active?: boolean; onClick?: (n: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(n)}
      aria-label={`Källa ${n}`}
      className={cn(
        "relative -top-[0.5em] ml-[2px] inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-[4px] border px-[3px] align-baseline text-[9px] font-semibold leading-none tabular-nums transition-colors",
        active ? "border-line-strong bg-overlay text-ink" : "border-line bg-raised text-dim hover:border-line-strong hover:text-ink",
      )}
    >
      {n}
    </button>
  );
}

function inlines(parts: Inline[], onCite: (n: number) => void, open: number | null, tail?: ReactNode) {
  return (
    <>
      {parts.map((part, i) =>
        part.t === "text" ? (
          <Fragment key={i}>{part.v}</Fragment>
        ) : part.t === "b" ? (
          <strong key={i} className="font-semibold text-ink">
            {part.v}
          </strong>
        ) : part.t === "code" ? (
          <code key={i} className="rounded-xs bg-well px-1 py-px font-mono text-[12.5px] text-ink">
            {part.v}
          </code>
        ) : part.t === "br" ? (
          <br key={i} />
        ) : (
          <CiteMark key={i} n={part.n} active={open === part.n} onClick={onCite} />
        ),
      )}
      {tail}
    </>
  );
}

export function AnswerText({ blocks, streaming, open, onCite }: { blocks: Block[]; streaming: boolean; open: number | null; onCite: (n: number) => void }) {
  const caret = streaming ? <Caret /> : null;
  if (!blocks.length) return streaming ? <p>{caret}</p> : null;
  return (
    <div className="flex flex-col gap-2.5 text-[14.5px] leading-[23px] text-[#dfe5e1]">
      {blocks.map((block, i) => {
        const last = i === blocks.length - 1;
        if (block.kind === "p") return <p key={i}>{inlines(block.parts, onCite, open, last ? caret : null)}</p>;
        if (block.kind === "h")
          return (
            <h3 key={i} className="pt-1 text-sm font-semibold text-ink">
              {inlines(block.parts, onCite, open, last ? caret : null)}
            </h3>
          );
        const List = block.kind === "ul" ? "ul" : "ol";
        return (
          <List key={i} start={block.kind === "ol" ? block.start : undefined} className={cn("flex flex-col gap-1.5 pl-5", block.kind === "ul" ? "list-[square] marker:text-faint" : "list-decimal marker:text-faint marker:tabular-nums")}>
            {block.items.map((item, j) => (
              <li key={j} className="pl-1">
                {inlines(item, onCite, open, last && j === block.items.length - 1 ? caret : null)}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
