// Granska (/granska/?tagning=<id>, ?vy=alla): the takes that wait for Jakob's word, one at a time and large.
import { Suspense } from "react";
import { ReviewView } from "@/components/review";
import { Page } from "@/components/shell";
import { ViewContext } from "@/lib/context";

export default function Granska() {
  return (
    <Suspense fallback={<Page title="Granska" />}>
      <ViewContext vy="granska" />
      <ReviewView />
    </Suspense>
  );
}
