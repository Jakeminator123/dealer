// Which service the bot's model calls go to, and the request each one gets. BOT_LEVERANTOR picks it:
//
//   gateway (the default)  Vercel's AI Gateway, https://ai-gateway.vercel.sh/v1/responses, OpenAI's Responses API with
//                          models named "openai/<model>". On Vercel the function needs no key: every invocation carries the
//                          project's OIDC token in the x-vercel-oidc-token request header, which the gateway takes as a
//                          bearer token, and the spend lands on the AI Gateway credits of the team that owns the project.
//                          An AI_GATEWAY_API_KEY, when set, is used instead (as the gateway itself ranks them); outside
//                          Vercel (the rehearsal with --riktig-modell) that key, or a VERCEL_OIDC_TOKEN from `vercel env
//                          pull`, is the only way in.
//   openai                 OpenAI directly, https://api.openai.com/v1/responses, with OPENAI_API_KEY, as before.
//
// From Vercel's AI Gateway docs (read 2026-11-12): the Responses API with stream, reasoning.effort (none…max), input_image
// with a base64 data URL, text.format json_schema, store, prompt_cache_key; OpenAI models cache by themselves ("implicit"),
// and caching: "auto" adds cache marks only for providers that need them (Anthropic and others). Not in those docs, and so
// not sent to the gateway: OpenAI's own prompt_cache_options and the input's prompt_cache_breakpoint. The streamed events
// are read as OpenAI's (response.output_text.delta, response.completed / response.incomplete with usage, response.failed,
// error); the docs show the delta and name completed and incomplete as the terminal events. A spent budget or credit is an
// HTTP 402 (type quota_for_entity_exceeded). Pure; tested in tools/bot.test.ts.

export type Provider = 'gateway' | 'openai';
export const PROVIDERS: readonly Provider[] = ['gateway', 'openai'];
export const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/responses';
export const OPENAI_URL = 'https://api.openai.com/v1/responses';
/** The gateway's cache key for the bot's unchanging start (rules and core): at most 64 characters. */
export const CACHE_KEY = 'dealer-studio-bot-karna';

type Env = Record<string, string | undefined>;

/** The provider BOT_LEVERANTOR names; anything else is the gateway, with a note for the log. */
export function providerOf(env: Env): {provider: Provider; note: string | null} {
  const asked = (env.BOT_LEVERANTOR ?? '').trim().toLowerCase();
  if (!asked) return {provider: 'gateway', note: null};
  return PROVIDERS.includes(asked as Provider) ? {provider: asked as Provider, note: null} : {provider: 'gateway', note: `okänd BOT_LEVERANTOR ${JSON.stringify(asked)}, gateway används`};
}

/** Where the call goes and with which bearer token; key null: none is there, and the bot says so instead of calling. */
export type Endpoint = {provider: Provider; url: string; key: string | null; via: 'AI_GATEWAY_API_KEY' | 'oidc' | 'VERCEL_OIDC_TOKEN' | 'OPENAI_API_KEY' | null};

/** The endpoint for this request. The OIDC token is read from the request on every call: Vercel rotates it. */
export function endpointOf(env: Env, headers: Headers | null): Endpoint {
  const {provider} = providerOf(env);
  if (provider === 'openai') {
    const key = (env.OPENAI_API_KEY ?? '').trim();
    return {provider, url: OPENAI_URL, key: key || null, via: key ? 'OPENAI_API_KEY' : null};
  }
  const apiKey = (env.AI_GATEWAY_API_KEY ?? '').trim(), oidc = (headers?.get('x-vercel-oidc-token') ?? '').trim(), pulled = (env.VERCEL_OIDC_TOKEN ?? '').trim();
  if (apiKey) return {provider, url: GATEWAY_URL, key: apiKey, via: 'AI_GATEWAY_API_KEY'};
  if (oidc) return {provider, url: GATEWAY_URL, key: oidc, via: 'oidc'};
  if (pulled) return {provider, url: GATEWAY_URL, key: pulled, via: 'VERCEL_OIDC_TOKEN'};
  return {provider, url: GATEWAY_URL, key: null, via: null};
}

/** What the visitor reads when there is no way to the model yet. */
export const NO_WAY: Record<Provider, string> = {
  gateway: 'Boten når inte modelltjänsten än. Jakob slår på den.',
  openai: 'Boten har ingen nyckel till modellen än. Jakob lägger in den.',
};

/** The model as the provider names it: the gateway wants "openai/<model>" (an id that names its provider stays as it is). */
export const modelFor = (provider: Provider, model: string): string => provider === 'gateway' ? (model.includes('/') ? model : `openai/${model}`) : model.replace(/^openai\//, '');

/** Takes OpenAI's own cache marks out of an input (the gateway's docs do not name them): a deep copy. */
export function withoutCacheMarks(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(withoutCacheMarks);
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'prompt_cache_breakpoint').map(([k, v]) => [k, withoutCacheMarks(v)]));
  return input;
}

/**
 * The body of one call for the provider. The OpenAI body is the one the bot has always sent (with its explicit cache
 * breakpoint when the model knows it); the gateway's has the model named with its provider, no OpenAI cache fields, and the
 * gateway's own prompt_cache_key and caching: "auto". stream and store: false are added by the caller (bot-openai.ts post).
 */
export function requestBody(provider: Provider, call: {model: string; input: unknown; effort: string; cap: number; cache: boolean; text?: unknown}): Record<string, unknown> {
  const base = {model: modelFor(provider, call.model), reasoning: {effort: call.effort}, max_output_tokens: call.cap, ...(call.text ? {text: call.text} : {})};
  if (provider === 'openai') return {...base, input: call.input, ...(call.cache ? {prompt_cache_options: {mode: 'explicit'}} : {})};
  return {...base, input: withoutCacheMarks(call.input), ...(call.cache ? {prompt_cache_key: CACHE_KEY, caching: 'auto'} : {})};
}
