"use client";

// Placering's address (/placering/?plats=p4c2): Bordet's Kortplan since 2026-11-17, in the lab and in the online copy, so the
// address leads there with its card (/bordet/?plats=p4c2); an old vy=mobil is dropped, the plan has one view since 2026-11-18.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { kortplanHref } from "@/lib/bordet";
import { readPlacementAddress } from "@/lib/placement";

export default function Placering() {
  return (
    <Suspense fallback={<Page title="Bordet" full />}>
      <ToBordet />
    </Suspense>
  );
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const asked = readPlacementAddress(params);
  const to = kortplanHref(asked.place);
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Bordet" full />;
}
