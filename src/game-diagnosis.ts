// What one browser does with the game, as text on the picture itself. ?diagnos=1 lays a small text over the stage: which browser
// it is, how large the picture is drawn, whether the picture's own surface (WebGL) has been lost, the page's last errors, and
// what the page gives it to say (the film queue: what it holds and what last happened in it). Made for a fault that shows on one
// phone and in no recording: a screenshot of the page then carries the answer. The page reads this module only when the address
// has the word, and nothing of it is left when the returned function is called.

/** The text shown: one line per fact, the page's own lines last. */
export function diagnosisText(facts: {agent: string; screen: string; surface: string; errors: string[]; page: string[]}): string {
  return [facts.agent, facts.screen, facts.surface, ...facts.errors.map(error => `FEL: ${error}`), ...facts.page].join('\n');
}

export function createDiagnosis(stage: HTMLElement, canvas: HTMLCanvasElement, read: () => string[]): () => void {
  const doc = stage.ownerDocument, win = doc.defaultView ?? window, box = doc.createElement('pre'), off = new AbortController(), errors: string[] = [];
  // over the film before the game too (its layer lies at 1000), and never in the way of a press
  box.style.cssText = 'position:absolute;left:4px;right:4px;top:4px;z-index:2000;margin:0;padding:4px 6px;max-height:70%;overflow:hidden;border-radius:6px;background:rgba(0,0,0,.74);color:#b6f7b0;font:10px/1.3 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none';
  box.setAttribute('aria-hidden', 'true'); stage.append(box);
  let lost = 0, restored = 0;
  canvas.addEventListener('webglcontextlost', () => { lost++; }, {signal: off.signal}); canvas.addEventListener('webglcontextrestored', () => { restored++; }, {signal: off.signal});
  const keep = (text: string) => { errors.push(text.slice(0, 160)); if (errors.length > 3) errors.shift(); };
  win.addEventListener('error', event => keep(String((event as ErrorEvent).message ?? 'fel')), {signal: off.signal});
  win.addEventListener('unhandledrejection', event => { const reason = (event as PromiseRejectionEvent).reason as {message?: string} | undefined; keep(String(reason?.message ?? reason ?? 'avvisat löfte')); }, {signal: off.signal});
  const draw = () => {
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null, r = stage.getBoundingClientRect();
    let page: string[]; try { page = read(); } catch (error) { page = [`sidan svarar inte: ${(error as Error).message}`]; }
    box.textContent = diagnosisText({
      agent: win.navigator.userAgent,
      screen: `scen ${Math.round(r.width)}×${Math.round(r.height)} · ritad ${canvas.width}×${canvas.height} · skärmtäthet ${win.devicePixelRatio} · ${doc.visibilityState === 'visible' ? 'synlig' : 'dold'} · ${(win.performance.now() / 1000).toFixed(0)} s`,
      surface: `bildyta: ${!gl ? 'SAKNAS' : gl.isContextLost() ? 'FÖRLORAD NU' : 'hel'} (förlorad ${lost} gånger, åter ${restored})`,
      errors, page});
  };
  const timer = setInterval(draw, 500); draw();
  return () => { clearInterval(timer); off.abort(); box.remove(); };
}
