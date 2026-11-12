// Which model answers at which level, with what effort and what output cap, and what a call costs in öre. The cost stays on
// the server: it fills the day's counter and the log, and never goes to the browser.
//
// From OpenAI's model pages (developers.openai.com/api/docs/models/<id>, read 2026-11-12): gpt-6.1-terra takes the efforts
// none…max (medium by default) and costs 1 USD per million input tokens, 0.05 cached, 5 output; gpt-6.1-sol takes low…max
// and costs 2, 0.10 and 10. Both take images and stream. A 30-minute cache write costs 1.25 × the input price (the prompt
// caching guide). max_output_tokens counts the reasoning tokens too, so the cap bounds the whole answer.

export type Level = 'snabb' | 'grundlig';
export const LEVELS: readonly Level[] = ['snabb', 'grundlig'];

/** The efforts each known model allows. A model not listed here gets its effort passed on unchecked. */
export const EFFORTS: Record<string, readonly string[]> = {
  'gpt-6.1-terra': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-6.1-sol': ['low', 'medium', 'high', 'xhigh', 'max'],
};

type Price = {in: number; cached: number; write: number; out: number};
/** USD per million tokens. write: input written to the provider's 30-minute cache. */
export const PRICES: Record<string, Price> = {
  'gpt-6.1-terra': {in: 1, cached: 0.05, write: 1.25, out: 5},
  'gpt-6.1-sol': {in: 2, cached: 0.1, write: 2.5, out: 10},
};
/** A model the table does not know is counted at the dearest known price, so the caps stop early rather than late. */
const DEAREST: Price = {in: 2, cached: 0.1, write: 2.5, out: 10};

/** Jakob's choice 2026-11-12: quick answers from terra at medium, thorough ones from sol at extra high. */
export const DEFAULTS: Record<Level, {model: string; effort: string}> = {
  snabb: {model: 'gpt-6.1-terra', effort: 'medium'},
  grundlig: {model: 'gpt-6.1-sol', effort: 'xhigh'},
};
/** Tokens a single answer may use, reasoning included: the hard stop per question that holds whatever the counter says. */
export const OUTPUT_CAP: Record<Level, number> = {snabb: 8000, grundlig: 25000};
/** Kronor per US dollar for the counter. An assumption, not a rate read anywhere; BOT_KRONOR_PER_DOLLAR overrides it. */
export const KRONOR_PER_DOLLAR = 11;

export type BotEnv = Record<string, string | undefined>;
export type Choice = {level: Level; model: string; effort: string; cap: number; known: boolean; note: string | null};

const MODEL = /^[a-z0-9][a-z0-9.:_-]{1,63}$/i;

/** The model and effort for a level from BOT_ENKEL_* (quick) or BOT_STARK_* (thorough), checked against the table. */
export function choose(level: Level, env: BotEnv): Choice {
  const prefix = level === 'snabb' ? 'BOT_ENKEL' : 'BOT_STARK';
  const asked = (env[`${prefix}_MODELL`] ?? '').trim(), model = MODEL.test(asked) ? asked : DEFAULTS[level].model;
  const wanted = (env[`${prefix}_ANSTRANGNING`] ?? '').trim().toLowerCase() || DEFAULTS[level].effort;
  const allowed = EFFORTS[model];
  let effort = wanted, note: string | null = asked && asked !== model ? `ogiltig modell ${JSON.stringify(asked)}, ${model} används` : null;
  if (allowed && !allowed.includes(wanted)) {
    effort = allowed.includes(DEFAULTS[level].effort) ? DEFAULTS[level].effort : 'medium';
    note = `${model} tar inte ansträngningen ${wanted}; ${effort} används`;
  } else if (!allowed && !/^[a-z]{2,10}$/.test(wanted)) effort = 'medium';
  return {level, model, effort, cap: OUTPUT_CAP[level], known: !!allowed, note};
}

export const kronorPerDollar = (env: BotEnv): number => {
  const n = Number((env.BOT_KRONOR_PER_DOLLAR ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 5 && n <= 30 ? n : KRONOR_PER_DOLLAR;
};

/** What the provider reports for one call. input includes cached and written tokens; output includes reasoning. */
export type Usage = {input: number; cached: number; written: number; output: number; reasoning: number};
export const NO_USAGE: Usage = {input: 0, cached: 0, written: 0, output: 0, reasoning: 0};

const whole = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0;
/** The usage object of a Responses API answer (usage.input_tokens, …_details.cached_tokens / cache_write_tokens, …). */
export function usageOf(raw: any): Usage {
  return {
    input: whole(raw?.input_tokens), cached: whole(raw?.input_tokens_details?.cached_tokens), written: whole(raw?.input_tokens_details?.cache_write_tokens),
    output: whole(raw?.output_tokens), reasoning: whole(raw?.output_tokens_details?.reasoning_tokens),
  };
}

/** Öre for one call, rounded up to the hundredth: plain input, cached reads, cache writes and output each at their price. */
export function oreOf(model: string, usage: Usage, krPerUsd: number): number {
  const p = PRICES[model] ?? DEAREST;
  const plain = Math.max(0, usage.input - usage.cached - usage.written);
  const usd = (plain * p.in + usage.cached * p.cached + usage.written * p.write + usage.output * p.out) / 1e6;
  return Math.ceil(usd * krPerUsd * 100 * 100) / 100;
}

/**
 * The most a call can cost before it is made: every input token as a cache write (the dearest input price) and the whole
 * output cap. The counter checks this against what is left, so a question that could cross a cap is refused up front.
 */
export function worstOre(model: string, inputTokens: number, cap: number, krPerUsd: number): number {
  const p = PRICES[model] ?? DEAREST;
  return Math.ceil((inputTokens * Math.max(p.in, p.write) + cap * p.out) / 1e6 * krPerUsd * 100 * 100) / 100;
}

/** A rough token count for Swedish text with code words: about 3.5 characters a token. Only for estimates. */
export const roughTokens = (text: string): number => Math.ceil(text.length / 3.5);
/** What an attached screenshot is counted as before the provider says (a generous guess for one PNG at high detail). */
export const IMAGE_TOKENS = 3000;
