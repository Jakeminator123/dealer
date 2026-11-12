"use client";

// Casino (/game/?forval=levande&dust=0.8&table=casino): blackjack as at the casino, with the look calibrated in Scen
// (components/casino/CasinoView.tsx).
import { Suspense } from "react";
import { CasinoView } from "@/components/casino";
import { Page } from "@/components/shell";

export default function CasinoPage() {
  return (
    <Suspense fallback={<Page title="Casino" full />}>
      <CasinoView />
    </Suspense>
  );
}
