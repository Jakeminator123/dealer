"use client";

// Scen: every part of the 3D scene can be changed here, with basgrund (what the game shows today) as the baseline to
// return to. The address carries the look: /scen/?forval=levande&dust=0.8 (components/scene-editor/SceneEditor.tsx).
import { Suspense } from "react";
import { SceneEditor } from "@/components/scene-editor";
import { Page } from "@/components/shell";

export default function ScenPage() {
  return (
    <Suspense fallback={<Page title="Scen" full />}>
      <SceneEditor />
    </Suspense>
  );
}
