// The model lab's whole picture: the dealer's film behind a table model, seen from the game's camera, for judging a look
// with a dealer in it. A side track (props.html): the game does not use this file.
//
// The film is the scene's own film layer (src/scene3d-film.ts) on one upright plane behind the table's dealer-side edge,
// tested against the model's depth, so the model hides what stands behind it. The film's own shoe is not drawn: the table
// model has one. Seen from the film camera's place the film is exact; the further
// the view is turned around the table, the more she is the flat picture she is.
import * as T from 'three';
import {FILM, cameraFromContract, solveCamera, viewFovDeg, type FilmCamera} from './scene3d-geometry.ts';
import {createFilmLayers, createPlayers, FRAME_FIX} from './scene3d-film.ts';
import {createFanLight} from './scene3d-light.ts';
import {TABLE} from './scene3d-table.ts';

/** Where a table model has its felt, in the model's own metres: the felt's height, the z of its dealer-side edge (the players sit toward +z) and half the felt's width. Written per model in data/props.json as `stage`. */
export type StageFit = {feltY: number; edgeZ: number; halfWidth: number};
export function stageFit(value: unknown): StageFit | null {
  const v = value as Partial<StageFit> | null, ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return v && ok(v.feltY) && ok(v.edgeZ) && ok(v.halfWidth) && v.halfWidth > 0 ? {feltY: v.feltY, edgeZ: v.edgeZ, halfWidth: v.halfWidth} : null;
}
// pitch and zoom: the game page's lying framing. back: how far behind the edge the film's plane stands, dealer metres (behind
// the model's own rim). shoe: the film's shoe as a box of film pixels (x0, y0, x1, y1), with room for its shadow.
export const STAGE_VIEW = {pitch: -8, zoom: 0.84, back: 0.06, film: 'assets/motions/pamela-idle-loop-01/source.mp4', room: 'assets/scene/panorama-vegas.jpg', shoe: [1125, 560, FILM.width, 960]};

/**
 * The film's world laid on a table model: one scale and one move (a column-major 4 × 4). The film's felt (y = 0) comes to
 * the model's felt, the middle of the film's dealer-side edge to the middle of the model's, and the film table's width to
 * the model's felt width. eye: where the film camera then stands, in the model's metres.
 */
export function stagePlacement(camera: FilmCamera, fit: StageFit): {scale: number; matrix: number[]; eye: number[]} {
  const scale = fit.halfWidth / (TABLE.a * camera.scale), z = fit.edgeZ + solveCamera(camera).edgeDistance * scale; // the film's edge lies at z = -edgeDistance
  return {scale, matrix: [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, fit.feltY, z, 1], eye: [0, fit.feltY + camera.heightM * scale, z]};
}

export function createStage(contract: Parameters<typeof cameraFromContract>[0]) {
  const camera = cameraFromContract(contract), solved = solveCamera(camera), edge = -solved.edgeDistance;
  const filmCam = new T.PerspectiveCamera(solved.fovYDeg, FILM.width / FILM.height, 0.05, 200);
  filmCam.position.set(0, camera.heightM, 0); filmCam.rotation.set(-solved.pitch, 0, 0, 'YXZ'); filmCam.updateProjectionMatrix(); filmCam.updateMatrixWorld(true);
  const own = new T.Matrix4().multiplyMatrices(filmCam.projectionMatrix, filmCam.matrixWorldInverse), filmVP = new T.Matrix4(), back = new T.Matrix4();
  const film = createFilmLayers(filmVP, createFanLight().uniforms), group = new T.Group(); group.add(film.body, film.table); group.matrixAutoUpdate = false;
  const players = createPlayers(texture => film.setTexture(texture), () => {});
  film.setKey({lo: 0.12, hi: 0.9, shadow: 1}); film.setHide(STAGE_VIEW.shoe);
  film.setFrame({scale: 1, anchor: [FRAME_FIX.x, FRAME_FIX.y], layer: 'BEHIND_TABLE', shadow: false, back: STAGE_VIEW.back}); film.place(edge, true, false, camera.scale);
  let playing = false;
  return {
    group, // goes into the model, beside its meshes: its matrix is in the model's metres
    place(fit: StageFit) { group.matrix.fromArray(stagePlacement(camera, fit).matrix); group.matrixWorldNeedsUpdate = true; },
    /** The film camera follows the model wherever the lab has put it; called before every drawn frame. */
    update() { group.updateWorldMatrix(true, false); filmVP.multiplyMatrices(own, back.copy(group.matrixWorld).invert()); },
    play() { if (playing) players.toggle(false); else { playing = true; players.play([{path: STAGE_VIEW.film}], {loop: true}); } },
    pause() { if (playing) players.toggle(true); },
    /** Where the film camera stands and what it looks at in the lab's world, tilted and zoomed as the game page does it. */
    pose(aspect: number) {
      group.updateWorldMatrix(true, false);
      const eye = new T.Vector3(0, camera.heightM, 0).applyMatrix4(group.matrixWorld), tilt = solved.pitch - STAGE_VIEW.pitch * Math.PI / 180;
      const reach = Math.hypot(camera.heightM - 0.3 * camera.scale, edge) * group.matrixWorld.getMaxScaleOnAxis(); // to her chest
      return {eye, target: eye.clone().addScaledVector(new T.Vector3(0, -Math.sin(tilt), -Math.cos(tilt)).transformDirection(group.matrixWorld), reach), reach, fov: viewFovDeg(camera, aspect, STAGE_VIEW.zoom)};
    },
  };
}
