// Tests for src/flip-axis.ts on made-up card tracks: a card rolled about its length, one folded over its short edge, and the
// ways a track can leave the question open (a swap between two frames, a card that shrinks every way, a bridged edge).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFlip, describe, shapeOf, axialDiff, axialMean, extentAlong, type FlipFrame, type XY} from '../src/flip-axis.ts';

const rad = (d: number) => d * Math.PI / 180;
/** A card outline: centre, extent along `angle` (its length) and across it (its width), clockwise on screen. */
const card = (c: XY, length: number, width: number, angle: number): XY[] => {
  const u: XY = [Math.cos(rad(angle)) * length / 2, Math.sin(rad(angle)) * length / 2], v: XY = [-Math.sin(rad(angle)) * width / 2, Math.cos(rad(angle)) * width / 2];
  return [[c[0] - u[0] - v[0], c[1] - u[1] - v[1]], [c[0] + u[0] - v[0], c[1] + u[1] - v[1]], [c[0] + u[0] + v[0], c[1] + u[1] + v[1]], [c[0] - u[0] + v[0], c[1] - u[1] + v[1]]];
};
const line = (c: XY, length: number, angle: number): [XY, XY] => { const u: XY = [Math.cos(rad(angle)) * length / 2, Math.sin(rad(angle)) * length / 2]; return [[c[0] - u[0], c[1] - u[1]], [c[0] + u[0], c[1] + u[1]]]; };
/**
 * A deal around one turn. `axis` LONG: the width collapses and the edge-on line runs along the length; SHORT: the length
 * collapses and the line runs along the width. `turn` degrees the hand turns the card in the picture over the whole clip.
 */
function deal(axis: 'LONG' | 'SHORT', o: {turn?: number; edgeNote?: string; edges?: number; lose?: number[]} = {}): FlipFrame[] {
  const L = 100, W = 70, frames: FlipFrame[] = [], n = 36, angleAt = (i: number) => 160 + (o.turn ?? 0) * i / n, at = (i: number): XY => [900 - 5 * i, 700 + 7 * i];
  const closing = [1, 0.97, 0.87, 0.71, 0.5, 0.26], edges = o.edges ?? 2;
  let i = 0;
  for (; i < 10; i++) frames.push({frame: i, side: 'BACK', quad: card(at(i), L, W, angleAt(i)), edge: null, area: L * W, confidence: 0.95});
  for (const k of closing.slice(1)) { const len = axis === 'SHORT' ? L * k : L, wid = axis === 'LONG' ? W * k : W;
    frames.push({frame: i, side: 'BACK', quad: card(at(i), len, wid, angleAt(i)), edge: null, area: len * wid, confidence: 0.8}); i++; }
  for (let e = 0; e < edges; e++, i++) frames.push({frame: i, side: 'EDGE', quad: null, edge: line(at(i), axis === 'LONG' ? L : W, angleAt(i) + (axis === 'LONG' ? 0 : 90)), area: 300, confidence: 0.5, note: o.edgeNote ?? 'thin shape without card colour'});
  for (const k of [...closing].reverse()) { const len = axis === 'SHORT' ? L * k : L, wid = axis === 'LONG' ? W * k : W;
    frames.push({frame: i, side: 'FRONT', quad: card(at(i), len, wid, angleAt(i)), edge: null, area: len * wid, confidence: 0.8}); i++; }
  for (; i < n; i++) frames.push({frame: i, side: 'FRONT', quad: card(at(i), L, W, angleAt(i)), edge: null, area: L * W, confidence: 0.95});
  for (const f of o.lose ?? []) frames[f] = {frame: f, side: 'NONE', quad: null, edge: null, area: 0, confidence: 0, note: 'nothing at the expected place'};
  return frames;
}

test('helpers: undirected angles and the outline\'s principal axes', () => {
  assert.equal(axialDiff(170, 10), 20);
  assert.equal(axialDiff(90, 0), 90);
  assert.ok(Math.abs(axialMean([175, 5]) % 180) < 1e-6 || Math.abs(axialMean([175, 5]) - 180) < 1e-6);
  const s = shapeOf(card([0, 0], 100, 70, 30));
  assert.ok(axialDiff(s.angle, 30) < 1e-6, `main direction ${s.angle}`);
  assert.ok(Math.abs(s.major - 100) < 1e-6 && Math.abs(s.minor - 70) < 1e-6);
  assert.ok(Math.abs(extentAlong(card([0, 0], 100, 70, 0), 90) - 70) < 1e-6);
});

test('a card rolled about its length reads LÅNGSIDAN, with the line along the length', () => {
  const r = readFlip({frames: deal('LONG')});
  assert.equal(r.answer, 'LÅNGSIDAN', r.reason);
  assert.equal(r.shape, 'LÅNGSIDAN');
  assert.equal(r.line?.says, 'LÅNGSIDAN');
  assert.ok(r.line!.toLength < 5 && r.line!.toWidth > 80, JSON.stringify(r.line));
  assert.ok(Math.abs(r.line!.perLength - 1) < 0.05, 'the line is one card length');
  assert.ok(r.width!.ratio < 0.6 && r.length!.ratio > 0.9, JSON.stringify({w: r.width, l: r.length}));
  assert.deepEqual([r.turn!.lastBack, r.turn!.firstFront], [14, 17]);
  assert.deepEqual(r.turn!.edgeFrames, [15, 16]);
  assert.ok(r.turn!.start <= 12 && r.turn!.end >= 18, `turn ${r.turn!.start}–${r.turn!.end}`);
  assert.match(r.text.join('\n'), /rullar kring långsidan/);
});

test('a card folded over its short edge reads KORTSIDAN, with the line across its former length', () => {
  const r = readFlip({frames: deal('SHORT')});
  assert.equal(r.answer, 'KORTSIDAN', r.reason);
  assert.equal(r.shape, 'KORTSIDAN');
  assert.equal(r.line?.says, 'KORTSIDAN');
  assert.ok(r.line!.toWidth < 5 && r.line!.toLength > 80, JSON.stringify(r.line));
  assert.ok(r.open.some(v => v.side === 'FRONT' && v.says === 'KORTSIDAN'), 'the opening face lies across the line');
  assert.match(r.reason, /fälls kring kortsidan/);
});

test('the hand turning the card in the picture does not change the answer', () => {
  assert.equal(readFlip({frames: deal('LONG', {turn: 40})}).answer, 'LÅNGSIDAN');
  assert.equal(readFlip({frames: deal('SHORT', {turn: -40})}).answer, 'KORTSIDAN');
});

test('a swap between two frames has no edge-on frame: OKLART, leaning on the outline, and says so', () => {
  const r = readFlip({frames: deal('LONG', {edges: 0})});
  assert.equal(r.answer, 'OKLART');
  assert.equal(r.leaning, 'LÅNGSIDAN');
  assert.ok(r.checks.some(c => /utan någon ruta på kant/.test(c)), r.checks.join(' | '));
});

test('an edge only bridged by the tracker is not seen: OKLART', () => {
  const r = readFlip({frames: deal('SHORT', {edgeNote: 'edge-on, bridged from the frames around it'})});
  assert.equal(r.answer, 'OKLART');
  assert.equal(r.line, null);
  assert.ok(r.checks.some(c => /ifylld mellan grannrutorna/.test(c)));
});

test('a card that shrinks every way into the turn (under the hand, or away) is OKLART: both measures shrink', () => {
  const frames = deal('LONG');
  for (const f of frames) if (f.side === 'BACK' && f.frame >= 11 && f.quad) { const k = [0, 0.8, 0.6, 0.45, 0.35][f.frame - 10], c: XY = [mean(f.quad.map(p => p[0])), mean(f.quad.map(p => p[1]))];
    f.quad = card(c, 100 * k, 70 * k * 0.6, 160); }
  for (const f of frames) if (f.side === 'EDGE') f.edge = line([f.edge![0][0], f.edge![0][1]], 60, 70);
  const r = readFlip({frames});
  assert.equal(r.answer, 'OKLART');
  assert.equal(r.shape, 'BÅDA');
});

test('a track that loses the card in the turn says so', () => {
  const r = readFlip({frames: deal('LONG', {lose: [15]})});
  assert.ok(r.checks.some(c => /tappar kortet i vändningen \(ruta 15\)/.test(c)), r.checks.join(' | '));
});

test('a derived take is read on its own frames only', () => {
  const frames = deal('LONG').map(f => ({...f, frame: f.frame + 50})), before = deal('SHORT');
  const r = readFlip({frames: [...before, ...frames]}, [50, 85]);
  assert.equal(r.answer, 'LÅNGSIDAN');
  assert.equal(r.turn!.lastBack, 64);
});

test('no turn at all: a lying card or a film without a dealt card', () => {
  assert.match(readFlip({frames: deal('LONG').filter(f => f.side !== 'FRONT')}).reason, /bara med baksidan upp/);
  assert.match(readFlip({frames: []}).reason, /aldrig med baksidan upp/);
});

test('the height above the felt is reported against the resting place, with its limit in words', () => {
  const frames = deal('LONG'), rest = frames[frames.length - 1].quad!;
  const r = readFlip({frames, restQuad: rest});
  assert.ok(r.height && r.height.dy > 0, JSON.stringify(r.height));
  assert.match(describe(r).join('\n'), /höjd och djup går inte att skilja/);
});

function mean(v: number[]) { return v.reduce((s, x) => s + x, 0) / v.length; }
