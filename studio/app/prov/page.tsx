"use client";

// /prov/: the old address of the proofs, which are now Granska's part Prov. A link here goes on there with the same
// question: /prov/?prov=x&fil=a.mp4 opens /granska/?prov=x&fil=a.mp4, and /prov/ the folders (lib/proofs.ts fromProvAddress).
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Page } from "@/components/shell";
import { fromProvAddress } from "@/lib/proofs";

export default function OldProvPage() {
  return (
    <Suspense fallback={<Page title="Granska" />}>
      <ToGranska />
    </Suspense>
  );
}

function ToGranska() {
  const router = useRouter();
  const to = fromProvAddress(useSearchParams().toString());
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <Page title="Granska" />;
}
