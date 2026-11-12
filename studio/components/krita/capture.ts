// Three ways to get a picture for the pen.
// - "Ta bild av vyn": a view with the 3D scene gives the scene's own canvas (the scene keeps its drawing buffer, so
//   toBlob reads the frame on screen). Any other view is drawn from its HTML with html-to-image: it copies each element's
//   computed style into an SVG and lets the browser draw it, so Tailwind 4's oklch/color-mix colours come out as the
//   browser shows them; a <video> is drawn from the frame on screen at that moment (no reload), a <canvas> from its
//   pixels. The bot's panel, toasts and tooltips are left out, and the picture is cut to the view's area.
// - "Hela fliken": the browser's own screen capture (getDisplayMedia), one frame, then the capture is stopped.
// - A file: pasted, dropped or chosen.
// Each gives a Blob for createImageBitmap.

/** Elements the view's picture leaves out: the panel and its button carry data-capture="skip". */
function skip(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node instanceof HTMLScriptElement || node.tagName === "NOSCRIPT" || node.tagName === "TEMPLATE") return true;
  if (node instanceof HTMLElement && node.dataset.capture === "skip") return true;
  // The panel as the kit's Sheet (below 1200 px): the dialog that holds it.
  if (node.getAttribute("role") === "dialog" && node.querySelector("[data-bot-panel]")) return true;
  return node.hasAttribute("data-radix-popper-content-wrapper") || node.getAttribute("aria-live") === "polite";
}

const visible = (el: Element) => {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
  return check ? check.call(el, { opacityProperty: true, visibilityProperty: true }) : true;
};

/** The view's 3D scene: the largest visible canvas that covers at least a fifth of the view, or null. */
export function sceneCanvas(content: Element | null): HTMLCanvasElement | null {
  if (!content) return null;
  const area = content.clientWidth * content.clientHeight;
  let best: HTMLCanvasElement | null = null;
  let bestArea = 0;
  for (const canvas of content.querySelectorAll("canvas")) {
    if (!visible(canvas)) continue;
    const rect = canvas.getBoundingClientRect();
    if (rect.width * rect.height > bestArea) {
      best = canvas;
      bestArea = rect.width * rect.height;
    }
  }
  return best && bestArea >= area * 0.2 ? best : null;
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((done, fail) => canvas.toBlob((blob) => (blob ? done(blob) : fail(new Error("Bilden blev tom."))), "image/png"));

export type Taken = { blob: Blob; how: "scen" | "vy" | "flik" | "fil" };

/** The view on screen (the area right of the rail), without the bot's panel. */
export async function captureView(): Promise<Taken> {
  const content = document.getElementById("innehall");
  if (!content) throw new Error("Vyn hittades inte.");
  const scene = sceneCanvas(content);
  if (scene) return { blob: await toBlob(scene), how: "scen" };
  const { toCanvas } = await import("html-to-image");
  const rect = content.getBoundingClientRect();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const whole = await toCanvas(document.body, {
    width,
    height,
    pixelRatio: 1,
    skipFonts: true,
    backgroundColor: "#0b0f0d",
    filter: (node) => !skip(node),
  });
  const out = document.createElement("canvas");
  out.width = Math.round(rect.width);
  out.height = Math.round(rect.height);
  out.getContext("2d")!.drawImage(whole, rect.left, rect.top, rect.width, rect.height, 0, 0, out.width, out.height);
  return { blob: await toBlob(out), how: "vy" };
}

/** Whether the browser can capture a tab (not on phones, not in every browser). */
export const canCaptureTab = () => typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function";

/** One frame of what the person picks in the browser's own dialog (this tab is offered first). */
export async function captureTab(): Promise<Taken> {
  const options = { video: { displaySurface: "browser", frameRate: 5 }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude" };
  const stream = await navigator.mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // The browser's own bar about sharing slides in; one moment lets the frame settle.
    await new Promise((done) => setTimeout(done, 350));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    video.srcObject = null;
    return { blob: await toBlob(canvas), how: "flik" };
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

const RASTER = /^image\/(png|jpeg|webp|gif|bmp|avif)$/;
export const MAX_FILE = 25 * 1024 * 1024;

/** A picture file that the pen can open, or a sentence on why not. */
export function checkFile(file: File | null | undefined): string | null {
  if (!file) return "Ingen bild.";
  if (!RASTER.test(file.type)) return "Det där är ingen bild (png, jpg eller webp går bra).";
  if (file.size > MAX_FILE) return "Bilden är större än 25 MB.";
  return null;
}

/** The first picture among pasted or dropped items, or null. */
export function pictureIn(items: DataTransferItemList | null | undefined, files?: FileList | null): File | null {
  for (const item of Array.from(items ?? [])) {
    if (item.kind === "file" && RASTER.test(item.type)) return item.getAsFile();
  }
  for (const file of Array.from(files ?? [])) if (RASTER.test(file.type)) return file;
  return null;
}
