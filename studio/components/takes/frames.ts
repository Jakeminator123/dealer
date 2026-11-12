// Stills drawn from a take's film: a <video preload="metadata"> is seeked to one frame, the frame is drawn to a canvas and
// kept as a small JPEG (an object URL), and the video is let go at once. At most three videos load at a time, the rest
// wait their turn; a still is made once per film, frame and width and then shared by every thumbnail that asks for it.
import { labUrl } from "../../lib/lab.ts";

const MAX_AT_ONCE = 3;
let running = 0;
const waiting: (() => void)[] = [];
const stills = new Map<string, Promise<string>>();

function turn(): Promise<() => void> {
  return new Promise((resolve) => {
    const go = () => {
      running++;
      let done = false;
      resolve(() => {
        if (done) return;
        done = true;
        running--;
        waiting.shift()?.();
      });
    };
    if (running < MAX_AT_ONCE) go();
    else waiting.push(go);
  });
}

function once(video: HTMLVideoElement, name: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("Filmen svarade inte i tid.")), ms);
    const ok = () => finish();
    const bad = () => finish(new Error("Filmen kunde inte läsas."));
    function finish(error?: Error) {
      window.clearTimeout(timer);
      video.removeEventListener(name, ok);
      video.removeEventListener("error", bad);
      if (error) reject(error);
      else resolve();
    }
    video.addEventListener(name, ok);
    video.addEventListener("error", bad);
  });
}

/** The time to seek to for a frame, as the lab does it (src/lab-ui.ts frameTime): just past the frame's start. */
export const frameTime = (frame: number, fps: number) => (frame + 0.001) / fps;

/** Widths stills are made in, so thumbnails of nearly the same size share one. */
export const stillWidth = (cssWidth: number) => {
  const want = cssWidth * (typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1));
  return [240, 360, 480, 640, 960].find((w) => w >= want) ?? 960;
};

async function draw(path: string, frame: number, fps: number, width: number): Promise<string> {
  const release = await turn();
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = labUrl(path);
    await once(video, "loadedmetadata", 15000);
    const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.01) : Infinity;
    video.currentTime = Math.min(frameTime(Math.max(0, frame), fps), end);
    await once(video, "seeked", 15000);
    const height = Math.max(1, Math.round((width * (video.videoHeight || 2)) / (video.videoWidth || 3)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new Error("Rutan kunde inte ritas.");
    return URL.createObjectURL(blob);
  } finally {
    video.removeAttribute("src");
    video.load();
    release();
  }
}

/** A still of one frame of a film (path as the bank gives it, "assets/motions/…/source.mp4"), as an image address. */
export function frameStill(path: string, frame: number, fps: number, width: number): Promise<string> {
  const key = `${path}#${Math.round(frame)}@${width}`;
  let still = stills.get(key);
  if (!still) {
    still = draw(path, Math.round(frame), fps, width);
    stills.set(key, still);
    still.catch(() => stills.delete(key));
  }
  return still;
}
