// Placering (/placering/?vy=mobil&plats=p4c2&bakgrund=<film id>&ruta=40): where the cards and the shoe lie on the table,
// in Jakob's plan (placements/default.json through /api/placements); written only when he presses Spara.
import { Suspense } from "react";
import { PlacementView } from "@/components/placement";
import { Page } from "@/components/shell";

export default function Placering() {
  return (
    <Suspense fallback={<Page title="Placering" full />}>
      <PlacementView />
    </Suspense>
  );
}
