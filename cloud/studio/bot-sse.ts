// Server-sent events for the bot's answer (POST /api/bot): one event per line pair, its data as one line of JSON, and a
// comment line when nothing has been sent for a while, so that the connection and the visitor both know it is alive.
// The panel reads: kallor, text (many), klar, fel. Nothing here ever carries a cost.

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
} as const;

export type BotEvent =
  | {event: 'kallor'; data: {id: string; titel: string}[]}
  | {event: 'text'; data: {t: string}}
  | {event: 'klar'; data: {modell: string; niva: string; tokensIn: number; tokensUt: number; kallor: string[]}}
  | {event: 'fel'; data: {kod: 'tak' | 'for_manga' | 'modell' | 'indata' | 'ingen_nyckel'; text: string}};

/** "event: <name>\ndata: <json>\n\n". JSON.stringify never writes a raw line break, so the data is always one line. */
export const frame = (e: BotEvent): string => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
export const comment = (text: string): string => `: ${text.replace(/[\r\n]+/g, ' ')}\n\n`;

/** Every SSE block of a text, as {event, data}: for the tests and the owner's tools. Comment blocks come back as event ":". */
export function readFrames(text: string): {event: string; data: unknown}[] {
  return text.split(/\n\n/).filter(b => b.trim()).map(block => {
    const lines = block.split('\n');
    if (lines.every(l => l.startsWith(':'))) return {event: ':', data: lines.map(l => l.slice(1).trim()).join(' ')};
    const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim() ?? 'message';
    const data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    let parsed: unknown = data;
    try { parsed = JSON.parse(data); } catch { /* left as text */ }
    return {event, data: parsed};
  });
}

/**
 * A stream of events with a keep-alive: every tick it sends a comment if nothing went out for `quiet` ms. send after
 * close is ignored, so a late model event never throws into a closed answer.
 */
export function eventStream(options: {quiet?: number; tick?: number; note?: string} = {}) {
  const quiet = options.quiet ?? 10_000, tick = options.tick ?? 1_000, encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true, last = Date.now(), timer: ReturnType<typeof setInterval> | null = null, onCancel: (() => void) | null = null;
  const write = (text: string) => { if (!open) return; last = Date.now(); try { controller.enqueue(encoder.encode(text)); } catch { open = false; } };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      timer = setInterval(() => { if (Date.now() - last >= quiet) write(comment(options.note ?? 'tänker')); }, tick);
      (timer as {unref?: () => void}).unref?.();
    },
    cancel() { open = false; stop(); onCancel?.(); },
  });
  return {
    body,
    send: (e: BotEvent) => write(frame(e)),
    close: () => { stop(); if (open) { open = false; try { controller.close(); } catch { /* already closed */ } } },
    /** Called when the visitor goes away before the answer is done. */
    onCancel: (fn: () => void) => { onCancel = fn; },
    get open() { return open; },
  };
}
