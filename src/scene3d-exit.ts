// The dealer leaves the table: how the view follows a whole-body exit film. A trial of the scene lab (panel Film, "Prov:
// dealern lämnar bordet"), played with the film agent's first full-resolution take (not a main take: its movement stutters)
// until a film is approved into the clip bank.
//
// The film begins in the rest pose with her hands on the table and is drawn in the usual layers until they have left it
// (behindFrom); from there it stands behind the 3D table while the camera backs away along its line of sight as she rises,
// until she and the whole table are in the picture; she walks out of it and her legs show beside the table's end. (First tried in the game with the camera in its place, tilting up and turning after her: Jakob found looking up
// at her not pretty, and the turn showed where the film's own frame ends, which cut her.)
import {solveCamera, type FilmCamera} from './scene3d-geometry.ts';

// One film in two parts (the lab follows the second with its camera): the bank's exit take, 2088 pixels wide so that she has room
// to walk. The frame is the one in the film's record (motions/pamela-table-leave-wide-01.json); the first three frames are left out.
const WIDE = {path: 'assets/motions/pamela-table-leave-wide-01/source.mp4', frame: {scale: 0.5, anchor: [1044, 656] as [number, number], size: [2088, 1174] as [number, number], layer: 'BEHIND_TABLE' as const, shadow: false, behindFrom: 54}};
export const EXIT_TRIAL = {lead: {...WIDE, start: 3, end: 38}, probe: {...WIDE, start: 38, end: 212}};
// rise: the film's frames in which she stands up, for a film whose record does not say (motion.frame.rise). When she stands the camera has moved back along its line of sight by
// `back` of its distance to the table's dealer-side edge and `lift` upward (scene units), and the view has this tilt and zoom.
export const EXIT_VIEW = {rise: [38, 64], back: 0.75, lift: 0.05, pitch: -5.5, zoom: 0.9};

export type ExitView = {yaw: number; pitch: number; zoom: number; dy: number; dz: number};
/**
 * The view at a frame of the exit film. `from` is the view she is seen in before she rises (tilt in degrees, zoom); the
 * camera then backs away along that view's own line of sight, so nothing in the picture slides sideways. `rise`: the frames
 * in which she stands up in this film (its record's motion.frame.rise).
 */
export function exitView(frame: number, camera: FilmCamera, from: {pitch: number; zoom: number}, rise: readonly number[] = EXIT_VIEW.rise): ExitView {
  const [a, b] = rise, t = Math.min(1, Math.max(0, (frame - a) / (b - a))), risen = t * t * (3 - 2 * t);
  const solved = solveCamera(camera), slope = solved.pitch - from.pitch * Math.PI / 180, reach = EXIT_VIEW.back * solved.edgeDistance * risen; // slope: radians below the horizontal
  return {yaw: 0, pitch: from.pitch + (EXIT_VIEW.pitch - from.pitch) * risen, zoom: from.zoom + (EXIT_VIEW.zoom - from.zoom) * risen, dz: reach * Math.cos(slope), dy: reach * Math.sin(slope) + EXIT_VIEW.lift * risen};
}
