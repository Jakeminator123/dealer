// The neutral backdrop of the studio's view Placering: the studio's own table, a neutral seated figure where the dealer sits,
// and the bank's shoe where the shoe stands, in the plan's native pixels (1762 × 1174), so that Jakob plans card places, and
// the films he orders, on the table the films are played on and on no dealer's picture.
//   node tools/placement-backdrop.ts [--proof <png>] [--keep <folder>] [--from <folder>] [--port <devtools port>]
// The lab server (127.0.0.1:4319) must be running; it is only read. One headless Chrome is started and closed again.
// Writes assets/lab/placement-backdrop/native.jpg and receipt.json beside it (sources with SHA-256, the scene's state, the
// figure's measures and the fit measured against two bank films). --proof writes a picture of the fit, --keep the raw stills,
// --from builds from stills kept earlier instead of starting Chrome (the receipt says so).
//
// How it is made. Seen from the film camera, the 3D scene shows a film pixel for pixel (docs/SYSTEM.md "3D-scenen"): in the
// scene's home view at 1764 × 1174 the film frame is the whole canvas, one rectangle, with no warp, so a still of that view is
// already in film-frame pixels. Three stills are read straight off the canvas of scene3d.html: A, the table with the film
// hidden; B, the same with anchor 1 (frame 0 of the rest film the dealer standard names) playing; C, a bank film at a frame
// where its card lies on P4.C1. The look is the studio's shipped preset Basgrund (what the game shows) without the camera's
// motion, focus, dust, clock and the rendered cards, and without the printed card boxes (the view draws the plan's own cards
// live, and a box printed from the plan as it was would stay behind when a card is moved). The shoe is B where B differs from
// A in the shoe's own connected patch (the film's shoe, keyed by the scene as every film is). The figure is drawn, not cut
// out: a head, a neck, a torso that ends on the table edge row and arms whose hands lie where data/dealer-standard.json puts
// them; head, neck, shoulders and elbows are placed by a few rows and widths measured on the dealer's patch in B, so the
// figure sits where a dealer sits without carrying anyone's outline. Film pixels become plan pixels by one resize (1764 →
// 1762 wide, x_plan = x_film × 1761 / 1763 as everywhere else). The pure parts are exported and tested in
// tools/placement-backdrop.test.ts.
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {NEUTRAL_BACKDROP, VIEWS, planQuad, validatePlan, type PlacementPlan} from '../src/placement-model.ts';
import {SHIPPED} from '../studio/lib/scene-presets.ts';

export const FILM = {width: 1764, height: 1174};
export const PLAN = {width: VIEWS.native.width, height: VIEWS.native.height};
/** The picture and its receipt. */
export const OUT = NEUTRAL_BACKDROP.native;
export const RECEIPT = path.posix.join(path.posix.dirname(OUT), 'receipt.json');
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
/** The figure's one tone and its edge. */
export const FIGURE = {fill: '#767b83', soft: 1.6, shadow: 0.32};

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

// ── The figure ──────────────────────────────────────────────────────────────
export type Pt = [number, number];
export type Hand = {wrist: Pt; indexKnuckle: Pt; littleKnuckle: Pt; middleFingertip: Pt};
/** Where the dealer's body is, read off its patch: rows and half widths in film pixels (y down). */
export type Body = {centre: number; headTop: number; headHalf: number; neckRow: number; neckHalf: number; shoulderRow: number; shoulderHalf: number; elbowRow: number; elbowLeft: number; elbowRight: number};
/**
 * A few measures of a seated dealer's patch above the table edge row: the head's top and widest half, the neck (the narrowest
 * row 150 to 330 rows under the top), the shoulders (the first row under the neck at least 3.4 times as wide), the elbows (the
 * widest row between shoulders and edge) and the body's middle. Rounded to whole pixels: only a place, never an outline.
 */
export function measureBody(mask: Uint8Array, width: number, edgeRow: number): Body {
  const rows = Math.floor(edgeRow), left: number[] = [], right: number[] = [];
  for (let y = 0; y < rows; y++) { let l = -1, r = -1; for (let x = 0; x < width; x++) if (mask[y * width + x]) { if (l < 0) l = x; r = x; } left.push(l); right.push(r); }
  const w = (y: number) => left[y] < 0 ? 0 : right[y] - left[y] + 1;
  const headTop = left.findIndex((l, y) => l >= 0 && w(y) >= 20);
  if (headTop < 0) throw Error('Ingen kropp över bordskanten.');
  let neckRow = headTop + 150; for (let y = headTop + 150; y <= Math.min(rows - 1, headTop + 330); y++) if (w(y) > 0 && w(y) < w(neckRow)) neckRow = y;
  let headRow = headTop; for (let y = headTop; y < neckRow; y++) if (w(y) > w(headRow)) headRow = y;
  let shoulderRow = neckRow; while (shoulderRow < rows - 1 && w(shoulderRow) < 3.4 * w(neckRow)) shoulderRow++;
  let elbowRow = shoulderRow; for (let y = shoulderRow; y < rows - 20; y++) if (w(y) > w(elbowRow)) elbowRow = y;
  const mids: number[] = []; for (let y = shoulderRow; y < rows - 20; y++) if (w(y) > 0) mids.push((left[y] + right[y]) / 2);
  mids.sort((a, b) => a - b);
  const r = Math.round;
  return {centre: r(mids[mids.length >> 1] ?? (left[headRow] + right[headRow]) / 2), headTop, headHalf: r(w(headRow) / 2), neckRow, neckHalf: r(w(neckRow) / 2), shoulderRow, shoulderHalf: r(w(shoulderRow + 15) / 2), elbowRow, elbowLeft: left[elbowRow], elbowRight: right[elbowRow]};
}
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const f1 = (n: number) => Math.round(n * 10) / 10;
/** A closed smooth path through points (Catmull-Rom as cubic Béziers). */
export function smoothPath(points: readonly Pt[]): string {
  const n = points.length, at = (i: number) => points[(i + n) % n];
  let d = `M${f1(points[0][0])},${f1(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = add(p1, sub(p2, p0), 1 / 6), c2 = add(p2, sub(p3, p1), -1 / 6);
    d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return `${d} Z`;
}
/**
 * A hand as a mitten: from the wrist over the index knuckle to the fingertips and back by the little knuckle. The fingertips
 * lie along the knuckles' line carried by the middle finger's reach (index 95 %, little 72 % of it); the wrist is `wrist` wide.
 */
export function mitten(h: Hand, wrist: number): Pt[] {
  const mid: Pt = [(h.indexKnuckle[0] + h.littleKnuckle[0]) / 2, (h.indexKnuckle[1] + h.littleKnuckle[1]) / 2], reach = sub(h.middleFingertip, mid);
  const axis = unit(sub(mid, h.wrist)), across: Pt = [-axis[1], axis[0]];
  const a = add(h.wrist, across, wrist / 2), b = add(h.wrist, across, -wrist / 2);
  const [toIndex, toLittle] = len(sub(a, h.indexKnuckle)) < len(sub(b, h.indexKnuckle)) ? [a, b] : [b, a];
  return [toIndex, h.indexKnuckle, add(h.indexKnuckle, reach, 0.95), h.middleFingertip, add(h.littleKnuckle, reach, 0.72), h.littleKnuckle, toLittle];
}
/** A limb from a to b, `wa` wide at a and `wb` at b, as a polygon (round ends are added as circles). */
function limb(a: Pt, b: Pt, wa: number, wb: number): Pt[] {
  const d = unit(sub(b, a)), n: Pt = [-d[1], d[0]];
  return [add(a, n, wa / 2), add(b, n, wb / 2), add(b, n, -wb / 2), add(a, n, -wa / 2)];
}
const poly = (p: readonly Pt[]) => p.map(q => `${f1(q[0])},${f1(q[1])}`).join(' ');
/**
 * The seated figure as SVG in film pixels: head, neck, torso and upper arms (cut at the row the body ends on), forearms and
 * mittens (which reach over the edge onto the felt) in one grey tone with a soft edge, and the hands' faint shadow on the felt.
 */
export function figureSvg(body: Body, hands: {left: Hand; right: Hand}, knuckleBreadth: number, bodyEnd: number, edgeRow: number): string {
  const c = body.centre, wristW = knuckleBreadth * 0.72, arm = Math.max(60, Math.round(knuckleBreadth * 1.2)), fore = Math.round(knuckleBreadth * 1.05);
  // a mannequin's head: an upright egg a little smaller than the measured head, its chin over the neck
  const headRy = (body.neckRow - body.headTop) / 2 * 0.9, headCy = body.headTop + headRy * 1.12, headRx = Math.min(body.headHalf * 0.8, headRy * 0.74);
  const neck = body.neckHalf * 0.72, sh = body.shoulderHalf, sRow = body.shoulderRow;
  // round shoulders; the upper arms hang from them to the elbows at the body's widest row, the forearms come in to the hands
  const capL: Pt = [c - sh + arm / 2, sRow + arm * 0.5], capR: Pt = [c + sh - arm / 2, sRow + arm * 0.5];
  const elbowL: Pt = [body.elbowLeft + arm / 2, body.elbowRow], elbowR: Pt = [body.elbowRight - arm / 2, body.elbowRow];
  // the torso between the arms: from the shoulders' inner side it narrows a little to the table edge, so that the room shows
  // between body and arm as it does round a seated person with the elbows out
  const chest = sh - arm * 0.62, waist = sh - arm * 0.95;
  const torso: Pt[] = [[c - neck, sRow - 26], [c - chest, sRow + 6], [c - chest, sRow + arm * 1.4], [c - waist, bodyEnd + 20], [c + waist, bodyEnd + 20], [c + chest, sRow + arm * 1.4], [c + chest, sRow + 6], [c + neck, sRow - 26]];
  const hands2 = [mitten(hands.left, wristW), mitten(hands.right, wristW)];
  const forearms = [limb(elbowL, hands.left.wrist, fore, wristW + 6), limb(elbowR, hands.right.wrist, fore, wristW + 6)];
  const g = FIGURE.fill;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FILM.width}" height="${FILM.height}" viewBox="0 0 ${FILM.width} ${FILM.height}">
<defs>
<clipPath id="body"><rect x="0" y="0" width="${FILM.width}" height="${f1(bodyEnd)}"/></clipPath>
<clipPath id="felt"><rect x="0" y="${f1(edgeRow)}" width="${FILM.width}" height="${f1(FILM.height - edgeRow)}"/></clipPath>
<filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${FIGURE.soft}"/></filter>
<filter id="shade" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g clip-path="url(#felt)" filter="url(#shade)" opacity="${FIGURE.shadow}">${hands2.map(h => `<path d="${smoothPath(h.map(p => add(p, [2, 6])))}" fill="#000"/>`).join('')}</g>
<g filter="url(#soft)" fill="${g}" stroke="${g}" stroke-linejoin="round" stroke-linecap="round">
<g clip-path="url(#body)">
<ellipse cx="${f1(c)}" cy="${f1(headCy)}" rx="${f1(headRx)}" ry="${f1(headRy)}" stroke="none"/>
<rect x="${f1(c - neck)}" y="${f1(headCy)}" width="${f1(2 * neck)}" height="${f1(sRow - headCy + 10)}" stroke="none"/>
<polygon points="${poly(torso)}" stroke-width="44"/>
<line x1="${f1(capL[0])}" y1="${f1(capL[1])}" x2="${f1(elbowL[0])}" y2="${f1(elbowL[1])}" stroke-width="${arm}"/>
<line x1="${f1(capR[0])}" y1="${f1(capR[1])}" x2="${f1(elbowR[0])}" y2="${f1(elbowR[1])}" stroke-width="${arm}"/>
</g>
${forearms.map(p => `<polygon points="${poly(p)}" stroke-width="4"/>`).join('')}
${[elbowL, elbowR].map(p => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(fore / 2)}" stroke="none"/>`).join('')}
${hands2.map(h => `<path d="${smoothPath(h)}" stroke-width="3"/>`).join('')}
</g>
</svg>`;
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

/** The fit's picture: the backdrop with every plan card outlined, and P4's card ×4 on the backdrop and in the scene's frame. */
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
  if (!health?.root || path.resolve(health.root) !== path.resolve(process.cwd())) throw Error('Labbservern för den här mappen svarar inte på 127.0.0.1:4319. Starta den (START.cmd) och kör igen.');
  const [standardText, contractText, planText] = await Promise.all(['data/dealer-standard.json', 'data/scene-contract.json', 'placements/default.json'].map(f => readFile(f, 'utf8')));
  const standard = JSON.parse(standardText), contract = JSON.parse(contractText), plan = JSON.parse(planText) as PlacementPlan; validatePlan(plan);
  if (!String(standard.shoe?.perDealer ?? '').includes(REST.film)) throw Error(`Grundstandarden pekar inte längre på ${REST.film} för skon; se över REST.`);
  const edgeRow = Number(contract.keyFigures?.dealerEdgeImageRow?.value), bodyEnd = Number(standard.body?.bodyEndsOnRows?.[1]), knuckles = Number(standard.hands?.knuckleBreadthPx);
  const shoeBox = standard.shoe?.box as number[];
  if (!(edgeRow > 0) || !(bodyEnd > 0) || !(knuckles > 0) || shoeBox?.length !== 4) throw Error('Grundstandarden eller scenkontraktet saknar ett mått.');
  const hand = (h: any): Hand => ({wrist: h.wrist, indexKnuckle: h.indexKnuckle, littleKnuckle: h.littleKnuckle, middleFingertip: h.middleFingertip});
  const hands = {left: hand(standard.hands.leftInPicture), right: hand(standard.hands.rightInPicture)};
  const basgrund = SHIPPED.find(p => p.name === 'basgrund'); if (!basgrund) throw Error('Förvalet Basgrund saknas.');
  const look = lookOf(basgrund.state);

  const scratch = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir(), port = options.port ?? 9481;
  const profile = path.join(scratch, 'placement-backdrop', `chrome-profile-${port}`);
  const shots: Shot[] = [{name: 'table', film: null, frame: REST.frame, hide: true}, {name: 'rest', film: null, frame: REST.frame, hide: false}, ...PROOFS.map(p => ({name: `${p.film}-${p.frame}`, film: p.film, frame: p.frame, hide: false}))];
  // --from: the stills a run kept with --keep, so that the figure can be redrawn without starting Chrome again
  const {stills, browser} = options.from
    ? {stills: await Promise.all(shots.map(async s => ({name: s.name, png: await readFile(path.join(options.from!, `${s.name}.png`)), frame: s.hide ? null : s.frame}))), browser: `stills from ${options.from}`}
    : await capture(port, look, shots, profile);
  if (!options.from) await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 400}).catch(() => {});
  if (options.keep) { await mkdir(options.keep, {recursive: true}); for (const s of stills) await writeFile(path.join(options.keep, `${s.name}.png`), s.png); }

  // The table, the dealer's patch and the shoe's.
  const A = await rgbOf(stills[0].png), B = await rgbOf(stills[1].png), W = A.width, H = A.height;
  const {labels, list} = patches(differs(A.rgb, B.rgb, 4), W, H);
  const wristMid = (hands.left.wrist[0] + hands.right.wrist[0]) / 2;
  const dealer = patchIn(labels, W, [wristMid - 150, 450, wristMid + 150, 700]), shoe = patchIn(labels, W, shoeBox);
  if (dealer === null || shoe === null || dealer === shoe) throw Error('Dealern och skon gick inte att skilja åt i vilobilden.');
  const body = measureBody(grown(labels, dealer, W, H, 0), W, edgeRow);
  const shoeMask = grown(labels, shoe, W, H, 3), dealerNear = grown(labels, dealer, W, H, 2);
  const composed = Buffer.from(A.rgb); let shoePixels = 0;
  for (let i = 0; i < W * H; i++) if (shoeMask[i] && !dealerNear[i]) { composed[i * 3] = B.rgb[i * 3]; composed[i * 3 + 1] = B.rgb[i * 3 + 1]; composed[i * 3 + 2] = B.rgb[i * 3 + 2]; shoePixels++; }
  const svg = figureSvg(body, hands, knuckles, bodyEnd, edgeRow);
  const figure = await sharp(Buffer.from(svg)).png().toBuffer();
  const shoeOver = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) if (shoeMask[i] && !dealerNear[i]) { shoeOver[i * 4] = B.rgb[i * 3]; shoeOver[i * 4 + 1] = B.rgb[i * 3 + 1]; shoeOver[i * 4 + 2] = B.rgb[i * 3 + 2]; shoeOver[i * 4 + 3] = 255; }
  // table and shoe, the figure over them, the shoe over the figure (it stands on the felt in front of her elbow)
  const film = await sharp(composed, {raw: {width: W, height: H, channels: 3}}).composite([{input: figure}, {input: shoeOver, raw: {width: W, height: H, channels: 4}}]).png().toBuffer();
  const picture = await sharp(film).resize(PLAN.width, PLAN.height, {fit: 'fill', kernel: 'lanczos3'}).jpeg({quality: 90, chromaSubsampling: '4:4:4'}).toBuffer();

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
    schemaVersion: 1, about: 'Placering: neutral bakgrund i Dator (studions bord, en neutral figur, bankens sko). Byggd av tools/placement-backdrop.ts; läs filens början för hur.',
    picture: {path: OUT, width: PLAN.width, height: PLAN.height, bytes: picture.length, sha256: sha(picture), view: 'native'},
    madeAt: new Date().toISOString(), madeBy: 'node tools/placement-backdrop.ts', repoHead: head, browser,
    frame: {film: `${FILM.width} × ${FILM.height}`, plan: `${PLAN.width} × ${PLAN.height}`, mapping: 'x_plan = x_film × 1761 / 1763, y unchanged (one resize, fill)', homeView: 'scene3d.html at 1764 × 1174, format desk, yaw 0, pitch 0, zoom 1, at the film camera: the film frame is the whole canvas'},
    table: {page: 'scene3d.html?ui=0', preset: 'basgrund', state: look, filmHidden: true, marks: `${MARKS} (no card boxes: the view draws the plan's cards)`},
    shoe: {from: `${REST.film} frame ${REST.frame}, as the scene keys it`, patch: list[shoe].box, pixels: shoePixels, rule: 'the scene with the film against the scene without it: the connected patch that fills the standard\'s shoe box, grown 3 px, without the dealer\'s patch grown 2 px'},
    figure: {fill: FIGURE.fill, softEdgePx: FIGURE.soft, handShadow: FIGURE.shadow, body, bodyEndsOnRow: bodyEnd, edgeRow, hands: 'data/dealer-standard.json hands (wrist, knuckles, middle fingertip), mittens', knuckleBreadthPx: knuckles, note: 'drawn from these numbers only; no outline of a dealer is used'},
    sources: {
      'data/dealer-standard.json': sha(standardText), 'data/scene-contract.json': sha(contractText), 'placements/default.json': sha(planText),
      [`assets/motions/${REST.film}/source.mp4`]: restHash, ...Object.fromEntries(PROOFS.map((p, i) => [`assets/motions/${p.film}/source.mp4`, proofHashes[i]])),
    },
    planUpdatedAt: plan.updatedAt,
    fit,
  };
  await mkdir(path.dirname(OUT), {recursive: true});
  for (const [file, bytes] of [[OUT, picture], [RECEIPT, Buffer.from(JSON.stringify(receipt, null, 2) + '\n')]] as const) { const temp = `${file}.${process.pid}.tmp`; await writeFile(temp, bytes); await rename(temp, file); }
  if (options.proof) { const best = fit[fit.length - 1]; await proofPicture(options.proof, await sharp(picture).png().toBuffer(), await sharp(stills[stills.length - 1].png).resize(PLAN.width, PLAN.height, {fit: 'fill', kernel: 'lanczos3'}).png().toBuffer(), plan, {place: best.place, card: best.centres.scene, plan: best.centres.plan}); }
  return receipt;
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] ?? null : null; };
  const receipt = await build({proof: value('--proof'), keep: value('--keep'), from: value('--from'), port: value('--port') ? Number(value('--port')) : undefined});
  console.log(JSON.stringify({picture: receipt.picture, body: receipt.figure.body, fit: receipt.fit.map(f => ({film: f.film, frame: f.frame, sceneAgainstFilm: f.sceneAgainstFilm.px, planAgainstCard: f.planAgainstCard, size: f.sizeAgainstPlan, table: f.tableUnderFilm.maxDifference}))}, null, 2));
}
