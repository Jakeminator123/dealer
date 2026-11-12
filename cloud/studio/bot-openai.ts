// The calls to OpenAI's Responses API, server side only: at OpenAI itself (POST https://api.openai.com/v1/responses, with
// OPENAI_API_KEY) or through Vercel's AI Gateway, which offers the same API (bot-provider.ts says where and with which
// token; the call gets its url and key from there). Every call sends store: false: the provider keeps no copy of the answer.
// Streaming answers arrive as server-sent events whose data is JSON with a "type": response.output_text.delta carries the
// text (delta), response.completed / response.incomplete the finished response with its usage, response.failed and error a
// failure (the streaming guide names created, output_text.delta, completed and error; the fields read here are the
// documented Response object's). An HTTP error carries {error: {code, message}}.
import {usageOf, type Usage} from './bot-models.ts';

export const RESPONSES_URL = 'https://api.openai.com/v1/responses';

export type ModelFailure = {kod: 'modell' | 'tak'; text: string};
export type ModelEvent = {type: 'text'; t: string} | {type: 'done'; usage: Usage; incomplete: string | null} | ({type: 'error'; usage: Usage | null} & ModelFailure);

/** An HTTP error from the provider in the visitor's words. The provider's own message stays in the log, not the answer. */
export function failureOf(status: number, code: string | null): ModelFailure {
  // OpenAI's own monthly limit, and the gateway's budget or credit (402, quota_for_entity_exceeded).
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached' || code === 'quota_for_entity_exceeded' || status === 402) return {kod: 'tak', text: 'Månadens gräns hos modelltjänsten är nådd.'};
  if (status === 401 || status === 403) return {kod: 'modell', text: 'Modelltjänsten godtar inte nyckeln. Jakob behöver se över den.'};
  if (status === 429) return {kod: 'modell', text: 'Modelltjänsten är upptagen just nu. Försök igen om en stund.'};
  if (status >= 500) return {kod: 'modell', text: 'Modelltjänsten svarar inte just nu. Försök igen om en stund.'};
  return {kod: 'modell', text: 'Frågan gick inte att ställa till modellen.'};
}

/** One call: the bearer token, and the Responses address (OpenAI's when not given; the gateway's from bot-provider.ts). */
type Call = {key: string; url?: string; fetch?: typeof fetch; signal?: AbortSignal};

async function post(body: Record<string, unknown>, call: Call, stream: boolean): Promise<Response | ({error: string} & ModelFailure)> {
  const response = await (call.fetch ?? fetch)(call.url ?? RESPONSES_URL, {
    method: 'POST', signal: call.signal,
    headers: {authorization: `Bearer ${call.key}`, 'content-type': 'application/json', ...(stream ? {accept: 'text/event-stream'} : {})},
    body: JSON.stringify({...body, stream, store: false}),
  });
  if (response.ok) return response;
  const answer = await response.json().catch(() => null) as {error?: {code?: string; type?: string; message?: string}} | null;
  const code = answer?.error?.code ?? answer?.error?.type ?? null;
  return {...failureOf(response.status, code), error: `HTTP ${response.status} ${code ?? ''} ${String(answer?.error?.message ?? '').slice(0, 300)}`.trim()};
}

/** The data blocks of an SSE body, parsed as JSON, as they arrive. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const decoder = new TextDecoder();
  let buffer = '';
  const blocks = function* (final: boolean) {
    buffer = buffer.replace(/\r\n/g, '\n');
    let at: number;
    while ((at = buffer.indexOf('\n\n')) >= 0 || (final && buffer.trim())) {
      const block = at >= 0 ? buffer.slice(0, at) : buffer;
      buffer = at >= 0 ? buffer.slice(at + 2) : '';
      const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      try { yield JSON.parse(data); } catch { /* not JSON: skipped */ }
    }
  };
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, {stream: true});
    yield* blocks(false);
  }
  buffer += decoder.decode();
  yield* blocks(true);
}

/** One streamed answer as text pieces and an end (done with usage, or an error). Never throws for a provider failure. */
export async function* streamAnswer(body: Record<string, unknown>, call: Call): AsyncGenerator<ModelEvent> {
  let response: Response | ({error: string} & ModelFailure);
  try { response = await post(body, call, true); } catch (error) {
    if (call.signal?.aborted) return;
    yield {type: 'error', kod: 'modell', text: 'Modelltjänsten gick inte att nå.', usage: null}; return;
  }
  if (!(response instanceof Response)) { yield {type: 'error', kod: response.kod, text: response.text, usage: null}; return; }
  if (!response.body) { yield {type: 'error', kod: 'modell', text: 'Modelltjänsten skickade inget svar.', usage: null}; return; }
  try {
    for await (const e of sseData(response.body)) {
      const type = String(e?.type ?? '');
      if ((type === 'response.output_text.delta' || type === 'response.refusal.delta') && typeof e.delta === 'string') yield {type: 'text', t: e.delta};
      else if (type === 'response.completed') { yield {type: 'done', usage: usageOf(e.response?.usage), incomplete: null}; return; }
      else if (type === 'response.incomplete') { yield {type: 'done', usage: usageOf(e.response?.usage), incomplete: String(e.response?.incomplete_details?.reason ?? 'okänt')}; return; }
      else if (type === 'response.failed' || type === 'error') {
        const usage = e.response?.usage ? usageOf(e.response.usage) : null;
        yield {type: 'error', kod: 'modell', text: 'Modellen kunde inte svara på frågan. Försök igen eller fråga på ett annat sätt.', usage}; return;
      }
    }
  } catch {
    if (call.signal?.aborted) return;
  }
  if (!call.signal?.aborted) yield {type: 'error', kod: 'modell', text: 'Svaret bröts innan det var klart.', usage: null};
}

/** The text of a finished (not streamed) Response: every output_text of its message items, joined. */
export function outputText(response: any): string {
  if (typeof response?.output_text === 'string') return response.output_text;
  const parts: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== 'message') continue;
    for (const c of Array.isArray(item.content) ? item.content : []) if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
  }
  return parts.join('');
}

/** One answer in a single piece (for the request draft). */
export async function wholeAnswer(body: Record<string, unknown>, call: Call): Promise<{ok: true; text: string; usage: Usage} | ({ok: false; usage: Usage | null; error: string} & ModelFailure)> {
  let response: Response | ({error: string} & ModelFailure);
  try { response = await post(body, call, false); } catch { return {ok: false, kod: 'modell', text: 'Modelltjänsten gick inte att nå.', usage: null, error: 'nätverk'}; }
  if (!(response instanceof Response)) return {ok: false, kod: response.kod, text: response.text, usage: null, error: response.error};
  const answer = await response.json().catch(() => null);
  const usage = usageOf(answer?.usage);
  if (answer?.status && answer.status !== 'completed') return {ok: false, kod: 'modell', text: 'Modellen blev inte klar med utkastet.', usage, error: `status ${answer.status}`};
  return {ok: true, text: outputText(answer), usage};
}
