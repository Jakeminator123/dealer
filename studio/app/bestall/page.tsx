"use client";

// /bestall/: Beställ's old address. Its queue, "Det här skickas" and Ny beställning are Bordet's Beställ since 2026-11-17, so
// in the lab the address leads there with the same words (?order=<id>, ?ny=1&dealer=…&steg=…&plats=…, ?ny=1&som=<id>):
// /bestall/?order=x opens /bordet/?lage=bestall&ko=1&order=x. The online copy orders nothing: there it opens Bordet.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { bordetOrderAddress } from "@/lib/bordet";
import { isSnapshot } from "@/lib/mode";

export default function Bestall() {
  return (
    <Suspense fallback={<Page title="Bordet" full />}>
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
  return <Page title="Bordet" full />;
}
