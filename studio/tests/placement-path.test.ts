// The schematic card path of the Placering view, drawn after the films (studio/lib/placement-path.ts).
// Run: node --test "studio/tests/placement-path.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { INTENT_DEFAULTS, WINDOW_CARD, defaultPlan, planQuad, type Intent } from "../../src/placement-model.ts";
import { PATH_AT, PATH_SECONDS, pathFrame } from "../lib/placement-path.ts";

type Pt = { x: number; y: number };
const quad = planQuad(defaultPlan(), "P4.C1", "native");
const window = WINDOW_CARD.native;
const pinch: Intent = { takeHand: "LH", startSide: "BACK", endSide: "FRONT", pass: false, turn: true, ...INTENT_DEFAULTS };
const drag: Intent = { ...pinch, grip: "DRAG" };
const atPlace: Intent = { ...pinch, turnAt: "PLACE" };
const at = (seconds: number, intent: Intent = pinch) => pathFrame(seconds / PATH_SECONDS, window, quad, intent);
const centre = (q: readonly Pt[]) => ({ x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length });
const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const near = (a: readonly Pt[], b: readonly Pt[], tolerance = 1e-6) => a.length === b.length && a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) < tolerance);
/** A card's length along its own long side (corners 0–1 are the held end) and its width across that side. */
function measures(q: readonly Pt[]) {
  const held = mid(q[0], q[1]);
  const other = mid(q[2], q[3]);
  const length = Math.hypot(held.x - other.x, held.y - other.y);
  const a = { x: (held.x - other.x) / length, y: (held.y - other.y) / length };
  const across = q.map((p) => (p.x - other.x) * -a.y + (p.y - other.y) * a.x);
  return { length, width: Math.max(...across) - Math.min(...across), a };
}
const turnMiddle = (PATH_AT.turn + PATH_AT.turned) / 2;

test("the card starts as the shoe's window card, back up with the hand at its pinch, and ends on its landing quad; the hand goes back", () => {
  const first = at(0);
  assert.ok(near(first.points, window, 1e-9), "the start pose is the window card");
  assert.deepEqual([first.side, first.phase, first.handName], ["BACK", "ready", "LH"]);
  // the hand holds the window card's upper short end
  const held = mid(window[0], window[1]);
  assert.ok(Math.hypot(first.hand.outline[0].x - held.x, first.hand.outline[0].y - held.y) < first.hand.size, "the pinch is at the upper short end");
  // laid: exactly the plan's quad, face up
  const laid = at(PATH_AT.laid);
  assert.deepEqual(laid.points, quad);
  assert.deepEqual([laid.side, laid.phase], ["FRONT", "release"]);
  assert.equal(at(PATH_AT.free + 0.1).phase, "return");
  // back at the window by the end of the run, the card on its place
  const last = pathFrame(1, window, quad, pinch);
  assert.ok(near(last.hand.outline, first.hand.outline), "the hand is back at the pinch");
  assert.deepEqual(last.points, quad);
  assert.equal(last.phase, "ready");
  const w = centre(window);
  assert.ok(last.arc.startsWith(`M${Math.round(w.x * 10) / 10},${Math.round(w.y * 10) / 10} L`), "the way starts at the window card's centre");
  // time outside 0…1 is held to it
  assert.deepEqual(pathFrame(-1, window, quad, pinch), pathFrame(0, window, quad, pinch));
  assert.deepEqual(pathFrame(2, window, quad, pinch), pathFrame(1, window, quad, pinch));
});

test("the grip changes the way: a pinch lifts the card out along its long side and carries it larger, a drag brings it down onto the felt", () => {
  const w = centre(window);
  const lifted = at(PATH_AT.out);
  const slid = at(PATH_AT.out, drag);
  const pc = centre(lifted.points);
  const dc = centre(slid.points);
  assert.ok(pc.y < w.y - 60 && dc.y > w.y + 20, `a pinch above the window (${pc.y.toFixed(0)}), a drag below it on the felt (${dc.y.toFixed(0)})`);
  // out of the window along the window card's own long side (up and to the right in the picture)
  const along = measures(window).a;
  const moved = { x: pc.x - w.x, y: pc.y - w.y };
  assert.ok((moved.x * along.x + moved.y * along.y) / Math.hypot(moved.x, moved.y) > 0.99, "lifted along its long side");
  // in the hand: the window card's angle, 1.5 × the lying card's near edge long (Paow 2.1: 127–135 against 83 px)
  const carried = measures(lifted.points);
  const edge = Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y);
  assert.ok(Math.abs(carried.length - 1.5 * edge) < 1e-6 && Math.abs(carried.width - 0.54 * carried.length) < 1e-6);
  assert.ok(Math.abs(Math.atan2(carried.a.y, carried.a.x) - Math.atan2(along.y, along.x)) < 1e-9, "held in the window card's angle");
  // a drag keeps the lying card's shape on the felt and goes straight; a pinch goes over the chord
  assert.ok(Math.abs(measures(slid.points).length - measures(quad).length) < 1e-6);
  const way = (intent: Intent) => [PATH_AT.out, 1.7, 3.0, PATH_AT.laid].map((s) => centre(at(s, intent).points));
  const [a, , c, d] = way(drag);
  const off = (p: Pt) => Math.abs((d.x - a.x) * (p.y - a.y) - (d.y - a.y) * (p.x - a.x)) / Math.hypot(d.x - a.x, d.y - a.y);
  assert.ok(off(c) < 1, "a drag slides straight to the place");
  const [pa, pb, , pd] = way(pinch);
  const chordY = pa.y + ((pb.x - pa.x) / (pd.x - pa.x)) * (pd.y - pa.y);
  assert.ok(pb.y < chordY - 30, "a pinch is carried high");
  // the hand: beyond the card's short end for a pinch, flat over the card for a drag
  const inside = (p: Pt, q: readonly Pt[]) => p.x > Math.min(...q.map((c) => c.x)) && p.x < Math.max(...q.map((c) => c.x)) && p.y > Math.min(...q.map((c) => c.y)) && p.y < Math.max(...q.map((c) => c.y));
  assert.ok(inside(at(1.6, drag).hand.label, at(1.6, drag).points), "over the card");
  assert.ok(!inside(at(1.6).hand.label, at(1.6).points), "at its end");
});

test("where the turn happens follows the plan: mid-way on the way, at the place there; it lasts 0.36 s of film", () => {
  const phases = (intent: Intent) => Array.from({ length: 64 }, (_, i) => at((i / 63) * PATH_SECONDS, intent).phase);
  assert.equal(at(turnMiddle).phase, "turn");
  assert.equal(at(turnMiddle, atPlace).phase, "take", "turned at the place, it is still on its way here");
  const place = 4.05 - 0.34 - 0.18;
  assert.equal(at(place, atPlace).phase, "turn");
  assert.notEqual(at(place).phase, "turn");
  assert.ok(phases(pinch).includes("land") && phases(atPlace).includes("turn"));
  assert.ok(Math.abs(PATH_AT.turned - PATH_AT.turn - 0.36) < 1e-9);
  // mid-way: the card's centre in the turn is between a third and two thirds of the way from the window to the place
  const w = centre(window);
  const q = centre(quad);
  const c = centre(at(turnMiddle).points);
  const share = Math.hypot(c.x - w.x, c.y - w.y) / Math.hypot(q.x - w.x, q.y - w.y);
  assert.ok(share > 0.33 && share < 0.67, `mid-way: ${share.toFixed(2)}`);
  // the side changes in the middle of the turn
  assert.equal(at(PATH_AT.turn + 0.05).side, "BACK");
  assert.equal(at(PATH_AT.turned - 0.05).side, "FRONT");
});

test("the turn narrows the card across its own width to a line along its length, not across the picture", () => {
  const before = measures(at(PATH_AT.turn).points);
  const edge = measures(at(turnMiddle).points);
  assert.ok(before.width > 50, "broad side to the camera before");
  assert.ok(edge.width < 1, `a line at the middle of the turn (${edge.width.toFixed(2)} px across)`);
  assert.ok(Math.abs(edge.length - before.length) < 2, "its length is kept");
  // the line runs along the card's own long side, which stands diagonal in the picture: it is no squash about the vertical
  const pts = at(turnMiddle).points;
  const xs = pts.map((p) => p.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.4 * edge.length, "the edge line is diagonal, wide in the picture");
  assert.ok(Math.abs(Math.atan2(edge.a.y, edge.a.x) - Math.atan2(before.a.y, before.a.x)) < 0.05, "about the same long side");
  // a drag turned on the way rolls the lying card about its own long side too, lifted off the felt
  const lying = measures(at(turnMiddle, drag).points);
  assert.ok(lying.width < 1 && Math.abs(lying.length - measures(quad).length) < 1e-6);
});

test("the hand turns with the card and stays turned until the card lies: the palm comes up for the wrist, the thumb goes over for the key", () => {
  const thumbSide = (s: number, intent: Intent) => {
    const f = at(s, intent);
    const m = measures(f.points.length === 4 ? f.points : quad);
    const t = centre(f.hand.thumb);
    const c = centre(f.points);
    return Math.sign((t.x - c.x) * -m.a.y + (t.y - c.y) * m.a.x);
  };
  // FREE (the wrist): the palm from facing down to facing up, and up until the card lies
  assert.equal(at(1.6).hand.palm, false);
  for (const s of [PATH_AT.turned + 0.1, 3, PATH_AT.laid - 0.1, PATH_AT.laid + 0.2]) assert.equal(at(s).hand.palm, true, `palm up at ${s}`);
  assert.ok(at(3).hand.crease, "the palm's crease shows");
  assert.equal(at(PATH_AT.home + 0.1).hand.palm, false, "back home it faces down again");
  // LONG_EDGE (like a key): the hand seen from its side, the thumb over to the other side, no palm
  const key: Intent = { ...pinch, flipAxis: "LONG_EDGE" };
  for (const s of [1.6, 3, PATH_AT.laid + 0.2]) assert.equal(at(s, key).hand.palm, false);
  assert.equal(thumbSide(1.6, key), -thumbSide(2.6, key), "the thumb goes over with the card");
  assert.notDeepEqual(at(1.6, key).hand.outline, at(1.6).hand.outline, "the key hand is drawn otherwise than the wrist's");
  // the card's own way is the same for both turns on the way
  assert.deepEqual(at(turnMiddle, key).points, at(turnMiddle).points);
});

test("turned at the place, the card lies beside its place and rolls over its long side nearest the shoe, which stays on the felt", () => {
  const start = at(4.05 - 0.34 - 0.36, atPlace).points;
  const shared = start.filter((p) => quad.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6));
  assert.equal(shared.length, 2, "it lies against the place along one long side");
  // that side is the place's long side nearest the shoe
  const w = centre(window);
  const right = mid(quad[1], quad[2]);
  const left = mid(quad[0], quad[3]);
  const nearest = Math.hypot(right.x - w.x, right.y - w.y) < Math.hypot(left.x - w.x, left.y - w.y) ? [quad[1], quad[2]] : [quad[0], quad[3]];
  assert.ok(nearest.every((q) => shared.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6)));
  // up on that edge in the middle of the turn, then over onto its quad
  const up = at(4.05 - 0.34 - 0.18, atPlace).points;
  assert.ok(Math.min(...up.map((p) => p.y)) < Math.min(...nearest.map((p) => p.y)) - 20, "standing on its edge");
  assert.deepEqual(at(4.05 - 0.3, atPlace).points, quad);
  assert.equal(at(4.05 - 0.3, atPlace).side, "FRONT");
});

test("a card that is not turned keeps its side; a hand change shows the other hand from the carry on", () => {
  const closed: Intent = { ...pinch, endSide: "BACK", turn: false, pass: true };
  for (const s of [0, 1, 2, 3, 4.2, 5.5]) assert.equal(at(s, closed).side, "BACK");
  assert.equal(at(1, closed).handName, "LH");
  assert.equal(at(1.6, closed).handName, "RH");
  assert.equal(at(1.4, closed).phase, "pass");
  assert.equal(at(PATH_AT.home + 0.2, closed).handName, "LH");
  assert.deepEqual(at(PATH_AT.laid, closed).points, quad);
  assert.equal(at(3, closed).hand.palm, false, "no turn, no palm");
});
