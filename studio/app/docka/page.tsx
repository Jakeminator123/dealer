"use client";

// /docka/: the address the doll lab had as a view of its own (2026-11-23). The doll is a part of Scen & bord now
// (components/bordet/DollPanel.tsx), and a link here goes there with the same question: /docka/?dealer=paow opens
// /bordet/?dealer=paow&lage=docka. In the online copy, which has no doll lab, Bordet opens on its Kortplan.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";

export default function OldDollPage() {
  return (
    <Suspense fallback={<Page title="Scen & bord" full />}>
      <ToBordet />
    </Suspense>
  );
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const p = new URLSearchParams(params.toString());
  p.set("lage", "docka");
  const to = `/bordet/?${p.toString()}`;
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Scen & bord" full />;
}
