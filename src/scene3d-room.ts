// Rooms behind the dealer. Four ways to make a background, kept side by side for comparison:
//   salong   built geometry, real parallax and depth (a placeholder room, not a designed environment)
//   panorama a 360-degree image on a sphere around the camera: exact when turning, no parallax
//   kuliss   the V6 plate as one flat backdrop behind the dealer
//   plat     the V6 plate fixed to the frame, as V6 does it today
// Everything here is drawn blurred; nothing in a room may stand in front of the table.
import * as T from 'three';
import {FILM, solveCamera, type FilmCamera} from './scene3d-geometry.ts';

export type RoomId = 'salong' | 'panorama' | 'kuliss' | 'plat';
export type Room = {group: T.Object3D | null; plate: T.Texture | null; follow: boolean; hasDepth: boolean; blur: number; exposure: number; fog: T.Fog | null};
const FLOOR = -0.92, CEILING = 3.15; // dealer metres relative to the felt

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; draw(canvas.getContext('2d')!, w, h);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  if (repeat) { texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(...repeat); }
  return texture;
}

function buildSalon() {
  const g = new T.Group(); let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const std = (color: number, roughness = 0.7, metalness = 0, map: T.Texture | null = null) => new T.MeshStandardMaterial({color, roughness, metalness, map});
  // lamps are brighter than white on purpose: the blur turns them into soft discs
  const glow = (r: number, gr: number, b: number) => new T.MeshBasicMaterial({color: new T.Color(r, gr, b), fog: false});
  const box = (w: number, h: number, d: number, material: T.Material, x: number, y: number, z: number) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), material); m.position.set(x, y, z); g.add(m); return m; };
  const light = (color: number, intensity: number, distance: number, x: number, y: number, z: number) => { const l = new T.PointLight(color, intensity, distance, 2); l.position.set(x, y, z); g.add(l); };
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
  for (const [x, y, z] of [[-2.3, 1.9, -2.9], [2.3, 1.9, -2.9], [-4.9, 1.7, -2.2], [4.9, 1.7, -2.2], [0, 2.3, -4.4]]) { const s = new T.Mesh(new T.SphereGeometry(0.085, 20, 14), glow(7, 4.0, 1.6)); s.position.set(x, y, z); g.add(s); box(0.008, CEILING - y, 0.008, brass, x, (CEILING + y) / 2, z); light(0xffc27a, 3, 6, x, y - 0.1, z); }
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
  return g;
}

// `onMissing` is told when an image cannot be read, so the page can say so instead of showing a black room.
export function createRooms(scene: T.Scene, urls: {plate: string; panorama: string}, onMissing: (room: RoomId) => void) {
  const loader = new T.TextureLoader(), load = (url: string, rooms: RoomId[]) => { const t = loader.load(url, undefined, undefined, () => rooms.forEach(onMissing)); t.colorSpace = T.SRGBColorSpace; return t; };
  const plate = load(urls.plate, ['kuliss', 'plat']), panorama = load(urls.panorama, ['panorama']);
  const salon = buildSalon(), sphere = new T.Mesh(new T.SphereGeometry(60, 64, 32), new T.MeshBasicMaterial({map: panorama, side: T.BackSide, fog: false}));
  const backdrop = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({map: plate, color: 0x959595, fog: false}));
  const rooms: Record<RoomId, Room> = {
    salong: {group: salon, plate: null, follow: false, hasDepth: true, blur: 11, exposure: 1, fog: new T.Fog(0x0f0906, 8, 30)},
    panorama: {group: sphere, plate: null, follow: true, hasDepth: false, blur: 5, exposure: 0.8, fog: null},
    kuliss: {group: backdrop, plate: null, follow: false, hasDepth: false, blur: 9, exposure: 1, fog: null},
    plat: {group: null, plate, follow: false, hasDepth: false, blur: 8, exposure: 1, fog: null},
  };
  scene.add(salon, sphere, backdrop);
  return {
    rooms,
    // Rooms are built in dealer metres around the dealer-side table edge and scaled into the plan-scale world.
    place(camera: FilmCamera) {
      const {pitch, edgeDistance} = solveCamera(camera), k = camera.scale, distance = edgeDistance + 3.2 * k, halfWidth = FILM.width / 2 / camera.focalPx * distance * 1.14;
      salon.position.set(0, 0, -edgeDistance); salon.scale.setScalar(k); rooms.salong.fog!.near = 8 * k; rooms.salong.fog!.far = 30 * k;
      backdrop.scale.set(2 * halfWidth, 2 * halfWidth / 1.5, 1); backdrop.position.set(0, camera.heightM - Math.tan(pitch) * distance, -edgeDistance - 3.2 * k);
    },
    show(id: RoomId) { for (const [name, room] of Object.entries(rooms)) if (room.group) room.group.visible = name === id; scene.fog = rooms[id].fog; },
    followCamera(id: RoomId, position: T.Vector3, turnDeg: number) { const room = rooms[id]; if (room.follow && room.group) { room.group.position.copy(position); room.group.rotation.y = turnDeg * Math.PI / 180; } },
  };
}
