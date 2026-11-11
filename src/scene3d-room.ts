// Rooms behind the dealer. Four ways to make a background, kept side by side for comparison:
//   salong   built geometry, real parallax and depth (a placeholder room, not a designed environment)
//   panorama a 360-degree image on a sphere around the camera: exact when turning, no parallax.
//            Three of them: the Las Vegas hall (panorama), a penthouse over a skyline (la) and a forest (skog)
//   hall     a gaming hall, built geometry like the salon, made by src/scene3d-hall.ts and fetched the first time it is shown
//   kuliss   the V6 plate as one flat backdrop behind the dealer
//   plat     the V6 plate fixed to the frame, as V6 does it today
// Everything here is drawn blurred; nothing in a room may stand in front of the table.
import * as T from 'three';
import {FILM, clockAngles, solveCamera, type FilmCamera} from './scene3d-geometry.ts';

export type RoomId = 'salong' | 'panorama' | 'la' | 'skog' | 'hall' | 'kuliss' | 'plat';
// A room that a module of its own builds (src/scene3d-hall.ts). Dealer metres around the middle of the dealer-side table edge:
// the felt is y = 0, the floor and ceiling as FLOOR and CEILING below, -z is away from the camera, behind the dealer. update
// runs before every drawn frame (lamp: a flickering lamp's brightness, 1 = steady; air: how much is in the air, 0-1) and
// returns the factor for the room's brightness. fog: the room's own, in dealer metres.
export type BuiltRoom = {group: T.Object3D; update(seconds: number, live: {lamp: number; air: number}): number; fog?: {color: number; near: number; far: number}};
export type Room = {group: T.Object3D | null; plate: T.Texture | null; follow: boolean; hasDepth: boolean; blur: number; exposure: number; fog: T.Fog | null};
const FLOOR = -0.92, CEILING = 3.15; // dealer metres relative to the felt

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
export function createRooms(scene: T.Scene, urls: {plate: string; panorama: string; la: string; skog: string}, onMissing: (room: RoomId) => void) {
  const loader = new T.TextureLoader(), load = (url: string, rooms: RoomId[]) => { const t = loader.load(url, undefined, undefined, () => rooms.forEach(onMissing)); t.colorSpace = T.SRGBColorSpace; return t; };
  const plate = load(urls.plate, ['kuliss', 'plat']), panorama = load(urls.panorama, ['panorama']);
  const ball = new T.SphereGeometry(60, 64, 32), sphereOf = (map: T.Texture | null) => new T.Mesh(ball, new T.MeshBasicMaterial({map, side: T.BackSide, fog: false}));
  const built = buildSalon(), salon = built.group, clock = buildClock(), sphere = sphereOf(panorama), la = sphereOf(null), skog = sphereOf(null);
  const hallBox = new T.Group(); let hall: BuiltRoom | null = null, hallAsked = false, k = 1; // the hall's group is empty until its module has been read
  // The two extra panoramas are fetched the first time they are shown.
  const later: Partial<Record<RoomId, {mesh: T.Mesh; url: string}>> = {la: {mesh: la, url: urls.la}, skog: {mesh: skog, url: urls.skog}};
  const backdrop = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({map: plate, color: 0x959595, fog: false}));
  const rooms: Record<RoomId, Room> = {
    salong: {group: salon, plate: null, follow: false, hasDepth: true, blur: 11, exposure: 1, fog: new T.Fog(0x0f0906, 8, 30)},
    panorama: {group: sphere, plate: null, follow: true, hasDepth: false, blur: 5, exposure: 0.8, fog: null},
    la: {group: la, plate: null, follow: true, hasDepth: false, blur: 6, exposure: 0.7, fog: null},
    skog: {group: skog, plate: null, follow: true, hasDepth: false, blur: 6, exposure: 0.55, fog: null},
    hall: {group: hallBox, plate: null, follow: false, hasDepth: true, blur: 11, exposure: 1, fog: new T.Fog(0x0b0710, 8, 30)},
    kuliss: {group: backdrop, plate: null, follow: false, hasDepth: false, blur: 9, exposure: 1, fog: null},
    plat: {group: null, plate, follow: false, hasDepth: false, blur: 8, exposure: 1, fog: null},
  };
  // air: behind the dealer (with the room) and between the camera and the dealer (over the film; the caller adds `front` to its foreground)
  const dustBack = buildAir(2000, [-3.6, -0.5, -4.6], [3.6, 2.3, -0.2], false, 3, false), dustFront = buildAir(1100, [-1.6, 0.04, 0.03], [1.6, 1.2, 0.72], false, 5, true);
  const leafBack = buildAir(260, [-3.6, -0.6, -4.2], [3.6, 2.6, -0.3], true, 7, false), leafFront = buildAir(40, [-1.4, 0.1, 0.05], [1.4, 1.2, 0.65], true, 9, true);
  const back = [dustBack, leafBack], front = [dustFront, leafFront];
  // two neon tubes for the Las Vegas hall; the magenta one is the one that may flicker
  const neon = new T.Group(), tube = (r: number, gr: number, b: number, x: number, z: number) => { const m = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 1.7, 12), new T.MeshBasicMaterial({color: new T.Color(r, gr, b), fog: false})); m.position.set(x, 0.75, z); neon.add(m); return m.material as T.MeshBasicMaterial; };
  const magenta = tube(6, 0.6, 3.2, -2.6, -3.4); tube(0.5, 3.5, 5, 2.9, -3.6); neon.visible = false;
  scene.add(salon, sphere, la, skog, hallBox, backdrop, clock.group, neon, ...back.map(a => a.points)); clock.group.visible = false;
  const hallFog = () => { const own = hall?.fog ?? {color: 0x0b0710, near: 8, far: 30}, fog = rooms.hall.fog!; fog.color.set(own.color); fog.near = own.near * k; fog.far = own.far * k; };
  // tint of the dust per room: [behind the dealer (linear, may exceed 1), in front of her (as shown)], and how much of it is leaves
  const AIR: Record<RoomId, {back: number[]; front: number[]; leaves: number}> = {
    salong: {back: [1.5, 1.23, 0.85], front: [0.95, 0.83, 0.66], leaves: 0}, panorama: {back: [1.35, 1.15, 1.0], front: [0.88, 0.78, 0.71], leaves: 0},
    la: {back: [1.8, 1.17, 0.62], front: [1.0, 0.78, 0.48], leaves: 0}, skog: {back: [1.1, 1.17, 0.75], front: [0.7, 0.75, 0.5], leaves: 1}, hall: {back: [1.3, 1.1, 1.25], front: [0.85, 0.78, 0.82], leaves: 0},
    kuliss: {back: [1.5, 1.23, 0.85], front: [0.95, 0.83, 0.66], leaves: 0}, plat: {back: [0, 0, 0], front: [0.95, 0.83, 0.66], leaves: 0}};
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
      const wait = later[id]; if (wait) { const material = wait.mesh.material as T.MeshBasicMaterial; material.map = load(wait.url, [id]); material.needsUpdate = true; delete later[id]; }
      if (id === 'hall' && !hallAsked) { hallAsked = true; import('./scene3d-hall.ts').then(m => { hall = m.buildHall() as BuiltRoom; hallBox.add(hall.group); hallFog(); }, () => onMissing('hall')); }
      for (const [name, room] of Object.entries(rooms)) if (room.group) room.group.visible = name === id; scene.fog = rooms[id].fog;
    },
    // The clouds drawn over the film; the caller puts them in its foreground scene.
    front: front.map(a => a.points),
    // What moves in the room, the same three things in every room in the form that suits it: a clock, something in the air and
    // an event in the light. `lamp` is a flickering lamp's brightness and `cloud` a passing cloud's, 1 = nothing happening.
    // Salon: a pendant flickers. Las Vegas: a neon tube flickers and the hall dims a little. Rooms lit from outside (skyline,
    // forest, plates): the cloud dims the whole room. Returns the factor for the room's brightness. `pixels` = picture height / film height.
    // `front`: the share of the air that is shown between the camera and the dealer, 1 if not given. A change of room with the
    // shimmer thins it out and lets it come back, so that one room's dust or leaves do not turn into another's in one frame.
    ambient(id: RoomId, seconds: number, now: Date, live: {clock: boolean; air: number; lamp: number; cloud: number; front?: number}, pixels: number): number {
      const inRoom = id !== 'plat', air = AIR[id]; clock.group.visible = inRoom && live.clock; if (clock.group.visible) clock.set(now);
      const amounts = [live.air * (air.leaves ? 0.45 : 1), live.air * air.leaves];
      back.forEach((a, i) => { a.points.visible = inRoom && amounts[i] > 0; if (a.points.visible) a.set(seconds, amounts[i], pixels * 0.5, i ? [1.5, 1.5, 1.3] : air.back); }); // the room is drawn at half size; leaves keep their own colour
      front.forEach((a, i) => { const amount = amounts[i] * (live.front ?? 1); a.points.visible = amount > 0; if (a.points.visible) a.set(seconds, amount, pixels, i ? [1, 1, 1] : air.front); });
      const lit = live.lamp * live.lamp; built.lamp.material.color.setRGB(7 * lit, 4 * lit, 1.6 * lit); built.lamp.light.intensity = 3 * live.lamp;
      neon.visible = id === 'panorama'; magenta.color.setRGB(6 * lit, 0.6 * lit, 3.2 * lit);
      if (id === 'hall') return hall ? hall.update(seconds, {lamp: live.lamp, air: live.air}) : 1;
      return id === 'salong' ? 1 : id === 'panorama' ? 1 - 0.15 * (1 - live.lamp) : live.cloud;
    },
    followCamera(id: RoomId, position: T.Vector3, turnDeg: number) { const room = rooms[id]; if (room.follow && room.group) { room.group.position.copy(position); room.group.rotation.y = turnDeg * Math.PI / 180; } },
  };
}
