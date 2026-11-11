// Things in and on the players' rail that are not the rail itself: a line of light along the felt edge with its glow on the
// felt, and cup holders set into the leather. Both are off until the scene is asked for them (state railLight and cups), so
// the scene opens as it was. Sizes are dealer metres, as in the table.
import * as T from 'three';
import {RAIL, TABLE, roomReflection, section, sweep} from './scene3d-table.ts';

export type RailLight = 'off' | 'steady' | 'breathe' | 'chase';
// The line's colours as shown (sRGB, 0-1).
export const RAIL_COLOURS: Record<string, [number, number, number]> = {gold: [1, 0.72, 0.34], white: [1, 0.94, 0.84], cyan: [0.28, 0.88, 1], magenta: [1, 0.3, 0.72]};
// steady: how bright the line is when it stands still. breath: a slow swell between two levels, one breath every `seconds`.
// chase: a soft bright stretch, `width` of the rail's length wide, that runs the rail once every `seconds` over a low line.
export const RAIL_MOVES = {steady: 0.85, breath: {low: 0.5, high: 0.95, seconds: 5}, chase: {low: 0.3, seconds: 8, width: 0.07}};

/** How bright the line is (0-1) at `along` metres of a rail `length` metres long, `seconds` into its movement. The shader below computes the same. */
export function railLevel(mode: RailLight, along: number, length: number, seconds: number): number {
  const {steady, breath, chase} = RAIL_MOVES;
  if (mode === 'off') return 0;
  if (mode === 'steady') return steady;
  if (mode === 'breathe') return breath.low + (breath.high - breath.low) * (0.5 - 0.5 * Math.cos(seconds * 2 * Math.PI / breath.seconds));
  const at = ((along / length - seconds / chase.seconds) % 1 + 1) % 1, away = Math.min(at, 1 - at);
  return chase.low + (1 - chase.low) * Math.exp(-((away / chase.width) ** 2));
}
const LEVEL_GLSL = `uniform float mode, time, len;
float level(float along){
  if (mode < .5) return 0.; if (mode < 1.5) return ${RAIL_MOVES.steady.toFixed(3)};
  if (mode < 2.5) return ${RAIL_MOVES.breath.low.toFixed(3)} + ${(RAIL_MOVES.breath.high - RAIL_MOVES.breath.low).toFixed(3)} * (.5 - .5 * cos(time * 6.2831853 / ${RAIL_MOVES.breath.seconds.toFixed(1)}));
  float at = fract(along / len - time / ${RAIL_MOVES.chase.seconds.toFixed(1)}), away = min(at, 1. - at), q = away / ${RAIL_MOVES.chase.width.toFixed(3)};
  return ${RAIL_MOVES.chase.low.toFixed(3)} + ${(1 - RAIL_MOVES.chase.low).toFixed(3)} * exp(-q * q);
}`;

/**
 * Where cup holders sit along the rail: the angle on the players' arc (0 at the +x end, π at the -x end) of one between
 * each pair of neighbouring seats and one outside each end seat, as far out as the seats are apart. `seats` are the bet rings
 * (dealer metres: x across, s from the dealer-side edge). One that would land on the rail's rounded ends is left out.
 */
export function cupAngles(seats: {x: number; s: number}[]): number[] {
  const at = seats.map(p => Math.atan2(p.s / TABLE.b, p.x / TABLE.a)).sort((p, q) => p - q); if (at.length < 2) return [];
  const step = (at[at.length - 1] - at[0]) / (at.length - 1), out = [at[0] - step / 2];
  for (let i = 0; i < at.length - 1; i++) out.push((at[i] + at[i + 1]) / 2);
  out.push(at[at.length - 1] + step / 2);
  return out.filter(t => t > 0.12 && t < Math.PI - 0.12);
}
/** The middle of the leather roll's top at arc angle t: [x, y, z] in the table's own metres (z from the dealer-side edge toward the players). */
export function railTop(t: number): number[] {
  const {a, b} = TABLE, l = Math.hypot(b * Math.cos(t), a * Math.sin(t));
  return [a * Math.cos(t) + RAIL.centre * b * Math.cos(t) / l, RAIL.top, b * Math.sin(t) + RAIL.centre * a * Math.sin(t) / l];
}

// The line itself: a narrow ribbon on the inner shoulder of the brass bead, half a millimetre proud of it.
const LINE = section([[-0.0014, 0.0038], [0.0006, 0.0054], [0.0034, 0.0061]], () => 1);
const GLOW = 0.075; // how far the light reaches in over the felt
// A cup holder: a brass ring `lift` above the roll's crown (the roll falls away to both sides, so a ring lying on the crown would
// be sunk in leather along the rail and float across it), a skirt from the ring down into the leather, and the dark inside.
const CUP = {radius: 0.031, tube: 0.0026, lift: 0.003, skirt: 0.014, inside: 0.0296};

export function createRailExtras(lit: <M extends T.Material>(material: M) => M = m => m) {
  const group = new T.Group(), uniforms = {mode: {value: 0}, time: {value: 0}, len: {value: 1}, colour: {value: new T.Vector3(...RAIL_COLOURS.gold)}};
  const vertex = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
  // Both write the colour as it is shown, like the film does: the table and the film are drawn after the room's tone curve.
  const line = new T.ShaderMaterial({uniforms, vertexShader: vertex, side: T.DoubleSide, fragmentShader: `varying vec2 vUv; uniform vec3 colour;\n${LEVEL_GLSL}
    void main(){ float l = level(vUv.x); gl_FragColor = vec4(min(colour * (.25 + .95 * l) + pow(l, 4.) * .3, 1.), 1.); }`});
  // The light on the felt is added to what lies there and fades inward; the picture's alpha is left alone.
  const glow = new T.ShaderMaterial({uniforms, vertexShader: vertex, transparent: true, depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
    fragmentShader: `varying vec2 vUv; uniform vec3 colour;\n${LEVEL_GLSL}
    void main(){ float reach = 1. - vUv.y; gl_FragColor = vec4(colour * level(vUv.x) * (.34 * pow(reach, 3.) + .1 * reach * reach), 1.); }`});
  const room = roomReflection();
  const brass = lit(new T.MeshStandardMaterial({color: 0xb08a45, roughness: 0.3, metalness: 1, envMap: room, envMapIntensity: 1.6}));
  // The inside of a cup, seen from above: dark, a little lighter toward the wall, with a thin gleam along one side of it.
  const hollow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, fill = g.createRadialGradient(64, 70, 6, 64, 64, 64);
    fill.addColorStop(0, '#040302'); fill.addColorStop(0.7, '#0b0806'); fill.addColorStop(0.93, '#2a1f12'); fill.addColorStop(1, '#4a3820'); g.fillStyle = fill; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,214,150,.35)'; g.lineWidth = 2.5; g.beginPath(); g.arc(64, 64, 58, 3.5, 4.9); g.stroke();
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return lit(new T.MeshBasicMaterial({map: t})); })();
  const lineMesh = new T.Mesh(new T.BufferGeometry(), line), glowMesh = new T.Mesh(new T.BufferGeometry(), glow); glowMesh.renderOrder = 1;
  const cups = new T.Group(); group.add(lineMesh, glowMesh, cups);
  let wanted = {light: 'off' as RailLight, cups: false};
  const show = () => { lineMesh.visible = glowMesh.visible = wanted.light !== 'off'; cups.visible = wanted.cups; };

  return {
    group,
    /** Built with the table: the same place and scale, and the seats' bet rings for where the cups go. */
    build(edgeZ: number, scale: number, seats: {x: number; s: number}[]) {
      group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
      lineMesh.geometry.dispose(); lineMesh.geometry = sweep(LINE, 128, 1, null);
      // the felt's edge and a line GLOW inside it; u is metres along the arc, v runs from the edge inward
      const {a, b} = TABLE, N = 128, position: number[] = [], uv: number[] = [], index: number[] = []; let along = 0;
      for (let i = 0; i <= N; i++) { const t = Math.PI * i / N, l = Math.hypot(b * Math.cos(t), a * Math.sin(t)), nx = b * Math.cos(t) / l, nz = a * Math.sin(t) / l;
        if (i) { const t0 = Math.PI * (i - 1) / N; along += Math.hypot(a * (Math.cos(t) - Math.cos(t0)), b * (Math.sin(t) - Math.sin(t0))); }
        position.push(a * Math.cos(t), 0.0012, b * Math.sin(t), a * Math.cos(t) - GLOW * nx, 0.0012, Math.max(0, b * Math.sin(t) - GLOW * nz)); uv.push(along, 0, along, 1);
        if (i) { const q = 2 * (i - 1); index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } }
      const felt = new T.BufferGeometry(); felt.setAttribute('position', new T.Float32BufferAttribute(position, 3)); felt.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); felt.setIndex(index);
      glowMesh.geometry.dispose(); glowMesh.geometry = felt; uniforms.len.value = along;
      // cup holders: a ring, its skirt and the dark inside, each drawn once for all cups
      for (const child of [...cups.children]) { cups.remove(child); (child as T.InstancedMesh).geometry.dispose(); }
      const places = cupAngles(seats).map(railTop), parts: [T.BufferGeometry, T.Material][] = [
        [new T.TorusGeometry(CUP.radius, CUP.tube, 10, 48).rotateX(Math.PI / 2).translate(0, CUP.lift, 0), brass],
        [new T.CylinderGeometry(CUP.radius + CUP.tube * 0.5, CUP.radius + CUP.tube * 0.5, CUP.skirt, 48, 1, true).translate(0, CUP.lift - CUP.skirt / 2, 0), brass],
        [new T.CircleGeometry(CUP.inside, 48).rotateX(-Math.PI / 2).translate(0, CUP.lift - 0.0018, 0), hollow]];
      for (const [geometry, material] of parts) { const mesh = new T.InstancedMesh(geometry, material, Math.max(1, places.length)), at = new T.Matrix4(); mesh.count = places.length;
        places.forEach((p, i) => mesh.setMatrixAt(i, at.makeTranslation(p[0], p[1], p[2]))); mesh.instanceMatrix.needsUpdate = true; cups.add(mesh); }
      show();
    },
    set(next: {light: RailLight; colour: string; cups: boolean}) {
      wanted = {light: next.light, cups: next.cups}; uniforms.mode.value = ['off', 'steady', 'breathe', 'chase'].indexOf(next.light); uniforms.colour.value.set(...(RAIL_COLOURS[next.colour] ?? RAIL_COLOURS.gold)); show();
    },
    update(seconds: number) { uniforms.time.value = seconds; },
  };
}
