"use client";

// The rows of the view Material: the chain at a glance (ChainStrip), one row per role with its pictures (RoleRow), the
// films as counts per seat (FilmsRow), the proof folders (ProofRow), and the three sources of measures (Measures).
import { ArrowRight, ArrowUpRight, ChevronRight, CircleAlert, FolderOpen } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Graph } from "../../../src/clip-graph.ts";
import type { Proof } from "../../lib/api.ts";
import { BUCKET_SIGN, BUCKET_WORD, BUCKETS } from "../../lib/edge-stats.ts";
import { CHAIN, ROLE_ABOUT, ROLE_LABEL, roleStatus, sizeWords, type DealerAnswer, type EntryAnswer, type Measure, type Role, type RoleStatus } from "../../lib/media.ts";
import { coverOf, proofTitle } from "../../lib/proofs.ts";
import { splitLabel } from "../../lib/verdict.ts";
import { ProofStill } from "../proofs";
import { buttonClasses, cn } from "../ui";
import { seatGroups, takeCount } from "./films.ts";
import { StateChip, TILE_HEIGHT, Tile, coverOfEntry, filmLine } from "./Tile";

const rowId = (role: Role) => `roll-${role.replace(".", "-")}`;
const scrollTo = (role: Role) => document.getElementById(rowId(role))?.scrollIntoView({ behavior: "smooth", block: "start" });

const SIGN_TONE: Record<RoleStatus, string> = {
  gäller: "border-godkand/45 bg-godkand/10 text-[#6cc595]",
  finns: "border-godkand/30 bg-godkand/6 text-[#6cc595]",
  kandidat: "border-anmarkning/45 bg-anmarkning/10 text-[#f0b07a]",
  saknas: "border-underkand/45 bg-underkand/10 text-[#ef8b8b]",
};
const SIGN: Record<RoleStatus, string> = { gäller: "✓", finns: "✓", kandidat: "◐", saknas: "✕" };

/** The chain from the first picture to the films, each step with how it stands; a click goes to its row. */
export function ChainStrip({ dealer, bankTakes }: { dealer: DealerAnswer; bankTakes: number }) {
  return (
    <nav aria-label="Kedjan" className="flex flex-wrap items-center gap-1.5">
      {CHAIN.map((role, i) => {
        const status = roleStatus(dealer, role, bankTakes);
        const n = role === "film" ? bankTakes : dealer.entries.filter((e) => e.role === role).length;
        return (
          <span key={role} className="flex items-center gap-1.5">
            {i ? <ChevronRight aria-hidden className="size-4 text-faint" /> : null}
            <button
              type="button"
              onClick={() => scrollTo(role)}
              title={`${ROLE_LABEL[role]}: ${status}`}
              className={cn("inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-[filter] hover:brightness-125", SIGN_TONE[status])}
            >
              <span aria-hidden>{SIGN[status]}</span>
              <span className="text-ink">{ROLE_LABEL[role]}</span>
              <span className="text-xs tabular-nums opacity-80">{status === "saknas" ? "saknas" : n}</span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}

const ANCHORS: readonly Role[] = ["ankare-1", "ankare-2.1", "ankare-2.2"];

/**
 * What a film can be ordered from today: per anchor the picture that holds, else its candidates. A film begins and ends
 * on exactly such a picture, so this is the short answer to "from what could I make a film?".
 */
export function OrderFrom({ dealer, onOpen }: { dealer: DealerAnswer; onOpen: (entry: EntryAnswer) => void }) {
  const picks = ANCHORS.map((role) => {
    const list = dealer.entries.filter((e) => e.role === role && e.served);
    const holds = list.filter((e) => e.state === "gäller");
    return { role, list: holds.length ? holds : list.filter((e) => e.state === "kandidat") };
  });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="text-dim">Filmer kan börja och sluta på:</span>
      {picks.map(({ role, list }) =>
        list.length ? (
          list.map((e) => {
            const cover = coverOfEntry(e);
            return (
              <button key={e.id} type="button" onClick={() => onOpen(e)} className="group inline-flex items-center gap-2 rounded-md border border-line bg-surface py-1 pl-1 pr-2.5 hover:border-line-strong hover:bg-raised">
                <ProofStill cover={cover} fps={e.fps ?? 30} className="h-8 w-12 rounded-xs" />
                <span className="text-xs text-dim">{ROLE_LABEL[role]}</span>
                <span className="text-ink">{e.name}</span>
                {e.state ? <StateChip state={e.state} /> : null}
              </button>
            );
          })
        ) : (
          <span key={role} className="inline-flex items-center gap-2 rounded-md border border-dashed border-underkand/40 px-2.5 py-1.5 text-xs text-[#ef8b8b]">
            {ROLE_LABEL[role]} saknas
          </span>
        ),
      )}
    </div>
  );
}

function RowFrame({ role, step, status, count, missing, last = false, children }: { role: Role; step: number | null; status: RoleStatus | null; count: ReactNode; missing?: string; last?: boolean; children: ReactNode }) {
  return (
    <section id={rowId(role)} className="relative grid scroll-mt-4 grid-cols-[230px_minmax(0,1fr)] gap-6 py-5">
      {step !== null && !last ? <span aria-hidden className="absolute bottom-0 left-[13px] top-12 w-px bg-line-strong" /> : null}
      {step !== null && step > 1 ? <span aria-hidden className="absolute left-[13px] top-0 h-5 w-px bg-line-strong" /> : null}
      <header className={cn("relative flex flex-col gap-1.5", step !== null && "pl-10")}>
        {step !== null ? (
          <span className={cn("absolute left-0 top-0 grid size-[27px] place-items-center rounded-full border text-xs font-semibold tabular-nums", status ? SIGN_TONE[status] : "border-line-strong text-dim")}>{step}</span>
        ) : null}
        <h2 className="font-display text-lg font-semibold leading-6 text-ink">{ROLE_LABEL[role]}</h2>
        <p className="text-xs leading-4 text-dim">{ROLE_ABOUT[role]}</p>
        <div className="mt-1 flex items-center gap-2">
          {status ? <StateChip state={status} /> : null}
          <span className="text-xs text-faint tabular-nums">{count}</span>
        </div>
        {missing ? (
          <p className="mt-1 flex gap-1.5 text-xs leading-4 text-[#ef8b8b]">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {missing}
          </p>
        ) : null}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Strip({ children }: { children: ReactNode }) {
  return <ul className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">{children}</ul>;
}

/** An empty role: the frame of a missing picture and what its absence means. */
function Missing({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-dashed border-underkand/40 bg-underkand/5 px-5 py-4" style={{ minHeight: 96, maxWidth: 600 }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-underkand/40 text-lg text-[#ef8b8b]">✕</span>
      <div className="flex flex-col gap-1">
        <span className="text-md font-semibold text-ink">Saknas</span>
        <span className="text-sm leading-5 text-dim">{text}</span>
      </div>
    </div>
  );
}

const pictures = (n: number) => `${n} ${n === 1 ? "bild" : "bilder"}`;

// The line under a tile: how many films use it, where that is the question; a keystone is never played, so its size;
// a reference film, its length.
function lineOf(role: Role, e: EntryAnswer, bank: boolean): string | undefined {
  if (role === "referens") return filmLine(e) ?? "";
  if (role === "keystone" || role === "ingangsbild") return sizeWords(e.width, e.height) ?? "";
  // A dealer without films in the bank: her films lie in a work folder, so "no film" would not be true.
  if (!bank) return "ingen film i banken";
  return undefined;
}

export function RoleRow({ dealer, role, step, last, open, onOpen }: { dealer: DealerAnswer; role: Role; step: number | null; last?: boolean; open: string | null; onOpen: (entry: EntryAnswer) => void }) {
  const list = dealer.entries.filter((e) => e.role === role);
  const status = step !== null ? roleStatus(dealer, role) : null;
  const missing = dealer.missing?.[role];
  const used = list.reduce((n, e) => n + e.usedBy.length, 0);
  const films = list.filter((e) => e.served?.endsWith(".mp4") && e.frame === undefined).length;
  const count = [list.length - films ? pictures(list.length - films) : null, films ? `${films} ${films === 1 ? "film" : "filmer"}` : null, used ? `${used} filmer börjar eller slutar här` : null].filter(Boolean).join(" · ") || "inga";
  return (
    <RowFrame role={role} step={step} status={status} count={count} missing={list.length ? missing : undefined} last={last}>
      {list.length ? (
        <Strip>
          {list.map((e) => (
            <Tile key={e.id} entry={e} onOpen={onOpen} selected={open === e.id} line={lineOf(role, e, !!dealer.films?.from)} />
          ))}
        </Strip>
      ) : (
        <Missing text={missing ?? "Inget här än."} />
      )}
    </RowFrame>
  );
}

/**
 * The films: the bank in numbers per seat, the map one click away; for a dealer without films in the bank, what lies
 * outside it. Under that, the films of the register (role film) that lie in the repo folder but not in the bank.
 */
export function FilmsRow({ dealer, graph, step, open, onOpen }: { dealer: DealerAnswer; graph: Graph | null; step: number; open: string | null; onOpen: (entry: EntryAnswer) => void }) {
  const [shown, setShown] = useState(false);
  const inBank = dealer.films?.from && graph ? takeCount(graph) : 0;
  const status: RoleStatus = inBank ? "finns" : "saknas";
  const outside = dealer.outside;
  const outFilms = outside?.ledgers.reduce((n, l) => n + l.films, 0) ?? 0;
  const outUsable = outside?.ledgers.reduce((n, l) => n + l.usable, 0) ?? 0;
  const loose = dealer.entries.filter((e) => e.role === "film");
  const count = `${inBank ? `${inBank} tagningar i banken` : "0 i banken"}${loose.length ? ` · ${loose.length} utanför` : ""}`;
  return (
    <RowFrame role="film" step={step} status={status} count={count} last>
      <div className="flex flex-col gap-3">
        {inBank && graph ? (
          <>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
              {seatGroups(graph).map((g) => (
                <li key={g.key}>
                  <Link
                    href={`/karta/?${new URLSearchParams({ plats: g.key === "vila" ? "IDLE" : g.key === "D" ? "D.C1" : g.key === "prov" ? "READY-B" : `${g.key}.C1` }).toString()}`}
                    className="flex h-full flex-col gap-1 rounded-md border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-raised"
                    title={`${g.label}: ${g.sub}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-md font-semibold text-ink">{g.label}</span>
                      <span className="text-xs tabular-nums text-dim">{g.takes}</span>
                    </span>
                    <span className="flex gap-2 text-xs tabular-nums">
                      {BUCKETS.filter((b) => g.counts[b]).map((b) => (
                        <span key={b} title={`${g.counts[b]} ${BUCKET_WORD[b][g.counts[b] === 1 ? 0 : 1]}`} className={b === "accepted" ? "text-[#6cc595]" : b === "variants" ? "text-[#9db3f8]" : b === "waiting" ? "text-vantar" : "text-[#ef8b8b]"}>
                          {BUCKET_SIGN[b]} {g.counts[b]}
                        </span>
                      ))}
                      {!g.takes ? <span className="text-faint">inga</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3 text-xs text-faint">
              <span>{dealer.films?.note}</span>
              <Link href="/karta/" className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "ml-auto")}>
                Alla steg på kartan <ArrowRight />
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 rounded-md border border-dashed border-underkand/40 bg-underkand/5 px-5 py-4" style={{ maxWidth: 720 }}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-underkand/40 text-lg text-[#ef8b8b]">✕</span>
              <div className="flex flex-col gap-1">
                <span className="text-md font-semibold text-ink">Inga filmer i banken</span>
                <span className="text-sm leading-5 text-dim">{dealer.films?.note}</span>
              </div>
            </div>
            {outside ? (
              <div className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3" style={{ maxWidth: 720 }}>
                <div className="flex flex-wrap items-center gap-3">
                  <FolderOpen className="size-5 shrink-0 text-brass" />
                  <span className="text-md text-ink">
                    <span className="font-semibold tabular-nums">{outFilms} filmer till</span> ligger i arbetsmappen, inte införda
                  </span>
                  <span className="text-sm text-[#6cc595] tabular-nums">✓ {outUsable} bedömda användbara</span>
                  <button type="button" onClick={() => setShown((s) => !s)} className="ml-auto text-xs text-brass-hi hover:underline" aria-expanded={shown}>
                    {shown ? "Dölj omgångarna" : "Per omgång"}
                  </button>
                </div>
                <span className="font-mono text-xs text-faint">{outside.path}</span>
                {shown ? (
                  <ul className="mt-1 flex flex-col divide-y divide-line text-sm">
                    <li className="pb-2 text-xs text-dim">{outside.note}</li>
                    {/* Newest first: the last rounds are the ones that count now. */}
                    {[...outside.ledgers]
                      .reverse()
                      .filter((l) => l.films)
                      .map((l) => (
                        <li key={l.file} className="grid grid-cols-[64px_74px_minmax(0,1fr)] gap-3 py-1.5">
                          <span className="font-mono text-xs text-dim">{l.file.replace(/^bestallningar-|\.json$/g, "")}</span>
                          <span className="tabular-nums text-ink">
                            {l.films} <span className="text-faint">·</span> <span className={l.usable ? "text-[#6cc595]" : "text-faint"}>✓ {l.usable}</span>
                          </span>
                          <span className="text-xs leading-5 text-dim">{l.note}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        {loose.length ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-dim">
              <span className="font-semibold tabular-nums text-ink">{loose.length} {loose.length === 1 ? "film" : "filmer"}</span> utanför banken, i repomappen
            </span>
            <Strip>
              {loose.map((e) => (
                <Tile key={e.id} entry={e} onOpen={onOpen} selected={open === e.id} line={filmLine(e) ?? ""} />
              ))}
            </Strip>
          </div>
        ) : null}
      </div>
    </RowFrame>
  );
}

/** The dealer's proof folders as cards: their own picture, the title, a link to the proof room. */
export function ProofRow({ dealer, proofs }: { dealer: DealerAnswer; proofs: readonly Proof[] | null }) {
  const list = dealer.entries.filter((e) => e.role === "prov");
  return (
    <RowFrame role="prov" step={null} status={null} count={`${list.length} provmappar`}>
      <Strip>
        {list.map((e) => {
          const proof = proofs?.find((p) => p.id === e.proof) ?? null;
          const cover = proof ? coverOf(proof) : null;
          const title = proof ? splitLabel(proofTitle(proof)).name : e.name;
          return (
            <li key={e.id} className="flex shrink-0 flex-col gap-1.5" style={{ width: 210 }}>
              <Link href={`/prov/?${new URLSearchParams({ prov: e.proof! }).toString()}`} className="group relative overflow-hidden rounded-md border border-line bg-well hover:border-line-strong" style={{ height: TILE_HEIGHT }}>
                <ProofStill cover={cover} fps={proof?.fps ?? 30} className="absolute inset-0 transition-[filter] duration-200 group-hover:brightness-110" />
                <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-xs bg-black/65 px-1.5 py-0.5 text-2xs text-ink backdrop-blur-sm">
                  Prov <ArrowUpRight className="size-3" />
                </span>
              </Link>
              <span className="line-clamp-2 px-0.5 text-sm font-medium leading-5 text-ink" title={title}>
                {e.name}
              </span>
            </li>
          );
        })}
      </Strip>
    </RowFrame>
  );
}

/** Measures and coordinates: three sources, one line each, with what each decides. */
export function Measures({ measures }: { measures: readonly Measure[] }) {
  return (
    <section className="mt-6 rounded-lg border border-line bg-surface px-5 py-4">
      <h2 className="font-display text-md font-semibold text-ink">Mått och koordinater</h2>
      <p className="mt-0.5 text-xs text-dim">En källa för varje sak. Allt annat räknas ur dessa.</p>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {measures.map((m) => (
          <li key={m.id} className="grid grid-cols-[180px_minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
            <span className="text-sm font-semibold text-ink">{m.name}</span>
            <span className="flex flex-col gap-0.5 text-sm leading-5 text-dim">
              {m.decides}
              <span className="font-mono text-xs text-faint">{m.file}</span>
            </span>
            {m.link ? (
              m.link.startsWith("/lab.html") ? (
                <a href={m.link} className="inline-flex items-center gap-1 text-xs text-brass-hi hover:underline">
                  Gamla labbet <ArrowUpRight className="size-3" />
                </a>
              ) : (
                <Link href={m.link} className="inline-flex items-center gap-1 text-xs text-brass-hi hover:underline">
                  Öppna <ArrowRight className="size-3" />
                </Link>
              )
            ) : (
              <span className="text-xs text-faint">inte i repot</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
