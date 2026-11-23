"use client";

// <StillViewer entries={the tree's pictures} index={i} onIndex={setI} />: a picture of the tree large (Jakob 2026-11-23:
// "kan jag inte klicka på Ankarbilder … så som förstorar bilderna"), in Material's own viewer (MaterialViewer: ← → between
// the tree's pictures, Z full size, F its facts, Esc closes), and a click beside the picture closes it too. The viewer
// covers the window, so "beside" is read here: React passes a click on through its own tree, out of the viewer's portal to
// this wrapper, and a click that lands on no control, header, footer or facts, and not on the picture as it is drawn (a
// fitted <img> or <video> is the size of its box, wider or taller than the picture in it), closes the viewer.
import type { MouseEvent } from "react";
import type { EntryAnswer } from "@/lib/media";
import { MaterialViewer } from "../material/MaterialViewer";

/** Is the point on the picture as drawn in its element (object-contain: centred, at its own proportions)? */
function onPicture(el: HTMLImageElement | HTMLVideoElement, x: number, y: number): boolean {
  const box = el.getBoundingClientRect();
  const w = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth;
  const h = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
  const scale = w && h ? Math.min(box.width / w, box.height / h) : 1;
  const dw = w && h ? w * scale : box.width;
  const dh = w && h ? h * scale : box.height;
  const left = box.left + (box.width - dw) / 2;
  const top = box.top + (box.height - dh) / 2;
  return x >= left && x <= left + dw && y >= top && y <= top + dh;
}

export function StillViewer({ entries, index, onIndex }: { entries: readonly EntryAnswer[]; index: number | null; onIndex: (index: number | null) => void }) {
  const beside = (event: MouseEvent) => {
    const target = event.target as Element;
    if (index === null || !target.closest?.("[role=dialog]")) return;
    if (target.closest("header, footer, aside, button, a, input, select, textarea")) return;
    if ((target instanceof HTMLImageElement || target instanceof HTMLVideoElement) && onPicture(target, event.clientX, event.clientY)) return;
    onIndex(null);
  };
  return (
    <div className="contents" onClick={beside}>
      <MaterialViewer entries={entries} index={index} onIndex={onIndex} />
    </div>
  );
}
