"use client";

// Granska (/granska/): one page, two parts chosen in its header (GranskaFrame). Filmer (ReviewView): the takes that wait
// for Jakob's word, those judged for him and every take; Prov (ProofsView): the proof folders under assets/proofs/. The
// address says which (lib/review.ts partOf: ?vy=prov or ?prov=<folder> is Prov); the bot's panel is told the part on
// screen under its own name. Must be inside <Suspense> (useSearchParams).
import { useSearchParams } from "next/navigation";
import { ViewContext } from "../../lib/context.ts";
import { partOf } from "../../lib/review.ts";
import { ProofsView } from "../proofs/ProofsView";
import { ReviewView } from "./ReviewView";

export function GranskaView() {
  const part = partOf(useSearchParams());
  return part === "prov" ? (
    <>
      <ViewContext key="prov" vy="prov" />
      <ProofsView />
    </>
  ) : (
    <>
      <ViewContext key="granska" vy="granska" />
      <ReviewView />
    </>
  );
}
