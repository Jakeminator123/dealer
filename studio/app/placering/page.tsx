"use client";

// Placering (/placering/?vy=mobil&plats=p4c2&bakgrund=<film id>&ruta=40): where the cards and the shoe lie on the table, in
// Jakob's plan (placements/default.json through /api/placements); written only when he presses Spara. In the lab it is
// Bordet's Kortplan since 2026-11-17, so the address leads there with its card and view (/bordet/?plats=p4c2&vy=mobil);
// the online copy, which has no Bordet, keeps the view.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { PlacementView } from "@/components/placement";
import { Page } from "@/components/shell";
import { kortplanHref } from "@/lib/bordet";
import { isSnapshot } from "@/lib/mode";
import { readPlacementAddress } from "@/lib/placement";

export default function Placering() {
  return <Suspense fallback={<Page title="Placering" full />}>{isSnapshot ? <PlacementView /> : <ToBordet />}</Suspense>;
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const asked = readPlacementAddress(params);
  const to = kortplanHref(asked.place, asked.view);
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Placering" full />;
}
