"use client";

// /scen/: the oldest address of the view Scen, which is Bordet's mode Scen since 2026-11-17. A link here goes there with
// the same question (lib/bordet.ts bordetSceneAddress): /scen/?forval=levande&dust=0.8 opens
// /bordet/?lage=scen&forval=levande&dust=0.8; an old link that named no preset meant basgrund, which Bordet opens on.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { bordetSceneAddress } from "@/lib/bordet";

export default function OldScenPage() {
  return (
    <Suspense fallback={<Page title="Bordet" full />}>
      <ToBordet />
    </Suspense>
  );
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const p = new URLSearchParams(params.toString());
  // a link of the old view always means its scene, even without a look
  if (![...p.keys()].some((k) => k !== "robot" && k !== "dealer")) p.set("forval", "basgrund");
  const to = bordetSceneAddress(p);
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Bordet" full />;
}
