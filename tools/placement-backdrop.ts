// The backdrops of Kortplan in the studio's Bordet: the studio's own table, the bank's shoe where the shoe stands and a white
// doll at rest where the dealer sits, in the plan's native pixels (1762 × 1174), so that Jakob plans card places, and the
// films he orders, on the table the films are played on and on no dealer's picture. One picture per doll
// (src/placement-model.ts DOLL_BACKDROPS); the studio lays the chosen dealer's own doll under the cards.
//   node tools/placement-backdrop.ts [--proof <png>] [--keep <folder>] [--from <folder>] [--port <devtools port>]
// The lab server (127.0.0.1:4319) must be running; it is only read. First the dolls' stills are made (dealer3d/tools/
// doll-still.ts, its own Chrome under the shared lock); then one headless Chrome for the table, under the same lock, closed
// again. Writes assets/lab/placement-backdrop/docka-<doll>.jpg per doll and receipt.json beside them (sources with SHA-256,
// the scene's state, the dolls' stills and the fit measured against two bank films). --proof writes a picture of the fit,
// --keep the raw stills, --from builds from stills kept earlier instead of starting Chrome, with the dolls' stills as they
// lie (the receipt says so).
//
// How it is made. Seen from the film camera, the 3D scene shows a film pixel for pixel (docs/SYSTEM.md "3D-scenen"): in the
// scene's home view at 1764 × 1174 the film frame is the whole canvas, one rectangle, with no warp, so a still of that view is
// already in film-frame pixels. Three stills are read straight off the canvas of scene3d.html: A, the table with the film
// hidden; B, the same with anchor 1 (frame 0 of the rest film the dealer standard names) playing; C, a bank film at a frame
// where its card lies on P4.C1. The look is the studio's shipped preset Basgrund (what the game shows) without the camera's
// motion, focus, dust, clock and the rendered cards, and without the printed card boxes (the view draws the plan's own cards
// live, and a box printed from the plan as it was would stay behind when a card is moved). The shoe is B where B differs from
// A in the shoe's own connected patch (the film's shoe, keyed by the scene as every film is). The dealer's patch in B, found
// between the wrists data/dealer-standard.json gives the rest picture, is only kept off the shoe: nothing of her goes into a
// picture. Film pixels become plan pixels by one resize (1764 → 1762 wide, x_plan = x_film × 1761 / 1763 as everywhere else).
//
// A doll's picture is the table and shoe, the doll's transparent still over them (already in plan pixels) and the shoe again
// over the doll (it stands on the felt in front of her elbow): the doll is drawn from its own measures (dealer3d/src/doll.ts),
// never from a picture of the dealer. The pure parts are exported and tested in tools/placement-backdrop.test.ts.
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {DOLL_BACKDROPS, VIEWS, planQuad, validatePlan, type PlacementPlan} from '../src/placement-model.ts';
import {SHIPPED} from '../studio/lib/scene-presets.ts';
import {LOCK, lockLine, releaseLock, takeLock} from './lab-look.ts';

export const FILM = {width: 1764, height: 1174};
export const PLAN = {width: VIEWS.native.width, height: VIEWS.native.height};
/** The folder of the dolls' pictures (src/placement-model.ts DOLL_BACKDROPS), where their stills and the receipts lie too. */
export const FOLDER = path.posix.dirname(DOLL_BACKDROPS[0].native);
export const RECEIPT = path.posix.join(FOLDER, 'receipt.json');
/** A doll's transparent still and the receipt of the stills, as dealer3d/tools/doll-still.ts writes them beside the pictures. */
export const dollStill = (doll: string) => path.posix.join(FOLDER, `docka-${doll}.png`);
export const DOLL_RECEIPT = path.posix.join(FOLDER, 'docka-receipt.json');
export const DOLL_STILLS = 'node dealer3d/tools/doll-still.ts';
/** Anchor 1 of the dealer standard: the rest film's first frame, whose shoe every dealer shares (data/dealer-standard.json shoe.perDealer). */
export const REST = {film: 'pamela-idle-ready-entry-01', frame: 0};
/** Bank films with their card lying on a place, for the fit: late in the P4 deal (the hand still on the card), and the return where it lies free. */
export const PROOFS = [{film: 'pamela-p4-c1-plan-deal-02', frame: 119, place: 'P4.C1'}, {film: 'pamela-p4-c1-plan-return-ready-01', frame: 40, place: 'P4.C1'}] as const;
/** The felt's print without the card boxes (FELT_MARKS in src/scene3d-table.ts less 'boxes'). */
export const MARKS = 'trim,arc,text,logo,rings,numbers';
/** The scene's look: the shipped preset Basgrund, held still at the home view and without what moves or is drawn per card. */
export function lookOf(base: Record<string, unknown>): Record<string, unknown> {
  return {...base, mode: 'look', yaw: 0, pitch: 0, zoom: 1, dx: 0, dy: 0, dz: 0, sway: false, format: 'desk', cards: false, focus: 'off', dust: 0, clock: false, flicker: false, fan: false, roomShift: 'cut', marks: MARKS};
}

// ── Film pixels and plan pixels ────────────────────────────────────────────
export const filmToPlan = (p: {x: number; y: number}) => ({x: p.x * (PLAN.width - 1) / (FILM.width - 1), y: p.y * (PLAN.height - 1) / (FILM.height - 1)});
export const planToFilm = (p: {x: number; y: number}) => ({x: p.x * (FILM.width - 1) / (PLAN.width - 1), y: p.y * (FILM.height - 1) / (PLAN.height - 1)});

// ── Masks ───────────────────────────────────────────────────────────────────
/** Pixels where two RGB pictures of one size differ by more than `level` in any channel. */
export function differs(a: Uint8Array, b: Uint8Array, level: number): Uint8Array {
  const n = a.length / 3, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const j = i * 3; if (Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j + 1] - b[j + 1]), Math.abs(a[j + 2] - b[j + 2])) > level) out[i] = 1; }
  return out;
}
export type Patch = {id: number; pixels: number; box: [number, number, number, number]};
/** Four-connected patches of a mask: a label per pixel (−1 outside the mask) and each patch's size and box (x0, y0, x1, y1). */
export function patches(mask: Uint8Array, width: number, height: number): {labels: Int32Array; list: Patch[]} {
  const labels = new Int32Array(width * height).fill(-1), list: Patch[] = [], stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s] >= 0) continue;
    const id = list.length; let pixels = 0, x0 = width, y0 = height, x1 = -1, y1 = -1; labels[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!, x = p % width, y = (p - x) / width; pixels++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && labels[p - 1] < 0) { labels[p - 1] = id; stack.push(p - 1); }
      if (x < width - 1 && mask[p + 1] && labels[p + 1] < 0) { labels[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && mask[p - width] && labels[p - width] < 0) { labels[p - width] = id; stack.push(p - width); }
      if (y < height - 1 && mask[p + width] && labels[p + width] < 0) { labels[p + width] = id; stack.push(p + width); }
    }
    list.push({id, pixels, box: [x0, y0, x1, y1]});
  }
  return {labels, list};
}
/** The patch with the most pixels inside a box (x0, y0, x1, y1); null when none reaches into it. */
export function patchIn(labels: Int32Array, width: number, box: readonly number[]): number | null {
  const count = new Map<number, number>();
  const height = labels.length / width;
  for (let y = Math.max(0, Math.round(box[1])); y <= Math.min(height - 1, Math.round(box[3])); y++) for (let x = Math.max(0, Math.round(box[0])); x <= Math.min(width - 1, Math.round(box[2])); x++) { const l = labels[y * width + x]; if (l >= 0) count.set(l, (count.get(l) ?? 0) + 1); }
  let best: number | null = null, most = 0; for (const [l, n] of count) if (n > most) { best = l; most = n; }
  return best;
}
/** One patch as a mask, grown by `grow` pixels (a square neighbourhood). */
export function grown(labels: Int32Array, id: number, width: number, height: number, grow: number): Uint8Array {
  let m = new Uint8Array(width * height); for (let i = 0; i < m.length; i++) if (labels[i] === id) m[i] = 1;
  for (let pass = 0; pass < grow; pass++) {
    const next = m.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = y * width + x; if (m[i]) continue; if ((x > 0 && m[i - 1]) || (x < width - 1 && m[i + 1]) || (y > 0 && m[i - width]) || (y < height - 1 && m[i + width]) || (x > 0 && y > 0 && m[i - width - 1]) || (x < width - 1 && y > 0 && m[i - width + 1]) || (x > 0 && y < height - 1 && m[i + width - 1]) || (x < width - 1 && y < height - 1 && m[i + width + 1])) next[i] = 1; }
    m = next;
  }
  return m;
}

// ── A doll at the table ─────────────────────────────────────────────────────
type Raw = {data: Buffer | Uint8Array; width: number; height: number};
/**
 * A doll's picture in plan pixels (PNG): the table with its shoe (film pixels, RGB), the doll's still over it (a PNG in plan
 * pixels with alpha) and the shoe over the doll (film pixels, RGBA, transparent off the shoe). Each layer in film pixels is
 * resized once (fill, lanczos3), so where the doll is transparent the picture is the table as the scene shows it.
 */
export async function dollOver(table: Raw, shoe: Raw, doll: Buffer, plan: {width: number; height: number} = PLAN): Promise<Buffer> {
  const m = await sharp(doll).metadata();
  if (m.width !== plan.width || m.height !== plan.height || !m.hasAlpha) throw Error(`Dockans bild ska vara ${plan.width} × ${plan.height} med genomskinlig bakgrund, inte ${m.width} × ${m.height}${m.hasAlpha ? '' : ' utan'}.`);
  const toPlan = (r: Raw, channels: 3 | 4) => sharp(r.data, {raw: {width: r.width, height: r.height, channels}}).resize(plan.width, plan.height, {fit: 'fill', kernel: 'lanczos3'}).png().toBuffer();
  return sharp(await toPlan(table, 3)).composite([{input: doll}, {input: await toPlan(shoe, 4)}]).png().toBuffer();
}

// ── The card in a picture, for the fit ──────────────────────────────────────
/** Pixels of a card's tracking face: blue for an open card, yellow for a closed one. */
export const cardColour = (side: 'FRONT' | 'BACK') => side === 'FRONT'
  ? (r: number, g: number, b: number) => b > 120 && b - r > 60 && b - g > 40
  : (r: number, g: number, b: number) => r > 150 && g > 150 && b < 110 && Math.abs(r - g) < 60;
/** Where a card's face lies inside a box of an RGB picture: its pixel count, centre and extent (pixel centres). */
export function cardIn(rgb: Uint8Array, width: number, box: readonly number[], side: 'FRONT' | 'BACK') {
  const is = cardColour(side); let n = 0, sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = Math.max(0, Math.floor(box[1])); y <= Math.ceil(box[3]); y++) for (let x = Math.max(0, Math.floor(box[0])); x <= Math.min(width - 1, Math.ceil(box[2])); x++) {
    const i = (y * width + x) * 3; if (i + 2 >= rgb.length || !is(rgb[i], rgb[i + 1], rgb[i + 2])) continue;
    n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? {pixels: n, centre: {x: sx / n, y: sy / n}, box: [x0, y0, x1, y1]} : null;
}
/** The area centre of a quad (pixel coordinates). */
export function quadCentre(q: readonly {x: number; y: number}[]): {x: number; y: number} {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < q.length; i++) { const p = q[i], r = q[(i + 1) % q.length], k = p.x * r.y - r.x * p.y; a += k; cx += (p.x + r.x) * k; cy += (p.y + r.y) * k; }
  return a ? {x: cx / (3 * a), y: cy / (3 * a)} : {x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length};
}
const f1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── The lab's scene in a headless Chrome ────────────────────────────────────
const LAB = 'http://127.0.0.1:4319';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
type Still = {name: string; png: Buffer; frame: number | null};
type Shot = {name: string; film: string | null; frame: number; hide: boolean};

async function capture(port: number, look: Record<string, unknown>, shots: Shot[], profile: string): Promise<{stills: Still[]; browser: string}> {
  await mkdir(profile, {recursive: true});
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--hide-scrollbars', '--enable-gpu', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--window-size=${FILM.width},${FILM.height}`, 'about:blank'], {stdio: 'ignore', windowsHide: true});
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  const dev = async (where: string, method = 'GET') => (await fetch(`http://127.0.0.1:${port}${where}`, {method})).json();
  let version: {Browser?: string; webSocketDebuggerUrl?: string} = {};
  for (let i = 0; i < 60; i++) { try { version = await dev('/json/version'); break; } catch { await wait(250); } }
  if (!version.webSocketDebuggerUrl) { chrome.kill(); throw Error('Chrome startade inte.'); }
  try {
    const tab = await dev('/json/new?about:blank', 'PUT');
    const socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0; const pending = new Map<number, (m: any) => void>(), problems: string[] = [];
    socket.onmessage = event => {
      const m = JSON.parse(String(event.data));
      if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') problems.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    };
    const send = (method: string, params: object = {}) => new Promise<any>(resolve => { const n = ++id; pending.set(n, resolve); socket.send(JSON.stringify({id: n, method, params})); });
    const run = async (expression: string) => { const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true}); if (r.error || r.result?.exceptionDetails) throw Error(JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {width: FILM.width, height: FILM.height, deviceScaleFactor: 1, mobile: false});
    await send('Page.navigate', {url: `${LAB}/scene3d.html?ui=0&clip=${encodeURIComponent(REST.film)}`});
    let up = false; for (let i = 0; i < 120 && !up; i++) { await wait(250); up = await run('!!window.scene3d').catch(() => false); }
    if (!up) throw Error(`3D-scenen startade inte. ${problems.join(' | ')}`);
    if (await run('scene3d.ready') !== true) throw Error('Scenens första film kunde inte läsas.');
    // The look, the home view; then frames until the room's picture has come and two frames in a row are the same.
    await run(`(async () => { const s = scene3d.scene; s.stop(); s.set(${JSON.stringify(look)}); s.home(); s.hideFilm([-1, -1, ${FILM.width + 1}, ${FILM.height + 1}]);
      const probe = document.createElement('canvas'); probe.width = 96; probe.height = 64; const g = probe.getContext('2d', {willReadFrequently: true});
      const print = () => { s.render(5); g.drawImage(s.canvas, 0, 0, 96, 64); return g.getImageData(0, 0, 96, 64).data.join(','); };
      let last = '', same = 0; for (let i = 0; i < 80 && same < 3; i++) { await new Promise(r => setTimeout(r, 250)); const now = print(); same = now === last ? same + 1 : 0; last = now; }
      return same; })()`);
    const stills: Still[] = [];
    for (const shot of shots) {
      const value = await run(`(async () => { const s = scene3d.scene, fps = 30;
        ${shot.film ? `await s.players.load([{path: 'assets/motions/${shot.film}/source.mp4', start: ${shot.frame}}]);` : ''}
        await s.players.seek(0, (${shot.frame} + 0.5) / fps); s.hideFilm(${shot.hide ? `[-1, -1, ${FILM.width + 1}, ${FILM.height + 1}]` : 'null'});
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); s.resize(); s.render(5); await new Promise(r => requestAnimationFrame(r)); s.render(5);
        return {width: s.canvas.width, height: s.canvas.height, view: s.status().view, frame: s.players.frame(), path: s.players.path, png: s.canvas.toDataURL('image/png')}; })()`);
      if (value.width !== FILM.width || value.height !== FILM.height) throw Error(`Scenens bild blev ${value.width} × ${value.height}, inte ${FILM.width} × ${FILM.height}.`);
      if (value.view !== 'home') throw Error(`Scenen stod inte i hemvyn (${value.view}).`);
      if (!shot.hide && value.frame !== shot.frame) throw Error(`${shot.name}: scenen visar ruta ${value.frame}, inte ${shot.frame}.`);
      stills.push({name: shot.name, png: Buffer.from(String(value.png).split(',')[1], 'base64'), frame: shot.hide ? null : value.frame});
    }
    if (problems.length) throw Error(`Fel på sidan: ${problems.join(' | ')}`);
    socket.close();
    return {stills, browser: version.Browser ?? 'okänd'};
  } finally {
    try { const s = new WebSocket(version.webSocketDebuggerUrl); await new Promise<void>(r => { s.onopen = () => { s.send(JSON.stringify({id: 1, method: 'Browser.close'})); setTimeout(r, 800); }; s.onerror = () => r(); }); } catch {}
    chrome.kill();
  }
}

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const rgbOf = async (png: Buffer) => { const {data, info} = await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject: true}); return {rgb: new Uint8Array(data), width: info.width, height: info.height}; };
const filmFrame = (film: string, frame: number) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', `assets/motions/${film}/source.mp4`, '-vf', `select=eq(n\\,${frame})`, '-fps_mode', 'vfr', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: 64 << 20, windowsHide: true});

/** The fit's picture: the backdrop (the first doll's picture) with every plan card outlined, and P4's card ×4 on the backdrop and in the scene's frame. */
async function proofPicture(file: string, backdrop: Buffer, scene: Buffer, plan: PlacementPlan, measured: {place: string; card: {x: number; y: number}; plan: {x: number; y: number}}) {
  const outline = (q: {x: number; y: number}[], colour: string, w: number) => `<polygon points="${q.map(p => `${f1(p.x)},${f1(p.y)}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="${w}"/>`;
  const all = Object.keys(plan.targets).map(id => outline(planQuad(plan, id, 'native'), plan.targets[id].intent.endSide === 'BACK' ? '#ffff00' : '#3b82f6', id === measured.place ? 3 : 1.5)).join('');
  const full = await sharp(await sharp(backdrop).composite([{input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PLAN.width}" height="${PLAN.height}">${all}</svg>`)}]).png().toBuffer()).resize(881, 587).png().toBuffer();
  const q = planQuad(plan, measured.place, 'native'), xs = q.map(p => p.x), ys = q.map(p => p.y), k = 4;
  const crop = {left: Math.round(Math.min(...xs) - 40), top: Math.round(Math.min(...ys) - 40), width: Math.round(Math.max(...xs) - Math.min(...xs) + 80), height: Math.round(Math.max(...ys) - Math.min(...ys) + 80)};
  crop.top = Math.min(crop.top, PLAN.height - crop.height);
  const local = (p: {x: number; y: number}) => ({x: (p.x - crop.left) * k, y: (p.y - crop.top) * k});
  const cross = (p: {x: number; y: number}, colour: string) => { const c = local(p); return `<path d="M${f1(c.x - 10)},${f1(c.y)}H${f1(c.x + 10)}M${f1(c.x)},${f1(c.y - 10)}V${f1(c.y + 10)}" stroke="${colour}" stroke-width="2"/>`; };
  const marks = `<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width * k}" height="${crop.height * k}">${outline(q.map(local), '#ffffff', 2)}${cross(measured.plan, '#ffffff')}${cross(measured.card, '#ff4fd8')}</svg>`;
  const zoom = async (picture: Buffer) => sharp(await sharp(picture).extract(crop).resize(crop.width * k, crop.height * k, {kernel: 'nearest'}).png().toBuffer()).composite([{input: Buffer.from(marks)}]).png().toBuffer();
  const [a, b] = [await zoom(backdrop), await zoom(scene)], W = Math.max(881, crop.width * k * 2 + 16), H = 587 + 16 + crop.height * k + 30;
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><style>text{font:600 15px sans-serif;fill:#e8ece9}</style><text x="0" y="${587 + 16 + crop.height * k + 22}">Vänster: bakgrunden med planens ${measured.place}. Höger: scenens ruta med filmens kort. Vitt kors: planens mitt, rosa: kortets.</text></svg>`;
  await sharp({create: {width: W, height: H, channels: 3, background: '#111614'}}).composite([{input: full, left: 0, top: 0}, {input: a, left: 0, top: 603}, {input: b, left: crop.width * k + 16, top: 603}, {input: Buffer.from(text), left: 0, top: 0}]).png().toFile(file);
}

export async function build(options: {proof?: string | null; keep?: string | null; from?: string | null; port?: number} = {}) {
  const health = await fetch(`${LAB}/health`).then(r => r.json()).catch(() => null) as {root?: string} | null;
  // one folder however its drive letter is written (c:\ from a shell, C:\ from START.cmd)
  const folder = (p: string) => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
  if (!health?.root || folder(health.root) !== folder(process.cwd())) throw Error('Labbservern för den här mappen svarar inte på 127.0.0.1:4319. Starta den (START.cmd) och kör igen.');
  // The scene contract is the scene's own (its camera and table): nothing is read from it here, the receipt names it as a source.
  const [standardText, contractText, planText] = await Promise.all(['data/dealer-standard.json', 'data/scene-contract.json', 'placements/default.json'].map(f => readFile(f, 'utf8')));
  const standard = JSON.parse(standardText), plan = JSON.parse(planText) as PlacementPlan; validatePlan(plan);
  if (!String(standard.shoe?.perDealer ?? '').includes(REST.film)) throw Error(`Grundstandarden pekar inte längre på ${REST.film} för skon; se över REST.`);
  // The rest picture's shoe box, and its wrists: the dealer's patch lies between them.
  const shoeBox = standard.shoe?.box as number[];
  const wrists = [standard.hands?.leftInPicture?.wrist, standard.hands?.rightInPicture?.wrist] as number[][];
  if (shoeBox?.length !== 4 || wrists.some(w => !(w?.[0] > 0))) throw Error('Grundstandarden saknar ett mått.');
  const basgrund = SHIPPED.find(p => p.name === 'basgrund'); if (!basgrund) throw Error('Förvalet Basgrund saknas.');
  const look = lookOf(basgrund.state);

  // The dolls' stills first: their tool takes the shared lock itself, so it runs before this one takes it for the table.
  if (!options.from) execFileSync(process.execPath, ['dealer3d/tools/doll-still.ts', '--out', FOLDER], {stdio: 'inherit', windowsHide: true});
  const dollStills = await Promise.all(DOLL_BACKDROPS.map(async d => {
    const png = await readFile(dollStill(d.doll)).catch(() => null);
    if (!png) throw Error(`${dollStill(d.doll)} saknas: kör ${DOLL_STILLS} (eller det här verktyget utan --from).`);
    return {...d, still: dollStill(d.doll), png};
  }));
  const dollReceiptText = await readFile(DOLL_RECEIPT, 'utf8');

  const scratch = path.resolve('.runtime'), port = options.port ?? 9481;
  const profile = path.join(scratch, 'placement-backdrop', `chrome-profile-${port}`);
  const shots: Shot[] = [{name: 'table', film: null, frame: REST.frame, hide: true}, {name: 'rest', film: null, frame: REST.frame, hide: false}, ...PROOFS.map(p => ({name: `${p.film}-${p.frame}`, film: p.film, frame: p.frame, hide: false}))];
  // --from: the stills a run kept with --keep, so that the pictures can be built again without starting Chrome
  const {stills, browser} = options.from
    ? {stills: await Promise.all(shots.map(async s => ({name: s.name, png: await readFile(path.join(options.from!, `${s.name}.png`)), frame: s.hide ? null : s.frame}))), browser: `stills from ${options.from}`}
    : await (async () => {
      const line = lockLine('placement-backdrop', 'Kortplans bord, sko och passning', 5, new Date());
      if (!await takeLock(LOCK, line)) throw Error('GPU-låset är upptaget.');
      try { return await capture(port, look, shots, profile); } finally { if (!releaseLock(LOCK, line)) console.error('GPU-låsets ägare ändrades under körningen.'); }
    })();
  if (!options.from) await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 400}).catch(() => {});
  if (options.keep) { await mkdir(options.keep, {recursive: true}); for (const s of stills) await writeFile(path.join(options.keep, `${s.name}.png`), s.png); }

  // The table, and the shoe's patch apart from the dealer's.
  const A = await rgbOf(stills[0].png), B = await rgbOf(stills[1].png), W = A.width, H = A.height;
  const {labels, list} = patches(differs(A.rgb, B.rgb, 4), W, H);
  const wristMid = (wrists[0][0] + wrists[1][0]) / 2;
  const dealer = patchIn(labels, W, [wristMid - 150, 450, wristMid + 150, 700]), shoe = patchIn(labels, W, shoeBox);
  if (dealer === null || shoe === null || dealer === shoe) throw Error('Dealern och skon gick inte att skilja åt i vilobilden.');
  const shoeMask = grown(labels, shoe, W, H, 3), dealerNear = grown(labels, dealer, W, H, 2);
  const composed = Buffer.from(A.rgb); let shoePixels = 0;
  for (let i = 0; i < W * H; i++) if (shoeMask[i] && !dealerNear[i]) { composed[i * 3] = B.rgb[i * 3]; composed[i * 3 + 1] = B.rgb[i * 3 + 1]; composed[i * 3 + 2] = B.rgb[i * 3 + 2]; shoePixels++; }
  const shoeOver = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) if (shoeMask[i] && !dealerNear[i]) { shoeOver[i * 4] = B.rgb[i * 3]; shoeOver[i * 4 + 1] = B.rgb[i * 3 + 1]; shoeOver[i * 4 + 2] = B.rgb[i * 3 + 2]; shoeOver[i * 4 + 3] = 255; }
  // each doll at the table: the table and shoe, the doll over them, the shoe over the doll (it stands on the felt in front of her elbow)
  const dolls = await Promise.all(dollStills.map(async d => ({...d, picture: await sharp(await dollOver({data: composed, width: W, height: H}, {data: shoeOver, width: W, height: H}, d.png)).jpeg({quality: 90, chromaSubsampling: '4:4:4'}).toBuffer()})));

  // The fit: each proof frame's card in the scene against the same frame of the film itself, and against the plan's quad.
  const fit = [];
  for (const [n, p] of PROOFS.entries()) {
    const still = await rgbOf(stills[2 + n].png), side = plan.targets[p.place].intent.endSide;
    const quadFilm = planQuad(plan, p.place, 'native').map(planToFilm), xs = quadFilm.map(q => q.x), ys = quadFilm.map(q => q.y);
    const box = [Math.min(...xs) - 25, Math.min(...ys) - 25, Math.max(...xs) + 25, Math.max(...ys) + 25];
    const inScene = cardIn(still.rgb, W, box, side), inFilm = cardIn(new Uint8Array(filmFrame(p.film, p.frame)), FILM.width, box, side);
    if (!inScene || !inFilm) throw Error(`${p.film} ruta ${p.frame}: kortet hittades inte.`);
    const planCentre = filmToPlan(quadCentre(quadFilm)), cardCentre = filmToPlan(inScene.centre), filmCentre = filmToPlan(inFilm.centre);
    const outside = (() => { let n = 0, max = 0; for (let y = 840; y < H; y++) for (let x = 0; x < 420; x++) { const i = (y * W + x) * 3; n++; max = Math.max(max, Math.abs(still.rgb[i] - A.rgb[i]), Math.abs(still.rgb[i + 1] - A.rgb[i + 1]), Math.abs(still.rgb[i + 2] - A.rgb[i + 2])); } return {pixels: n, maxDifference: max}; })();
    fit.push({film: p.film, frame: p.frame, place: p.place, side,
      sceneAgainstFilm: {px: round2(Math.hypot(cardCentre.x - filmCentre.x, cardCentre.y - filmCentre.y)), note: 'the card in the scene at the home view against the same frame decoded from the film: the scene lays the film frame on the backdrop\'s pixels'},
      planAgainstCard: {px: round2(Math.hypot(cardCentre.x - planCentre.x, cardCentre.y - planCentre.y)), dx: round2(cardCentre.x - planCentre.x), dy: round2(cardCentre.y - planCentre.y), note: 'centre of the film\'s card against the centre of the plan\'s quad, plan pixels'},
      sizeAgainstPlan: {card: [inScene.box[2] - inScene.box[0] + 1, inScene.box[3] - inScene.box[1] + 1], planQuad: [round2(Math.max(...xs) - Math.min(...xs)), round2(Math.max(...ys) - Math.min(...ys))], note: 'film pixels; the plan\'s cards were enlarged ×1.20 on 2026-11-11 (data/dealer-standard.json card.planAgainstReal)'},
      tableUnderFilm: {...outside, note: 'the left felt (x < 420, y ≥ 840) of this frame against the table still: the same table, pixel for pixel'},
      cardPixels: inScene.pixels, partly: p.frame === 119 ? 'the fingertip lies on the card' : null,
      centres: {plan: {x: round2(planCentre.x), y: round2(planCentre.y)}, scene: {x: round2(cardCentre.x), y: round2(cardCentre.y)}, film: {x: round2(filmCentre.x), y: round2(filmCentre.y)}}});
  }

  const [restHash, ...proofHashes] = await Promise.all([REST.film, ...PROOFS.map(p => p.film)].map(async f => sha(await readFile(`assets/motions/${f}/source.mp4`))));
  const head = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], {windowsHide: true}).toString().trim(); } catch { return null; } })();
  const receipt = {
    schemaVersion: 2, about: 'Kortplan: dockornas bilder under korten (studions bord, en docka i vila, bankens sko), i vyn native. Byggd av tools/placement-backdrop.ts; läs filens början för hur.',
    madeAt: new Date().toISOString(), madeBy: 'node tools/placement-backdrop.ts', repoHead: head, browser,
    frame: {film: `${FILM.width} × ${FILM.height}`, plan: `${PLAN.width} × ${PLAN.height}`, mapping: 'x_plan = x_film × 1761 / 1763, y unchanged (one resize, fill)', homeView: 'scene3d.html at 1764 × 1174, format desk, yaw 0, pitch 0, zoom 1, at the film camera: the film frame is the whole canvas'},
    table: {page: 'scene3d.html?ui=0', preset: 'basgrund', state: look, filmHidden: true, marks: `${MARKS} (no card boxes: the view draws the plan's cards)`},
    shoe: {from: `${REST.film} frame ${REST.frame}, as the scene keys it`, patch: list[shoe].box, pixels: shoePixels, rule: 'the scene with the film against the scene without it: the connected patch that fills the standard\'s shoe box, grown 3 px, without the dealer\'s patch grown 2 px'},
    dolls: {made: options.from ? 'the stills as they lay (--from)' : DOLL_STILLS, layers: 'the table and shoe, the doll\'s still over them, the shoe over the doll; the table and shoe resized once from film pixels, the still already in plan pixels', stillsReceipt: {path: DOLL_RECEIPT, sha256: sha(dollReceiptText)},
      pictures: dolls.map(d => ({id: d.id, doll: d.doll, path: d.native, width: PLAN.width, height: PLAN.height, bytes: d.picture.length, sha256: sha(d.picture), still: {path: d.still, sha256: sha(d.png)}}))},
    sources: {
      'data/dealer-standard.json': sha(standardText), 'data/scene-contract.json': sha(contractText), 'placements/default.json': sha(planText),
      [`assets/motions/${REST.film}/source.mp4`]: restHash, ...Object.fromEntries(PROOFS.map((p, i) => [`assets/motions/${p.film}/source.mp4`, proofHashes[i]])),
    },
    planUpdatedAt: plan.updatedAt,
    fit,
  };
  await mkdir(FOLDER, {recursive: true});
  for (const [file, bytes] of [...dolls.map(d => [d.native, d.picture] as const), [RECEIPT, Buffer.from(JSON.stringify(receipt, null, 2) + '\n')] as const]) { const temp = `${file}.${process.pid}.tmp`; await writeFile(temp, bytes); await rename(temp, file); }
  if (options.proof) { const best = fit[fit.length - 1]; await proofPicture(options.proof, await sharp(dolls[0].picture).png().toBuffer(), await sharp(stills[stills.length - 1].png).resize(PLAN.width, PLAN.height, {fit: 'fill', kernel: 'lanczos3'}).png().toBuffer(), plan, {place: best.place, card: best.centres.scene, plan: best.centres.plan}); }
  return receipt;
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] ?? null : null; };
  const receipt = await build({proof: value('--proof'), keep: value('--keep'), from: value('--from'), port: value('--port') ? Number(value('--port')) : undefined});
  console.log(JSON.stringify({dolls: receipt.dolls.pictures, fit: receipt.fit.map(f => ({film: f.film, frame: f.frame, sceneAgainstFilm: f.sceneAgainstFilm.px, planAgainstCard: f.planAgainstCard, size: f.sizeAgainstPlan, table: f.tableUnderFilm.maxDifference}))}, null, 2));
}
