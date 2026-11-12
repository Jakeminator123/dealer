// Changes on their way to the scene. A slider moved fast sends many values: they are gathered and handed to scene.set once
// per drawn frame. A key that builds the table again (scale) or paints the felt again (the logo text) waits until the
// hand has stopped for a moment, as the lab page does it (src/scene3d-ui.ts: 120 ms for the scale).
import type { SceneState } from "../../../src/scene3d-view.ts";
import type { SceneKey } from "../../lib/scene-keys.ts";
import type { Scene } from "../stage/engines.ts";

const SLOW: ReadonlySet<SceneKey> = new Set<SceneKey>(["scale", "logo"]);
const WAIT_MS = 160;

export type Patcher = {
  /** Sends a change: at the next frame, or after a short rest for the slow keys. */
  set(patch: Partial<SceneState>): void;
  /** Sends everything waiting and this change now (a preset, the comparison). */
  now(patch?: Partial<SceneState>): void;
  /** The keys not yet handed to the scene: the scene's own values of them are old. */
  pending(): ReadonlySet<string>;
  dispose(): void;
};

export function createPatcher(scene: () => Scene | null): Patcher {
  let quick: Record<string, unknown> = {};
  let slow: Record<string, unknown> = {};
  let frame = 0;
  let timer = 0;
  const send = (patch: Record<string, unknown>) => {
    const s = scene();
    if (s && Object.keys(patch).length) s.set(patch as Partial<SceneState>);
  };
  const flushQuick = () => {
    frame = 0;
    const p = quick;
    quick = {};
    send(p);
  };
  const flushSlow = () => {
    timer = 0;
    const p = slow;
    slow = {};
    send(p);
  };
  return {
    set(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (SLOW.has(key as SceneKey)) slow[key] = value;
        else quick[key] = value;
      }
      if (Object.keys(slow).length) {
        window.clearTimeout(timer);
        timer = window.setTimeout(flushSlow, WAIT_MS);
      }
      if (Object.keys(quick).length && !frame) frame = requestAnimationFrame(flushQuick);
    },
    now(patch = {}) {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      frame = timer = 0;
      const all = { ...slow, ...quick, ...patch };
      quick = {};
      slow = {};
      send(all);
    },
    pending: () => new Set([...Object.keys(quick), ...Object.keys(slow)]),
    dispose() {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      quick = {};
      slow = {};
    },
  };
}
