// The model lab's whole picture: the dealer's film behind a table model, seen from the game's camera, for judging a look
// with a dealer in it. A side track (props.html): the game does not use this file.
//
// The film is the scene's own film layer (src/scene3d-film.ts), in one of two ways (HandsId). behind: the whole frame on one
// upright plane behind the table's dealer-side edge, tested against the model's depth, so the model hides what stands behind
// it; her hands, which in the film lie on the film's own table in front of its edge, are then cut by the model's edge.
// felt: as the scene does it, folded: the frame above the film table's edge on an upright plane at the model's edge, and the
// frame below it (hands, forearms and their shadows on the film's table) on the model's felt. The film's own shoe is not
// drawn: the table model has one. Seen from the film camera's place the film is exact; the further the view is turned around
// the table, the more she is the flat picture she is.
//
// Around the table, the room study's recipe of 2026-11-07 (Desktop/wow/rumsstudie-3d-2026-11-07): the room is a photographed
// 360° panorama, and the table takes its light from that same picture (prefiltered, PMREM) and from one soft key where the
// panorama is brightest, which casts the table's shadow on a floor made of the panorama's lower half.
import * as T from 'three';
import {FILM, cameraFromContract, solveCamera, viewFovDeg, type FilmCamera} from './scene3d-geometry.ts';
import {createFilmLayers, createPlayers, FRAME_FIX, type FilmFrame} from './scene3d-film.ts';
import {createFanLight} from './scene3d-light.ts';
import {TABLE} from './scene3d-table.ts';

/** Where a table model has its felt, in the model's own metres: the felt's height, the z of its dealer-side edge (the players sit toward +z) and half the felt's width. Written per model in data/props.json as `stage`. */
export type StageFit = {feltY: number; edgeZ: number; halfWidth: number};
export function stageFit(value: unknown): StageFit | null {
  const v = value as Partial<StageFit> | null, ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return v && ok(v.feltY) && ok(v.edgeZ) && ok(v.halfWidth) && v.halfWidth > 0 ? {feltY: v.feltY, edgeZ: v.edgeZ, halfWidth: v.halfWidth} : null;
}
// pitch and zoom: the game page's lying framing. back: how far behind the edge the film's plane stands when her hands lie behind
// it, dealer metres (behind the model's own rim). shoe: the film's shoe as a box of film pixels (x0, y0, x1, y1), with room for its
// shadow: measured in the idle film, the shoe's lid begins at row 640 (column 1592) and its left side runs down to column 1192,
// while her left sleeve stays left of column 1192 except for 3 pixels about row 710 (a box from 1125, 560 cut up to 70 pixels off
// her sleeve). The rooms are ROOMS below.
export const STAGE_VIEW = {pitch: -8, zoom: 0.84, back: 0.06, film: 'assets/motions/pamela-idle-loop-01/source.mp4', shoe: [1192, 635, FILM.width, 960]};

/**
 * The film's world laid on a table model: one scale and one move (a column-major 4 × 4). The film's felt (y = 0) comes to
 * the model's felt, the middle of the film's dealer-side edge to the middle of the model's, and the film table's width to
 * the model's felt width. eye: where the film camera then stands, in the model's metres.
 */
export function stagePlacement(camera: FilmCamera, fit: StageFit): {scale: number; matrix: number[]; eye: number[]} {
  const scale = fit.halfWidth / (TABLE.a * camera.scale), z = fit.edgeZ + solveCamera(camera).edgeDistance * scale; // the film's edge lies at z = -edgeDistance
  return {scale, matrix: [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, fit.feltY, z, 1], eye: [0, fit.feltY + camera.heightM * scale, z]};
}

/** Where her hands lie: behind the model's dealer-side edge as the whole film on one plane (as it was), or on the model's felt (folded, as the scene does it). */
export type HandsId = 'behind' | 'felt';
// lift: how far above the model's felt (its `feltY`) the folded table layer lies, model metres. The layer is depth tested
// against the model, so what really stands up (the shoe) still hides her hand; the lift keeps the flush tray, its chips and
// the felt's own lumps (up to 1.5 cm over feltY by the dealer's edge) under her hands. From the film camera the picture is the
// same at any height; seen from elsewhere the hands lie that much over the felt.
export const FOLD = {lift: 0.02};
const BEHIND: FilmFrame = {scale: 1, anchor: [FRAME_FIX.x, FRAME_FIX.y], layer: 'BEHIND_TABLE', shadow: false, back: STAGE_VIEW.back};
// Her contact shadow on the felt when her hands lie on it. The film's green table is evenly lit and gives the hands almost no
// shadow, so the felt under them would be as bright as beside them. Here her own outline in the film is softened and moved a
// little down the picture (what lies on or just over the felt shades the felt right under it, which the film camera sees just
// below it) and laid under the hands as a darkening of the felt. strength: its darkness; blur, drop: film pixels (her hand is about
// 150 film pixels wide, so about 15 pixels a centimetre there: the drop is a finger's height over the felt under a light from above).
export const CONTACT = {strength: 0.5, blur: 8, drop: 14};
const CONTACT_VERTEX = 'varying vec4 vFilm; uniform mat4 filmVP; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vFilm = filmVP * w; gl_Position = projectionMatrix * viewMatrix * w; }';
const CONTACT_FRAGMENT = `varying vec4 vFilm; uniform sampler2D map; uniform vec4 hide; uniform float strength, blur, drop, lo, hi;
const vec2 FILM_PX = vec2(${FILM.width}., ${FILM.height}.);
// how much of her (not screen) a film pixel is, keyed as the film layers key it; nothing inside the box the page leaves undrawn (the shoe)
float matte(vec2 px, vec3 key, float dk){
  if (hide.z > hide.x && px.x > hide.x && px.x < hide.z && px.y > hide.y && px.y < hide.w) return 0.;
  vec3 c = texture2D(map, vec2(px.x / FILM_PX.x, 1. - px.y / FILM_PX.y)).rgb; return 1. - clamp(((c.g - max(c.r, c.b)) / dk - lo) / (hi - lo), 0., 1.);
}
void main(){
  if (vFilm.w <= 0.) discard;
  vec2 uv = vFilm.xy / vFilm.w * .5 + .5; if (uv.x < .001 || uv.x > .999 || uv.y < .001 || uv.y > .999) discard;
  vec3 key = texture2D(map, vec2(.02, .03)).rgb; float dk = max(key.g - max(key.r, key.b), .05);
  vec2 px = vec2(uv.x, 1. - uv.y) * FILM_PX - vec2(0., drop); float sum = 0., n = 0.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 o = vec2(float(i), float(j)) * blur * .5; float w = exp(-dot(o, o) / (blur * blur)); sum += matte(px + o, key, dk) * w; n += w; }
  float a = strength * sum / n; if (a < .004) discard;
  gl_FragColor = vec4(0., 0., 0., a);
}`;

export function createStage(contract: Parameters<typeof cameraFromContract>[0]) {
  const camera = cameraFromContract(contract), solved = solveCamera(camera), edge = -solved.edgeDistance;
  const filmCam = new T.PerspectiveCamera(solved.fovYDeg, FILM.width / FILM.height, 0.05, 200);
  filmCam.position.set(0, camera.heightM, 0); filmCam.rotation.set(-solved.pitch, 0, 0, 'YXZ'); filmCam.updateProjectionMatrix(); filmCam.updateMatrixWorld(true);
  const own = new T.Matrix4().multiplyMatrices(filmCam.projectionMatrix, filmCam.matrixWorldInverse), filmVP = new T.Matrix4(), back = new T.Matrix4();
  const film = createFilmLayers(filmVP, createFanLight().uniforms), group = new T.Group(); group.add(film.body, film.table); group.matrixAutoUpdate = false;
  const players = createPlayers(texture => film.setTexture(texture), () => {});
  film.setKey({lo: 0.12, hi: 0.9, shadow: 1}); film.setHide(STAGE_VIEW.shoe);
  const contact = new T.Mesh(new T.PlaneGeometry(10, 2).rotateX(-Math.PI / 2), new T.ShaderMaterial({vertexShader: CONTACT_VERTEX, fragmentShader: CONTACT_FRAGMENT, transparent: true, depthWrite: false,
    uniforms: {map: film.shared.map, filmVP: {value: filmVP}, hide: {value: new T.Vector4().fromArray(STAGE_VIEW.shoe)}, strength: {value: CONTACT.strength}, blur: {value: CONTACT.blur}, drop: {value: CONTACT.drop}, lo: {value: 0.12}, hi: {value: 0.9}}}));
  contact.renderOrder = 4; group.add(contact);
  let playing = false, hands: HandsId = 'behind';
  // Folded, the table layer lies FOLD.lift over the felt (in film metres: the lift over the model's metres per film metre), and her
  // contact shadow a millimetre under it.
  function seat(mode: HandsId) {
    hands = mode; film.setFrame(mode === 'felt' ? null : BEHIND); film.place(edge, true, false, camera.scale);
    const perMetre = group.matrix.elements[0] || 1; contact.visible = mode === 'felt'; contact.position.set(0, 0.0015 + (FOLD.lift - 0.001) / perMetre, edge + 1);
    if (mode === 'felt') film.table.position.y = 0.0015 + FOLD.lift / perMetre;
  }
  seat(hands);
  return {
    group, // goes into the model, beside its meshes: its matrix is in the model's metres
    place(fit: StageFit) { group.matrix.fromArray(stagePlacement(camera, fit).matrix); group.matrixWorldNeedsUpdate = true; seat(hands); },
    seat, get hands() { return hands; },
    /** The film camera follows the model wherever the lab has put it; called before every drawn frame. */
    update() { group.updateWorldMatrix(true, false); filmVP.multiplyMatrices(own, back.copy(group.matrixWorld).invert()); },
    play() { if (playing) players.toggle(false); else { playing = true; players.play([{path: STAGE_VIEW.film}], {loop: true}); } },
    pause() { if (playing) players.toggle(true); },
    /** Where the film camera stands and what it looks at in the lab's world, tilted and zoomed as the game page does it. */
    pose(aspect: number) {
      group.updateWorldMatrix(true, false);
      const eye = new T.Vector3(0, camera.heightM, 0).applyMatrix4(group.matrixWorld), tilt = solved.pitch - STAGE_VIEW.pitch * Math.PI / 180;
      const reach = Math.hypot(camera.heightM - 0.3 * camera.scale, edge) * group.matrixWorld.getMaxScaleOnAxis(); // to her chest
      return {eye, target: eye.clone().addScaledVector(new T.Vector3(0, -Math.sin(tilt), -Math.cos(tilt)).transformDirection(group.matrixWorld), reach), reach, fov: viewFovDeg(camera, aspect, STAGE_VIEW.zoom)};
    },
  };
}

// ── the room around the stage ───────────────────────────────────────────────
// shown: how bright the panorama is shown, and so how strong its light on the table is (exposure matched: a white surface that
// sees the whole room comes out as bright as the room around it). turn: radians the panorama is turned about the vertical, so
// that something quiet stands behind her. ground: what the panorama is laid on when it has a floor, model metres: eye = how high
// over that floor the panorama was taken, walls = how far away its walls stand, ceiling = how high; a fit by eye, as in the room
// study, not a measured room. The casino is shown dim (its tables are lit and the hall is not); the penthouse and the forest are
// lit by daylight, which falls on their floors as on the table, so they are shown nearly as bright as the table. Skyline is turned
// so that its low sun comes from behind the camera and a little from the left, as the light on her in the film does; behind her
// are its windows. The images are the scene's three panoramas (local media; their origin is in HANDOFF).
export type RoomId = 'vegas' | 'la' | 'skog';
export type Room = {id: RoomId; label: string; file: string; shown: number; turn: number; ground: {eye: number; walls: number; ceiling: number}};
export const ROOMS: Room[] = [
  {id: 'vegas', label: 'Las Vegas', file: 'assets/scene/panorama-vegas.jpg', shown: 0.55, turn: Math.PI, ground: {eye: 1.7, walls: 9, ceiling: 4.5}},
  {id: 'la', label: 'Skyline', file: 'assets/scene/panorama-la.jpg', shown: 0.85, turn: -1, ground: {eye: 1.7, walls: 7, ceiling: 3.6}},
  {id: 'skog', label: 'Skog', file: 'assets/scene/panorama-skog.jpg', shown: 0.85, turn: Math.PI / 2, ground: {eye: 1.7, walls: 40, ceiling: 60}},
];

/** A pixel of a panorama as a direction in its own frame, three.js's equirectangular one: column c of w at azimuth (c + ½)/w·2π − π from +x toward +z, row 0 straight up. */
export function panoramaDirection(column: number, row: number, width: number, height: number): [number, number, number] {
  const lat = (0.5 - (row + 0.5) / height) * Math.PI, phi = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
  return [Math.cos(lat) * Math.cos(phi), Math.sin(lat), Math.cos(lat) * Math.sin(phi)];
}
/** A direction of the panorama's own frame where it lies in the world when the panorama is turned by `turn` about the vertical, as scene.backgroundRotation.y and environmentRotation.y turn it. */
export const turnY = (v: number[], turn: number): [number, number, number] => [v[0] * Math.cos(turn) + v[2] * Math.sin(turn), v[1], -v[0] * Math.sin(turn) + v[2] * Math.cos(turn)];
const linear = (byte: number) => { const c = byte / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

// The key: the brightest `share` of the panorama's sky half (by solid angle, no lower than `lowest` degrees over the horizon),
// its direction and colour weighted by its light. A photographed room is clipped where it is brightest (a lamp is no whiter than
// a wall it lights), so prefiltered it lights the table too weakly and too evenly; the key gives back the light, the direction
// and the shadow of its lamps. How strong: as strong as the light on the table in her film, since her hands lie on the felt and
// the felt under them must be lit as they are. table: that light, linear, a white surface facing up = 1: her hands in
// pamela-idle-loop-01 (frame 30) measure 0.41 in linear brightness, and light skin gives back about 0.4 of the light that falls on
// it (an estimate, not measured here). softest: the sine of the lowest key that is counted at its height; a lower one (a setting
// sun) is counted as that high, so that it does not blind the table.
export const KEY = {share: 0.02, lowest: 12, table: 1, softest: 0.25};
export type RoomKey = {direction: [number, number, number]; colour: [number, number, number]; up: number; share: number};
/**
 * Reads a panorama (RGBA bytes, row 0 at the top, sRGB) for its light: `direction` toward its brightest part in the panorama's
 * own frame (straight up when it is black), `colour` of that light (linear, brightest channel 1), `up` the light a white surface
 * facing up receives from the whole panorama (the cosine-weighted mean, linear), `share` how much of the sky half's light comes
 * from the brightest part.
 */
export function roomKey(pixels: ArrayLike<number>, width: number, height: number, share = KEY.share, lowest = KEY.lowest): RoomKey {
  const count = width * height, lum = new Float32Array(count), area = new Float32Array(count), sky: number[] = [], floor = Math.sin(lowest * Math.PI / 180);
  let upSum = 0, upWeight = 0, skyArea = 0;
  for (let row = 0, i = 0; row < height; row++) for (let column = 0; column < width; column++, i++) {
    const p = i * 4, d = panoramaDirection(column, row, width, height); area[i] = Math.sqrt(1 - d[1] * d[1]); // a pixel's solid angle goes with the cosine of its latitude
    lum[i] = 0.2126 * linear(pixels[p]) + 0.7152 * linear(pixels[p + 1]) + 0.0722 * linear(pixels[p + 2]);
    if (d[1] > 0) { upSum += lum[i] * d[1] * area[i]; upWeight += d[1] * area[i]; }
    if (d[1] >= floor) { sky.push(i); skyArea += area[i]; }
  }
  sky.sort((a, b) => lum[b] - lum[a]);
  const dir = [0, 0, 0], colour = [0, 0, 0]; let taken = 0, power = 0, skyPower = 0;
  for (const i of sky) {
    skyPower += lum[i] * area[i]; if (taken >= share * skyArea) continue;
    const d = panoramaDirection(i % width, Math.floor(i / width), width, height), w = lum[i] * area[i]; taken += area[i]; power += w;
    for (let k = 0; k < 3; k++) { dir[k] += d[k] * w; colour[k] += linear(pixels[i * 4 + k]) * w; }
  }
  const length = Math.hypot(dir[0], dir[1], dir[2]), top = Math.max(colour[0], colour[1], colour[2]);
  return {direction: length > 0 ? [dir[0] / length, dir[1] / length, dir[2] / length] : [0, 1, 0], colour: top > 0 ? [colour[0] / top, colour[1] / top, colour[2] / top] : [1, 1, 1], up: upWeight ? upSum / upWeight : 0, share: skyPower ? power / skyPower : 0};
}
/**
 * The key's intensity as three.js reads a directional light (on a white surface facing it, intensity / π) such that the felt gets
 * KEY.table in all: what the prefiltered room gives a surface facing up at the brightness it is shown at, and the key the rest.
 * Never less than nothing.
 */
export const keyStrength = (key: RoomKey, shown: number) => Math.PI * Math.max(0, KEY.table - key.up * shown) / Math.max(key.direction[1], KEY.softest);
/** Where a model meets the floor: the box {x0, z0, x1, z1} of its vertices (x, y, z after each other) lower than `below`, or null when none is. */
export function footprint(positions: ArrayLike<number>, below = 0.05): {x0: number; z0: number; x1: number; z1: number} | null {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) if (positions[i + 1] < below) { x0 = Math.min(x0, positions[i]); x1 = Math.max(x1, positions[i]); z0 = Math.min(z0, positions[i + 2]); z1 = Math.max(z1, positions[i + 2]); }
  return x0 <= x1 ? {x0, z0, x1, z1} : null;
}

// The room with a floor: the panorama laid on a floor, upright walls and a ceiling round the table (the room study's
// panorama-room.mjs, GroundedSkybox for the forest), so that the legs stand on the room's own floor and move against it when the
// view moves. Each pixel takes the panorama in the direction from the point it was taken from (`eye` over the floor, over the
// table's middle). blur: levels of the picture's detail pyramid added near the table and far from it (the room is out of focus,
// the floor under the table less so); near, far: where the one gives way to the other, model metres from the table's middle.
export const SHELL = {nearBlur: 0.6, farBlur: 3.6, near: 1.5, far: 6};
const SHELL_VERTEX = 'varying vec3 vDir; uniform vec3 centre; void main(){ vDir = position - centre; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const SHELL_FRAGMENT = `varying vec3 vDir; uniform sampler2D map; uniform float turn, shown, width, near, far, nearBlur, farBlur;
void main(){
  vec3 d = normalize(vDir); float c = cos(turn), s = sin(turn);
  vec3 t = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z); // the room turned back: the direction in the panorama's own frame
  vec2 uv = vec2(atan(t.z, t.x) * .15915494 + .5, asin(clamp(t.y, -1., 1.)) * .31830989 + .5);
  // the level of detail from how far the direction turns across this pixel, so that no seam shows where u wraps round; and
  // straight down, where a photographed panorama is smeared (the tripod retouched away), blurred to a soft patch
  float lod = log2(max(length(fwidth(d)) * width * .15915494, 1e-3)) + mix(nearBlur, farBlur, smoothstep(near, far, length(vDir.xz))) + 3. * smoothstep(.8, .96, -t.y);
  gl_FragColor = vec4(textureLod(map, uv, max(lod, 0.)).rgb * shown, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** The panorama on a floor (y = 0), walls and a ceiling, model metres; drawn first and behind everything. */
export function createShell(map: T.Texture, room: Room) {
  const geometry = new T.SphereGeometry(1, 160, 80), p = geometry.getAttribute('position') as T.BufferAttribute, {eye, walls, ceiling} = room.ground;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), across = Math.hypot(x, z);
    const reach = Math.min(across > 1e-6 ? walls / across : Infinity, y < -1e-6 ? eye / -y : y > 1e-6 ? (ceiling - eye) / y : Infinity);
    p.setXYZ(i, x * reach, eye + y * reach, z * reach);
  }
  p.needsUpdate = true; geometry.computeBoundingSphere();
  const image = map.image as {width?: number} | undefined;
  const material = new T.ShaderMaterial({vertexShader: SHELL_VERTEX, fragmentShader: SHELL_FRAGMENT, side: T.BackSide, depthWrite: false,
    uniforms: {map: {value: map}, centre: {value: new T.Vector3(0, eye, 0)}, turn: {value: room.turn}, shown: {value: room.shown}, width: {value: image?.width ?? 2048}, near: {value: SHELL.near}, far: {value: SHELL.far}, nearBlur: {value: SHELL.nearBlur}, farBlur: {value: SHELL.farBlur}}});
  const mesh = new T.Mesh(geometry, material); mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}
// What the floor takes from the table: the key's shadow (a shadow-only plane over the room's floor, `shadow` its darkness), and
// where the table stands a soft darkening for the room light it keeps from the floor around its foot (`contact` its darkness,
// `spread` how far it reaches past the foot). Model metres.
// The darkening is strongest at the foot's own outline and gone a few centimetres past it (the foot lies at 1 / spread of the patch).
export const GROUND = {shadow: 0.6, contact: 0.7, spread: 1.3};
export function createGround(foot: {x0: number; z0: number; x1: number; z1: number}) {
  const group = new T.Group(), canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!, fade = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.72, 'rgba(0,0,0,.9)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fade; g.fillRect(0, 0, 128, 128);
  const contact = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false, opacity: GROUND.contact}));
  contact.scale.set((foot.x1 - foot.x0) * GROUND.spread, 1, (foot.z1 - foot.z0) * GROUND.spread); contact.position.set((foot.x0 + foot.x1) / 2, 0.001, (foot.z0 + foot.z1) / 2); contact.renderOrder = -6;
  const catcher = new T.Mesh(new T.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new T.ShadowMaterial({opacity: GROUND.shadow, depthWrite: false}));
  catcher.position.y = 0.002; catcher.receiveShadow = true; catcher.renderOrder = -5;
  group.add(contact, catcher);
  return group;
}

// ── the photographed surface ("Fotomaterial") ───────────────────────────────
// A Meshy model is one mesh with one material and one atlas of small islands (the table: 2048 px here, 4096 in Meshy's own
// file, about 410 texels per metre on felt and wood): felt, wood and leather are not separate parts. They are told apart texel
// by texel by the model's own colour (green felt, red-brown wood, near-black leather), and there the room study's photographed
// maps take over (Poly Haven, CC0, data/scene-materials.json), laid on in the model's own metres from three sides (triplanar),
// since the atlas islands lie every which way. The print, brass, chips and everything else keep the model's own.
// tile: metres per repeat of each map (the weave is a denim's, so it is laid fine and faint: felt shows no twill at this distance;
// the wood is a plank tabletop, so it is laid long). relief: strength of its normal map. woodTint: the photographed wood (a light oak) times
// this is the model's mahogany (the ratio of the two images' mean linear colours); woodShade: the mean linear brightness of the
// model's own wood, half of whose light and dark (its panels and edges) stays. feltColour: the model's own felt (the mean of its
// felt texels, sRGB), laid on evenly, so that the atlas's patches and seams go.
export const PHOTO = {tile: {felt: 0.05, leather: 0.16, wood: 1.1}, relief: {felt: 0.15, leather: 0.45, wood: 0.3}, woodTint: [0.377, 0.079, 0.185], woodShade: 0.0138, feltColour: [13, 69, 53]};
export const PHOTO_MAPS = {wood: 'wood_table-diffuse', woodNormal: 'wood_table-nor_gl', woodRough: 'wood_table-rough', leatherNormal: 'brown_leather-nor_gl', leatherRough: 'brown_leather-rough', feltNormal: 'denim_fabric-nor_gl', feltRough: 'denim_fabric-rough'} as const;
export type PhotoMaps = Record<keyof typeof PHOTO_MAPS, T.Texture>;
export function loadPhotoMaps(): Promise<PhotoMaps> {
  const loader = new T.TextureLoader();
  return Promise.all(Object.entries(PHOTO_MAPS).map(([key, name]) => loader.loadAsync(`assets/scene/materials/${name}.webp`).then(t => {
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; t.colorSpace = key === 'wood' ? T.SRGBColorSpace : T.NoColorSpace; return [key, t] as const; }))).then(list => Object.fromEntries(list) as PhotoMaps);
}
const PHOTO_VARYINGS = 'varying vec3 vObj; varying vec3 vObjN; varying vec3 vAxX; varying vec3 vAxY; varying vec3 vAxZ;';
const PHOTO_PARS = `uniform sampler2D photoWood, photoWoodN, photoWoodR, photoLeatherN, photoLeatherR, photoFeltN, photoFeltR; uniform vec3 photoFelt, photoTint, photoTile, photoRelief; uniform float photoShade;
vec3 photoBlend(vec3 n){ vec3 w = pow(abs(n), vec3(4.)); return w / max(w.x + w.y + w.z, 1e-5); }
vec4 photoTri(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
// a photographed relief from three sides on the model's own normal n (whiteout blend), in the model's frame
vec3 photoNormal(sampler2D t, vec3 p, vec3 n, vec3 w, float s){
  vec3 a = texture2D(t, p.zy).xyz * 2. - 1., b = texture2D(t, p.xz).xyz * 2. - 1., c = texture2D(t, p.xy).xyz * 2. - 1.; a.xy *= s; b.xy *= s; c.xy *= s;
  a = vec3(a.xy + n.zy, abs(a.z) * n.x); b = vec3(b.xy + n.xz, abs(b.z) * n.y); c = vec3(c.xy + n.xy, abs(c.z) * n.z);
  return normalize(a.zyx * w.x + b.xzy * w.y + c.xyz * w.z);
}`;
// What the model's own colour is (roughly as stored, sRGB): felt green, wood red-brown and not light, leather near black without colour.
const PHOTO_COLOUR = `vec3 photoOwn = sampledDiffuseColor.rgb, photoS = pow(max(photoOwn, vec3(0.)), vec3(1. / 2.2));
float photoHi = max(photoS.r, max(photoS.g, photoS.b)), photoLo = min(photoS.r, min(photoS.g, photoS.b));
float pFelt = smoothstep(.05, .12, photoS.g - photoS.r) * (1. - smoothstep(.42, .52, photoS.g)) * (1. - smoothstep(.06, .14, photoS.b - photoS.g));
float pWood = smoothstep(.06, .13, photoS.r - photoS.g) * (1. - smoothstep(.42, .55, photoS.r)) * (1. - smoothstep(.2, .3, photoS.g));
float pDark = (1. - smoothstep(.2, .28, photoHi)) * (1. - smoothstep(.05, .1, photoHi - photoLo)) * (1. - pFelt) * (1. - pWood);
vec3 pN0 = normalize(vObjN), pW = photoBlend(pN0); float pShade = dot(photoOwn, vec3(.2126, .7152, .0722));
vec3 pWoodC = photoTri(photoWood, vObj / photoTile.z, pW).rgb * photoTint * mix(1., clamp(pShade / photoShade, .35, 1.6), .5);
vec3 pFeltC = photoFelt * mix(1., clamp(pShade / max(dot(photoFelt, vec3(.2126, .7152, .0722)), 1e-4), .6, 1.4), .25);
diffuseColor.rgb = mix(mix(diffuseColor.rgb, pWoodC, pWood), pFeltC, pFelt);`;
const PHOTO_ROUGH = `roughnessFactor = mix(roughnessFactor, mix(.88, 1., photoTri(photoFeltR, vObj / photoTile.x, pW).g), pFelt);
roughnessFactor = mix(roughnessFactor, .16 + .25 * photoTri(photoWoodR, vObj / photoTile.z, pW).g, pWood); // lacquered, the grain a little duller
roughnessFactor = mix(roughnessFactor, .4 + .45 * photoTri(photoLeatherR, vObj / photoTile.y, pW).g, pDark);`;
const PHOTO_NORMAL = `float pAll = clamp(pFelt + pWood + pDark, 0., 1.); vec3 pN = pN0 * faceDirection;
vec3 pO = normalize(photoNormal(photoFeltN, vObj / photoTile.x, pN, pW, photoRelief.x) * pFelt + photoNormal(photoLeatherN, vObj / photoTile.y, pN, pW, photoRelief.y) * pDark + photoNormal(photoWoodN, vObj / photoTile.z, pN, pW, photoRelief.z) * pWood + pN * 1e-3);
normal = normalize(mix(normal, normalize(pO.x * vAxX + pO.y * vAxY + pO.z * vAxZ), pAll));`;
/** The model's own material with the photographed felt, wood and leather where its colour says so; the original is not changed. */
export function photoMaterial(own: T.MeshStandardMaterial, maps: PhotoMaps): T.MeshStandardMaterial {
  const material = own.clone(), felt = new T.Color().setRGB(PHOTO.feltColour[0] / 255, PHOTO.feltColour[1] / 255, PHOTO.feltColour[2] / 255, T.SRGBColorSpace);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {photoWood: {value: maps.wood}, photoWoodN: {value: maps.woodNormal}, photoWoodR: {value: maps.woodRough}, photoLeatherN: {value: maps.leatherNormal}, photoLeatherR: {value: maps.leatherRough}, photoFeltN: {value: maps.feltNormal}, photoFeltR: {value: maps.feltRough},
      photoFelt: {value: new T.Vector3(felt.r, felt.g, felt.b)}, photoTint: {value: new T.Vector3(...PHOTO.woodTint)}, photoTile: {value: new T.Vector3(PHOTO.tile.felt, PHOTO.tile.leather, PHOTO.tile.wood)},
      photoRelief: {value: new T.Vector3(PHOTO.relief.felt, PHOTO.relief.leather, PHOTO.relief.wood)}, photoShade: {value: PHOTO.woodShade}});
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${PHOTO_VARYINGS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal; vAxX = normalize(normalMatrix * vec3(1., 0., 0.)); vAxY = normalize(normalMatrix * vec3(0., 1., 0.)); vAxZ = normalize(normalMatrix * vec3(0., 0., 1.));');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${PHOTO_VARYINGS}\n${PHOTO_PARS}`).replace('#include <map_fragment>', `#include <map_fragment>\n${PHOTO_COLOUR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${PHOTO_ROUGH}`).replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1. - clamp(pFelt + pWood + pDark, 0., 1.);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${PHOTO_NORMAL}`);
  };
  material.customProgramCacheKey = () => 'props-photo';
  return material;
}
