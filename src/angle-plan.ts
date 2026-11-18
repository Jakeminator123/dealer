// The angle trial's pure part (pages/vinklar.html, src/angle-lab.ts): which film shows at which camera angle, the weights of
// the cross-fade between two films, the camera's orbit about the dealer, how a film's planes stand, and the one clock the
// films are kept to. No three.js, no page: Node tests it (tools/angle-plan.test.ts).
//
// The trial (Jakob 2026-11-18): one of the bank's deals was made again by a video editor as the same deal seen from about
// 40 degrees to her left. The page carries the scene's camera around her and shows the film from the front near 0 degrees
// and the film from the side near its own angle, both running in step, so that he can see whether the two bind together.
// Angles are degrees about the vertical line through her; 0 is the bank's camera, positive is toward her left, the side the
// shoe stands on, which is image right in the film from the front.

/** A film of the trial: the deal as seen from `angle`. `mirror`: the film is shown turned left to right, as seen from the other side. */
export type AngleFilm = {id: string; name: string; path: string; angle: number; mirror?: boolean};

/**
 * The films, and the one place where each film's angle stands. A third film (the same deal from about 70 degrees) is a line
 * here; its mirrored twin on the other side is made by withMirrors. The two films lie in the proof folder they were shown
 * in (assets/proofs/sidovinkel-ur-film/, media outside Git); the film from the side is "rather 40 than 35 degrees" by its
 * proof's own word, read by eye and not measured.
 *
 * Known of the film from the side (2026-11-18, three things on the felt read by eye on the two stills at 3.4 s: the card's
 * middle and the two ends of the shoe's foot): it is not the bank's camera carried round her at the same height and tilt.
 * Under that camera the three fall 115 to 185 px from where the film has them, and the film's own places land 9 to 23 cm
 * from the front film's on the felt; a coarse search puts its camera much lower and flatter (about 0.45 m over the felt and
 * 6 degrees down, against 1.11 m and 25), still 70 to 85 px off. The trial carries the scene's camera at the bank's height
 * and tilt all the way, so at the side film's angle the film is the film pixel for pixel while the table under it is seen
 * from higher up than the film sees its own. A film's own camera (height, tilt, distance) beside its angle here, and a view
 * that follows it, is the next step if he wants the two to meet on the felt.
 */
export const FILMS: readonly AngleFilm[] = [
  {id: 'fram', name: 'Framifrån', path: 'assets/proofs/sidovinkel-ur-film/1-original.mp4', angle: 0},
  {id: 'sida', name: 'Från sidan', path: 'assets/proofs/sidovinkel-ur-film/2-fran-sidan.mp4', angle: 40},
];
/** The films' frames per second and the frame both begin on (the proof's record: 24 a second, 96 frames). */
export const FILM_FPS = 24;
/** How far behind the dealer-side table edge she sits, dealer metres: the line the camera is carried around (dealer3d/src/world.ts ASSUMED; with it the table's lens stands 2.024 m from her). */
export const BEHIND_EDGE = 0.18;
/** The page's controls at their first values: where between two films the change lies (a share of the way, 0 to 1) and how many degrees the cross-fade takes (0 is a cut). */
export const CHANGE = {share: 0.5, fade: 8};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The films in the order of their angles, with a mirrored twin on the other side of every film that is not from the front when `mirrors`. */
export function withMirrors(films: readonly AngleFilm[], mirrors: boolean): AngleFilm[] {
  const twins = mirrors ? films.filter(f => f.angle !== 0).map(f => ({...f, id: `${f.id}-spegel`, name: `${f.name}, spegelvänd`, angle: -f.angle, mirror: !f.mirror})) : [];
  return [...films, ...twins].sort((a, b) => a.angle - b.angle);
}

/**
 * How much of each film is drawn with the camera at `angle`; `films` in the order of their angles, the answer in the same
 * order. Outside the outermost films the outermost alone. Between two neighbours the change lies `share` of the way from
 * the one nearer the front to the one further out, and takes `fade` degrees about that point (never more than the films'
 * own distance; 0 is a cut, the outer film from the point on).
 *
 * The films are drawn one over the other, the outer over the inner (drawOrder), each times its weight. So the outer film
 * comes in over the whole of the fade while the inner one stays whole under it, and the inner one goes out during the
 * fade's second half: where both films have her, the picture is a true mix of the two and the room does not show through
 * her (at most 8 per cent of it, three quarters of the way).
 */
export function weights(angle: number, films: readonly {angle: number}[], share = CHANGE.share, fade = CHANGE.fade): number[] {
  const out = films.map(() => 0), last = films.length - 1; if (last < 0) return out;
  if (!(angle > films[0].angle)) { out[0] = 1; return out; }
  if (angle >= films[last].angle) { out[last] = 1; return out; }
  const hi = films.findIndex(f => f.angle > angle), lo = hi - 1;
  // inner: the one of the two nearer the front; `way` runs 0 at the inner film to 1 at the outer
  const outerIsHi = Math.abs(films[hi].angle) >= Math.abs(films[lo].angle), inner = outerIsHi ? lo : hi, outer = outerIsHi ? hi : lo;
  const span = Math.abs(films[outer].angle - films[inner].angle), way = Math.abs(angle - films[inner].angle) / span;
  const at = clamp(share, 0, 1), length = clamp(fade, 0, span) / span;
  if (!(length > 0)) { out[way >= at ? outer : inner] = 1; return out; }
  const v = clamp((way - (at - length / 2)) / length, 0, 1);
  out[outer] = smooth(0, 1, v); out[inner] = 1 - smooth(0.5, 1, v);
  return out;
}
/** The place of each film in the drawing order (0 first, under the others): the films nearer the front under the ones further out. */
export function drawOrder(films: readonly {angle: number}[]): number[] {
  const byReach = films.map((f, i) => ({i, reach: Math.abs(f.angle)})).sort((a, b) => a.reach - b.reach || a.i - b.i), out = films.map(() => 0);
  byReach.forEach((f, rank) => { out[f.i] = rank; }); return out;
}
/** The film that is the picture at these weights: the heaviest, and of two equally heavy the one drawn over the other. */
export function showing(weightOf: readonly number[], order: readonly number[]): number {
  let best = -1; weightOf.forEach((w, i) => { if (w > 0 && (best < 0 || w > weightOf[best] || w === weightOf[best] && order[i] > order[best])) best = i; }); return best;
}

// ---- the camera's orbit -----------------------------------------------------------------------------------------
// World frame, the scene's (src/scene3d-geometry.ts): x toward image right, y up, z toward the camera; the film camera
// stands at (0, height, 0) and she sits on the vertical line `distance` in front of it (x 0, z -distance).

/**
 * The film camera carried `degrees` around her at the same height, tilt and distance: how far it has moved from its own
 * place (dx toward image right, dz toward the camera, scene units) and how far it has turned (yaw in degrees, three.js's
 * sign: positive turns the view toward image left, which is what keeps her in the middle when the camera goes right).
 */
export function orbitView(distance: number, degrees: number): {dx: number; dz: number; yaw: number} {
  const a = degrees * Math.PI / 180; return {dx: distance * Math.sin(a), dz: -distance * (1 - Math.cos(a)), yaw: degrees};
}
/**
 * The same view as the setting the scene must be given for it. Under the table's lens the scene reads its view settings as
 * written for the contract's camera and converts them (viewUnder in src/scene3d-geometry.ts): this is that conversion
 * backwards, so that what the scene ends up with is exactly `want`. `written` null: the scene converts nothing.
 */
export function settingFor(want: {dx: number; dz: number; yaw: number}, camera: {focalPx: number; scale: number}, written: {focalPx: number; scale: number} | null): {dx: number; dz: number; yaw: number} {
  if (!written) return want;
  const move = written.scale / camera.scale, rad = Math.PI / 180;
  return {dx: want.dx * move, dz: want.dz * move, yaw: Math.atan(Math.tan(want.yaw * rad) * camera.focalPx / written.focalPx) / rad};
}

/**
 * How a film's planes stand: the matrix (column-major, as three.js keeps it) that carries the film's own camera and its two
 * surfaces from the bank camera's place to the film's angle, about the vertical line through her at z = `pivotZ`. Each film
 * is drawn as the scene draws a film, on an upright plane and on the felt, projected from its own camera; the upright
 * plane stands on her line and faces the angle the film was shot from. A mirrored film is the film of the opposite angle
 * with everything turned left to right.
 */
export function rigMatrix(film: {angle: number; mirror?: boolean}, pivotZ: number): number[] {
  const k = film.mirror ? -1 : 1, a = k * film.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), tx = -s * pivotZ, tz = pivotZ - c * pivotZ;
  return [c * k, 0, -s, 0, 0, 1, 0, 0, s * k, 0, c, 0, tx * k, 0, tz, 1];
}

// ---- one clock ----------------------------------------------------------------------------------------------------
// The deal's time is the page's own clock, and every film follows it: the same time in all of them, whichever is shown.

/** A time on the loop: `seconds` wrapped into 0 … duration. */
export const loopTime = (seconds: number, duration: number): number => duration > 0 ? ((seconds % duration) + duration) % duration : 0;
/** How far a film is behind the clock (positive) or ahead of it (negative), the short way round the loop. */
export function behind(clock: number, media: number, duration: number): number {
  if (!(duration > 0)) return 0; const d = loopTime(clock - media, duration); return d > duration / 2 ? d - duration : d;
}
/** STEP: within this a film only changes its speed a little to come back to the clock; further off it is moved there. */
export const STEP = {seek: 0.25, gain: 2, least: 0.8, most: 1.25};
/** What a running film does about being `late` seconds behind the clock: the speed it plays at, or a move to the clock's time. */
export function follow(late: number): {seek: boolean; rate: number} {
  return Math.abs(late) > STEP.seek ? {seek: true, rate: 1} : {seek: false, rate: clamp(1 + late * STEP.gain, STEP.least, STEP.most)};
}
/** The frame a time lies in, and the time in the middle of a frame (where a still film is put, so that it lands on that frame). */
export const frameOf = (seconds: number, fps = FILM_FPS): number => Math.floor(seconds * fps + 1e-3);
export const frameTime = (frame: number, fps = FILM_FPS): number => (frame + 0.5) / fps;

// ---- the film layer's weight ---------------------------------------------------------------------------------------
// The scene's film shader (src/scene3d-film.ts) writes its keyed, premultiplied colour on its last line. A film of the trial
// is drawn times its weight, so that one line is given a factor here, on the trial's own copies of the material; the
// scene's shader is not changed. Null when the shader no longer ends that way: the page then says so instead of drawing wrong.
const SHADER_END = 'gl_FragColor = o;';
export function weightedShader(fragment: string): string | null {
  const at = fragment.lastIndexOf(SHADER_END); if (at < 0 || fragment.slice(at + SHADER_END.length).trim() !== '}') return null;
  return `uniform float angleFade;\n${fragment.slice(0, at)}gl_FragColor = o * angleFade;${fragment.slice(at + SHADER_END.length)}`;
}

// ---- the address's words -------------------------------------------------------------------------------------------
/** A number of the address within its bounds, or `otherwise` when the word is missing or no number. */
export function wordNumber(text: string | null, lo: number, hi: number, otherwise: number): number {
  if (text === null || text.trim() === '') return otherwise; const v = Number(text.replace(',', '.')); return Number.isFinite(v) ? clamp(v, lo, hi) : otherwise;
}
/** How far the camera can be carried: a little past the outermost films, and only to the side that has a film (or a little the other way). */
export function reach(films: readonly {angle: number}[], past = 30, most = 80): {lo: number; hi: number} {
  const angles = films.map(f => f.angle), lo = Math.min(0, ...angles), hi = Math.max(0, ...angles);
  return {lo: Math.max(-most, lo < 0 ? lo - past : -15), hi: Math.min(most, hi > 0 ? hi + past : 15)};
}
