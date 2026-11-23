// Material (/material/?dealer=<id>&bild=<entry id>): what is what per dealer: the chain from the first picture to
// the films, the references, the rest and the sources of measures; data/media-roles.json through GET /api/media (the proofs
// are Granska's Prov).
import { Suspense } from "react";
import { MaterialView } from "@/components/material";
import { Page } from "@/components/shell";

export default function Material() {
  return (
    <Suspense fallback={<Page title="Material" />}>
      <MaterialView />
    </Suspense>
  );
}
