// Rendered cards as objects in the 3D scene: the card being dealt, following the film's card track, and the cards that already
// lie on the table (`placed`). Each is the card material study's own card, its outline and print, drawn under the film. Near the
// dealt card the film's own card is keyed away (scene3d-film.ts, CardKey), so the film's fingers lie over the rendered card by
// themselves and the shadows they cast on the film's card fall on it. Where a card is, which side shows and what it shows are
// the overlay's rules (src/card-overlay.ts: poseAt, cardRecord, cardFace, overrides) unchanged; this file only draws.
//
// Placement: seen from the film camera the card covers exactly the quad poseAt gives, laid on the film's own surfaces (the felt
// below the table edge row, the dealer plane above it) like the hands that hold it. Turning the view keeps it exact; moving the
// view keeps it with the hand. scene3d-geometry.ts (cardPoint) says why it is not a solved 3D pose.
// Light: the film's card shows how the film's light falls on the card in each frame. Its brightness against the same card lying
// flat scales the paper, so the rendered card brightens and dims with the film's card (tilting away, turning over). Gloss and
// bend are the card's own: the scene's room reflected in the paper, and a slight curve while it is held.
//
// The other way (way 'matte', src/scene3d-matte.ts): the film's own card is the matte and is drawn over in the film's shader, so
// no card object is drawn while a film shows its card; the passes that make the matte run here, on targets of the film's size.
// The cards lying since earlier films are drawn as objects either way: a film lays one card, and later films do not show it.
import * as T from 'three';
import {poseAt, restOf, sceneOf, cardRecord, cardFace, overridesOf, cardInFront, plausible, skirtSound, firstDrawn, RIM, MARGIN, PLAUSIBLE, EASE, type CardTrack, type CardRecord} from './card-overlay.ts';
import {centre, clockwise, grown, signedArea, sound, type Pt} from './card-track.ts';
import {FILM, edgeQuad, heldScale, solveCamera, squareToQuad, type FilmCamera} from './scene3d-geometry.ts';
import {CARD_GLSL, type CardKey, type MatteKey} from './scene3d-film.ts';
import {FAN_GLSL} from './scene3d-light.ts';
import {roomReflection} from './scene3d-table.ts';
import {CLASSIFY_FRAGMENT, MATTE, MORPH_FRAGMENT, PASS_VERTEX, SHADE_FRAGMENT, SHOE_BOX, matteBox, matteZone, meanLinear, printQuad, toPrint, type MatteTrack} from './scene3d-matte.ts';

// The card material study, for its print, outline and paper. Imported as an instance of its own (the query): the import map in
// scene3d.html binds that instance's three.js to the scene's, so the page holds one three.js. The canvas method
// (scene3d-cards.ts) keeps the study's vendored copy as before. Only plain data and canvases cross over.
type Study = typeof import('../materials/source/src/card-material-study.ts');
const study: Study = await import('../materials/source/src/card-material-study.js?scene3d' as string);

// The film's card, lit, as the video shows it (P4 deal): yellow back, blue face. Only their direction in colour matters for the key.
const COLOUR = {BACK: [0.91, 0.82, 0.02], FRONT: [0, 0.475, 0.89]};
// Brightness (luminance of the video values, the lighter half of the card as scene3d-film.ts cardBase takes it) of the film's
// card lying flat in the film's light: the face on the felt and the back seated in the shoe, P4 deal. The rendered card's paper
// is calibrated at that light; brighter or darker frames scale it.
const LYING = {BACK: 0.835, FRONT: 0.44};
const HELD = 1 / MARGIN;   // in the hand the rendered card is the film's card itself; it grows to the plan's size as it settles
const EDGE_PX = 1.8;       // ... with the film card's pale edge: corners moved out this far (sides about 1.4 px)
const LIFT = 0.0004;       // metres over the felt: under the film's table layer (1.5 mm), over the felt
const TILT = 0.7;          // a held card leans toward the camera: how much of the normal turns that way (the light shows it)
const BEND = 0.07, GLOSS = 0.35; // the lab's defaults for a target without its own (placements: material.bend, material.gloss)
const REACH = 0.25;        // the contact shadow reaches this share of the card beyond its edges
const CONTACT = 0.45;      // its darkness right at the edge of a card lying on the felt
const PAPER = [0.93, 0.91, 0.86]; // light on the paper of a card lying flat: a little warm, white print about as bright as the film's whites
// The card seated in the shoe window, which every film shows (the shoe is part of the plate): film pixels, texture order. From
// the first frame of pamela-p4-c1-plan-deal-02, where the card about to be dealt is the seated one; the P1, P7 and dealer deals
// agree within half a pixel. A track that starts with its card in the shoe gives its own.
const SEATED = [[1292.9, 752.7], [1343.2, 777.8], [1283.2, 858.6], [1239.5, 831.4]];

const VERTEX = `uniform mat3 cardH; uniform vec4 lens; uniform vec3 eye; uniform float edgeRow, edgeZ, lift, bend, tilt, shadeOn, lying, shadow, depthOnly;
uniform sampler2D map; uniform vec2 core[4]; uniform vec3 cardColour;
varying vec2 vUv, vSt; varying vec3 vWorld, vNormal; varying float vShade, vLight;
${CARD_GLSL}
// the film camera's ray through a film pixel, and where the film's surfaces carry that pixel (scene3d-geometry.ts filmToScene)
vec3 rayOf(vec2 px){ vec2 n = (px - lens.xy) / lens.z; float c = cos(lens.w), s = sin(lens.w); return vec3(n.x, -n.y * c - s, n.y * s - c); }
vec2 pixelOf(vec2 st){ vec3 h = cardH * vec3(st, 1.); return h.xy / h.z; }
vec3 onFilm(vec2 st){ vec2 px = pixelOf(st); vec3 d = rayOf(px); return eye + d * (px.y >= edgeRow ? (lift - eye.y) / d.y : (edgeZ - eye.z) / d.z); }
vec3 onFelt(vec2 st){ vec3 d = rayOf(pixelOf(st)); return eye + d * ((lift - eye.y) / d.y); }
void main(){
  vUv = uv;
  // card coordinates of the study's model: u to the right, v down the visible print
  vec2 st = vec2(position.x / ${study.CARD.width} + .5, .5 - position.y / ${study.CARD.height}); vSt = st;
  vec3 p = onFilm(st); vNormal = vec3(0., 1., 0.); vShade = vLight = 1.;
  if (shadow > .5) { vWorld = onFelt(st) - vec3(0., lift * .5, 0.); gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.); return; }
  if (depthOnly > .5) { vWorld = p; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); return; }
  // the card's own axes, taken on the surface the card is laid on (onFilm: the dealer plane above the edge row, the felt below it):
  // across its width, and its length. Not on the felt alone: a card held up near the horizon row (548 of the film's 1174) meets the
  // felt tens of metres away or behind the eye, its length came out that long, and the bend threw its ends behind the camera, where
  // the clipped triangles were drawn out to the edge of the picture (Paow P4, paow-giv-2-1-p4-04-01 frames 30-38).
  vec3 across = normalize(onFilm(st + vec2(.02, 0.)) - onFilm(st - vec2(.02, 0.)));
  float len = length(onFilm(vec2(.5, 1.)) - onFilm(vec2(.5, 0.))), k = 2. * bend / max(len, 1e-4), y = (st.y - .5) * len;
  // bend: the ends come toward the viewer, along the film camera's ray, so the film pixel stays; the normal turns with it. A bend is a
  // few millimetres: never more than a twentieth of the way to the eye, whatever the measure gives.
  if (k > 1e-6) p -= normalize(p - eye) * min((1. - cos(k * y)) / k, .05 * length(p - eye));
  vec3 n0 = normalize(vec3(0., 1., 0.) + normalize(eye - p) * tilt), n = n0, l = normalize(vec3(-.3, 1., .6));
  float a = k * y; n = n0 * cos(a) + cross(across, n0) * sin(a) + across * dot(across, n0) * (1. - cos(a));
  vNormal = n; vWorld = p;
  vLight = clamp(max(dot(n, l), 0.) / max(dot(n0, l), .2), .7, 1.2);
  // the film's light on its own card in this frame, against the same card lying flat
  vShade = shadeOn > .5 ? clamp(dot(cardBase(map, core, cardColour), vec3(.2126, .7152, .0722)) / lying, .55, 1.3) : 1.;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`;
// Output is sRGB-encoded like the film's, whatever the target, so it composites the same way with focus on or off. `accum`:
// one of several motion samples added up in a target of their own, premultiplied and weighted.
const FRAGMENT = `uniform sampler2D print, room; uniform vec3 paper, grade; uniform float edgeOn, sheen, roomLod, shadow, shade, accum, weight;
${FAN_GLSL}
varying vec2 vUv, vSt; varying vec3 vWorld, vNormal; varying float vShade, vLight;
vec2 equirect(vec3 d){ return vec2(atan(d.z, d.x) * .15915494 + .5, asin(clamp(d.y, -1., 1.)) * .31830989 + .5); }
void main(){
  if (shadow > .5) {
    // contact shadow: soft and dark right at the card's rounded edge, out to a few millimetres (in card widths; height 1.4)
    vec2 q = abs(vSt - .5) * vec2(1., 1.4) - vec2(.5, .7) + ${(study.CARD.radius / study.CARD.width).toFixed(4)};
    float r = max(length(max(q, 0.)) + min(max(q.x, q.y), 0.) - ${(study.CARD.radius / study.CARD.width).toFixed(4)}, 0.);
    gl_FragColor = vec4(0., 0., 0., shade * exp(-r / .035) * fanShade(vWorld)); return;
  }
  if (edgeOn > .5) {
    // an edge-on card is a thin quad along its edge line (v across it): the paper's edge, grey and soft at its sides, as the film
    // shows it while the card turns fast
    float w = 1. - abs(2. * vSt.y - 1.), a = .8 * smoothstep(0., .7, w); vec3 e = (1.055 * pow(vec3(.3) * paper * vShade, vec3(1. / 2.4)) - .055) * grade * fanShade(vWorld);
    gl_FragColor = accum > .5 ? vec4(e * a, a) * weight : vec4(e, a); return;
  }
  vec3 albedo = texture2D(print, vUv).rgb, N = normalize(vNormal), V = normalize(cameraPosition - vWorld), R = reflect(-V, N);
  // the paper's reflection of the room: weak head-on (the study's paper reflects about 2 %), stronger toward grazing angles;
  // a broad lobe for the paper and a sharper one for its coat, which catches the lamp over the table as the card turns
  float NoV = max(dot(N, V), 1e-3), F = .025 + .975 * pow(1. - NoV, 5.);
  vec3 col = albedo * paper * vShade * vLight + (textureLod(room, equirect(R), roomLod).rgb + sheen * textureLod(room, equirect(R), roomLod - 2.5).rgb) * F;
  col = mix(col * 12.92, 1.055 * pow(max(col, 0.), vec3(1. / 2.4)) - .055, step(.0031308, col));
  gl_FragColor = vec4(col * grade * fanShade(vWorld), 1.) * (accum > .5 ? weight : 1.);
}`;
// The motion samples' sum laid into the picture: premultiplied, where the card would have been drawn (under the film).
const COMPOSITE_VERTEX = 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }';
const COMPOSITE_FRAGMENT = 'uniform sampler2D sum; uniform vec2 size; void main(){ gl_FragColor = texture2D(sum, gl_FragCoord.xy / size); }';

// hand: the card's size while it is carried. 'film' (as it was): the film's own card, which the model draws at a size of its own in
// every clip, so the card changes size as it lands. 'standard': the size it lies in, from the shoe to the table (Jakob 2026-11-11: one
// format, the card that lies on seat 4; everything else adapts to it).
type Choice = {rank: string; suit: string; scale: number; hand?: 'film' | 'standard'};
type Placed = {quad: Pt[]; back: boolean; target?: string | null; shoeDraw?: number | null};
// carry: how the card the film carries is shown while it is in her hand (the page's choice, src/game-film.ts): 'object' (as before:
// the card object, except where the track does not hold the card in the hand, CardTrack.hand false, where the film's own card is
// recoloured in place, the matte, until the object takes over EASE frames before it lies); 'matte' (the film's card recoloured
// while carried for every take, the object from the same frame on); 'film' (the film's own card while carried, the object from
// the frame it lies: "Bara liggande"). The cards already lying are objects whatever carry says.
export type Carry = 'object' | 'matte' | 'film';
type Extra = {shift?: Pt | null; land?: Pt[] | null; placed?: Placed[]; cards?: CardRecord[] | null; target?: string | null; shoeDraw?: number | null; carry?: Carry};
type FilmLayers = {shared: {map: {value: T.Texture | null}; grade: {value: T.Vector3}}; setCards(key: CardKey | null): void; setMatte(m: MatteKey | null): void};
// renderer and view: for the motion samples, drawn into a target of their own before the frame; pixels: screen pixels per film pixel.
// way: 'scene' (the card an object under the film) or 'matte' (the film's own card drawn over in place).
type Options = {contract: unknown; plan: unknown; film: FilmLayers; light: Record<string, {value: unknown}>; camera: () => FilmCamera; edgeZ: () => number; renderer: T.WebGLRenderer; view: () => T.Camera; pixels: () => number; way?: 'scene' | 'matte'};
// Motion blur: the film's own card edges are soft over about a quarter of the distance it moves in a frame (2-4 px on the P4
// deal; the hand smears more), so the card is drawn along its path over 0.25 of a frame, in as many samples as keep them about
// a pixel apart, and never smeared over more than 12 screen pixels: a dark back blurred further reads as smoked glass, not as a
// card. A card that hardly moves is drawn once, sharp.
const SHUTTER = 0.25, SAMPLES = 14, MAX_BLUR = 12;

// The matte's passes (src/scene3d-matte.ts) on five targets of the film's size, made the first time they run: the classes, two
// for the separable steps, the card's body, its cover with what lies beside it (kept: the film's shader reads it), and the shading.
// They run only inside `box` (scissor), and every target is cleared first, so what lies outside reads as no card. Eight bits are
// enough: the masks are 0 or 1, and the shading is the video's own luminance, which has no more.
type Target = T.WebGLRenderTarget;
function mattePasses(renderer: T.WebGLRenderer, keep: <D extends {dispose(): void}>(d: D) => D) {
  const size = new T.Vector2(FILM.width, FILM.height), scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const triangle = keep(new T.BufferGeometry()); triangle.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new T.Mesh(triangle); mesh.frustumCulled = false; scene.add(mesh);
  const pass = (fragmentShader: string, uniforms: Record<string, {value: unknown}>) => keep(new T.ShaderMaterial({vertexShader: PASS_VERTEX, fragmentShader, uniforms: {size: {value: size}, ...uniforms}, depthTest: false, depthWrite: false, blending: T.NoBlending}));
  const classify = pass(CLASSIFY_FRAGMENT, {map: {value: null}});
  const morph = pass(MORPH_FRAGMENT, {map: {value: null}, base: {value: null}, dir: {value: new T.Vector2()}, radius: {value: new T.Vector4()}, grow: {value: new T.Vector4()}, shoe: {value: new T.Vector4()}, shoeRadius: {value: -1}, combine: {value: 0}});
  const shade = pass(SHADE_FRAGMENT, {map: {value: null}, film: {value: null}, dir: {value: new T.Vector2()}, sigma: {value: new T.Vector2(MATTE.sigma.back, MATTE.sigma.face)}, first: {value: 1}});
  let targets: Target[] | null = null;
  const draw = (material: T.ShaderMaterial, to: Target) => { mesh.material = material; renderer.setRenderTarget(to); renderer.render(scene, camera); };
  const u = morph.uniforms, s = shade.uniforms;
  // one direction of a square erosion (grow 0) or dilation (grow 1) per channel; shoe: the first two channels at most one pixel in the shoe window
  const step = (from: Target, to: Target, dir: number, radius: number[], grow: number[], how: {shoe?: boolean; combine?: boolean} = {}) => {
    u.map.value = from.texture; (u.dir.value as T.Vector2).set(dir ? 0 : 1, dir); (u.radius.value as T.Vector4).fromArray(radius); (u.grow.value as T.Vector4).fromArray(grow);
    u.shoeRadius.value = how.shoe ? MATTE.shoeRim : -1; u.combine.value = how.combine ? 1 : 0; draw(morph, to); };
  return {
    /** The matte of the film frame in `film`, made inside `box` (film pixels x0, y0, x1, y1); `shoe` the shoe window. */
    run(film: T.Texture, box: number[], shoe: number[]) {
      targets ??= Array.from({length: 5}, () => keep(new T.WebGLRenderTarget(FILM.width, FILM.height, {type: T.UnsignedByteType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false, generateMipmaps: false})));
      const [A, P, Q, C, D] = targets, before = renderer.getRenderTarget(), clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      for (const t of targets) { t.scissorTest = false; renderer.setRenderTarget(t); renderer.clear(true, false, false); t.scissor.set(box[0], FILM.height - 1 - box[3], box[2] - box[0] + 1, box[3] - box[1] + 1); t.scissorTest = true; }
      classify.uniforms.map.value = film; draw(classify, A);
      const {thin, keep: back, near, rim, beside, fringe} = MATTE, reach = thin + back;
      step(A, P, 0, [thin, thin, near, near], [0, 0, 1, 1]); step(P, Q, 1, [thin, thin, near, near], [0, 0, 1, 1]); // the core left after thin things go, and where the card's own colour is near
      step(Q, P, 0, [reach, reach, 0, 0], [1, 1, 1, 1]); u.base.value = A.texture; step(P, Q, 1, [reach, reach, 0, 0], [1, 1, 1, 1], {combine: true}); // the body
      (u.shoe.value as T.Vector4).set(shoe[0] - MATTE.shoeRoom, shoe[1] - MATTE.shoeRoom, shoe[2] + MATTE.shoeRoom, shoe[3] + MATTE.shoeRoom);
      step(Q, P, 0, [rim, rim, beside, fringe], [1, 1, 1, 1], {shoe: true}); step(P, C, 1, [rim, rim, beside, fringe], [1, 1, 1, 1], {shoe: true}); // its cover, what is right beside it, and the zone further out
      s.map.value = Q.texture; s.film.value = film; (s.dir.value as T.Vector2).set(1, 0); s.first.value = 1; draw(shade, P);
      s.map.value = P.texture; (s.dir.value as T.Vector2).set(0, 1); s.first.value = 0; draw(shade, D);
      renderer.setRenderTarget(before); renderer.setClearColor(clear, alpha);
      return {cover: C.texture, shade: D.texture};
    },
  };
}

export function createDealLayer(o: Options) {
  const scene = sceneOf(o.contract), group = new T.Group(), owned: {dispose(): void}[] = [], keep = <D extends {dispose(): void}>(d: D) => { owned.push(d); return d; };
  const targets = (o.plan as {targets?: Record<string, {material?: {bend?: number; gloss?: number}}>} | null)?.targets ?? {};
  // the study's card outline, flat: its front surface is drawn, the back surface and paper edge are left out (a card seen from
  // the film camera shows one side; the edge is under a pixel thick)
  const surface = study.createCardSurface(0), geometry = keep(new T.BufferGeometry());
  geometry.setAttribute('position', new T.BufferAttribute(surface.positions, 3)); geometry.setAttribute('uv', new T.BufferAttribute(surface.uv, 2)); geometry.setIndex(new T.BufferAttribute(surface.indices, 1));
  for (const g of surface.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  // the contact shadow: a plain grid over the card and REACH beyond it, in the same model units
  const reach = keep(new T.PlaneGeometry(study.CARD.width * (1 + 2 * REACH), study.CARD.height * (1 + 2 * REACH), 12, 12));
  const hidden = keep(new T.MeshBasicMaterial({visible: false})), room = keep(roomReflection());
  // one print per value, kept (at most 52), and the back
  const prints = new Map<string, T.CanvasTexture>(), print = (value?: {rank: string; suit: string}) => {
    const key = value ? `${value.rank}/${value.suit}` : 'back'; let t = prints.get(key);
    if (!t) { t = keep(new T.CanvasTexture(study.createCardPrint(value as never))); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 16; prints.set(key, t); }
    return t;
  };
  // what every card shares: the film camera, the frame, the grade, the fan's shade
  const lens = {lens: {value: new T.Vector4()}, eye: {value: new T.Vector3()}, edgeRow: {value: 0}, edgeZ: {value: -1}, lift: {value: LIFT}};
  const shared = {...o.light, ...lens, map: o.film.shared.map, grade: o.film.shared.grade, room: {value: room}, paper: {value: new T.Vector3(...PAPER)}, roomLod: {value: 5}};
  const quad = () => [0, 1, 2, 3].map(() => new T.Vector2());
  const made = (shadow: boolean) => keep(new T.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
    ...(shadow ? {blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor} : {}),
    uniforms: {...shared, cardH: {value: new T.Matrix3()}, bend: {value: 0}, tilt: {value: 0}, shadeOn: {value: 0}, lying: {value: 1}, core: {value: quad()}, cardColour: {value: new T.Vector3(1, 1, 0)},
      print: {value: null}, edgeOn: {value: 0}, sheen: {value: 1.4}, shadow: {value: shadow ? 1 : 0}, shade: {value: 0}, accum: {value: 0}, weight: {value: 1}, depthOnly: {value: 0}}}));
  // A card: its surface and its contact shadow on the felt (drawn first, so the card covers it), both laid by the same homography.
  // Draw order: felt and props (opaque), then shadows (2), cards (3), then the film (5, 6) over them.
  type Card = {mesh: T.Mesh; shadow: T.Mesh; material: T.ShaderMaterial; under: T.ShaderMaterial};
  const card = (): Card => {
    const material = made(false), under = made(true), mesh = new T.Mesh(geometry, [material, hidden, hidden]), shadow = new T.Mesh(reach, under);
    mesh.renderOrder = 3; shadow.renderOrder = 2; mesh.frustumCulled = shadow.frustumCulled = false; mesh.visible = shadow.visible = false; group.add(shadow, mesh);
    return {mesh, shadow, material, under};
  };
  // The last word on what is drawn, for every card (the dealt one, the one seated in the shoe, the lying ones): a quad that is no
  // plausible card (card-overlay.ts plausible: crossed, folded, a sliver, a wedge) would lay the card through or near infinity, across
  // the whole picture, and is not drawn. The size bound here is only a backstop (poseAt holds the film's card to a card's size; a
  // standard-size card in the hand at Kortens storlek 2 is about twice that). An edge-on card is a thin quad along a line no longer than a card.
  const drawable = (q: number[][], edge: boolean) => { const p = q.map(([x, y]) => ({x, y}));
    return edge ? sound(p) && Math.max(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) <= PLAUSIBLE.edge + 8 : plausible(p, 2.5 * PLAUSIBLE.size); };
  // The contact shadow reaches REACH of the card beyond it, laid on the felt by the card's own homography: only where that skirt keeps
  // clear of the homography's line at infinity (skirtSound) and lies below the table's edge row, on the felt; otherwise there is none.
  const shadowFits = (q: number[][]) => { const p = q.map(([x, y]) => ({x, y})); if (!skirtSound(p, REACH)) return false;
    try { const H = squareToQuad(q), row = o.camera().edgeRow; return [[-REACH, -REACH], [1 + REACH, -REACH], [1 + REACH, 1 + REACH], [-REACH, 1 + REACH]].every(([u, v]) => { const w = H[6] * u + H[7] * v + H[8]; return w > 0 && (H[3] * u + H[4] * v + H[5]) / w >= row; }); } catch { return false; } };
  const lay = (c: Card, q: number[][], how: {print: T.Texture; edge?: boolean; bend?: number; tilt?: number; shade?: {core: number[][]; colour: number[]; lying: number} | null; contact: number; gloss?: number}) => {
    let H: number[]; try { if (!drawable(q, !!how.edge)) throw Error('no plausible card'); H = squareToQuad(q); } catch { c.mesh.visible = c.shadow.visible = false; return; }
    for (const m of [c.material, c.under]) (m.uniforms.cardH.value as T.Matrix3).set(H[0], H[1], H[2], H[3], H[4], H[5], H[6], H[7], H[8]);
    const u = c.material.uniforms; u.print.value = how.print; u.edgeOn.value = how.edge ? 1 : 0; u.bend.value = how.bend ?? 0; u.tilt.value = how.tilt ?? 0;
    u.sheen.value = 2 * (how.gloss ?? GLOSS); u.shadeOn.value = how.shade ? 1 : 0; // gloss 0.35: the coat's lobe at 0.7 of the paper's
    if (how.shade) { how.shade.core.forEach((p, i) => (u.core.value as T.Vector2[])[i].set(p[0], p[1])); (u.cardColour.value as T.Vector3).set(how.shade.colour[0], how.shade.colour[1], how.shade.colour[2]); u.lying.value = how.shade.lying; }
    c.under.uniforms.shade.value = CONTACT * how.contact; c.mesh.visible = true; c.shadow.visible = how.contact > 0.01 && !how.edge && shadowFits(q);
  };
  const dealt = card(), seated = card(), lying: Card[] = [];
  seated.mesh.renderOrder = 2.5; // under the card being dealt, which starts out as the seated card itself
  // The dealt card's depth, for the focus blur, which reads distances from the depth buffer: on the felt the felt gives the card's
  // depth, but held up in front of the dealer nothing else would, and the card would count as infinitely far. Written a hair
  // behind the card (polygon offset), so the film's layers in that same plane still lie in front of it.
  const depthOf = (c: Card) => { const m = keep(new T.ShaderMaterial({vertexShader: VERTEX, fragmentShader: 'void main(){ gl_FragColor = vec4(0.); }', transparent: true, colorWrite: false, depthWrite: true,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4, uniforms: {...c.material.uniforms, depthOnly: {value: 1}}}));
    const mesh = new T.Mesh(geometry, [m, hidden, hidden]); mesh.renderOrder = 2.4; mesh.frustumCulled = false; mesh.visible = false; group.add(mesh); return mesh; };
  const depth = depthOf(dealt), seatDepth = depthOf(seated);
  const hide = (c: Card) => { c.mesh.visible = c.shadow.visible = false; };
  // Motion samples of the dealt card: one mesh each, sharing the dealt card's uniforms but for its own homography and weight,
  // all drawn in one pass and added up in `sum`; a quad over the whole picture then lays the sum where the card goes.
  const samples = new T.Scene(), sampled = Array.from({length: SAMPLES}, () => {
    const m = keep(new T.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthTest: false, depthWrite: false,
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor,
      uniforms: {...dealt.material.uniforms, cardH: {value: new T.Matrix3()}, accum: {value: 1}, weight: {value: 1}}}));
    const mesh = new T.Mesh(geometry, [m, hidden, hidden]); mesh.frustumCulled = false; samples.add(mesh); return {mesh, m};
  });
  let sum: T.WebGLRenderTarget | null = null; const size = new T.Vector2();
  const triangle = keep(new T.BufferGeometry()); triangle.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const lay2 = keep(new T.ShaderMaterial({vertexShader: COMPOSITE_VERTEX, fragmentShader: COMPOSITE_FRAGMENT, transparent: true, depthTest: false, depthWrite: false,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor, uniforms: {sum: {value: null}, size: {value: size}}}));
  const composite = new T.Mesh(triangle, lay2); composite.renderOrder = 3; composite.frustumCulled = false; composite.visible = false; group.add(composite);
  function drawSamples(quads: number[][][]) {
    const r = o.renderer; r.getDrawingBufferSize(size);
    if (!sum || sum.width !== size.x || sum.height !== size.y) { sum?.dispose(); sum = new T.WebGLRenderTarget(size.x, size.y, {type: T.HalfFloatType, samples: 4, depthBuffer: false}); lay2.uniforms.sum.value = sum.texture; }
    sampled.forEach((s, i) => { const q = quads[i]; s.mesh.visible = !!q; if (!q) return; const H = squareToQuad(q); (s.m.uniforms.cardH.value as T.Matrix3).set(H[0], H[1], H[2], H[3], H[4], H[5], H[6], H[7], H[8]); s.m.uniforms.weight.value = 1 / quads.length; });
    const before = r.getRenderTarget(), clear = r.getClearColor(new T.Color()), alpha = r.getClearAlpha();
    r.setRenderTarget(sum); r.setClearColor(0x000000, 0); r.clear(true, false, false); r.render(samples, o.view());
    r.setRenderTarget(before); r.setClearColor(clear, alpha);
  }
  // The quad drawn in a frame: the overlay's pose at the held size in the hand, or a thin quad along an edge-on card's line.
  type Drawn = {pose: NonNullable<ReturnType<typeof poseAt>>; q: number[][]; line: number[][] | null};
  const drawnAt = (track: CardTrack, frame: number, choice: Choice, extra: Extra): Drawn | null => {
    if (frame < 0 || frame >= track.frames.length) return null;
    const pose = poseAt(track, scene, frame, choice.scale, 12, extra.shift ?? null, extra.land ?? null);
    // one size all the way: the film's card, made the size of ours. How much larger the film draws its card than ours is measured
    // where both lie flat in the same place (the film's resting card against ours); the card in the hand is the film's card made
    // smaller or larger by that much, about the point where the fingers hold it (the track's grip point, else its middle), so it
    // neither grows nor shrinks as it lands. (Matching areas frame by frame would be wrong: a card that faces the eye is larger in
    // the picture than the same card lying on the table.)
    if (pose?.quad && choice.hand === 'standard' && pose.resting < 1) { const landed = restOf(track), rest = landed ? poseAt(track, scene, landed.from, choice.scale, 12, extra.shift ?? null, extra.land ?? null)?.quad : null, f = track.frames[pose.frame];
      if (landed && rest && f.quad?.length === 4) { const root = (q: Pt[]) => Math.sqrt(Math.abs(signedArea(q))), film = f.quad.map(([x, y]) => ({x, y})), ours = root(rest), k = ours / (root(landed.quad) || 1);
        // what poseAt has already done to the film's quad: its margin, and its own settling toward our size
        const done = MARGIN * (1 + (ours / (MARGIN * root(film) || 1) - 1) * pose.resting), by = k / done, c = centre(pose.quad), raw = centre(film), grip = (f as {grip?: number[] | null}).grip;
        const pivot = grip?.length === 2 ? {x: grip[0] + c.x - raw.x, y: grip[1] + c.y - raw.y} : c;
        return {pose, q: pts(pose.quad.map(p => ({x: pivot.x + (p.x - pivot.x) * by, y: pivot.y + (p.y - pivot.y) * by}))), line: null}; } }
    // in the hand: the film's card and its pale edge (the contract measures that rim at 1.33 px), which belongs to the card
    if (pose?.quad) { const k = heldScale(pose.resting, HELD), c = centre(pose.quad); return {pose, q: pts(grown(pose.quad.map(p => ({x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k})), EDGE_PX * (1 - pose.resting))), line: null}; }
    if (pose?.edge) { const [a, b] = pose.edge; return {pose, q: edgeQuad([a.x, a.y], [b.x, b.y], 1.4), line: [[a.x, a.y], [b.x, b.y]]}; }
    return null;
  };
  // The card's line through a frame: an edge-on card's own, or a flat card's middle between its two short sides.
  const lineOf = (d: Drawn): number[][] => { if (d.line) return d.line; const q = d.q, mid = (i: number, j: number) => [(q[i][0] + q[j][0]) / 2, (q[i][1] + q[j][1]) / 2], l = (i: number, j: number) => Math.hypot(q[i][0] - q[j][0], q[i][1] - q[j][1]);
    return l(0, 1) + l(2, 3) <= l(1, 2) + l(3, 0) ? [mid(0, 1), mid(3, 2)] : [mid(0, 3), mid(1, 2)]; };
  const centreOf = (q: number[][]) => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length];
  // the card's direction: along its top and bottom sides for a flat card (the track keeps corner identity), along the line for an
  // edge-on one (the track keeps the line's way round)
  const angleOf = (d: Drawn, flat: boolean) => { if (!flat) { const [a, b] = lineOf(d); return Math.atan2(b[1] - a[1], b[0] - a[0]); } const q = d.q; return Math.atan2(q[1][1] - q[0][1] + q[2][1] - q[3][1], q[1][0] - q[0][0] + q[2][0] - q[3][0]); };
  const median = (a: number, b: number, c: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  // Where the card is over the shutter time of frame `now`: carried rigidly (its centre moving, the card turning) by its step to the
  // frames before and after, of the same kind of shape. The tracker's corners jitter by a pixel or more and now and then jump, so
  // the shape's own changes are left out, and the step is the median of the step back, the step ahead and their mean: one bad
  // frame is outvoted. The smear is held to MAX_BLUR screen pixels.
  function shutter(now: Drawn, before: Drawn | null, after: Drawn | null): number[][][] {
    const flat = !now.line, fits = (d: Drawn | null) => !!d && (flat ? !d.line && d.pose.side === now.pose.side : true);
    const c0 = centreOf(flat ? now.q : now.line!), a0 = angleOf(now, flat);
    const step = (d: Drawn | null, sign: number) => { if (!fits(d)) return null; const c = centreOf(flat ? d!.q : lineOf(d!)), t = Math.atan2(Math.sin(angleOf(d!, flat) - a0), Math.cos(angleOf(d!, flat) - a0));
      return {x: (c[0] - c0[0]) * sign, y: (c[1] - c0[1]) * sign, t: Math.abs(t) < Math.PI / 4 ? t * sign : 0}; };
    const back = step(before, -1), ahead = step(after, 1); if (!back && !ahead) return [now.q];
    const s = back && ahead ? {x: median(back.x, ahead.x, (back.x + ahead.x) / 2), y: median(back.y, ahead.y, (back.y + ahead.y) / 2), t: median(back.t, ahead.t, (back.t + ahead.t) / 2)} : (back ?? ahead)!;
    const reach = Math.max(...(flat ? now.q : now.line!).map(p => Math.hypot(p[0] - c0[0], p[1] - c0[1])));
    let travel = SHUTTER * (Math.hypot(s.x, s.y) + Math.abs(s.t) * reach) * o.pixels(); const k = travel > MAX_BLUR ? MAX_BLUR / travel : 1; travel *= k;
    const n = Math.max(1, Math.min(SAMPLES, Math.ceil(travel / 1.2))); if (n < 2) return [now.q];
    const at = (tau: number, p: number[]) => { const a = s.t * k * tau, cs = Math.cos(a), sn = Math.sin(a), dx = p[0] - c0[0], dy = p[1] - c0[1]; return [c0[0] + cs * dx - sn * dy + s.x * k * tau, c0[1] + sn * dx + cs * dy + s.y * k * tau]; };
    return Array.from({length: n}, (_, i) => { const tau = -SHUTTER / 2 + SHUTTER * (i + 0.5) / n; if (flat) return now.q.map(p => at(tau, p)); const [a, b] = now.line!.map(p => at(tau, p)); return edgeQuad(a, b, 1.4); });
  }
  const art = (choice: Choice) => ({rank: choice.rank, suit: choice.suit}) as never;
  const pts = (q: Pt[]): number[][] => (signedArea(q) < 0 ? [q[1], q[0], q[3], q[2]] : q).map(p => [p.x, p.y]); // a mirrored quad is still drawn facing the eye
  // The side an edge-on frame is turning from or to: the nearest frame that shows one.
  const sideNear = (track: CardTrack, frame: number): 'BACK' | 'FRONT' => { for (let d = 1; d < track.frames.length; d++) for (const i of [frame - d, frame + d]) { const s = track.frames[i]?.side; if (s === 'BACK' || s === 'FRONT') return s; } return 'BACK'; };
  function off() { hide(dealt); hide(seated); composite.visible = depth.visible = seatDepth.visible = false; for (const c of lying) hide(c); o.film.setCards(null); o.film.setMatte(null); }
  // The matte: its passes (their targets are made the first time they run), and the back print as one colour (its mean in linear
  // light), which the film's back is recoloured to. The way 'matte' uses it for every frame; the way 'scene' while a card is carried
  // that is not drawn as an object then (carry).
  const matte = mattePasses(o.renderer, keep), alwaysMatte = o.way === 'matte';
  let backColour: number[] | null = null;
  const backMean = () => backColour ??= (() => { const c = print().image as HTMLCanvasElement; return meanLinear(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data); })();
  // While a film shows its card: the film's own card drawn over in place, the back in the back's colour and the face with its print
  // laid by the track's quad, both shaded by the film (src/scene3d-matte.ts). `alone` (the way 'matte'): no card object then, and the
  // seated card in the shoe window is film too, recoloured like the dealt one; otherwise the objects and the key the scene has laid
  // this frame stay (the seated card, keyed out of the film first, so the matte never sees it). `print`: another file's quads for
  // the face (card-track-matt.json), if read. A print quad that is no card lays no print: the face takes the print's border colour.
  function drawMatte(track: CardTrack | null, at: number, choice: Choice, extra: Extra, alone = true) {
    if (alone) { hide(dealt); hide(seated); composite.visible = depth.visible = seatDepth.visible = false; o.film.setCards(null); }
    const film = o.film.shared.map.value; if (!film) { o.film.setMatte(null); return; }
    const own = track as unknown as MatteTrack, shoe = track?.shoeWindow?.box ?? SHOE_BOX, box = matteBox(own, at, shoe), face = cardFace(cardRecord(extra.cards, extra), false, art(choice));
    const laid = at >= 0 ? printQuad(own, at, (track as {print?: Parameters<typeof printQuad>[2]} | null)?.print) : null, quad = laid && plausible(laid.map(([x, y]) => ({x, y})), 2.5 * PLAUSIBLE.size) ? laid : null;
    o.film.setMatte({box, ...matte.run(film, box, shoe), print: print(face.art), toPrint: toPrint(quad), back: backMean(), paper: PAPER, lying: [LYING.BACK, LYING.FRONT], zone: at >= 0 ? matteZone(own, at) : null,
      shoe: [shoe[0] - MATTE.shoeRoom, shoe[1] - MATTE.shoeRoom, shoe[2] + MATTE.shoeRoom, shoe[3] + MATTE.shoeRoom], faceBack: face.back});
  }

  // The card being dealt as an object under the film, with the film's own card keyed away (way 'scene').
  function dealCard(track: CardTrack | null, at: number, choice: Choice, extra: Extra) {
    const now = at >= 0 ? drawnAt(track!, at, choice, extra) : null, pose = now?.pose ?? null, f = pose ? track!.frames[pose.frame] : null;
    // the next card, seated in the shoe window: its back, lit by the film's light on the film's seated card. Only the window
    // shows it: the shoe around it is film and lies over it.
    const first = track?.frames?.[0], seat = first?.quad?.length === 4 && (first.shoeShare ?? 0) >= 0.9 ? first.quad : SEATED;
    lay(seated, seat, {print: print(), shade: {core: seat, colour: COLOUR.BACK, lying: LYING.BACK}, contact: 0}); seatDepth.visible = true;
    let key: CardKey = {zone: [], core: null, colour: COLOUR.BACK, sides: 2, tint: 2, trust: 0, rim: RIM, shoe: null, over: null, seated: {zone: grown(clockwise(seat.map(([x, y]) => ({x, y}))), RIM + 3).map(p => [p.x, p.y]), core: seat}};
    composite.visible = false;
    if (now && pose && f) {
      const edge = !!now.line, side = pose.side === 'BACK' || pose.side === 'FRONT' ? pose.side : sideNear(track!, pose.frame);
      const face = cardFace(cardRecord(extra.cards, extra), side === 'BACK', art(choice)), material = extra.target ? targets[extra.target]?.material : undefined;
      // in the shoe the card lies in the stack, flat; it bends once it is drawn out, and lies flat again once it rests
      // a track that has measured when the card is in the hand (held) says so itself; else the frames before its rest stand for it
      const inHand = typeof f.held === 'number' ? Math.max(0, Math.min(1, f.held)) : 1 - pose.resting, measured = typeof f.held === 'number';
      const out = track!.leavesShoe == null ? 1 : Math.max(0, Math.min(1, (pose.frame - track!.leavesShoe + 4) / 6)), held = inHand * out;
      // the film's own card, for its light and for what is keyed: the track's film quad where it has one, else the quad the card is drawn by
      const own4 = f.film?.length === 4 ? f.film : f.quad, q = now.q, core = own4?.length === 4 ? own4 : null;
      lay(dealt, q, {print: face.back ? print() : print(face.art), edge, bend: (material?.bend ?? BEND) * held, tilt: TILT * held, gloss: material?.gloss,
        shade: core && !edge ? {core, colour: COLOUR[side], lying: LYING[side]} : null, contact: measured ? 1 - inHand : Math.max(0, Math.min(1, (pose.resting - 0.3) / 0.6))});
      // moving fast: drawn along its path over the shutter time instead, like the film's hand
      const path = pose.resting < 1 ? shutter(now, drawnAt(track!, at - 1, choice, extra), drawnAt(track!, at + 1, choice, extra)) : [q];
      // (only a card that was laid at all: its samples are rigid copies of it, so they are as plausible as it is)
      if (path.length > 1 && dealt.mesh.visible) { drawSamples(path); dealt.mesh.visible = false; composite.visible = true; }
      depth.visible = true;
      // the film's own card goes: its zone is the overlay's (card-overlay.ts filmZone: the film's card and rim grown by 10 px
      // and an eighth of its size, room for motion blur), or a band along the line of an edge-on card
      const line = pose.at ?? pose.edge, film = pose.film ? clockwise(pose.film) : null;
      const zone = film ? grown(film, 10 + 0.12 * Math.sqrt(Math.abs(signedArea(film)))).map(p => [p.x, p.y]) : (() => { const [a, b] = line!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1, ex = (b.x - a.x) / l * 16, ey = (b.y - a.y) / l * 16; return edgeQuad([a.x - ex, a.y - ey], [b.x + ex, b.y + ey], 16); })();
      const own = core ?? (() => { const [a, b] = line!; return edgeQuad([a.x, a.y], [b.x, b.y], 2); })();
      // the shoe window's own card is keyed by the seated card's zone, so the dealt card's zone needs no exception there
      // around a card in the hand both colours count as card (a card bending over shows both); a card lying on the felt shows only
      // its upper side, and the other colour's rules would only catch skin (P1's warm knuckles as the back's cream). The fingers
      // lose the shown side's tint.
      const sides = pose.resting >= 0.5 ? (side === 'BACK' ? 0 : 1) : 2;
      key = {...key, zone, core: clockwise(own.map(([x, y]) => ({x, y}))).map(p => [p.x, p.y]), colour: COLOUR[side], sides, tint: edge ? 2 : side === 'FRONT' ? 1 : 0,
        trust: edge ? 0 : Math.max(0, Math.min(1, ((f.confidence ?? 1) - 0.3) / 0.4)), rim: edge ? 7 : RIM, drawn: edge ? null : q, held: inHand, over: cardInFront(overridesOf(track), pose.frame) && !edge ? q : null};
    } else { hide(dealt); depth.visible = false; }
    o.film.setCards(key);
  }

  return {
    texture: keep(new T.Texture()), // the film itself stays the film's texture: update() returns false
    group,
    update(video: HTMLVideoElement, frame: number, trackIn: unknown, choice: Choice, extraIn?: object | null): boolean {
      if (!video.videoWidth || video.readyState < 2) { off(); return false; }
      const camera = o.camera(), solved = solveCamera(camera), track = trackIn as CardTrack | null, extra = (extraIn ?? {}) as Extra;
      lens.lens.value.set((FILM.width - 1) / 2, (FILM.height - 1) / 2, camera.focalPx, solved.pitch); lens.eye.value.set(0, camera.heightM, 0); lens.edgeRow.value = camera.edgeRow; lens.edgeZ.value = o.edgeZ();
      const at = track?.frames?.length ? Math.max(0, Math.min(track.frames.length - 1, Math.round(frame))) : -1;
      if (alwaysMatte) drawMatte(track, at, choice, extra);
      else {
        // While the card is carried and is not drawn as an object (carry), the film's card is recoloured in place, or (carry 'film')
        // left as the film has it; the object comes in where poseAt starts drawing (firstDrawn).
        const carry = extra.carry ?? 'object', late = !!track && (carry !== 'object' || track.hand === false), landed = late ? restOf(track!) : null;
        const drawn = late ? {...track!, drawnFrom: landed ? (carry === 'film' ? landed.from : landed.from - EASE) : Infinity} : track;
        dealCard(drawn, at, choice, extra);
        if (late && carry !== 'film' && at >= 0 && at < firstDrawn(drawn!)) drawMatte(track, at, choice, extra, false); else o.film.setMatte(null);
      }
      // cards dealt by earlier films of the round, which this film does not show: lying flat where they landed
      const placed = extra.placed ?? [];
      placed.forEach((p, i) => {
        const c = lying[i] ?? (lying[i] = card()), face = cardFace(cardRecord(extra.cards, p), p.back, art(choice));
        lay(c, pts(p.quad), {print: face.back ? print() : print(face.art), contact: 1, gloss: p.target ? targets[p.target]?.material?.gloss : undefined});
      });
      for (let i = placed.length; i < lying.length; i++) hide(lying[i]);
      return false;
    },
    off,
    dispose() { off(); group.removeFromParent(); for (const d of owned) d.dispose(); },
  };
}
