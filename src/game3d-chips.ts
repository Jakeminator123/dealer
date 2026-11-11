// Chips on the table: the house chip in 3D, stacked in the bet rings, dropped with weight.
//
// The chip is the one from the chip material study (materials/source/src/chip-material-study.ts): its revolved surface
// with bevels and eight inlays, its print and its colours. Only the recipe is taken from there; the meshes are built with
// the scene's own three, so they can lie in the scene. The module is a prop of the 3D scene: {group, build(edgeZ, scale)},
// placed in dealer metres (x across the table, y above the felt, s from the dealer's edge toward the players), drawn under
// the film like the chip tray. It shows the chips it is told to show; what a bet is worth is the game's business.
import * as T from 'three';
import {CHIP, CHIP_COLOURS, CHIP_PRINT, createChipSurface, createChipPrint, type ChipColour, type ChipValue} from '../materials/source/src/chip-material-study.ts';

// A real chip: 39 mm across. The study's own proportions give its height, a little over 3 mm.
export const CHIP_RADIUS = 0.0195;
const UNIT = CHIP_RADIUS / CHIP.radius;
export const CHIP_HEIGHT = CHIP.thickness * UNIT;
// Which of the study's chips a value is. A value without a chip of its own is shown as the nearest one below it.
export const CHIP_LOOK: Record<number, {value: ChipValue; colour: ChipColour}> = {
  5: {value: '5', colour: 'red'}, 25: {value: '25', colour: 'green'}, 100: {value: '100', colour: 'black'}, 500: {value: '500', colour: 'purple'}, 1000: {value: '1000', colour: 'blue'},
};
export const lookOf = (value: number) => CHIP_LOOK[Object.keys(CHIP_LOOK).map(Number).filter(v => v <= value).sort((a, b) => b - a)[0] ?? 5];
export const STACK_LIMIT = 12; // chips drawn per ring; a taller stack shows its top twelve

// ── weight ──────────────────────────────────────────────────────────────────
// A chip is let go a hand's width above its place, falls, bounces a little lower each time and lies still. Metres and
// seconds, with real gravity: the fall takes about a tenth of a second, the whole thing under half a second.
export const DROP = {height: 0.06, gravity: 9.81, bounce: 0.38, still: 0.0006, stagger: 0.075, tilt: 0.3};
/** Height above its resting place and tilt (radians) of a chip let go t seconds ago. */
export function chipFall(t: number): {y: number; tilt: number; resting: boolean} {
  if (!(t > 0)) return {y: DROP.height, tilt: DROP.tilt * 0.4, resting: false};
  let since = t, flight = Math.sqrt(2 * DROP.height / DROP.gravity), speed = DROP.gravity * flight;
  if (since < flight) return {y: DROP.height - DROP.gravity * since * since / 2, tilt: DROP.tilt * 0.4 * (1 - since / flight), resting: false};
  since -= flight;
  const landed = since; // seconds since the first touch: the wobble dies out from there
  for (;;) {
    speed *= DROP.bounce; const peak = speed * speed / (2 * DROP.gravity);
    if (peak < DROP.still) return {y: 0, tilt: wobble(landed), resting: wobble(landed) === 0};
    flight = 2 * speed / DROP.gravity;
    if (since < flight) return {y: speed * since - DROP.gravity * since * since / 2, tilt: wobble(landed), resting: false};
    since -= flight;
  }
}
const wobble = (t: number) => { const size = DROP.tilt * Math.exp(-t * 11); return size < 0.004 ? 0 : size * Math.cos(t * 42); };

/** What changes when a ring's chips go from `before` to `after`: the chips that stay (the common start) and the new ones on top. */
export function stackChange(before: number[], after: number[]): {kept: number; added: number[]} {
  let kept = 0; while (kept < before.length && kept < after.length && before[kept] === after[kept]) kept++;
  return {kept, added: after.slice(kept)};
}
// A chip never lies exactly on the one below: a small, fixed turn and shift per place in the stack, the same every time.
export function chipRest(seat: number, index: number): {x: number; z: number; turn: number} {
  const n = Math.sin(seat * 12.9898 + index * 78.233) * 43758.5453, a = n - Math.floor(n), m = Math.sin(seat * 39.3468 + index * 11.135) * 24634.6345, b = m - Math.floor(m);
  return {x: (a - 0.5) * 0.0016, z: (b - 0.5) * 0.0016, turn: a * Math.PI * 2};
}

// ── the chip itself ─────────────────────────────────────────────────────────
function chipGeometry(): T.BufferGeometry {
  const data = createChipSurface(), geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(data.positions, 3)); geometry.setAttribute('uv', new T.BufferAttribute(data.uv, 2)); geometry.setIndex(new T.BufferAttribute(data.indices, 1));
  for (const g of data.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  geometry.rotateX(-Math.PI / 2); geometry.scale(UNIT, UNIT, UNIT); geometry.computeVertexNormals(); return geometry; // the study's chip stands on edge; here it lies
}
function printTexture(look: {value: ChipValue; colour: ChipColour}): T.CanvasTexture {
  const small = document.createElement('canvas'); small.width = small.height = 256; small.getContext('2d')!.drawImage(createChipPrint(look.value, look.colour), 0, 0, 256, 256);
  const texture = new T.CanvasTexture(small); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
function shadowTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const g = canvas.getContext('2d')!, fade = g.createRadialGradient(32, 32, 14, 32, 32, 32);
  fade.addColorStop(0, 'rgba(0,0,0,.55)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fade; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(canvas);
}

type Scene = {spots(): {bets: {id: string; x: number; s: number; radius: number}[]}; lit<M extends T.Material>(material: M): M};
type Chip = {mesh: T.Mesh; value: number; index: number; from: number}; // from: when it was let go, seconds; -Infinity = it lay there already

export function createChips(scene: Scene) {
  const group = new T.Group(), geometry = chipGeometry(), owned: {dispose(): void}[] = [geometry];
  const keep = <O extends {dispose(): void}>(o: O) => { owned.push(o); return o; };
  const looks = new Map<number, T.Material[]>();
  const materialsOf = (value: number): T.Material[] => {
    const look = lookOf(value), key = Number(look.value); let hit = looks.get(key);
    if (!hit) { const print = keep(printTexture(look)), face = () => keep(scene.lit(new T.MeshStandardMaterial({map: print, roughness: 0.5, metalness: 0})));
      hit = [face(), face(), keep(scene.lit(new T.MeshStandardMaterial({color: CHIP_COLOURS[look.colour].ink, roughness: 0.48, metalness: 0}))), keep(scene.lit(new T.MeshStandardMaterial({color: CHIP_PRINT.yellow, roughness: 0.48, metalness: 0})))]; looks.set(key, hit); }
    return hit;
  };
  const shade = keep(new T.MeshBasicMaterial({map: keep(shadowTexture()), transparent: true, depthWrite: false})), shadeGeometry = keep(new T.CircleGeometry(CHIP_RADIUS * 1.5, 24).rotateX(-Math.PI / 2));
  const rings = new Map<number, {x: number; s: number; chips: Chip[]; values: number[]; shadow: T.Mesh}>();
  let moving = false;

  function place(seat: number, chip: Chip, now: number) {
    const ring = rings.get(seat)!, rest = chipRest(seat, chip.index), fall = chip.from === -Infinity ? {y: 0, tilt: 0, resting: true} : chipFall(now - chip.from);
    chip.mesh.visible = now >= chip.from; // a chip waiting for its turn to drop is not there yet
    chip.mesh.position.set(ring.x + rest.x, (chip.index + 0.5) * CHIP_HEIGHT + fall.y, ring.s + rest.z);
    chip.mesh.rotation.set(fall.tilt, rest.turn, fall.tilt * 0.6);
    if (fall.resting) chip.from = -Infinity; else moving = true;
  }
  return {
    group,
    // The scene calls this again whenever its lens or scale changes: the rings are read anew and the chips stay.
    build(edgeZ: number, scale: number) {
      group.position.set(0, 0, edgeZ); group.scale.setScalar(scale);
      for (const spot of scene.spots().bets) { const seat = Number(spot.id.slice(1)), ring = rings.get(seat);
        if (ring) { ring.x = spot.x; ring.s = spot.s; } else { const shadow = new T.Mesh(shadeGeometry, shade); shadow.visible = false; shadow.renderOrder = -1; group.add(shadow); rings.set(seat, {x: spot.x, s: spot.s, chips: [], values: [], shadow}); } }
      for (const [seat, ring] of rings) { ring.shadow.position.set(ring.x, 0.0003, ring.s); for (const chip of ring.chips) place(seat, chip, Infinity); }
    },
    /** The chips in each ring, bottom first. Chips that were there stay; new ones drop one after the other; the rest are taken away. */
    set(bets: Record<number, number[]>, now: number) {
      for (const [seat, ring] of rings) {
        const all = bets[seat] ?? [], values = all.slice(-STACK_LIMIT), {kept, added} = stackChange(ring.values, values);
        for (const gone of ring.chips.splice(kept)) group.remove(gone.mesh);
        added.forEach((value, i) => { const mesh = new T.Mesh(geometry, materialsOf(value)), chip = {mesh, value, index: kept + i, from: now + i * DROP.stagger}; group.add(mesh); ring.chips.push(chip); place(seat, chip, now); });
        ring.values = values; ring.shadow.visible = values.length > 0;
      }
    },
    /** Moves the falling chips. True while any chip is still moving. */
    update(now: number) { if (!moving) return false; moving = false; for (const [seat, ring] of rings) for (const chip of ring.chips) if (chip.from !== -Infinity) place(seat, chip, now); return moving; },
    dispose() { for (const o of owned) o.dispose(); },
  };
}
