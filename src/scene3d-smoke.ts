// Low smoke over the table (key smoke, 0 to 1; 0 is nothing at all): a haze that lies a few centimetres above the felt and drifts,
// thickest round the rim and over the rail and thin in the middle, where the cards are read. Jakob 2026-11-13: "en låg rök ligger
// runt bordet som man kan lägga till om man vill", like the dust. It is the same sort of thing as the dust (something in the air,
// moved by the clock alone) in another form: three sheets one above the other, each a slow cloud pattern that curls and slides its
// own way, so the smoke has depth when the camera leans. Drawn after the film, over the felt in front of the dealer's edge only:
// her hands lie in it as hands on a table do, and nothing of it is drawn across her body. Sizes are dealer metres on the table as
// src/scene3d-table.ts has them (x across, z from the dealer's edge toward the players).
import * as T from 'three';
import {TABLE, sized} from './scene3d-table.ts';

// heights of the sheets over the felt and each one's share; reach: how far past the felt's edge the smoke goes, in table halves
// (1 = the felt's edge); thin: its share in the middle of the table; drift: metres a second the pattern slides; strength: its
// opacity at amount 1 where it is thickest.
export const SMOKE = {heights: [0.012, 0.045, 0.085], shares: [1, 0.8, 0.6], reach: 1.55, thin: 0.3, drift: 0.022, strength: 0.55, edge: 0.12};
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Where the smoke may lie, 0 to 1, at a point of the table (x across, z from the dealer's edge, metres at size 1) for a table of half width a and depth b: thin in the middle, full round the rim, gone past SMOKE.reach and behind the dealer's edge. The shader's own, for the tests. */
export function smokeMask(x: number, z: number, a: number = TABLE.a, b: number = TABLE.b): number {
  const e = Math.hypot(x / a, (z - b * 0.5) / (b * 0.5 + TABLE.rail));
  return (SMOKE.thin + (1 - SMOKE.thin) * smooth(0.35, 0.95, e)) * (1 - smooth(1.15, SMOKE.reach, e)) * smooth(0, SMOKE.edge, z);
}
const VERTEX = 'varying vec2 vAt; void main(){ vAt = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const FRAGMENT = `varying vec2 vAt; uniform float time, amount, share, seed; uniform vec2 half_; uniform vec3 tint;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
float cloud(vec2 p){ float s = 0., w = .5; for (int i = 0; i < 5; i++) { s += w * noise(p); p = p * 2.03 + 11.7; w *= .5; } return s; }
void main(){
  float e = length(vec2(vAt.x / half_.x, (vAt.y - half_.y * .5) / (half_.y * .5 + ${TABLE.rail})));
  float mask = (${SMOKE.thin} + ${1 - SMOKE.thin} * smoothstep(.35, .95, e)) * (1. - smoothstep(1.15, ${SMOKE.reach}, e)) * smoothstep(0., ${SMOKE.edge}, vAt.y);
  if (mask <= 0.) discard;
  // the pattern slides slowly, each sheet its own way, and is bent by a slower pattern so that it curls instead of scrolling
  vec2 p = vAt * 2.4 + seed * 17. + time * ${SMOKE.drift} * vec2(cos(seed * 2.3), sin(seed * 2.3)) * 2.4;
  p += .55 * vec2(cloud(p * .6 + time * .013 + 3.1), cloud(p * .6 - time * .011 + 8.7)) - .27;
  float a = amount * share * ${SMOKE.strength} * mask * smoothstep(.34, .78, cloud(p));
  if (a < .003) discard;
  gl_FragColor = vec4(tint * a, a);
}`;

export function createSmoke() {
  const group = new T.Group(); group.visible = false; let built = '';
  const sheets = SMOKE.heights.map((_h, i) => new T.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: T.DoubleSide,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
    uniforms: {time: {value: 0}, amount: {value: 0}, share: {value: SMOKE.shares[i]}, seed: {value: i + 1}, half_: {value: new T.Vector2(TABLE.a, TABLE.b)}, tint: {value: new T.Vector3(1, 1, 1)}}}));
  return {
    group,
    /** Placed with the table: the same edge, scale and size. The sheets are made when they are first wanted. */
    build(edgeZ: number, scale: number, size = 1) {
      group.position.set(0, 0, edgeZ); group.scale.setScalar(scale); const {a, b} = sized(size), key = `${a}:${b}`; if (key === built) return; built = key;
      for (const child of [...group.children]) { group.remove(child); (child as T.Mesh).geometry.dispose(); }
      const wide = a * SMOKE.reach, deep = (b * 0.5 + TABLE.rail) * SMOKE.reach + b * 0.5;
      SMOKE.heights.forEach((h, i) => { const mesh = new T.Mesh(new T.PlaneGeometry(2 * wide, deep).rotateX(-Math.PI / 2).translate(0, h, deep / 2), sheets[i]); mesh.renderOrder = 7 + i * 0.1; mesh.frustumCulled = false;
        (sheets[i].uniforms.half_.value as T.Vector2).set(a, b); group.add(mesh); });
    },
    /** amount 0 to 1 (0: nothing is drawn); tint: the smoke's colour as shown, the room's light on it. */
    update(seconds: number, amount: number, tint: readonly number[]) {
      group.visible = amount > 0; if (!group.visible) return;
      for (const m of sheets) { m.uniforms.time.value = seconds % 100000; m.uniforms.amount.value = Math.min(1, amount); (m.uniforms.tint.value as T.Vector3).set(tint[0], tint[1], tint[2]); }
    },
    dispose() { for (const child of group.children) (child as T.Mesh).geometry.dispose(); for (const m of sheets) m.dispose(); },
  };
}
