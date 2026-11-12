// The node map's geometry (studio/lib/map-layout.ts). Run: node --test "studio/tests/map-layout.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEATS } from "../../src/clip-graph.ts";
import { MAP, drawnEdges, mapLayout, overlaps, seatReach, segments, type Box, type MapLayout } from "../lib/map-layout.ts";

// Card centres roughly as the plan has them (film pixels): an arc, P4 nearest the camera.
const points = Object.fromEntries(
  SEATS.flatMap((seat, i) => {
    const x = 180 + i * 230;
    const y = 700 + 120 * Math.cos(((i - 3) / 3) * (Math.PI / 2.4));
    return [
      [`${seat}.C1`, { x, y }],
      [`${seat}.C2`, { x: x + 38, y: y + 4 }],
    ];
  }).concat([
    ["D.C1", { x: 860, y: 520 }],
    ["D.C2", { x: 900, y: 520 }],
  ]),
);

const layouts: [string, MapLayout][] = [
  ["SEAT", mapLayout({ mode: "SEAT", points })],
  ["CARD", mapLayout({ mode: "CARD", points })],
  ["SEAT without a plan", mapLayout({ mode: "SEAT", points: null })],
];

test("which films are drawn: 54 + 3 with one film per card, a seat's C2 left out with one film per seat", () => {
  assert.equal(drawnEdges("CARD").length, 57);
  const seat = drawnEdges("SEAT");
  assert.equal(seat.length, 36);
  assert.ok(seat.includes("READY>P4.C1") && !seat.includes("READY>P4.C2"));
  // The dealer's hole card is closed and keeps its own films.
  assert.ok(seat.includes("READY>D.C2") && seat.includes("D.C2>IDLE"));
  for (const [, layout] of layouts) for (const e of layout.edges) assert.ok(e.id === "IDLE>IDLE" || (e.path && e.route && e.label), e.id);
});

test("the table as a player sees it", () => {
  for (const [name, layout] of layouts) {
    const node = (id: string) => layout.nodes.find((n) => n.id === id)!.box;
    const xs = SEATS.map((s) => node(s).x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, `${name}: P1 left to P7 right`);
    for (const s of SEATS) assert.ok(node("D").y + node("D").h < node(s).y, `${name}: dealer above ${s}`);
    assert.ok(node("IDLE").x < node("P1").x && node("READY").x > node("P7").x, `${name}: A1 left, A2.1 right`);
    assert.ok(node("READY").y < node("D").y && node("AWAY").y < node("IDLE").y, `${name}: anchors at the top, Borta above A1`);
    // The arc: P4 sits lower than the seats at the ends when the plan says so.
    if (name !== "SEAT without a plan") assert.ok(node("P4").y > node("P1").y && node("P4").y > node("P7").y, `${name}: arc`);
  }
});

const labels = (layout: MapLayout) => layout.edges.filter((e) => e.label).map((e) => ({ id: e.id, box: e.label! }));

test("no label lies on another label or on a node", () => {
  for (const [name, layout] of layouts) {
    const list = labels(layout);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) assert.ok(!overlaps(list[i].box, list[j].box, 2), `${name}: ${list[i].id} and ${list[j].id}`);
    for (const l of list) for (const n of layout.nodes) assert.ok(!overlaps(l.box, n.box, 2), `${name}: ${l.id} on ${n.id}`);
  }
});

test("a label sits on its own line and on no other line or rail", () => {
  for (const [name, layout] of layouts) {
    for (const e of layout.edges.filter((x) => x.label)) {
      const mine = segments(e.path);
      assert.ok(mine.some((seg) => overlaps(seg, e.label!, -0.5)), `${name}: ${e.id}'s label is on its line`);
      const others = [...layout.edges.filter((x) => x !== e).flatMap((x) => segments(x.path)), ...layout.rails.flatMap((x) => segments(x.path))];
      for (const seg of others) assert.ok(!overlaps(seg, e.label!, 3), `${name}: a line under ${e.id}'s label`);
    }
  }
});

test("no two films share a line, and no film runs through a node it does not touch", () => {
  for (const [name, layout] of layouts) {
    const lines = layout.edges.flatMap((e) => segments(e.path).map((seg) => ({ id: e.id, seg, nodes: e.nodes })));
    const shared = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 1;
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i].seg;
        const b = lines[j].seg;
        // Two upright lines beside each other keep at least 12 apart; so do two level ones.
        if (a.w === 0 && b.w === 0 && shared(a.y, a.y + a.h, b.y, b.y + b.h)) assert.ok(Math.abs(a.x - b.x) >= 12, `${name}: ${lines[i].id} beside ${lines[j].id}`);
        if (a.h === 0 && b.h === 0 && shared(a.x, a.x + a.w, b.x, b.x + b.w)) assert.ok(Math.abs(a.y - b.y) >= 12, `${name}: ${lines[i].id} beside ${lines[j].id}`);
      }
    // Where a dealer's line and a seat's line meet A2.1's rail from either side, they do not meet at one point.
    const bus = layout.rails.find((x) => x.id === "rail-ready")!;
    const y = segments(bus.path).find((seg) => seg.h === 0)!.y;
    const ends = lines.filter((l) => l.seg.w === 0 && (l.seg.y === y || l.seg.y + l.seg.h === y)).map((l) => ({ x: l.seg.x, above: l.seg.y < y }));
    for (const a of ends.filter((e) => e.above)) for (const b of ends.filter((e) => !e.above)) assert.ok(Math.abs(a.x - b.x) >= 20, `${name}: lines meet at the rail at ${a.x}`);
    for (const { id, seg, nodes } of lines)
      for (const n of layout.nodes) if (!nodes.includes(n.id)) assert.ok(!overlaps(seg, n.box, -0.5), `${name}: ${id} runs through ${n.id}`);
  }
});

test("no two nodes overlap, and everything fits the map's size", () => {
  for (const [name, layout] of layouts) {
    for (let i = 0; i < layout.nodes.length; i++)
      for (let j = i + 1; j < layout.nodes.length; j++) assert.ok(!overlaps(layout.nodes[i].box, layout.nodes[j].box, 4), `${name}: ${layout.nodes[i].id} and ${layout.nodes[j].id}`);
    const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.w <= layout.width && b.y + b.h <= layout.height;
    for (const n of layout.nodes) assert.ok(inside(n.box), `${name}: ${n.id} inside`);
    for (const l of labels(layout)) assert.ok(inside(l.box), `${name}: ${l.id}'s label inside`);
  }
  // One film per seat stays small enough to read at 1280 × 720 without zooming in.
  const seat = layouts[0][1];
  assert.ok(seat.width < 1400 && seat.height < 720, `${seat.width} × ${seat.height}`);
  console.log(layouts.map(([name, l]) => `${name}: ${l.width} × ${l.height}`).join("; "));
  assert.equal(MAP.label.w, 92);
});

test("a seat's second card: how far it is moved", () => {
  assert.equal(seatReach(points, "P4"), Math.round(Math.hypot(38, 4)));
  assert.equal(seatReach(null, "P4"), null);
  assert.equal(seatReach({ "P4.C1": { x: 0, y: 0 } }, "P4"), null);
});
