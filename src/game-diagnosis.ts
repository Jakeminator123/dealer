// What one browser does with the game, as text on the picture itself. ?diagnos=1 lays a small text over the stage: which browser
// it is, how large the picture is drawn, whether the picture's own surface (WebGL) has been lost, the page's last errors, and
// what the page gives it to say (the film queue: what it holds and what last happened in it). Made for a fault that shows on one
// phone and in no recording: a screenshot of the page then carries the answer. The page reads this module only when the address
// has the word, and nothing of it is left when the returned function is called.

/** The text shown: one line per fact, the page's own lines last. */
export function diagnosisText(facts: {agent: string; screen: string; surface: string; errors: string[]; page: string[]}): string {
  return [facts.agent, facts.screen, facts.surface, ...facts.errors.map(error => `FEL: ${error}`), ...facts.page].join('\n');
}

export type DiagnosisControls = {
  playback: () => {clip: string; frame: number; rate: number; paused: boolean} | null;
  toggle: () => void;
  step: (direction: -1 | 1) => void | Promise<void>;
};

function playbackControls(panel: HTMLElement, options: DiagnosisControls, signal: AbortSignal, keep: (error: string) => void) {
  const doc = panel.ownerDocument, group = doc.createElement('div'), status = doc.createElement('span');
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Filmuppspelning');
  group.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px;flex:none;pointer-events:auto';
  status.setAttribute('role', 'status');
  status.style.cssText = 'flex-basis:100%;font:inherit;overflow-wrap:anywhere';
  let busy = false, seeking = false;
  const button = (label: string, action: () => void | Promise<void>, seeks = false) => {
    const el = doc.createElement('button'); el.type = 'button'; el.textContent = label;
    el.style.cssText = 'min-height:26px;padding:2px 6px;background:#182918;color:#edffe9;border:1px solid #8dba84;border-radius:4px;font:inherit;cursor:pointer';
    el.addEventListener('click', async () => {
      if (busy) return;
      busy = true; seeking = seeks; update();
      try { await action(); } catch (error) { keep(String(error)); }
      finally { busy = false; seeking = false; if (!signal.aborted) update(); }
    }, {signal});
    return el;
  };
  const toggle = button('Pausa', options.toggle), back = button('−1 ruta', () => options.step(-1), true), next = button('+1 ruta', () => options.step(1), true);
  group.append(toggle, back, next, status); panel.append(group);
  function update() {
    let current: ReturnType<DiagnosisControls['playback']> = null;
    try { current = options.playback(); } catch (error) { keep(String(error)); }
    const label = current?.paused ? 'Fortsätt' : 'Pausa';
    if (toggle.textContent !== label) toggle.textContent = label;
    toggle.disabled = back.disabled = next.disabled = !current || busy;
    // Announce the exact frame when paused or stepped, without a running stream of frame announcements.
    status.setAttribute('aria-live', current && !current.paused && !seeking ? 'off' : 'polite');
    // A seek moves currentTime before the decoder replaces the held picture.
    const text = current ? `${current.clip} · ${seeking ? 'söker filmruta…' : `ruta ${current.frame}`} · ${current.rate.toLocaleString('sv-SE', {maximumFractionDigits: 2})}×` : 'Ingen film att stega i';
    if (status.textContent !== text) status.textContent = text;
  }
  return update;
}

export function createDiagnosis(stage: HTMLElement, canvas: HTMLCanvasElement, read: () => string[], options?: DiagnosisControls): () => void {
  const doc = stage.ownerDocument, win = doc.defaultView ?? window, box = doc.createElement('pre'), off = new AbortController(), errors: string[] = [];
  // Over the film before the game, without intercepting presses outside the controls.
  const panel = options ? doc.createElement('div') : box;
  panel.style.cssText = 'position:absolute;left:4px;right:4px;top:4px;z-index:2000;margin:0;padding:4px 6px;max-height:70%;overflow:hidden;border-radius:6px;background:rgba(0,0,0,.74);color:#b6f7b0;font:10px/1.3 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none';
  box.setAttribute('aria-hidden', 'true');
  if (options) {
    panel.style.cssText += ';right:auto;width:min(360px,calc(100% - 20px));max-height:min(max(58px,28%),180px);display:flex;flex-direction:column;gap:4px';
    box.style.cssText = 'margin:0;overflow:hidden;font:inherit;white-space:inherit';
    panel.append(box);
  }
  stage.append(panel);
  let lost = 0, restored = 0;
  canvas.addEventListener('webglcontextlost', () => { lost++; }, {signal: off.signal}); canvas.addEventListener('webglcontextrestored', () => { restored++; }, {signal: off.signal});
  const keep = (text: string) => { errors.push(text.slice(0, 160)); if (errors.length > 3) errors.shift(); };
  const updatePlayback = options ? playbackControls(panel, options, off.signal, keep) : null;
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
    updatePlayback?.();
  };
  const timer = setInterval(draw, 500); draw();
  return () => { clearInterval(timer); off.abort(); panel.remove(); };
}
