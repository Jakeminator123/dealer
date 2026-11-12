"use client";

// Prov (/prov/, /prov/?prov=<folder>&fil=<file>): the proof room. Without a proof: the folders as cards, newest first,
// searchable. With one: the proof open (ProofRoom); fil names the film playing or the picture open in the viewer.
// The proofs are read from /api/proofs when the page opens and again when its tab comes back into view.
// Must be inside <Suspense> (useSearchParams).
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { asApiError, getProofs, type ApiError, type Proof } from "../../lib/api.ts";
import { proofTitle } from "../../lib/proofs.ts";
import { splitLabel } from "../../lib/verdict.ts";
import { Page } from "../shell";
import { EmptyState, ErrorState, Skeleton, buttonClasses } from "../ui";
import { ProofGrid } from "./ProofGrid";
import { ProofRoom } from "./ProofRoom";

type State = { status: "loading" } | { status: "ready"; proofs: Proof[] } | { status: "error"; error: ApiError };

function replaceParams(next: Record<string, string | null>) {
  const p = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(next)) {
    if (value) p.set(key, value);
    else p.delete(key);
  }
  const query = p.toString();
  // null, never window.history.state: Next marks its own state (__NA) and takes a call that carries it for its own, so
  // useSearchParams would not follow and a click in the list would change the address but not the film.
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export function ProofsView() {
  const params = useSearchParams();
  const id = params.get("prov");
  const file = params.get("fil");
  const [state, setState] = useState<State>({ status: "loading" });

  const read = useCallback(async () => {
    try {
      const list = await getProofs();
      setState({ status: "ready", proofs: Array.isArray(list.proofs) ? list.proofs : [] });
    } catch (error) {
      setState((s) => (s.status === "ready" ? s : { status: "error", error: asApiError(error, "Proven") }));
    }
  }, []);

  useEffect(() => {
    void read();
    const seen = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, [read]);

  const back = (
    <Link href="/prov/" className={buttonClasses({ variant: "quiet", size: "sm" })}>
      <ArrowLeft /> Alla prov
    </Link>
  );

  if (state.status === "loading")
    return (
      <Page title="Prov">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 pt-12">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      </Page>
    );
  if (state.status === "error")
    return (
      <Page title="Prov">
        <ErrorState error={state.error} onRetry={() => void read()} />
      </Page>
    );

  if (!id)
    return (
      <Page title="Prov" status={`${state.proofs.length} prov`}>
        {state.proofs.length ? <ProofGrid proofs={state.proofs} /> : <EmptyState title="Inga prov ännu">Prov läggs under assets/proofs/.</EmptyState>}
      </Page>
    );

  const proof = state.proofs.find((p) => p.id === id);
  if (!proof)
    return (
      <Page title="Prov" actions={back}>
        <EmptyState title="Provet finns inte" action={back}>
          Ingen provmapp heter {id}.
        </EmptyState>
      </Page>
    );

  return (
    <Page title="Prov" status={<span className="truncate">{splitLabel(proofTitle(proof)).name}</span>} actions={back}>
      <ProofRoom key={proof.id} proof={proof} file={file} onFile={(name) => replaceParams({ fil: name })} />
    </Page>
  );
}
