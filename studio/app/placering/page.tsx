"use client";

// Placering's address (/placering/?plats=p4c2): Scen & bord's Kortplan since 2026-11-17, in the lab and in the online copy, so
// the address leads there with its card, any of the plan's places (/bordet/?plats=dc3), and the rest of the address as it
// stands (dealer, robot, bakgrund …), as Beställ's old address does; an old vy=mobil is dropped, the plan has one view since
// 2026-11-18.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { START_PLACE, placeCode, readPlacementAddress } from "@/lib/placement";

export default function Placering() {
  return (
    <Suspense fallback={<Page title="Scen & bord" full />}>
      <ToBordet />
    </Suspense>
  );
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const { place } = readPlacementAddress(params);
  const p = new URLSearchParams();
  params.forEach((value, key) => {
    if (key !== "plats" && key !== "vy") p.append(key, value);
  });
  if (place !== START_PLACE) p.set("plats", placeCode(place).toLowerCase());
  const query = p.toString();
  const to = query ? `/bordet/?${query}` : "/bordet/";
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Scen & bord" full />;
}
