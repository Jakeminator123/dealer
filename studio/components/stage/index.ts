// Playback. <Stage> plays a round's parts (lib/parts.ts) in the 3D scene or as plain films ("Inte 3D") with one transport,
// and hands its scene out (onScene) to a view that changes it; <SceneCanvas> is the lab's 3D scene in React on its own
// (free of rounds); <FlatStage> the two stacked videos of "Inte 3D"; <PictureBox> the picture's rectangle, for what lies
// over it. createClock/useClock: where the stage is, for a strip or a read-out beside it.
export { Stage, type StageHandle, type StageMode } from "./Stage";
export { SceneCanvas, type Scene, type SceneState } from "./SceneCanvas";
export { FlatStage, PictureBox } from "./FlatStage";
export { Transport } from "./Transport";
export { createClock, useClock, type Clock, type ClockState } from "./clock.ts";
export type { Engine, Seen } from "./engines.ts";
