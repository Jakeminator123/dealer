// A rigged model of the dealer (a GLB with a skeleton, as Meshy rigs one) seated at the table and posed from the same
// joints the white figure is drawn from. For looking at how such a model sits in the scene, not for a reference film.
// The model's bones are found by the names Meshy gives them. It has no finger bones: its hands are aimed and turned as a
// whole, and its fingers stay as they were modelled, so it never holds the card. Loaded only when the page asks for it
// (?model=1). It is made as large as its arm needs to be to equal the figure's (BODY.upperArm + BODY.forearm), so that
// its wrists come to the figure's wrists: Jakob's first model becomes 1.10 of its own size.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {Vec3} from './camera.ts';
import {BODY} from './body.ts';

/** What the model is posed from, in the scene's metres: her right then her left for shoulders, arms and hands; `looks` is the way her head faces. */
export type FigurePose = {hip: Vec3; shoulders: [Vec3, Vec3]; arms: {shoulder: Vec3; elbow: Vec3; wrist: Vec3}[]; hands: ({forward: Vec3; palm: Vec3} | null)[]; looks: Vec3};
/** `measure`: the arms as last posed, degrees, her right then her left: how far the upper arm was rolled to set the elbow's hinge, how far the elbow is bent, how far the hand stands off the forearm's line, and how far the figure's hand asked it to. */
export type Figure = {root: T.Group; scale: number; triangles: number; about: Record<string, unknown>; pose(p: FigurePose): void; measure(): {roll: number[]; elbow: number[]; wrist: number[]; wristAsked: number[]}};
const WRIST = 50 * Math.PI / 180;
const SIDES = ['Right', 'Left'] as const, v = (p: Vec3) => new T.Vector3(p[0], p[1], p[2]), round = (p: T.Vector3) => [p.x, p.y, p.z].map(n => Math.round(n * 1000) / 1000);

/** The three axes of a cloud of points, longest first (the eigenvectors of its covariance, by Jacobi turns). */
function axes(points: T.Vector3[]): {centre: T.Vector3; axes: T.Vector3[]} {
  const c = points.reduce((s, p) => s.add(p), new T.Vector3()).multiplyScalar(1 / points.length), a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], e = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const p of points) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a[i][j] += d[i] * d[j]; }
  for (let sweep = 0; sweep < 24; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) { if (Math.abs(a[p][q]) < 1e-18) continue;
    const t = (a[q][q] - a[p][p]) / (2 * a[p][q]), tan = Math.sign(t || 1) / (Math.abs(t) + Math.sqrt(t * t + 1)), cos = 1 / Math.sqrt(tan * tan + 1), sin = tan * cos;
    for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = cos * x - sin * y; a[k][q] = sin * x + cos * y; }
    for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = cos * x - sin * y; a[q][k] = sin * x + cos * y; }
    for (let k = 0; k < 3; k++) { const x = e[k][p], y = e[k][q]; e[k][p] = cos * x - sin * y; e[k][q] = sin * x + cos * y; } }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {centre: c, axes: order.map(i => new T.Vector3(e[0][i], e[1][i], e[2][i]).normalize())};
}

export async function loadFigure(url: string): Promise<Figure> {
  const gltf = await new GLTFLoader().loadAsync(url), root = new T.Group(); root.add(gltf.scene); root.updateMatrixWorld(true);
  const bone = (name: string) => { const b = gltf.scene.getObjectByName(name); if (!b) throw Error(`The model has no bone ${name}.`); return b; };
  let skinned: T.SkinnedMesh | null = null, triangles = 0;
  gltf.scene.traverse(o => { const m = o as T.SkinnedMesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; if (m.isSkinnedMesh) skinned = m; } });
  if (!skinned) throw Error('The model has no skinned mesh.'); const mesh = skinned as T.SkinnedMesh;
  const at = (o: T.Object3D) => o.getWorldPosition(new T.Vector3());
  const arms = SIDES.map(s => ({upper: bone(`${s}Arm`), fore: bone(`${s}ForeArm`), hand: bone(`${s}Hand`), thigh: bone(`${s}UpLeg`), shin: bone(`${s}Leg`), foot: bone(`${s}Foot`)}));
  const neck = bone('neck'), head = bone('Head'), front = bone('headfront'), posed = [...arms.flatMap(a => [a.upper, a.fore, a.hand, a.thigh, a.shin]), neck, head], bind = new Map(posed.map(b => [b, b.quaternion.clone()]));
  // As she was modelled: the middle between her shoulder joints, the lengths of her arm bones, and each hand's own forward
  // and palm directions, read off the vertices that hang on the hand bone (their long axis and their flat one), kept in the
  // hand bone's own frame. Which way along the flat axis the palm is, the thumb tells: it is the side the hand's width
  // leans to (the long tail of the vertices across the hand), and a right hand's palm is thumb x forward, a left hand's
  // forward x thumb. (Where the fingertips curl to, and which side faces the body, were tried first: each gave one palm
  // turned up on Jakob's model, whose two hands are not modelled as each other's mirror.)
  const middle = at(arms[0].upper).add(at(arms[1].upper)).multiplyScalar(0.5), lengths = arms.map(a => [at(a.upper).distanceTo(at(a.fore)), at(a.fore).distanceTo(at(a.hand))]);
  const scale = (BODY.upperArm + BODY.forearm) / (lengths[1][0] + lengths[1][1]), position = mesh.geometry.attributes.position, index = mesh.geometry.attributes.skinIndex, weight = mesh.geometry.attributes.skinWeight, about: Record<string, unknown> = {};
  const handAxes = arms.map((a, side) => { const which = mesh.skeleton.bones.indexOf(a.hand as T.Bone), cloud: T.Vector3[] = [];
    for (let i = 0; i < position.count; i++) for (let k = 0; k < 4; k++) if (index.getComponent(i, k) === which && weight.getComponent(i, k) > 0.6) cloud.push(mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld));
    const wrist = at(a.hand), along = at(a.hand).sub(at(a.fore)).normalize(), toLocal = a.hand.getWorldQuaternion(new T.Quaternion()).invert();
    if (cloud.length < 50) { about[`${SIDES[side]}Hand`] = `only ${cloud.length} vertices hang on the hand bone; its directions are guessed`; return {forward: along.clone().applyQuaternion(toLocal), palm: new T.Vector3(wrist.x > 0 ? -0.7 : 0.7, -0.7, 0).applyQuaternion(toLocal), long: 0.17}; }
    const whole = axes(cloud), forward = whole.axes[0].clone(); if (forward.dot(along) < 0) forward.negate();
    const reach = cloud.map(p => p.clone().sub(wrist).dot(forward)), far = Math.max(...reach), flat = axes(cloud.filter((_, i) => reach[i] < far * 0.55)); // the palm without the fingers
    const palm = flat.axes[2].clone(); palm.sub(forward.clone().multiplyScalar(palm.dot(forward))).normalize();
    const across = new T.Vector3().crossVectors(palm, forward).normalize(), widths = cloud.map(p => p.clone().sub(whole.centre).dot(across)), mean = widths.reduce((s, n) => s + n, 0) / widths.length, skew = widths.reduce((s, n) => s + (n - mean) ** 3, 0) / widths.length;
    const thumb = across.clone().multiplyScalar(Math.sign(skew) || 1); palm.copy(side ? new T.Vector3().crossVectors(forward, thumb) : new T.Vector3().crossVectors(thumb, forward)).normalize();
    about[`${SIDES[side]}Hand`] = {vertices: cloud.length, long: Math.round(far * 1000) / 1000, forward: round(forward), thumb: round(thumb), palm: round(palm)};
    return {forward: forward.applyQuaternion(toLocal), palm: palm.applyQuaternion(toLocal), long: far}; });
  // Her elbow's hinge, as she was modelled: an arm held out bends forward, so the hinge is square to the arm and to the
  // way she faces. Kept in the upper arm's own frame, so that it can be asked for in any pose.
  const facing = at(front).sub(at(head)).normalize(), hinges = arms.map(a => new T.Vector3().crossVectors(at(a.fore).sub(at(a.upper)), facing).normalize().applyQuaternion(a.upper.getWorldQuaternion(new T.Quaternion()).invert()));
  const last = {roll: [0, 0], elbow: [0, 0], wrist: [0, 0], wristAsked: [0, 0]}, degrees = (n: number) => Math.round(n * 1800 / Math.PI) / 10;
  root.scale.setScalar(scale); about.arm = lengths.map(l => l.map(n => Math.round(n * 1000) / 1000)); about.shouldersApart = Math.round(at(arms[0].upper).distanceTo(at(arms[1].upper)) * 1000) / 1000;

  const worldQ = new T.Quaternion(), parentQ = new T.Quaternion(), turn = new T.Quaternion();
  /** Turns a bone by `q`, a turn in the world, keeping its place. */
  const turned = (b: T.Object3D, q: T.Quaternion) => { b.getWorldQuaternion(worldQ).premultiply(q); b.parent!.getWorldQuaternion(parentQ); b.quaternion.copy(parentQ.invert().multiply(worldQ)); b.updateMatrixWorld(true); };
  /** Turns a bone the shortest way that brings the direction `from` (in the world, as it is now) to lie along `to`. */
  const swing = (b: T.Object3D, from: T.Vector3, to: T.Vector3) => turned(b, turn.setFromUnitVectors(from.clone().normalize(), to.clone().normalize()));
  const aimAt = (b: T.Object3D, tip: T.Object3D, target: T.Vector3) => swing(b, at(tip).sub(at(b)), target.clone().sub(at(b)));
  const flatten = (n: T.Vector3, axis: T.Vector3) => n.clone().sub(axis.clone().multiplyScalar(n.dot(axis))).normalize();
  function pose(p: FigurePose) {
    for (const [b, q] of bind) b.quaternion.copy(q);
    // Her trunk as one piece: across her shoulders, up from her hip, and the third way square to both; her shoulders' middle on the figure's.
    const mid = v(p.shoulders[0]).add(v(p.shoulders[1])).multiplyScalar(0.5), x = v(p.shoulders[1]).sub(v(p.shoulders[0])).normalize(), up = mid.clone().sub(v(p.hip)).normalize(), z = new T.Vector3().crossVectors(x, up).normalize(), y = new T.Vector3().crossVectors(z, x);
    root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z)); root.position.copy(mid).sub(middle.clone().multiplyScalar(scale).applyQuaternion(root.quaternion)); root.updateMatrixWorld(true);
    arms.forEach((a, i) => {
      // Seated on a high stool: thighs forward under the table, shins down.
      swing(a.thigh, at(a.shin).sub(at(a.thigh)), new T.Vector3(i ? 0.12 : -0.12, -0.08, 1)); swing(a.shin, at(a.foot).sub(at(a.shin)), new T.Vector3(0, -1, 0.08));
      // Her arm: from her own shoulder to the figure's wrist, her own bone lengths, the elbow out the way the figure's elbow is.
      const s = at(a.upper), w = v(p.arms[i].wrist), l1 = lengths[i][0] * scale, l2 = lengths[i][1] * scale, far = Math.min(l1 + l2 - 0.002, Math.max(Math.abs(l1 - l2) + 0.002, s.distanceTo(w)));
      // The side her elbow is on is the figure's own: the figure's elbow off the figure's own line from shoulder to wrist.
      // (Taken from her shoulder, as it was first, a nearly straight arm got its elbow from the few centimetres her
      // shoulders are broader than the figure's, and the arm bent to a side no arm bends to.)
      const own = v(p.arms[i].wrist).sub(v(p.arms[i].shoulder)).normalize(), side = flatten(v(p.arms[i].elbow).sub(v(p.arms[i].shoulder)), own);
      const dir = w.clone().sub(s).normalize(), along = (l1 * l1 - l2 * l2 + far * far) / (2 * far), out = flatten(side, dir), elbow = s.clone().addScaledVector(dir, along).addScaledVector(out, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
      aimAt(a.upper, a.fore, elbow);
      // An elbow is a hinge. Aiming the upper arm the shortest way leaves it rolled about its own length any which way, and
      // the forearm then bends sideways out of the elbow (Jakob, 2026-11-18: "ur led"). So the upper arm is rolled until
      // the hinge she was modelled with stands square to the plane this arm bends in.
      const upper = elbow.clone().sub(s).normalize(), fore = w.clone().sub(elbow).normalize(), bend = new T.Vector3().crossVectors(upper, fore); last.roll[i] = 0;
      if (bend.length() > 0.02) { const has = flatten(hinges[i].clone().applyQuaternion(a.upper.getWorldQuaternion(new T.Quaternion())), upper), want = flatten(bend, upper), roll = Math.atan2(new T.Vector3().crossVectors(has, want).dot(upper), has.dot(want));
        turned(a.upper, turn.setFromAxisAngle(upper, roll)); last.roll[i] = degrees(roll); }
      aimAt(a.fore, a.hand, w); last.elbow[i] = degrees(upper.angleTo(fore));
      const hand = p.hands[i]; if (!hand) return;
      // Her hand: along the figure's hand, then turned about its own length until its palm looks where the figure's palm
      // looks. Half of that turn is given to the forearm, as a forearm turns with its hand, and the hand is laid again.
      // Her fingers are stiff, so a hand aimed down at the table would go through it: its tips stay a finger's thickness over the felt (y = 0).
      const forward = v(hand.forward).normalize(), reach = handAxes[i].long * scale, clear = 0.012, asked = fore.angleTo(forward); last.wristAsked[i] = degrees(asked);
      // Her forearm is not the figure's (her shoulders are broader and her bones her own), so the figure's hand can stand
      // farther off her forearm's line than a wrist bends: it is brought back to 50 degrees off it.
      if (asked > WRIST) { const part = new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(fore, forward), WRIST / asked); forward.copy(fore).applyQuaternion(part).normalize(); }
      if (w.y > clear && w.y + forward.y * reach < clear) { forward.y = (clear - w.y) / reach; const k = Math.sqrt(Math.max(0, 1 - forward.y * forward.y)) / (Math.hypot(forward.x, forward.z) || 1); forward.x *= k; forward.z *= k; }
      const want = flatten(v(hand.palm), forward), lay = () => { swing(a.hand, handAxes[i].forward.clone().applyQuaternion(a.hand.getWorldQuaternion(new T.Quaternion())), forward);
        return flatten(handAxes[i].palm.clone().applyQuaternion(a.hand.getWorldQuaternion(new T.Quaternion())), forward); };
      const now = lay(), angle = Math.atan2(new T.Vector3().crossVectors(now, want).dot(forward), now.dot(want)), axis = at(a.hand).sub(at(a.fore)).normalize();
      turned(a.fore, turn.setFromAxisAngle(axis, angle * 0.5 * Math.max(0, axis.dot(forward)))); swing(a.hand, lay(), want);
      last.wrist[i] = degrees(at(a.hand).sub(at(a.fore)).angleTo(handAxes[i].forward.clone().applyQuaternion(a.hand.getWorldQuaternion(new T.Quaternion()))));
    });
    // Her head goes two thirds of the way toward where the figure's head faces, at most 40 degrees (the eyes do the rest, and
    // a head bowed farther hides her face under her hair); her neck takes the first part of it.
    const ahead = at(front).sub(at(head)).normalize(), toward = v(p.looks).normalize(), angle = ahead.angleTo(toward), share = Math.min(0.7, angle * 0.66) / (angle || 1), whole = new T.Quaternion().setFromUnitVectors(ahead, toward);
    const part = (k: number) => ahead.clone().applyQuaternion(new T.Quaternion().slerp(whole, k));
    swing(neck, ahead, part(share * 0.4)); swing(head, at(front).sub(at(head)), part(share));
  }
  return {root, scale, triangles: Math.round(triangles), about, pose, measure: () => JSON.parse(JSON.stringify(last))};
}
