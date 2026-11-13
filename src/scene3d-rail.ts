// Things set into the players' rail that are not the rail itself: cup holders in the leather. Off until the scene is asked
// for them (state cups), so the scene opens as it was. Sizes are dealer metres, as in the table.
// (A line of light along the felt edge stood here until 2026-11-11; Jakob turned it down as not natural light. Light on the
// table comes from the room: the table's surface 'photo' and roomLight.)
import * as T from 'three';
import {RAIL, TABLE, roomReflection, sized} from './scene3d-table.ts';

/**
 * Where cup holders sit along the rail: the angle on the players' arc (0 at the +x end, π at the -x end) of one between
 * each pair of neighbouring seats and one outside each end seat, as far out as the seats are apart. `seats` are the bet rings
 * (dealer metres: x across, s from the dealer-side edge). One that would land on the rail's rounded ends is left out. The angles
 * are those of TABLE's own oval; a table of another size (sized) has the same oval larger, so they hold for it too.
 */
export function cupAngles(seats: {x: number; s: number}[]): number[] {
  const at = seats.map(p => Math.atan2(p.s / TABLE.b, p.x / TABLE.a)).sort((p, q) => p - q); if (at.length < 2) return [];
  const step = (at[at.length - 1] - at[0]) / (at.length - 1), out = [at[0] - step / 2];
  for (let i = 0; i < at.length - 1; i++) out.push((at[i] + at[i + 1]) / 2);
  out.push(at[at.length - 1] + step / 2);
  return out.filter(t => t > 0.12 && t < Math.PI - 0.12);
}
/** The middle of the leather roll's top at arc angle t: [x, y, z] in the table's own metres (z from the dealer-side edge toward the players), for a table of `size` (sized). */
export function railTop(t: number, size = 1): number[] {
  const {a, b} = sized(size), l = Math.hypot(b * Math.cos(t), a * Math.sin(t));
  return [a * Math.cos(t) + RAIL.centre * b * Math.cos(t) / l, RAIL.top, b * Math.sin(t) + RAIL.centre * a * Math.sin(t) / l];
}

// A cup holder: a brass ring `lift` above the roll's crown (the roll falls away to both sides, so a ring lying on the crown would
// be sunk in leather along the rail and float across it), a skirt from the ring down into the leather, and the dark inside.
const CUP = {radius: 0.031, tube: 0.0026, lift: 0.003, skirt: 0.014, inside: 0.0296};

export function createRailExtras(lit: <M extends T.Material>(material: M) => M = m => m) {
  const group = new T.Group();
  const room = roomReflection();
  const brass = lit(new T.MeshStandardMaterial({color: 0xb08a45, roughness: 0.3, metalness: 1, envMap: room, envMapIntensity: 1.6}));
  // The inside of a cup, seen from above: dark, a little lighter toward the wall, with a thin gleam along one side of it.
  const hollow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, fill = g.createRadialGradient(64, 70, 6, 64, 64, 64);
    fill.addColorStop(0, '#040302'); fill.addColorStop(0.7, '#0b0806'); fill.addColorStop(0.93, '#2a1f12'); fill.addColorStop(1, '#4a3820'); g.fillStyle = fill; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,214,150,.35)'; g.lineWidth = 2.5; g.beginPath(); g.arc(64, 64, 58, 3.5, 4.9); g.stroke();
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return lit(new T.MeshBasicMaterial({map: t})); })();
  const cups = new T.Group(); group.add(cups); cups.visible = false;

  return {
    group,
    /** Built with the table: the same place, scale and size, and the seats' bet rings for where the cups go. */
    build(edgeZ: number, scale: number, seats: {x: number; s: number}[], size = 1) {
      group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
      // cup holders: a ring, its skirt and the dark inside, each drawn once for all cups
      for (const child of [...cups.children]) { cups.remove(child); (child as T.InstancedMesh).geometry.dispose(); }
      const places = cupAngles(seats).map(t => railTop(t, size)), parts: [T.BufferGeometry, T.Material][] = [
        [new T.TorusGeometry(CUP.radius, CUP.tube, 10, 48).rotateX(Math.PI / 2).translate(0, CUP.lift, 0), brass],
        [new T.CylinderGeometry(CUP.radius + CUP.tube * 0.5, CUP.radius + CUP.tube * 0.5, CUP.skirt, 48, 1, true).translate(0, CUP.lift - CUP.skirt / 2, 0), brass],
        [new T.CircleGeometry(CUP.inside, 48).rotateX(-Math.PI / 2).translate(0, CUP.lift - 0.0018, 0), hollow]];
      for (const [geometry, material] of parts) { const mesh = new T.InstancedMesh(geometry, material, Math.max(1, places.length)), at = new T.Matrix4(); mesh.count = places.length;
        places.forEach((p, i) => mesh.setMatrixAt(i, at.makeTranslation(p[0], p[1], p[2]))); mesh.instanceMatrix.needsUpdate = true; cups.add(mesh); }
    },
    set(next: {cups: boolean}) { cups.visible = next.cups; },
  };
}
