"use client";

// <ProofGrid proofs={list} named={named} notes={notes} />: the proof folders newest first as cards (a still, the title, how
// many films and pictures, the takes' verdicts counted (lib/verdict.ts: underlag is not counted), how many places Jakob has
// said something about, how many takes it names wait for Jakob), a search field, and a last line to
// the proof Filmbiblioteket (V6 and the older films) when it is there.
import { ArrowRight, Film, MessageSquare, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Proof } from "../../lib/api.ts";
import { countLine, coverOf, matchProof, proofDay, proofHref, proofTitle, sortProofs, verdictTally } from "../../lib/proofs.ts";
import { PROOF_VERDICT_LABEL, splitLabel, type ProofVerdict } from "../../lib/verdict.ts";
import { notesOn, type ShownNote } from "../../lib/proof-notes.ts";
import { isSnapshot } from "../../lib/mode.ts";
import { EmptyState, TextField, cn } from "../ui";
import { ProofStill } from "./ProofStill";
import { waitingIn, type NamedTakes } from "./ProofTakes";

// The proof folder that holds V6 and the older films (assets/proofs/filmbiblioteket/, made from data/library.json).
const LIBRARY = "filmbiblioteket";

const TALLY: { verdict: ProofVerdict; sign: string; tone: string }[] = [
  { verdict: "ok", sign: "✓", tone: "text-[#6cc595]" },
  { verdict: "remarks", sign: "!", tone: "text-[#f0b07a]" },
  { verdict: "failed", sign: "✕", tone: "text-[#ef8b8b]" },
  { verdict: "unreviewed", sign: "○", tone: "text-faint" },
];

function ProofCard({ proof, waiting, said }: { proof: Proof; waiting: number; said: number }) {
  const cover = coverOf(proof);
  const films = proof.files.filter((f) => f.kind === "video").length;
  const tally = verdictTally(proof);
  const title = splitLabel(proofTitle(proof)).name;
  const day = proofDay(proof);
  return (
    <Link
      href={proofHref(proof.id)}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-inset transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-[#151c18] focus-visible:outline-offset-2"
    >
      <div className="relative">
        <ProofStill cover={cover} fps={proof.fps} className="aspect-[16/10] transition-[filter] duration-200 group-hover:brightness-110" />
        {waiting ? (
          <span className="pointer-events-none absolute left-2 top-2 rounded-xs bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-brass-hi backdrop-blur-sm">
            {waiting === 1 ? "1 tagning väntar" : `${waiting} tagningar väntar`}
          </span>
        ) : null}
        {films ? (
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-xs bg-black/65 px-1.5 py-0.5 text-2xs font-medium text-ink backdrop-blur-sm">
            <Film className="size-3" /> {films}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3 pt-2.5">
        <span className="line-clamp-2 text-sm font-semibold leading-5 text-ink" title={proofTitle(proof)}>
          {title}
        </span>
        <span className="mt-auto flex items-center gap-2 text-xs text-faint">
          <span className="truncate">{[countLine(proof), day].filter(Boolean).join(" · ")}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {said ? (
              <span title={`${isSnapshot ? "Jakob har" : "Du har"} sagt något om ${said === 1 ? "en sak" : `${said} saker`} i provet`} className="inline-flex items-center gap-0.5 font-medium tabular-nums text-brass-hi [&_svg]:size-3">
                <MessageSquare /> {said}
              </span>
            ) : null}
            {TALLY.filter((t) => tally[t.verdict]).map((t) => (
              <span key={t.verdict} title={`${PROOF_VERDICT_LABEL[t.verdict]}: ${tally[t.verdict]}`} className={cn("font-medium tabular-nums", t.tone)}>
                {t.sign} {tally[t.verdict]}
              </span>
            ))}
          </span>
        </span>
      </div>
    </Link>
  );
}

export function ProofGrid({ proofs, named, notes }: { proofs: readonly Proof[]; named: NamedTakes; notes: readonly ShownNote[] }) {
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => sortProofs(proofs), [proofs]);
  const shown = useMemo(() => sorted.filter((p) => matchProof(p, query)), [sorted, query]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <TextField
          aria-label="Sök bland proven"
          placeholder="Sök: titel, mapp eller ord i beskrivningen"
          icon={<Search />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          wrapperClassName="w-[380px] max-w-full"
        />
        <span className="text-sm text-faint tabular-nums">{query.trim() ? `${shown.length} av ${proofs.length} prov` : `${proofs.length} prov · senast ändrade först`}</span>
      </div>
      {shown.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {shown.map((p) => (
            <li key={p.id}>
              <ProofCard proof={p} waiting={waitingIn(p, named)} said={notesOn(notes, p.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title="Inget prov matchar">
          Prova ett annat ord.
        </EmptyState>
      )}
      {proofs.some((p) => p.id === LIBRARY) ? (
        <Link href={proofHref(LIBRARY)} className="inline-flex w-fit items-center gap-1.5 text-sm text-dim transition-colors hover:text-ink">
          V6 och de äldre filmerna finns i Filmbiblioteket <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
