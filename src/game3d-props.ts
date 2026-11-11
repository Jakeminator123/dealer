// Jakob's table props in the 3D scene: models made in Meshy, thinned and sized by tools/prop-glb.ts (data/props.json),
// read here as GLB and laid on the table as props of the scene ({group, build(edgeZ, scale)}, dealer metres).
//
// The chip tray lies sunk into the felt at the dealer's edge, where the film's hands rest: its highest point is level with
// the felt, so the hands lie on it and nothing of it stands in front of them. It brings its own notch in the felt, and the
// scene's built tray steps aside. The models are in metres with their origin under them and +Z toward the players.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

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
