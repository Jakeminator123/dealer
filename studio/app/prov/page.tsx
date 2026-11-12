// Prov (/prov/?prov=<folder>&fil=<file>): the proof room: proof folders newest first, one proof open with its films and pictures.
import { Suspense } from "react";
import { ProofsView } from "@/components/proofs";
import { Page } from "@/components/shell";
import { ViewContext } from "@/lib/context";

export default function Prov() {
  return (
    <Suspense fallback={<Page title="Prov" />}>
      <ViewContext vy="prov" />
      <ProofsView />
    </Suspense>
  );
}
