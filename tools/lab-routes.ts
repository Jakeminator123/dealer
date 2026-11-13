// The lab server's addresses and the files behind them: which page of the old lab (old-lab/) or the game (game/page/) is
// handed out at which root address, which TypeScript file in src/ (or materials/) as which browser module, which three.js
// files under /vendor/, and how a module is made ready for the browser. tools/preview.ts serves these;
// tools/build-studio-snapshot.ts freezes the same modules for the studio's online copy and tools/build-public.ts reads the
// pages from here. The snapshot build checks every module it takes against the running server's own answer byte for byte.
import {stripTypeScriptTypes} from 'node:module';

/**
 * The studio is the lab's shell (Jakob 2026-11-13: "vi har ju bytt skalet till det mer moderna"): "/" and the old lab's
 * first page lead to the studio view that replaced the tab asked for, with what was chosen carried over. The old lab itself
 * is reached only on purpose, with ?gamla=1 (the studio's own link "Gamla labbet"); it keeps that word while its tabs are
 * used. Returns the address to send the browser to, or null when the page itself is to be served.
 */
export function studioAddress(pathname: string, params: URLSearchParams): string | null {
  if (pathname !== '/' && pathname !== '/lab.html') return null;
  if (params.get('gamla') === '1') return null;
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
// (src="preview-ui.js", href="game.css", fetch('data/…'), ../preview.html in the material pages) resolves as before.
// "/" is the old lab's first page (tools/preview.ts). tools/pages.test.ts checks this map against the folders.
export const PAGES: Record<string, string> = {...Object.fromEntries(['lab.html', 'lab.css', 'scene3d.html', 'props.html', 'props.css', 'sound.html', 'sound.css', 'preview.html', 'generation.html'].map(name => [`/${name}`, `old-lab/${name}`])),
  '/game.html': 'game/page/game.html', '/game.css': 'game/page/game.css'};

export const SCRIPTS: Record<string, string> = {'/preview-ui.js': 'src/preview-ui.ts', '/lab-ui.js': 'src/lab-ui.ts', '/placement-model.js': 'src/placement-model.ts', '/clip-graph.js': 'src/clip-graph.ts', '/card-track.js': 'src/card-track.ts', '/card-overlay.js': 'src/card-overlay.ts', '/card-overlay-view.js': 'src/card-overlay-view.ts', '/scene-geometry.js': 'src/scene-geometry.ts', ...Object.fromEntries(['geometry', 'film', 'light', 'table', 'rail', 'props', 'cards', 'deal', 'matte', 'room', 'hall', 'exit', 'cardlab', 'shift', 'smoke', 'view', 'ui'].map(name => [`/scene3d-${name}.js`, `src/scene3d-${name}.ts`])), ...Object.fromEntries(['page', 'overlay', 'view', 'film', 'director', 'table', 'chat', 'panel', 'look'].map(name => [`/game-${name}.js`, `src/game-${name}.ts`])), '/game3d-chips.js': 'src/game3d-chips.ts', '/game3d-props.js': 'src/game3d-props.ts', '/game3d-tray.js': 'src/game3d-tray.ts', '/props-lab.js': 'src/props-lab.ts', '/props-stage.js': 'src/props-stage.ts', '/lab-sound.js': 'src/lab-sound.ts', '/speech-lines.js': 'src/speech-lines.ts', '/scene3d-mouth.js': 'src/scene3d-mouth.ts', '/speech-patch.js': 'src/speech-patch.ts', '/materials/source/src/card-material-study.js': 'materials/source/src/card-material-study.ts', '/materials/source/src/chip-material-study.js': 'materials/source/src/chip-material-study.ts'};

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
  ...['wood_table-diffuse', 'wood_table-nor_gl', 'wood_table-rough', 'brown_leather-nor_gl', 'brown_leather-rough', 'denim_fabric-nor_gl', 'denim_fabric-rough', 'runway_felt-diffuse', 'runway_leather-diffuse', 'runway_felt_2-diffuse', 'runway_felt_3-diffuse', 'runway_leather_2-diffuse'].map(name => `assets/scene/materials/${name}.webp`)];
