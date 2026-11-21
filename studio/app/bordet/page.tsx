// Scen & bord (/bordet/?plats=p4c2, ?lage=ko for Kön): the lab's one view of the table, where a card's place, its way there,
// the films to order and the live picture share one frame (components/bordet). In the online copy it reads only (no Kön, no
// saving).
import { Suspense } from "react";
import { BordetView } from "@/components/bordet";
import { Page } from "@/components/shell";

export default function Bordet() {
  return (
    <Suspense fallback={<Page title="Scen & bord" full />}>
      <BordetView />
    </Suspense>
  );
}
