// Playback. <Stage> plays a round's parts (lib/parts.ts) in the 3D scene or as plain films ("Inte 3D") with one transport;
// <SceneCanvas> is the lab's 3D scene in React on its own (free of rounds: for any view that shows the scene);
// <FlatStage> the two stacked videos of "Inte 3D"; <PictureBox> the picture's rectangle, for what lies over it.
// createClock/useClock: where the stage is, for a strip or a read-out beside it.
export { Stage, LEVANDE, type StageHandle, type StageMode, type SceneLook } from "./Stage";
export { SceneCanvas, type Scene, type SceneState } from "./SceneCanvas";
export { FlatStage, PictureBox } from "./FlatStage";
export { Transport } from "./Transport";
export { createClock, useClock, type Clock, type ClockState } from "./clock.ts";
export type { Engine, Seen } from "./engines.ts";
