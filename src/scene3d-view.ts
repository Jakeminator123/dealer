// The 3D scene: film camera, view camera, background blur, focus and the final picture.
// Order of drawing: the room into a half-size target, blurred by distance; then table and film on top.
// With focus off, table and film are drawn straight to the screen and stay sharp (the look of checkpoint v1).
// With focus on, they go through a full-size target and are blurred by their own distance from the focus.
import * as T from 'three';
import {DEALER_LENS_ESTIMATE, FILM, aimCorrection, betSpots, cameraFromContract, cardFocusPixel, cardPixel, cardSpots, cloudLevel, filmToScene, flickerLevel, sceneToSpot, solveCamera, spotToScene, viewFovDeg, type CardTrack, type FilmCamera} from './scene3d-geometry.ts';
import {EVEN, createFilmLayers, createPlayers, evenFor, frameAt, lightOnDealer, matchLeft, roomFlashAt, roomGlow, toneMatch, toneOf, toneUnder, type FilmTone, type Part, type RoomGlow, type ToneMatch} from './scene3d-film.ts';
import {createFanLight} from './scene3d-light.ts';
import {createChipTray, TRAY} from './scene3d-props.ts';
import {createRooms, type Panorama, type RoomId} from './scene3d-room.ts';
import {CHANGE_FRAGMENT, SHIMMER_GLSL, readyFrom, retake, roomChange, shiftProgress, shimmerLevel} from './scene3d-shift.ts';
import {createTable, lightFromAbove, sized, type TableBase, type TableCloth, type TableSurface} from './scene3d-table.ts';
import {createRailExtras} from './scene3d-rail.ts';
import {createSmoke} from './scene3d-smoke.ts';
import {createMouthLayer} from './scene3d-mouth.ts';

export type SceneState = {
  room: RoomId; blur: number; depthBlur: boolean; dofRange: number; exposure: number; panoramaTurn: number;
  mode: 'look' | 'lean'; yaw: number; pitch: number; zoom: number; dx: number; dy: number; dz: number; aim: boolean; sway: boolean; fold: boolean; guides: boolean;
  format: 'desk' | 'mob' | 'fill'; logo: string; felt: string; lens: 'plan' | 'estimate'; scale: number;
  keyLo: number; keyHi: number; shadow: number;
  focus: 'off' | 'dealer' | 'card' | 'follow' | 'manual'; focusDistance: number; tolerance: number;
  fan: boolean; fanStrength: number; fanPeriod: number;
  tray: boolean; cups: boolean; base: TableBase; surface: TableSurface; roomLight: number; tableSize: number;
  cards: boolean; cardMethod: 'scene' | 'film' | 'matte'; cardRank: string; cardSuit: string; cardScale: number; cardHand: 'film' | 'standard';
  clock: boolean; dust: number; flicker: boolean; flickerEvery: number; flickerStrength: number;
  filmBright: number; filmWarm: number; wrap: number;
  roomShift: 'cut' | 'shimmer'; roomShiftSeconds: number;
  // Lab trials of 2026-11-12, each at its default exactly the picture before them. shadowAbove: share of the keyed shadow kept above
  // the table edge (1 all, 0 none). marks: the kinds of print on the felt ("all", "none" or a comma list, FELT_MARKS). cloth: the
  // felt's colour and weave (print, v6: V6's cloth, or runway: the felt of a generated photograph of the table). lamp: share of the table's light from a lamp above the dealer (0 to 1).
  // chipGloss: the chips' gloss (0 to 1; 0.5 is their look before), read by the page that lays chips.
  shadowAbove: number; marks: string; cloth: TableCloth; lamp: number; chipGloss: number;
  // Lab trials of 2026-11-13, at their defaults the picture before them. roomLife: films over the people of a panorama, where the
  // room has them (ROOM_LIFE in scene3d-room.ts). dealerRoom: share of the panorama's light the film takes (0 to 1; lightOnDealer in scene3d-film.ts).
  roomLife: boolean; dealerRoom: number;
  // The film itself (src/scene3d-film.ts). filmEven: the films of one generator brought to the colour of the other's, and each film
  // begun in the tone of the one before it, so that the light does not shift where they join (evenFor, toneMatch); off is the films as
  // they are. filmTempo: how many times faster the films of a round play in the queue (1 to 2; 1 is as filmed; a rest film and a spoken
  // line keep their speed, and a take played by itself is never hurried). dealerLife: a slow movement added to her head and upper body
  // (0 to 2; 0 is none; lifeShift).
  filmEven: boolean; filmTempo: number; dealerLife: number;
  smoke: number; // low smoke over the table, 0 to 1 (src/scene3d-smoke.ts); 0 is none
  shelf: boolean; // the serving shelf behind the dealer's edge at her right hand (SHELF in src/scene3d-table.ts)
  edgeClean: number; // the screen's green taken out of her outline, 0 to 1 (setEdge in src/scene3d-film.ts); 0 is the key as it is, 1 the standard since 2026-11-13
  tal: 'repliker' | 'av'; // the game's: the dealer says her fixed lines with her talk films ('av': as text in the chat only; src/game-page.ts)
};
// What was added after checkpoint v1 starts switched off, so that the page opens as v1, except what Jakob has made the standard
// (2026-11-13: "det ska bli en linje"): the films evened in colour (filmEven), the
// cup holders in the rail (cups), life in her upper body (dealerLife) and her outline cleaned of the screen's colour (edgeClean). scale 0 = the contract's own k.
export const DEFAULTS: SceneState = {
  room: 'salong', blur: 11, depthBlur: true, dofRange: 4.5, exposure: 1, panoramaTurn: 90,
  mode: 'look', yaw: 0, pitch: 0, zoom: 1, dx: 0, dy: 0, dz: 0, aim: true, sway: false, fold: true, guides: false,
  format: 'desk', logo: 'SCOUT GAMING', felt: 'green', lens: 'plan', scale: 0,
  keyLo: 0.12, keyHi: 0.9, shadow: 1,
  focus: 'off', focusDistance: 1.5, tolerance: 0.4,
  fan: false, fanStrength: 0.16, fanPeriod: 5,
  tray: false, cups: true, base: 'column', surface: 'painted', roomLight: 1, tableSize: 1,
  cards: false, cardMethod: 'scene', cardRank: 'A', cardSuit: 'spades', cardScale: 1.2, cardHand: 'film',
  clock: false, dust: 0, flicker: false, flickerEvery: 20, flickerStrength: 0.6,
  filmBright: 1, filmWarm: 0, wrap: 0,
  roomShift: 'cut', roomShiftSeconds: 2.6,
  shadowAbove: 1, marks: 'all', cloth: 'print', lamp: 0, chipGloss: 0.5,
  roomLife: false, dealerRoom: 0,
  filmEven: true, filmTempo: 1, dealerLife: 1,
  edgeClean: 1, shelf: false,
  smoke: 0,
  tal: 'repliker',
};
// rooms: the panorama rooms of the register (data/scene-rooms.json, readRegister in scene3d-room.ts); without it the first three, at urls.
export type SceneData = {contract: Parameters<typeof cameraFromContract>[0]; plan: Parameters<typeof cardSpots>[0]; urls: {plate: string; panorama: string; la: string; skog: string}; rooms?: Panorama[]; onChange: () => void; onMissingRoom: (room: RoomId) => void};

const W = FILM.width, H = FILM.height, RAD = Math.PI / 180;
// How the prefiltered room is turned against the sphere that shows it, radians. Checked 2026-11-11 with a black test picture
// with coloured discs and a mirror ball on the felt lit by the table's own map: each disc lies on the ball on the side where
// the sphere shows it behind the dealer, for a mirrored and for a right-way-round room, so 0.
const ROOM_TURN = 0;
const FS_VERTEX = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
// mode 0: even blur. mode 1: blur grows with distance behind the dealer (an artistic ramp, the v1 look).
// mode 2: lens, blur grows with the distance from the focus; a sample only spreads as far as its own blur reaches,
// so something in focus does not smear into what is blurred next to it.
const BLUR_FRAGMENT = `varying vec2 vUv; uniform sampler2D map, depthMap; uniform vec2 dir; uniform float near, far, mode, start, range, focus, tol;
float amount(vec2 uv){
  if (mode < .5) return 1.;
  float z = texture2D(depthMap, uv).x, dist = near * far / (far - (far - near) * z);
  if (mode < 1.5) return mix(.08, 1., smoothstep(start, start + range, dist));
  return clamp((abs(dist - focus) / max(dist, focus) - tol) / (1. - tol), 0., 1.); // lensBlur in scene3d-geometry.ts
}
void main(){
  float c = amount(vUv), w = 0.; vec4 s = vec4(0.);
  for (int i = -7; i <= 7; i++) {
    vec2 uv = vUv + dir * c * float(i); float g = exp(-float(i * i) / 10.);
    if (mode > 1.5 && i != 0) g *= clamp((amount(uv) * 3. - abs(float(i)) * c / 2.2) * 8. + 1., 0., 1.);
    s += clamp(texture2D(map, uv), 0., 64.) * g; w += g; // bounded: one pixel without a number would become a black square
  }
  gl_FragColor = s / w;
}`;
// The V6 plate fixed to the frame, darkened and desaturated as V6 does it.
const PLATE_FRAGMENT = 'varying vec2 vUv; uniform sampler2D map; uniform vec2 scale; void main(){ vec3 c = texture2D(map, (vUv - .5) * scale + .5).rgb; float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, .65) * .34; gl_FragColor = vec4(c, 1.); }';
// Room: exposure, a soft shoulder, vignette, sRGB. Foreground (already sRGB, premultiplied) goes on top unchanged.
const OUT_HEAD = 'varying vec2 vUv; uniform sampler2D map, fg; uniform float exposure, useFg;';
const OUT_TAIL = `c = c / (1. + c) * 1.3;
  c *= mix(.62, 1., smoothstep(1.05, .35, length((vUv - .5) * vec2(1.25, 1.1))));
  c = pow(max(c, 0.), vec3(1. / 2.2));
  if (useFg > .5) { vec4 f = texture2D(fg, vUv); c = f.rgb + c * (1. - f.a); }
  gl_FragColor = vec4(c, 1.);
}`;
const OUT_FRAGMENT = `${OUT_HEAD}
void main(){
  vec3 c = texture2D(map, vUv).rgb * exposure; ${OUT_TAIL}`;
// The same picture while a change of room is under way: the shimmer (scene3d-shift.ts) lies over the room and under the
// foreground. It is light added to the room before the shoulder, and a curtain that hides part of the room behind it.
const SHIFT_OUT_FRAGMENT = `${OUT_HEAD}
${SHIMMER_GLSL}
void main(){
  vec2 bent; vec4 over = shimmerOver(vUv, bent); vec3 c = texture2D(map, bent).rgb * exposure * (1. - over.a) + over.rgb; ${OUT_TAIL}`;

export function createScene(canvas: HTMLCanvasElement, host: HTMLElement, data: SceneData) {
  const state: SceneState = {...DEFAULTS};
  const renderer = new T.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true}); renderer.autoClear = false;
  const bg = new T.Scene(), fg = new T.Scene(), view = new T.PerspectiveCamera(40, W / H, 0.05, 200), filmCam = new T.PerspectiveCamera(40, W / H, 0.05, 200), filmVP = new T.Matrix4();
  const light = createFanLight(), film = createFilmLayers(filmVP, light.uniforms), table = createTable(light.hook), tray = createChipTray(light.hook), rail = createRailExtras(light.hook), smoke = createSmoke(), rooms = createRooms(bg, data.urls, data.onMissingRoom, data.rooms);
  const sun = new T.DirectionalLight(0xfff1dd, 1.6); sun.position.set(-1.5, 3, 2.5);
  fg.add(film.body, film.table, table.group, tray.group, rail.group, smoke.group, new T.AmbientLight(0xffe6cc, 1.1), sun, ...rooms.front);
  const players = createPlayers(texture => film.setTexture(texture), data.onChange);
  const mouth = createMouthLayer(shown => film.setMouth(shown)); // a spoken line's mouth on the part on screen (src/scene3d-mouth.ts)
  let camera: FilmCamera = DEALER_LENS_ESTIMATE, pitch = 0, edgeZ = -1, guides: T.Group | null = null, track: CardTrack | null = null;
  let focusNow = NaN, focusWhat = '', lastSeconds = NaN, moved = false;
  // Rendered cards, three ways: 'scene' makes each card an object in the scene under the film (scene3d-deal.ts); 'film' draws
  // the card into the film frame (scene3d-cards.ts), the earlier way, kept to compare; 'matte' (a trial) draws over the film's own
  // card in place, with the film's card as the matte (scene3d-deal.ts and scene3d-matte.ts). A way's module is fetched the first
  // time it is used and cards are switched off again if it cannot be read. update() returning true means "show my texture as the film".
  type CardLayer = {texture: T.Texture; update(video: HTMLVideoElement, frame: number, track: unknown, choice: {rank: string; suit: string; scale: number}, extra?: object | null): boolean; off?(): void; dispose?(): void};
  // Things another page adds: props lying on the table (built with the table, drawn under the film) and a call after every drawn frame.
  type Prop = {group: T.Object3D; build(edgeZ: number, scale: number): void};
  const props: Prop[] = [], frameCalls = new Set<() => void>(); let built = false, ownNotch: {x0: number; x1: number; s1: number} | null = null;
  let cardLayer: CardLayer | null = null, cardError = ''; const cardLayers: Partial<Record<SceneState['cardMethod'], CardLayer>> = {}, cardLoads = new Set<string>();
  // gone: the scene has been taken down (dispose below); a module that arrives after that makes no layer.
  let gone = false;
  function loadCards() {
    const method = state.cardMethod; if (cardLayers[method] || cardLoads.has(method)) return; cardLoads.add(method);
    (method !== 'film' ? import('./scene3d-deal.ts').then(m => { if (gone) return null; const layer = m.createDealLayer({contract: data.contract, plan: data.plan, film, light: light.uniforms, camera: () => camera, edgeZ: () => edgeZ,
      renderer, view: () => view, pixels: () => Math.min(canvas.width / W, canvas.height / H) * state.zoom, way: method}); fg.add(layer.group); return layer; })
      : import('./scene3d-cards.ts').then(m => gone ? null : m.createCardLayer(data.contract)))
      .then(layer => { if (!layer) return; cardLayers[method] = layer; cardError = ''; }, error => { cardError = String((error as Error)?.message ?? error); if (state.cardMethod === method) state.cards = false; })
      .then(() => { cardLoads.delete(method); if (gone) return; useCards(); data.onChange(); });
  }
  // The layer of the chosen way while cards are on; the one left gives the film back.
  function useCards() { const next = state.cards ? cardLayers[state.cardMethod] ?? null : null; if (next !== cardLayer) { cardLayer?.off?.(); cardLayer = next; } if (state.cards && !next) loadCards(); }

  // ---- post chain ---------------------------------------------------------------------------
  const fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsQuad = new T.Mesh(new T.PlaneGeometry(2, 2)), fsScene = new T.Scene(); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
  const shader = (fragmentShader: string, uniforms: Record<string, {value: unknown}>) => new T.ShaderMaterial({vertexShader: FS_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false});
  const blurMat = shader(BLUR_FRAGMENT, {map: {value: null}, depthMap: {value: null}, dir: {value: new T.Vector2()}, near: {value: 0.05}, far: {value: 200}, mode: {value: 0}, start: {value: 2}, range: {value: 8}, focus: {value: 1.5}, tol: {value: 0.3}});
  const plateMat = shader(PLATE_FRAGMENT, {map: {value: null}, scale: {value: new T.Vector2(1, 1)}});
  const outMat = shader(OUT_FRAGMENT, {map: {value: null}, fg: {value: null}, exposure: {value: 1}, useFg: {value: 0}});
  // A film's lightning (Part.effect room-flash): the finished picture once more, grey where `mono` says and whitened by `flash`.
  const strikeMat = shader('varying vec2 vUv; uniform sampler2D map; uniform float mono, flash; void main(){ vec3 c = texture2D(map, vUv).rgb; c = mix(c, vec3(dot(c, vec3(.2126, .7152, .0722))), mono); gl_FragColor = vec4(c + flash * (1. - c), 1.); }', {map: {value: null}, mono: {value: 0}, flash: {value: 0}});
  // warmed: the room whose picture has been asked for ahead of the lightning, and sent: the one whose picture is on the graphics card
  // already (sending it when the lightning strikes would hold the picture still for a moment). struck: the room it shows while it is on. strikeTo: the
  // full-size target the picture is drawn into while there is lightning, instead of the screen.
  let warmed: RoomId | null = null, sent: RoomId | null = null, struck: RoomId | null = null, strikeTo: Target | null = null;
  const shiftMat = shader(SHIFT_OUT_FRAGMENT, {map: {value: null}, fg: {value: null}, exposure: {value: 1}, useFg: {value: 0}, shimmer: {value: 0}, glitter: {value: 0}, pixels: {value: new T.Vector2(1, 1)}});
  const changeMat = shader(CHANGE_FRAGMENT, {from: {value: null}, to: {value: null}, gainFrom: {value: 1}, gainTo: {value: 1}, change: {value: 0}, aspect: {value: 1}});
  type Target = T.WebGLRenderTarget;
  let half: Target[] = [], full: Target[] = [], size = '';
  // A change of room with the shimmer (scene3d-shift.ts). What the room's path needs to know about a room is its look: the
  // state is the look of the room that is showing or coming in, and the room that is going out keeps the look it had when
  // the change was asked for. A picture is a room as drawn: the target it is in and the exposure it is to be shown with.
  type Look = Pick<SceneState, 'room' | 'blur' | 'depthBlur' | 'dofRange' | 'exposure' | 'panoramaTurn'>;
  type Picture = {target: Target; exposure: number};
  // from: the outgoing room, drawn live; null when the outgoing picture is a still in `held` (a change asked for during a
  // change). began: the scene's time at which the course started, NaN until the next drawn frame gives it. glitterFrom: the
  // time the glitter counts from, which a second change leaves alone. lead: the progress the course started at. seen, ready:
  // the second of the course at which the new room's picture was first there, and the one from which the course may go on.
  // warm: the new room has been drawn once with its picture. take: the picture on screen is to be kept as the outgoing still.
  type Shift = {from: Look | null; seconds: number; began: number; glitterFrom: number; lead: number; seen: number; ready: number; warm: boolean; take: boolean; progress: number};
  // held: the one extra half-size target, for the outgoing room while both are drawn. shown: the room picture last put on screen.
  let shift: Shift | null = null, held: Target | null = null, shown: Picture | null = null;
  const target = (w: number, h: number, depth: boolean, samples = 0): Target => {
    const options = {type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: depth, samples};
    if (!depth) return new T.WebGLRenderTarget(w, h, options);
    const depthTexture = new T.DepthTexture(w, h); depthTexture.type = T.UnsignedIntType; depthTexture.minFilter = depthTexture.magFilter = T.NearestFilter;
    return new T.WebGLRenderTarget(w, h, {...options, depthTexture});
  };
  const dispose = (list: Target[]) => { for (const t of list) { t.depthTexture?.dispose(); t.dispose(); } };
  // The full-size foreground targets exist only while focus is on.
  function targets() {
    const w = canvas.width, h = canvas.height, key = `${w}x${h}`;
    if (key !== size) { dispose(half); dispose(full); full = []; size = key; shown = null; const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1); half = [target(hw, hh, true), target(hw, hh, false), target(hw, hh, false)]; }
    if (state.focus !== 'off' && !full.length) full = [target(w, h, true, 4), target(w, h, false), target(w, h, false)];
    if (state.focus === 'off' && full.length) { dispose(full); full = []; }
  }
  const pass = (material: T.Material, to: Target | null) => { fsQuad.material = material; renderer.setRenderTarget(to); renderer.render(fsScene, fsCam); };
  // Two rounds of a separable blur; returns the target holding the result.
  function blur(from: Target, a: Target, b: Target, sigma: number): Target {
    let source = from; const u = blurMat.uniforms;
    if (sigma > 0.05) for (const k of [1, 0.5]) { const step = sigma * k / 2.2; u.map.value = source.texture; (u.dir.value as T.Vector2).set(step / from.width, 0); pass(blurMat, a); u.map.value = a.texture; (u.dir.value as T.Vector2).set(0, step / from.height); pass(blurMat, b); source = b; }
    return source;
  }

  // ---- film camera and everything that depends on it ----------------------------------------------
  function filmCamera(): FilmCamera { const base = state.lens === 'plan' ? cameraFromContract(data.contract) : DEALER_LENS_ESTIMATE; return state.scale > 0 ? {...base, scale: state.scale} : base; }
  function buildGuides() {
    if (guides) fg.remove(guides); guides = new T.Group(); fg.add(guides);
    const line = (points: number[][], color: number) => { const l = new T.LineLoop(new T.BufferGeometry().setFromPoints(points.map(p => new T.Vector3(...p))), new T.LineBasicMaterial({color, depthTest: false})); l.renderOrder = 20; guides!.add(l); };
    line([[0, 0], [W - 1, 0], [W - 1, camera.edgeRow - 1e-3], [0, camera.edgeRow - 1e-3]].map(([x, y]) => filmToScene(camera, x, y)), 0xffd84a); // the film frame above the table edge, on the dealer plane
    line([[-5, 0.001, edgeZ], [5, 0.001, edgeZ]], 0xff5a7a); // the fold
    line([[0, camera.edgeRow], [W - 1, camera.edgeRow], [W - 1, H - 1], [0, H - 1]].map(([x, y]) => { const p = filmToScene(camera, x, y); return [p[0], 0.002, p[2]]; }), 0x55c8ff); // the film's part of the felt
  }
  function rebuild() {
    if (gone) return; camera = filmCamera(); const solved = solveCamera(camera); pitch = solved.pitch; edgeZ = -solved.edgeDistance;
    filmCam.fov = solved.fovYDeg; filmCam.aspect = W / H; filmCam.position.set(0, camera.heightM, 0); filmCam.rotation.set(-pitch, 0, 0, 'YXZ'); filmCam.updateProjectionMatrix(); filmCam.updateMatrixWorld(true);
    filmVP.multiplyMatrices(filmCam.projectionMatrix, filmCam.matrixWorldInverse);
    table.build(edgeZ, camera.scale, ownNotch ?? (state.tray ? TRAY : undefined), state.base, state.surface, state.tableSize); tray.group.visible = state.tray && !ownNotch; if (tray.group.visible) tray.build(edgeZ, camera.scale); rail.build(edgeZ, camera.scale, betSpots(data.plan, camera), state.tableSize); smoke.build(edgeZ, camera.scale, state.tableSize); drawFelt(); rooms.place(camera); light.place(camera); buildGuides(); focusNow = NaN; built = true; for (const prop of props) prop.build(edgeZ, camera.scale); apply();
  }
  const drawFelt = () => table.draw({spots: cardSpots(data.plan, camera), logo: state.logo, felt: state.felt, scale: camera.scale, marks: state.marks, cloth: state.cloth, camera, size: state.tableSize});
  function apply() {
    if (gone) return; if (!rooms.rooms[state.room]) state.room = 'salong'; // a room the scene does not have (an old address, a room taken out of the register)
    useCards(); rooms.show(state.room); rail.set({cups: state.cups}); film.place(edgeZ, state.fold, state.focus !== 'off', camera.scale); film.setKey({lo: state.keyLo, hi: state.keyHi, shadow: state.shadow, above: state.shadowAbove}); film.setGrade(state.filmBright, state.filmWarm); film.setEdge(state.edgeClean); players.tempo(state.filmTempo);
    table.setLamp(state.lamp); table.setShelf(state.shelf);
    if (guides) guides.visible = state.guides; resize(); data.onChange();
  }
  function resize() {
    if (gone) return; const box = host.getBoundingClientRect(), aspect = state.format === 'desk' ? W / H : state.format === 'mob' ? 9 / 16 : box.width / box.height;
    let w = box.width, h = box.height; if (w / h > aspect) w = h * aspect; else h = w / aspect;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), true);
  }

  // ---- view camera and focus -----------------------------------------------------------------------
  function updateView(seconds: number) {
    let {yaw, pitch: tilt, dx, dy, dz} = state;
    if (state.sway) { if (state.mode === 'look') { yaw += 9 * Math.sin(seconds * 0.55); tilt += 2.5 * Math.sin(seconds * 0.37); } else { dx += 0.13 * Math.sin(seconds * 0.6); dy += 0.035 * Math.sin(seconds * 0.43); } }
    const base = filmCam.position; view.position.set(base.x + dx, base.y + dy, base.z + dz); moved = !!(dx || dy || dz);
    let ry = yaw * RAD, rx = -pitch + tilt * RAD;
    if (state.aim && moved) { const fix = aimCorrection(base.toArray(), view.position.toArray(), [0, 0.3, edgeZ]); ry += fix.yaw; rx += fix.pitch; }
    view.rotation.set(rx, ry, 0, 'YXZ'); view.aspect = canvas.width / canvas.height; view.fov = viewFovDeg(camera, view.aspect, state.zoom); view.updateProjectionMatrix(); view.updateMatrixWorld(true);
  }
  // Distance from the view camera, along its axis, of what should be sharp.
  // In "follow" the card stays the subject for a moment after its track lets go: the deal is cut at its landing frame
  // and the return that follows has no card of its own to follow, so without this the focus would leave at the join.
  const LINGER = 0.4; let heldPixel: {x: number; y: number} | null = null, heldAt = -Infinity;
  function focusTarget(seconds: number): {distance: number; what: string} {
    const depthOf = (p: number[]) => -new T.Vector3(...p).applyMatrix4(view.matrixWorldInverse).z;
    if (state.focus === 'manual') return {distance: state.focusDistance, what: 'manuellt'};
    const frame = players.frame(); let pixel = state.focus === 'card' ? cardPixel(track, frame) : state.focus === 'follow' ? cardFocusPixel(track, frame) : null;
    if (state.focus === 'follow') { if (pixel) { heldPixel = pixel; heldAt = seconds; } else if (heldPixel && seconds >= heldAt && seconds - heldAt <= LINGER) pixel = heldPixel; else heldPixel = null; }
    return pixel ? {distance: depthOf(filmToScene(camera, pixel.x, pixel.y)), what: 'kortet'} : {distance: depthOf([0, 0.3 * camera.scale, edgeZ]), what: 'dealern'};
  }

  // What moves in a room at this time (rooms.ambient); returns the factor for the room's brightness. frontAir: the share of the
  // air shown in front of the dealer. It is the one thing of a room that is not behind her: a change of room thins it out
  // to nothing at the moment the rooms have half changed, when it becomes the new room's, and lets it come back.
  // FRONT_AIR: how much of the air is shown in front of her at all. None since 2026-11-13: an independent review of the film for
  // Jakob's chief found the specks nearest her plane to be sharp white dots on her face in nine frames of ten, read as dirt on the
  // picture; behind her the dust is soft and stays. (The cloud is still built in src/scene3d-room.ts; it comes back as large soft
  // discs only, near the lens, when that is made.)
  const FRONT_AIR = 0;
  let frontAir = 1;
  const ambient = (id: RoomId, seconds: number) => rooms.ambient(id, seconds, new Date(), {clock: state.clock, air: state.dust, lamp: state.flicker ? flickerLevel(seconds, state.flickerEvery, state.flickerStrength) : 1, cloud: state.flicker ? cloudLevel(seconds, state.flickerEvery, state.flickerStrength * 0.5) : 1, front: frontAir * FRONT_AIR}, canvas.height / H);
  // One room into the half-size targets, blurred. The first target takes the room and its depth; `ping` and `pong` are the
  // blur's two, and the picture ends in `pong`, or stays in the first when there is no blur.
  function drawRoom(look: Look, seconds: number, ping: Target, pong: Target): Picture {
    const room = rooms.rooms[look.room], focusOn = state.focus !== 'off', u = blurMat.uniforms, scale = canvas.width / W, a = half[0];
    rooms.followCamera(look.room, view.position, look.panoramaTurn); const dim = ambient(look.room, seconds);
    renderer.setRenderTarget(a); renderer.setClearColor(0x050403, 1); renderer.clear();
    if (room.plate) { const image = 1536 / 1024, frame = canvas.width / canvas.height; plateMat.uniforms.map.value = room.plate; (plateMat.uniforms.scale.value as T.Vector2).set(frame > image ? 1 : frame / image, frame > image ? image / frame : 1); pass(plateMat, a); }
    else renderer.render(bg, view);
    u.near.value = view.near; u.far.value = view.far; u.start.value = -edgeZ + 0.25 * camera.scale; u.range.value = look.dofRange * camera.scale; u.focus.value = focusOn ? focusNow : 1; u.tol.value = state.tolerance;
    u.depthMap.value = a.depthTexture; u.mode.value = focusOn ? 2 : look.depthBlur && room.hasDepth ? 1 : 0;
    return {target: blur(a, ping, pong, look.blur * scale / 2), exposure: look.exposure * room.exposure * dim};
  }
  const lookNow = (): Look => ({room: state.room, blur: state.blur, depthBlur: state.depthBlur, dofRange: state.dofRange, exposure: state.exposure, panoramaTurn: state.panoramaTurn});
  // Whether a room has its picture: a panorama's is fetched the first time it is shown, and the hall is built by a module of its own.
  function roomReady(id: RoomId) {
    const room = rooms.rooms[id]; if (id === 'hall') return !!room.group?.children.length;
    const map = room.plate ?? ((room.group as T.Mesh | null)?.material as T.MeshBasicMaterial | undefined)?.map, image = map?.image as {width?: number} | null | undefined;
    return !map || !!image && image.width! > 0;
  }
  // A change of room with the shimmer begins. One asked for during another is taken up where that one is: before the rooms
  // have begun to change, only the goal is new. After that the picture on screen is kept as the outgoing still, and the
  // course goes back to the point on its way up where the shimmer is as strong as it is now, so nothing jumps.
  function beginShift(before: Look) {
    if (!shift) { shift = {from: before, seconds: state.roomShiftSeconds, began: NaN, glitterFrom: NaN, lead: 0, seen: Infinity, ready: Infinity, warm: false, take: false, progress: 0}; return; }
    if (roomChange(shift.progress) > 0) { shift.from = before; shift.take = true; } // `before` is drawn live in the still's place if the picture on screen is gone (the window changed size)
    Object.assign(shift, {lead: retake(shift.progress), began: NaN, seen: Infinity, ready: Infinity, warm: false});
  }
  function endShift() { shift = null; held?.dispose(); held = null; shown = null; rooms.show(state.room); }
  // A room picture into another target, times `gain` (the change pass with nothing changed).
  function copyRoom(from: Target, to: Target, gain: number) { const m = changeMat.uniforms; m.from.value = m.to.value = from.texture; m.gainFrom.value = gain; m.change.value = 0; pass(changeMat, to); }
  // The room's picture during a change. The outgoing room alone while the shimmer builds, the new one alone while it dies
  // away; both are drawn only while they change places, and for one frame early on so that the new room's picture is taken
  // in before it is needed. `change`: how far the rooms have changed, 0 to 1 (below 1).
  function drawShift(now: Shift, change: number, seconds: number): Picture {
    const [a, b, c] = half, both = change > 0 || !now.warm;
    if (now.from && (!held || held.width !== a.width || held.height !== a.height)) { held?.dispose(); held = target(a.width, a.height, false); }
    if (now.take) { if (shown && held && shown.target !== held) { copyRoom(shown.target, held, shown.exposure); now.from = null; } now.take = false; }
    let old: Picture;
    if (!now.from) old = {target: held!, exposure: 1};
    else { rooms.show(now.from.room); old = drawRoom(now.from, seconds, b, both ? held! : c); if (both && old.target !== held) { copyRoom(old.target, held!, 1); old = {target: held!, exposure: old.exposure}; } }
    if (!both) return old;
    rooms.show(state.room); const next = drawRoom(state, seconds, b, c); if (now.seen < Infinity) now.warm = true;
    if (now.from && change < 0.5) ambient(now.from.room, seconds); // the air in front of the dealer is the outgoing room's until the rooms have half changed
    if (change <= 0) return old;
    const m = changeMat.uniforms; m.from.value = old.target.texture; m.gainFrom.value = old.exposure; m.to.value = next.target.texture; m.gainTo.value = next.exposure; m.change.value = change; m.aspect.value = canvas.width / canvas.height; pass(changeMat, b);
    return {target: b, exposure: 1};
  }

  function render(seconds = performance.now() / 1000) {
    if (gone) return; targets(); updateView(seconds);
    // A change of room under way: how far it has come at this time. It counts from the first frame drawn after it was asked for.
    let change = 1;
    if (shift) {
      if (Number.isNaN(shift.began)) { shift.began = seconds; if (Number.isNaN(shift.glitterFrom)) shift.glitterFrom = seconds; }
      const elapsed = seconds - shift.began;
      if (shift.ready === Infinity && roomReady(state.room)) { if (shift.seen === Infinity) shift.seen = elapsed; else if (shift.warm) shift.ready = readyFrom(shift.seen, elapsed, shift.seconds, shift.lead); }
      shift.progress = shiftProgress(elapsed, shift.seconds, shift.ready, shift.lead);
      if (shift.progress >= 1) { endShift(); data.onChange(); } else change = roomChange(shift.progress);
    }
    frontAir = shift ? Math.abs(1 - 2 * change) : 1;
    const playing = players.current, part = players.part;
    // A film's lightning (Part.effect): the other room's picture is asked for when the film begins, the room is shown while the
    // lightning is on, and the room that is chosen comes back after it. Not during a change of room, which has its own course.
    const effect = !shift && part?.effect?.kind === 'room-flash' && rooms.rooms[part.effect.room] ? part.effect : null;
    const strike = effect ? roomFlashAt(players.frame() / (part!.fps ?? 30) - effect.at, effect.seconds) : null;
    if (effect && warmed !== effect.room) { warmed = effect.room; rooms.show(effect.room); rooms.show(struck ?? state.room); }
    if (effect && sent !== effect.room && roomReady(effect.room)) { const map = ((rooms.rooms[effect.room].group as T.Mesh | null)?.material as T.MeshBasicMaterial | undefined)?.map; if (map) renderer.initTexture(map); sent = effect.room; }
    const on = effect && strike!.on ? effect.room : null; if (on !== struck) { struck = on; rooms.show(on ?? state.room); }
    // Only the room behind her is the other one: the table and the dealer keep the light of the room that is chosen.
    const here: Look = struck ? {...lookNow(), room: struck} : state;
    roomLight(shift?.from && change < 0.5 ? shift.from : state); // the table changes its light when the rooms have half changed
    if (part && part.track !== undefined) track = part.track; // a part that names its track brings it along
    mouth.update(part, playing?.video ?? null, players.frame()); // a part that says a line: the cell of the frame shown, as the cards have it
    film.setFrame(frameAt(part?.frame ?? null, players.frame())); // and so does a part whose film has a frame of its own
    // A film with a frame of its own has no shoe and no card places in its picture: the rendered cards (the one seated in the shoe window among them) stay out of it.
    evenFilm(playing?.video ?? null, part, seconds); film.setLife(state.dealerLife, seconds);
    const cardsOn = state.cards && !part?.frame; if (!cardsOn) cardLayer?.off?.();
    if (playing) film.setTexture(cardsOn && cardLayer?.update(playing.video, players.frame(), track, {rank: state.cardRank, suit: state.cardSuit, scale: state.cardScale, hand: state.cardHand}, part?.cards) ? cardLayer.texture : playing.texture);
    const focusOn = state.focus !== 'off', u = blurMat.uniforms, scale = canvas.width / W;
    light.update(seconds, state.fan, state.fanStrength, state.fanPeriod);
    if (focusOn) { const goal = focusTarget(seconds), dt = Math.max(0, Math.min(0.2, seconds - lastSeconds)); focusWhat = goal.what;
      focusNow = Number.isFinite(focusNow) && Number.isFinite(dt) ? focusNow + (goal.distance - focusNow) * (1 - Math.exp(-dt / 0.22)) : goal.distance; } else focusNow = NaN;
    lastSeconds = seconds;
    // room
    if (shift && change >= 1) rooms.show(state.room); // also after a frame so long that the rooms never were on screen together
    rooms.life(shift?.from ? [state.room, shift.from.room] : effect ? [here.room, effect.room] : [state.room], state.roomLife);
    const picture = shift && change < 1 ? drawShift(shift, change, seconds) : drawRoom(here, seconds, half[1], half[2]); if (shift) shown = picture;
    // the dealer takes her light from the room as the table does: the outgoing room's until the rooms have half changed
    const lit = shift?.from && change < 0.5 ? shift.from : lookNow();
    // the smoke over the table is lit as the room is shown: darker in a dim room, never brighter than paper
    { const level = Math.min(1, Math.max(0.35, 0.55 + 0.45 * lit.exposure * rooms.rooms[lit.room].exposure)); smoke.update(seconds, state.smoke, [0.86 * level, 0.84 * level, 0.82 * level]); }
    dealerLight(lit, shift || struck ? lit.exposure * rooms.rooms[lit.room].exposure : picture.exposure);
    film.setWrap(state.wrap > 0 ? picture.target.texture : null, canvas.width, canvas.height, picture.exposure, state.wrap);
    // table and film; while a change of room is under way the shimmer is laid over the room in the same pass that writes it to the screen
    const out = shift ? shiftMat : outMat, o = out.uniforms; o.useFg.value = 0;
    if (shift) { o.shimmer.value = shimmerLevel(shift.progress); o.glitter.value = seconds - shift.glitterFrom; (o.pixels.value as T.Vector2).set(canvas.width, canvas.height); }
    if (focusOn) { const [f, g, h] = full; light.uniforms.toTarget.value = 1; renderer.setRenderTarget(f); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(fg, view); light.uniforms.toTarget.value = 0;
      u.depthMap.value = f.depthTexture; u.mode.value = 2; o.fg.value = blur(f, g, h, state.blur * scale).texture; o.useFg.value = 1; }
    // While there is lightning the picture goes into a target of its own and from there to the screen, grey and whitened.
    const lightning = !!strike && (strike.flash > 0 || strike.on && !!effect!.mono);
    if (lightning && (!strikeTo || strikeTo.width !== canvas.width || strikeTo.height !== canvas.height)) { if (strikeTo) dispose([strikeTo]); strikeTo = target(canvas.width, canvas.height, true); }
    const screen = lightning ? strikeTo : null;
    renderer.setRenderTarget(screen); renderer.setClearColor(0x050403, 1); renderer.clear(); o.map.value = picture.target.texture; o.exposure.value = picture.exposure; pass(out, screen);
    if (!focusOn) { renderer.clearDepth(); light.uniforms.toTarget.value = screen ? 1 : 0; renderer.render(fg, view); light.uniforms.toTarget.value = 0; }
    if (screen) { const s = strikeMat.uniforms; s.map.value = screen.texture; s.mono.value = strike!.on && effect!.mono ? 1 : 0; s.flash.value = strike!.flash; pass(strikeMat, null); }
    for (const call of frameCalls) call();
  }
  // filmEven (src/scene3d-film.ts): the film on screen in its family's colour, and a new film begun in the tone of the one before
  // it. Her tone is read off the film made small. A reading takes a few milliseconds, so it is made only where it is needed: on a
  // film's first frame (the frame it joins with), on every frame of its last EVEN.close (the last of them is the frame before the
  // join), and every EVEN.every-th frame in between, for a film that is cut short. A film with a frame of its own (she walks)
  // joins nothing.
  const toneCanvas = document.createElement('canvas'); toneCanvas.width = EVEN.cols; toneCanvas.height = EVEN.rows; const tonePen = toneCanvas.getContext('2d', {willReadFrequently: true});
  let toned: {part: Part; tone: FilmTone | null; since: number} | null = null, joined: {match: ToneMatch; at: number} | null = null;
  function evenFilm(video: HTMLVideoElement | null, part: Part | null, seconds: number) {
    if (!state.filmEven || !video || !part) { if (toned || joined) film.setEven(null); toned = joined = null; return; }
    const matrix = evenFor(part.model), [x0, y0, x1, y1] = EVEN.box, first = toned?.part !== part, fps = part.fps ?? 30;
    const toEnd = (part.end ?? Math.round((video.duration || 0) * fps)) - 1 - players.frame(), since = first ? 0 : toned!.since + 1;
    let left = joined ? matchLeft(seconds - joined.at) : 0;
    if (first || toEnd <= EVEN.close || since >= EVEN.every) {
      let tone: FilmTone | null = null;
      if (tonePen && !part.frame && video.readyState >= 2) try { tonePen.drawImage(video, x0, y0, x1 - x0, y1 - y0, 0, 0, EVEN.cols, EVEN.rows); tone = toneOf(tonePen.getImageData(0, 0, EVEN.cols, EVEN.rows).data, matrix); } catch { /* a film the page may not read: no join */ }
      // the film before as it was shown (its own tone under what was left of its match) against this film's first frame
      if (first) { const last = toned?.tone ? toneUnder(toned.tone, joined?.match ?? null, left) : null; joined = last && tone ? {match: toneMatch(last, tone), at: seconds} : null; left = joined ? 1 : 0; }
      toned = {part, tone, since: 0};
    } else toned!.since = since;
    if (joined && left <= 0) joined = null;
    film.setEven(matrix, joined ? joined.match.gain.map(g => 1 + left * (g - 1)) : null, joined ? joined.match.lift.map(l => left * l) : null);
  }
  // With the photographed surface the table is lit by the room that is showing: the room's panorama as the sphere shows it
  // from inside (mirrored for a mirrored room: an environment map reads a picture the right way round), prefiltered once per
  // room and turned as the sphere is. A built room has no panorama; the table then keeps its painted room.
  const pmrem = new T.PMREMGenerator(renderer); let litBy: T.Texture | null = null, litKey = '', litMap: T.WebGLRenderTarget | null = null, litLevel = 0;
  function roomLight(look: {room: RoomId; panoramaTurn: number; exposure: number}) {
    const room = rooms.rooms[look.room], sphere = state.surface !== 'painted' ? room.group as T.Mesh | null : null, map = sphere && room.follow ? (sphere.material as T.MeshBasicMaterial).map : null;
    const image = map?.image as HTMLImageElement | undefined, ready = map && image && image.width > 0 ? map : null, key = `${ready?.uuid ?? ''}:${look.panoramaTurn}:${state.roomLight}:${look.exposure}`;
    if (key === litKey) return; litKey = key;
    if (ready !== litBy) { litBy = ready; litMap?.dispose(); litMap = null;
      if (ready) { const picture = document.createElement('canvas'); picture.width = image!.width; picture.height = image!.height; const g = picture.getContext('2d')!; if (room.mirror) { g.translate(picture.width, 0); g.scale(-1, 1); } g.drawImage(image!, 0, 0);
        // how much light the room throws on a level table, read from the picture made small (for the cloth of a surface "duk")
        const small = document.createElement('canvas'); small.width = 64; small.height = 32; const sg = small.getContext('2d', {willReadFrequently: true})!; sg.imageSmoothingQuality = 'high'; sg.drawImage(image!, 0, 0, 64, 32); litLevel = lightFromAbove(sg.getImageData(0, 0, 64, 32).data, 64, 32);
        const source = new T.CanvasTexture(picture); source.colorSpace = T.SRGBColorSpace; source.mapping = T.EquirectangularReflectionMapping; litMap = pmrem.fromEquirectangular(source); source.dispose(); } }
    table.setEnvironment(litMap?.texture ?? null, ROOM_TURN + (look.panoramaTurn + room.turn) * RAD, state.roomLight, litMap ? litLevel * room.exposure * look.exposure : undefined);
  }
  // With dealerRoom the film takes the light of the room that is showing (lightOnDealer in scene3d-film.ts): the room's
  // panorama read small once per picture, and its light on her front and sides worked out again when the room turns. A built
  // room has no panorama and leaves her as she is. Nothing is touched while the key is 0 and was 0 the frame before.
  const GLOW = 128; let glowPixels: {uuid: string; data: Uint8ClampedArray} | null = null, glow: {key: string; value: RoomGlow | null} = {key: '', value: null}, dealerLit = false;
  function dealerLight(look: Look, exposure: number) {
    if (!(state.dealerRoom > 0) && !dealerLit) return; dealerLit = state.dealerRoom > 0;
    const room = rooms.rooms[look.room], map = dealerLit && room.follow ? ((room.group as T.Mesh | null)?.material as T.MeshBasicMaterial | undefined)?.map ?? null : null, image = map?.image as HTMLImageElement | undefined;
    let value: RoomGlow | null = null;
    if (map && image && image.width > 0) {
      const read = () => { const c = document.createElement('canvas'); c.width = GLOW; c.height = GLOW / 2; const g = c.getContext('2d', {willReadFrequently: true})!; g.imageSmoothingQuality = 'high'; g.drawImage(image, 0, 0, c.width, c.height); return {uuid: map.uuid, data: g.getImageData(0, 0, c.width, c.height).data}; };
      const pixels = glowPixels && glowPixels.uuid === map.uuid ? glowPixels : glowPixels = read();
      const key = `${map.uuid}:${look.panoramaTurn}`; if (glow.key !== key) glow = {key, value: roomGlow(pixels.data, GLOW, GLOW / 2, (look.panoramaTurn + room.turn) * RAD, room.mirror)};
      value = glow.value;
    }
    film.setRoomLight(lightOnDealer(value, dealerLit ? state.dealerRoom : 0, exposure));
  }

  let running = false; const loop = (ms: number) => { if (!running) return; render(ms / 1000); requestAnimationFrame(loop); };

  // ---- taking the scene down -----------------------------------------------------------------------
  // For a page that comes and goes (a React view). The loop stops for good and the film queue is taken down; then everything
  // that hangs in the scene's three scenes (rooms, table, rail, tray, film layers, cards, guides, air, a hall read later) is
  // freed by walking them: geometries, materials, the textures in a material's slots and in a shader's uniforms, instanced
  // meshes and lights. After that the post chain's materials, the render targets, the prefiltered room, the card layers'
  // own parts, the renderer and its WebGL context. The canvas stays in the page: it is the caller's, and a canvas whose
  // context is lost cannot be given a new one, so a new scene wants a new canvas. Props added with addProp are the caller's:
  // they are taken out of the scene but not freed, so the caller can free them or hand them to another scene. The scene
  // registers no observers or listeners of its own (the pages do). Afterwards every call is a no-op, dispose() too.
  function takeDown() {
    if (gone) return; gone = true; running = false; shift = null;
    mouth.dispose(); players.dispose(); rooms.dispose(); smoke.dispose();
    for (const prop of props.splice(0)) fg.remove(prop.group); frameCalls.clear();
    for (const layer of Object.values(cardLayers)) layer.off?.(); cardLayer = null;
    const freed = new Set<{dispose(): void}>(), textures = (value: unknown): void => { if (value instanceof T.Texture) freed.add(value as T.Texture); else if (Array.isArray(value)) value.forEach(textures); };
    const material = (m: T.Material) => { freed.add(m); Object.values(m).forEach(textures); for (const u of Object.values(((m as T.ShaderMaterial).uniforms ?? {}) as Record<string, {value: unknown} | undefined>)) textures(u?.value); };
    for (const root of [bg, fg, fsScene]) root.traverse((o: T.Object3D) => { const mesh = o as T.Mesh, ms = mesh.material;
      if (mesh.geometry) freed.add(mesh.geometry); if (ms) (Array.isArray(ms) ? ms : [ms]).forEach(material);
      if ((o as T.InstancedMesh).isInstancedMesh || (o as T.Light).isLight) freed.add(o as T.InstancedMesh | T.Light); });
    [blurMat, plateMat, outMat, shiftMat, changeMat].forEach(material); textures(rooms.rooms.plat.plate);
    for (const layer of Object.values(cardLayers)) freed.add(layer.texture);
    for (const d of freed) d.dispose();
    for (const layer of Object.values(cardLayers)) layer.dispose?.(); // the rendered cards' own: their motion samples and prints not on show
    dispose(half); dispose(full); if (strikeTo) { dispose([strikeTo]); strikeTo = null; } held?.dispose(); half = full = []; held = shown = null; litMap?.dispose(); litMap = litBy = null; pmrem.dispose();
    renderer.setRenderTarget(null); renderer.dispose(); renderer.forceContextLoss();
  }

  return {
    state, players, mouth, render, rebuild, apply, resize,
    start() { if (!running && !gone) { running = true; requestAnimationFrame(loop); } }, stop() { running = false; },
    dispose: takeDown,
    home() { if (gone) return; Object.assign(state, {yaw: 0, pitch: 0, zoom: 1, dx: 0, dy: 0, dz: 0, sway: false}); apply(); },
    set(patch: Partial<SceneState>) { if (gone) return; if (patch.cards) loadCards(); const relens = 'lens' in patch && patch.lens !== state.lens || 'scale' in patch && patch.scale !== state.scale || 'tray' in patch && patch.tray !== state.tray || 'base' in patch && patch.base !== state.base || 'surface' in patch && patch.surface !== state.surface || 'tableSize' in patch && patch.tableSize !== state.tableSize, reprint = 'logo' in patch || 'felt' in patch || 'marks' in patch || 'cloth' in patch;
      // Another room: with the shimmer the change is an animation that render() carries through; without it, or before the scene is built, a cut as before.
      const other = 'room' in patch && patch.room !== state.room, before = lookNow(); Object.assign(state, patch);
      if (other) { if (state.roomShift === 'shimmer' && built) beginShift(before); else if (shift) endShift(); }
      if (relens) rebuild(); else { if (reprint) drawFelt(); apply(); } },
    setTrack(next: CardTrack | null) { track = next; },
    // ---- for a page that puts a game on the table. Positions are dealer metres: x across the table, s from the dealer-side
    // edge toward the players, y above the felt (as cardSpots and betSpots give them).
    canvas,
    // A prop that is sunk into the table at the dealer's edge brings its own notch in the felt (x0, x1 across, s1 toward the
    // players); the built tray then steps aside. null gives the felt back to the built tray.
    notch(next: {x0: number; x1: number; s1: number} | null) { if (gone) return; ownNotch = next; if (built) rebuild(); },
    // Card places and bet rings as the film camera in use lays them on the felt. They move with the lens and the scale, so a
    // prop reads them in its build(), which runs again whenever those change.
    spots() { return {cards: cardSpots(data.plan, camera), bets: betSpots(data.plan, camera)}; },
    lit: light.hook, // a prop's materials go through this, or focus and the fan's shade pass them by
    /** A box of the film (film pixels: x0, y0, x1, y1) that is left undrawn, for an object of the scene that stands there instead; null draws all of the film again. */
    hideFilm(box: number[] | null) { film.setHide(box); },
    addProp(prop: Prop) { if (gone) return () => {}; props.push(prop); fg.add(prop.group); if (built) prop.build(edgeZ, camera.scale); return () => { const i = props.indexOf(prop); if (i >= 0) props.splice(i, 1); fg.remove(prop.group); }; },
    onFrame(call: () => void) { if (gone) return () => {}; frameCalls.add(call); return () => { frameCalls.delete(call); }; },
    // Where a table point is in the picture as last drawn: CSS pixels from the canvas's top left corner, and how many
    // pixels a dealer metre is there.
    project(x: number, s: number, y = 0) {
      const p = new T.Vector3(...spotToScene(camera, x, s, y)), depth = -p.clone().applyMatrix4(view.matrixWorldInverse).z, w = canvas.clientWidth, h = canvas.clientHeight; p.project(view);
      return {x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, visible: depth > view.near && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, pxPerM: depth > 0 ? h / 2 / Math.tan(view.fov * RAD / 2) / depth * camera.scale : 0};
    },
    // The felt point under a pointer position (clientX/clientY), or null beside the felt.
    pick(clientX: number, clientY: number) {
      const box = canvas.getBoundingClientRect(), nx = (clientX - box.left) / box.width * 2 - 1, ny = 1 - (clientY - box.top) / box.height * 2; if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return null;
      const dir = new T.Vector3(nx, ny, 0.5).unproject(view).sub(view.position).normalize(); if (dir.y > -1e-6) return null;
      const t = -view.position.y / dir.y, spot = sceneToSpot(camera, view.position.x + dir.x * t, view.position.z + dir.z * t);
      const felt = sized(state.tableSize); // the felt as large as the table is built
      return spot.s >= 0 && (spot.x / felt.a) ** 2 + (spot.s / felt.b) ** 2 <= 1 ? spot : null;
    },
    // What the picture is right now: the film itself, the film turned (still exact) or the film seen from another place (approximate).
    // shift: null when the room is not changing, otherwise how far a change with the shimmer has come, 0 to 1, as last drawn.
    status() { const turned = !!(state.yaw || state.pitch || state.zoom !== 1 || state.sway); return {view: moved || state.sway && state.mode === 'lean' ? 'moved' : turned ? 'turned' : 'home', camera, focus: state.focus === 'off' ? null : {what: focusWhat, distance: focusNow, tracked: !!track}, cards: {on: state.cards && !!cardLayer, loading: state.cards && !cardLayer, error: cardError, tracked: !!track}, shift: shift ? shift.progress : null}; },
  };
}
