// The table of the 3D scene. Felt, lines, card places and logo are one flat image seen from straight above,
// so a new logo or felt colour is a texture change. Sizes are dealer metres; the group is scaled by the
// contract's k into the plan-scale world. The table's outline and the layout of the print are provisional:
// they were chosen to fit the film frame, not taken from a real table.
// The players' rail is a padded leather roll with a stitched seam on each shoulder, a brass bead against the felt and a
// lacquered walnut apron under its overhang. Its sheen comes from a small painted room that only the rail's own materials
// reflect (an environment map of their own), so the scene's lights, the film and everything in the home view stay as they were.
import * as T from 'three';
import {BET, spotToScene, tableToFilm, type FilmCamera, type Spot} from './scene3d-geometry.ts';

export const FELTS: Record<string, [string, string]> = {green: ['#134232', '#0a2a20'], blue: ['#16325e', '#0b1c38'], vin: ['#571a26', '#330d15'], svart: ['#23272a', '#101214']};
export const TABLE = {a: 0.95, b: 0.6, rail: 0.1}; // half width, depth toward the players, rail width
// The table's size (state key tableSize): how many times TABLE's half width and depth the felt is. The dealer's edge stays where the
// film has it (the felt grows sideways and toward the players), the rail keeps its own width, and the print stays where the film
// deals: a larger table has more plain felt round it. Below 1 the outer bet rings reach the rail; above 1.4 the felt image ends.
export const TABLE_SIZE = {min: 0.9, max: 1.4};
/** The felt's half width and depth at a size (held within TABLE_SIZE; anything that is no number is 1). */
export function sized(size = 1): {a: number; b: number} { const k = Number.isFinite(size) ? Math.min(TABLE_SIZE.max, Math.max(TABLE_SIZE.min, size)) : 1; return {a: TABLE.a * k, b: TABLE.b * k}; }
// What the table stands on. column: the first base, one thick leg on a brass foot; it was never meant to be seen, and from a
// camera that has backed away it is ugly (Jakob, 2026-11-11). legs: two tapered legs of photographed wood on brass plinths with
// a stretcher between them, a brass foot rail on the players' side, a board that closes the underside, and the table's shadow
// on the floor; the recipe of the room study of 2026-11-07 (photographed materials, real legs, contact with the ground).
export type TableBase = 'column' | 'legs';
// How the table's surfaces are made. painted: the felt is the flat print, unlit, and the table reflects a room painted for it;
// that is the table as it was. photo: the room study's "photographed material on 3D": the felt is a lit cloth with a
// photographed weave for its relief, and every surface of the table takes its light and its reflections from the room that
// is showing (the panorama itself), so that the table stands in that room's light and not in a light of its own.
// natur, natur-2 ...: the photographed surface with two things more (a lab trial of 2026-11-13, NATURES below): the rail's leather
// is a picture of a real hide, with the seams and stitches still drawn on it, and the felt has the soft sheen of a napped cloth
// at low angles. Each is one line of NATURES: which hide, and how the leather is finished.
export type TableSurface = 'painted' | 'photo' | Nature;
// What the felt's own colour and weave are. print: the colour of FELTS with a painted pool of light and a fine noise, as it was.
// v6: V6's cloth (V6_CLOTH below), its colour and grain, evenly lit; the light across it is then the lamp's (LAMP).
// runway, runway-2 ...: the felt of a generated photograph of this table (RUNWAY_CLOTHS below), its colour and its nap, evenly
// lit like V6's. Each is one line of RUNWAY_CLOTHS.
export type TableCloth = 'print' | 'v6' | RunwayCloth;
// The kinds of print on the felt, each its own switch. The state key holds them as one word: "all", "none" or a comma list.
// trim: the dark list along the dealer's edge and its gold line; arc: the gold arc in front of the card places; text: BLACKJACK
// PAYS 3 TO 2; logo: the logo text and its two lines; boxes: the card places; rings: the bet rings; numbers: the seat numbers in them.
export const FELT_MARKS = ['trim', 'arc', 'text', 'logo', 'boxes', 'rings', 'numbers'] as const;
export type FeltMark = typeof FELT_MARKS[number];
export function feltMarks(text: string | null | undefined): Set<FeltMark> {
  const words = (text ?? 'all').trim().toLowerCase(); if (words === 'all') return new Set(FELT_MARKS);
  return new Set(words.split(/[\s,+]+/).filter((w): w is FeltMark => (FELT_MARKS as readonly string[]).includes(w)));
}
/** The word the state keeps for a set of marks: "all", "none" or the marks in their order. */
export const marksText = (marks: Iterable<FeltMark>): string => { const on = new Set(marks); return FELT_MARKS.every(m => on.has(m)) ? 'all' : FELT_MARKS.filter(m => on.has(m)).join(',') || 'none'; };

// ---- V6's cloth as the felt -----------------------------------------------------------------------------------------------------
// assets/scene/table.png is V6's table: the felt in the film's perspective with the rail baked in and no print. It is no woven cloth:
// a generated grain about one film pixel across (0.4 to 0.6 mm on the felt) and a soft mottle, under V6's own light, and only the felt
// from about 24 to 42 cm in front of the dealer's edge is in its frame at all, squashed in depth 1.4 to 2.2 times. So its grain and
// colour are taken, not a weave: the band nearest the camera (s0 to s1, x within ±x, dealer metres) is laid back flat through the
// film camera, its light (anything larger than `flat`) is divided out, it is made to repeat without a seam (`fade`), and it is
// coloured to the mean of the whole visible felt (rows `rows` of the picture, columns `cols`).
export const V6_CLOTH = {url: 'assets/scene/table.png', x: 0.22, s0: 0.28, s1: 0.42, flat: 0.04, fade: 0.03, rows: [840, 1174], cols: [300, 1460]};
export type Picture = {data: Float32Array; width: number; height: number}; // rgb, 0 to 255, rows from the top
/**
 * A box of the felt seen from straight above (x from -box.x to box.x across, s from box.s0 at the top to box.s1, dealer metres)
 * read out of a picture in the film's frame through the film camera, at `pxPerM` pixels per metre, bilinearly. Source rgba.
 * `zoom`: how many pixels of the source one film pixel is, for a picture of the frame that is larger than the frame.
 */
export function rectify(source: {data: ArrayLike<number>; width: number; height: number}, camera: FilmCamera, box: {x: number; s0: number; s1: number}, pxPerM: number, zoom = 1): Picture {
  const width = Math.max(1, Math.round(2 * box.x * pxPerM)), height = Math.max(1, Math.round((box.s1 - box.s0) * pxPerM)), data = new Float32Array(width * height * 3), {width: W, height: H} = source;
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const [x, , z] = spotToScene(camera, -box.x + (i + 0.5) / pxPerM, box.s0 + (j + 0.5) / pxPerM), f = tableToFilm(camera, x, z);
    const fx = Math.min(W - 1.001, Math.max(0, f.x * zoom)), fy = Math.min(H - 1.001, Math.max(0, f.y * zoom)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    for (let k = 0; k < 3; k++) { const at = (xx: number, yy: number) => source.data[(yy * W + xx) * 4 + k];
      data[(j * width + i) * 3 + k] = (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - v) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * v; }
  }
  return {data, width, height};
}
// A box blur of `radius` pixels along one axis, the edge pixel repeated beyond the picture.
function boxBlur(p: Picture, radius: number, alongX: boolean): Picture {
  const {width, height} = p, out = new Float32Array(p.data.length), n = alongX ? width : height, lines = alongX ? height : width;
  for (let line = 0; line < lines; line++) for (let k = 0; k < 3; k++) {
    const at = (t: number) => { const c = Math.min(n - 1, Math.max(0, t)); return p.data[((alongX ? line * width + c : c * width + line) * 3) + k]; };
    let sum = 0; for (let t = -radius; t <= radius; t++) sum += at(t);
    for (let t = 0; t < n; t++) { out[(alongX ? line * width + t : t * width + line) * 3 + k] = sum / (2 * radius + 1); sum += at(t + radius + 1) - at(t - radius); }
  }
  return {data: out, width, height};
}
/** Divides out a picture's light larger than about `radius` pixels (a box blur twice each way) and sets each channel's mean to `mean`. */
export function flatten(p: Picture, radius: number, mean: number[]): Picture {
  let low = p; for (let r = 0; r < 2; r++) low = boxBlur(boxBlur(low, radius, true), radius, false);
  const data = new Float32Array(p.data.length);
  for (let i = 0; i < data.length; i++) data[i] = p.data[i] * mean[i % 3] / Math.max(1e-3, low.data[i]);
  return {data, width: p.width, height: p.height};
}
/**
 * Makes a picture repeat without a seam, `fade` pixels smaller each way: the last `fade` columns are blended into the first ones,
 * then the same for the rows. The blend keeps the grain's contrast (each pixel's departure from the mean is weighted by
 * w / sqrt(w1² + w2²)), so the fade does not show as a softer stripe.
 */
export function seamless(p: Picture, fade: number): Picture {
  const mean = [0, 1, 2].map(k => { let s = 0; for (let i = k; i < p.data.length; i += 3) s += p.data[i]; return s / (p.data.length / 3); });
  const blend = (a: number, b: number, t: number, k: number) => mean[k] + ((a - mean[k]) * (1 - t) + (b - mean[k]) * t) / Math.hypot(1 - t, t);
  const W = p.width - fade, across = new Float32Array(W * p.height * 3);
  for (let y = 0; y < p.height; y++) for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) {
    const own = p.data[(y * p.width + x) * 3 + k]; across[(y * W + x) * 3 + k] = x < fade ? blend(p.data[(y * p.width + W + x) * 3 + k], own, (x + 0.5) / fade, k) : own; }
  const H = p.height - fade, data = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) {
    const own = across[(y * W + x) * 3 + k]; data[(y * W + x) * 3 + k] = y < fade ? blend(across[((H + y) * W + x) * 3 + k], own, (y + 0.5) / fade, k) : own; }
  return {data, width: W, height: H};
}

// ---- the felt and the hide of a generated photograph ------------------------------------------------------------------------------
// A lab trial of 2026-11-13 (Jakob: the table as it is, "men göra det mer naturalistiskt"). The scene's home view with a plain felt
// was given to an image model, which made it a photograph of a wool felt and kept the camera. tools/scene-material.ts lays a band
// of that picture's felt flat through the film camera (`x`, `s0`, `s1` as for V6's cloth; the band starts in front of the shoe and
// the hands and is as wide as the frame is at its near end), divides out the light larger than `flat` metres (the lamp's pool, not
// the nap's soft clouds, which are smaller) and scatters pieces of it into a larger tile that repeats; the tile is stored at the
// print's own pixels per metre, so the page draws it as it is. Its colour is the picture's: lighter than the print's green and
// more saturated.
export const RUNWAY_CLOTH = {x: 0.35, s0: 0.19, s1: 0.4, flat: 0.12};
// The cloths made that way, by the word the state key `cloth` holds: the tile, and the name the lab's menu shows. A new cloth is
// a new picture, an entry for it under "generated" in data/scene-materials.json (which tools/scene-material.ts makes the tile
// from) and a line here; the menus of the studio (studio/lib/scene-keys.ts) and the game's key catalogue (src/game-look.ts)
// name the same words, and tools/scene3d-looks.test.ts holds them to this list.
const MATERIALS = 'assets/scene/materials/';
export const RUNWAY_CLOTHS = {
  'runway': {url: `${MATERIALS}runway_felt-diffuse.webp`, name: 'Runway-filten'},
  'runway-2': {url: `${MATERIALS}runway_felt_2-diffuse.webp`, name: 'Runway-filten 2: tät kamgarnsduk'},
  'runway-3': {url: `${MATERIALS}runway_felt_3-diffuse.webp`, name: 'Runway-filten 3: borstad boj'},
} as const;
export type RunwayCloth = keyof typeof RUNWAY_CLOTHS;
export const isRunwayCloth = (cloth: string | undefined): cloth is RunwayCloth => !!cloth && Object.hasOwn(RUNWAY_CLOTHS, cloth);
// The surfaces "natur", by the word the state key `surface` holds: a hide and a finish for the rail's leather.
// hide: a generated flat picture of leather, its light divided out and made to repeat (tools/scene-material.ts), laid `repeat`
// times each way in the leather's tile, which goes once round the rail's roll (27 cm): the picture then shows about the 15 cm it
// was ordered as, and its grain is about as fine as a real hide's. depth: how deep its grain is taken to be, millimetres from its
// darkest crease to its lightest crown. grain: the size, in tile pixels, below which its brightness is read as relief.
// rough: the roughness of the leather's crowns (its creases are 0.22 duller). coat: a clear finish over it, 0 to 1, as on polished
// leather. folds: how deep, in millimetres, the soft puckers are that run across the roll where the leather is drawn over the
// padding (0: none). light: how much of the room's light the leather takes. duk: the felt is no lit cloth but the cloth as it
// is drawn, in its own even light (as on the painted table), laid over this table: only the rail, the wood and the metal take the
// room's light. (Jakob 2026-11-13: the cloth he liked, V6's, over the table that answers to light. Lit by a dim warm room that
// cloth loses its green; drawn as it is, it keeps it.)
// Such a cloth still follows how bright the room is, not its colour (DUK_LIGHT): drawn at one level it sat nearly black under a
// bright rail in a daylight room.
export type Finish = {hide: string; repeat: number; depth: number; grain: number; rough: number; coat: number; folds: number; light: number; duk?: boolean; name: string};
export const NATURES = {
  'natur': {hide: `${MATERIALS}runway_leather-diffuse.webp`, repeat: 2, depth: 0.05, grain: 4, rough: 0.34, coat: 0, folds: 0, light: 1.6, name: 'Naturmaterial: Runway-läder, filt med lyster'},
  'natur-2': {hide: `${MATERIALS}runway_leather-diffuse.webp`, repeat: 2, depth: 0.05, grain: 4, rough: 0.18, coat: 0.9, folds: 0.5, light: 2, name: 'Naturmaterial 2: samma läder, blankt och med veck'},
  'natur-3': {hide: `${MATERIALS}runway_leather_2-diffuse.webp`, repeat: 2, depth: 0.035, grain: 4, rough: 0.2, coat: 0.7, folds: 0.4, light: 1.5, name: 'Naturmaterial 3: slätt polerat läder med veck'},
  'natur-duk': {hide: `${MATERIALS}runway_leather-diffuse.webp`, repeat: 2, depth: 0.05, grain: 4, rough: 0.18, coat: 0.9, folds: 0.5, light: 2, duk: true, name: 'Duken på naturbordet: blankt läder, filten som duk i eget ljus'},
} as const satisfies Record<string, Finish>;
export type Nature = keyof typeof NATURES;
// The cloth of a surface "duk" and the room's light. light: what the room throws on a level table as it is shown (lightFromAbove
// of its panorama, times the exposure it is shown with, times the key roomLight). At `ref`, the Las Vegas room it was judged in, the
// cloth is as it is drawn; in a brighter room it is lifted by the square root of how much brighter, at most to `hi`, and in a
// darker one lowered, at most to `lo`. Only its level: the cloth keeps its own colour in every room.
export const DUK_LIGHT = {ref: 0.046, gamma: 0.5, lo: 0.7, hi: 1.8};
/** How many times its drawn brightness the cloth of a surface "duk" is shown at, for the room's light on the table (DUK_LIGHT); 1 without a room's light. */
export function dukLevel(light?: number): number { return light !== undefined && light > 0 ? Math.min(DUK_LIGHT.hi, Math.max(DUK_LIGHT.lo, (light / DUK_LIGHT.ref) ** DUK_LIGHT.gamma)) : 1; }
/**
 * The light a room throws on a level table: the mean linear luminance of its panorama's upper half (rgba bytes, 2:1, rows from the
 * top), each row weighted by how squarely its light falls on the table and by how much of the sky lies at that height.
 */
export function lightFromAbove(rgba: ArrayLike<number>, width: number, height: number): number {
  const linear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; let sum = 0, weight = 0;
  for (let y = 0; y < height / 2; y++) { const theta = (y + 0.5) / height * Math.PI, w = Math.cos(theta) * Math.sin(theta);
    for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; sum += w * (0.2126 * linear(rgba[i]) + 0.7152 * linear(rgba[i + 1]) + 0.0722 * linear(rgba[i + 2])); weight += w; } }
  return weight > 0 ? sum / weight : 0;
}
export const isNature = (surface: string | undefined): surface is Nature => !!surface && Object.hasOwn(NATURES, surface);
/**
 * The soft puckers across the rail's roll, as a depth from 0 to 1 at a point of the leather's tile (u along the rail, v round the
 * roll, both 0 to 1 and repeating in u): five shallow valleys per tile, unevenly spaced, each wandering a little as it goes
 * round, deepest on the roll's inner shoulder (v `shoulder`) where the leather is drawn tight and fading toward the underside.
 */
export function foldDepth(u: number, v: number, shoulder: number): number {
  const reach = 0.3 + 0.7 * Math.exp(-(((v - shoulder) / 0.22) ** 2)); let deep = 0;
  for (const [at, wide, sway, phase] of FOLDS) { let d = Math.abs(u - at - sway * Math.sin(2 * Math.PI * (v + phase))) % 1; if (d > 0.5) d = 1 - d; deep = Math.max(deep, Math.exp(-((d / wide) ** 2))); }
  return reach * deep;
}
const FOLDS = [[0.07, 0.013, 0.012, 0.1], [0.24, 0.017, 0.016, 0.55], [0.46, 0.012, 0.01, 0.3], [0.63, 0.018, 0.014, 0.8], [0.86, 0.014, 0.012, 0.45]]; // where along the tile, how wide, how far it wanders, where in its wander it starts
/**
 * The relief of a square photographed surface read from its brightness: each pixel's brightness less the mean within `radius`
 * pixels round it (the picture repeats, so the mean wraps), over 2.5 standard deviations and held within -1 to 1. Creases and
 * pores are darker than what lies round them and come out low; an even light or a slow change of tone comes out as nothing.
 */
export function reliefOf(rgba: ArrayLike<number>, size: number, radius: number): Float32Array {
  const lum = new Float32Array(size * size); for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * rgba[4 * i] + 0.7152 * rgba[4 * i + 1] + 0.0722 * rgba[4 * i + 2];
  const blur = (from: Float32Array, alongX: boolean) => { const out = new Float32Array(from.length), at = (line: number, t: number) => { const c = ((t % size) + size) % size; return from[alongX ? line * size + c : c * size + line]; };
    for (let line = 0; line < size; line++) { let sum = 0; for (let t = -radius; t <= radius; t++) sum += at(line, t);
      for (let t = 0; t < size; t++) { out[alongX ? line * size + t : t * size + line] = sum / (2 * radius + 1); sum += at(line, t + radius + 1) - at(line, t - radius); } }
    return out; };
  const low = blur(blur(lum, true), false), out = new Float32Array(lum.length); let sq = 0;
  for (let i = 0; i < out.length; i++) { out[i] = lum[i] - low[i]; sq += out[i] * out[i]; }
  const span = 2.5 * Math.sqrt(sq / out.length) || 1; for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i] / span));
  return out;
}

// ---- a lamp above the dealer ------------------------------------------------------------------------------------------------------
// The light on the table can come partly from a lamp hanging above the dealer instead of evenly from the room: a point in the room
// (dealer metres: x across, y above the felt, s from the dealer's edge), aimed down at the felt toward the players, with the cone
// of a three.js spot of that angle and penumbra 1, and light that falls off with the square of the distance and the cosine to the
// felt's normal. `strength` is the share of the table's light that comes from it: 0 is the table as it was, 1 all from the lamp.
// Where the dealer's hands rest (x 0, s 0) the table stays as it was; away from there it darkens as the lamp's light falls off.
export const LAMP = {x: 0, y: 0.9, s: -0.15, aim: 0.3, angle: 70 * Math.PI / 180};
const lampIrradiance = (p: number[], at: number[], axis: number[], cone: number) => {
  const l = [at[0] - p[0], at[1] - p[1], at[2] - p[2]], d2 = l[0] * l[0] + l[1] * l[1] + l[2] * l[2], d = Math.sqrt(d2), c = -(l[0] * axis[0] + l[1] * axis[1] + l[2] * axis[2]) / d;
  const t = Math.min(1, Math.max(0, (c - cone) / (1 - cone))); return Math.max(l[1], 0) / d / d2 * t * t * (3 - 2 * t);
};
const LAMP_AXIS = (() => { const v = [0, -LAMP.y, LAMP.aim - LAMP.s], l = Math.hypot(v[0], v[1], v[2]); return v.map(c => c / l); })();
/** The lamp's share of the light on the felt at (x, s) (dealer metres), as the factor the table's colour is multiplied by at that strength. */
export function lampShade(x: number, s: number, strength: number): number {
  const at = [LAMP.x, LAMP.y, LAMP.s], cone = Math.cos(LAMP.angle), rel = lampIrradiance([x, 0, s], at, LAMP_AXIS, cone) / lampIrradiance([0, 0, 0], at, LAMP_AXIS, cone);
  return 1 - strength + strength * Math.min(1, rel);
}
// The same in the table's shaders, in world coordinates (the ratio does not change with the table's scale).
const LAMP_GLSL = `uniform vec3 lampAt, lampAxis; uniform float lampCone, lampRef, lampOn; varying vec3 vLampAt;
float lampLight(vec3 p){
  if (lampOn <= 0.) return 1.;
  vec3 l = lampAt - p; float d2 = dot(l, l), d = sqrt(d2);
  return 1. - lampOn + lampOn * min(1., max(l.y, 0.) / d / d2 * smoothstep(lampCone, 1., dot(-l / d, lampAxis)) * lampRef);
}`;
export const BASE ={floor: -0.95, under: -0.15, legX: 0.58, legZ: 0.25, rail: -0.72}; // heights above the felt and places, dealer metres
const PRINT = {width: 2.8, depth: 1.4, back: 0.1, pxW: 4096, pxH: 2048}; // the felt image covers width x depth metres and starts `back` behind the dealer edge
export const FELT_PX_PER_M = PRINT.pxW / PRINT.width; // what a cloth tile is stored at, to be drawn into the felt image as it is
const GOLD = '#d8b665';

// ---- the rail's cross-sections, dealer metres: [out from the felt edge, height above the felt] ------------------------------------
// `shade(v)` is how open a point of the section is (1) or how deep in a crease (toward 0), with v the fraction of the way round it.
// It goes into texture data, not vertex colours: textures stay in range where the GPU extrapolates at silhouettes, colours do not.
export type Section = {points: number[][]; v: number[]; length: number; shade: (v: number) => number};
export function section(points: number[][], shade: (o: number, y: number) => number): Section {
  const d = [0]; for (let i = 1; i < points.length; i++) d.push(d[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = d[d.length - 1], v = d.map(x => x / length);
  return {points, v, length, shade: (at: number) => { let i = 1; while (i < v.length - 1 && v[i] < at) i++; const f = Math.min(1, Math.max(0, (at - v[i - 1]) / (v[i] - v[i - 1] || 1)));
    return shade(points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f); }};
}
// The leather roll: a rounded box section (a superellipse round CORE), fuller on top, about 10 cm wide and 4.6 cm high, overhanging
// the apron by 9 mm, with a shallow groove on each shoulder where the top panel is sewn to the sides. Sampled densely at the seams and
// sparsely on the underside that nothing sees. The points run from the middle of the underside up the inner face, over the top and
// back round, so the faces point outward; the shade darkens the creases at the brass bead and under the overhang.
const CORE = [0.057, 0.012], SEAMS = [2.3, 0.84]; // seam angles round the core, radians from the outward side
export const RAIL = {centre: CORE[0], top: CORE[1] + 0.034}; // the middle of the roll's top: out from the felt edge, and above the felt (for what is set into the rail, src/scene3d-rail.ts)
const ROLL = (() => {
  const at = (q: number) => { const c = Math.cos(q), s = Math.sin(q), e = s > 0 ? 0.8 : 0.66, x = 0.05 * Math.sign(c) * Math.abs(c) ** e, y = (s > 0 ? 0.034 : 0.031) * Math.sign(s) * Math.abs(s) ** e;
    const dent = SEAMS.reduce((sum, m) => sum + Math.exp(-(((q - m) / 0.075) ** 2)), 0), f = 1 - 0.0016 * dent / Math.hypot(x, y); return [CORE[0] + x * f, CORE[1] + y * f]; };
  const F = 2880, fine: number[][] = [], length = [0], weight = [0];
  for (let i = 0; i <= F; i++) { const q = 1.5 * Math.PI - 2 * Math.PI * i / F; fine.push(at(q)); if (!i) continue;
    const step = Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]), seam = SEAMS.reduce((sum, m) => sum + Math.exp(-(((q - m) / 0.12) ** 2)), 0);
    length.push(length[i - 1] + step); weight.push(weight[i - 1] + step * (Math.sin(q) < -0.75 ? 0.2 : 1 + 3 * seam)); }
  const count = 46, points: number[][] = []; let i = 0;
  for (let n = 0; n < count; n++) { const goal = weight[F] * n / (count - 1); while (i < F - 1 && weight[i + 1] < goal) i++; const f = Math.min(1, Math.max(0, (goal - weight[i]) / (weight[i + 1] - weight[i])));
    points.push([fine[i][0] + (fine[i + 1][0] - fine[i][0]) * f, fine[i][1] + (fine[i + 1][1] - fine[i][1]) * f]); }
  const seamV = SEAMS.map(m => length[Math.round((1.5 * Math.PI - m) / (2 * Math.PI) * F)] / length[F]);
  const shade = (o: number, y: number) => (1 - 0.62 * Math.exp(-Math.hypot(o - 0.009, y) / 0.009)) * (1 - 0.55 * Math.exp(-Math.hypot(o - 0.099, y + 0.02) / 0.008)) * (y < CORE[1] - 0.022 ? 0.6 : 1);
  return {...section(points, shade), seams: seamV.map((v, s) => ({v, toward: s ? -1 : 1}))}; // `toward`: direction of v from the seam to the crown
})();
// A half-round brass bead along the felt edge, tucked under the roll and 2 mm over the felt so no gap shows.
const BEAD = section([[-0.0022, -0.003], [-0.0022, 0.0008], [-0.0012, 0.0032], [0.0008, 0.0047], [0.0035, 0.0053], [0.0062, 0.0046], [0.0082, 0.0028], [0.0092, 0], [0.0092, -0.004]], o => 1 - 0.5 * Math.max(0, Math.min(1, (o - 0.004) / 0.005)));
// The apron: a straight lacquered face with a rounded lower edge. Its top rises straight into the roll, so nothing under the overhang
// faces up into the light; it sits in the overhang's shade.
const APRON = section([[0.0985, -0.006], [0.0993, -0.018], [0.1, -0.03], [0.1, -0.075], [0.1, -0.118], [0.0993, -0.126], [0.096, -0.1305], [0.088, -0.133], [0.05, -0.15]],
  (o, y) => (0.28 + 0.72 * Math.min(1, Math.max(0, (-0.016 - y) / 0.034))) * (y < -0.128 ? 0.7 : 1));

// Sweeps a section along the players' arc. Each ring sits at the felt-edge point P(t) and the section's `out` runs along the edge's
// true outward normal, so the rail keeps its width round the tight ends. `cap` rounds the two ends off past the dealer's edge: the
// section shrinks toward `core` while it moves `length` on. u runs along the arc in tiles of `tile` metres (the length along that line
// of the section, so the grain does not stretch round the ends); v runs once round the section, 0 to 1, so textures can follow it.
type Cap = {length: number; core: number[]; steps: number};
export function sweep(sec: Section, rings: number, tile: number, cap: Cap | null, size = 1) {
  const {a, b} = sized(size), M = sec.points.length, K = cap ? cap.steps : 0, position: number[] = [], uv: number[] = [], index: number[] = [];
  const list: {t: number; push: number; shrink: number}[] = [];
  for (let k = K; k >= 1; k--) list.push({t: 0, push: cap!.length * Math.sin(k / K * Math.PI / 2), shrink: Math.cos(k / K * Math.PI / 2)});
  for (let i = 0; i <= rings; i++) list.push({t: Math.PI * i / rings, push: 0, shrink: 1});
  for (let k = 1; k <= K; k++) list.push({t: Math.PI, push: cap!.length * Math.sin(k / K * Math.PI / 2), shrink: Math.cos(k / K * Math.PI / 2)});
  let along = 0, last = 0;
  for (const ring of list) {
    for (let k = 0; k < 8 && ring.t > last; k++) { const t0 = last + (ring.t - last) * k / 8, t1 = last + (ring.t - last) * (k + 1) / 8; along += Math.hypot(a * (Math.cos(t1) - Math.cos(t0)), b * (Math.sin(t1) - Math.sin(t0))); }
    last = ring.t;
    const t = ring.t, nl = Math.hypot(b * Math.cos(t), a * Math.sin(t)), nx = b * Math.cos(t) / nl, nz = a * Math.sin(t) / nl, phi = Math.atan2(nz, nx), past = t < 1 ? -ring.push : ring.push;
    for (let j = 0; j < M; j++) {
      let [o, y] = sec.points[j]; if (cap) { o = cap.core[0] + (o - cap.core[0]) * ring.shrink; y = cap.core[1] + (y - cap.core[1]) * ring.shrink; }
      position.push(a * Math.cos(t) + o * nx, y, b * Math.sin(t) + o * nz - ring.push); uv.push((along + o * phi + past) / tile, sec.v[j]);
    }
  }
  for (let r = 0; r < list.length - 1; r++) for (let j = 0; j < M - 1; j++) { const q = r * M + j; index.push(q, q + M, q + 1, q + 1, q + M, q + M + 1); }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index); geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal') as T.BufferAttribute, [first, end] = [sec.points[0], sec.points[M - 1]];
  if (Math.hypot(first[0] - end[0], first[1] - end[1]) < 1e-6) for (let r = 0; r < list.length; r++) { // a closed section: join the normals where it meets itself
    const p = r * M, q = p + M - 1, x = normal.getX(p) + normal.getX(q), y = normal.getY(p) + normal.getY(q), z = normal.getZ(p) + normal.getZ(q), l = Math.hypot(x, y, z) || 1;
    normal.setXYZ(p, x / l, y / l, z / l); normal.setXYZ(q, x / l, y / l, z / l); }
  if (cap) for (const r of [0, list.length - 1]) for (let j = 0; j < M; j++) normal.setXYZ(r * M + j, 0, 0, -1); // the tips of the rounded ends
  return geometry;
}

// ---- procedural textures, made once per table ------------------------------------------------------------------------------------------
const random = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// Value noise with p x p cells that tiles over the unit square.
function tiling(p: number, rand: () => number) {
  const v = Float32Array.from({length: p * p}, rand), at = (i: number, j: number) => v[(j % p) * p + i % p];
  return (x: number, y: number) => { const fx = x * p, fy = y * p, i = Math.floor(fx), j = Math.floor(fy), sx = fx - i, sy = fy - j, ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
    return (at(i, j) * (1 - ux) + at(i + 1, j) * ux) * (1 - uy) + (at(i, j + 1) * (1 - ux) + at(i + 1, j + 1) * ux) * uy; };
}
function canvasTexture(image: ImageData, srgb: boolean) {
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; c.getContext('2d')!.putImageData(image, 0, 0);
  const t = new T.CanvasTexture(c); t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
}
// Leather for the roll, one tile as many metres square as the section is long, since v runs once round the section and u repeats along
// the arc: pebble grain about 1.3 mm across, a soft colour mottle, and the two seams with a row of slanted stitches beside each at the
// rows where the section puts them. The roughness texture carries the section's crease shade in its red channel for the aoMap.
// `hide`: a photographed hide of the tile's own size, with its finish (NATURES), in place of the drawn pebbles and the drawn
// colour: its colour is the leather's, and its relief (reliefOf) is the grain. The seams and the stitches are drawn on it as on
// the drawn leather, and the finish's puckers (foldDepth) are pressed into it, a little darker where they are deep.
const LEATHER_PX = 1024;
function leatherTextures(sec: Section, seams: {v: number; toward: number}[], hide?: {data: ArrayLike<number>; width: number} & Pick<Finish, 'depth' | 'grain' | 'rough' | 'folds'>) {
  const S = LEATHER_PX, P = 512, size = sec.length, mm = size * 1000 / S, rand = random(5), G = Math.round(size / 0.0026), cell = P / G, jitter = Float32Array.from({length: 2 * G * G}, rand);
  // pebbles (F2 - F1 of a jittered grid, 0 on the creases between them) on a half-size tile that repeats 2 x 2
  const pebbles = new Float32Array(P * P);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const gx = x / cell, gy = y / cell, ci = Math.floor(gx), cj = Math.floor(gy); let f1 = 9, f2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const c = 2 * (((cj + dj + G) % G) * G + (ci + di + G) % G), ex = gx - ci - di - jitter[c], ey = gy - cj - dj - jitter[c + 1], d = ex * ex + ey * ey; if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
    pebbles[y * P + x] = 1 - Math.exp(-(Math.sqrt(f2) - Math.sqrt(f1)) / 0.15);
  }
  // the seams and the crease shade depend on the row only: a groove with the panels puffed beside it, and a row of stitches toward the crown
  const pitch = S / Math.round(size / 0.0052), rowHeight = new Float32Array(S), rowGroove = new Float32Array(S), rowStitch = new Float32Array(S).fill(9), rowShade = new Float32Array(S);
  for (let y = 0; y < S; y++) { rowShade[y] = sec.shade(1 - (y + 0.5) / S); for (const s of seams) {
    const d = (y - (1 - s.v) * S) * mm, e = (y - (1 - s.v - s.toward * 0.0032 / size) * S) * mm, g = Math.exp(-((d / 0.5) ** 2));
    rowGroove[y] = Math.max(rowGroove[y], g); rowHeight[y] += -0.5 * g + 0.12 * Math.exp(-(((Math.abs(d) - 1.6) / 0.9) ** 2)) - 0.04 * Math.exp(-((e / 0.7) ** 2)); if (Math.abs(e) < Math.abs(rowStitch[y])) rowStitch[y] = e;
  } }
  // a soft mottle of the colour, on a quarter-size grid read back bilinearly
  const R = S / 4, tone = new Float32Array(R * R), mottle = tiling(6, rand);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) tone[j * R + i] = mottle(i / R, j / R);
  const height = new Float32Array(S * S), colour = new ImageData(S, S), rough = new ImageData(S, S), normal = new ImageData(S, S), cd = colour.data, rd = rough.data, nd = normal.data;
  if (hide && hide.width !== S) throw Error(`The hide must be ${S} pixels square, as the leather's tile is.`);
  const grain = hide ? reliefOf(hide.data, S, hide.grain) : null, shoulder = seams[0]?.v ?? 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x / 4, fy = y / 4, i = fx | 0, j = fy | 0, sx = fx - i, sy = fy - j, a = j * R + i, b = j * R + (i + 1) % R, c = ((j + 1) % R) * R + i, d = ((j + 1) % R) * R + (i + 1) % R;
    const wa = (1 - sx) * (1 - sy), wb = sx * (1 - sy), wc = (1 - sx) * sy, wd = sx * sy, pebble = grain ? 0.5 + 0.5 * grain[y * S + x] : pebbles[(y % P) * P + x % P];
    const fold = hide?.folds ? foldDepth((x + 0.5) / S, 1 - (y + 0.5) / S, shoulder) : 0;
    let h = (hide ? hide.depth : 0.022) * pebble + rowHeight[y] - (hide?.folds ?? 0) * fold, thread = 0; // millimetres; the grain is kept shallow so it does not streak where the roll is seen edge-on
    const e = rowStitch[y];
    if (e > -0.4 && e < 0.4) { const phase = ((x + 0.7 * e / mm) % pitch + pitch) % pitch / pitch; if (phase < 0.72) { thread = Math.sqrt((1 - (e / 0.4) ** 2) * Math.sin(Math.PI * phase / 0.72)); h += 0.18 * thread; } }
    height[y * S + x] = h;
    const groove = rowGroove[y], p = 4 * (y * S + x), w = 0.85 * thread;
    if (hide) { // the hide's own colour, darker in the seam's groove and in a pucker; the thread a lighter brown of the same leather
      const f = (1 - 0.3 * groove) * (1 - 0.18 * fold); cd[p] = hide.data[p] * f * (1 - w) + 104 * w; cd[p + 1] = hide.data[p + 1] * f * (1 - w) + 70 * w; cd[p + 2] = hide.data[p + 2] * f * (1 - w) + 50 * w; cd[p + 3] = 255;
      rd[p] = 255 * rowShade[y]; rd[p + 1] = rd[p + 2] = 255 * ((hide.rough + 0.22 * (1 - pebble) + 0.08 * groove) * (1 - thread) + 0.75 * thread); rd[p + 3] = 255; // worn smooth on the crowns, dull in the creases
      continue; }
    const f = (0.86 + 0.14 * pebble) * (1 - 0.3 * groove) * (0.94 + 0.12 * (tone[a] * wa + tone[b] * wb + tone[c] * wc + tone[d] * wd));
    cd[p] = 52 * f * (1 - w) + 80 * w; cd[p + 1] = 21 * f * (1 - w) + 50 * w; cd[p + 2] = 15 * f * (1 - w) + 35 * w; cd[p + 3] = 255;
    rd[p] = 255 * rowShade[y]; rd[p + 1] = rd[p + 2] = 255 * ((0.4 + 0.08 * (1 - pebble) + 0.08 * groove) * (1 - thread) + 0.75 * thread); rd[p + 3] = 255;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (height[y * S + (x + 1) % S] - height[y * S + (x + S - 1) % S]) / (2 * mm), dy = (height[((y + 1) % S) * S + x] - height[((y + S - 1) % S) * S + x]) / (2 * mm), l = Math.sqrt(dx * dx + dy * dy + 1), p = 4 * (y * S + x);
    nd[p] = 255 * (0.5 - 0.5 * dx / l); nd[p + 1] = 255 * (0.5 + 0.5 * dy / l); nd[p + 2] = 255 * (0.5 + 0.5 / l); nd[p + 3] = 255; // rows run against v
  }
  const roughness = canvasTexture(rough, false), normalMap = canvasTexture(normal, false); normalMap.anisotropy = 1; // seen edge-on the grain fades instead of streaking
  return {map: canvasTexture(colour, true), normalMap, roughnessMap: roughness, aoMap: roughness};
}
// Dark walnut for the apron, 0.6 m along the arc per tile and once round the section: fine grain lines along the arc that waver
// slowly, long streaks and a soft figure.
function walnutTexture() {
  const W = 512, H = 128, rand = random(9), warp = tiling(5, rand), figure = tiling(9, rand), streak = tiling(64, rand), image = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, line = (1 - Math.sin(2 * Math.PI * (v * 38 + 0.7 * warp(u, v)))) / 2, dark = line * line * line * line;
    const f = (0.92 - 0.3 * dark) * (0.86 + 0.24 * figure(u, v)) * (0.93 + 0.12 * streak(u, v * 4 % 1)), p = 4 * (y * W + x);
    image.data[p] = 48 * f; image.data[p + 1] = 26 * f; image.data[p + 2] = 14 * f; image.data[p + 3] = 255;
  }
  return canvasTexture(image, true);
}
// The section's shade alone, as a linear map: the aoMap of the apron, and the map of the brass bead where it tucks under the roll.
function shadeTexture(sec: Section) {
  const H = 64, image = new ImageData(4, H);
  for (let y = 0; y < H; y++) { const s = 255 * sec.shade(1 - (y + 0.5) / H); for (let x = 0; x < 4; x++) image.data.set([s, s, s, 255], 4 * (y * 4 + x)); }
  return canvasTexture(image, false);
}
// What the rail reflects: a dark warm room painted from the salon's layout as seen from the table. The lamp over the table, light slots on
// the back wall and the pillars, downlights in a dark ceiling, a dark carpet. Equirectangular, as three.js reads it: column =
// atan2(z, x) / 2pi + 1/2 (the dealer's side, -z, at a quarter of the width), row 0 straight up. The rendered cards'
// sheen reflects it too (scene3d-deal.ts), so rail and cards shine with the same room.
export function roomReflection() {
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, h); for (const [at, color] of [[0, '#241910'], [0.3, '#1d140d'], [0.45, '#33231a'], [0.5, '#2a1c12'], [0.56, '#140d09'], [1, '#060403']] as [number, string][]) sky.addColorStop(at, color);
  g.fillStyle = sky; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'lighter';
  // a soft light at azimuth `az` (degrees of atan2(z, x)) and elevation `el`, `rx` degrees of azimuth wide and `ry` degrees tall
  const glow = (az: number, el: number, rx: number, ry: number, [r, gr, b]: number[], alpha: number) => {
    for (const shift of [-w, 0, w]) { g.save(); g.translate((az / 360 + 0.5) * w + shift, (0.5 - el / 180) * h); g.scale(rx / 360 * w, ry / 180 * h);
      const fill = g.createRadialGradient(0, 0, 0, 0, 0, 1); fill.addColorStop(0, `rgba(${r},${gr},${b},${alpha})`); fill.addColorStop(0.45, `rgba(${r},${gr},${b},${alpha * 0.8})`); fill.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = fill; g.fillRect(-1, -1, 2, 2); g.restore(); }
  };
  const toward = (x: number, y: number, z: number) => [Math.atan2(z - 0.3, x) * 180 / Math.PI, Math.atan2(y, Math.hypot(x, z - 0.3)) * 180 / Math.PI]; // seen from the middle of the felt
  glow(-90, 50, 130, 44, [255, 170, 100], 0.2); glow(-90, 62, 36, 12, [255, 226, 184], 1); glow(-90, 63, 18, 6, [255, 240, 215], 1); // the lamp over the table
  for (const x of [-7.2, -4.4, -1.9, 1.9, 4.4, 7.2]) { const [az] = toward(x, 0, -5.5); glow(az, 8, 2.4, 14, [255, 180, 100], 0.85); }
  for (const [x, z] of [[-3.1, -3.5], [3.1, -3.5], [-6.3, -1.4], [6.3, -1.4], [-6.3, 2.2], [6.3, 2.2]]) { const [az] = toward(x, 0, z); glow(az, 4, 1.6, 12, [255, 170, 90], 0.7); }
  for (let x = -8; x <= 8; x += 2) for (let z = -5; z <= 3; z += 2) { const [az, el] = toward(x, 3.15, z); glow(az, el, 2.6 / Math.max(0.15, Math.cos(el * Math.PI / 180)), 2.6, [255, 236, 200], 0.9); }
  for (const [x, y, z] of [[-2.3, 1.9, -2.9], [2.3, 1.9, -2.9], [-4.9, 1.7, -2.2], [4.9, 1.7, -2.2], [0, 2.3, -4.4]]) { const [az, el] = toward(x, y, z); glow(az, el, 3.5, 3.5, [255, 200, 130], 1); }
  { const [az, el] = toward(-5.9, 0.6, -5.4); glow(az, el, 14, 7, [220, 120, 50], 0.35); } // the bar
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.mapping = T.EquirectangularReflectionMapping; return t;
}

// camera: the film camera in use, through which V6's cloth is laid flat; marks: the kinds of print drawn (feltMarks; absent = all).
// size: the table's size (sized); the rail's shadow on the felt follows the felt's edge.
export type FeltPrint = {spots: Spot[]; logo: string; felt: string; scale: number; marks?: string; cloth?: TableCloth; camera?: FilmCamera; size?: number};
export function createTable(lit: <M extends T.Material>(material: M) => M = m => m) {
  const canvas = document.createElement('canvas'); canvas.width = PRINT.pxW; canvas.height = PRINT.pxH;
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 16;
  const group = new T.Group(), k = PRINT.pxW / PRINT.width, X = (x: number) => (x + PRINT.width / 2) * k, Y = (s: number) => (s + PRINT.back) * k;
  // The lamp (LAMP) on every surface of the table: its light is worked out per pixel in world coordinates and multiplies the
  // colour before it is encoded, where light acts. At strength 0 the factor is exactly 1 and the table is as it was.
  const lamp = {lampAt: {value: new T.Vector3()}, lampAxis: {value: new T.Vector3(...LAMP_AXIS)}, lampCone: {value: Math.cos(LAMP.angle)}, lampRef: {value: 1}, lampOn: {value: 0}};
  let lampStrength = 0;
  const lamped = <M extends T.Material>(material: M): M => {
    const before = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader: T.WebGLProgramParametersWithUniforms, renderer: T.WebGLRenderer) => { before.call(material, shader, renderer); Object.assign(shader.uniforms, lamp);
      shader.vertexShader = 'varying vec3 vLampAt;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vLampAt = (modelMatrix * vec4(transformed, 1.)).xyz;');
      shader.fragmentShader = LAMP_GLSL + '\n' + shader.fragmentShader.replace('#include <colorspace_fragment>', 'gl_FragColor.rgb *= lampLight(vLampAt);\n#include <colorspace_fragment>'); };
    material.customProgramCacheKey = () => `${key()}+lamp`; return material;
  };
  const own = <M extends T.Material>(material: M): M => lamped(lit(material));
  // Materials and textures live as long as the table; build() only replaces geometry.
  const room = roomReflection();
  const felt = own(new T.MeshBasicMaterial({map: texture, side: T.DoubleSide}));
  // the same cloth for a surface "duk": its own material, since its level follows the room (setEnvironment) and the painted table's does not
  const dukFelt = own(new T.MeshBasicMaterial({map: texture, side: T.DoubleSide}));
  const leather = own(new T.MeshStandardMaterial({...leatherTextures(ROLL, ROLL.seams), normalScale: new T.Vector2(0.75, 0.75), roughness: 1, metalness: 0, envMap: room, envMapIntensity: 3}));
  const bead = own(new T.MeshStandardMaterial({map: shadeTexture(BEAD), color: 0x9c7a45, roughness: 0.36, metalness: 1, envMap: room, envMapIntensity: 1.1}));
  const walnut = walnutTexture();
  const apron = own(new T.MeshPhysicalMaterial({map: walnut, aoMap: shadeTexture(APRON), roughness: 0.5, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3, envMap: room, envMapIntensity: 1.5}));
  // The dealer-side board, the leg and the foot keep their first materials: a strip of the board's top shows in the home view.
  const wood = own(new T.MeshStandardMaterial({color: 0x2a170d, roughness: 0.4, metalness: 0.1, side: T.DoubleSide})), brass = own(new T.MeshStandardMaterial({color: 0xb08a45, roughness: 0.3, metalness: 0.9}));

  // The base of photographed wood (Poly Haven's wood_table, CC0; data/scene-materials.json). The maps are local media, read the
  // first time a base asks for them; until they are there, and where they cannot be read, the base wears the painted walnut.
  const timber = own(new T.MeshStandardMaterial({map: walnut, color: 0xffffff, roughness: 0.5, metalness: 0, envMap: room, envMapIntensity: 1.1}));
  // The skirt in the same wood, lacquered: its grain runs along the arc, and the section's shade keeps the overhang's shadow on it.
  const skirt = own(new T.MeshPhysicalMaterial({map: walnut, aoMap: shadeTexture(APRON), roughness: 0.5, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25, envMap: room, envMapIntensity: 1.6}));
  const polished = own(new T.MeshStandardMaterial({color: 0xb08a45, roughness: 0.28, metalness: 1, envMap: room, envMapIntensity: 1.5}));
  const shadow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, fade = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    fade.addColorStop(0, 'rgba(0,0,0,.62)'); fade.addColorStop(0.55, 'rgba(0,0,0,.34)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fade; g.fillRect(0, 0, 128, 128);
    return new T.MeshBasicMaterial({map: new T.CanvasTexture(c), transparent: true, depthWrite: false}); })();
  // The felt as a lit cloth: the same print, and a photographed weave (a denim weave from Poly Haven, CC0, not measured
  // blackjack felt; data/scene-materials.json) read the first time the photographed surface is asked for.
  // The print holds the colours as they should be seen, so as the albedo of a lit cloth it is raised: under the scene's lights the
  // cloth then comes out about as bright as the print, and what differs is what the light does to it.
  const cloth = own(new T.MeshStandardMaterial({map: texture, roughness: 1, metalness: 0, side: T.DoubleSide, envMap: room, envMapIntensity: 0.6})); cloth.color.setScalar(2.1);
  let woven = false;
  function weave() {
    if (woven) return; woven = true;
    const loader = new T.TextureLoader(), read = (name: string) => loader.loadAsync(`assets/scene/materials/denim_fabric-${name}.webp`).then(t => { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(16, 8); t.anisotropy = 8; return t; });
    Promise.all([read('nor_gl'), read('rough')]).then(([normalMap, roughnessMap]) => { Object.assign(cloth, {normalMap, roughnessMap}); cloth.normalScale.set(0.6, 0.6); cloth.needsUpdate = true;
      if (wool) { Object.assign(wool, {normalMap, roughnessMap}); wool.needsUpdate = true; } }, () => {});
  }
  // A surface "natur" (NATURES), made the first time it is asked for: the felt as the lit cloth with a napped cloth's sheen (a pale
  // green that shows where the felt is seen at a low angle; its weave is laid on more faintly, since a felt has none of its own),
  // and the rail in that surface's hide and finish. Until the hide is read, and where it cannot be, the rail wears the drawn leather.
  // A dark hide with a sheen takes less of the room's light than the drawn leather does, on a smoother surface.
  let wool: T.MeshPhysicalMaterial | null = null; const hides = new Map<Nature, T.MeshStandardMaterial>();
  function natural(nature: Nature) {
    if (!wool) { const felted = wool = own(new T.MeshPhysicalMaterial({map: texture, normalMap: cloth.normalMap, roughnessMap: cloth.roughnessMap, roughness: 1, metalness: 0, side: T.DoubleSide, sheen: 1, sheenRoughness: 0.55, sheenColor: new T.Color(0.42, 0.62, 0.46)}));
      felted.color.setScalar(2.1); felted.normalScale.set(0.3, 0.3); lights.push([felted, 0.6]); setEnvironment(env.map, env.turn, env.strength); }
    let hide = hides.get(nature);
    if (!hide) { const finish: Finish = NATURES[nature], drawn = {map: leather.map, normalMap: leather.normalMap, roughnessMap: leather.roughnessMap, aoMap: leather.aoMap, normalScale: new T.Vector2(0.9, 0.9), roughness: 1, metalness: 0};
      const upholstered = hide = own(finish.coat > 0 ? new T.MeshPhysicalMaterial({...drawn, clearcoat: finish.coat, clearcoatRoughness: 0.16}) : new T.MeshStandardMaterial(drawn));
      hides.set(nature, upholstered); lights.push([upholstered, finish.light]); setEnvironment(env.map, env.turn, env.strength);
      const image = new Image(); image.src = finish.hide;
      image.decode().then(() => { const c = document.createElement('canvas'); c.width = c.height = LEATHER_PX; const g = c.getContext('2d', {willReadFrequently: true})!, cell = LEATHER_PX / finish.repeat; g.imageSmoothingQuality = 'high';
        for (let j = 0; j < finish.repeat; j++) for (let i = 0; i < finish.repeat; i++) g.drawImage(image, i * cell, j * cell, cell, cell);
        Object.assign(upholstered, leatherTextures(ROLL, ROLL.seams, {data: g.getImageData(0, 0, LEATHER_PX, LEATHER_PX).data, width: LEATHER_PX, depth: finish.depth, grain: finish.grain, rough: finish.rough, folds: finish.folds})); upholstered.needsUpdate = true; }, () => {});
    }
    return {wool: wool!, hide};
  }
  let asked = false;
  function photographed() {
    if (asked) return; asked = true;
    const loader = new T.TextureLoader(), read = (name: string, colour: boolean) => loader.loadAsync(`assets/scene/materials/wood_table-${name}.webp`).then(t => { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 1.5); t.anisotropy = 8; if (colour) t.colorSpace = T.SRGBColorSpace; return t; });
    Promise.all([read('diffuse', true), read('nor_gl', false), read('rough', false)]).then(([map, normalMap, roughnessMap]) => {
      Object.assign(timber, {map, normalMap, roughnessMap, roughness: 0.85}); timber.color.set(0x9a7052); timber.normalScale.set(0.45, 0.45); timber.needsUpdate = true;
      const along = map.clone(); along.repeat.set(1, 0.4); along.needsUpdate = true; skirt.map = along; skirt.color.set(0xa67a58); skirt.needsUpdate = true; }, () => {});
  }

  // V6's cloth as a repeating tile at the print's own pixels per metre, made once per film camera (it is laid flat through it).
  // The picture is local media, read the first time the cloth is asked for; until it is there, or where it cannot be read, the
  // felt keeps its print colour.
  let lastPrint: FeltPrint | null = null, v6Source: ImageData | null = null, v6Asked = false, v6Tile: {camera: string; pattern: CanvasPattern} | null = null;
  function v6Pattern(g: CanvasRenderingContext2D, camera: FilmCamera): CanvasPattern | null {
    const id = JSON.stringify(camera); if (v6Tile?.camera === id) return v6Tile.pattern;
    if (!v6Source) { if (!v6Asked) { v6Asked = true; const image = new Image(); image.src = V6_CLOTH.url;
      image.decode().then(() => { const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const cg = c.getContext('2d', {willReadFrequently: true})!; cg.drawImage(image, 0, 0);
        v6Source = cg.getImageData(0, 0, image.width, image.height); if (lastPrint?.cloth === 'v6') draw(lastPrint); }, () => {}); } return null; }
    const src = v6Source, [r0, r1] = V6_CLOTH.rows, [c0, c1] = V6_CLOTH.cols, mean = [0, 0, 0]; let n = 0;
    for (let y = r0; y < Math.min(r1, src.height); y++) for (let x = c0; x < c1; x++) { const i = (y * src.width + x) * 4; mean[0] += src.data[i]; mean[1] += src.data[i + 1]; mean[2] += src.data[i + 2]; n++; }
    const tile = seamless(flatten(rectify(src, camera, V6_CLOTH, k), Math.round(V6_CLOTH.flat * k / 2), mean.map(v => v / Math.max(1, n))), Math.round(V6_CLOTH.fade * k));
    const image = new ImageData(tile.width, tile.height); for (let i = 0, j = 0; i < tile.data.length; i += 3, j += 4) { image.data[j] = tile.data[i]; image.data[j + 1] = tile.data[i + 1]; image.data[j + 2] = tile.data[i + 2]; image.data[j + 3] = 255; }
    const c = document.createElement('canvas'); c.width = tile.width; c.height = tile.height; c.getContext('2d')!.putImageData(image, 0, 0);
    const pattern = g.createPattern(c, 'repeat')!; v6Tile = {camera: id, pattern}; return pattern;
  }
  // A generated photograph's felt (RUNWAY_CLOTHS): a finished tile at the print's own pixels per metre, read the first time the
  // cloth is asked for; until it is there, or where it cannot be read, the felt keeps its print colour.
  const runwayTiles = new Map<RunwayCloth, CanvasPattern | null>();
  function runwayPattern(g: CanvasRenderingContext2D, which: RunwayCloth): CanvasPattern | null {
    if (!runwayTiles.has(which)) { runwayTiles.set(which, null); const image = new Image(); image.src = RUNWAY_CLOTHS[which].url;
      image.decode().then(() => { runwayTiles.set(which, g.createPattern(image, 'repeat')); if (lastPrint?.cloth === which) draw(lastPrint); }, () => {}); }
    return runwayTiles.get(which) ?? null;
  }

  function draw(print: FeltPrint) {
    lastPrint = print;
    const g = canvas.getContext('2d')!, [light, dark] = FELTS[print.felt] ?? FELTS.green, on = feltMarks(print.marks);
    const weave = print.cloth === 'v6' && print.camera ? v6Pattern(g, print.camera) : isRunwayCloth(print.cloth) ? runwayPattern(g, print.cloth) : null;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    if (weave) { g.fillStyle = weave; g.fillRect(0, 0, PRINT.pxW, PRINT.pxH); }
    else {
      g.fillStyle = dark; g.fillRect(0, 0, PRINT.pxW, PRINT.pxH);
      const pool = g.createRadialGradient(X(0), Y(0.3), 40, X(0), Y(0.3), 1.25 * k); pool.addColorStop(0, light); pool.addColorStop(1, dark); g.fillStyle = pool; g.fillRect(0, 0, PRINT.pxW, PRINT.pxH);
      let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      g.globalAlpha = 0.05; for (let i = 0; i < 70000; i++) { g.fillStyle = random() > 0.5 ? '#fff' : '#000'; g.fillRect(random() * PRINT.pxW, random() * PRINT.pxH, 2, 2); } g.globalAlpha = 1;
    }
    // dealer-side trim: the film's body ends exactly at s = 0
    if (on.has('trim')) { g.fillStyle = '#17110c'; g.fillRect(0, 0, PRINT.pxW, Y(0.016)); g.fillStyle = GOLD; g.globalAlpha = 0.55; g.fillRect(0, Y(0.016), PRINT.pxW, 3); g.globalAlpha = 1; }
    // the rail's soft shadow on the felt along the arc: a dark band just outside the felt edge, blurred inward and clipped to the felt
    const edge = sized(print.size);
    g.save(); g.beginPath(); g.ellipse(X(0), Y(0), edge.a * k, edge.b * k, 0, 0, 2 * Math.PI); g.clip();
    for (const [width, blur, alpha] of [[0.04, 0.016, 0.55], [0.01, 0.0035, 0.65]]) { g.filter = `blur(${Math.round(blur * k)}px)`; g.strokeStyle = `rgba(3,2,1,${alpha})`; g.lineWidth = 2 * width * k;
      g.beginPath(); g.ellipse(X(0), Y(0), (edge.a + width) * k, (edge.b + width) * k, 0, 0, 2 * Math.PI); g.stroke(); }
    g.restore();
    const seats = print.spots.filter(p => /^P\d\.C1$/.test(p.id)), row = seats.length ? seats.reduce((t, p) => t + p.s, 0) / seats.length : 0.35, span = Math.max(0.3, ...seats.map(p => Math.abs(p.x))) * 1.5;
    if (on.has('arc')) { g.strokeStyle = GOLD; g.lineWidth = 3; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(X(0), Y(0), span * k * 1.015, row * 0.83 * k, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); g.globalAlpha = 1; }
    // text along an arc that opens toward the dealer, upright for the players
    if (on.has('text')) { const text = 'BLACKJACK PAYS 3 TO 2', size = Math.round(0.024 * k), rx = span * 0.95, ry = row * 0.7;
      g.save(); g.font = `600 ${size}px Georgia, 'Times New Roman', serif`; g.fillStyle = GOLD; g.globalAlpha = 0.8; g.textAlign = 'center'; g.textBaseline = 'middle';
      const widths = [...text].map(ch => g.measureText(ch).width + size * 0.12); let run = -widths.reduce((a, b) => a + b, 0) / 2;
      for (let i = 0; i < text.length; i++) { const phi = (run + widths[i] / 2) / ((rx + ry) / 2 * k); run += widths[i]; g.save(); g.translate(X(rx * Math.sin(phi)), Y(ry * Math.cos(phi))); g.rotate(-phi); g.fillText(text[i], 0, 0); g.restore(); }
      g.restore(); }
    if (on.has('logo')) { const logo = print.logo.toUpperCase(), logoY = Y(row * 0.44);
      g.save(); g.fillStyle = GOLD; g.globalAlpha = 0.9; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(0.034 * k)}px Georgia, 'Times New Roman', serif`; g.fillText(logo, X(0), logoY);
      const half = g.measureText(logo).width / 2; g.lineWidth = 2; g.strokeStyle = GOLD; g.globalAlpha = 0.6; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(X(0) + d * (half + 24), logoY); g.lineTo(X(0) + d * (half + 110), logoY); g.stroke(); }
      g.restore(); }
    // card places from the placement plan, at the plan's own card width; a bet circle in front of each seat's first card, with the seat's number
    const cardW = 0.063 / print.scale * k, cardH = 0.07 / print.scale * k, betOffset = BET.offset * k, betRadius = BET.radius * k;
    for (const p of print.spots) { const first = p.id.endsWith('C1'); g.save(); g.translate(X(p.x), Y(p.s)); g.strokeStyle = GOLD; g.globalAlpha = first ? 0.6 : 0.25; g.lineWidth = 3;
      if (on.has('boxes')) { g.beginPath(); g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8); g.stroke(); }
      if (first && p.id[0] === 'P') { g.globalAlpha = 0.5; if (on.has('rings')) { g.beginPath(); g.arc(0, betOffset, betRadius, 0, 7); g.stroke(); }
        if (on.has('numbers')) { g.font = `600 ${Math.round(0.02 * k)}px Georgia, serif`; g.fillStyle = GOLD; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.id[1], 0, betOffset); } }
      g.restore(); }
    texture.needsUpdate = true;
  }

  // `notch`: a rectangle cut into the felt from the dealer-side edge, for something sunk into the table there (x across,
  // s1 = how far it reaches toward the players; dealer metres). A notch, not a hole: a hole this close to the edge is
  // triangulated shut by ShapeGeometry.
  // `size`: the table's size (sized): the felt, the rail round it and the base under it; 1 is TABLE as it stands.
  function build(edgeZ: number, scale: number, notch?: {x0: number; x1: number; s1: number}, base: TableBase = 'column', surface: TableSurface = 'painted', size = 1) {
    for (const child of [...group.children]) { group.remove(child); (child as T.Mesh).geometry?.dispose(); }
    group.position.set(0, 0, edgeZ); group.scale.setScalar(scale); setLamp(lampStrength);
    const N = 96, {a, b} = sized(size), grown = a / TABLE.a, {rail} = TABLE, uvOf = (x: number, s: number) => [(x + PRINT.width / 2) / PRINT.width, 1 - (s + PRINT.back) / PRINT.depth];
    const position = [0, 0, b * 0.4], uv = [...uvOf(0, b * 0.4)], index: number[] = [];
    for (let i = 0; i <= N; i++) { const t = Math.PI * i / N, x = a * Math.cos(t), s = b * Math.sin(t); position.push(x, 0, s); uv.push(...uvOf(x, s)); if (i) index.push(0, i, i + 1); }
    index.push(0, N + 1, 1); // the dealer-side triangle between the two ends of the arc
    let feltGeometry = new T.BufferGeometry(); feltGeometry.setAttribute('position', new T.Float32BufferAttribute(position, 3)); feltGeometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); feltGeometry.setIndex(index);
    if (notch) { // the same outline with the notch, triangulated as one polygon
      const outline = [...Array.from({length: N + 1}, (_, i) => new T.Vector2(a * Math.cos(Math.PI * i / N), b * Math.sin(Math.PI * i / N))), new T.Vector2(notch.x0, 0), new T.Vector2(notch.x0, notch.s1), new T.Vector2(notch.x1, notch.s1), new T.Vector2(notch.x1, 0)];
      feltGeometry.dispose(); feltGeometry = new T.ShapeGeometry(new T.Shape(outline)).rotateX(Math.PI / 2); const p = feltGeometry.getAttribute('position'), cut: number[] = [];
      for (let i = 0; i < p.count; i++) cut.push(...uvOf(p.getX(i), p.getZ(i))); feltGeometry.setAttribute('uv', new T.Float32BufferAttribute(cut, 2)); }
    const nature = isNature(surface) ? natural(surface) : null;
    if (surface !== 'painted') { weave(); feltGeometry.computeVertexNormals(); const normal = feltGeometry.getAttribute('normal') as T.BufferAttribute; for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0); } // the cloth faces up
    group.add(new T.Mesh(feltGeometry, nature ? ((NATURES[surface as Nature] as Finish).duk ? dukFelt : nature.wool) : surface === 'photo' ? cloth : felt));
    // padded rail round the players' arc with rounded ends past the dealer's edge, the brass bead along the felt, then the apron
    group.add(new T.Mesh(sweep(ROLL, 128, ROLL.length, {length: 0.036, core: CORE, steps: 9}, size), nature ? nature.hide : leather));
    group.add(new T.Mesh(sweep(BEAD, 128, 1, {length: 0.004, core: [0.0035, 0], steps: 3}, size), bead));
    group.add(new T.Mesh(sweep(APRON, 96, 0.6, null, size), base === 'legs' ? skirt : apron));
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); group.add(m); return m; };
    add(new T.BoxGeometry(2 * (a + rail), 0.16, 0.02), wood, 0, -0.082, -0.011);
    if (base === 'column') { add(new T.CylinderGeometry(0.16, 0.24, 0.78, 32), wood, 0, -0.55, b * 0.45); add(new T.CylinderGeometry(0.42, 0.46, 0.05, 48), brass, 0, -0.93, b * 0.45); return; }
    photographed();
    // the legs stand as far in under a larger top as under this one
    const {floor, under} = BASE, legX = BASE.legX * grown, legZ = BASE.legZ * grown, height = under - floor - 0.02, oval = (geometry: T.BufferGeometry, deep: number) => geometry.scale(1, 1, deep);
    // the grain runs up a leg, not round it: the cylinder's texture coordinates change places
    const upright = (geometry: T.BufferGeometry) => { const uv = geometry.getAttribute('uv') as T.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.9, uv.getX(i) * 1.6); return geometry; };
    // a board under the top, so that nothing looks up into the table
    const closed = new T.Shape(Array.from({length: 65}, (_, i) => new T.Vector2((a + 0.05) * Math.cos(Math.PI * i / 64), (b + 0.05) * Math.sin(Math.PI * i / 64))));
    add(new T.ShapeGeometry(closed).rotateX(Math.PI / 2), timber, 0, under + 0.004, 0);
    for (const side of [-1, 1]) {
      add(upright(oval(new T.CylinderGeometry(0.082, 0.112, height, 40), 1.9)), timber, side * legX, floor + 0.02 + height / 2, legZ); // a leg, oval in plan, wider at the floor
      add(oval(new T.CylinderGeometry(0.126, 0.134, 0.02, 40), 1.85), polished, side * legX, floor + 0.01, legZ); // its plinth
      add(new T.PlaneGeometry(0.62, 0.84).rotateX(-Math.PI / 2), shadow, side * legX, floor + 0.002, legZ).renderOrder = -1; // and its shadow on the floor
    }
    add(new T.BoxGeometry(2 * legX, 0.07, 0.05), timber, 0, floor + 0.3, legZ); // the stretcher between the legs
    // the brass foot rail on the players' side, on four short posts
    const railPath = new T.CatmullRomCurve3(Array.from({length: 33}, (_, i) => { const t = Math.PI * (0.13 + 0.74 * i / 32); return new T.Vector3((a - 0.06) * Math.cos(t), BASE.rail, (b + 0.02) * Math.sin(t)); }));
    add(new T.TubeGeometry(railPath, 96, 0.013, 12), polished, 0, 0, 0);
    for (const u of [0.02, 0.34, 0.66, 0.98]) { const p = railPath.getPoint(u); add(new T.CylinderGeometry(0.009, 0.009, BASE.rail - floor, 12), polished, p.x, (BASE.rail + floor) / 2, p.z); }
    add(new T.PlaneGeometry(3.3 * grown, 2.5 * grown).rotateX(-Math.PI / 2), shadow, 0, floor + 0.001, b * 0.42).renderOrder = -2; // the table's own shadow on the floor
  }
  // The room the table reflects and is lit by: a prefiltered map of the room that is showing, turned as that room is, or null
  // for the room painted for the table. Only the photographed surfaces ask for it. `lights`: the lit materials and how much of
  // the room each takes; the materials of the surfaces "natur" join them when they are made, in the room that is showing then.
  const lights: [T.MeshStandardMaterial, number][] = [[cloth, 0.6], [leather, 3], [bead, 1.1], [apron, 1.5], [skirt, 1.6], [timber, 1.1], [polished, 1.5]];
  let env: {map: T.Texture | null; turn: number; strength: number} = {map: null, turn: 0, strength: 1};
  // `light`: what that room throws on a level table as it is shown (lightFromAbove times its exposure), for the cloth of a surface "duk".
  function setEnvironment(map: T.Texture | null, turn = 0, strength = 1, light?: number) {
    env = {map, turn, strength}; dukFelt.color.setScalar(map && light !== undefined ? dukLevel(light * strength) : 1);
    for (const [material, own] of lights) {
      material.envMap = map ?? room; material.envMapRotation.set(0, map ? turn : 0, 0); material.envMapIntensity = map ? own * strength : own; material.needsUpdate = true; }
  }
  // The lamp's strength, 0 to 1 (LAMP). It hangs in world coordinates where the table puts it (the table's place and scale), and
  // its light where the dealer's hands rest is the reference the rest of the table is measured against.
  function setLamp(strength: number) {
    lampStrength = Math.max(0, Math.min(1, strength || 0)); const z = group.position.z, kk = group.scale.x;
    lamp.lampAt.value.set(LAMP.x * kk, LAMP.y * kk, z + LAMP.s * kk); lamp.lampOn.value = lampStrength;
    lamp.lampRef.value = 1 / Math.max(1e-9, lampIrradiance([0, 0, z], lamp.lampAt.value.toArray(), LAMP_AXIS, lamp.lampCone.value));
  }
  return {group, draw, build, setEnvironment, setLamp};
}
