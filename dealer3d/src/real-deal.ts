// A real dealer's two-hand deal as numbers: the first round of eight cards (seats S1 to S7, then her own), read frame by
// frame off a film of a real table by the session MODEL on 2026-11-18 (the reading, its sheets and its uncertainties are
// in that lane's folder on the scratch disk, yt-referens/ut/giv-fran-2-3.md; the film is someone else's and only these
// numbers leave it). S1 is the seat at the dealer's left, by the shoe, where she deals first: the plan's seat 7.
//
// Seconds from the moment her left fingers lie on the first card in the shoe:
//   a  her left fingers lie on the card in the shoe's window     b  the card begins to move out
//   c  it is out, flat on the felt under her left fingers        d  her right hand takes it (the hand change begins)
//   e  the card stands on edge between the two hands             l  her left hand lets go
//   f  the face shows                                             g  the card meets the felt
//   h  it lies still                                              i  her right hand lets go of it
// (read by eye on enlarged frames at 60 a second, within a frame or two; g agrees with the measured tempo within a frame).
// take, go: where her right fingers reach the card and where her left hand lets go of the standing card (its lower edge),
// metres on the felt as steps from the near corner of the shoe's mouth: [toward the dealer's left, toward the players].
// They are the reading's points laid on the felt as if 2 cm over it (the lower edge may be 0 to 2 cm up; the reading
// gives both), within about 2 cm.
export type RealCard = {place: string; a: number; b: number; c: number; d: number; e: number; l: number; f: number; g: number; h: number; i: number; take: [number, number]; go: [number, number]};
export const REAL_DEAL: RealCard[] = [
  {place: 'S1', a: 0, b: 0.233, c: 0.367, d: 0.383, e: 0.483, l: 0.533, f: 0.7, g: 0.783, h: 0.867, i: 1.033, take: [-0.132, -0.014], go: [-0.158, -0.007]},
  {place: 'S2', a: 0.683, b: 0.983, c: 1.117, d: 1.117, e: 1.283, l: 1.317, f: 1.45, g: 1.533, h: 1.583, i: 1.783, take: [-0.073, 0.029], go: [-0.157, 0.008]},
  {place: 'S3', a: 1.433, b: 1.733, c: 1.867, d: 1.9, e: 2.033, l: 2.067, f: 2.233, g: 2.317, h: 2.367, i: 2.567, take: [-0.129, 0.022], go: [-0.189, 0]},
  {place: 'S4', a: 2.267, b: 2.517, c: 2.667, d: 2.717, e: 2.817, l: 2.85, f: 2.983, g: 3.067, h: 3.1, i: 3.317, take: [-0.169, 0.015], go: [-0.209, 0.018]},
  {place: 'S5', a: 3.05, b: 3.267, c: 3.4, d: 3.483, e: 3.567, l: 3.6, f: 3.733, g: 3.833, h: 3.9, i: 4.067, take: [-0.233, -0.007], go: [-0.241, 0.022]},
  {place: 'S6', a: 3.8, b: 4, c: 4.15, d: 4.25, e: 4.35, l: 4.367, f: 4.517, g: 4.583, h: 4.65, i: 4.833, take: [-0.272, -0.007], go: [-0.286, 0.05]},
  {place: 'S7', a: 4.583, b: 4.767, c: 4.9, d: 5.017, e: 5.1, l: 5.117, f: 5.233, g: 5.35, h: 5.417, i: 5.6, take: [-0.302, -0.033], go: [-0.31, 0.032]},
  {place: 'D', a: 5.383, b: 5.567, c: 5.667, d: 5.817, e: 5.9, l: 5.9, f: 5.983, g: 6.017, h: 6.033, i: 6.067, take: [-0.303, -0.022], go: [-0.292, 0]},
];
