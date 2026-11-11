// Props that belong to the table but lie under the film: drawn after the felt and before the film layers, so the
// film's hands, sleeves, cards and shadows always end up on top of them. That only holds for things the hands rest
// on or pass over. Something a hand must go behind (the shoe) cannot be done this way.
//
// First prop: the dealer's chip tray, sunk into the table at her edge. Her hands lie flat on the green table in the
// film, exactly where a tray belongs, so the tray is a recess: rim and chips end at felt level and the hands rest on
// them instead of passing through something that sticks up. Sizes are dealer metres; the group is scaled by k.
import * as T from 'three';

// Across the table (x) and from the dealer-side edge toward the players (s). The felt has a notch of this size.
export const TRAY = {x0: -0.3, x1: 0.24, s0: 0, s1: 0.1, depth: 0.03, tubes: 11}; // ends short of the shoe on image right
const CHIP_MM = 3.3, COLOURS = ['#e9e4d6', '#e9e4d6', '#b3202a', '#b3202a', '#b3202a', '#1f7a4a', '#1f7a4a', '#1b1b1d', '#1b1b1d', '#5b2a86', '#d98a1f', '#2a4d9b'];

// One chip's edge, repeated along the stack: the colour with six pale inserts and a thin dark line between chips.
function chipTexture(colour: string, chips: number) {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 16; const g = canvas.getContext('2d')!;
  g.fillStyle = colour; g.fillRect(0, 0, 192, 16); g.fillStyle = colour === '#e9e4d6' ? '#3b6ea8' : '#efe9da'; for (let i = 0; i < 6; i++) g.fillRect(i * 32 + 4, 0, 11, 16);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 0, 192, 2); // faint, or the hundred chip edges shimmer when small
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(1, chips); texture.anisotropy = 8; return texture;
}

export function createChipTray(lit: <M extends T.Material>(material: M) => M = m => m) {
  const group = new T.Group(), owned: {dispose(): void}[] = [];
  function build(edgeZ: number, scale: number) {
    for (const child of [...group.children]) group.remove(child); for (const o of owned.splice(0)) o.dispose();
    group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
    const {x0, x1, s0, s1, depth, tubes} = TRAY, width = x1 - x0, length = s1 - s0, keep = <O extends {dispose(): void}>(o: O) => { owned.push(o); return o; };
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, s: number) => { const m = new T.Mesh(keep(geometry), material); m.position.set(x, y, s); group.add(m); return m; };
    const metal = keep(lit(new T.MeshStandardMaterial({color: 0xb8923f, roughness: 0.45, metalness: 0.35}))), dark = keep(lit(new T.MeshStandardMaterial({color: 0x15120f, roughness: 0.8, metalness: 0.2})));
    const cx = (x0 + x1) / 2, cs = (s0 + s1) / 2, wall = 0.004, rim = 0.007, top = 0.0003; // the rim stays below the film's table layer
    add(new T.BoxGeometry(width, 0.002, length), dark, cx, -depth, cs); // floor
    for (const [w, d, x, s] of [[width, wall, cx, s0 + wall / 2], [width, wall, cx, s1 - wall / 2], [wall, length, x0 + wall / 2, cs], [wall, length, x1 - wall / 2, cs]]) add(new T.BoxGeometry(w, depth, d), dark, x, -depth / 2, s); // walls
    for (const [w, d, x, s] of [[width + 2 * rim, rim, cx, s0 - rim / 2], [width + 2 * rim, rim, cx, s1 + rim / 2], [rim, length, x0 - rim / 2, cs], [rim, length, x1 + rim / 2, cs]]) add(new T.BoxGeometry(w, 0.003, d), metal, x, top - 0.0015, s); // rim, flush with the felt
    // chips lying on edge in tubes that run toward the players; their tops end just under felt level
    const pitch = (width - 2 * wall) / tubes, radius = pitch / 2 - 0.0025, room = length - 2 * wall - 0.004; let seed = 5; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < tubes; i++) { const x = x0 + wall + pitch * (i + 0.5), fill = i % 5 === 3 ? 0.55 + random() * 0.25 : 0.86 + random() * 0.14, chips = Math.max(4, Math.round(room * fill / (CHIP_MM / 1000))), stack = chips * CHIP_MM / 1000;
      const material = keep(lit(new T.MeshStandardMaterial({map: keep(chipTexture(COLOURS[i % COLOURS.length], chips)), roughness: 0.55, metalness: 0})));
      add(new T.CylinderGeometry(radius, radius, stack, 28, 1).rotateX(Math.PI / 2), material, x, -radius - 0.002, s1 - wall - 0.002 - stack / 2); // stacked from the players' end
      if (i) add(new T.BoxGeometry(0.0018, radius + 0.004, length - 2 * wall), dark, x0 + wall + pitch * i, -depth + (radius + 0.004) / 2, cs); } // divider between tubes
  }
  return {group, build};
}
