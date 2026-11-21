"use client";

// /bestall/: Beställ's old address, kept for old bookmarks. Its queue and "Det här skickas" are Scen & bord's Kön, and a new
// film is ordered in Kortplan's step 3 (Ny beställning is gone), so in the lab the address leads there with the same words:
// /bestall/?order=x opens Kön with that order; ?ny=1&som=x the order x; ?ny=1&dealer=…&steg=…&plats=… Kortplan at that card
// with that film on the list (components/bordet/BordetView.tsx reads them). The online copy orders nothing: there it opens
// Scen & bord.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { bordetOrderAddress } from "@/lib/bordet";
import { isSnapshot } from "@/lib/mode";

export default function Bestall() {
  return (
    <Suspense fallback={<Page title="Scen & bord" full />}>
      <ToBordet />
    </Suspense>
  );
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const to = isSnapshot ? "/bordet/" : bordetOrderAddress(params);
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Scen & bord" full />;
}
