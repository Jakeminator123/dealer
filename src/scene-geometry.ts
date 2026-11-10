// Pure geometry for the scene contract: table-plane homography, card projection, camera decomposition.
// No I/O. Table frame: millimetres on the felt, X toward image right, Y away from the camera (toward
// the dealer), Z up. Image frame: pixels, origin top left, y down. A homography here always maps
// table millimetres to image pixels and is stored row-major with its last element 1.
export type Pt = {x: number; y: number};
export type Mat3 = number[];
export type Size = {width: number; height: number};
export type CardPose = {x: number; y: number; heading: number}; // centre in mm; heading in degrees, counter-clockwise seen from above
export type Segment = {a: Pt; b: Pt};
export type CardObservation = {id: string; corners: Pt[]; use?: boolean[]; sides?: (Segment | null)[]}; // corners: far-left, far-right, near-right, near-left; sides: far, right, near, left
export type Camera = {focalPx: number; cx: number; cy: number; pitchDeg: number; rollDeg: number; yawDeg: number; heightMm: number; x: number; y: number};
export const CARD_MM: Size = {width: 63, height: 88};
const RAD = Math.PI / 180;

export const mul3 = (a: Mat3, b: Mat3): Mat3 => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-300) throw Error('Singular 3x3 matrix.');
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map(v => v / det);
}
export const normaliseH = (h: Mat3): Mat3 => h.map(v => v / h[8]);
export function applyH(h: Mat3, p: Pt): Pt { const w = h[6] * p.x + h[7] * p.y + h[8]; return {x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w}; }

export function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-300) throw Error('Singular linear system.');
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
// Jacobi rotations; eigenvectors are the columns of `vectors`.
export function symmetricEigen(S: number[][]): {values: number[]; vectors: number[][]} {
  const n = S.length, a = S.map(r => [...r]), v = a.map((_, i) => a.map((_, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0, diag = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i === j) diag += a[i][i] ** 2; else off += a[i][j] ** 2;
    if (off <= 1e-30 * diag) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (a[p][q] === 0) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
    }
  }
  return {values: a.map((r, i) => r[i]), vectors: v};
}

// Normalised DLT for four or more correspondences; maps a point of `from` onto `to`.
export function homographyFromPoints(from: Pt[], to: Pt[]): Mat3 {
  if (from.length < 4 || from.length !== to.length) throw Error('A homography needs four or more point pairs.');
  const norm = (pts: Pt[]) => { const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const d = pts.reduce((s, p) => s + Math.hypot(p.x - mx, p.y - my), 0) / pts.length || 1, k = Math.SQRT2 / d;
    return {T: [k, 0, -k * mx, 0, k, -k * my, 0, 0, 1] as Mat3, pts: pts.map(p => ({x: (p.x - mx) * k, y: (p.y - my) * k}))}; };
  const a = norm(from), b = norm(to), S = Array.from({length: 9}, () => Array(9).fill(0));
  for (let i = 0; i < from.length; i++) { const {x, y} = a.pts[i], {x: u, y: v} = b.pts[i];
    for (const row of [[-x, -y, -1, 0, 0, 0, u * x, u * y, u], [0, 0, 0, -x, -y, -1, v * x, v * y, v]]) for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) S[r][c] += row[r] * row[c]; }
  const {values, vectors} = symmetricEigen(S); let k = 0; for (let i = 1; i < 9; i++) if (values[i] < values[k]) k = i;
  return normaliseH(mul3(inv3(b.T), mul3(vectors.map(row => row[k]), a.T)));
}

export function cardCorners(pose: CardPose, size: Size = CARD_MM): Pt[] {
  const c = Math.cos(pose.heading * RAD), s = Math.sin(pose.heading * RAD), w = size.width / 2, h = size.height / 2;
  return [[-w, h], [w, h], [w, -h], [-w, -h]].map(([u, v]) => ({x: pose.x + u * c - v * s, y: pose.y + u * s + v * c}));
}
export const projectCard = (H: Mat3, pose: CardPose, size: Size = CARD_MM): Pt[] => cardCorners(pose, size).map(p => applyH(H, p));

// Levenberg-Marquardt with a numeric Jacobian; small problems only.
export function levenbergMarquardt(residuals: (p: number[]) => number[], start: number[], iterations = 200): {p: number[]; residuals: number[]; cost: number; iterations: number} {
  let p = [...start], r = residuals(p), cost = r.reduce((s, v) => s + v * v, 0), lambda = 1e-3, done = 0;
  for (; done < iterations; done++) {
    const n = p.length, m = r.length, J = Array.from({length: m}, () => Array(n).fill(0));
    for (let j = 0; j < n; j++) { const step = 1e-6 * Math.max(1, Math.abs(p[j])), hi = [...p], lo = [...p]; hi[j] += step; lo[j] -= step;
      const a = residuals(hi), b = residuals(lo); for (let i = 0; i < m; i++) J[i][j] = (a[i] - b[i]) / (2 * step); }
    const JtJ = Array.from({length: n}, (_, a) => Array.from({length: n}, (_, b) => { let s = 0; for (let i = 0; i < m; i++) s += J[i][a] * J[i][b]; return s; }));
    const g = Array.from({length: n}, (_, a) => { let s = 0; for (let i = 0; i < m; i++) s += J[i][a] * r[i]; return -s; });
    let improved = false, gain = 0;
    for (let attempt = 0; attempt < 12 && !improved; attempt++) {
      let delta: number[];
      try { delta = solve(JtJ.map((row, a) => row.map((v, b) => a === b ? v * (1 + lambda) + 1e-12 : v)), g); } catch { lambda *= 10; continue; }
      const q = p.map((v, i) => v + delta[i]), rq = residuals(q), cq = rq.reduce((s, v) => s + v * v, 0);
      if (Number.isFinite(cq) && cq < cost) { gain = cost - cq; p = q; r = rq; cost = cq; lambda = Math.max(lambda / 3, 1e-12); improved = true; } else lambda *= 4;
    }
    if (!improved || gain <= 1e-14 * (cost + 1e-12)) break;
  }
  return {p, residuals: r, cost, iterations: done};
}

const rms = (values: number[]) => values.length ? Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length) : 0;
// Residuals of one observed card against a projected quad, in pixels. With measured side segments
// (far, right, near, left; null where hidden) each segment end is held to the projected side line,
// so a partly hidden card still counts for what was seen. Without them the corners are compared.
export function cardResiduals(projected: Pt[], card: CardObservation): number[] {
  if (!card.sides) return projected.flatMap((q, i) => (card.use?.[i] ?? true) ? [q.x - card.corners[i].x, q.y - card.corners[i].y] : []);
  return card.sides.flatMap((side, k) => { if (!side) return []; const a = projected[k], b = projected[(k + 1) % 4], n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return [side.a, side.b].map(p => ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / n); });
}
function cardReport(H: Mat3, pose: CardPose, card: CardObservation, size: Size) {
  const projected = projectCard(H, pose, size), residuals = cardResiduals(projected, card), measured = [0, 1, 2, 3].map(i => card.sides ? !!card.sides[(i + 3) % 4] && !!card.sides[i] : card.use?.[i] ?? true);
  const cornerErrors = projected.map((q, i) => measured[i] ? Math.hypot(q.x - card.corners[i].x, q.y - card.corners[i].y) : null), seen = cornerErrors.filter((v): v is number => v !== null);
  return {id: card.id, pose, projected, residualRms: rms(residuals), residualMax: residuals.reduce((m, v) => Math.max(m, Math.abs(v)), 0), residualKind: card.sides ? 'distance from measured edge to projected edge' : 'corner offset in x and y',
    cornerErrors, cornerRms: seen.length ? rms(seen) : null, cornerMax: seen.length ? Math.max(...seen) : null};
}

// Best pose of a card of the given size on a known plane for one observed card.
export function fitCardPose(H: Mat3, card: CardObservation, size: Size = CARD_MM) {
  const back = card.corners.map(p => applyH(inv3(H), p)), mid = (a: Pt, b: Pt) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}), far = mid(back[0], back[1]), near = mid(back[2], back[3]);
  const start = [(far.x + near.x) / 2, (far.y + near.y) / 2, Math.atan2(far.y - near.y, far.x - near.x) / RAD - 90];
  const fit = levenbergMarquardt(p => cardResiduals(projectCard(H, {x: p[0], y: p[1], heading: p[2]}, size), card), start);
  return cardReport(H, {x: fit.p[0], y: fit.p[1], heading: fit.p[2]}, card, size);
}
// Size and squareness of an image quad when laid back onto the plane.
export function quadOnPlane(H: Mat3, corners: Pt[]) {
  const q = corners.map(p => applyH(inv3(H), p)), len = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const angle = (o: Pt, a: Pt, b: Pt) => Math.acos(((a.x - o.x) * (b.x - o.x) + (a.y - o.y) * (b.y - o.y)) / (len(o, a) * len(o, b))) / RAD;
  return {cornersMm: q, widthMm: (len(q[0], q[1]) + len(q[3], q[2])) / 2, heightMm: (len(q[0], q[3]) + len(q[1], q[2])) / 2, farWidthMm: len(q[0], q[1]), nearWidthMm: len(q[3], q[2]),
    cornerAnglesDeg: [angle(q[0], q[1], q[3]), angle(q[1], q[2], q[0]), angle(q[2], q[3], q[1]), angle(q[3], q[0], q[2])],
    centreMm: {x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4}};
}

// Shape of a quad in the image: side lengths, taper (far width / near width) and edge directions.
export function quadShape(q: Pt[]) {
  const len = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y), dir = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x) / RAD;
  const far = len(q[0], q[1]), near = len(q[3], q[2]), left = len(q[0], q[3]), right = len(q[1], q[2]);
  let area = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; area += a.x * b.y - b.x * a.y; }
  return {centre: {x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4}, farWidth: far, nearWidth: near, leftSide: left, rightSide: right, taper: far / near,
    depth: Math.hypot((q[0].x + q[1].x - q[2].x - q[3].x) / 2, (q[0].y + q[1].y - q[2].y - q[3].y) / 2), area: Math.abs(area) / 2,
    farEdgeDeg: dir(q[0], q[1]), nearEdgeDeg: dir(q[3], q[2]), leftEdgeDeg: dir(q[3], q[0]), rightEdgeDeg: dir(q[2], q[1])};
}

// One plane for several cards of known size. The first card fixes the origin at its centre; every
// other card keeps a free position and heading on the table. In the general model (eight numbers)
// the first card also fixes the heading. With `levelRows` the plane is held to six numbers: lines
// along table X stay horizontal in the image (a camera without roll, square to the table edge), and
// the first card's heading becomes free instead. `initial` starts from a known plane and one pose per
// card, in any table frame (for level rows its X must already run level); a start near the answer
// matters, because the fit can otherwise settle in a neighbouring, worse minimum.
export function fitPlane(cards: CardObservation[], options: {levelRows?: boolean; size?: Size; initial?: {H: Mat3; poses: CardPose[]}} = {}) {
  if (!cards.length) throw Error('fitPlane needs at least one card.');
  const size = options.size ?? CARD_MM, level = !!options.levelRows, first = homographyFromPoints(cardCorners({x: 0, y: 0, heading: 0}, size), cards[0].corners);
  const all = cards.flatMap(c => c.corners), cx = all.reduce((s, p) => s + p.x, 0) / all.length, cy = all.reduce((s, p) => s + p.y, 0) / all.length, S = 1000, M = 100;
  const toScaled: Mat3 = [1 / S, 0, -cx / S, 0, 1 / S, -cy / S, 0, 0, 1], fromScaled = inv3(toScaled), mm: Mat3 = [1 / M, 0, 0, 0, 1 / M, 0, 0, 0, 1], head = level ? 7 : 8;
  const unpack = (p: number[]) => ({H: normaliseH(mul3(fromScaled, mul3(level ? [p[0], p[1], p[2], 0, p[3], p[4], 0, p[5], 1] : [...p.slice(0, 8), 1], mm))),
    poses: cards.map((_, i) => i ? {x: p[head - 3 + i * 3] * M, y: p[head - 2 + i * 3] * M, heading: p[head - 1 + i * 3] / RAD} : {x: 0, y: 0, heading: level ? p[6] / RAD : 0})});
  const given = options.initial, turn = given && !level ? given.poses[0].heading : 0, seed = given && {H: reframe(given.H, given.poses[0], turn), poses: given.poses.map(p => reframePose(p, given.poses[0], turn))};
  const h = normaliseH(mul3(toScaled, mul3(seed?.H ?? first, inv3(mm))));
  const start = [...(level ? [h[0], h[1], h[2], h[4], h[5], h[7], (seed?.poses[0].heading ?? 0) * RAD] : h.slice(0, 8)), ...cards.slice(1).flatMap((c, i) => { const p = seed?.poses[i + 1] ?? fitCardPose(first, c, size).pose; return [p.x / M, p.y / M, p.heading * RAD]; })];
  const fit = levenbergMarquardt(p => { const {H, poses} = unpack(p); return cards.flatMap((c, i) => cardResiduals(projectCard(H, poses[i], size), c)); }, start);
  const {H, poses} = unpack(fit.p), parameters = head + 3 * (cards.length - 1);
  return {H, model: level ? 'LEVEL_ROWS' as const : 'GENERAL' as const, cards: cards.map((c, i) => cardReport(H, poses[i], c, size)), residualRms: rms(fit.residuals), residuals: fit.residuals.length, parameters, redundancy: fit.residuals.length - parameters};
}
// Re-express a homography in a rotated and shifted table frame: old = R(rotationDeg) * new + origin.
export function reframe(H: Mat3, origin: Pt, rotationDeg: number): Mat3 { const c = Math.cos(rotationDeg * RAD), s = Math.sin(rotationDeg * RAD); return normaliseH(mul3(H, [c, -s, origin.x, s, c, origin.y, 0, 0, 1])); }
export function reframePose(pose: CardPose, origin: Pt, rotationDeg: number): CardPose { const c = Math.cos(rotationDeg * RAD), s = Math.sin(rotationDeg * RAD), dx = pose.x - origin.x, dy = pose.y - origin.y; return {x: c * dx + s * dy, y: -s * dx + c * dy, heading: pose.heading - rotationDeg}; }
// Rotation that makes X the table direction parallel to the image plane (its lines stay parallel
// to the horizon), pointing toward image right. Falls back to image-horizontal for an affine map.
export function horizonRotation(H: Mat3): number {
  const jx = (d: Pt) => { const a = applyH(H, {x: 0, y: 0}), b = applyH(H, {x: d.x * 1e-3, y: d.y * 1e-3}); return {x: (b.x - a.x) * 1e3, y: (b.y - a.y) * 1e3}; };
  let d: Pt; const n = Math.hypot(H[6], H[7]);
  if (n > 1e-12) d = {x: H[7] / n, y: -H[6] / n}; else { const ex = jx({x: 1, y: 0}), ey = jx({x: 0, y: 1}), t = Math.atan2(-ex.y, ey.y); d = {x: Math.cos(t), y: Math.sin(t)}; }
  if (jx(d).x < 0) d = {x: -d.x, y: -d.y};
  return Math.atan2(d.y, d.x) / RAD;
}
// Vanishing line of the table in the image: y on a given column and slope in degrees.
export function horizon(H: Mat3, x: number) { const inv = inv3(H), a = inv[6], b = inv[7], c = inv[8]; return {y: -(a * x + c) / b, slopeDeg: Math.atan(-a / b) / RAD}; }

// Synthetic pinhole: camera at (x, y, heightMm) in table millimetres, yaw 0 looks along +Y,
// pitch is degrees below the horizontal, roll turns the image clockwise.
function cameraAxes(cam: Camera) {
  const t = cam.pitchDeg * RAD, y = cam.yawDeg * RAD, r = cam.rollDeg * RAD, turn = (v: number[]) => [v[0] * Math.cos(y) + v[1] * Math.sin(y), -v[0] * Math.sin(y) + v[1] * Math.cos(y), v[2]];
  const right0 = turn([1, 0, 0]), down0 = turn([0, -Math.sin(t), -Math.cos(t)]), forward = turn([0, Math.cos(t), -Math.sin(t)]);
  return {right: right0.map((v, i) => v * Math.cos(r) + down0[i] * Math.sin(r)), down: right0.map((v, i) => -v * Math.sin(r) + down0[i] * Math.cos(r)), forward};
}
export function cameraProject(cam: Camera, p: {x: number; y: number; z: number}): Pt {
  const {right, down, forward} = cameraAxes(cam), d = [p.x - cam.x, p.y - cam.y, p.z - cam.heightMm], dot = (a: number[]) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return {x: cam.cx + cam.focalPx * dot(right) / dot(forward), y: cam.cy + cam.focalPx * dot(down) / dot(forward)};
}
export function cameraHomography(cam: Camera): Mat3 {
  const {right, down, forward} = cameraAxes(cam), C = [cam.x, cam.y, cam.heightMm], t = [right, down, forward].map(a => -(a[0] * C[0] + a[1] * C[1] + a[2] * C[2]));
  return normaliseH([cam.focalPx * right[0] + cam.cx * forward[0], cam.focalPx * right[1] + cam.cx * forward[1], cam.focalPx * t[0] + cam.cx * t[2],
    cam.focalPx * down[0] + cam.cy * forward[0], cam.focalPx * down[1] + cam.cy * forward[1], cam.focalPx * t[1] + cam.cy * t[2], forward[0], forward[1], t[2]]);
}

// Pinhole behind a table homography, assuming square pixels, no skew and a known principal point
// (image centre unless given). Two conditions bind one unknown focal length, so the two separate
// focal estimates measure how well the plane fits such a camera. Returns null when no real focal
// length satisfies them.
export function decomposeHomography(H: Mat3, image: Size, principal?: Pt) {
  const cx = principal?.x ?? (image.width - 1) / 2, cy = principal?.y ?? (image.height - 1) / 2;
  const col = (j: number) => [H[j] - cx * H[6 + j], H[3 + j] - cy * H[6 + j], H[6 + j]], a = col(0), b = col(1), c = col(2);
  const A1 = a[0] * b[0] + a[1] * b[1], B1 = a[2] * b[2], A2 = a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2, B2 = a[2] ** 2 - b[2] ** 2;
  const u = -(A1 * B1 + A2 * B2) / (A1 * A1 + A2 * A2);
  if (!(u > 0) || !Number.isFinite(u)) return null;
  const f = 1 / Math.sqrt(u), unit = (v: number[]) => { const n = Math.hypot(...v); return v.map(x => x / n); }, dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const cross = (p: number[], q: number[]) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const v1 = [a[0] / f, a[1] / f, a[2]], v2 = [b[0] / f, b[1] / f, b[2]], n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
  let scale = 2 / (n1 + n2); if (c[2] * scale < 0) scale = -scale;
  const r1 = unit(v1.map(x => x * scale)), raw2 = v2.map(x => x * scale), r2 = unit(raw2.map((x, i) => x - dot(raw2, r1) * r1[i])), r3 = cross(r1, r2), T = [c[0] / f * scale, c[1] / f * scale, c[2] * scale];
  const centre = {x: -dot(r1, T), y: -dot(r2, T), z: -dot(r3, T)}, forward = [r1[2], r2[2], r3[2]], line = horizon(H, cx);
  const camera: Camera = {focalPx: f, cx, cy, pitchDeg: Math.asin(Math.max(-1, Math.min(1, -forward[2]))) / RAD, rollDeg: -line.slopeDeg, yawDeg: Math.atan2(forward[0], forward[1]) / RAD, heightMm: centre.z, x: centre.x, y: centre.y};
  return {camera, focalPx: f, focalFromOrthogonality: A1 * B1 < 0 ? Math.sqrt(-A1 / B1) : null, focalFromEqualLength: A2 * B2 < 0 ? Math.sqrt(-A2 / B2) : null,
    axisAngleDeg: Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (n1 * n2)))) / RAD, axisLengthRatio: n1 / n2, horizonY: line.y, horizonSlopeDeg: line.slopeDeg,
    horizontalFovDeg: 2 * Math.atan(image.width / (2 * f)) / RAD, verticalFovDeg: 2 * Math.atan(image.height / (2 * f)) / RAD,
    distanceToOriginMm: Math.hypot(centre.x, centre.y, centre.z), groundDistanceToOriginMm: Math.hypot(centre.x, centre.y), viewAngleAtOriginDeg: Math.atan2(centre.z, Math.hypot(centre.x, centre.y)) / RAD};
}
// The same decomposition with the principal point's x left free: for a centred, unsheared pinhole
// both conditions hold for one f only at one cx. Returns the cx nearest the image centre.
export function principalXFromHomography(H: Mat3, image: Size, cy = (image.height - 1) / 2): number | null {
  const g = (cx: number) => { const p1 = H[0] - cx * H[6], p2 = H[1] - cx * H[7], q1 = H[3] - cy * H[6], q2 = H[4] - cy * H[7]; return (p1 * p2 + q1 * q2) * (H[6] ** 2 - H[7] ** 2) - (p1 ** 2 + q1 ** 2 - p2 ** 2 - q2 ** 2) * H[6] * H[7]; };
  const k = 1000, g0 = g(0), g1 = g(k), g2 = g(2 * k), qa = (g2 - 2 * g1 + g0) / 2, qb = (g1 - g0) - qa, mid = (image.width - 1) / 2;
  const roots = Math.abs(qa) < 1e-14 * Math.max(1, Math.abs(qb)) ? (Math.abs(qb) < 1e-300 ? [] : [-g0 / qb]) : (qb * qb - 4 * qa * g0 < 0 ? [] : [(-qb + Math.sqrt(qb * qb - 4 * qa * g0)) / (2 * qa), (-qb - Math.sqrt(qb * qb - 4 * qa * g0)) / (2 * qa)]);
  return roots.length ? roots.map(r => r * k).reduce((best, r) => Math.abs(r - mid) < Math.abs(best - mid) ? r : best) : null;
}

// Axis-aligned placement of one frame inside another: p' = p * scale + offset, visible inside `clip`.
export type FrameTransform = {id: string; scaleX: number; scaleY: number; offsetX: number; offsetY: number; clip: {left: number; top: number; right: number; bottom: number}};
// V6 portrait: native 1762x1174 resized to 1586x1057, cropped at left=250 width=1080, placed at (0,80) on 1080x1920.
export const V6_PORTRAIT: FrameTransform = {id: 'v6-portrait', scaleX: 1586 / 1762, scaleY: 1057 / 1174, offsetX: -250, offsetY: 80, clip: {left: 0, top: 80, right: 1080, bottom: 1137}};
export const mapPoint = (t: FrameTransform, p: Pt): Pt => ({x: p.x * t.scaleX + t.offsetX, y: p.y * t.scaleY + t.offsetY});
export function quadVisibility(t: FrameTransform, quad: Pt[]) {
  const q = quad.map(p => mapPoint(t, p)), xs = q.map(p => p.x), ys = q.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const over = {left: Math.max(0, t.clip.left - x0), right: Math.max(0, x1 - t.clip.right), top: Math.max(0, t.clip.top - y0), bottom: Math.max(0, y1 - t.clip.bottom)};
  const gone = x1 <= t.clip.left || x0 >= t.clip.right || y1 <= t.clip.top || y0 >= t.clip.bottom, cut = over.left + over.right + over.top + over.bottom > 0;
  return {quad: q, box: {x0, y0, x1, y1}, overflow: over, state: gone ? 'OUTSIDE' as const : cut ? 'PARTLY_CUT' as const : 'INSIDE' as const};
}

// Deterministic noise for uncertainty runs and tests.
export function seededRandom(seed: number) { let s = seed >>> 0; const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {uniform: next, gaussian: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next())}; }
