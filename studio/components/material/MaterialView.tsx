"use client";

// Material (/material/?bild=<id>, ?dealer=pamela for another dealer than the first): the one place where Jakob sees what
// is what, per dealer. At the top the chain at a glance (ingångsbild → keystone → ankare 1 → 2.1 → 2.2 → landningar →
// filmer), then one row per role with large stills, a state chip and how many of the bank's films start or end on each picture; an empty role says what is
// missing. A click opens the picture over the whole window with its facts on demand (MaterialViewer). Under the chain:
// references, the rest, the archived pictures (folded, each with Ta tillbaka in the viewer), and the sources of measures the register lists. Proofs are Granska's Prov, registered by their own
// proof.json, and not listed here. "Lägg till bild" adds a picture (not in the online copy).
// The dealer is the studio's (the rail's switch, useBank); the address's ?dealer= wins when it names one of Material's dealers,
// so links into Material keep working (lib/dealer.ts viewDealer). The address holds the open picture. Must be inside
// <Suspense> (useSearchParams).
import { ImagePlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { asApiError, type ApiError } from "../../lib/api.ts";
import { useBank } from "../../lib/bank.ts";
import { DEALER_PARAM, viewDealer } from "../../lib/dealer.ts";
import { useViewContext } from "../../lib/context.ts";
import { CHAIN, ROLES, roleStatus, type Entry, type MediaAnswer, type Role } from "../../lib/media.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { Page } from "../shell";
import { Button, EmptyState, ErrorState, Skeleton } from "../ui";
import { AddDialog } from "./AddDialog";
import { getMedia } from "./client.ts";
import { MaterialViewer } from "./MaterialViewer";
import { ArchivedRow, ChainStrip, FilmsRow, Measures, OrderFrom, RoleRow } from "./Rows";
import { takeCount } from "./films.ts";

type State = { status: "loading" } | { status: "ready"; answer: MediaAnswer } | { status: "error"; error: ApiError };

/** Writes the view's choices into the address, so that a link brings back the same dealer and picture. */
function setParams(next: Record<string, string | null>) {
  const p = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(next)) {
    if (value) p.set(key, value);
    else p.delete(key);
  }
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
}

export function MaterialView() {
  const params = useSearchParams();
  const asked = params.get(DEALER_PARAM);
  const picture = params.get("bild");
  const [state, setState] = useState<State>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const { graph, dealer: studioDealer, setDealer } = useBank();

  const read = useCallback(async () => {
    try {
      const answer = await getMedia();
      setState({ status: "ready", answer });
    } catch (error) {
      setState((s) => (s.status === "ready" ? s : { status: "error", error: asApiError(error, "Materialet") }));
    }
  }, []);

  useEffect(() => {
    void read();
    const seen = () => document.visibilityState === "visible" && void read();
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, [read]);

  const answer = state.status === "ready" ? state.answer : null;
  const shownId = answer ? viewDealer(answer.dealers.map((d) => d.id), studioDealer, asked) : null;
  const dealer = answer?.dealers.find((d) => d.id === shownId) ?? null;
  const open = dealer && picture ? (dealer.entries.find((e) => e.id === picture) ?? null) : null;
  // The viewer browses the open picture's row: its role's pictures, or the archived ones when it is archived.
  const row = useMemo(
    () => (dealer && open ? dealer.entries.filter((e) => (open.state === "arkiverad" ? e.state === "arkiverad" : e.role === open.role && e.state !== "arkiverad")) : []),
    [dealer, open],
  );
  const lineage = answer?.lineage ?? {};
  // The bank's graph is the studio's dealer's: its takes count only for her (a link may show another dealer here).
  const bankTakes = dealer?.films?.from && graph && dealer.id === studioDealer ? takeCount(graph) : 0;

  useViewContext({ vy: "Material", val: { dealer: dealer?.name, bild: open?.name } });

  const added = (entry: Entry, owner: string) => {
    if (owner !== dealer?.id) setDealer(owner);
    setParams({ bild: entry.id });
    void read();
  };

  if (state.status === "loading")
    return (
      <Page title="Material">
        <div className="flex flex-col gap-6 pt-2">
          <Skeleton className="h-9 w-[720px] max-w-full rounded-md" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="grid grid-cols-[230px_minmax(0,1fr)] gap-6">
              <Skeleton className="h-24 rounded-md" />
              <Skeleton className="h-[150px] rounded-md" />
            </div>
          ))}
        </div>
      </Page>
    );
  if (state.status === "error" || !answer || !dealer)
    return (
      <Page title="Material">
        {state.status === "error" ? (
          <ErrorState title="Materialet kunde inte läsas" error={state.error} onRetry={() => void read()} />
        ) : (
          <EmptyState title="Registret går inte att läsa">{answer?.problems.join(" ") || "data/media-roles.json saknas eller håller inte."}</EmptyState>
        )}
      </Page>
    );

  // Archived pictures are out of the lists: the chain, the rows and what a role has are read without them.
  const live = { ...dealer, entries: dealer.entries.filter((e) => e.state !== "arkiverad") };
  const missingRoles = CHAIN.filter((r) => roleStatus(live, r, bankTakes) === "saknas");
  const step = (role: Role) => CHAIN.indexOf(role) + 1;
  return (
    <Page
      title="Material"
      status={
        <span className="truncate">
          {dealer.name} · {missingRoles.length ? `saknas: ${missingRoles.length} av ${CHAIN.length} i kedjan` : "hela kedjan finns"}
        </span>
      }
      actions={
        <>
          {!isSnapshot ? (
            <Button variant="primary" size="md" icon={<ImagePlus />} onClick={() => setAdding(true)}>
              Lägg till bild
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col">
        <div className="flex flex-col gap-3 pb-2">
          <ChainStrip dealer={live} bankTakes={bankTakes} />
          <OrderFrom dealer={live} onOpen={(e) => setParams({ bild: e.id })} />
          {answer.unassigned.length ? (
            <p className="text-xs text-[#f0b07a]">{answer.unassigned.length} bilder som filmer börjar eller slutar på saknar roll i registret.</p>
          ) : null}
        </div>
        <div className="divide-y divide-line/70">
          {CHAIN.map((role) =>
            role === "film" ? (
              <FilmsRow key={role} dealer={live} graph={graph} step={step(role)} open={open?.id ?? null} onOpen={(e) => setParams({ bild: e.id })} lineage={lineage} />
            ) : (
              <RoleRow key={role} dealer={live} all={dealer.entries} role={role} step={step(role)} open={open?.id ?? null} onOpen={(e) => setParams({ bild: e.id })} />
            ),
          )}
        </div>
        <h2 className="mt-8 border-b border-line pb-2 text-xs font-medium uppercase tracking-[0.08em] text-faint">Bredvid kedjan</h2>
        <div className="divide-y divide-line/70">
          {ROLES.filter((r) => !CHAIN.includes(r)).map((role) =>
            live.entries.some((e) => e.role === role) || dealer.missing?.[role] ? (
              <RoleRow key={role} dealer={live} all={dealer.entries} role={role} step={null} open={open?.id ?? null} onOpen={(e) => setParams({ bild: e.id })} />
            ) : null,
          )}
        </div>
        <ArchivedRow dealer={dealer} open={open?.id ?? null} onOpen={(e) => setParams({ bild: e.id })} />
        <Measures measures={answer.measures} />
      </div>
      <MaterialViewer entries={row} index={open ? row.indexOf(open) : null} onIndex={(i) => setParams({ bild: i === null ? null : (row[i]?.id ?? null) })} revision={answer.revision} onDecided={() => void read()} dealerEntries={dealer.entries} lineage={lineage} />
      {!isSnapshot ? <AddDialog open={adding} onOpenChange={setAdding} dealers={answer.dealers} dealer={dealer.id} onAdded={added} /> : null}
    </Page>
  );
}
