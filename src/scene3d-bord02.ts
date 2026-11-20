// Table BORD-02 as a second table model of the 3D scene (state key tableModel; a lab trial of 2026-11-20, off from the start).
// Jakob 2026-11-20: "kunna i höger panel ändra till detta bord", and its materials as choices in this project. It is the
// kidney-shaped blackjack table of his project Ultimate Reality (Git revision 9dba0e7f8c490829036af957058e27efba3b1add), as he
// delivered it that day (where the delivery lies: data/scene-materials.json, "bord02"). It is built here from that table's own
// source (in the delivery: Källor/test/bord/filtdjup-v1/bord.mjs for the form, polyhaven-material-v1/material.mjs and
// studio/lib/table-finishes.ts for the surfaces), not read from its 48 MB model file: the same outline, layers, roll, stitches
// and legs, in this scene's coordinates, and its seven photographed materials (Poly Haven, CC0) as three choices: the cloth, the
// wood and the rail.
//
// What follows this scene and not the source:
// - The middle of the dealer's notch is the dealer's edge (s = 0), where the film's body ends; the table's wings reach behind it
//   on both sides of her, as the film is empty there.
// - The print on the cloth is the scene's own (card places, rings and text where the films deal), not BORD-02's seven boxes: the
//   table's felt image is drawn bare (scene3d-table.ts FeltPrint.bare) and laid over the cloth here, as a canvas lays ink on a ground.
// - The cloth is lit as the key surface says: on the painted table and on "duk" it keeps its own colour in an even light that
//   follows the room's level (as the standard table's cloth does there; Jakob 2026-11-13, a lit cloth loses its green in a dim warm
//   room), on the photographed surfaces it is lit by the room. The roll, the wood and the metal are always lit: by the room that is
//   showing with those surfaces, else by the room painted for the table.
// - The legs reach this scene's floor (BASE.floor), which lies lower under the felt than the source's 75 cm.
// The module is fetched the first time the key asks for it (src/scene3d-view.ts), so the scene as it was never reads it.
import * as T from 'three';
import {BASE, NATURES, PRINT, REAL_TABLE, TABLE, sized, type RailLink, type TableSize, type TableSurface} from './scene3d-table.ts';

// The table's own measures, metres (192 x 129.6 cm over all). s is the source's z + 0.28. radius: half the width; shoulder: where
// the players' arc begins at the table's two ends; front: the players' edge at the middle; rear: the back edge of the wings.
// rail: the padded roll inside the outline along the players' arc (its width, the height of its middle over the felt, half its
// height, how far in and how high its row of stitches lies, half the length of its rounded ends). bands: the heights of the
// table's side under the felt (wood, a brass line in it, and the green underlay next to the felt). leg: the two round legs.
export const BORD02 = {
  radius: 0.96, shoulder: 0.07, front: 1.056, rear: -0.24,
  rail: {width: 0.062, lift: 0.009, round: 0.024, seam: 0.052, seamY: 0.0275, cap: 0.017},
  bands: {bottom: -0.085, brass: [-0.08, -0.0768], underlay: -0.008},
  leg: {x: 0.48, s: 0.29, top: 0.101, foot: 0.087, plinth: 0.092, plinthHigh: 0.015},
} as const;
const ARC = 180, PROFILE = 24;

/**
 * How many times its own width and depth the table is at a size (the key tableSize, as the standard table reads it): under the
 * table's lens, where the world is real metres, the size itself, so that 1 is BORD-02 as it was measured; under the contract's
 * camera as much shallower as the standard table is there.
 */
export function bord02Scale(size: TableSize = 1): {x: number; s: number} { const {a, b} = sized(size); return {x: a / TABLE.a, s: b / REAL_TABLE.depth}; }

const cubic = (p: number[][], steps: number): number[][] => Array.from({length: steps}, (_, i) => { const t = (i + 1) / steps, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map(axis => p.reduce((sum, q, j) => sum + w[j] * q[axis], 0)); });
/**
 * The table's outline as points [x, s], once round against the clock seen from above with s upward: first the players' arc from
 * the table's right end over the front to its left end (points 0 to `arc`), then the dealer's side back to the right: the left
 * wing's rounded corner, the notch she stands in, the right wing. `notch`: a rectangle cut in from the dealer's side for something
 * sunk into the table there (the chip tray; x0, x1 across, s1 toward the players, scene metres), through the whole table.
 */
export function bord02Outline(scale = {x: 1, s: 1}, notch?: {x0: number; x1: number; s1: number}): {points: number[][]; arc: number} {
  const {radius: R, shoulder, front, rear} = BORD02, at = ([x, s]: number[]) => [x * scale.x, s * scale.s];
  const arc = Array.from({length: ARC + 1}, (_, i) => { const t = Math.PI * i / ARC; return at([R * Math.cos(t), i === ARC ? shoulder : shoulder + (front - shoulder) * Math.sin(t)]); });
  let side = [[[-R, shoulder], [-R, rear], [-0.66, rear], [-0.5, rear]], [[-0.5, rear], [-0.31, rear], [-0.25, 0], [0, 0]], [[0, 0], [0.25, 0], [0.31, rear], [0.5, rear]], [[0.5, rear], [0.66, rear], [R, rear], [R, shoulder]]]
    .flatMap(curve => cubic(curve.map(at), 24));
  side.pop(); // the last point is the arc's first
  if (notch && notch.x1 > notch.x0) {
    const whole = [arc[ARC], ...side, arc[0]];
    const sAt = (x: number) => { for (let i = 1; i < whole.length; i++) { const [xa, sa] = whole[i - 1], [xb, sb] = whole[i]; if (x >= xa && x <= xb) return xb > xa ? sa + (sb - sa) * (x - xa) / (xb - xa) : sa; } return 0; };
    side = [...side.filter(p => p[0] < notch.x0 - 1e-6), [notch.x0, sAt(notch.x0)], [notch.x0, notch.s1], [notch.x1, notch.s1], [notch.x1, sAt(notch.x1)], ...side.filter(p => p[0] > notch.x1 + 1e-6)];
  }
  return {points: [...arc, ...side], arc: ARC};
}

// The photographed materials: each scan's tile in metres (the source's own figures), its mean colour (what a surface wears until
// its maps are read, and where they cannot be), and whether it is laid a quarter turn round. The maps are local media under
// assets/scene/materials/ as <scan>-diffuse, -nor_gl and -rough .webp.
type Scan = {metres: readonly [number, number]; mean: readonly [number, number, number]; turn?: true};
export const BORD02_SCANS = {
  scuba_suede: {metres: [0.28522, 0.2789], mean: [18, 95, 108]},
  brown_leather: {metres: [0.4, 0.4], mean: [81, 45, 16]},
  walnut_veneer: {metres: [1.8, 1.8], mean: [138, 106, 81]},
  grass_ground: {metres: [2.51, 2.51], mean: [110, 96, 62]},
  coated_pine: {metres: [0.74, 0.74], mean: [104, 57, 7], turn: true},
  leather_red_02: {metres: [0.6, 0.6], mean: [79, 44, 26]},
  denim_fabric: {metres: [0.1, 0.1], mean: [78, 113, 142]},
} as const satisfies Record<string, Scan>;
type ScanId = keyof typeof BORD02_SCANS;
// The choices per surface (state keys modelCloth, modelWood, modelRail), the first of each BORD-02 as it was delivered. rough,
// normal, tint: the source's recipe for that surface. light: how much of the room's light it takes (as `lights` in scene3d-table.ts).
type Surface = {scan: ScanId; rough: number; normal: number; tint: number; light: number; name: string};
export const BORD02_FINISHES = {
  cloth: {filt: {scan: 'scuba_suede', rough: 1, normal: 0.48, tint: 0xffffff, light: 0.6, name: 'Grön mikromocka'}, gras: {scan: 'grass_ground', rough: 1, normal: 1, tint: 0xffffff, light: 0.6, name: 'Gräsmatta'}},
  wood: {valnot: {scan: 'walnut_veneer', rough: 0.82, normal: 0.46, tint: 0xf5e7d8, light: 1.1, name: 'Valnötsfaner'}, furu: {scan: 'coated_pine', rough: 1, normal: 1, tint: 0xffffff, light: 1.1, name: 'Lackerad furu'}},
  rail: {brun: {scan: 'brown_leather', rough: 0.85, normal: 0.7, tint: 0xffffff, light: 1.4, name: 'Brunt läder'}, rodbrun: {scan: 'leather_red_02', rough: 1, normal: 1, tint: 0xffffff, light: 1.4, name: 'Rödbrunt läder'},
    denim: {scan: 'denim_fabric', rough: 1, normal: 1, tint: 0xffffff, light: 1, name: 'Blå denim'}},
} as const satisfies Record<string, Record<string, Surface>>;
export type Bord02Cloth = keyof typeof BORD02_FINISHES.cloth;
export type Bord02Wood = keyof typeof BORD02_FINISHES.wood;
export type Bord02Rail = keyof typeof BORD02_FINISHES.rail;
export type Bord02Look = {cloth: Bord02Cloth; wood: Bord02Wood; rail: Bord02Rail; surface: TableSurface};
// The green of the cloth (the source's #215343): the suede's scan gives only its light and dark, divided by the scan's mean
// luminance and held within the source's bounds, so the cloth keeps this colour.
export const BORD02_CLOTH = {colour: 0x215343, mean: 0.093504, lo: 0.58, hi: 1.72};
// A lit surface's colour is raised as the standard table's lit cloth is (scene3d-table.ts, 2.1): under the scene's lights it then
// comes out about as bright as it is photographed.
const LEVEL = 2.1, MAPS = 'assets/scene/materials/';
/** Whether the cloth is lit by the room with a surface, or keeps its own even light (the painted table and a surface "duk"). */
export const bord02ClothLit = (surface: TableSurface): boolean => surface !== 'painted' && !(NATURES as Record<string, {duk?: boolean}>)[surface]?.duk;

// The scene's print over the cloth. The felt image holds only ink on a clear sheet (FeltPrint.bare) and is read as the canvas
// holds it (colour times cover, as painted); the cloth under it is brought to the same encoding, the ink laid over it as a canvas
// lays it over a ground, and the sum brought back: the print then looks as on the standard table, also where it is drawn small.
const CLOTH_GLSL = `uniform sampler2D b02Ink; uniform vec3 b02Colour; uniform float b02Mean, b02Level; varying vec2 vB02Print;
vec3 b02Encode(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.)), vec3(1. / 2.4)) - .055, step(vec3(.0031308), c)); }
vec3 b02Decode(vec3 c) { return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(vec3(.04045), c)); }
`;
const CLOTH_INK = `#include <map_fragment>
  { vec3 b02Ground = diffuseColor.rgb;
    if (b02Mean > 0.) b02Ground = b02Colour * clamp(dot(b02Ground, vec3(.2126, .7152, .0722)) / b02Mean, ${BORD02_CLOTH.lo}, ${BORD02_CLOTH.hi});
    vec4 b02Lay = texture2D(b02Ink, vB02Print);
    diffuseColor.rgb = b02Decode(b02Encode(clamp(b02Ground, 0., 1.)) * (1. - b02Lay.a) + b02Lay.rgb) * b02Level; }`;

/** Turns every triangle that faces against its corners' normals, so that a surface built by hand always shows its outside. */
function outward(geometry: T.BufferGeometry): T.BufferGeometry {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), index = geometry.getIndex()!, a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), mean = new T.Vector3(), other = new T.Vector3();
  for (let i = 0; i < index.count; i += 3) { const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib).sub(a); c.fromBufferAttribute(p, ic).sub(a);
    mean.fromBufferAttribute(n, ia).add(other.fromBufferAttribute(n, ib)).add(other.fromBufferAttribute(n, ic));
    if (b.cross(c).dot(mean) < 0) { index.setX(i + 1, ic); index.setX(i + 2, ib); } }
  return geometry;
}
const made = (attributes: Record<string, [number[], number]>, index: number[]): T.BufferGeometry => { const g = new T.BufferGeometry();
  for (const [name, [values, size]] of Object.entries(attributes)) g.setAttribute(name, new T.Float32BufferAttribute(values, size)); g.setIndex(index); return g; };

/** The cloth: the outline as one flat sheet at the felt's height. uv: metres, for the scans; printUv: where the scene's felt image lies. */
export function bord02Felt(points: number[][]): T.BufferGeometry {
  const faces = T.ShapeUtils.triangulateShape(points.map(([x, s]) => new T.Vector2(x, s)), []);
  return outward(made({position: [points.flatMap(([x, s]) => [x, 0, s]), 3], normal: [points.flatMap(() => [0, 1, 0]), 3], uv: [points.flatMap(([x, s]) => [x, s]), 2],
    printUv: [points.flatMap(([x, s]) => [(x + PRINT.width / 2) / PRINT.width, 1 - (s + PRINT.back) / PRINT.depth]), 2]}, faces.flat()));
}
/**
 * A band of the table's side: the outline between two heights, facing out. The wood's grain runs along the outline (v: metres
 * along it; u: the height, as the source lays its veneer). A corner sharper than a curve's (the cut for the tray) keeps its edge.
 */
export function bord02Wall(points: number[][], y0: number, y1: number): T.BufferGeometry {
  const n = points.length, edges = points.map(([x, s], i) => { const [x1, s1] = points[(i + 1) % n], l = Math.hypot(x1 - x, s1 - s) || 1; return [(s1 - s) / l, -(x1 - x) / l, l]; });
  const normalAt = (point: number, edge: number) => { const a = edges[(point - 1 + n) % n], b = edges[point % n]; if (a[0] * b[0] + a[1] * b[1] < 0.8) return edges[edge]; const l = Math.hypot(a[0] + b[0], a[1] + b[1]); return [(a[0] + b[0]) / l, (a[1] + b[1]) / l]; };
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = []; let along = 0;
  for (let i = 0; i < n; i++) { const p = points[i], q = points[(i + 1) % n], np = normalAt(i, i), nq = normalAt((i + 1) % n, i), base = position.length / 3, next = along + edges[i][2];
    for (const [at, normalOf, run, y] of [[p, np, along, y0], [q, nq, next, y0], [q, nq, next, y1], [p, np, along, y1]] as [number[], number[], number, number][]) { position.push(at[0], y, at[1]); normal.push(normalOf[0], 0, normalOf[1]); uv.push(0.34 + y, run); }
    index.push(base, base + 2, base + 1, base, base + 3, base + 2); along = next; }
  return outward(made({position: [position, 3], normal: [normal, 3], uv: [uv, 2]}, index));
}
// A point of the players' arc at a share t (0 to pi) of it, and the direction out of the table there.
function arcAt(scale: {x: number; s: number}, t: number) { const R = BORD02.radius * scale.x, D = (BORD02.front - BORD02.shoulder) * scale.s, l = Math.hypot(D * Math.cos(t), R * Math.sin(t)) || 1;
  return {x: R * Math.cos(t), s: BORD02.shoulder * scale.s + D * Math.sin(t), nx: D * Math.cos(t) / l, ns: R * Math.sin(t) / l}; }
/**
 * The padded roll along the players' arc: an oval in section, its outer side on the outline. uv in metres (u along the roll, v
 * round it), so that a hide keeps its size the whole way. `seam`: the row of stitches on its inner shoulder, as pairs of points.
 */
export function bord02Rail(scale = {x: 1, s: 1}): {roll: T.BufferGeometry; seam: number[]} {
  const {width, lift, round, seam: seamIn, seamY} = BORD02.rail, half = width / 2, position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [], seam: number[] = [];
  const around = [0]; for (let j = 1; j <= PROFILE; j++) { const a0 = (j - 1) * 2 * Math.PI / PROFILE, a1 = j * 2 * Math.PI / PROFILE; around.push(around[j - 1] + Math.hypot(half * (Math.cos(a1) - Math.cos(a0)), round * (Math.sin(a1) - Math.sin(a0)))); }
  let along = 0, last: number[] | null = null;
  for (let i = 0; i <= ARC; i++) { const {x, s, nx, ns} = arcAt(scale, Math.PI * i / ARC), centre = [x - nx * half, s - ns * half];
    if (last) along += Math.hypot(centre[0] - last[0], centre[1] - last[1]); last = centre;
    for (let j = 0; j <= PROFILE; j++) { const a = j * 2 * Math.PI / PROFILE, off = half * (Math.cos(a) - 1), out = Math.cos(a) / half, up = Math.sin(a) / round, l = Math.hypot(out, up);
      position.push(x + nx * off, lift + round * Math.sin(a), s + ns * off); normal.push(nx * out / l, up / l, ns * out / l); uv.push(along, around[j]);
      if (i < ARC && j < PROFILE) { const k = i * (PROFILE + 1) + j, next = k + PROFILE + 1; index.push(k, k + 1, next, k + 1, next + 1, next); } }
    if (i < ARC) for (const share of [0, 0.58]) { const at = arcAt(scale, Math.PI * (i + share) / ARC); seam.push(at.x - at.nx * seamIn, seamY, at.s - at.ns * seamIn); } }
  return {roll: outward(made({position: [position, 3], normal: [normal, 3], uv: [uv, 2]}, index)), seam};
}
// The roll's shadow on the cloth: a band inside the roll along the arc, darkest under it and gone a few centimetres in.
function railShadow(scale: {x: number; s: number}): T.BufferGeometry {
  const rings: [number, number][] = [[0.05, 0.62], [0.066, 0.4], [0.084, 0.16], [0.115, 0]], position: number[] = [], normal: number[] = [], color: number[] = [], index: number[] = [];
  for (let i = 0; i <= ARC; i++) { const {x, s, nx, ns} = arcAt(scale, Math.PI * i / ARC);
    rings.forEach(([inside, dark], j) => { position.push(x - nx * inside, 0.0006, s - ns * inside); normal.push(0, 1, 0); color.push(0.012, 0.008, 0.004, dark);
      if (i < ARC && j < rings.length - 1) { const k = i * rings.length + j, next = k + rings.length; index.push(k, k + 1, next, k + 1, next + 1, next); } }); }
  return outward(made({position: [position, 3], normal: [normal, 3], color: [color, 4]}, index));
}

/** What the model takes from the standard table (createTable): its felt image, the room's light for a material, and the level of a cloth in its own light. */
export type Bord02Link = {canvas: HTMLCanvasElement; follow: RailLink['follow']; level: () => number};
/**
 * The table in the scene. `own`: what every material of the table goes through (the fan's shade, the focus and the lamp over the
 * dealer; createTable's own). Materials and maps live as long as the table; build() only replaces geometry.
 */
export function createBord02(own: <M extends T.Material>(material: M) => M, link: Bord02Link) {
  const group = new T.Group(); group.visible = false;
  // the felt image as the canvas holds it: ink times its cover, in the canvas's own encoding (CLOTH_GLSL)
  const ink = new T.CanvasTexture(link.canvas); ink.premultiplyAlpha = true; ink.colorSpace = T.NoColorSpace; ink.anisotropy = 16;
  const flat = (mean: readonly number[]) => { const t = new T.DataTexture(new Uint8Array([...mean, 255]), 1, 1); t.colorSpace = T.SRGBColorSpace; t.needsUpdate = true; return t; };
  type Maps = {map: T.Texture; normalMap: T.Texture; roughnessMap: T.Texture};
  const loader = new T.TextureLoader(), asked = new Map<ScanId, Promise<Maps>>();
  const scans = (id: ScanId): Promise<Maps> => { let maps = asked.get(id);
    if (!maps) { const scan: Scan = BORD02_SCANS[id], read = (kind: string, colour: boolean) => loader.loadAsync(`${MAPS}${id}-${kind}.webp`).then(t => { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / scan.metres[0], 1 / scan.metres[1]); t.anisotropy = 8;
        if (scan.turn) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; } if (colour) t.colorSpace = T.SRGBColorSpace; return t; });
      maps = Promise.all([read('diffuse', true), read('nor_gl', false), read('rough', false)]).then(([map, normalMap, roughnessMap]) => ({map, normalMap, roughnessMap})); asked.set(id, maps); }
    return maps; };
  // A lit surface in a scan: its mean colour until the maps are read (and where they cannot be), then the photographed surface.
  const surfaces = new Map<string, T.MeshStandardMaterial>();
  const surface = (finish: Surface): T.MeshStandardMaterial => { let m = surfaces.get(finish.scan);
    if (!m) { const lit = m = own(new T.MeshStandardMaterial({map: flat(BORD02_SCANS[finish.scan].mean), color: finish.tint, roughness: finish.rough, metalness: 0})); lit.color.multiplyScalar(LEVEL); link.follow(lit, finish.light); surfaces.set(finish.scan, lit);
      scans(finish.scan).then(maps => { lit.map?.dispose(); Object.assign(lit, maps); lit.normalScale.setScalar(finish.normal); lit.needsUpdate = true; }, () => {}); }
    return m; };
  // The cloth, lit by the room or in its own light, with the scene's print over it (CLOTH_GLSL).
  type Cloth = {material: T.Material; level: {value: number}; lit: boolean};
  const cloths = new Map<string, Cloth>();
  const cloth = (id: Bord02Cloth, lit: boolean): Cloth => { const key = `${id}:${lit}`; let c = cloths.get(key);
    if (!c) { const finish: Surface = BORD02_FINISHES.cloth[id], mean = BORD02_SCANS[finish.scan].mean, level = {value: lit ? LEVEL : 1}, suede = id === 'filt';
      const material = own(lit ? new T.MeshStandardMaterial({map: flat(mean), roughness: finish.rough, metalness: 0}) : new T.MeshBasicMaterial({map: flat(mean)}));
      const uniforms = {b02Ink: {value: ink}, b02Colour: {value: new T.Color(suede ? BORD02_CLOTH.colour : 0xffffff)}, b02Mean: {value: suede ? BORD02_CLOTH.mean : 0}, b02Level: level};
      const before = material.onBeforeCompile, programKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader: T.WebGLProgramParametersWithUniforms, renderer: T.WebGLRenderer) => { before.call(material, shader, renderer); Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'attribute vec2 printUv; varying vec2 vB02Print;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vB02Print = printUv;');
        shader.fragmentShader = CLOTH_GLSL + shader.fragmentShader.replace('#include <map_fragment>', CLOTH_INK); };
      material.customProgramCacheKey = () => `${programKey()}+bord02-cloth`;
      if (lit) link.follow(material as T.MeshStandardMaterial, finish.light);
      scans(finish.scan).then(maps => { (material as T.MeshBasicMaterial).map?.dispose(); if (lit) { Object.assign(material, maps); (material as T.MeshStandardMaterial).normalScale.setScalar(finish.normal); } else (material as T.MeshBasicMaterial).map = maps.map; material.needsUpdate = true; }, () => {});
      c = {material, level, lit}; cloths.set(key, c); }
    return c; };
  const paint = (color: number, roughness: number, metalness: number, light: number) => { const m = own(new T.MeshStandardMaterial({color, roughness, metalness})); m.color.multiplyScalar(LEVEL); link.follow(m, light); return m; };
  const brass = paint(0xc5a56a, 0.35, 0.7, 1.5), underlay = paint(0x26342a, 0.48, 0, 0.6), stitch = own(new T.LineBasicMaterial({color: 0x8e7562}));
  const shade = own(new T.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2}));
  const onFloor = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, fade = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    fade.addColorStop(0, 'rgba(0,0,0,.6)'); fade.addColorStop(0.55, 'rgba(0,0,0,.32)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fade; g.fillRect(0, 0, 128, 128);
    return new T.MeshBasicMaterial({map: new T.CanvasTexture(c), transparent: true, depthWrite: false}); })();
  let worn: Cloth | null = null;

  /** `size`: the table's size (bord02Scale); `look`: the three surfaces and the key surface; `notch`: the cut for something sunk in at the dealer's edge. */
  function build(edgeZ: number, scale: number, size: TableSize, look: Bord02Look, notch?: {x0: number; x1: number; s1: number}) {
    for (const child of [...group.children]) { group.remove(child); child.traverse(o => (o as T.Mesh).geometry?.dispose()); }
    group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
    const k = bord02Scale(size), {points} = bord02Outline(k, notch), {bands, rail, leg} = BORD02, add = <O extends T.Object3D>(o: O) => { group.add(o); return o; };
    const wood = surface(BORD02_FINISHES.wood[look.wood] ?? BORD02_FINISHES.wood.valnot), walnut = surface(BORD02_FINISHES.wood.valnot), hide = surface(BORD02_FINISHES.rail[look.rail] ?? BORD02_FINISHES.rail.brun);
    const top = worn = cloth(look.cloth in BORD02_FINISHES.cloth ? look.cloth : 'filt', bord02ClothLit(look.surface));
    // a cloth in its own light follows the level of the room that is showing, as the standard table's does
    add(new T.Mesh(bord02Felt(points), top.material)).onBeforeRender = () => { if (worn && !worn.lit) worn.level.value = link.level(); };
    add(new T.Mesh(bord02Wall(points, bands.bottom, bands.brass[0]), wood)); add(new T.Mesh(bord02Wall(points, bands.brass[0], bands.brass[1]), brass));
    add(new T.Mesh(bord02Wall(points, bands.brass[1], bands.underlay), wood)); add(new T.Mesh(bord02Wall(points, bands.underlay, 0), underlay));
    const {roll, seam} = bord02Rail(k); add(new T.Mesh(roll, hide));
    add(new T.LineSegments(made({position: [seam, 3]}, Array.from({length: seam.length / 3}, (_, i) => i)), stitch));
    for (const side of [-1, 1]) { // the roll's rounded ends at the table's two ends
      const cap = new T.SphereGeometry(1, 32, 16), uv = cap.getAttribute('uv') as T.BufferAttribute, round = 2 * Math.PI * Math.sqrt(rail.width / 2 * rail.cap);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * round, uv.getY(i) * Math.PI * rail.round);
      add(new T.Mesh(cap.scale(rail.width / 2, rail.round, rail.cap).translate(side * (BORD02.radius * k.x - rail.width / 2), rail.lift, BORD02.shoulder * k.s), hide)); }
    add(new T.Mesh(railShadow(k), shade));
    // the two legs, in the walnut whatever the side wears, down to this scene's floor, each on a brass foot; and the shadows on the floor
    const floor = BASE.floor, under = bands.bottom - 0.001, high = under - floor - leg.plinthHigh, at = (o: T.Object3D, x: number, y: number, s: number) => { o.position.set(x, y, s); return add(o); };
    for (const side of [-1, 1]) { const x = side * leg.x * k.x, s = leg.s * k.s, post = new T.CylinderGeometry(leg.top, leg.foot, high, 48), uv = post.getAttribute('uv') as T.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * (leg.top + leg.foot) / 2, uv.getY(i) * high); // metres round the leg and up it: the grain runs up
      at(new T.Mesh(post, walnut), x, floor + leg.plinthHigh + high / 2, s); at(new T.Mesh(new T.CylinderGeometry(leg.plinth, leg.plinth, leg.plinthHigh, 48), brass), x, floor + leg.plinthHigh / 2, s);
      at(new T.Mesh(new T.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), onFloor), x, floor + 0.002, s).renderOrder = -1; }
    at(new T.Mesh(new T.PlaneGeometry(2.9 * k.x, 2.2 * k.s).rotateX(-Math.PI / 2), onFloor), 0, floor + 0.001, 0.4 * k.s).renderOrder = -2;
  }
  return {group, build,
    /** The felt image has been drawn again. */
    printed() { ink.needsUpdate = true; },
    /** Frees everything the table holds: its geometry, every surface it has worn with its maps (those still being read too), and its reading of the felt image. */
    dispose() {
      for (const m of [...surfaces.values(), ...[...cloths.values()].map(c => c.material), brass, underlay, stitch, shade, onFloor]) { for (const value of Object.values(m)) if (value instanceof T.Texture) value.dispose(); m.dispose(); }
      for (const maps of asked.values()) maps.then(read => Object.values(read).forEach(t => t.dispose()), () => {});
      ink.dispose(); group.traverse(o => (o as T.Mesh).geometry?.dispose());
    }};
}
