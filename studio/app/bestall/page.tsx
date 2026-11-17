"use client";

// /bestall/: Beställ's old address. Its queue, "Det här skickas" and Ny beställning are Bordet's Beställ since 2026-11-17, so
// in the lab the address leads there with the same words (?order=<id>, ?ny=1&dealer=…&steg=…&plats=…, ?ny=1&som=<id>):
// /bestall/?order=x opens /bordet/?lage=bestall&ko=1&order=x. The online copy orders nothing and says so.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { bordetOrderAddress } from "@/lib/bordet";
import { isSnapshot } from "@/lib/mode";

export default function Bestall() {
  if (isSnapshot)
    return (
      <Page title="Beställ">
        <EmptyState title="Beställ finns bara i labbet">Beställningar förbereds och godkänns i Jakobs lokala labb.</EmptyState>
      </Page>
    );
  return (
    <Suspense fallback={<Page title="Beställ" full />}>
      <ToBordet />
    </Suspense>
  );
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const to = bordetOrderAddress(params);
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Beställ" full />;
}
