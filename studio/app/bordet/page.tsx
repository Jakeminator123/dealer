// Bordet (/bordet/?lage=bestall&plats=p4c1): the lab's one view of the table, where a card's place, its way there, the films
// to order and the live picture share one frame (components/bordet). Lab only: the online copy says so.
import { Suspense } from "react";
import { BordetView } from "@/components/bordet";
import { Page } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";

export default function Bordet() {
  if (isSnapshot)
    return (
      <Page title="Bordet">
        <EmptyState title="Bordet finns bara i labbet">Kortplanen och beställningarna görs i Jakobs lokala labb.</EmptyState>
      </Page>
    );
  return (
    <Suspense fallback={<Page title="Bordet" full />}>
      <BordetView />
    </Suspense>
  );
}
