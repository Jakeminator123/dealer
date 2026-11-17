// Bordet (/bordet/?lage=bestall&plats=p4c1): the lab's one view of the table, where a card's place, its way there, the films
// to order and the live picture share one frame (components/bordet). In the online copy it reads only (no Beställ, no saving).
import { Suspense } from "react";
import { BordetView } from "@/components/bordet";
import { Page } from "@/components/shell";

export default function Bordet() {
  return (
    <Suspense fallback={<Page title="Bordet" full />}>
      <BordetView />
    </Suspense>
  );
}
