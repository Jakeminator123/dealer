// What lies on the table but is no key of the scene's state: the chip tray's model, the 3D shoe and the chips. Each is a
// module of the lab (src/game3d-props.ts, game3d-tray.ts, game3d-chips.ts), read from the lab server the first time it is
// asked for, and laid in the scene as a prop, as the game (src/game-page.ts 201-221) and the lab's 3D page (src/scene3d-ui.ts
// chipsLab, shoe) do it. Nothing here is saved; a new scene starts without them and the view asks again.
import { labModule } from "../../lib/lab.ts";
import type { Scene } from "../stage/engines.ts";

type Props = typeof import("../../../src/game3d-props.ts");
type Trays = typeof import("../../../src/game3d-tray.ts");
type ChipsModule = typeof import("../../../src/game3d-chips.ts");
type Geometry = typeof import("../../../src/scene3d-geometry.ts");
type Freeable = { group: { traverse(fn: (o: unknown) => void): void } };

/** The tray: the scene's built one (state key tray), Jakob's model as the game lays it, or the house tray with its own chips (lab trial). */
export type TrayModel = "byggd" | "jakobs" | "huset";
export type ExtrasState = { tray: TrayModel; shoe: boolean; chips: boolean };
export type ExtrasNote = { what: "tray" | "shoe" | "chips"; text: string } | null;

const BETS: Record<number, number[]> = { 2: [25, 25, 100], 4: [5, 5, 25], 6: [100, 500] };
const now = () => performance.now() / 1000;

// A model read from a GLB has nothing to free once the scene's renderer is gone, but its geometries and materials are let go anyway.
function free(prop: Freeable | null) {
  prop?.group.traverse((o) => {
    const mesh = o as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
    mesh.geometry?.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) m.dispose();
  });
}

export function createExtras(scene: Scene, onNote: (note: ExtrasNote) => void) {
  let gone = false;
  let want: ExtrasState = { tray: "byggd", shoe: false, chips: false };
  let tray: { kind: TrayModel; remove: () => void; prop: Freeable } | null = null;
  let trayAsked = 0;
  let shoe: { remove: () => void; off: () => void; prop: Freeable } | null = null;
  let shoeAsked = 0;
  let chips: { made: ReturnType<ChipsModule["createChips"]>; remove: () => void; off: () => void } | null = null;
  let chipsLoad: Promise<void> | null = null;
  let gloss = 0.5;

  async function setTray(kind: TrayModel) {
    want = { ...want, tray: kind };
    const asked = ++trayAsked;
    if (tray?.kind === kind) return;
    if (tray) {
      tray.remove();
      free(tray.prop);
      tray = null;
      scene.notch(null);
    }
    if (kind === "byggd") return;
    try {
      const made =
        kind === "jakobs"
          ? await (await labModule<Props>("game3d-props")).loadTray(scene)
          : (await labModule<Trays>("game3d-tray")).createHouseTray(scene);
      if (gone || asked !== trayAsked) return;
      scene.notch(made.notch);
      tray = { kind, remove: scene.addProp(made), prop: made };
      onNote(null);
    } catch {
      if (!gone && asked === trayAsked) onNote({ what: "tray", text: kind === "jakobs" ? "Jakobs bricka (assets/props/tray.glb) finns inte på den här datorn." : "Husets bricka kunde inte läsas." });
    }
  }

  async function setShoe(on: boolean) {
    want = { ...want, shoe: on };
    const asked = ++shoeAsked;
    if (!on) {
      if (shoe) {
        shoe.remove();
        shoe.off();
        free(shoe.prop);
        shoe = null;
        scene.hideFilm(null);
      }
      return;
    }
    if (shoe) return;
    try {
      const [m, g] = await Promise.all([labModule<Props>("game3d-props"), labModule<Geometry>("scene3d-geometry")]);
      const camera = scene.status().camera;
      const at = (p: number[]) => g.filmToScene(camera, p[0], p[1]);
      const prop = await m.loadShoe(scene, { rear: at(m.FILM_SHOE.rear), front: at(m.FILM_SHOE.front), far: at(m.FILM_SHOE.far) });
      if (gone || asked !== shoeAsked || shoe) return;
      const box = m.FILM_SHOE.box;
      // the film's own shoe is left undrawn, except in a film with a frame of its own (a whole body), whose box holds something else
      const off = scene.onFrame(() => scene.hideFilm(scene.players.part?.frame ? null : box));
      shoe = { remove: scene.addProp(prop), off, prop };
      onNote(null);
    } catch {
      if (!gone && asked === shoeAsked) onNote({ what: "shoe", text: "Skomodellen (assets/props/shoe.glb) finns inte på den här datorn." });
    }
  }

  function loadChips() {
    chipsLoad ??= labModule<ChipsModule>("game3d-chips").then((m) => {
      if (gone) return;
      const made = m.createChips(scene);
      made.setGloss(gloss);
      chips = { made, remove: scene.addProp(made), off: scene.onFrame(() => void made.update(now())) };
    });
    return chipsLoad;
  }

  return {
    /** What is asked for now; each part changes only when it differs. */
    async apply(next: ExtrasState) {
      if (next.tray !== want.tray) void setTray(next.tray);
      if (next.shoe !== want.shoe) void setShoe(next.shoe);
      if (next.chips !== want.chips) {
        want = { ...want, chips: next.chips };
        try {
          if (next.chips || chips) await loadChips();
          if (!gone) chips?.made.set(next.chips ? BETS : {}, now());
        } catch {
          if (!gone) onNote({ what: "chips", text: "Markerna kunde inte läsas." });
        }
      }
    },
    /** The chips' gloss (state key chipGloss, which only the page that lays chips reads). */
    gloss(value: number) {
      gloss = value;
      chips?.made.setGloss(value);
    },
    dispose() {
      if (gone) return;
      gone = true;
      tray?.remove();
      shoe?.remove();
      shoe?.off();
      chips?.remove();
      chips?.off();
      chips?.made.dispose();
      free(tray?.prop ?? null);
      free(shoe?.prop ?? null);
      tray = shoe = chips = null;
    },
  };
}
export type Extras = ReturnType<typeof createExtras>;
