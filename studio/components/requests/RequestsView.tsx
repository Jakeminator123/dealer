"use client";

// Önskemål (/onskemal/): every request to Jakob, newest first, with its status chip and Jakob's answer; filters by status;
// the picture large on a click. An answer this browser has not shown before is marked "Nytt" and counted in the rail
// until the list has been open a moment. Nothing here changes anything for Jakob: he answers from his own tools.
import { ArrowUpRight, ChevronRight, ImageOff, Inbox, Sparkles, SquarePen } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { requestPictureUrl, type Post } from "../../lib/bot-client.ts";
import { formatDay } from "../../lib/names.ts";
import { useBot } from "../bot/BotProvider";
import { contextLine } from "../bot/describe";
import { Page } from "../shell/Page";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";
import { cn } from "../ui/cn";
import { useRequests } from "./RequestsProvider";
import { KindChip, StatusChip } from "./StatusChip";
import { applyFilter, filters, newestFirst, unseenAnswer, type Filter, type Seen } from "./status";

/** "12 nov 21:40" in the browser's time. */
function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${formatDay(value) ?? ""} ${time}`.trim();
}

/** Where a request's view lives inside the studio (its address is the copy's own, /studio/…). */
const appPath = (adress: string): string | null => {
  if (!adress.startsWith("/studio/")) return null;
  return adress.slice("/studio".length) || "/";
};

function Picture({ post, onOpen }: { post: Post; onOpen: (url: string) => void }) {
  const [failed, setFailed] = useState(false);
  const url = post.harBild ? requestPictureUrl(post.id) : null;
  if (!url) return null;
  if (failed)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-faint">
        <ImageOff className="size-3.5" /> Bilden kunde inte visas
      </span>
    );
  return (
    <button type="button" onClick={() => onOpen(url)} className="group relative self-start overflow-hidden rounded-md border border-line bg-well" title="Visa bilden stort">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Bild till ”${post.rubrik}”`} loading="lazy" onError={() => setFailed(true)} className="block h-28 w-auto max-w-[260px] object-cover transition-opacity group-hover:opacity-90" />
    </button>
  );
}

function PostCard({ post, seen, onPicture }: { post: Post; seen: Seen; onPicture: (url: string) => void }) {
  const [more, setMore] = useState(false);
  const fresh = unseenAnswer(post, seen);
  const href = post.vy ? appPath(post.vy.adress) : null;
  const long = post.text.length > 280;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-inset">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <KindChip typ={post.typ} />
            <h2 className="min-w-0 truncate text-md font-semibold text-ink" title={post.rubrik}>
              {post.rubrik}
            </h2>
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-faint">
            <span className="text-dim">{post.vem}</span>
            <span>· {when(post.skapad)}</span>
            {post.vy ? (
              <>
                <span>·</span>
                {href ? (
                  <Link href={href} className="inline-flex items-center gap-0.5 text-dim underline decoration-line-strong underline-offset-2 hover:text-ink">
                    {contextLine(post.vy.namn, post.vy.val)}
                    <ArrowUpRight className="size-3" />
                  </Link>
                ) : (
                  <span>{contextLine(post.vy.namn, post.vy.val)}</span>
                )}
              </>
            ) : null}
          </p>
        </div>
        <StatusChip status={post.status} />
      </header>

      {post.text ? (
        <div className="flex flex-col gap-1">
          <p className={cn("whitespace-pre-wrap text-sm leading-[21px] text-[#d7ddd9]", !more && long && "line-clamp-4")}>{post.text}</p>
          {long ? (
            <button type="button" onClick={() => setMore((m) => !m)} className="self-start text-xs text-faint underline decoration-line-strong underline-offset-2 hover:text-ink">
              {more ? "Visa mindre" : "Visa mer"}
            </button>
          ) : null}
        </div>
      ) : null}

      <Picture post={post} onOpen={onPicture} />

      {post.sammanfattning || post.forslag ? (
        <details className="group text-sm">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-0.5 pr-1 text-xs text-faint hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" />
            <Sparkles className="size-3" /> Botens sammanfattning{post.forslag ? " och förslag" : ""}
          </summary>
          <div className="ml-[7px] mt-1.5 flex flex-col gap-2 border-l border-line-strong pl-3.5 text-[#cfd6d2]">
            {post.sammanfattning ? <p className="whitespace-pre-wrap">{post.sammanfattning}</p> : null}
            {post.forslag ? (
              <p className="whitespace-pre-wrap">
                <span className="text-faint">Förslag: </span>
                {post.forslag}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      {post.svar ? (
        <div className={cn("flex flex-col gap-1 rounded-md border px-3 py-2.5", fresh ? "border-brass/35 bg-brass/[0.06]" : "border-line-strong bg-raised")}>
          <span className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-ink">Jakobs svar</span>
            <span className="text-faint">{when(post.andrad)}</span>
            {fresh ? <span className="ml-auto rounded-full bg-brass px-1.5 text-[10px] font-semibold leading-4 text-brass-ink">Nytt</span> : null}
          </span>
          <p className="whitespace-pre-wrap text-sm leading-[21px] text-ink">{post.svar}</p>
        </div>
      ) : null}
    </article>
  );
}

export function RequestsView() {
  const bot = useBot();
  const { enabled, posts, error, reload, seen, markAllSeen } = useRequests();
  const [filter, setFilter] = useState<Filter>("alla");
  const [picture, setPicture] = useState<string | null>(null);
  // What was new when the list opened stays marked while it is open; the rail's count goes after a moment.
  const [shownSeen, setShownSeen] = useState<Seen | null>(null);
  const seenAtOpen = useRef(seen);
  useEffect(() => {
    seenAtOpen.current = shownSeen ?? seen;
  });
  useEffect(() => {
    if (!posts) return;
    setShownSeen((s) => s ?? seenAtOpen.current);
    const timer = window.setTimeout(markAllSeen, 1500);
    return () => window.clearTimeout(timer);
  }, [posts, markAllSeen]);

  const sorted = useMemo(() => newestFirst(posts ?? []), [posts]);
  const chips = useMemo(() => filters(sorted), [sorted]);
  const shown = useMemo(() => applyFilter(sorted, filter), [sorted, filter]);
  const unseen = sorted.filter((p) => unseenAnswer(p, shownSeen ?? seen)).length;

  const action = bot?.enabled ? (
    <Button variant="secondary" icon={<SquarePen />} onClick={() => bot.startRequest(null)}>
      Nytt önskemål
    </Button>
  ) : null;

  if (!enabled)
    return (
      <Page title="Önskemål">
        <EmptyState icon={<Inbox />} title="Önskemål finns i kopian på nätet" className="pb-[10vh]">
          Där kan den som tittar fråga boten och skicka önskemål till Jakob. Här i labbet finns inga.
        </EmptyState>
      </Page>
    );

  return (
    <Page
      title="Önskemål"
      status={posts ? `${posts.length} st${unseen ? ` · ${unseen} nya svar` : ""}` : undefined}
      actions={action}
    >
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
        {!posts && error ? (
          <ErrorState error={error} title="Önskemålen kunde inte läsas" onRetry={() => void reload()} />
        ) : !posts ? (
          <div className="flex flex-col gap-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        ) : !posts.length ? (
          <EmptyState icon={<Inbox />} title="Inga önskemål ännu" action={action}>
            Fråga boten, eller skriv direkt till Jakob med Tyck till.
          </EmptyState>
        ) : (
          <>
            <div role="radiogroup" aria-label="Visa" className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  role="radio"
                  aria-checked={filter === chip.value}
                  onClick={() => setFilter(chip.value)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    filter === chip.value ? "border-line-strong bg-overlay text-ink" : "border-line text-dim hover:border-line-strong hover:text-ink",
                  )}
                >
                  {chip.label}
                  <span className="tabular-nums text-faint">{chip.count}</span>
                </button>
              ))}
            </div>
            {error ? <p className="text-xs text-anmarkning">{error} Visar senast lästa.</p> : null}
            <div className="flex flex-col gap-3">
              {shown.map((post) => (
                <PostCard key={post.id} post={post} seen={shownSeen ?? seen} onPicture={setPicture} />
              ))}
            </div>
          </>
        )}
      </div>
      <Dialog open={!!picture} onOpenChange={(o) => !o && setPicture(null)} title="Bilden" width={1280}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {picture ? <img src={picture} alt="Bilden i stort" className="mx-auto max-h-[calc(100vh-200px)] w-auto rounded-md border border-line" /> : null}
      </Dialog>
    </Page>
  );
}
