// Local diagnostic samples, not the page's INP percentile. No text, field values or URL queries are collected.
export type Timing = {name: string; startTime: number; duration: number; processingStart: number; processingEnd: number; interactionId: number};
export type InteractionSample = {
  at: string; page: string; target: string; event: string; interactionId: number;
  duration: number; inputDelay: number; processing: number; presentation: number; hidden: boolean; visibilityChanged: boolean;
};
export function timingParts(e: Timing) {
  if (!e.interactionId || e.duration < 200) return null;
  const round = (n: number) => Math.round(Math.max(0, n) * 10) / 10;
  return {duration: round(e.duration), inputDelay: round(e.processingStart - e.startTime),
    processing: round(e.processingEnd - e.processingStart), presentation: round(e.startTime + e.duration - e.processingEnd)};
}
export function startInteractionDiagnostics() {
  if (location.hostname !== '127.0.0.1' || !globalThis.PerformanceObserver?.supportedEntryTypes.includes('event')) return;
  const contexts: {at: number; page: string; target: string}[] = [];
  const visibility = [{at: 0, hidden: document.hidden}];
  const pending: InteractionSample[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined, sent = 0;
  const flush = () => {
    clearTimeout(timer); timer = undefined;
    if (!pending.length) return;
    const batch = pending.splice(0, 16);
    void fetch('/api/interaction-diagnostics', {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify(batch), keepalive: true}).catch(() => {});
    if (pending.length) timer = setTimeout(flush, 1000);
  };
  const context = (event: Event) => {
    const el = event.target instanceof Element ? event.target.closest('a,button,input,select,textarea,[role="button"]') : null;
    const link = el instanceof HTMLAnchorElement && el.origin === location.origin ? el.pathname : '';
    contexts.push({at: event.timeStamp, page: location.pathname, target: el ? `${el.tagName.toLowerCase()}${link ? ` ${link}` : ''}` : 'unknown'});
    if (contexts.length > 64) contexts.shift();
  };
  for (const name of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) addEventListener(name, context, {capture: true, passive: true});
  addEventListener('visibilitychange', () => {
    visibility.push({at: performance.now(), hidden: document.hidden});
    if (visibility.length > 64) visibility.shift();
    if (document.hidden) flush();
  });
  addEventListener('pagehide', flush);
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const e = entry as PerformanceEventTiming, parts = timingParts(e);
      if (!parts || sent >= 200) continue;
      const ctx = contexts.findLast(c => c.at <= e.startTime + 1 && e.startTime - c.at < 1000);
      const state = visibility.findLast(v => v.at <= e.startTime);
      pending.push({at: new Date(performance.timeOrigin + e.startTime).toISOString(), page: ctx?.page ?? location.pathname,
        target: ctx?.target ?? 'unknown', event: e.name, interactionId: e.interactionId, ...parts,
        hidden: state?.hidden ?? document.hidden, visibilityChanged: visibility.some(v => v.at > e.startTime && v.at <= e.startTime + e.duration)});
      sent++;
      if (pending.length > 32) pending.shift();
    }
    if (pending.length && !timer) timer = setTimeout(flush, 1000);
  }).observe({type: 'event', durationThreshold: 200} as PerformanceObserverInit);
}
