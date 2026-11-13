// Things set into the players' rail that are not the rail itself: cup holders in the leather. Off until the scene is asked
// for them (state cups), so the scene opens as it was. Sizes are dealer metres, as in the table.
// A cup holder is a hole in the padded roll: a deep gold well with a rolled lip that is pressed down into the leather, the leather
// drawn down to the lip in soft folds round it and dark where it meets the metal. The roll itself is not cut. The cup is drawn
// before the table (renderOrder below 0): the well, the lip and a ring of the roll's own leather (the material the roll wears, at
// the place in its texture where the ring lies), then a dark line over that ring where the leather meets the lip, and last an
// invisible cover over the whole cup at the roll's surface, which writes depth only. The roll behind the cover is then not drawn,
// so the roll shows everywhere but inside the cup's ring, and the ring ends where the roll is (railPoint in scene3d-table.ts).
// The metal is lit by the room as the table is (the table's userData.rail.follow); without a table it reflects a painted room.
// (A line of light along the felt edge stood here until 2026-11-11; Jakob turned it down as not natural light. Light on the
// table comes from the room: the table's surface 'photo' and roomLight.)
import * as T from 'three';
import {RAIL, TABLE, railPoint, roomReflection, sized, type RailLink} from './scene3d-table.ts';

/**
 * Where cup holders sit along the rail: the angle on the players' arc (0 at the +x end, π at the -x end) of one between
 * each pair of neighbouring seats and one outside each end seat, as far out as the seats are apart. `seats` are the bet rings
 * (dealer metres: x across, s from the dealer-side edge). One that would land on the rail's rounded ends is left out. The angles
 * are those of TABLE's own oval; a table of another size (sized) has the same oval larger, so they hold for it too.
 */
export function cupAngles(seats: {x: number; s: number}[]): number[] {
  const at = seats.map(p => Math.atan2(p.s / TABLE.b, p.x / TABLE.a)).sort((p, q) => p - q); if (at.length < 2) return [];
  const step = (at[at.length - 1] - at[0]) / (at.length - 1), out = [at[0] - step / 2];
  for (let i = 0; i < at.length - 1; i++) out.push((at[i] + at[i + 1]) / 2);
  out.push(at[at.length - 1] + step / 2);
  return out.filter(t => t > 0.12 && t < Math.PI - 0.12);
}
/** The middle of the leather roll's top at arc angle t: [x, y, z] in the table's own metres (z from the dealer-side edge toward the players), for a table of `size` (sized). */
export function railTop(t: number, size = 1): number[] {
  const {a, b} = sized(size), l = Math.hypot(b * Math.cos(t), a * Math.sin(t));
  return [a * Math.cos(t) + RAIL.centre * b * Math.cos(t) / l, RAIL.top, b * Math.sin(t) + RAIL.centre * a * Math.sin(t) / l];
}

// A cup holder. radius: the well's inner wall; depth: from the lip down to its bottom, which has a rounded corner `corner` wide.
// lip: the rolled rim, `width` from the wall out over the leather and `height` above where the leather meets it; its widest point
// stands `bulge` above that, so the leather tucks in under it. The roll is round across its top, so a flat rim would sink into the
// crown and float over the shoulders: the rim follows the roll's curve by `bend` (0 flat, 1 all of it) and the leather takes up the
// rest, pressed down `sink` more everywhere. The leather is drawn down over `collar` beyond the rim, `along` the rail and `across`
// it (where the roll falls away), with soft folds `folds` deep. The cover lies `cover` above the roll's surface over the cup and
// comes down onto it at the collar's edge.
export const CUP = {radius: 0.026, depth: 0.05, corner: 0.005, lip: {width: 0.004, height: 0.0024, bulge: 0.0007}, bend: 0.4, sink: 0.001, collar: {along: 0.011, across: 0.005}, folds: 0.0006, cover: 0.0005};
const AROUND = 96; // steps round a cup
// The polished gold of the rim and the spun gold of the well: colour, roughness and how much of the room's light each takes (as the
// table's `lights`). lean: how far the well's wall is taken to lean back toward the opening when it reflects the room. A warm room
// turns gold toward copper, so the colours are paler and yellower than polished gold on its own.
const GOLD = {lip: {color: 0xead494, roughness: 0.2, light: 1.8}, well: {color: 0xd8bd80, roughness: 0.5, light: 1.5, lean: 0.5}};

/** A mesh's arrays: positions, normals, texture coordinates, a shade from 0 (dark) to 1 per point, and triangles. */
export type CupPart = {position: number[]; normal: number[]; uv: number[]; shade: number[]; index: number[]};
const part = (): CupPart => ({position: [], normal: [], uv: [], shade: [], index: []});
// A grid of `rows` × (AROUND + 1) points already in `p` from `first` on, joined into triangles that face the way the points' normals do.
function joinGrid(p: CupPart, first: number, rows: number) {
  const n = AROUND + 1, at = (i: number) => [p.position[3 * i], p.position[3 * i + 1], p.position[3 * i + 2]];
  const tri = (i: number, j: number, k: number) => {
    const [a, b, c] = [at(i), at(j), at(k)], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    let dot = 0; for (const q of [i, j, k]) for (let d = 0; d < 3; d++) dot += face[d] * p.normal[3 * q + d];
    if (dot >= 0) p.index.push(i, j, k); else p.index.push(i, k, j);
  };
  for (let r = 0; r < rows - 1; r++) for (let s = 0; s < AROUND; s++) { const q = first + r * n + s; tri(q, q + 1, q + n); tri(q + 1, q + n + 1, q + n); }
}
// How much of the leather's dip is left a share x of the way out over the collar: steepest at the rim, and flat and without a bend
// where it ends (a bend there shows as a ring in the leather's sheen).
const ease = (x: number) => (1 - x) ** 3;
// Round a cup: the folds, and how much farther or nearer than its mean the leather is drawn down, so that no circle shows.
const wrinkle = (q: number) => 0.55 * Math.sin(9 * q + 0.4) + 0.3 * Math.sin(14 * q + 1.9) + 0.15 * Math.sin(23 * q + 4.2);
const wobble = (q: number) => 0.6 * Math.sin(3 * q + 1.1) + 0.4 * Math.sin(5 * q + 2.6);

/**
 * The cup holders at arc angles `angles` (cupAngles) on a table of `size`, in the table's own metres: the well (wall, rounded
 * corner and bottom; shade = how much of the room it sees through the opening), the rim, the leather drawn down round the rim
 * (the roll's texture coordinates; shade = the dark line where it meets the rim) and the cover over all of it at the roll's surface.
 */
export function cupParts(angles: number[], size = 1) {
  const well = part(), lip = part(), collar = part(), cover = part(), {radius: R, depth, corner, lip: L, bend, sink} = CUP, rim = R + L.width, {a, b} = sized(size);
  for (const t of angles) {
    const [cx, , cz] = railTop(t, size), l = Math.hypot(b * Math.cos(t), a * Math.sin(t)), m = Math.hypot(a * Math.sin(t), b * Math.cos(t));
    const out = [b * Math.cos(t) / l, a * Math.sin(t) / l], along = [-a * Math.sin(t) / m, b * Math.cos(t) / m]; // across the rail (away from the felt) and along it
    const turns = Array.from({length: AROUND + 1}, (_, i) => 2 * Math.PI * i / AROUND);
    const dir = (q: number) => [Math.cos(q) * out[0] + Math.sin(q) * along[0], Math.cos(q) * out[1] + Math.sin(q) * along[1]]; // the plan direction at q round the cup
    const roll = (q: number, r: number) => { const d = dir(q); return railPoint(cx + r * d[0], cz + r * d[1], size, t); };
    // where the leather meets the rim: the roll's height under the rim's edge, the rim bent by `bend` of the roll's curve, pressed `sink` down
    const under = turns.map(q => roll(q, rim).y), low = Math.min(...under), meet = under.map(y => low + bend * (y - low) - sink), dip = under.map((y, i) => y - meet[i]), deepest = Math.max(...dip);
    const floor = meet.reduce((s, y) => s + y, 0) / meet.length - depth, open = meet.reduce((s, y) => s + y, 0) / meet.length + L.bulge;
    const put = (p: CupPart, q: number, r: number, y: number, nr: number, ny: number, u: number, v: number, shade: number) => {
      const d = dir(q); p.position.push(cx + r * d[0], y, cz + r * d[1]); p.normal.push(nr * d[0], ny, nr * d[1]); p.uv.push(u, v); p.shade.push(shade); };

    // The well, from the rim's inner edge down the wall, round the corner and in over the bottom to the middle. Its light falls off
    // as the share of the room it sees through the opening does (the view factor from a point of a cylinder's wall to its end).
    const seen = (z: number) => { const Z = Math.max(0, z) / R; return Math.min(1, (Z * Z + 2) / Math.sqrt(Z * Z + 4) - Z); };
    const bottom = R * R / (R * R + (open - floor) ** 2), profile: {r: number; y: (i: number) => number; nr: number; ny: number; shade: (i: number) => number}[] = [];
    const WALL = 10; for (let k = 0; k <= WALL; k++) { const f = k / WALL, y = (i: number) => meet[i] + L.bulge + (floor + corner - meet[i] - L.bulge) * f ** 1.3;
      profile.push({r: R, y, nr: -1, ny: 0, shade: i => seen(open - y(i))}); }
    for (let k = 1; k <= 5; k++) { const g = -Math.PI / 2 * k / 5, y = floor + corner + corner * Math.sin(g), z = open - y, s = seen(z) + (bottom - seen(z)) * k / 5;
      profile.push({r: R - corner + corner * Math.cos(g), y: () => y, nr: -Math.cos(g), ny: -Math.sin(g), shade: () => s}); }
    for (let k = 1; k <= 4; k++) profile.push({r: (R - corner) * (1 - k / 4), y: () => floor, nr: 0, ny: 1, shade: () => bottom});
    let first = well.position.length / 3, path = 0;
    profile.forEach((p, j) => { if (j) path += Math.hypot(p.r - profile[j - 1].r, p.y(0) - profile[j - 1].y(0));
      turns.forEach((q, i) => put(well, q, p.r, p.y(i), p.nr, p.ny, 6 * i / AROUND, path / (depth + R), 0.06 + 0.94 * p.shade(i) ** 1.8)); });
    joinGrid(well, first, profile.length);

    // The rim: a rolled bead from the wall's top up over the top and out, round its widest point and in under itself into the leather.
    first = lip.position.length / 3; const half = L.width / 2, LIP = 18;
    for (let k = 0; k < LIP; k++) { const g = Math.PI - 1.5 * Math.PI * k / (LIP - 1), up = g >= 0 ? L.height - L.bulge : L.bulge * 1.6, sg = Math.sin(g), cg = Math.cos(g), n = Math.hypot(cg / half, sg / up);
      const shade = g >= 0 ? 0.75 + 0.25 * sg : 0.75 + 0.5 * sg; // darker toward where it meets the leather and the wall
      turns.forEach((q, i) => put(lip, q, R + half + half * cg, meet[i] + L.bulge + up * sg, cg / half / n, sg / up / n, i / AROUND, k / (LIP - 1), shade)); }
    joinGrid(lip, first, LIP);

    // The leather drawn down round the rim: from under the rim's bead out to where the roll is untouched (`reach`), the dip easing
    // off, with folds that start at the rim and die out; its normals are the roll's, turned by the slope of the dip and the folds.
    first = collar.position.length / 3; const RINGS = 14, shares = [-0.6, 0, ...Array.from({length: RINGS - 2}, (_, k) => ((k + 1) / (RINGS - 2)) ** 1.6)];
    const reach = turns.map(q => (CUP.collar.across + (CUP.collar.along - CUP.collar.across) * Math.sin(q) ** 2) * (1 + 0.2 * wobble(q)));
    const radius = (i: number, x: number) => x < 0 ? rim + x * half : rim + x * reach[i];
    const fold = (i: number, x: number) => x <= 0 ? 0 : CUP.folds * dip[i] / deepest * ease(x) * Math.min(1, x / 0.12) * wrinkle(turns[i]);
    const drop = (i: number, x: number) => x < 0 ? -dip[i] + x * half * 0.4 : -dip[i] * ease(x) + fold(i, x); // the leather's height less the roll's
    const dropAt = (i: number, r: number) => drop(i, r < rim ? (r - rim) / half : Math.min(1, (r - rim) / reach[i]));
    for (let k = 0; k < RINGS; k++) { const x = shares[k];
      turns.forEach((q, i) => {
        const r = radius(i, x), on = roll(q, r), n = on.normal, h = drop(i, x), ii = i === AROUND ? 1 : i + 1, io = i === 0 ? AROUND - 1 : i - 1;
        // the dip's slope out from the cup and round it, as a gradient in the plan (none under the rim, and none where the roll is untouched)
        let dr = 0, dq = 0;
        if (k > 0 && k < RINGS - 1) { dr = (dropAt(i, r + 1e-5) - dropAt(i, r - 1e-5)) / 2e-5; dq = (dropAt(ii, r) - dropAt(io, r)) / (4 * Math.PI / AROUND) / r; }
        const d = dir(q), e = [Math.cos(q) * along[0] - Math.sin(q) * out[0], Math.cos(q) * along[1] - Math.sin(q) * out[1]]; // out from the cup, and round it
        const gx = dr * d[0] + dq * e[0], gz = dr * d[1] + dq * e[1], nx = n[0] - n[1] * gx, nz = n[2] - n[1] * gz, nl = Math.hypot(nx, n[1], nz);
        const gap = Math.max(0, r - rim), shade = x < 0 ? 0.3 : 1 - 0.62 * Math.exp(-((gap / 0.0011) ** 2)) - 0.2 * Math.max(0, 1 - gap / 0.006) ** 2 - 0.1 * (dip[i] / deepest) * ease(x);
        collar.position.push(cx + r * d[0], on.y + h, cz + r * d[1]); collar.normal.push(nx / nl, n[1] / nl, nz / nl); collar.uv.push(on.u, on.v); collar.shade.push(shade);
      }); }
    joinGrid(collar, first, RINGS);

    // The cover: the roll's surface `cover` higher over the opening, the rim and the collar, down onto it at the collar's edge.
    first = cover.position.length / 3; const OPEN = 6, COVER = [...Array.from({length: OPEN + 1}, (_, k) => k / OPEN * rim), ...shares.slice(2)];
    COVER.forEach((at, k) => turns.forEach((q, i) => { const x = k <= OPEN ? 0 : at, r = k <= OPEN ? at : rim + x * reach[i], lift = CUP.cover * (1 - x * x);
      put(cover, q, r, roll(q, r).y + lift, 0, 1, 0, 0, 1); }));
    joinGrid(cover, first, COVER.length);
  }
  return {well, lip, collar, cover};
}

// The dark line where the leather meets the rim: the collar drawn again over itself, its colour multiplied by its shade.
const LINE_VERTEX = 'attribute float shade; varying float vShade; void main(){ vShade = shade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const LINE_FRAGMENT = 'varying float vShade; void main(){ gl_FragColor = vec4(vec3(vShade), 1.); }';

export function createRailExtras(lit: <M extends T.Material>(material: M) => M = m => m) {
  const group = new T.Group(), room = roomReflection();
  // The spun gold of the well: fine rings round it and streaks up its wall in its roughness, and the share of the room it sees through
  // the opening as its vertex colour. Seen from above, the wall's own reflection points down into the cup, where a real cup holds the
  // light it lets in, not the room's floor; so the well reflects the room as if its wall leaned back toward the opening, the more the
  // more of the room it sees (GOLD.well.lean times that share).
  const spun = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d')!, image = g.createImageData(256, 512); let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const rows = Array.from({length: 512}, (_, y) => 40 * rand() + 15 * Math.sin(y * 0.7)), columns = Array.from({length: 256}, () => rand());
    for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) { const v = 175 + rows[y] + 45 * columns[x] ** 3, p = 4 * (y * 256 + x); image.data[p] = image.data[p + 1] = image.data[p + 2] = v; image.data[p + 3] = 255; }
    g.putImageData(image, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; })();
  const well = lit(new T.MeshStandardMaterial({color: GOLD.well.color, roughness: GOLD.well.roughness, metalness: 1, roughnessMap: spun, vertexColors: true, envMap: room, envMapIntensity: GOLD.well.light}));
  { const before = well.onBeforeCompile; well.onBeforeCompile = (shader, renderer) => { before.call(well, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `vec3 cupLean = normalize(geometryNormal + ${GOLD.well.lean.toFixed(3)} * vColor.r * (viewMatrix * vec4(0., 1., 0., 0.)).xyz);\n` + T.ShaderChunk.lights_fragment_maps.replaceAll('geometryNormal', 'cupLean')); };
    well.customProgramCacheKey = () => 'scene3d-light+cup-well'; }
  const lip = lit(new T.MeshStandardMaterial({color: GOLD.lip.color, roughness: GOLD.lip.roughness, metalness: 1, vertexColors: true, envMap: room, envMapIntensity: GOLD.lip.light}));
  const line = new T.ShaderMaterial({vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    blending: T.CustomBlending, blendSrc: T.DstColorFactor, blendDst: T.ZeroFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor});
  const cover = new T.MeshBasicMaterial({colorWrite: false});
  const plain = lit(new T.MeshStandardMaterial({color: 0x3a1c12, roughness: 0.5, envMap: room})); // the collar's leather when no table is there to lend its own
  const cups = new T.Group(); group.add(cups); cups.visible = false;
  // The table followed (its room lights the gold), and what the cups are to be built from: made when they are first shown after a
  // build, so a scene with the cups off does not build them.
  let followed: RailLink | null = null, wanted: {seats: {x: number; s: number}[]; size: number; table: RailLink | null} | null = null;
  function make({seats, size, table}: NonNullable<typeof wanted>) {
    for (const child of [...cups.children]) { cups.remove(child); (child as T.Mesh).geometry.dispose(); }
    const parts = cupParts(cupAngles(seats), size);
    const geometry = (p: CupPart, colour: boolean) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p.position, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(p.normal, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(p.uv, 2)); g.setAttribute('shade', new T.Float32BufferAttribute(p.shade, 1));
      if (colour) g.setAttribute('color', new T.Float32BufferAttribute(p.shade.flatMap(s => [s, s, s]), 3)); g.setIndex(p.index); return g; };
    const collar = geometry(parts.collar, false);
    for (const [g, material, order] of [[geometry(parts.well, true), well, -3], [geometry(parts.lip, true), lip, -3], [collar, table?.leather ?? plain, -3], [collar, line, -2], [geometry(parts.cover, false), cover, -1]] as [T.BufferGeometry, T.Material, number][]) {
      const mesh = new T.Mesh(g, material); mesh.renderOrder = order; cups.add(mesh); }
  }

  return {
    group,
    /** Built with the table: the same place, scale and size, and the seats' bet rings for where the cups go. */
    build(edgeZ: number, scale: number, seats: {x: number; s: number}[], size = 1) {
      group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
      // the table built just before, beside this group: its leather for the collar, and its room for the gold
      const table = (group.parent?.children.find(o => o !== group && o.userData.rail)?.userData.rail ?? null) as RailLink | null;
      if (table && table !== followed) { followed = table; table.follow(well, GOLD.well.light); table.follow(lip, GOLD.lip.light); }
      wanted = {seats, size, table}; if (cups.visible) { make(wanted); wanted = null; }
    },
    set(next: {cups: boolean}) { cups.visible = next.cups; if (next.cups && wanted) { make(wanted); wanted = null; } },
  };
}
