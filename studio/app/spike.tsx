"use client";

// A first proof that the pieces fit: the clip bank read from the lab server, the lab's own graph code built into the
// studio, and the lab's 3D scene mounted in a React component. It is replaced by the real views.
import { useEffect, useRef, useState } from "react";
import { buildGraph, resolveRound, type BankData, type Step } from "../../src/clip-graph.ts";
import type * as SceneView from "../../src/scene3d-view.ts";
import { labModule, readJson } from "../lib/lab";

export default function Spike() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("Läser klippbanken…");

  useEffect(() => {
    let gone = false;
    (async () => {
      const [contract, placements, bank] = await Promise.all([
        readJson("data/scene-contract.json", "Scenkontraktet"),
        readJson<{ plan?: unknown }>("api/placements", "Placeringsplanen"),
        readJson<BankData>("api/clip-bank", "Klippbanken"),
      ]);
      const graph = buildGraph(bank);
      const steps: Step[] = [
        { from: "IDLE", to: "READY" },
        { from: "READY", to: "P4.C1" },
        { from: "P4.C1", to: "IDLE" },
      ];
      const segments = resolveRound(graph, steps);
      const { createScene } = await labModule<typeof SceneView>("scene3d-view");
      if (gone || !canvas.current || !host.current) return;
      const scene = createScene(canvas.current, host.current, {
        contract: contract as never,
        plan: (placements.plan ?? placements) as never,
        urls: {
          plate: "assets/scene/room.png",
          panorama: "assets/scene/panorama-vegas.jpg",
          la: "assets/scene/panorama-la.jpg",
          skog: "assets/scene/panorama-skog.jpg",
        },
        onChange: () => {},
        onMissingRoom: () => {},
      });
      scene.rebuild();
      scene.start();
      new ResizeObserver(() => scene.resize()).observe(host.current);
      const parts = segments.filter((s) => s.video).map((s) => ({ path: s.video!, start: s.start, end: s.end }));
      scene.players.play(parts, { loop: true });
      setNote(`${graph.edges.length} kanter i banken · spelar ${parts.length} delar: ${segments.map((s) => s.take?.id ?? "saknas").join(" → ")}`);
    })().catch((error: Error) => setNote(error.message));
    return () => {
      gone = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-neutral-950 p-6 text-neutral-100">
      <h1 className="text-xl font-semibold">Dealer · Studio</h1>
      <p id="spike-note" className="text-sm text-neutral-400">{note}</p>
      <div ref={host} className="relative grid aspect-[1764/1174] w-full max-w-5xl place-items-center overflow-hidden rounded-xl bg-black">
        <canvas ref={canvas} />
      </div>
    </main>
  );
}
