"use client";

// Primära is part of Karta since 2026-11-17 (Jakob: "Karta och primära ska bli en och samma typ av sida"): the old address
// leads there with its question kept (?kant=…&tagning=…&dealer=…), so a saved link opens the same step.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Page } from "@/components/shell";
import { Skeleton } from "@/components/ui";

export default function Primara() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/karta/${window.location.search}`);
  }, [router]);
  return (
    <Page title="Karta" full>
      <div className="grid h-full place-items-center p-10">
        <Skeleton className="h-[60%] w-[80%]" />
      </div>
    </Page>
  );
}
