// Granska (/granska/): one page with two parts. Filmer: ?tagning=<id>, ?vy=ko (the queue), ?vy=alla (every take);
// Prov: ?vy=prov (the proof folders), ?prov=<folder>&fil=<file> (one proof open). The old /prov/ leads here.
import { Suspense } from "react";
import { GranskaView } from "@/components/review";
import { Page } from "@/components/shell";

export default function Granska() {
  return (
    <Suspense fallback={<Page title="Granska" />}>
      <GranskaView />
    </Suspense>
  );
}
