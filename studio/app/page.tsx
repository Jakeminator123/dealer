"use client";

// The studio's start, and the view Scen's address before 2026-11-17: the studio opens on Bordet (components/bordet), and an
// address of Scen leads to Bordet's mode Scen (or Råfilm) with the same round and look on screen (lib/bordet.ts
// bordetSceneAddress): /?runda=…&forval=levande&dust=0.8 opens /bordet/?lage=scen&runda=…&forval=levande&dust=0.8,
// /?kant=<edge>&tagning=<take> plays that take there, and &vy=platt is the mode Råfilm.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { bordetSceneAddress } from "@/lib/bordet";

export default function Start() {
  return (
    <Suspense fallback={<Page title="Bordet" full />}>
      <ToBordet />
    </Suspense>
  );
}

function ToBordet() {
  const params = useSearchParams();
  const router = useRouter();
  const to = bordetSceneAddress(params);
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Bordet" full />;
}
