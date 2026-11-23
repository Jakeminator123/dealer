// The doll lab's stage (dealer3d/page/docka.ts): the room, table, shoe, card and doll of dealer3d/src/stage.ts, drawn
// through a camera of the lab's own that the mouse turns, with the motion exchanged while the page is open and the joints
// marked. Nothing of the doll or the room is drawn here: that is the stage's; this file adds the camera, the marks on the
// joints and the place that is lit.
//
// What it borrows of the stage that the stage does not hand out, all of it in createLabStage's first lines and nowhere
// else: the scene (taken as the stage adds its first light to it), the renderer (taken at one drawing of the stage's own),
// and one `read` whose frames are exchanged in place (the stage reads them at every setTime; it is made with a frame
// count that never ends, since the stage fixes its duration when it is made). Wanted of dealer3d/src/stage.ts, so that
// these three go: createStage hands out `scene` and `renderer`, draws through a camera it is given, and takes a new read.
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createStage, type Read} from '../src/stage.ts';
import {FILM, fovYDeg, type Eye, type Vec3} from '../src/camera.ts';
import {dealerEdge, seatEye, spots, type Plan} from '../src/world.ts';
import {standing} from '../src/body.ts';
import {FINGERS} from '../src/capture.ts';
import type {Doll} from '../src/doll.ts';

export type ViewName = 'film' | 'side' | 'above' | 'player' | 'card';
type Frame = Read['frames'][number];
const v3 = (p: number[]) => new T.Vector3(p[0], p[1], p[2]), UP = new T.Vector3(0, 1, 0);
const mix = (a: number[], b: number[], k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
// The marks: her right arm and hand warm, her left cool, the hands brighter than the arms, the trunk faint.
const MARK = {right: {arm: 0xd98a2b, hand: 0xffd23f}, left: {arm: 0x2b8fd9, hand: 0x4de3ff}, trunk: 0x9aa39d};

/** The joints as balls with bones between, drawn over everything (no depth test), in metres of the room. */
function marks() {
  const group = new T.Group(); group.visible = false; group.renderOrder = 10;
  const paint = (colour: number) => new T.MeshBasicMaterial({color: colour, depthTest: false, depthWrite: false, transparent: true});
  const dot = (m: T.Material, r: number) => { const b = new T.Mesh(new T.SphereGeometry(r, 14, 10), m); b.renderOrder = 11; group.add(b); return b; };
  const bone = (m: T.Material, r: number) => { const c = new T.Mesh(new T.CylinderGeometry(r, r, 1, 8), m); c.renderOrder = 10; group.add(c);
    return (a: number[], b: number[]) => { const p = v3(a), d = v3(b).sub(p), l = d.length() || 1e-6; c.position.copy(p).addScaledVector(d, 0.5); c.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); c.scale.set(1, l, 1); }; };
  const pairs: [number, number][] = []; for (const c of FINGERS) { pairs.push([0, c[0]]); for (let k = 0; k < 3; k++) pairs.push([c[k], c[k + 1]]); } for (const [a, b] of [[5, 9], [9, 13], [13, 17]]) pairs.push([a, b]);
  const side = (c: {arm: number; hand: number}) => { const arm = paint(c.arm), hand = paint(c.hand);
    return {upper: bone(arm, 0.0035), fore: bone(arm, 0.0035), joints: [dot(arm, 0.011), dot(arm, 0.011), dot(hand, 0.008)], bones: pairs.map(() => bone(hand, 0.0016)), points: Array.from({length: 21}, (_, i) => i ? dot(hand, 0.0036) : null)}; };
  const R = side(MARK.right), L = side(MARK.left), faint = paint(MARK.trunk), across = bone(faint, 0.0025), spine = bone(faint, 0.0025), hipDot = dot(faint, 0.009);
  const limb = (s: typeof R, a: {s: number[]; e: number[]; w: number[]; p: number[][]}) => { s.upper(a.s, a.e); s.fore(a.e, a.w); [a.s, a.e, a.w].forEach((p, i) => s.joints[i].position.copy(v3(p)));
    pairs.forEach(([i, j], k) => s.bones[k](a.p[i], a.p[j])); s.points.forEach((b, i) => b?.position.copy(v3(a.p[i]))); };
  return {group, set(a: Frame, b: Frame, k: number, hip: number[]) {
    const at = (x: Frame['L'], y: Frame['L']) => ({s: mix(x.s, y.s, k), e: mix(x.e, y.e, k), w: mix(x.w, y.w, k), p: x.p.map((p, i) => mix(p, y.p[i], k))}), r = at(a.R, b.R), l = at(a.L, b.L);
    limb(R, r); limb(L, l); across(r.s, l.s); spine(hip, mix(r.s, l.s, 0.5)); hipDot.position.copy(v3(hip)); }};
}

/**
 * The stage for `doll`, showing `first` until another motion is set. One canvas has one stage: for another doll make a
 * new canvas and a new stage, and dispose of this one. The canvas keeps the film's shape (1764 : 1174), so that the
 * film's view is the film's picture.
 */
export function createLabStage(canvas: HTMLCanvasElement, plan: Plan, doll: Doll, first: Read) {
  // The stage, with its scene taken as it is filled, and a read that is exchanged in place.
  const read: Read = {...first, laid: [], frameCount: 1e9}; let found: T.Scene | null = null;
  Object.defineProperty(T.Scene.prototype, 'add', {configurable: true, writable: true, value(this: T.Scene, ...objects: T.Object3D[]) { found = this; return T.Object3D.prototype.add.apply(this, objects); }});
  let stage: ReturnType<typeof createStage>;
  try { stage = createStage(canvas, plan, {look: 'room', target: 'P4.C1', read, doll}); } finally { delete (T.Scene.prototype as unknown as {add?: unknown}).add; }
  const scene = found as T.Scene | null; if (!scene) throw Error('The stage made no scene.');
  let taken: T.WebGLRenderer | null = null; const before = scene.onBeforeRender; scene.onBeforeRender = r => { taken = r; }; stage.render(['film']); scene.onBeforeRender = before;
  const renderer = taken as T.WebGLRenderer | null; if (!renderer) throw Error('The stage drew with no renderer.');
  read.frameCount = first.frameCount;

  const lens = stage.lens, all = spots(plan, lens), edge = dealerEdge(lens), body = standing(lens, doll), film = stage.eyeOf('film');
  const outlines = scene.children.filter(o => (o as T.LineLoop).isLineLoop) as T.LineLoop[]; // the plan's places, in the order of `all` (stage.ts, look 'room')
  const joints = marks(); scene.add(joints.group);
  const camera = new T.PerspectiveCamera(fovYDeg(film.focalPx), FILM.width / FILM.height, 0.2, 30), controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minDistance = 0.25; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.52; controls.zoomSpeed = 1.2; controls.rotateSpeed = 0.9;
  let target = 'P4.C1', now = 0, dirty = true, follow: Vec3 | null = null; controls.addEventListener('change', () => { dirty = true; });
  /** The two frames the time stands between, and how far from the first. */
  const between = () => { const at = Math.min(read.frameCount - 1, now * read.fps), i = Math.min(read.frameCount - 2, Math.floor(at)); return {a: read.frames[i], b: read.frames[i + 1], k: at - i}; };
  const cardNow = (): Vec3 => { const {a, b, k} = between(); return mix(a.card.c, b.card.c, k); };

  /** An eye as the camera's place, turning about the point of its line of sight that is nearest `about`: the picture is the eye's own until the mouse moves it. */
  function through(eye: Eye, about: Vec3) {
    const p = v3(eye.position), f = v3(eye.forward).normalize(), along = Math.max(0.3, v3(about).sub(p).dot(f));
    camera.fov = fovYDeg(eye.focalPx); camera.up.copy(UP); camera.position.copy(p); controls.target.copy(p).addScaledVector(f, along); camera.updateProjectionMatrix(); controls.update(); dirty = true;
  }
  const chest: Vec3 = mix(mix(body.shoulders[0], body.shoulders[1], 0.5), body.hip, 0.3), table: Vec3 = [edge[0], 0.12, edge[2] + 0.22];
  const seatOf = () => { const m = /^P([1-7])\./.exec(target); return m ? Number(m[1]) : 4; };
  function view(name: ViewName) {
    follow = null;
    // Filmens kamera: the bank's own (stage.ts cameraOf: its place, its line of sight, its lens, the film's shape).
    if (name === 'film') through(film, chest);
    // From her right side, where the hand that lays the card is nearest; level with her arms.
    else if (name === 'side') through({position: [table[0] - 2.1, 0.5, table[2]], forward: [2.1, -0.38, 0], focalPx: film.focalPx}, table);
    // Straight down on the table, the dealer at the top as in the film (a hair off the plumb line, which has no up).
    else if (name === 'above') through({position: [edge[0], 2.5, edge[2] + 0.16], forward: [0, -2.5, -0.04], focalPx: film.focalPx}, [edge[0], 0, edge[2] + 0.12]);
    // The eye of the seat the card is laid at (world.ts seatEye); for the dealer's own cards seat 4's.
    else if (name === 'player') { const eye = seatEye(seatOf(), plan, lens), at = all.find(s => s.id === target)?.at ?? table; through(eye, at); }
    // Close on the card, along the film's line of sight to it; the view then goes with the card (setTime), so the hand that holds it stays in the picture.
    else { const c = cardNow(), f = v3(c).sub(v3(film.position)).normalize(); through({position: v3(c).addScaledVector(f, -0.5).toArray() as Vec3, forward: f.toArray() as Vec3, focalPx: film.focalPx}, c); follow = c; }
  }

  function setTime(t: number) {
    const last = (read.frameCount - 1) / read.fps; now = Math.max(0, Math.min(last, t)); stage.setTime(now);
    const {a, b, k} = between(); if (joints.group.visible) joints.set(a, b, k, read.hip);
    if (follow) { const c = mix(a.card.c, b.card.c, k), moved = v3(c).sub(v3(follow)); camera.position.add(moved); controls.target.add(moved); controls.update(); follow = c; }
    dirty = true;
  }
  function draw() {
    const W = canvas.width, H = canvas.height; // the camera keeps the film's shape, as the canvas does: the film's view is the film's picture whatever the size
    renderer!.setViewport(0, 0, W, H); renderer!.setScissor(0, 0, W, H); renderer!.setClearColor(0x0b0d0f, 1); renderer!.clear(); renderer!.render(scene!, camera); dirty = false;
  }
  const mark = () => outlines.forEach((o, i) => { const m = o.material as T.LineBasicMaterial; m.opacity = all[i]?.id === target ? 1 : 0.3; });
  mark(); view('film'); setTime(0);
  return {
    lens, doll,
    /** Another motion in the same room (at least two frames, as the stage mixes between two); the time goes to its start. */
    setMotion(motion: Read) { if (motion.frameCount < 2 || motion.frames.length !== motion.frameCount) throw Error('A motion needs two frames or more.');
      Object.assign(read, {frames: motion.frames, fps: motion.fps, frameCount: motion.frameCount, hip: motion.hip}); (stage.moments as {lands: number}).lands = motion.rests / motion.fps; setTime(0); },
    duration: () => (read.frameCount - 1) / read.fps, time: () => now, setTime,
    /** The place that is lit, and whose seat "Från spelaren" looks from. */
    setTarget(id: string) { target = id; mark(); dirty = true; },
    view,
    setJoints(on: boolean) { joints.group.visible = on; setTime(now); },
    /** Call when the canvas has got a new size in pixels. */
    resized() { dirty = true; },
    needsDraw: () => dirty, draw,
    /** Where a point of the room is in the picture now, in CSS pixels of the canvas; for a test that looks at the picture. */
    seen(p: number[]) { const q = v3(p).project(camera), box = canvas.getBoundingClientRect(); return {x: (q.x + 1) / 2 * box.width, y: (1 - q.y) / 2 * box.height}; },
    camera: () => ({position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov}),
    dispose() { controls.dispose(); renderer!.dispose(); renderer!.forceContextLoss(); },
  };
}
export type LabStage = ReturnType<typeof createLabStage>;
