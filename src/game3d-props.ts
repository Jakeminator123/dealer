// Jakob's table props in the 3D scene: models made in Meshy, thinned and sized by tools/prop-glb.ts (data/props.json),
// read here as GLB and laid on the table as props of the scene ({group, build(edgeZ, scale)}, dealer metres).
//
// The chip tray lies sunk into the felt at the dealer's edge, where the film's hands rest: its highest point is level with
// the felt, so the hands lie on it and nothing of it stands in front of them. It brings its own notch in the felt, and the
// scene's built tray steps aside. The models are in metres with their origin under them and +Z toward the players.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {roomReflection} from './scene3d-table.ts';

// Where the tray lies: centred where the built tray was (x across the table), from the dealer's edge toward the players.
// The model is as wide as the built tray but twice as deep (0.215 m), which would put it under the dealer's own cards. So
// its rows are pressed together along their length to this depth: the tubes keep their round section, the chips in them
// become thinner. margin is the gap to the felt.
export const TRAY_PLACE = {x: -0.03, width: 0.54, depth: 0.105, margin: 0.003};
/** The notch in the felt for a tray of that size: a little wider than the tray on every side but the dealer's. */
export const trayNotch = (place = TRAY_PLACE) => ({x0: place.x - place.width / 2 - place.margin, x1: place.x + place.width / 2 + place.margin, s1: place.depth + place.margin});

type Scene = {lit<M extends T.Material>(material: M): M};
async function load(url: string, scene: Scene): Promise<{object: T.Object3D; size: T.Vector3}> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.traverse(node => { const mesh = node as T.Mesh; if (!mesh.isMesh) return; const material = mesh.material as T.MeshStandardMaterial; material.side = T.FrontSide; mesh.material = scene.lit(material); });
  return {object: gltf.scene, size: new T.Box3().setFromObject(gltf.scene).getSize(new T.Vector3())};
}

/** The chip tray as a prop of the scene. Rejects when the model is not there (assets/props/tray.glb is local media). */
export async function loadTray(scene: Scene, url = 'assets/props/tray.glb') {
  const {object, size} = await load(url, scene), group = new T.Group(), place = {...TRAY_PLACE, width: size.x};
  // Sunk so that its highest point (the tops of the chips) is level with the felt, and set against the dealer's edge.
  object.scale.set(1, 1, place.depth / size.z); object.position.set(place.x, -size.y + 0.0004, place.depth / 2);
  group.add(object);
  return {group, notch: trayNotch(place), build(edgeZ: number, scale: number) { group.position.set(0, 0, edgeZ); group.scale.setScalar(scale); }};
}

// The film's own shoe in the standard frame, film pixels: the box that holds it (with room for its shadow), and three corners of
// its foot on the felt: the near long side from its rear to its front, and the far front corner. Measured in the rest film.
// How the model is shown in the scene: how strongly the room is mirrored in it, its roughness at most, and how much its colour is lifted.
export const SHOE_LOOK = {room: 2.4, roughness: 0.42, lift: 2.2};
export const FILM_SHOE = {box: [1192, 635, 1764, 960], rear: [1687, 829], front: [1287, 893], far: [1193, 876]};
/**
 * How the shoe model stands on the felt so that its foot covers the film shoe's: `rear`, `front` and `far` are those three
 * corners as points on the felt (x across, z along; any one unit). The model is `width` wide and `length` long in its own
 * metres, its origin under its middle, its mouth toward +Z. Returns the place of its middle, its turn about the upright axis
 * and its size, in the points' unit.
 */
export function shoeFit(rear: number[], front: number[], far: number[], width: number, length: number): {x: number; z: number; yaw: number; scale: number} {
  const dx = front[0] - rear[0], dz = front[1] - rear[1], long = Math.hypot(dx, dz) || 1, ux = dx / long, uz = dz / long, scale = long / length;
  // across the shoe, toward its far side: what is left of front -> far once its part along the shoe is taken away
  const ax = far[0] - front[0], az = far[1] - front[1], along = ax * ux + az * uz, nx = ax - along * ux, nz = az - along * uz, n = Math.hypot(nx, nz) || 1;
  return {x: (rear[0] + front[0]) / 2 + nx / n * width * scale / 2, z: (rear[1] + front[1]) / 2 + nz / n * width * scale / 2, yaw: Math.atan2(ux, uz), scale};
}
/** The shoe as a prop of the scene, standing where the film's shoe stands. `at`: the three corners of the film shoe's foot as scene points on the felt. Rejects when the model is not there (assets/props/shoe.glb is local media). */
export async function loadShoe(scene: Scene, at: {rear: number[]; front: number[]; far: number[]}, url = 'assets/props/shoe.glb') {
  const {object, size} = await load(url, scene), group = new T.Group(), room = roomReflection();
  // The model's black is nearly without light of its own under the scene's lamps, where the film's shoe shows its faces in a soft
  // sheen: the room is mirrored in it as in the rail's brass, and its colour is lifted to the film shoe's dark grey.
  object.traverse(node => { const mesh = node as T.Mesh; if (!mesh.isMesh) return; const material = mesh.material as T.MeshStandardMaterial;
    material.envMap = room; material.envMapIntensity = SHOE_LOOK.room; material.roughness = Math.min(material.roughness, SHOE_LOOK.roughness); material.color.multiplyScalar(SHOE_LOOK.lift); material.needsUpdate = true; });
  // its shadow on the felt: darkest under it, fading out a little beyond its foot
  const blot = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!, fill = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    fill.addColorStop(0, 'rgba(0,0,0,.62)'); fill.addColorStop(0.62, 'rgba(0,0,0,.5)'); fill.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fill; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
  const shadow = new T.Mesh(new T.PlaneGeometry(size.x * 1.7, size.z * 1.28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: blot, transparent: true, depthWrite: false})); shadow.renderOrder = -1;
  group.add(shadow, object);
  return {group, build(edgeZ: number, scale: number) { group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
    const local = (p: number[]) => [p[0] / scale, (p[2] - edgeZ) / scale], fit = shoeFit(local(at.rear), local(at.front), local(at.far), size.x, size.z);
    object.position.set(fit.x, 0.0005, fit.z); object.rotation.set(0, fit.yaw, 0); object.scale.setScalar(fit.scale);
    shadow.position.set(fit.x, 0.0003, fit.z); shadow.rotation.set(0, fit.yaw, 0); shadow.scale.setScalar(fit.scale); }};
}
