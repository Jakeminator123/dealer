// Makes an A3 candidate (ankare 3: a seat's landing picture for one hand, src/order-model.ts landingOf) from a source picture of
// her with the hand at the seat (a film's frame or an image model's picture, 1764 × 1174, the bank's frame), the way the last
// picture of the deal from anchor 2.3 to seat 5 was made (giv-fran-2-3-p5, take 4, which held):
//   1. the green brought to the anchor's level (tools/order-images.ts matchGreen, as a pose figure's is);
//   2. the bank's shoe and the yellow card in its window put back from the anchor (SHOE_AT_ANCHOR), so that the window is never
//      white or redrawn;
//   3. a card the source drew near the seat taken away (blue on the felt becomes the anchor's felt), the plan's card drawn on
//      the seat with the repo's own function (drawCard: the bank's card in the plan's quad, blue with its pink cross and red circle, no white rim), and her
//      fingers that lie over it put back on top;
//   4. checks, measured and written into the receipt: the bank's size; the frame held (her head and shoulders where the anchor
//      has them, the shoe where it stands); the laying hand's fingertips at the card's corner nearest her; the other hand at the
//      window as in the anchor; the green plain. A check that fails stops the run unless --anyway is given (then it is said).
//   5. the picture into Material as a candidate (tools/media-roles.ts add, role landning, node LAND(<seat>), card, hand), named
//      "A3P4C1": assets/anchors/<dealer>-<name>/anchor.png with its receipt. Never gäller: Jakob makes an anchor hold.
//
//   node tools/landing-make.ts <source.png> --target P4.C1 --hand RH --name a3-p4-nb [--anchor <png>] [--title "A3P4C1"] [--dealer paow] [--anyway] [--dry]
// Tests: tools/landing-make.test.ts (the pure parts on made-up pictures).
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {W, H, cardTexture, drawCard, growMask, inPolygon, matchGreen, pngOf, readPlan, readRgb, planQuad, greenOf, type Rgb, type Pt} from './order-images.ts';
import {SHOE_AT_ANCHOR} from './order-store.ts';
import {mediaRoles} from './media-roles.ts';
import {a3Name} from '../src/order-model.ts';

/** The limits of the checks (bank pixels and levels). */
export const LANDING_LIMITS = {
  screen: 40,          // a pixel is green screen when its green is this far above its red and blue
  headBand: 520,       // her head and shoulders: rows 0..520 of the bank's frame
  headIoU: 0.75,       // the silhouette there overlaps the anchor's at least this much: the frame is held (0.80 on the end frame of
                       // take 4 to seat 5, which held: her head bows and turns to the seat; a redrawn or moved frame falls far lower)
  shoeMean: 28,        // the source's shoe differs from the anchor's by at most this many levels on average
  tipsRadius: 34,      // px round the card's edge nearest her where the laying hand's fingertips are looked for
  tipsPixels: 120,     // at least this many of her pixels there
  windowMean: 30,      // the window and the hand at it differ from the anchor by at most this many levels on average
  greenShift: 4,       // the green in the result is at most this far from the anchor's
};
const L = LANDING_LIMITS;
export const isScreen = (rgb: Rgb, i: number) => rgb[i * 3 + 1] - Math.max(rgb[i * 3], rgb[i * 3 + 2]) > L.screen;
export const isCardBlue = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return b > 110 && b > r + 40 && b > g + 15; };
/** Her, round the seat: a dark tattoo or sleeve, or skin (redder than blue). */
export const isHer = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; return Math.max(r, g, b) < 110 || (r > b + 10 && r > 90 && g < r + 20); };
/** A card or its rim as an image model draws it: bluish, or near white and grey; never her skin (redder than blue) or a dark tattoo or sleeve. */
export const isCardLike = (rgb: Rgb, i: number) => { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b); return (b > 110 && b >= r - 5) || (lo > 165 && hi - lo < 45); };
const polygonMask = (poly: readonly Pt[]) => { const m = new Uint8Array(W * H); const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) if (inPolygon(poly, x + 0.5, y + 0.5)) m[y * W + x] = 1; return m; };
const meanDiff = (a: Rgb, b: Rgb, mask: Uint8Array) => { let s = 0, n = 0; for (let i = 0; i < W * H; i++) if (mask[i]) { s += Math.abs(a[i * 3] - b[i * 3]) + Math.abs(a[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - b[i * 3 + 2]); n++; } return n ? s / (3 * n) : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The edge of the plan's quad nearest her (the two corners highest in the bank's picture): where the fingertips rest. */
export function nearEdge(quad: readonly Pt[]): [Pt, Pt] {
  const sorted = [...quad].sort((a, b) => a[1] - b[1]);
  return [sorted[0], sorted[1]];
}
const distToSegment = (x: number, y: number, [a, b]: [Pt, Pt]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };

export type Checks = {size: boolean; headIoU: number; shoeMean: number; tipsPixels: number; windowMean: number; greenShift: number; fails: string[]};
/** The checks on the source against the anchor (and the result's green), each with its measure; fails says which failed, in Swedish. */
export function checkLanding(source: Rgb, anchor: Rgb, result: Rgb, quad: readonly Pt[], windowBox: readonly [number, number, number, number]): Checks {
  let both = 0, either = 0;
  for (let y = 0; y < L.headBand; y++) for (let x = 0; x < W; x++) { const i = y * W + x, s = !isScreen(source, i), a = !isScreen(anchor, i); if (s && a) both++; if (s || a) either++; }
  const headIoU = either ? both / either : 0;
  const shoeMean = meanDiff(source, anchor, polygonMask(SHOE_AT_ANCHOR));
  const edge = nearEdge(quad), xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  let tipsPixels = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys) - L.tipsRadius)); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs) - L.tipsRadius)); x <= Math.min(W - 1, Math.ceil(Math.max(...xs) + L.tipsRadius)); x++) {
    const i = y * W + x;
    if (distToSegment(x, y, edge) <= L.tipsRadius && !isScreen(source, i) && !isCardBlue(source, i)) tipsPixels++;
  }
  const win = new Uint8Array(W * H), [wx, wy, ww, wh] = windowBox;
  for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) win[y * W + x] = 1;
  const windowMean = meanDiff(source, anchor, win);
  const gA = greenOf(anchor), gR = greenOf(result), greenShift = Math.max(...gA.map((v, c) => Math.abs(v - gR[c])));
  const fails: string[] = [];
  if (headIoU < L.headIoU) fails.push(`bildrutan är inte hållen: huvud och axlar täcker ankarets till ${Math.round(headIoU * 100)} % (minst ${L.headIoU * 100} %)`);
  if (shoeMean > L.shoeMean) fails.push(`skon är omritad: i snitt ${r1(shoeMean)} nivåer från ankarets (högst ${L.shoeMean})`);
  if (tipsPixels < L.tipsPixels) fails.push(`inga fingertoppar vid kortets hörn närmast henne (${tipsPixels} bildpunkter av henne där, minst ${L.tipsPixels})`);
  if (windowMean > L.windowMean) fails.push(`handen vid fönstret ligger inte som i ankaret (i snitt ${r1(windowMean)} nivåer, högst ${L.windowMean})`);
  if (greenShift > L.greenShift) fails.push(`det gröna ligger ${greenShift} nivåer från ankarets (högst ${L.greenShift})`);
  return {size: true, headIoU: Math.round(headIoU * 1000) / 1000, shoeMean: r1(shoeMean), tipsPixels, windowMean: r1(windowMean), greenShift, fails};
}

/** Steps 1–3 on pixels: the green to the anchor's, the shoe back, a stray blue card away, the plan's card drawn, her fingers on top. */
export function composeLanding(source: Rgb, anchor: Rgb, draw: (base: Rgb) => Rgb, quad: readonly Pt[]): {rgb: Rgb; fingers: number; strayBlue: number} {
  const out = Buffer.from(matchGreen(source, anchor).rgb);
  const shoe = polygonMask(SHOE_AT_ANCHOR);
  for (let i = 0; i < W * H; i++) if (shoe[i]) { out[i * 3] = anchor[i * 3]; out[i * 3 + 1] = anchor[i * 3 + 1]; out[i * 3 + 2] = anchor[i * 3 + 2]; }
  // A card the source drew round the seat (its blue, its light rim and the lines of its edge, on the felt where the anchor has
  // felt) gives way to the anchor's felt; what is her (skin, a tattoo, the sleeve) stays.
  const near = growMask(polygonMask(quad), 170);
  let strayBlue = 0;
  for (let i = 0; i < W * H; i++) if (near[i] && !shoe[i] && isScreen(anchor, i) && !isHer(out, i) && Math.abs(out[i * 3] - anchor[i * 3]) + Math.abs(out[i * 3 + 1] - anchor[i * 3 + 1]) + Math.abs(out[i * 3 + 2] - anchor[i * 3 + 2]) > 30) { out[i * 3] = anchor[i * 3]; out[i * 3 + 1] = anchor[i * 3 + 1]; out[i * 3 + 2] = anchor[i * 3 + 2]; strayBlue++; }
  // Her fingers over the card: what of her (not green, not a card) lies in the card's quad, kept on top of the drawn card.
  const inCard = growMask(polygonMask(quad), 2), keep = new Uint8Array(W * H);
  let fingers = 0;
  for (let i = 0; i < W * H; i++) if (inCard[i] && !isScreen(out, i) && !isCardLike(out, i) && !isScreen(source, i)) { keep[i] = 1; fingers++; }
  const drawn = Buffer.from(draw(out));
  for (let i = 0; i < W * H; i++) if (keep[i]) { drawn[i * 3] = out[i * 3]; drawn[i * 3 + 1] = out[i * 3 + 1]; drawn[i * 3 + 2] = out[i * 3 + 2]; }
  return {rgb: drawn, fingers, strayBlue};
}

/** The whole run: read, make, check, and (unless dry) add the candidate to Material. */
export async function makeLanding(root: string, o: {source: string; target: string; hand: 'LH' | 'RH'; name: string; anchor?: string; title?: string; dealer?: string; anyway?: boolean; dry?: boolean; who?: string}) {
  const dealer = o.dealer ?? 'paow';
  if (!/^(?:P[1-7]|D)\.C1$/.test(o.target)) throw new Error(`${o.target}: ett A3 görs för en plats första kort (P1.C1 … P7.C1, D.C1).`);
  const register = JSON.parse(await readFile(path.join(root, 'data', 'media-roles.json'), 'utf8'));
  const holding = register.dealers?.[dealer]?.entries?.find((e: {role: string; state?: string}) => e.role === 'ankare-2.3' && e.state === 'gäller');
  const anchorFile = o.anchor ? path.resolve(o.anchor) : holding?.path ? path.join(root, holding.path) : null;
  if (!anchorFile) throw new Error('Inget ankare 2.3 gäller; ange --anchor.');
  const sourceBytes = await readFile(o.source), source = await readRgb(sourceBytes), anchor = await readRgb(anchorFile);
  const {plan, file: planFile} = await readPlan(root), texture = await cardTexture(root), quad = planQuad(plan, o.target);
  let drawn: unknown = null;
  const made = composeLanding(source, anchor, (base) => { const d = drawCard(base, texture, plan, planFile, o.target, 'FRONT'); drawn = d.drawn; return d.rgb; }, quad);
  const window: [number, number, number, number] = [1150, 560, 330, 260];
  const checks = checkLanding(source, anchor, made.rgb, quad, window);
  const png = await pngOf(made.rgb);
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const record = {tool: 'tools/landing-make.ts', target: o.target, hand: o.hand, source: {path: o.source.split(path.sep).join('/'), sha256: sha(sourceBytes)}, anchor: {path: path.relative(root, anchorFile).split(path.sep).join('/'), sha256: sha(await readFile(anchorFile)), entry: o.anchor ? null : holding?.id ?? null},
    plan: planFile, card: drawn, fingersKept: made.fingers, strayBluePixels: made.strayBlue, checks, limits: LANDING_LIMITS, anyway: !!o.anyway && checks.fails.length > 0};
  if (checks.fails.length && !o.anyway) return {written: false, refused: checks.fails, record, png};
  if (o.dry) return {written: false, refused: [], record, png};
  const title = o.title ?? a3Name(o.target);
  const added = await mediaRoles(root).add({dealer, role: 'landning', name: o.name, title, filename: path.basename(o.source), type: 'png', bytes: png, who: o.who ?? 'tools/landing-make.ts',
    landing: {card: o.target, hand: o.hand, made: record, builtOn: holding && !o.anchor ? [holding.id] : [], note: `A3 för ${o.target} med ${o.hand === 'RH' ? 'höger' : 'vänster'} hand vid kortet, gjord av tools/landing-make.ts${checks.fails.length ? ` trots: ${checks.fails.join('; ')}` : ''}.`.slice(0, 400)}});
  return {written: true, refused: [], record, png, entry: (added as {entry: {id: string; path: string}}).entry};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const source = args[0], target = flag('--target'), hand = flag('--hand'), name = flag('--name');
  try {
    if (!source || source.startsWith('--') || !target || (hand !== 'LH' && hand !== 'RH') || !name) throw new Error('Använd: node tools/landing-make.ts <källa.png> --target P4.C1 --hand RH --name a3-p4-<variant> [--anchor <png>] [--title "A3P4C1"] [--anyway] [--dry]');
    const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
    const out = await makeLanding(root, {source, target, hand, name, anchor: flag('--anchor'), title: flag('--title'), anyway: args.includes('--anyway'), dry: args.includes('--dry')});
    const preview = flag('--preview');
    if (preview) await (await import('node:fs/promises')).writeFile(preview, out.png);
    console.log(JSON.stringify({written: out.written, refused: out.refused, entry: (out as {entry?: unknown}).entry ?? null, checks: out.record.checks, fingersKept: out.record.fingersKept, strayBluePixels: out.record.strayBluePixels}, null, 2));
    if (out.refused.length) process.exitCode = 2;
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
