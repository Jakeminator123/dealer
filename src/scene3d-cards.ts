// Rendered cards in the 3D scene. The lab's card overlay (src/card-overlay-view.ts) already knows how to put the
// rendered card on a film frame: where it is, which side shows, the hand kept in front, the film's own card taken away
// and filled with the table colour around it. Here it draws the whole frame with that card into one canvas, and the
// scene uses the canvas instead of the video as the film. The key then removes the green as before, filled patch
// included, so the card lies on the scene's felt and takes part in focus and fan shadow like the rest of the film.
// Loaded only when rendered cards are switched on: the overlay brings its own card renderer.
import * as T from 'three';
import {createCardOverlay, RANKS, SUITS, type OverlayOptions} from './card-overlay-view.ts';
import {sceneOf, type CardTrack} from './card-overlay.ts';

export {RANKS, SUITS};
export type CardChoice = {rank: string; suit: string; scale: number};
export function createCardLayer(contract: unknown) {
  const canvas = document.createElement('canvas'), overlay = createCardOverlay(canvas), plan = sceneOf(contract);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.NoColorSpace; texture.minFilter = texture.magFilter = T.LinearFilter; texture.generateMipmaps = false;
  let drawn = ''; const ids = new WeakMap<object, number>(); let nextId = 0;
  const idOf = (o: object | null | undefined) => { if (!o) return 0; let id = ids.get(o); if (!id) ids.set(o, id = ++nextId); return id; };
  return {
    texture,
    // Draws the frame the video shows now, with the rendered card. False while there is no decoded frame to draw on.
    // A frame is drawn once: the canvas is kept until the film, the frame, the track or the card changes.
    // `extra`: overlay options of the part on screen (lying cards, a value per card), on top of the scene's own. It is
    // compared by identity, so a changed set of cards must come as a new object.
    update(video: HTMLVideoElement, frame: number, track: unknown, choice: CardChoice, extra?: Partial<OverlayOptions> | null): boolean {
      if (!video.videoWidth || video.readyState < 2) return false;
      const key = [video.currentSrc, frame, video.currentTime.toFixed(4), choice.rank, choice.suit, choice.scale, idOf(track as object | null), idOf(extra)].join('|'); if (key === drawn) return true;
      overlay.draw(video, frame, (track as CardTrack | null) ?? null, plan, {scale: choice.scale, split: true, card: {rank: choice.rank, suit: choice.suit} as OverlayOptions['card'], side: 'TRACK', bend: 0.07, gloss: 0.35, inFront: false, ...(extra ?? {})});
      drawn = key; texture.needsUpdate = true; return true;
    },
  };
}
