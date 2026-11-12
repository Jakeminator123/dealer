// Beställ (/bestall/?order=<id>): prepare an order for a picture or a film from Runway, see exactly what is sent, and
// approve it; an ordering agent places approved orders when Jakob says "lägg kön" (tools/order-clerk.md). Only in the
// local lab: the online copy shows a word instead.
import { Suspense } from "react";
import { OrderView } from "@/components/order";
import { Page } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";

export default function Bestall() {
  if (isSnapshot)
    return (
      <Page title="Beställ">
        <EmptyState title="Beställ finns bara i labbet">Beställningar förbereds och godkänns i Jakobs lokala labb.</EmptyState>
      </Page>
    );
  return (
    <Suspense fallback={<Page title="Beställ" />}>
      <OrderView />
    </Suspense>
  );
}
