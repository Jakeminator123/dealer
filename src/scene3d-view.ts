// The 3D scene: film camera, view camera, background blur, focus and the final picture.
// Order of drawing: the room into a half-size target, blurred by distance; then table and film on top.
// With focus off, table and film are drawn straight to the screen and stay sharp (the look of checkpoint v1).
// With focus on, they go through a full-size target and are blurred by their own distance from the focus.
import * as T from 'three';
import {DEALER_LENS_ESTIMATE, FILM, aimCorrection, cameraFromContract, cardFocusPixel, cardPixel, cardSpots, filmToScene, solveCamera, viewFovDeg, type CardTrack, type FilmCamera} from './scene3d-geometry.ts';
import {createFilmLayers, createPlayers} from './scene3d-film.ts';
import {createFanLight} from './scene3d-light.ts';
import {createChipTray, TRAY} from './scene3d-props.ts';
import {createRooms, type RoomId} from './scene3d-room.ts';
import {createTable} from './scene3d-table.ts';

export type SceneState = {
  room: RoomId; blur: number; depthBlur: boolean; dofRange: number; exposure: number; panoramaTurn: number;
  mode: 'look' | 'lean'; yaw: number; pitch: number; zoom: number; dx: number; dy: number; dz: number; aim: boolean; sway: boolean; fold: boolean; guides: boolean;
  format: 'desk' | 'mob' | 'fill'; logo: string; felt: string; lens: 'plan' | 'estimate'; scale: number;
  keyLo: number; keyHi: number; shadow: number;
  focus: 'off' | 'dealer' | 'card' | 'follow' | 'manual'; focusDistance: number; tolerance: number;
  fan: boolean; fanStrength: number; fanPeriod: number;
  tray: boolean;
};
// Everything added after checkpoint v1 starts switched off, so the page opens as v1. scale 0 = the contract's own k.
export const DEFAULTS: SceneState = {
  room: 'salong', blur: 11, depthBlur: true, dofRange: 4.5, exposure: 1, panoramaTurn: 90,
  mode: 'look', yaw: 0, pitch: 0, zoom: 1, dx: 0, dy: 0, dz: 0, aim: true, sway: false, fold: true, guides: false,
  format: 'desk', logo: 'SCOUT GAMING', felt: 'green', lens: 'plan', scale: 0,
  keyLo: 0.12, keyHi: 0.9, shadow: 1,
  focus: 'off', focusDistance: 1.5, tolerance: 0.4,
  fan: false, fanStrength: 0.16, fanPeriod: 5,
  tray: false,
};
export type SceneData = {contract: Parameters<typeof cameraFromContract>[0]; plan: Parameters<typeof cardSpots>[0]; urls: {plate: string; panorama: string}; onChange: () => void; onMissingRoom: (room: RoomId) => void};

const W = FILM.width, H = FILM.height, RAD = Math.PI / 180;
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
    s += texture2D(map, uv) * g; w += g;
  }
  gl_FragColor = s / w;
}`;
// The V6 plate fixed to the frame, darkened and desaturated as V6 does it.
const PLATE_FRAGMENT = 'varying vec2 vUv; uniform sampler2D map; uniform vec2 scale; void main(){ vec3 c = texture2D(map, (vUv - .5) * scale + .5).rgb; float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, .65) * .34; gl_FragColor = vec4(c, 1.); }';
// Room: exposure, a soft shoulder, vignette, sRGB. Foreground (already sRGB, premultiplied) goes on top unchanged.
const OUT_FRAGMENT = `varying vec2 vUv; uniform sampler2D map, fg; uniform float exposure, useFg;
void main(){
  vec3 c = texture2D(map, vUv).rgb * exposure; c = c / (1. + c) * 1.3;
  c *= mix(.62, 1., smoothstep(1.05, .35, length((vUv - .5) * vec2(1.25, 1.1))));
  c = pow(max(c, 0.), vec3(1. / 2.2));
  if (useFg > .5) { vec4 f = texture2D(fg, vUv); c = f.rgb + c * (1. - f.a); }
  gl_FragColor = vec4(c, 1.);
}`;

export function createScene(canvas: HTMLCanvasElement, host: HTMLElement, data: SceneData) {
  const state: SceneState = {...DEFAULTS};
  const renderer = new T.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true}); renderer.autoClear = false;
  const bg = new T.Scene(), fg = new T.Scene(), view = new T.PerspectiveCamera(40, W / H, 0.05, 200), filmCam = new T.PerspectiveCamera(40, W / H, 0.05, 200), filmVP = new T.Matrix4();
  const light = createFanLight(), film = createFilmLayers(filmVP, light.uniforms), table = createTable(light.hook), tray = createChipTray(light.hook), rooms = createRooms(bg, data.urls, data.onMissingRoom);
  const sun = new T.DirectionalLight(0xfff1dd, 1.6); sun.position.set(-1.5, 3, 2.5);
  fg.add(film.body, film.table, table.group, tray.group, new T.AmbientLight(0xffe6cc, 1.1), sun);
  const players = createPlayers(texture => film.setTexture(texture), data.onChange);
  let camera: FilmCamera = DEALER_LENS_ESTIMATE, pitch = 0, edgeZ = -1, guides: T.Group | null = null, track: CardTrack | null = null;
  let focusNow = NaN, focusWhat = '', lastSeconds = NaN, moved = false;

  // ---- post chain ---------------------------------------------------------------------------
  const fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsQuad = new T.Mesh(new T.PlaneGeometry(2, 2)), fsScene = new T.Scene(); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
  const shader = (fragmentShader: string, uniforms: Record<string, {value: unknown}>) => new T.ShaderMaterial({vertexShader: FS_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false});
  const blurMat = shader(BLUR_FRAGMENT, {map: {value: null}, depthMap: {value: null}, dir: {value: new T.Vector2()}, near: {value: 0.05}, far: {value: 200}, mode: {value: 0}, start: {value: 2}, range: {value: 8}, focus: {value: 1.5}, tol: {value: 0.3}});
  const plateMat = shader(PLATE_FRAGMENT, {map: {value: null}, scale: {value: new T.Vector2(1, 1)}});
  const outMat = shader(OUT_FRAGMENT, {map: {value: null}, fg: {value: null}, exposure: {value: 1}, useFg: {value: 0}});
  type Target = T.WebGLRenderTarget;
  let half: Target[] = [], full: Target[] = [], size = '';
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
    if (key !== size) { dispose(half); dispose(full); full = []; size = key; const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1); half = [target(hw, hh, true), target(hw, hh, false), target(hw, hh, false)]; }
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
    camera = filmCamera(); const solved = solveCamera(camera); pitch = solved.pitch; edgeZ = -solved.edgeDistance;
    filmCam.fov = solved.fovYDeg; filmCam.aspect = W / H; filmCam.position.set(0, camera.heightM, 0); filmCam.rotation.set(-pitch, 0, 0, 'YXZ'); filmCam.updateProjectionMatrix(); filmCam.updateMatrixWorld(true);
    filmVP.multiplyMatrices(filmCam.projectionMatrix, filmCam.matrixWorldInverse);
    table.build(edgeZ, camera.scale, state.tray ? TRAY : undefined); tray.group.visible = state.tray; if (state.tray) tray.build(edgeZ, camera.scale); drawFelt(); rooms.place(camera); light.place(camera); buildGuides(); focusNow = NaN; apply();
  }
  const drawFelt = () => table.draw({spots: cardSpots(data.plan, camera), logo: state.logo, felt: state.felt, scale: camera.scale});
  function apply() {
    rooms.show(state.room); film.place(edgeZ, state.fold, state.focus !== 'off'); film.setKey({lo: state.keyLo, hi: state.keyHi, shadow: state.shadow});
    if (guides) guides.visible = state.guides; resize(); data.onChange();
  }
  function resize() {
    const box = host.getBoundingClientRect(), aspect = state.format === 'desk' ? W / H : state.format === 'mob' ? 9 / 16 : box.width / box.height;
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

  function render(seconds = performance.now() / 1000) {
    targets(); updateView(seconds);
    const room = rooms.rooms[state.room], focusOn = state.focus !== 'off', u = blurMat.uniforms, scale = canvas.width / W;
    rooms.followCamera(state.room, view.position, state.panoramaTurn); light.update(seconds, state.fan, state.fanStrength, state.fanPeriod);
    if (focusOn) { const goal = focusTarget(seconds), dt = Math.max(0, Math.min(0.2, seconds - lastSeconds)); focusWhat = goal.what;
      focusNow = Number.isFinite(focusNow) && Number.isFinite(dt) ? focusNow + (goal.distance - focusNow) * (1 - Math.exp(-dt / 0.22)) : goal.distance; } else focusNow = NaN;
    lastSeconds = seconds;
    // room
    const [a, b, c] = half; renderer.setRenderTarget(a); renderer.setClearColor(0x050403, 1); renderer.clear();
    if (room.plate) { const image = 1536 / 1024, frame = canvas.width / canvas.height; plateMat.uniforms.map.value = room.plate; (plateMat.uniforms.scale.value as T.Vector2).set(frame > image ? 1 : frame / image, frame > image ? image / frame : 1); pass(plateMat, a); }
    else renderer.render(bg, view);
    u.near.value = view.near; u.far.value = view.far; u.start.value = -edgeZ + 0.25 * camera.scale; u.range.value = state.dofRange * camera.scale; u.focus.value = focusOn ? focusNow : 1; u.tol.value = state.tolerance;
    u.depthMap.value = a.depthTexture; u.mode.value = focusOn ? 2 : state.depthBlur && room.hasDepth ? 1 : 0;
    const roomResult = blur(a, b, c, state.blur * scale / 2);
    // table and film
    outMat.uniforms.useFg.value = 0;
    if (focusOn) { const [f, g, h] = full; light.uniforms.toTarget.value = 1; renderer.setRenderTarget(f); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(fg, view); light.uniforms.toTarget.value = 0;
      u.depthMap.value = f.depthTexture; u.mode.value = 2; outMat.uniforms.fg.value = blur(f, g, h, state.blur * scale).texture; outMat.uniforms.useFg.value = 1; }
    renderer.setRenderTarget(null); renderer.setClearColor(0x050403, 1); renderer.clear(); outMat.uniforms.map.value = roomResult.texture; outMat.uniforms.exposure.value = state.exposure * room.exposure; pass(outMat, null);
    if (!focusOn) { renderer.clearDepth(); renderer.render(fg, view); }
  }
  let running = false; const loop = (ms: number) => { if (!running) return; render(ms / 1000); requestAnimationFrame(loop); };

  return {
    state, players, render, rebuild, apply, resize,
    start() { if (!running) { running = true; requestAnimationFrame(loop); } }, stop() { running = false; },
    home() { Object.assign(state, {yaw: 0, pitch: 0, zoom: 1, dx: 0, dy: 0, dz: 0, sway: false}); apply(); },
    set(patch: Partial<SceneState>) { const relens = 'lens' in patch && patch.lens !== state.lens || 'scale' in patch && patch.scale !== state.scale || 'tray' in patch && patch.tray !== state.tray, reprint = 'logo' in patch || 'felt' in patch; Object.assign(state, patch); if (relens) rebuild(); else { if (reprint) drawFelt(); apply(); } },
    setTrack(next: CardTrack | null) { track = next; },
    // What the picture is right now: the film itself, the film turned (still exact) or the film seen from another place (approximate).
    status() { const turned = !!(state.yaw || state.pitch || state.zoom !== 1 || state.sway); return {view: moved || state.sway && state.mode === 'lean' ? 'moved' : turned ? 'turned' : 'home', camera, focus: state.focus === 'off' ? null : {what: focusWhat, distance: focusNow, tracked: !!track}}; },
  };
}
