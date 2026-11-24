// The deal drawn with three.js: a table, a shoe, a real card with two sides, and the test figure, seen through any number
// of eyes at once. Everything shown comes from the pure modules beside this file (world, deal, body); this file only gives
// it shape and light. Two looks: 'room' (a felt table, for looking at the geometry from the seats) and 'plain' (a white
// figure and a grey table on a flat ground, for a reference film a video model can follow), and 'bare': the plain figure
// alone on nothing (a transparent picture), the table, the shoe and the cards hiding what is behind them without being
// drawn and the felt catching the figure's shadow, for a still laid over a picture of the table. The figure is a doll
// (dealer3d/src/doll.ts): options.doll, else the one a read motion names, else the standard.
import * as T from 'three';
import {CARD, FILM, filmEye, fovYDeg, orbit, type Eye, type Vec3} from './camera.ts';
import {SHOE, dealerEdge, filmLens, realCardAt, seatEye, shoeCard, shoePose, spots, type Plan} from './world.ts';
import {HAND, MOMENTS, planDeal, type CardPose} from './deal.ts';
import {restingHand, solveBody, standing, type Body} from './body.ts';
import {dollNamed, type Doll} from './doll.ts';
import {FINGERS} from './capture.ts';
import type {Figure} from './figure-model.ts';

export type Look = 'room' | 'plain' | 'bare';
type Limb = {s: number[]; e: number[]; w: number[]; k: number; p: number[][]};
/** A deal read off a film and laid into the room by dealer3d/tools/lift.ts (dealer3d/data/*.json). */
export type Read = {film: string; fps: number; frameCount: number; leavesShoe: number; edge: number[]; folds: number; rests: number; hip: number[]; laid?: {from: number; c: number[]; l: number[]; n: number[]}[]; frames: {card: {c: number[]; l: number[]; n: number[]; id?: number}; L: Limb; R: Limb; h: number[]; g?: number[]}[]; doll?: string}; // g: where she looks in that frame, if the film says (dealer3d/tools/pose-film.ts); without it her eyes follow the card. card.id and laid: a film of several cards (dealer3d/tools/deal-film.ts) says which card is in play and which lie, each from its frame
export type View = 'film' | number | {round: number}; // the bank's camera, a seat 1-7 (seat 4 is the bank's camera), or the bank's camera carried that many degrees round the dealer
const COLOUR = {
  room: {ground: 0x101214, felt: 0x1f7045, rail: 0x3a2417, wood: 0x2a1a10, figure: 0xe6e1d8, shoe: 0x1b1c1f, mark: 0xd8c27a, fog: 0x101214},
  plain: {ground: 0x767d84, felt: 0xb4b9bd, rail: 0xb4b9bd, wood: 0x9aa0a5, figure: 0xf3f1ec, shoe: 0x2a2c30, mark: 0xb4b9bd, fog: 0x767d84},
  back: 0xf4d21c, face: 0x1e8be0, edge: 0xf2efe6,
};
const v3 = (p: Vec3) => new T.Vector3(p[0], p[1], p[2]), UP = new T.Vector3(0, 1, 0);

/** A card: a thin body with rounded corners, the back on one side and the face on the other. Local x across, y out of the face, z along the long side. */
function cardMesh(): T.Group {
  const w = CARD.width / 2, h = CARD.height / 2, r = CARD.corner, shape = new T.Shape();
  shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false); shape.lineTo(w, h - r); shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h); shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false); shape.lineTo(-w, -h + r); shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  const flat = new T.ShapeGeometry(shape, 6), body = new T.ExtrudeGeometry(shape, {depth: CARD.thickness, bevelEnabled: false, curveSegments: 6}).translate(0, 0, -CARD.thickness / 2);
  // The sides glow a little of their own colour, so that yellow and blue read as the film has them whichever way the card faces the light.
  const side = (colour: number) => new T.MeshStandardMaterial({color: colour, roughness: 0.62, metalness: 0, emissive: colour, emissiveIntensity: 0.3}), g = new T.Group();
  // The shape lies in x-y; a quarter turn about x lays it down, its y along the card's long side (z). A turn, not a mirror:
  // a mirrored surface is lit on its wrong side. Each surface is double-sided, so it is lit from whichever side it is seen.
  const add = (geometry: T.BufferGeometry, material: T.MeshStandardMaterial, lift: number) => { geometry.rotateX(Math.PI / 2); geometry.translate(0, lift, 0); material.side = T.DoubleSide; const m = new T.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; g.add(m); };
  add(body, side(COLOUR.edge), 0); add(flat.clone(), side(COLOUR.face), CARD.thickness / 2 + 0.00004); add(flat.clone(), side(COLOUR.back), -CARD.thickness / 2 - 0.00004);
  g.matrixAutoUpdate = false; return g;
}
const place = (o: T.Object3D, x: Vec3, y: Vec3, z: Vec3, at: Vec3) => { o.matrix.makeBasis(v3(x), v3(y), v3(z)).setPosition(v3(at)); o.matrixWorldNeedsUpdate = true; };
const placeCard = (o: T.Object3D, c: {centre: Vec3; long: Vec3; normal: Vec3; across: Vec3}) => place(o, c.across, c.normal, c.long, c.centre);

/** A limb between two points: a unit-height cone frustum scaled along its length. */
function limb(material: T.Material, from: number, to: number) {
  const m = new T.Mesh(new T.CylinderGeometry(to, from, 1, 20), material); m.castShadow = true; m.receiveShadow = true;
  return {mesh: m, set(a: Vec3, b: Vec3) { const p = v3(a), q = v3(b), d = q.clone().sub(p), l = d.length() || 1e-6; m.position.copy(p).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); m.scale.set(1, l, 1); }};
}
const ball = (material: T.Material, radius: number) => { const m = new T.Mesh(new T.SphereGeometry(radius, 24, 16), material); m.castShadow = true; m.receiveShadow = true; return m; };

/** A hand in its own frame: origin at the wrist, z toward the fingers, y out of the palm, x to the thumb's side (`thumb` +1 or -1). */
function handMesh(material: T.Material, thumb: 1 | -1): T.Group {
  const g = new T.Group(), part = (geometry: T.BufferGeometry) => { const m = new T.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const palm = part(new T.BoxGeometry(0.074, 0.02, 0.082)); palm.position.set(0, -0.004, 0.047);
  const finger = (x: number, length: number) => { const a = new T.Vector3(x, -0.002, 0.086), b = new T.Vector3(x * 0.96, 0.003, 0.086 + length * 0.55), c = new T.Vector3(x * 0.92, 0.006, 0.086 + length);
    for (const [p, q] of [[a, b], [b, c]] as const) { const m = part(new T.CylinderGeometry(0.0072, 0.0078, 1, 12)), d = q.clone().sub(p), l = d.length(); m.position.copy(p).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); m.scale.set(1, l, 1); }
    for (const p of [a, b, c]) part(new T.SphereGeometry(0.0078, 12, 8)).position.copy(p); };
  finger(-0.027 * thumb, 0.062); finger(-0.009 * thumb, 0.078); finger(0.009 * thumb, 0.084); finger(0.027 * thumb, 0.076); // little finger to forefinger
  // The thumb comes round the card's edge and presses on its other side, opposite the finger pads at the grip.
  const t = [new T.Vector3(0.036 * thumb, 0.002, 0.03), new T.Vector3(0.04 * thumb, 0.024, 0.07), new T.Vector3(0.014 * thumb, HAND.pad + 0.011, HAND.reach - 0.004)];
  for (let i = 0; i < 2; i++) { const m = part(new T.CylinderGeometry(0.0085, 0.0095, 1, 12)), d = t[i + 1].clone().sub(t[i]), l = d.length(); m.position.copy(t[i]).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); m.scale.set(1, l, 1); }
  for (const p of t) part(new T.SphereGeometry(0.0095, 12, 8)).position.copy(p);
  g.matrixAutoUpdate = false; return g;
}

/** A hand drawn from its 21 points: a bone between each two that a hand joins, a ball at each joint, and the palm filled in. */
function pointHand(material: T.Material) {
  const g = new T.Group(), pairs: [number, number, number][] = []; // from, to, thickness
  for (const c of FINGERS) for (let k = 0; k < 3; k++) pairs.push([c[k], c[k + 1], c[0] === 1 ? 0.0088 - k * 0.0006 : 0.0078 - k * 0.0007]);
  for (const k of [1, 5, 9, 13, 17]) pairs.push([0, k, 0.0105]); for (const [a, b] of [[5, 9], [9, 13], [13, 17]]) pairs.push([a, b, 0.0098]);
  const bones = pairs.map(([, , r]) => { const l = limb(material, r, r); g.add(l.mesh); return l; }), balls = Array.from({length: 21}, (_, i) => { const b = ball(material, i === 0 ? 0.0125 : [1, 5, 9, 13, 17].includes(i) ? 0.0105 : 0.0082); g.add(b); return b; });
  const palmAt = new T.BufferAttribute(new Float32Array(6 * 3), 3), palm = new T.BufferGeometry(); palm.setAttribute('position', palmAt); palm.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 5, 1]);
  const flat = new T.Mesh(palm, material.clone()); (flat.material as T.MeshStandardMaterial).side = T.DoubleSide; flat.castShadow = true; flat.receiveShadow = true; flat.frustumCulled = false; g.add(flat);
  return {group: g, set(p: Vec3[]) { pairs.forEach(([a, b], i) => bones[i].set(p[a], p[b])); balls.forEach((b, i) => b.position.set(p[i][0], p[i][1], p[i][2]));
    [0, 5, 9, 13, 17, 1].forEach((k, i) => palmAt.setXYZ(i, p[k][0], p[k][1], p[k][2])); palmAt.needsUpdate = true; palm.computeVertexNormals(); }};
}

export function createStage(canvas: HTMLCanvasElement, plan: Plan, options: {look?: Look; target?: string; read?: Read | null; figure?: Figure | null; doll?: Doll} = {}) {
  const look = options.look ?? 'room', target = options.target ?? 'P4.C1', C = COLOUR[look === 'bare' ? 'plain' : look], lens = filmLens(), edge = dealerEdge(lens), all = spots(plan, lens);
  const four = all.find(s => s.id === 'P4.C1')!, to = all.find(s => s.id === target); if (!to) throw Error(`The plan has no place ${target}.`);
  const pose = shoePose(lens), inShoe = shoeCard(pose), deal = planDeal({lens, target, place: to.at, placeOfSeat4: four.at, shoe: inShoe}), doll = options.doll ?? dollNamed(options.read?.doll), frame = standing(lens, doll), rest = restingHand(lens), S = doll.shape;

  const renderer = new T.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, alpha: look === 'bare'}); renderer.outputColorSpace = T.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.setScissorTest(true);
  const scene = new T.Scene(); scene.background = look === 'bare' ? null : new T.Color(C.ground);
  scene.add(new T.HemisphereLight(0xffffff, look === 'room' ? 0x3a3f44 : 0x8a9096, look === 'room' ? 1.25 : 1.6));
  const sun = new T.DirectionalLight(0xfff4e6, look === 'room' ? 2.4 : 1.9); sun.position.set(edge[0] - 0.9, 2.6, edge[2] + 1.9); sun.target.position.set(edge[0], 0, edge[2] + 0.2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002; sun.shadow.radius = 5; Object.assign(sun.shadow.camera, {left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 6}); scene.add(sun, sun.target);
  const matte = (colour: number, roughness = 0.9) => new T.MeshStandardMaterial({color: colour, roughness, metalness: 0});

  // The table: a straight dealer's edge and a half circle toward the players, the felt at y = 0; a rail round the players' side.
  const radius = 1.02, rail = 0.12, half = (r: number) => { const s = new T.Shape(); s.moveTo(-r, 0); s.absarc(0, 0, r, Math.PI, 0, true); s.lineTo(-r, 0); return s; };
  const lay = (g: T.BufferGeometry) => g.rotateX(Math.PI / 2).translate(edge[0], 0, edge[2]); // the shape lies in x-y with its arc toward +y; turned so that +y is world +z, toward the players, and its depth goes down
  const felt = new T.Mesh(lay(new T.ShapeGeometry(half(radius), 64)), new T.MeshStandardMaterial({color: C.felt, roughness: 0.95, side: T.DoubleSide})); felt.receiveShadow = true; scene.add(felt);
  const slab = new T.Mesh(lay(new T.ExtrudeGeometry(half(radius + rail), {depth: 0.06, bevelEnabled: false, curveSegments: 64})), new T.MeshStandardMaterial({color: C.wood, roughness: 0.8, side: T.DoubleSide})); slab.position.y = -0.0005; slab.receiveShadow = true; scene.add(slab);
  if (look === 'room') { const ring = half(radius + rail); ring.holes.push(new T.Path(half(radius).getPoints(64)));
    const r = new T.Mesh(lay(new T.ExtrudeGeometry(ring, {depth: 0.03, bevelEnabled: false, curveSegments: 64})).translate(0, 0.03, 0), new T.MeshStandardMaterial({color: C.rail, roughness: 0.55, side: T.DoubleSide})); r.castShadow = true; r.receiveShadow = true; scene.add(r);
    // The plan's places as thin outlines of a real card, so that one sees where each card is to lie.
    for (const s of all) { const w = CARD.width / 2 + 0.003, h = CARD.height / 2 + 0.003, pts = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, z]) => new T.Vector3(s.at[0] + x, 0.0006, s.at[2] + z));
      scene.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({color: C.mark, transparent: true, opacity: s.id === target ? 0.95 : 0.4}))); } }
  const floor = new T.Mesh(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), matte(C.ground, 1)); floor.position.y = -0.9; scene.add(floor);
  // The room's floor in half-metre squares. Every seat's eye is as high over the felt and looks as steeply down as the
  // bank's camera; without a floor to read that from, a view along the dealer's edge looks raised and one across it level.
  if (look === 'room') { const tiles = new T.GridHelper(40, 80, 0x4a525a, 0x343a40); tiles.position.set(edge[0], -0.898, edge[2]); scene.add(tiles); }

  // The shoe: a wedge on the felt, its front plate leaning back; the next card shows on the plate.
  const profile = new T.Shape(), set = SHOE.frontHeight / Math.tan(SHOE.plateLean); profile.moveTo(0, 0); profile.lineTo(SHOE.length, 0); profile.lineTo(SHOE.length, SHOE.backHeight); profile.lineTo(set, SHOE.frontHeight); profile.lineTo(0, 0);
  const shoe = new T.Mesh(new T.ExtrudeGeometry(profile, {depth: SHOE.width, bevelEnabled: false}), new T.MeshStandardMaterial({color: C.shoe, roughness: 0.5, side: T.DoubleSide})); shoe.castShadow = true; shoe.receiveShadow = true; shoe.matrixAutoUpdate = false;
  const sideways: Vec3 = [-pose.back[2], 0, pose.back[0]], sameWay = sideways[0] * pose.far[0] + sideways[2] * pose.far[2] > 0; // back x up is one of the two ways across; the wedge is extruded along it
  place(shoe, pose.back, [0, 1, 0], sideways, sameWay ? pose.front : [pose.front[0] + pose.far[0] * SHOE.width, 0, pose.front[2] + pose.far[2] * SHOE.width]); scene.add(shoe);
  const next = cardMesh(), start = deal.card(0); placeCard(next, {...start, centre: [start.centre[0] - start.normal[0] * 0.0006, start.centre[1] - start.normal[1] * 0.0006, start.centre[2] - start.normal[2] * 0.0006]}); scene.add(next);
  const card = cardMesh(); scene.add(card);
  // The cards a film of several has laid: each lies where the film says from its frame on.
  const lying = (options.read?.laid ?? []).map(l => { const m = cardMesh(), long = l.l as Vec3, normal = l.n as Vec3; placeCard(m, {centre: l.c as Vec3, long, normal, across: [normal[1] * long[2] - normal[2] * long[1], normal[2] * long[0] - normal[0] * long[2], normal[0] * long[1] - normal[1] * long[0]]}); m.visible = false; scene.add(m); return {from: l.from, mesh: m}; });

  // 'bare': the table, the shoe and the cards write depth only (drawn first, so that what lies behind them is not drawn
  // either), the floor is gone, and a sheet just over the felt shows only the shadows the figure casts on it.
  if (look === 'bare') {
    const hidden = new T.MeshBasicMaterial({colorWrite: false});
    for (const o of [felt, slab, shoe, next, card, ...lying.map(l => l.mesh)]) o.traverse(m => { if (m instanceof T.Mesh) { m.material = hidden; m.renderOrder = -1; m.castShadow = false; } });
    floor.visible = false;
    const shade = new T.Mesh(lay(new T.ShapeGeometry(half(radius), 64)), new T.ShadowMaterial({opacity: 0.3})); shade.position.y = 0.0004; shade.receiveShadow = true; scene.add(shade);
  }

  // The figure.
  // The trunk: the standard's egg (a unit ball), or a doll's profile turned about its upright axis (a smooth curve through
  // the profile's points; half-widths in shoulders' spans, heights in hip-to-shoulders over the hip).
  const skin = matte(C.figure, 0.85), torso = S.trunk.kind === 'egg' ? ball(skin, 1) : new T.Mesh(new T.LatheGeometry(new T.SplineCurve(S.trunk.profile.map(([h, r]) => new T.Vector2(r, h))).getPoints(80).map(p => new T.Vector2(Math.max(0, p.x), p.y)), 64), skin);
  if (S.trunk.kind === 'profile') { torso.castShadow = true; torso.receiveShadow = true; }
  const yokes = (S.yoke.kind === 'bar' ? [0] : [0, 1]).map(() => limb(skin, S.yoke.radius, S.yoke.radius)), neck = limb(skin, S.neck.radius[0], S.neck.radius[1]), head = new T.Group();
  const skull = ball(skin, 1); skull.scale.set(S.skull[0], S.skull[1], S.skull[2]); head.add(skull); const nose = ball(skin, 0.16); nose.position.set(0, -0.12, 0.84); nose.scale.set(0.7, 1, 1); head.add(nose); head.scale.setScalar(frame.headRadius * S.headScale);
  torso.matrixAutoUpdate = false; scene.add(torso, ...yokes.map(y => y.mesh), neck.mesh, head);
  const arms = [0, 1].map(() => ({upper: limb(skin, S.upperArmRadius[0], S.upperArmRadius[1]), fore: limb(skin, S.forearmRadius[0], S.forearmRadius[1]), shoulder: ball(skin, S.shoulderBall), elbow: ball(skin, S.elbowBall), wrist: ball(skin, S.wristBall)}));
  for (const a of arms) scene.add(a.upper.mesh, a.fore.mesh, a.shoulder, a.elbow, a.wrist);
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Two sources of motion. Drawn by hand (deal.ts, body.ts): two stiff hands. Read off a film (options.read): each hand its 21 points.
  const read = options.read ?? null, duration = read ? (read.frameCount - 1) / read.fps : deal.duration;
  const moments = read ? {leavesShoe: read.leavesShoe / read.fps, edgeOn: (read.edge[0] + read.edge[1]) / 2 / read.fps, lands: read.rests / read.fps, end: duration} : MOMENTS;
  const stiff = read ? [] : [handMesh(skin, -1), handMesh(skin, 1)], jointed = read ? [pointHand(skin), pointHand(skin)] : []; // her right hand, her left
  scene.add(...stiff, ...jointed.map(h => h.group)); if (!read) place(stiff[0], cross([0, -1, 0], rest.forward), [0, -1, 0], rest.forward, rest.wrist); // palm down on the felt
  // A rigged model in the figure's place (options.figure): the white figure is made as always and not drawn, and the model is posed from its joints.
  const figure = options.figure ?? null; if (figure) { scene.add(figure.root); for (const o of [torso, ...yokes.map(y => y.mesh), neck.mesh, head, ...arms.flatMap(a => [a.upper.mesh, a.fore.mesh, a.shoulder, a.elbow, a.wrist]), ...stiff, ...jointed.map(h => h.group)]) o.visible = false; }
  const mix = (a: number[], b: number[], t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  /** A point of the upright frame carried with the trunk (hip to shoulders' middle, shoulder to shoulder) to where the hip and shoulders now are. */
  const trunkAxes = (hip: Vec3, s: [Vec3, Vec3]) => { const m = mix(s[0], s[1], 0.5), x = norm([s[1][0] - s[0][0], s[1][1] - s[0][1], s[1][2] - s[0][2]]), up: Vec3 = [m[0] - hip[0], m[1] - hip[1], m[2] - hip[2]], z = norm(cross(x, up)); return {m, x, y: cross(z, x), z}; };
  const carried = (p: Vec3, hip: Vec3, s: [Vec3, Vec3]): Vec3 => { const a = trunkAxes(frame.hip, frame.shoulders), b = trunkAxes(hip, s), d: Vec3 = [p[0] - a.m[0], p[1] - a.m[1], p[2] - a.m[2]];
    const dx = d[0] * a.x[0] + d[1] * a.x[1] + d[2] * a.x[2], dy = d[0] * a.y[0] + d[1] * a.y[1] + d[2] * a.y[2], dz = d[0] * a.z[0] + d[1] * a.z[1] + d[2] * a.z[2];
    return [b.m[0] + b.x[0] * dx + b.y[0] * dy + b.z[0] * dz, b.m[1] + b.x[1] * dx + b.y[1] * dy + b.z[1] * dz, b.m[2] + b.x[2] * dx + b.y[2] * dy + b.z[2] * dz]; };
  let now = 0, shown: {card: CardPose} | null = null;
  function setTime(t: number) {
    now = Math.max(0, Math.min(duration, t)); let c: CardPose, body: Pick<Body, 'hip' | 'shoulders' | 'neck' | 'head'> & {arms: {shoulder: Vec3; elbow: Vec3; wrist: Vec3}[]};
    if (read) { const at = Math.min(read.frameCount - 1, now * read.fps), i = Math.min(read.frameCount - 2, Math.floor(at)), k = at - i; let a = read.frames[i], b = read.frames[i + 1];
      for (const l of lying) l.mesh.visible = at >= l.from - 0.5;
      if (a.card.id !== b.card.id) { const whole = k < 0.5 ? a : b; a = {...a, card: whole.card}; b = {...b, card: whole.card}; } // between two frames of two different cards there is no card half way
      // (a card and the same card with its ends swapped are one, and a motion may give its long side either way from one frame to the next: half way between the two ways is no way, and drew the card turned wrong for a moment)
      const bl = a.card.l[0] * b.card.l[0] + a.card.l[1] * b.card.l[1] + a.card.l[2] * b.card.l[2] < 0 ? b.card.l.map(x => -x) : b.card.l;
      const long = norm(mix(a.card.l, bl, k)), toward = mix(a.card.n, b.card.n, k), d =toward[0] * long[0] + toward[1] * long[1] + toward[2] * long[2], normal = norm([toward[0] - long[0] * d, toward[1] - long[1] * d, toward[2] - long[2] * d]);
      c = {centre: mix(a.card.c, b.card.c, k), long, normal, across: cross(normal, long)};
      const limbOf = (side: 'L' | 'R') => ({shoulder: mix(a[side].s, b[side].s, k), elbow: mix(a[side].e, b[side].e, k), wrist: mix(a[side].w, b[side].w, k)}), R = limbOf('R'), L = limbOf('L');
      jointed[0].set(a.R.p.map((p, j) => mix(p, b.R.p[j], k))); jointed[1].set(a.L.p.map((p, j) => mix(p, b.L.p[j], k)));
      // The neck: the standard's 3 cm straight up over the shoulders' middle, as it has always been drawn; a doll placed by its joints carries its own neck with the trunk.
      const shoulders: [Vec3, Vec3] = [R.shoulder, L.shoulder], neckAt = doll.place.kind === 'film' ? [(R.shoulder[0] + L.shoulder[0]) / 2, (R.shoulder[1] + L.shoulder[1]) / 2 + 0.03, (R.shoulder[2] + L.shoulder[2]) / 2] as Vec3 : carried(frame.neck, read.hip as Vec3, shoulders);
      body = {hip: read.hip as Vec3, shoulders, neck: neckAt, head: mix(a.h, b.h, k), arms: [R, L]};
    } else { const h = deal.hand(now), solved = solveBody(frame, h.wrist, rest.wrist, doll); c = deal.card(now); body = solved; place(stiff[1], cross(h.palm, h.forward), h.palm, h.forward, solved.arms[1].wrist); }
    shown = {card: c}; placeCard(card, c);
    body.arms.forEach((a, i) => { arms[i].upper.set(a.shoulder, a.elbow); arms[i].fore.set(a.elbow, a.wrist); arms[i].shoulder.position.copy(v3(a.shoulder)); arms[i].elbow.position.copy(v3(a.elbow)); arms[i].wrist.position.copy(v3(a.wrist)); });
    neck.set(body.neck, [body.head[0], body.head[1] - frame.headRadius * S.neck.intoHead, body.head[2]]);
    // The trunk: from the hip to the shoulders, as wide as they are, leaning and turning with them.
    const mid: Vec3 = [(body.shoulders[0][0] + body.shoulders[1][0]) / 2, (body.shoulders[0][1] + body.shoulders[1][1]) / 2, (body.shoulders[0][2] + body.shoulders[1][2]) / 2];
    const x = v3(body.shoulders[1]).sub(v3(body.shoulders[0])), wide = x.length(); x.normalize(); const y = v3(mid).sub(v3(body.hip)), tall = y.length(); y.normalize(); const z = new T.Vector3().crossVectors(x, y).normalize(); y.crossVectors(z, x);
    if (S.trunk.kind === 'egg') torso.matrix.makeBasis(x.clone().multiplyScalar(wide * S.trunk.wide), y.clone().multiplyScalar(tall * S.trunk.tall), z.clone().multiplyScalar(S.trunk.deep)).setPosition(v3(body.hip).lerp(v3(mid), S.trunk.at));
    else torso.matrix.makeBasis(x.clone().multiplyScalar(wide), y.clone().multiplyScalar(tall), z.clone().multiplyScalar(wide * S.trunk.deep)).setPosition(v3(body.hip));
    torso.matrixWorldNeedsUpdate = true;
    // The yoke: straight across (the standard), or down from a foot over the shoulders' middle to each shoulder.
    if (S.yoke.kind === 'bar') yokes[0].set(body.shoulders[0], body.shoulders[1]);
    else { const foot: Vec3 = [mid[0] + y.x * S.yoke.footOver, mid[1] + y.y * S.yoke.footOver, mid[2] + y.z * S.yoke.footOver]; yokes[0].set(foot, body.shoulders[0]); yokes[1].set(foot, body.shoulders[1]); }
    // Her eyes are on the card from the shoe until it lies, all through the turn (Jakob 2026-11-18: "Hon ska följa korten
    // oftast, och alltid när det vänds över"); when it lies she looks up toward the players, over two thirds of a second.
    const lies = read ? moments.lands : MOMENTS.lands, up = Math.max(0, Math.min(1, (now - lies) / 0.65)), eased = up * up * (3 - 2 * up);
    head.position.copy(v3(body.head)); let gaze = v3(c.centre).lerp(new T.Vector3(body.head[0], body.head[1] - 0.25, body.head[2] + 1.2), 0.75 * eased);
    if (read?.frames[0].g) { const at = Math.min(read.frameCount - 1, now * read.fps), i = Math.min(read.frameCount - 2, Math.floor(at)); gaze = v3(mix(read.frames[i].g!, read.frames[i + 1].g!, at - i)); } // a film that says where she looks
    head.lookAt(gaze);
    if (figure) {
      // Each hand as a whole, since the model has no fingers to move: from the wrist toward the middle of the middle finger
      // (half way between its knuckle and its tip, so that a stiff hand points between the palm and the bent fingers), the
      // palm's way from the wrist and the two outer knuckles.
      const sub = (p: number[], q: number[]): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], whole = (p: number[][], side: 1 | -1) => { const n = cross(sub(p[5], p[0]), sub(p[17], p[0])); return {forward: sub(mix(p[9], p[12], 0.5), p[0]), palm: [n[0] * side, n[1] * side, n[2] * side] as Vec3}; };
      let hands: {forward: Vec3; palm: Vec3}[];
      if (read) { const at = Math.min(read.frameCount - 1, now * read.fps), i = Math.min(read.frameCount - 2, Math.floor(at)), k = at - i, a = read.frames[i], b = read.frames[i + 1], points = (s: 'L' | 'R') => a[s].p.map((p, j) => mix(p, b[s].p[j], k)); hands = [whole(points('R'), 1), whole(points('L'), -1)]; }
      else { const h = deal.hand(now); hands = [{forward: rest.forward, palm: [0, -1, 0]}, {forward: h.forward, palm: h.palm}]; }
      const looks = new T.Vector3(0, 0, 1).applyQuaternion(head.quaternion);
      figure.pose({hip: body.hip, shoulders: body.shoulders, arms: body.arms, hands, looks: [looks.x, looks.y, looks.z]});
    }
  }
  const cameraOf = (eye: Eye) => { const cam = new T.PerspectiveCamera(fovYDeg(eye.focalPx), FILM.width / FILM.height, 0.2, 30); cam.position.copy(v3(eye.position)); cam.lookAt(v3(eye.position).add(v3(eye.forward))); cam.updateMatrixWorld(); return cam; };
  // A seat's eye aims at the seat's own card, so the dealer stands off the picture's middle and a little farther away. The bank's camera carried round the
  // dealer herself (about the plumb line through her middle) keeps its height, its steepness and its distance to her: she is drawn where the bank has her and
  // as large, only seen from the side (Jakob 2026-11-18: "kameran i mitten flyttad åt sidan"). Negative degrees: toward seat 1's side.
  const eyeOf = (view: View): Eye => view === 'film' ? filmEye(lens) : typeof view === 'number' ? seatEye(view, plan, lens) : orbit(filmEye(lens), [frame.hip[0], 0, frame.hip[2]], view.round * Math.PI / 180);
  /** Draws the present moment once per view, side by side from the left; each view keeps the bank's shape (1764 : 1174) inside its share of the canvas. */
  function render(views: View[]): {left: number; top: number; width: number; height: number}[] {
    const W = canvas.width, H = canvas.height, share = W / views.length, boxes: {left: number; top: number; width: number; height: number}[] = [];
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor(0x0b0d0f, look === 'bare' ? 0 : 1); renderer.clear();
    views.forEach((view, i) => { const width = Math.min(share, H * FILM.width / FILM.height), height = width * FILM.height / FILM.width, left = i * share + (share - width) / 2, top = (H - height) / 2;
      renderer.setViewport(left, H - top - height, width, height); renderer.setScissor(left, H - top - height, width, height); renderer.render(scene, cameraOf(eyeOf(view))); boxes.push({left, top, width, height}); });
    return boxes;
  }
  setTime(0);
  return {duration, moments, lens, setTime, render, eyeOf, state: () => shown, time: () => now, film: read?.film ?? null,
    /** What the bank's camera would measure of the card that lies at the target: near edge, far edge, depth, taper, in pixels. */
    landed: () => realCardAt(lens, to.pixel)};
}
