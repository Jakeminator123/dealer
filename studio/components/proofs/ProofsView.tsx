"use client";

// Granska's part Prov (/granska/?vy=prov, /granska/?prov=<folder>&fil=<file>). Without a proof: the folders as cards,
// newest first, searchable. With one: the proof open (ProofRoom); fil names the film playing or the picture open in the
// viewer. The proofs are read from /api/proofs when the part opens and again when its tab comes back into view; the takes
// a proof names are looked up in every dealer's bank (useNamedTakes), so a card says how many of them wait for Jakob.
// Must be inside <Suspense> (useSearchParams).
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { asApiError, getProofs, type ApiError, type Proof } from "../../lib/api.ts";
import { PROOFS_HREF, proofTitle } from "../../lib/proofs.ts";
import { splitLabel } from "../../lib/verdict.ts";
import { GranskaFrame, replaceParams } from "../review/GranskaFrame";
import { EmptyState, ErrorState, Skeleton, buttonClasses } from "../ui";
import { ProofGrid } from "./ProofGrid";
import { ProofRoom } from "./ProofRoom";
import { useProofNotes } from "./NoteBar";
import { useNamedTakes } from "./ProofTakes";

type State = { status: "loading" } | { status: "ready"; proofs: Proof[] } | { status: "error"; error: ApiError };

export function ProofsView() {
  const params = useSearchParams();
  const id = params.get("prov");
  const file = params.get("fil");
  const [state, setState] = useState<State>({ status: "loading" });
  const named = useNamedTakes();
  const notes = useProofNotes();

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
    <Link href={PROOFS_HREF} className={buttonClasses({ variant: "quiet", size: "sm" })}>
      <ArrowLeft /> Alla prov
    </Link>
  );

  if (state.status === "loading")
    return (
      <GranskaFrame part="prov">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 pt-12">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      </GranskaFrame>
    );
  if (state.status === "error")
    return (
      <GranskaFrame part="prov">
        <ErrorState error={state.error} onRetry={() => void read()} />
      </GranskaFrame>
    );

  if (!id)
    return (
      <GranskaFrame part="prov" status={`${state.proofs.length} prov`}>
        {state.proofs.length ? <ProofGrid proofs={state.proofs} named={named} notes={notes.notes} /> : <EmptyState title="Inga prov ännu">Prov läggs under assets/proofs/.</EmptyState>}
      </GranskaFrame>
    );

  const proof = state.proofs.find((p) => p.id === id);
  if (!proof)
    return (
      <GranskaFrame part="prov" actions={back}>
        <EmptyState title="Provet finns inte" action={back}>
          Ingen provmapp heter {id}.
        </EmptyState>
      </GranskaFrame>
    );

  return (
    <GranskaFrame part="prov" status={splitLabel(proofTitle(proof)).name} actions={back}>
      <ProofRoom key={proof.id} proof={proof} file={file} named={named} notes={notes} onFile={(name) => replaceParams({ fil: name })} />
    </GranskaFrame>
  );
}
