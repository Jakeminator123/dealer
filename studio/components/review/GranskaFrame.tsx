"use client";

// <GranskaFrame part="filmer" status={…} actions={…}>…</GranskaFrame>: the header both parts of Granska share. The title,
// then the choice of part (Filmer: the takes, with how many wait for Jakob; Prov: the proof folders), the part's own state,
// and its own buttons at the right. A part left keeps where it was: going back to it opens the take or the proof that was
// open (for as long as the tab lives). The address says which part is shown (lib/review.ts partOf).
import type { ReactNode } from "react";
import { useBank } from "../../lib/bank.ts";
import { withDealer } from "../../lib/dealer.ts";
import { PROOFS_HREF } from "../../lib/proofs.ts";
import type { GranskaPart } from "../../lib/review.ts";
import { awaitingJakob } from "../../lib/verdict.ts";
import { Page } from "../shell";
import { SegmentedControl } from "../ui";

/**
 * The address with these words set (a value) or taken out (null). null, never history.state: Next marks its own state
 * (__NA) and takes a call that carries it for its own, so useSearchParams would not follow and the view would not change
 * with its address.
 */
export function replaceParams(next: Record<string, string | null>) {
  const p = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(next)) {
    if (value) p.set(key, value);
    else p.delete(key);
  }
  const query = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

/** Where each part was when it was left (its question without the dealer's word); null: its plain start. */
const left: Record<GranskaPart, string | null> = { filmer: null, prov: null };
const START: Record<GranskaPart, string> = { filmer: "", prov: PROOFS_HREF.split("?")[1] };

function switchTo(from: GranskaPart, to: GranskaPart) {
  if (from === to) return;
  const here = new URLSearchParams(window.location.search);
  const dealer = here.get("dealer");
  here.delete("dealer");
  left[from] = here.toString();
  const query = withDealer(left[to] ?? START[to], dealer);
  window.history.replaceState(null, "", `${window.location.pathname}${query}`);
}

export function GranskaFrame({ part, status, actions, full = false, children }: { part: GranskaPart; status?: ReactNode; actions?: ReactNode; full?: boolean; children?: ReactNode }) {
  const { graph } = useBank();
  const waiting = graph ? awaitingJakob(graph).length : null;
  return (
    <Page
      title="Granska"
      full={full}
      actions={actions}
      status={
        <>
          <SegmentedControl
            label="Del"
            value={part}
            onChange={(to) => switchTo(part, to)}
            options={[
              { value: "filmer", label: waiting ? `Filmer · ${waiting}` : "Filmer", title: "Tagningarna: de som väntar på ditt beslut, de som dömts åt dig och alla" },
              { value: "prov", label: "Prov", title: "Provmapparna: jämförelsefilmer och kontaktark från arbetet" },
            ]}
          />
          {status ? <span className="min-w-0 truncate">{status}</span> : null}
        </>
      }
    >
      {children}
    </Page>
  );
}
