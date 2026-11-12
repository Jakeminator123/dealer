// Granska (/granska/?tagning=<id>, ?vy=alla): the takes that wait for Jakob's word, one at a time and large.
import { Suspense } from "react";
import { ReviewView } from "@/components/review";
import { Page } from "@/components/shell";

export default function Granska() {
  return (
    <Suspense fallback={<Page title="Granska" />}>
      <ReviewView />
    </Suspense>
  );
}
