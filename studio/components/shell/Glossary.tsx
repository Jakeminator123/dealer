"use client";

// <Glossary />: the rail's "Ordlista": the studio's one table of words (lib/words.ts) in a dialog, searchable. Each word with
// what it means and, quieter, the other names it has in code and documents (IDLE, Keystone 1, kant …), so that an older
// name read somewhere leads to the word the studio uses.
import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { WORD_GROUPS, findWords } from "../../lib/words.ts";
import { Dialog } from "../ui/Dialog";
import { Tooltip } from "../ui/Tooltip";
import { cn } from "../ui/cn";

export function Glossary() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const found = useMemo(() => findWords(query), [query]);
  const searching = query.trim().length > 0;
  return (
    <>
      <Tooltip content="Ordlista: studions ord och deras andra namn" side="right">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="mx-2 flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-faint transition-colors hover:bg-raised/60 hover:text-ink"
        >
          <BookOpen className="size-[18px]" />
          <span className="text-[10.5px] font-medium leading-[13px]">Ordlista</span>
        </button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen} title="Ordlista" width={680}>
        <div className="flex flex-col gap-4 pb-1">
          <label className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-well px-2.5 focus-within:border-brass/60">
            <Search aria-hidden className="size-4 shrink-0 text-faint" />
            <input
              type="search"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök ett ord eller ett annat namn: IDLE, kant, keystone …"
              aria-label="Sök i ordlistan"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
          </label>
          {found.length ? (
            (searching ? [null] : WORD_GROUPS).map((group) => {
              const words = group ? found.filter((w) => w.grupp === group) : found;
              if (!words.length) return null;
              return (
                <section key={group ?? "träffar"} className="flex flex-col gap-1">
                  {group ? <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{group}</h3> : null}
                  <dl className="flex flex-col">
                    {words.map((w, i) => (
                      <div key={w.ord} className={cn("grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 py-2", i > 0 && "border-t border-line")}>
                        <dt className="text-sm font-semibold text-ink">{w.ord}</dt>
                        <dd className="flex flex-col gap-0.5">
                          <span className="text-sm leading-5 text-[#d7ddd9]">{w.betyder}</span>
                          {w.aven.length ? <span className="text-xs leading-4 text-faint">Kallas också: {w.aven.join(" · ")}</span> : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })
          ) : (
            <p className="py-6 text-center text-sm text-faint">Inget ord i ordlistan matchar ”{query.trim()}”.</p>
          )}
        </div>
      </Dialog>
    </>
  );
}
