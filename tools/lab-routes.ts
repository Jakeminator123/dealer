// The lab server's addresses and the files behind them: which page (pages/: the 3D page, Modeller and Ljud; game/page/: the
// game) is handed out at which root address, which TypeScript file in src/ (or materials/) as which browser module, which
// three.js files under /vendor/, and how a module is made ready for the browser. tools/preview.ts serves these;
// tools/build-studio-snapshot.ts freezes the same modules for the studio's online copy. The snapshot build checks every
// module it takes against the running server's own answer byte for byte.
import {stripTypeScriptTypes} from 'node:module';

/**
 * The studio is the lab (Jakob 2026-11-13: "vi har ju bytt skalet till det mer moderna"): "/" and /lab.html, the address
 * of the first lab page, lead to the studio view that does what the tab asked for did, with what was chosen carried over,
 * so that old links and bookmarks still work (also /lab.html?gamla=1). Returns the address to send the browser to, or null
 * when the address is not one of these two.
 */
export function studioAddress(pathname: string, params: URLSearchParams): string | null {
  if (pathname !== '/' && pathname !== '/lab.html') return null;
  const out = new URLSearchParams(), dealer = params.get('dealer');
  if (dealer && /^[a-z0-9]+$/.test(dealer)) out.set('dealer', dealer);
  const tab = params.get('tab');
  let view = '';
  if (tab === 'prov') { view = 'prov/'; const proof = params.get('proof'), file = params.get('file'); if (proof) out.set('prov', proof); if (proof && file) out.set('fil', file); }
  else if (tab === 'granska') { view = 'granska/'; const take = params.get('take'); if (take) out.set('tagning', take); }
  else if (tab === 'klippbank') view = 'karta/';
  else if (tab === 'placering') view = 'placering/';
  const query = out.toString();
  return `/studio/${view}${query ? `?${query}` : ''}`;
}

// The pages keep their root addresses although their files lie in folders, so that every relative reference inside them
// (src="preview-ui.js", href="game.css", fetch('data/…')) resolves as before.
export const PAGES: Record<string, string> = {...Object.fromEntries(['scene3d.html', 'props.html', 'props.css', 'sound.html', 'sound.css', 'vinklar.html'].map(name => [`/${name}`, `pages/${name}`])),
  '/game.html': 'game/page/game.html', '/game.css': 'game/page/game.css'};

export const SCRIPTS: Record<string, string> = {'/interaction-diagnostics.js': 'src/interaction-diagnostics.ts', '/preview-ui.js': 'src/preview-ui.ts', '/placement-model.js': 'src/placement-model.ts', '/table-lens.js': 'src/table-lens.ts', '/card-plan.js': 'src/card-plan.ts', '/clip-graph.js': 'src/clip-graph.ts', '/dealer-trees.js': 'src/dealer-trees.ts', '/card-track.js': 'src/card-track.ts', '/card-overlay.js': 'src/card-overlay.ts', '/card-overlay-view.js': 'src/card-overlay-view.ts', '/scene-geometry.js': 'src/scene-geometry.ts', ...Object.fromEntries(['geometry', 'film', 'light', 'table', 'rail', 'props', 'cards', 'deal', 'matte', 'room', 'hall', 'exit', 'shift', 'smoke', 'bord02', 'view', 'ui'].map(name => [`/scene3d-${name}.js`, `src/scene3d-${name}.ts`])), ...Object.fromEntries(['page', 'overlay', 'view', 'film', 'director', 'table', 'chat', 'panel', 'look', 'intro', 'diagnosis'].map(name => [`/game-${name}.js`, `src/game-${name}.ts`])), '/game3d-chips.js': 'src/game3d-chips.ts', '/game3d-props.js': 'src/game3d-props.ts', '/game3d-tray.js': 'src/game3d-tray.ts', '/props-lab.js': 'src/props-lab.ts', '/props-stage.js': 'src/props-stage.ts', '/sound.js': 'src/sound.ts', '/speech-lines.js': 'src/speech-lines.ts', '/scene3d-mouth.js': 'src/scene3d-mouth.ts', '/page-audio.js': 'src/page-audio.ts', '/scene3d-voice.js': 'src/scene3d-voice.ts', '/speech-patch.js': 'src/speech-patch.ts', '/angle-plan.js': 'src/angle-plan.ts', '/angle-lab.js': 'src/angle-lab.ts', '/materials/source/src/card-material-study.js': 'materials/source/src/card-material-study.ts', '/materials/source/src/chip-material-study.js': 'materials/source/src/chip-material-study.ts'};

// three.js for the 3D scene: the module build's two files, the GLB reader with its one helper, and the model lab's controls.
export const VENDOR: Record<string, string> = {'/vendor/three.module.js': 'node_modules/three/build/three.module.js', '/vendor/three.core.js': 'node_modules/three/build/three.core.js',
  '/vendor/loaders/GLTFLoader.js': 'node_modules/three/examples/jsm/loaders/GLTFLoader.js', '/vendor/utils/BufferGeometryUtils.js': 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',
  '/vendor/controls/OrbitControls.js': 'node_modules/three/examples/jsm/controls/OrbitControls.js', '/vendor/environments/RoomEnvironment.js': 'node_modules/three/examples/jsm/environments/RoomEnvironment.js'};

/** Modules that are also run by Node name their neighbours with .ts; the browser asks for the same file as .js. */
export const forBrowser = (source: string) => stripTypeScriptTypes(source).replace(/((?:from|import)\s*\(?\s*)(['"])([^'"\n]+)\.ts\2/g, '$1$2$3.js$2');

/**
 * The 3D scene's own files, as the lab server allows them by name (tools/preview.ts `allowed`): the scene contract and
 * room register, the room plate and the three built-in panoramas, the table's material maps and the room menu's pictures.
 * Rooms of the register (assets/scene/rooms/*.jpg) and table props (assets/props/*.glb) are named by the register and the
 * modules and are added by the snapshot build from them.
 */
export const SCENE_FILES: readonly string[] = ['data/scene-contract.json', 'data/scene-rooms.json', 'assets/scene/room.png', 'assets/scene/panorama-vegas.jpg', 'assets/scene/panorama-la.jpg', 'assets/scene/panorama-skog.jpg',
  ...['room-panorama', 'room-la', 'room-skog', 'room-hall', 'room-salong', 'dealer-pamela'].map(name => `assets/scene/thumbs/${name}.jpg`),
  ...['wood_table-diffuse', 'wood_table-nor_gl', 'wood_table-rough', 'runway_felt-diffuse', 'runway_leather-diffuse', 'runway_felt_2-diffuse', 'runway_felt_3-diffuse', 'runway_leather_2-diffuse'].map(name => `assets/scene/materials/${name}.webp`),
  // the seven scans of table BORD-02 (src/scene3d-bord02.ts BORD02_SCANS), three maps each; the standard table and the props
  // read the leather's and the denim's relief from the same files
  ...['scuba_suede', 'brown_leather', 'walnut_veneer', 'grass_ground', 'coated_pine', 'leather_red_02', 'denim_fabric'].flatMap(scan => ['diffuse', 'nor_gl', 'rough'].map(kind => `assets/scene/materials/${scan}-${kind}.webp`))];
