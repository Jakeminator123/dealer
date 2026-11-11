// The dealer's chip tray with the house's own chips in it: the same five chips the players bet with, on edge in rows, sunk
// into the felt at her edge where the film's hands rest. A trial beside Jakob's tray model (game.html?bricka=hus): the chips
// the house wins go into it and winnings come out of it, so the chips on the table and the chips in the tray are one kind.
//
// A row is one cylinder with the chip's edge repeated along it and the chip's printed face on its end, not a mesh per chip:
// a full tray is three hundred chips. The recess is the scene's built tray (src/scene3d-props.ts), with rows to fit the chip.
import * as T from 'three';
import {CHIP_COLOURS, CHIP_PRINT, createChipPrint} from '../materials/source/src/chip-material-study.ts';
import {CHIP_HEIGHT, CHIP_RADIUS, lookOf} from './game3d-chips.ts';
import {TRAY} from './scene3d-props.ts';

// Which chip lies in each row, from image left to right: the small ones outermost, as a dealer keeps them.
export const TRAY_ROWS = [5, 5, 25, 25, 100, 100, 500, 1000, 500, 100, 25, 5];
export const TRAY_FILL = {start: 20, room: 27}; // chips in a row when the table opens, and how many a row holds
const WALL = 0.004, SINK = 0.002; // the tray's wall, and how far under the felt the chips' tops lie

/**
 * The row a chip of a value goes into, or comes out of when `taking`: of the rows of that chip, the emptiest that has room,
 * or the fullest that has a chip. -1: no such row. A value without a row of its own uses the nearest chip below it.
 */
export function rowFor(counts: number[], value: number, taking: boolean): number {
  const chip = Number(lookOf(value).value); let best = -1;
  TRAY_ROWS.forEach((row, i) => { if (row !== chip || (taking ? counts[i] < 1 : counts[i] >= TRAY_FILL.room)) return; if (best < 0 || (taking ? counts[i] > counts[best] : counts[i] < counts[best])) best = i; });
  return best;
}
/** Where a row lies: its middle across the table, and the players' end of its chips (dealer metres, x and s). */
export function rowPlace(row: number): {x: number; s: number} {
  const pitch = (TRAY.x1 - TRAY.x0 - 2 * WALL) / TRAY_ROWS.length;
  return {x: TRAY.x0 + WALL + pitch * (row + 0.5), s: TRAY.s1 - WALL - 0.002};
}

// One chip's edge as it shows in a row: the chip's colour with its eight yellow inlays, and a thin dark line where two chips meet.
function edgeTexture(colour: string): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 16; const g = canvas.getContext('2d')!;
  g.fillStyle = colour; g.fillRect(0, 0, 256, 16); g.fillStyle = CHIP_PRINT.yellow; for (let i = 0; i <= 8; i++) g.fillRect(i * 32 - 4, 0, 8, 16);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, 256, 2);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 8; return texture;
}

type Scene = {lit<M extends T.Material>(material: M): M};
export function createHouseTray(scene: Scene) {
  const group = new T.Group(), counts = TRAY_ROWS.map(() => TRAY_FILL.start), owned: {dispose(): void}[] = [];
  const keep = <O extends {dispose(): void}>(o: O) => { owned.push(o); return o; };
  const rows: {side: T.Mesh; cap: T.Mesh; edge: T.Texture}[] = [];
  // A row's cylinder is one metre long and scaled to its chips; its end with the printed face stays at the players' end.
  function size(row: number) {
    const {side, cap, edge} = rows[row], n = counts[row], length = Math.max(1, n) * CHIP_HEIGHT, at = rowPlace(row);
    side.visible = cap.visible = n > 0; side.scale.z = length; side.position.set(at.x, -CHIP_RADIUS - SINK, at.s - length / 2); edge.repeat.set(1, Math.max(1, n));
    cap.position.set(at.x, -CHIP_RADIUS - SINK, at.s + 0.0001);
  }
  return {
    group,
    notch: {x0: TRAY.x0, x1: TRAY.x1, s1: TRAY.s1}, // the felt is cut out here (scene.notch)
    build(edgeZ: number, scale: number) {
      for (const child of [...group.children]) group.remove(child); for (const o of owned.splice(0)) o.dispose(); rows.length = 0;
      group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
      const {x0, x1, s0, s1} = TRAY, width = x1 - x0, length = s1 - s0, depth = 2 * CHIP_RADIUS + SINK + 0.003, cx = (x0 + x1) / 2, cs = (s0 + s1) / 2, rim = 0.007;
      const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, s: number) => { const m = new T.Mesh(keep(geometry), material); m.position.set(x, y, s); group.add(m); return m; };
      const metal = keep(scene.lit(new T.MeshStandardMaterial({color: 0xb8923f, roughness: 0.45, metalness: 0.35}))), dark = keep(scene.lit(new T.MeshStandardMaterial({color: 0x15120f, roughness: 0.8, metalness: 0.2})));
      add(new T.BoxGeometry(width, 0.002, length), dark, cx, -depth, cs); // floor
      for (const [w, d, x, s] of [[width, WALL, cx, s0 + WALL / 2], [width, WALL, cx, s1 - WALL / 2], [WALL, length, x0 + WALL / 2, cs], [WALL, length, x1 - WALL / 2, cs]]) add(new T.BoxGeometry(w, depth, d), dark, x, -depth / 2, s); // walls
      for (const [w, d, x, s] of [[width + 2 * rim, rim, cx, s0 - rim / 2], [width + 2 * rim, rim, cx, s1 + rim / 2], [rim, length, x0 - rim / 2, cs], [rim, length, x1 + rim / 2, cs]]) add(new T.BoxGeometry(w, 0.003, d), metal, x, 0.0003 - 0.0015, s); // rim, flush with the felt
      const pitch = (width - 2 * WALL) / TRAY_ROWS.length, tube = keep(new T.CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, 1, 32, 1, true).rotateX(Math.PI / 2)), face = keep(new T.CircleGeometry(CHIP_RADIUS, 32));
      const faces = new Map<number, T.Material>();
      TRAY_ROWS.forEach((value, row) => {
        const look = lookOf(value), edge = keep(edgeTexture(CHIP_COLOURS[look.colour].ink));
        let print = faces.get(value); if (!print) { const small = document.createElement('canvas'); small.width = small.height = 256; small.getContext('2d')!.drawImage(createChipPrint(look.value, look.colour), 0, 0, 256, 256);
          const map = keep(new T.CanvasTexture(small)); map.colorSpace = T.SRGBColorSpace; print = keep(scene.lit(new T.MeshStandardMaterial({map, roughness: 0.5, metalness: 0}))); faces.set(value, print); }
        const side = new T.Mesh(tube, keep(scene.lit(new T.MeshStandardMaterial({map: edge, roughness: 0.5, metalness: 0})))), cap = new T.Mesh(face, print);
        group.add(side, cap); rows.push({side, cap, edge}); size(row);
        if (row) add(new T.BoxGeometry(0.0016, CHIP_RADIUS + 0.006, length - 2 * WALL), dark, x0 + WALL + pitch * row, -depth + (CHIP_RADIUS + 0.006) / 2, cs); // divider between rows
      });
    },
    /** Where a chip of that value enters the tray, or leaves it when `taking`: the players' end of its row, standing on edge (x, y above the felt, s). */
    mouth(value: number, taking: boolean) { const row = rowFor(counts, value, taking), at = rowPlace(row < 0 ? TRAY_ROWS.indexOf(Number(lookOf(value).value)) : row); return {x: at.x, y: -CHIP_RADIUS - SINK, s: at.s + CHIP_HEIGHT / 2}; },
    /** A chip has come in, or gone out. False when its rows are full, or empty: the tray is then left as it is. */
    add(value: number) { const row = rowFor(counts, value, false); if (row < 0) return false; counts[row]++; if (rows[row]) size(row); return true; },
    remove(value: number) { const row = rowFor(counts, value, true); if (row < 0) return false; counts[row]--; if (rows[row]) size(row); return true; },
    counts: () => [...counts],
  };
}
