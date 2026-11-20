// The page of the test "one deal, two chairs" (Beslut 3d-prov-en-giv-tva-stolar, 2026-11-20): the 3D room's own table,
// shoe, card and chairs (src/stage.ts), and in the white doll's place a figure moved by measured motion:
//   ?source=sam    SAM 3D Body's reading of a film: its body surface frame by frame (one fixed mesh, 18 439 points)
//   ?source=pack   the bought clip on the pack's own mannequin (FBX, skinned)
//   ?eyes=4,1      the views from the left (a seat 1-7; seat 4 is the bank's camera)    ?t=1.5   the moment shown, seconds
// What it plays is laid out by dealer3d/tools/prov-lay.ts (/prov/scene/<source>.json: the card per frame, the figure's
// place, the beats); the recorder dealer3d/tools/prov-shoot.ts serves it and drives window.dealer3d.setTime(seconds).
// Nothing of the pack or of SAM's output is in Git: the recorder serves them from .runtime/3d-prov/.
import * as T from 'three';
import {createStage, type View} from '../src/stage.ts';
import type {Figure} from '../src/figure-model.ts';

type SamFigure = {kind: 'sam'; verts: string; faces: string; vertices: number; readFrames: number[]; scale: number[]; eyeHeight: number; forward: number[]; up: number[]};
type PackFigure = {kind: 'pack'; character: string; clip: string; start: number; matrix: number[]};
const q = new URLSearchParams(location.search), canvas = document.getElementById('stage') as HTMLCanvasElement, source = q.get('source') === 'pack' ? 'pack' : 'sam';
const views: View[] = (q.get('eyes') ?? '4,1').split(',').map(Number).filter(v => Number.isInteger(v) && v >= 1 && v <= 7);
const [plan, scene] = await Promise.all([fetch('/placements/default.json').then(r => r.json()), fetch(`/prov/scene/${source}.json`).then(r => r.json())]);
canvas.width = innerWidth; canvas.height = innerHeight;
const skin = () => new T.MeshStandardMaterial({color: 0xb4bbc2, roughness: 0.85, metalness: 0, side: T.DoubleSide}); // one plain grey for both figures: how they look is not what is tested

/** SAM's body surface: the same points in every frame, so a frame between two read ones is the two mixed; each frame at its own scale about the camera (prov-lay.ts). */
async function samFigure(f: SamFigure) {
  const [vb, fb] = await Promise.all([fetch(f.verts).then(r => r.arrayBuffer()), fetch(f.faces).then(r => r.arrayBuffer())]), verts = new Float32Array(vb), V = f.vertices, n = f.readFrames.length, step = f.readFrames[1] - f.readFrames[0];
  if (verts.length !== n * V * 3) throw Error('The surface is not the one the scene was laid out for.');
  const geometry = new T.BufferGeometry(), at = new T.BufferAttribute(new Float32Array(V * 3), 3); at.setUsage(T.DynamicDrawUsage); geometry.setAttribute('position', at); geometry.setIndex(new T.BufferAttribute(new Uint32Array(fb), 1));
  const mesh = new T.Mesh(geometry, skin()), root = new T.Group(); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh);
  const h = f.eyeHeight, fw = f.forward, up = f.up, out = at.array as Float32Array;
  return {root, triangles: fb.byteLength / 12, setTime(t: number) {
    const a = Math.min(n - 1, t * scene.fps / step), i = Math.min(n - 2, Math.floor(a)), k = a - i, A = i * V * 3, B = A + V * 3, sa = f.scale[i] * (1 - k), sb = f.scale[i + 1] * k;
    for (let o = 0; o < V * 3; o += 3) { const x = verts[A + o] * sa + verts[B + o] * sb, y = verts[A + o + 1] * sa + verts[B + o + 1] * sb, z = verts[A + o + 2] * sa + verts[B + o + 2] * sb; // the film camera's frame: x right, y down, z into the picture
      out[o] = x; out[o + 1] = h - y * up[1] + z * fw[1]; out[o + 2] = -y * up[2] + z * fw[2]; }
    at.needsUpdate = true; geometry.computeVertexNormals(); }};
}

/** The pack's mannequin under the pack's clip, bone for bone, set into the room by one matrix (prov-lay.ts). Its pictures are not fetched: one plain colour. */
async function packFigure(f: PackFigure) {
  const {FBXLoader} = await import('three/addons/loaders/FBXLoader.js'), manager = new T.LoadingManager();
  manager.setURLModifier(url => /^(data|blob):/.test(url) || /\.fbx$/i.test(url.split('?')[0]) ? url : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  const loader = new FBXLoader(manager), [who, moves] = await Promise.all([loader.loadAsync(f.character), loader.loadAsync(f.clip)]), material = skin(); let triangles = 0;
  const strangers: T.Object3D[] = []; who.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { m.material = material; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; } else if ((o as T.Light).isLight || (o as T.Camera).isCamera) strangers.push(o); });
  for (const o of strangers) o.removeFromParent();
  const mixer = new T.AnimationMixer(who); mixer.clipAction(moves.animations[0]).play();
  const root = new T.Group(); root.matrixAutoUpdate = false; root.matrix.fromArray(f.matrix); root.add(who);
  return {root, triangles, setTime(t: number) { mixer.setTime(f.start + t); }};
}

const began = performance.now(), own = scene.figure.kind === 'pack' ? await packFigure(scene.figure) : await samFigure(scene.figure), loadMs = Math.round(performance.now() - began);
const figure = {root: own.root, scale: 1, triangles: own.triangles, about: {source}, pose() { /* the figure moves by its own measured motion, not by the doll's joints */ }, measure: () => null} as unknown as Figure;
const stage = createStage(canvas, plan, {look: 'room', target: 'P4.C1', read: scene.read, figure});
const setTime = (t: number) => { stage.setTime(t); own.setTime(stage.time()); stage.render(views); return new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))); };
await setTime(Number(q.get('t') ?? 0));
(window as unknown as {dealer3d: unknown}).dealer3d = {ready: true, source, duration: stage.duration, frameCount: scene.frameCount, fps: scene.fps, beats: scene.beats, triangles: own.triangles, loadMs, setTime};
