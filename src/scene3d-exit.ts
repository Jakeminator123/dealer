// The dealer leaves the table: how the view follows a whole-body exit film. A trial of the scene lab (panel Film, "Prov:
// dealern lämnar bordet"), played with the film agent's low-resolution probe until a real film exists in the clip bank.
//
// The hands leave the table in a film of the standard frame, then the whole-body film takes over behind the 3D table while
// the camera backs away along its line of sight as she rises, until she and the whole table are in the picture; she walks
// out of it. (First tried in the game with the camera in its place, tilting up and turning after her: Jakob found looking up
// at her not pretty, and the turn showed where the film's own frame ends, which cut her.)
import {solveCamera, type FilmCamera} from './scene3d-geometry.ts';

export const EXIT_TRIAL = {
  lead: {path: 'assets/motions/pamela-table-leave-02/source.mp4', start: 3, end: 30},
  probe: {path: 'assets/proofs/helkropp-prov/prov-lag-upplosning-uppskalad.mp4', start: 0, end: 177, frame: {scale: 0.5, anchor: [882, 656] as [number, number], layer: 'BEHIND_TABLE' as const, shadow: false}},
};
// rise: the probe's film frames in which she stands up. When she stands the camera has moved back along its line of sight by
// `back` of its distance to the table's dealer-side edge and `lift` upward (scene units), and the view has this tilt and zoom.
export const EXIT_VIEW = {rise: [8, 34], back: 0.75, lift: 0.05, pitch: -5.5, zoom: 0.9};

export type ExitView = {yaw: number; pitch: number; zoom: number; dy: number; dz: number};
/**
 * The view at a frame of the exit film. `from` is the view she is seen in before she rises (tilt in degrees, zoom); the
 * camera then backs away along that view's own line of sight, so nothing in the picture slides sideways.
 */
export function exitView(frame: number, camera: FilmCamera, from: {pitch: number; zoom: number}): ExitView {
  const [a, b] = EXIT_VIEW.rise, t = Math.min(1, Math.max(0, (frame - a) / (b - a))), risen = t * t * (3 - 2 * t);
  const solved = solveCamera(camera), slope = solved.pitch - from.pitch * Math.PI / 180, reach = EXIT_VIEW.back * solved.edgeDistance * risen; // slope: radians below the horizontal
  return {yaw: 0, pitch: from.pitch + (EXIT_VIEW.pitch - from.pitch) * risen, zoom: from.zoom + (EXIT_VIEW.zoom - from.zoom) * risen, dz: reach * Math.cos(slope), dy: reach * Math.sin(slope) + EXIT_VIEW.lift * risen};
}
