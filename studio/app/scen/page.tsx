"use client";

// /scen/: the old address of the Scen view, which is now the studio's start (app/page.tsx: the scene where a round plays and
// everything can be changed). A link here goes on there with the same question: /scen/?forval=levande&dust=0.8 opens
// /?forval=levande&dust=0.8; an old link that named no preset meant basgrund, and says so on the way (fromOldScen).
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { fromOldScen } from "@/components/scene-editor";
import { Page } from "@/components/shell";

export default function OldScenPage() {
  return (
    <Suspense fallback={<Page title="Scen" full />}>
      <ToScen />
    </Suspense>
  );
}

function ToScen() {
  const params = useSearchParams();
  const router = useRouter();
  const to = fromOldScen(params);
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Scen" full />;
}
