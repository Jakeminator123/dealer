// Rooms behind the dealer. Four ways to make a background, kept side by side for comparison:
//   salong   built geometry, real parallax and depth (a placeholder room, not a designed environment)
//   panorama a 360-degree image on a sphere around the camera: exact when turning, no parallax. One room per entry of the
//            register data/scene-rooms.json (readRegister below); without a register the first three: the Las Vegas hall
//            (panorama), a penthouse over a skyline (la) and a forest (skog)
//   hall     a gaming hall, built geometry like the salon, made by src/scene3d-hall.ts and fetched the first time it is shown
//   kuliss   the V6 plate as one flat backdrop behind the dealer
//   plat     the V6 plate fixed to the frame, as V6 does it today
// Everything here is drawn blurred; nothing in a room may stand in front of the table.
import * as T from 'three';
import {FILM, clockAngles, solveCamera, type FilmCamera} from './scene3d-geometry.ts';

// The built rooms by name; a panorama room is named by its entry in the register.
export type RoomId = 'salong' | 'panorama' | 'la' | 'skog' | 'hall' | 'kuliss' | 'plat' | (string & {});
const BUILT = ['salong', 'hall', 'kuliss', 'plat'];
// A room that a module of its own builds (src/scene3d-hall.ts). Dealer metres around the middle of the dealer-side table edge:
// the felt is y = 0, the floor and ceiling as FLOOR and CEILING below, -z is away from the camera, behind the dealer. update
// runs before every drawn frame (lamp: a flickering lamp's brightness, 1 = steady; air: how much is in the air, 0-1) and
// returns the factor for the room's brightness. fog: the room's own, in dealer metres.
export type BuiltRoom = {group: T.Object3D; update(seconds: number, live: {lamp: number; air: number}): number; fog?: {color: number; near: number; far: number}};
// turn and mirror: a panorama's own (Panorama below); 0 and false for the others.
export type Room = {group: T.Object3D | null; plate: T.Texture | null; follow: boolean; hasDepth: boolean; blur: number; exposure: number; fog: T.Fog | null; turn: number; mirror: boolean};
const FLOOR = -0.92, CEILING = 3.15; // dealer metres relative to the felt

// ---- the register of panorama rooms (data/scene-rooms.json, in Git; the pictures are local media under assets/scene/) ----
// What the scene reads of an entry. file: the picture, an equirectangular 2:1 JPEG. blur: the page's "Oskärpa längst bort"
// for the room. exposure: how bright the room is shown. turn: degrees beyond the scene's common panoramaTurn (90 from the
// start, which puts the middle of the picture behind the dealer), the way three turns things: a positive turn brings what
// stood to her right in the picture behind her. mirror: a sphere seen from inside shows its picture mirrored, and the first
// three rooms have always been shown so (seen with a test picture with writing in it, 2026-11-11); a photograph is shown the
// right way round (false), or its writing reads backwards. air: what floats in it, dust or leaves, and the dust's tint behind
// the dealer (linear, may exceed 1) and in front of her (as shown). light: its event in the light, a neon tube that flickers
// while the hall dims a little (Las Vegas), or a cloud that dims the whole room.
export type Panorama = {id: string; file: string; blur: number; exposure: number; turn: number; mirror: boolean; air: 'dust' | 'leaves'; tint: {back: number[]; front: number[]}; light: 'neon' | 'cloud'};
// The rest of an entry is for the pages: a Swedish label and note, the room sound it is heard with (a RoomSound of
// src/lab-sound.ts), whether the game offers it (a new room is tried in the lab until Jakob lets it into the game), and
// whether it is a photograph or a generated picture. Its provenance (size, bytes, sha256, source, author, licence) is for people and the test.
export type RegisterRoom = Panorama & {label: string; note: string; sound: string; game: boolean; kind: 'photo' | 'generated'; author: string; licence: string; page: string | null};
// The first three panoramas as the scene had them before the register, for a page that gives none (the register's entries
// for them hold the same values; tools/scene3d-rooms.test.ts checks it).
export const FIRST_PANORAMAS: Omit<Panorama, 'file'>[] = [
  {id: 'panorama', blur: 5, exposure: 0.8, turn: 0, mirror: true, air: 'dust', tint: {back: [1.35, 1.15, 1.0], front: [0.88, 0.78, 0.71]}, light: 'neon'},
  {id: 'la', blur: 6, exposure: 0.7, turn: 0, mirror: true, air: 'dust', tint: {back: [1.8, 1.17, 0.62], front: [1.0, 0.78, 0.48]}, light: 'cloud'},
  {id: 'skog', blur: 6, exposure: 0.55, turn: 0, mirror: true, air: 'leaves', tint: {back: [1.1, 1.17, 0.75], front: [0.7, 0.75, 0.5]}, light: 'cloud'}];
export const firstPanoramas = (urls: {panorama: string; la: string; skog: string}): Panorama[] => FIRST_PANORAMAS.map(p => ({...p, file: urls[p.id as 'panorama' | 'la' | 'skog']}));
// The register's rooms as the scene and the pages read them, in its order. An entry that cannot be used is left out and
// said in `problems` (in Swedish, for the page). Pure: no three.js and no fetching.
export function readRegister(json: unknown): {rooms: RegisterRoom[]; problems: string[]} {
  const rooms: RegisterRoom[] = [], problems: string[] = [], list = (json as {rooms?: unknown} | null)?.rooms;
  if (!Array.isArray(list)) return {rooms, problems: ['rumsregistret saknar listan rooms']};
  const number = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const tint = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(c => number(c, 0, 4));
  for (const [i, entry] of list.entries()) {
    const r = entry as Partial<RegisterRoom>, id = typeof r?.id === 'string' ? r.id : `nr ${i + 1}`, wrong = [
      !(typeof r?.id === 'string' && /^[a-z0-9-]{1,30}$/.test(r.id)) && 'id', typeof r?.id === 'string' && BUILT.includes(r.id) && 'id (ett byggt rum heter så)',
      rooms.some(other => other.id === r?.id) && 'id (finns två gånger)',
      !(typeof r?.file === 'string' && /^assets\/scene\/(rooms\/[a-z0-9][a-z0-9_-]*|panorama-[a-z]+)\.jpg$/.test(r.file)) && 'file',
      !(typeof r?.label === 'string' && r.label.trim()) && 'label', typeof r?.note !== 'string' && 'note',
      !number(r?.blur, 0, 30) && 'blur', !number(r?.exposure, 0.05, 3) && 'exposure', !number(r?.turn, -180, 180) && 'turn', typeof r?.mirror !== 'boolean' && 'mirror',
      r?.air !== 'dust' && r?.air !== 'leaves' && 'air', !(tint(r?.tint?.back) && tint(r?.tint?.front)) && 'tint', r?.light !== 'neon' && r?.light !== 'cloud' && 'light',
      typeof r?.sound !== 'string' && 'sound', typeof r?.game !== 'boolean' && 'game', r?.kind !== 'photo' && r?.kind !== 'generated' && 'kind',
      typeof r?.author !== 'string' && 'author', typeof r?.licence !== 'string' && 'licence'].filter(Boolean);
    if (wrong.length) { problems.push(`${id}: ${wrong.join(', ')}`); continue; }
    rooms.push({id: r.id!, file: r.file!, blur: r.blur!, exposure: r.exposure!, turn: r.turn!, mirror: r.mirror!, air: r.air!, tint: {back: [...r.tint!.back], front: [...r.tint!.front]}, light: r.light!,
      label: r.label!, note: r.note!, sound: r.sound!, game: r.game!, kind: r.kind!, author: r.author!, licence: r.licence!, page: typeof r.page === 'string' ? r.page : null});
  }
  return {rooms, problems};
}

// ---- life in a room (key roomLife): looping films laid over the parts of a panorama where people stand ----------------
// A panorama is a still, so the people in it stand frozen. A room's line lays a film over each part of its picture that holds
// people. box: that part in fractions of the picture as its file has it (left, top, right, bottom). The film shows exactly that
// part: its frames are the crop moved back where the panorama has it (the model's camera drifts) and levelled to it along the
// edge, played forward and back so the loop has no jump. feather: how far in from the box's edge the film fades into the
// panorama, as a share of the box's width (the same number of picture pixels at top and bottom). The film is a patch of the
// room's own sphere, so it turns and mirrors with it and goes through every pass the room goes through (blur, depth blur,
// exposure, the light's shifts). A room without a line shows nothing more. Made 2026-11-13 from the Poly Haven photograph
// (CC0): the two quays of Venedig, each WAN 3 at 480p, 5 s, frames 10 to 148 forward and back (9.2 s).
// The rooms made from one flat still (Monaco and the den, source.lens in the register) have one box each, around the whole
// still with 72 picture pixels to spare at the sides, so the feather fades in outside the still and no moving person who is
// cut by its edge is half seen. Their films are the still's own loop (WAN 3, 480p, 281 frames, 9.37 s, already seamless, so
// played forward only) laid through the same lens as the still, levelled to it, with the panorama's own pixels where the
// still does not reach; the night and the grey copy use the same box (the grey film made grey with the grey still's formula).
// Made by dealer-f6 with D:/dealer-scratch/tmp/levande-objekt/rum2/life.mjs.
export type RoomLife = {url: string; box: readonly [number, number, number, number]; feather: number};
export const ROOM_LIFE: Readonly<Partial<Record<string, readonly RoomLife[]>>> = {
  venedig: [{url: 'assets/scene/rooms/venedig-liv.mp4', box: [836 / 4096, 968 / 2048, 1268 / 4096, 1211 / 2048], feather: 0.08}, {url: 'assets/scene/rooms/venedig-liv-2.mp4', box: [3026 / 4096, 935 / 2048, 3634 / 4096, 1277 / 2048], feather: 0.08}],
  monaco: [{url: 'assets/scene/rooms/monaco-liv.mp4', box: [1350 / 4096, 631 / 2048, 2746 / 4096, 1417 / 2048], feather: 0.05}],
  'monaco-natt': [{url: 'assets/scene/rooms/monaco-natt-liv.mp4', box: [1350 / 4096, 631 / 2048, 2746 / 4096, 1417 / 2048], feather: 0.05}],
  spelhalan: [{url: 'assets/scene/rooms/spelhalan-liv.mp4', box: [1350 / 4096, 631 / 2048, 2746 / 4096, 1417 / 2048], feather: 0.05}],
  'spelhalan-sv': [{url: 'assets/scene/rooms/spelhalan-sv-liv.mp4', box: [1350 / 4096, 631 / 2048, 2746 / 4096, 1417 / 2048], feather: 0.05}],
};
/** Where a film of ROOM_LIFE lies on its room's sphere (three's SphereGeometry phi and theta, radians), and whether the film is read backwards across: a picture shown the right way round (mirror false) is, as the sphere's own is (show below). */
export function lifePatch(box: readonly number[], mirror: boolean) {
  const [u0, v0, u1, v1] = box;
  return {phiStart: (mirror ? u0 : 1 - u1) * 2 * Math.PI, phiLength: (u1 - u0) * 2 * Math.PI, thetaStart: v0 * Math.PI, thetaLength: (v1 - v0) * Math.PI, flip: !mirror};
}
/** How much of a film shows at (u, v) of its own frame, 0 to 1: it fades in over `feather` of the box's width from each edge; `aspect` is the box's width over its height in picture pixels. */
export function lifeFeather(u: number, v: number, feather: number, aspect: number) {
  const s = (t: number, f: number) => { const x = Math.min(1, Math.max(0, t / f)); return x * x * (3 - 2 * x); };
  return s(u, feather) * s(1 - u, feather) * s(v, feather * aspect) * s(1 - v, feather * aspect);
}
/** A box's width over its height in pixels of its 2:1 picture. */
export const lifeAspect = (box: readonly number[]) => (box[2] - box[0]) * 2 / (box[3] - box[1]);
// Inside the room's sphere (60): its flat facets (64 × 32) lie up to about 0.15 inside the round sphere, and a film nearer to it
// than that loses the depth test in a pattern of the facets. Seen from the middle, the radius changes nothing else.
const LIFE_RADIUS = 58;

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; draw(canvas.getContext('2d')!, w, h);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  if (repeat) { texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(...repeat); }
  return texture;
}

// A standing clock that shows the real time. Painted, not lit, so it reads the same in every room.
function buildClock() {
  const g = new T.Group(), R = 0.34, paint = (color: number) => new T.MeshBasicMaterial({color, fog: false});
  const face = canvasTexture(512, 512, (c, w) => { const m = w / 2; c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(m, m, m, 0, 7); c.fill(); c.fillStyle = '#1d1a16'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 60; i++) { const long = i % 5 === 0; c.save(); c.translate(m, m); c.rotate(i / 60 * Math.PI * 2); c.fillRect(long ? -8 : -2, -m + 14, long ? 16 : 4, long ? 52 : 18); c.restore(); }
    c.font = '600 64px Georgia, serif'; ['12', '3', '6', '9'].forEach((text, i) => c.fillText(text, m + Math.sin(i * Math.PI / 2) * (m - 104), m - Math.cos(i * Math.PI / 2) * (m - 104))); });
  g.add(new T.Mesh(new T.CircleGeometry(R, 48), new T.MeshBasicMaterial({map: face, color: 0xb9b0a0, fog: false})), new T.Mesh(new T.TorusGeometry(R, 0.022, 12, 64), paint(0x8a6c36)));
  const hand = (length: number, width: number, color: number, z: number) => { const m = new T.Mesh(new T.BoxGeometry(width, length, 0.004).translate(0, length / 2 - width, 0), paint(color)); m.position.z = z; g.add(m); return m; };
  const hour = hand(R * 0.55, 0.05, 0x14110e, 0.006), minute = hand(R * 0.84, 0.036, 0x14110e, 0.011), second = hand(R * 0.88, 0.012, 0x9b2a22, 0.016);
  const pole = new T.Mesh(new T.CylinderGeometry(0.022, 0.03, 2.2, 16), paint(0x6d5529)); pole.position.set(0, -R - 1.1, -0.03); g.add(pole);
  return {group: g, set(now: Date) { const a = clockAngles(now.getHours(), now.getMinutes(), now.getSeconds() + now.getMilliseconds() / 1000); hour.rotation.z = -a.hour; minute.rotation.z = -a.minute; second.rotation.z = -a.second; }};
}
// Things in the air. Dust: very small warm specks that wander slowly and show where a lamp shines on them. Leaves (the
// forest): fewer, larger, coloured, falling with a sway. Each exists twice: a cloud behind the dealer, drawn with the room
// and blurred with it, and a thin cloud between the camera and the dealer, drawn over the film, where a speck close to
// the lens is a large faint disc. That second cloud is what puts air between the viewer and her. All motion comes from
// the time alone, in the shader.
const AIR_VERTEX = `attribute float seed; uniform float time, amount, pixels, leaves; uniform vec3 box0, box1; varying float vGlow; varying float vSeed; varying float vTurn;
void main(){
  vec3 p = position; float t = time;
  p.x += sin(t * (.05 + seed * .06) + seed * 40.) * .18 + sin(t * .013 + seed * 9.) * .3 + leaves * sin(t * (.6 + seed) + seed * 12.) * .12;
  p.z += cos(t * (.04 + seed * .05) + seed * 23.) * .15;
  p.y = box0.y + mod(p.y - box0.y - t * mix(.004 + seed * .008, .05 + seed * .05, leaves), box1.y - box0.y); // dust sinks a few millimetres a second, leaves fall
  vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
  float px = pixels * mix(4. + seed * 4.5, 34. + seed * 38., leaves) / max(.22, -mv.z);
  // where the lamps shine: over the table in front of the dealer and under the pendants behind her
  float beam = max(max(1. - smoothstep(.2, 1., distance(p.xz, vec2(-.3, .25))), 1. - smoothstep(.3, 1.2, distance(p.xz, vec2(2.3, -2.9)))), max(1. - smoothstep(.3, 1.2, distance(p.xz, vec2(-2.3, -2.9))), 1. - smoothstep(.3, 1.3, distance(p.xz, vec2(0., -4.4)))));
  float twinkle = .88 + .12 * sin(t * (.08 + seed * .2) + seed * 90.); // slow and slight: a speck that blinks reads as flicker
  // a speck spread over many pixels is fainter in proportion, so one close to the lens is a soft disc and not a snowball
  vGlow = step(seed, amount) * mix((.22 + 1.3 * beam) * twinkle * min(1., 3. / px), 1., leaves);
  vSeed = seed; vTurn = t * (.4 + seed) + seed * 30.; gl_PointSize = max(px, 1.6);
}`;
const DUST_FRAGMENT = 'varying float vGlow; uniform vec3 tint; void main(){ float a = smoothstep(.5, .12, length(gl_PointCoord - .5)) * vGlow; if (a < .002) discard; gl_FragColor = vec4(tint * a, a); }';
const LEAF_FRAGMENT = `varying float vGlow; varying float vSeed; varying float vTurn; uniform vec3 tint;
void main(){ vec2 q = gl_PointCoord - .5; float c = cos(vTurn), s = sin(vTurn); q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  float leaf = (1. - smoothstep(.8, 1., q.x * q.x / .2 + q.y * q.y / (.02 + .05 * abs(sin(vTurn * .7))))) * vGlow; if (leaf < .01) discard;
  vec3 colour = mix(vec3(.33, .42, .12), vec3(.62, .36, .08), fract(vSeed * 7.)) * (.75 + .5 * q.y) * tint; gl_FragColor = vec4(colour * leaf, leaf); }`;
type Air = {points: T.Points; set(seconds: number, amount: number, pixels: number, tint: number[]): void};
function buildAir(count: number, lo: number[], hi: number[], leaves: boolean, seedStart: number, overFilm: boolean): Air {
  const position = new Float32Array(count * 3), seed = new Float32Array(count); let s = seedStart; const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) { for (let k = 0; k < 3; k++) position[i * 3 + k] = lo[k] + random() * (hi[k] - lo[k]); seed[i] = random(); }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(position, 3)); geometry.setAttribute('seed', new T.BufferAttribute(seed, 1));
  // dust adds light and leaves the picture's alpha alone; a leaf covers what is behind it
  const material = new T.ShaderMaterial({vertexShader: AIR_VERTEX, fragmentShader: leaves ? LEAF_FRAGMENT : DUST_FRAGMENT, transparent: true, depthWrite: false, depthTest: !overFilm,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: leaves ? T.OneMinusSrcAlphaFactor : T.OneFactor, blendSrcAlpha: leaves ? T.OneFactor : T.ZeroFactor, blendDstAlpha: leaves ? T.OneMinusSrcAlphaFactor : T.OneFactor,
    uniforms: {time: {value: 0}, amount: {value: 0}, pixels: {value: 1}, leaves: {value: leaves ? 1 : 0}, box0: {value: new T.Vector3(...lo)}, box1: {value: new T.Vector3(...hi)}, tint: {value: new T.Vector3(1, 1, 1)}}});
  const points = new T.Points(geometry, material); points.frustumCulled = false; points.visible = false; if (overFilm) points.renderOrder = 9;
  return {points, set(seconds, amount, pixels, tint) { const u = material.uniforms; u.time.value = seconds; u.amount.value = amount; u.pixels.value = pixels; (u.tint.value as T.Vector3).set(tint[0], tint[1], tint[2]); }};
}

function buildSalon() {
  const g = new T.Group(), lamps: {material: T.MeshBasicMaterial; light: T.PointLight}[] = []; let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const std = (color: number, roughness = 0.7, metalness = 0, map: T.Texture | null = null) => new T.MeshStandardMaterial({color, roughness, metalness, map});
  // lamps are brighter than white on purpose: the blur turns them into soft discs
  const glow = (r: number, gr: number, b: number) => new T.MeshBasicMaterial({color: new T.Color(r, gr, b), fog: false});
  const box = (w: number, h: number, d: number, material: T.Material, x: number, y: number, z: number) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), material); m.position.set(x, y, z); g.add(m); return m; };
  const light = (color: number, intensity: number, distance: number, x: number, y: number, z: number) => { const l = new T.PointLight(color, intensity, distance, 2); l.position.set(x, y, z); g.add(l); return l; };
  const carpet = canvasTexture(512, 512, (c, w, h) => { c.fillStyle = '#2a1712'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${90 + random() * 80 | 0},${40 + random() * 40 | 0},${30 + random() * 30 | 0},${0.1 + random() * 0.2})`; c.fillRect(random() * w, random() * h, 2, 2); }
    c.strokeStyle = 'rgba(190,140,70,.35)'; c.lineWidth = 3; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(i * 128 + 64, j * 128 + 64, 46, 0, 7); c.stroke(); c.beginPath(); c.arc(i * 128, j * 128, 22, 0, 7); c.stroke(); } }, [14, 14]);
  const panel = canvasTexture(1024, 512, (c, w, h) => { c.fillStyle = '#2b1a10'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = `rgba(0,0,0,${0.1 + random() * 0.25})`; c.fillRect(x, 0, 3, h); c.fillStyle = `rgba(160,110,60,${random() * 0.07})`; c.fillRect(x + 4, 0, 9, h); }
    c.fillStyle = 'rgba(200,150,70,.5)'; c.fillRect(0, h * 0.86, w, 5); c.fillRect(0, h * 0.2, w, 3); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, h * 0.87, w, h * 0.13); }, [4, 1]);
  const floor = new T.Mesh(new T.PlaneGeometry(44, 44), std(0xffffff, 0.95, 0, carpet)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, FLOOR, -2); g.add(floor);
  const ceiling = new T.Mesh(new T.PlaneGeometry(44, 44), std(0x150e09, 1)); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, CEILING, -2); g.add(ceiling);
  const wall = std(0xffffff, 0.6, 0.05, panel), height = CEILING - FLOOR, mid = FLOOR + height / 2, brass = std(0xb08a45, 0.3, 0.9), walnut = std(0x24130a, 0.45, 0.1);
  box(22, height, 0.2, wall, 0, mid, -5.6); box(0.2, height, 22, wall, -9, mid, 0); box(0.2, height, 22, wall, 9, mid, 0);
  // light slots along the back wall, none directly behind the dealer's head
  for (const x of [-7.2, -4.4, -1.9, 1.9, 4.4, 7.2]) { box(0.1, 2.3, 0.04, glow(5, 2.7, 0.9), x, FLOOR + 1.75, -5.47); light(0xffb060, 7, 7, x, FLOOR + 1.8, -5.0); }
  box(3.0, 1.9, 0.06, std(0x1c110b, 0.35, 0.2), 0, FLOOR + 1.75, -5.47); box(3.14, 2.04, 0.04, brass, 0, FLOOR + 1.75, -5.49);
  for (const [x, z] of [[-3.1, -3.5], [3.1, -3.5], [-6.3, -1.4], [6.3, -1.4], [-6.3, 2.2], [6.3, 2.2]]) { box(0.56, height, 0.56, walnut, x, mid, z); box(0.64, 0.12, 0.64, brass, x, FLOOR + 0.06, z); box(0.64, 0.08, 0.64, brass, x, FLOOR + 2.5, z); box(0.07, 1.9, 0.02, glow(4, 2.0, 0.7), x, FLOOR + 1.45, z + 0.29); }
  // ceiling downlights and pendants at different depths
  for (let x = -8; x <= 8; x += 2) for (let z = -5; z <= 3; z += 2) { const d = new T.Mesh(new T.CircleGeometry(0.06, 16), glow(6, 4.2, 2.2)); d.rotation.x = Math.PI / 2; d.position.set(x + (random() - 0.5) * 0.2, CEILING - 0.01, z); g.add(d); }
  for (const [x, y, z] of [[-2.3, 1.9, -2.9], [2.3, 1.9, -2.9], [-4.9, 1.7, -2.2], [4.9, 1.7, -2.2], [0, 2.3, -4.4]]) { const s = new T.Mesh(new T.SphereGeometry(0.085, 20, 14), glow(7, 4.0, 1.6)); s.position.set(x, y, z); g.add(s); box(0.008, CEILING - y, 0.008, brass, x, (CEILING + y) / 2, z); lamps.push({material: s.material as T.MeshBasicMaterial, light: light(0xffc27a, 3, 6, x, y - 0.1, z)}); }
  // bar, far left
  box(3.4, 1.06, 0.62, walnut, -5.9, FLOOR + 0.53, -4.5); box(3.5, 0.04, 0.7, brass, -5.9, FLOOR + 1.08, -4.5);
  for (let r = 0; r < 3; r++) { box(3.3, 0.03, 0.2, brass, -5.9, FLOOR + 1.34 + r * 0.42, -5.42);
    for (let i = 0; i < 26; i++) { const c = random(); box(0.055, 0.17 + random() * 0.1, 0.055, c < 0.7 ? glow(0.5 + random() * 0.5, 0.2 + random() * 0.15, 0.03) : c < 0.88 ? glow(0.03, 0.25, 0.32) : glow(0.45, 0.04, 0.16), -7.45 + i * 0.125, FLOOR + 1.47 + r * 0.42, -5.42); } }
  // lounge, far right: two armchairs, a small table and a candle
  const velvet = std(0x3b2b25, 0.9);
  for (const [x, z, turn] of [[4.6, -4.2, -0.35], [6.0, -3.6, -1.1]]) { const chair = new T.Group(); chair.position.set(x, FLOOR, z); chair.rotation.y = turn; g.add(chair);
    for (const [w, h, d, px, py, pz] of [[0.8, 0.4, 0.75, 0, 0.25, 0], [0.8, 0.55, 0.16, 0, 0.7, -0.3], [0.14, 0.3, 0.7, -0.4, 0.55, 0], [0.14, 0.3, 0.7, 0.4, 0.55, 0]]) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), velvet); m.position.set(px, py, pz); chair.add(m); } }
  { const top = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.03, 32), brass); top.position.set(5.35, FLOOR + 0.55, -4.25); g.add(top); box(0.03, 0.54, 0.03, brass, 5.35, FLOOR + 0.27, -4.25);
    const candle = new T.Mesh(new T.SphereGeometry(0.035, 12, 10), glow(8, 4.5, 1.5)); candle.position.set(5.35, FLOOR + 0.63, -4.25); g.add(candle); light(0xffa850, 1.2, 3, 5.35, FLOOR + 0.7, -4.25); }
  // palm, left of the dealer as in the V6 plate
  { const pot = new T.Mesh(new T.CylinderGeometry(0.23, 0.2, 0.62, 28), brass); pot.position.set(-2.35, FLOOR + 0.31, -4.3); g.add(pot); const leaf = std(0x2f6b2c, 0.8); leaf.side = T.DoubleSide;
    for (let i = 0; i < 40; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.06, 1.3 + random() * 0.7), leaf); m.geometry.translate(0, 0.9, 0); m.position.set(-2.35, FLOOR + 0.6, -4.3); m.rotation.set((0.25 + random() * 0.75) * (random() > 0.5 ? 1 : -1), random() * Math.PI * 2, (random() - 0.5) * 0.8, 'YXZ'); g.add(m); }
    light(0xffc890, 1.4, 3.5, -2.1, FLOOR + 0.9, -3.7); }
  g.add(new T.AmbientLight(0xffd9b0, 0.42), new T.HemisphereLight(0x3a2a20, 0x120a06, 0.8));
  return {group: g, lamp: lamps[1]}; // the pendant to the right of the dealer is the one that may flicker
}

// `onMissing` is told when an image cannot be read, so the page can say so instead of showing a black room.
// `panoramas`: the register's rooms (readRegister); without them the first three, with their pictures at `urls`.
export function createRooms(scene: T.Scene, urls: {plate: string; panorama: string; la: string; skog: string}, onMissing: (room: RoomId) => void, panoramas: Panorama[] = firstPanoramas(urls)) {
  const loader = new T.TextureLoader(), load = (url: string, rooms: RoomId[]) => { const t = loader.load(url, undefined, undefined, () => rooms.forEach(onMissing)); t.colorSpace = T.SRGBColorSpace; return t; };
  const plate = load(urls.plate, ['kuliss', 'plat']);
  const ball = new T.SphereGeometry(60, 64, 32), sphereOf = (map: T.Texture | null) => new T.Mesh(ball, new T.MeshBasicMaterial({map, side: T.BackSide, fog: false}));
  const built = buildSalon(), salon = built.group, clock = buildClock();
  const hallBox = new T.Group(); let hall: BuiltRoom | null = null, hallAsked = false, k = 1; // the hall's group is empty until its module has been read
  // One sphere per panorama; its picture is fetched the first time the room is shown.
  const spheres = panoramas.map(look => ({look, mesh: sphereOf(null)})), later = new Map(spheres.map(s => [s.look.id, s]));
  const lights = new Map(panoramas.map(p => [p.id, p.light]));
  const backdrop = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({map: plate, color: 0x959595, fog: false}));
  const rooms: Record<RoomId, Room> = {
    salong: {group: salon, plate: null, follow: false, hasDepth: true, blur: 11, exposure: 1, fog: new T.Fog(0x0f0906, 8, 30), turn: 0, mirror: false},
    ...Object.fromEntries(spheres.map(({look, mesh}) => [look.id, {group: mesh, plate: null, follow: true, hasDepth: false, blur: look.blur, exposure: look.exposure, fog: null, turn: look.turn, mirror: look.mirror}])),
    hall: {group: hallBox, plate: null, follow: false, hasDepth: true, blur: 11, exposure: 1, fog: new T.Fog(0x0b0710, 8, 30), turn: 0, mirror: false},
    kuliss: {group: backdrop, plate: null, follow: false, hasDepth: false, blur: 9, exposure: 1, fog: null, turn: 0, mirror: false},
    plat: {group: null, plate, follow: false, hasDepth: false, blur: 8, exposure: 1, fog: null, turn: 0, mirror: false},
  };
  // air: behind the dealer (with the room) and between the camera and the dealer (over the film; the caller adds `front` to its foreground)
  const dustBack = buildAir(2000, [-3.6, -0.5, -4.6], [3.6, 2.3, -0.2], false, 3, false), dustFront = buildAir(1100, [-1.6, 0.04, 0.03], [1.6, 1.2, 0.72], false, 5, true);
  const leafBack = buildAir(260, [-3.6, -0.6, -4.2], [3.6, 2.6, -0.3], true, 7, false), leafFront = buildAir(40, [-1.4, 0.1, 0.05], [1.4, 1.2, 0.65], true, 9, true);
  const back = [dustBack, leafBack], front = [dustFront, leafFront];
  // two neon tubes for the Las Vegas hall; the magenta one is the one that may flicker
  const neon = new T.Group(), tube = (r: number, gr: number, b: number, x: number, z: number) => { const m = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 1.7, 12), new T.MeshBasicMaterial({color: new T.Color(r, gr, b), fog: false})); m.position.set(x, 0.75, z); neon.add(m); return m.material as T.MeshBasicMaterial; };
  const magenta = tube(6, 0.6, 3.2, -2.6, -3.4); tube(0.5, 3.5, 5, 2.9, -3.6); neon.visible = false;
  scene.add(salon, ...spheres.map(s => s.mesh), hallBox, backdrop, clock.group, neon, ...back.map(a => a.points)); clock.group.visible = false;
  const hallFog = () => { const own = hall?.fog ?? {color: 0x0b0710, near: 8, far: 30}, fog = rooms.hall.fog!; fog.color.set(own.color); fog.near = own.near * k; fog.far = own.far * k; };
  // tint of the dust per room: [behind the dealer (linear, may exceed 1), in front of her (as shown)], and how much of it is leaves
  // (a panorama's from its entry)
  const AIR: Record<RoomId, {back: number[]; front: number[]; leaves: number}> = {
    salong: {back: [1.5, 1.23, 0.85], front: [0.95, 0.83, 0.66], leaves: 0}, hall: {back: [1.3, 1.1, 1.25], front: [0.85, 0.78, 0.82], leaves: 0},
    kuliss: {back: [1.5, 1.23, 0.85], front: [0.95, 0.83, 0.66], leaves: 0}, plat: {back: [0, 0, 0], front: [0.95, 0.83, 0.66], leaves: 0},
    ...Object.fromEntries(panoramas.map(p => [p.id, {back: p.tint.back, front: p.tint.front, leaves: p.air === 'leaves' ? 1 : 0}]))};
  // The films over a room's people (ROOM_LIFE), made the first time they are wanted, as children of the room's sphere. A film
  // is shown from its first decoded frame on; until then, or if it cannot be read, the room is the still picture.
  type Life = {video: HTMLVideoElement; mesh: T.Mesh; ready: boolean};
  const lives = new Map<RoomId, Life[]>();
  function livesOf(id: RoomId): Life[] {
    const had = lives.get(id); if (had) return had;
    const lines = ROOM_LIFE[id], sphere = spheres.find(s => s.look.id === id); if (!lines || !sphere) return [];
    const list = lines.map(line => {
      const video = document.createElement('video'); video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto'; video.src = line.url;
      const patch = lifePatch(line.box, sphere.look.mirror), aspect = lifeAspect(line.box), map = new T.VideoTexture(video);
      // mipmaps: the film is seen several times smaller than it is, and moves
      map.colorSpace = T.SRGBColorSpace; map.generateMipmaps = true; map.minFilter = T.LinearMipmapLinearFilter; if (patch.flip) { map.repeat.x = -1; map.offset.x = 1; }
      const S = 64, fade = new Uint8Array(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fade.fill(Math.round(255 * lifeFeather((x + 0.5) / S, (y + 0.5) / S, line.feather, aspect)), (y * S + x) * 4, (y * S + x) * 4 + 4);
      const alpha = new T.DataTexture(fade, S, S); alpha.magFilter = alpha.minFilter = T.LinearFilter; alpha.needsUpdate = true;
      const mesh = new T.Mesh(new T.SphereGeometry(LIFE_RADIUS, 24, 12, patch.phiStart, patch.phiLength, patch.thetaStart, patch.thetaLength), new T.MeshBasicMaterial({map, alphaMap: alpha, transparent: true, depthWrite: false, side: T.BackSide, fog: false}));
      mesh.visible = false; sphere.mesh.add(mesh);
      const life: Life = {video, mesh, ready: false}; video.addEventListener('loadeddata', () => { life.ready = true; }, {once: true});
      return life;
    });
    lives.set(id, list); return list;
  }
  return {
    rooms,
    // Rooms are built in dealer metres around the dealer-side table edge and scaled into the plan-scale world.
    place(camera: FilmCamera) {
      const {pitch, edgeDistance} = solveCamera(camera), distance = edgeDistance + 3.2 * (k = camera.scale), halfWidth = FILM.width / 2 / camera.focalPx * distance * 1.14;
      hallBox.position.set(0, 0, -edgeDistance); hallBox.scale.setScalar(k); hallFog();
      salon.position.set(0, 0, -edgeDistance); salon.scale.setScalar(k); rooms.salong.fog!.near = 8 * k; rooms.salong.fog!.far = 30 * k;
      backdrop.scale.set(2 * halfWidth, 2 * halfWidth / 1.5, 1); backdrop.position.set(0, camera.heightM - Math.tan(pitch) * distance, -edgeDistance - 3.2 * k);
      // the clock stands close behind the dealer's left shoulder (image right), so it is among the sharper things in the room
      clock.group.position.set(1.9 * k, 1.1 * k, -edgeDistance - 1.5 * k); clock.group.scale.setScalar(k * 0.88);
      for (const o of [neon, ...back.map(a => a.points), ...front.map(a => a.points)]) { o.position.set(0, 0, -edgeDistance); o.scale.setScalar(k); }
    },
    show(id: RoomId) {
      // a picture shown the right way round is read backwards across (repeat -1): the sphere would otherwise mirror it
      const wait = later.get(id); if (wait) { const material = wait.mesh.material as T.MeshBasicMaterial, map = load(wait.look.file, [id]); later.delete(id);
        if (!wait.look.mirror) { map.wrapS = T.RepeatWrapping; map.repeat.x = -1; } material.map = map; material.needsUpdate = true; }
      if (id === 'hall' && !hallAsked) { hallAsked = true; import('./scene3d-hall.ts').then(m => { hall = m.buildHall() as BuiltRoom; hallBox.add(hall.group); hallFog(); }, () => onMissing('hall')); }
      for (const [name, room] of Object.entries(rooms)) if (room.group) room.group.visible = name === id; scene.fog = rooms[id]?.fog ?? null;
    },
    // The clouds drawn over the film; the caller puts them in its foreground scene.
    front: front.map(a => a.points),
    // What moves in the room, the same three things in every room in the form that suits it: a clock, something in the air and
    // an event in the light. `lamp` is a flickering lamp's brightness and `cloud` a passing cloud's, 1 = nothing happening.
    // Salon: a pendant flickers. Las Vegas (a panorama whose light is neon): a neon tube flickers and the hall dims a little.
    // The other panoramas and the plates: the cloud dims the whole room. Returns the factor for the room's brightness. `pixels` = picture height / film height.
    // `front`: the share of the air that is shown between the camera and the dealer, 1 if not given. A change of room with the
    // shimmer thins it out and lets it come back, so that one room's dust or leaves do not turn into another's in one frame.
    ambient(id: RoomId, seconds: number, now: Date, live: {clock: boolean; air: number; lamp: number; cloud: number; front?: number}, pixels: number): number {
      const inRoom = id !== 'plat', air = AIR[id]; clock.group.visible = inRoom && live.clock; if (clock.group.visible) clock.set(now);
      const amounts = [live.air * (air.leaves ? 0.45 : 1), live.air * air.leaves];
      back.forEach((a, i) => { a.points.visible = inRoom && amounts[i] > 0; if (a.points.visible) a.set(seconds, amounts[i], pixels * 0.5, i ? [1.5, 1.5, 1.3] : air.back); }); // the room is drawn at half size; leaves keep their own colour
      front.forEach((a, i) => { const amount = amounts[i] * (live.front ?? 1); a.points.visible = amount > 0; if (a.points.visible) a.set(seconds, amount, pixels, i ? [1, 1, 1] : air.front); });
      const lit = live.lamp * live.lamp; built.lamp.material.color.setRGB(7 * lit, 4 * lit, 1.6 * lit); built.lamp.light.intensity = 3 * live.lamp;
      const neonRoom = lights.get(id) === 'neon'; neon.visible = neonRoom; magenta.color.setRGB(6 * lit, 0.6 * lit, 3.2 * lit);
      if (id === 'hall') return hall ? hall.update(seconds, {lamp: live.lamp, air: live.air}) : 1;
      return id === 'salong' ? 1 : neonRoom ? 1 - 0.15 * (1 - live.lamp) : live.cloud;
    },
    // A panorama follows the camera, turned by the scene's common turn and its own.
    followCamera(id: RoomId, position: T.Vector3, turnDeg: number) { const room = rooms[id]; if (room.follow && room.group) { room.group.position.copy(position); room.group.rotation.y = (turnDeg + room.turn) * Math.PI / 180; } },
    // Life in the rooms drawn this frame (`ids`, ROOM_LIFE): their films play and show while `on`; every other film stands still, hidden.
    life(ids: RoomId[], on: boolean) {
      if (on) for (const id of ids) livesOf(id);
      for (const [id, list] of lives) { const wanted = on && ids.includes(id); for (const l of list) { l.mesh.visible = wanted && l.ready; if (wanted && l.video.paused) l.video.play().catch(() => {}); else if (!wanted && !l.video.paused) l.video.pause(); } }
    },
    // With the scene: every film stopped and emptied (its mesh and textures go with the scene's own walk of what it holds).
    dispose() { for (const list of lives.values()) for (const l of list) { l.video.pause(); l.video.removeAttribute('src'); l.video.load(); } lives.clear(); },
  };
}
