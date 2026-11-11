// The table of the 3D scene. Felt, lines, card places and logo are one flat image seen from straight above,
// so a new logo or felt colour is a texture change. Sizes are dealer metres; the group is scaled by the
// contract's k into the plan-scale world. The table's outline and the layout of the print are provisional:
// they were chosen to fit the film frame, not taken from a real table.
import * as T from 'three';
import type {Spot} from './scene3d-geometry.ts';

export const FELTS: Record<string, [string, string]> = {green: ['#134232', '#0a2a20'], blue: ['#16325e', '#0b1c38'], vin: ['#571a26', '#330d15'], svart: ['#23272a', '#101214']};
const TABLE = {a: 0.95, b: 0.6, rail: 0.1}; // half width, depth toward the players, rail width
const PRINT = {width: 2.8, depth: 1.4, back: 0.1, pxW: 4096, pxH: 2048}; // the felt image covers width x depth metres and starts `back` behind the dealer edge
const GOLD = '#d8b665';

export type FeltPrint = {spots: Spot[]; logo: string; felt: string; scale: number};
export function createTable(lit: <M extends T.Material>(material: M) => M = m => m) {
  const canvas = document.createElement('canvas'); canvas.width = PRINT.pxW; canvas.height = PRINT.pxH;
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 16;
  const group = new T.Group(), k = PRINT.pxW / PRINT.width, X = (x: number) => (x + PRINT.width / 2) * k, Y = (s: number) => (s + PRINT.back) * k;

  function draw(print: FeltPrint) {
    const g = canvas.getContext('2d')!, [light, dark] = FELTS[print.felt] ?? FELTS.green;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = dark; g.fillRect(0, 0, PRINT.pxW, PRINT.pxH);
    const pool = g.createRadialGradient(X(0), Y(0.3), 40, X(0), Y(0.3), 1.25 * k); pool.addColorStop(0, light); pool.addColorStop(1, dark); g.fillStyle = pool; g.fillRect(0, 0, PRINT.pxW, PRINT.pxH);
    let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.globalAlpha = 0.05; for (let i = 0; i < 70000; i++) { g.fillStyle = random() > 0.5 ? '#fff' : '#000'; g.fillRect(random() * PRINT.pxW, random() * PRINT.pxH, 2, 2); } g.globalAlpha = 1;
    // dealer-side trim: the film's body ends exactly at s = 0
    g.fillStyle = '#17110c'; g.fillRect(0, 0, PRINT.pxW, Y(0.016)); g.fillStyle = GOLD; g.globalAlpha = 0.55; g.fillRect(0, Y(0.016), PRINT.pxW, 3); g.globalAlpha = 1;
    const seats = print.spots.filter(p => /^P\d\.C1$/.test(p.id)), row = seats.length ? seats.reduce((t, p) => t + p.s, 0) / seats.length : 0.35, span = Math.max(0.3, ...seats.map(p => Math.abs(p.x))) * 1.5;
    g.strokeStyle = GOLD; g.lineWidth = 3; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(X(0), Y(0), span * k * 1.015, row * 0.83 * k, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); g.globalAlpha = 1;
    // text along an arc that opens toward the dealer, upright for the players
    const text = 'BLACKJACK PAYS 3 TO 2', size = Math.round(0.024 * k), rx = span * 0.95, ry = row * 0.7;
    g.save(); g.font = `600 ${size}px Georgia, 'Times New Roman', serif`; g.fillStyle = GOLD; g.globalAlpha = 0.8; g.textAlign = 'center'; g.textBaseline = 'middle';
    const widths = [...text].map(ch => g.measureText(ch).width + size * 0.12); let run = -widths.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < text.length; i++) { const phi = (run + widths[i] / 2) / ((rx + ry) / 2 * k); run += widths[i]; g.save(); g.translate(X(rx * Math.sin(phi)), Y(ry * Math.cos(phi))); g.rotate(-phi); g.fillText(text[i], 0, 0); g.restore(); }
    g.restore();
    const logo = print.logo.toUpperCase(), logoY = Y(row * 0.44);
    g.save(); g.fillStyle = GOLD; g.globalAlpha = 0.9; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(0.034 * k)}px Georgia, 'Times New Roman', serif`; g.fillText(logo, X(0), logoY);
    const half = g.measureText(logo).width / 2; g.lineWidth = 2; g.strokeStyle = GOLD; g.globalAlpha = 0.6; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(X(0) + d * (half + 24), logoY); g.lineTo(X(0) + d * (half + 110), logoY); g.stroke(); }
    g.restore();
    // card places from the placement plan, at the plan's own card width; a bet circle in front of each seat's first card
    const cardW = 0.063 / print.scale * k, cardH = 0.07 / print.scale * k, betOffset = 0.068 * k, betRadius = 0.027 * k;
    for (const p of print.spots) { const first = p.id.endsWith('C1'); g.save(); g.translate(X(p.x), Y(p.s)); g.strokeStyle = GOLD; g.globalAlpha = first ? 0.6 : 0.25; g.lineWidth = 3;
      g.beginPath(); g.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8); g.stroke();
      if (first && p.id[0] === 'P') { g.globalAlpha = 0.5; g.beginPath(); g.arc(0, betOffset, betRadius, 0, 7); g.stroke(); g.font = `600 ${Math.round(0.02 * k)}px Georgia, serif`; g.fillStyle = GOLD; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.id[1], 0, betOffset); }
      g.restore(); }
    texture.needsUpdate = true;
  }

  function build(edgeZ: number, scale: number) {
    for (const child of [...group.children]) { group.remove(child); (child as T.Mesh).geometry?.dispose(); }
    group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
    const N = 96, {a, b, rail} = TABLE, uvOf = (x: number, s: number) => [(x + PRINT.width / 2) / PRINT.width, 1 - (s + PRINT.back) / PRINT.depth];
    const position = [0, 0, b * 0.4], uv = [...uvOf(0, b * 0.4)], index: number[] = [];
    for (let i = 0; i <= N; i++) { const t = Math.PI * i / N, x = a * Math.cos(t), s = b * Math.sin(t); position.push(x, 0, s); uv.push(...uvOf(x, s)); if (i) index.push(0, i, i + 1); }
    index.push(0, N + 1, 1); // the dealer-side triangle between the two ends of the arc
    const felt = new T.BufferGeometry(); felt.setAttribute('position', new T.Float32BufferAttribute(position, 3)); felt.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); felt.setIndex(index);
    group.add(new T.Mesh(felt, lit(new T.MeshBasicMaterial({map: texture, side: T.DoubleSide}))));
    // padded rail around the players' arc, then the wooden apron
    const strip = (profile: number[][], material: T.Material) => { const p: number[] = [], ix: number[] = [], M = profile.length;
      for (let i = 0; i <= N; i++) { const t = Math.PI * i / N; for (const [out, y] of profile) p.push((a + out) * Math.cos(t), y, (b + out) * Math.sin(t)); }
      for (let i = 0; i < N; i++) for (let j = 0; j < M - 1; j++) { const q = i * M + j; ix.push(q, q + M, q + 1, q + 1, q + M, q + M + 1); }
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(p, 3)); geometry.setIndex(ix); geometry.computeVertexNormals(); group.add(new T.Mesh(geometry, material)); };
    const leather = lit(new T.MeshStandardMaterial({color: 0x3a2318, roughness: 0.55, metalness: 0.05, side: T.DoubleSide})), wood = lit(new T.MeshStandardMaterial({color: 0x2a170d, roughness: 0.4, metalness: 0.1, side: T.DoubleSide})), brass = lit(new T.MeshStandardMaterial({color: 0xb08a45, roughness: 0.3, metalness: 0.9}));
    strip([[0, 0], [0.006, 0.02], [0.03, 0.036], [0.07, 0.04], [0.105, 0.03], [rail, 0.004]], leather);
    strip([[rail, 0.004], [rail, -0.13], [rail - 0.05, -0.16]], wood);
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); group.add(m); };
    add(new T.BoxGeometry(2 * (a + rail), 0.16, 0.02), wood, 0, -0.082, -0.011);
    add(new T.CylinderGeometry(0.16, 0.24, 0.78, 32), wood, 0, -0.55, b * 0.45); add(new T.CylinderGeometry(0.42, 0.46, 0.05, 48), brass, 0, -0.93, b * 0.45);
  }
  return {group, draw, build};
}
