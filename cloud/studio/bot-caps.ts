// The bot's caps without a database (Jakob 2026-11-12): at most 50 kronor a day and 500 a month, at most 15 thorough
// questions a day, at most 30 questions an hour per visitor. One small JSON file per day (bot/dag/<YYYY-MM-DD>.json, Swedish
// time) holds the day's öre, questions, thorough questions, each visitor's question times of the last hour, and what the
// month had spent before the day began.
//
// How exact it is. A question is checked before it is asked (the day's file, read past any cache, plus the questions this
// instance has in flight, each counted at its worst case) and written once, when it is done, with a write that names the
// version it read: two answers that finish at once never lose one of the two, so the totals are exact afterwards. What is
// not exact: two questions that start at the same moment on two instances both see the cap as open, so a cap can be passed
// by the worst case of the questions in flight then (at most about 1 krona for a quick and 4 for a thorough one), and a
// question cut off by the platform before it is written is not counted at all. The hard stops that do not depend on this
// file: each answer's output cap (bot-models.ts OUTPUT_CAP) and the monthly limit Jakob sets in OpenAI's project.
import {readJson, updateJson, type Store} from './bot-store.ts';
import type {Level} from './bot-models.ts';

export const CAPS = {dayOre: 5000, monthOre: 50000, thoroughPerDay: 15, perHour: 30} as const;
const HOUR = 60 * 60 * 1000;

export type Day = {
  schemaVersion: 1;
  datum: string;
  /** Öre spent earlier in the same month, summed from the month's earlier day files when this file was made. */
  manadFore: number;
  ore: number;
  fragor: number;
  grundliga: number;
  /** A visitor (a salted hash of the address) to the times of its questions in the last hour. */
  besok: Record<string, number[]>;
};

/** The day in Swedish time: "2026-11-12". */
export function swedishDay(ms: number): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export const dayKey = (datum: string) => `bot/dag/${datum}.json`;

export const freshDay = (datum: string, manadFore: number): Day => ({schemaVersion: 1, datum, manadFore, ore: 0, fragor: 0, grundliga: 0, besok: {}});

/** A question in flight on this instance, counted at its worst case until it is done. */
export type Ticket = {id: string; level: Level; visitor: string; worst: number; datum: string; at: number};
export type Refusal = {ok: false; kod: 'tak' | 'for_manga'; text: string};

/**
 * Whether one more question may be asked now: the caps against the day's file and the questions in flight. Pure; the
 * texts are what the visitor reads (in Swedish, never with a sum of money).
 */
export function admit(day: Day, inFlight: readonly Ticket[], ask: {level: Level; visitor: string; worst: number; now: number}): {ok: true} | Refusal {
  const flying = inFlight.filter(t => t.datum === day.datum);
  const recent = (day.besok[ask.visitor] ?? []).filter(t => ask.now - t < HOUR).length + flying.filter(t => t.visitor === ask.visitor).length;
  if (recent >= CAPS.perHour) return {ok: false, kod: 'for_manga', text: `Högst ${CAPS.perHour} frågor i timmen. Vänta en stund och fråga igen.`};
  if (ask.level === 'grundlig' && day.grundliga + flying.filter(t => t.level === 'grundlig').length >= CAPS.thoroughPerDay)
    return {ok: false, kod: 'for_manga', text: `Dagens ${CAPS.thoroughPerDay} grundliga frågor är använda. Snabba frågor går fortfarande, och i morgon finns nya.`};
  const pending = flying.reduce((sum, t) => sum + t.worst, 0);
  if (day.ore + pending + ask.worst > CAPS.dayOre) return {ok: false, kod: 'tak', text: 'Dagens gräns för boten är nådd. Den öppnar igen i morgon.'};
  if (day.manadFore + day.ore + pending + ask.worst > CAPS.monthOre) return {ok: false, kod: 'tak', text: 'Månadens gräns för boten är nådd.'};
  return {ok: true};
}

/**
 * The day with one finished call in it: its öre and the visitor's time (older times dropped), and, for a question, the
 * counts. A request draft (question false) costs and counts toward the hour, but is no question. Pure.
 */
export function settle(day: Day, done: {level: Level; visitor: string; ore: number; now: number; question: boolean}): Day {
  const besok: Record<string, number[]> = {};
  for (const [who, times] of Object.entries(day.besok ?? {})) {
    const kept = times.filter(t => Number.isFinite(t) && done.now - t < HOUR);
    if (kept.length) besok[who] = kept;
  }
  besok[done.visitor] = [...(besok[done.visitor] ?? []), done.now];
  return {
    ...day, ore: Math.round((day.ore + Math.max(0, done.ore)) * 100) / 100, besok,
    fragor: day.fragor + (done.question ? 1 : 0), grundliga: day.grundliga + (done.question && done.level === 'grundlig' ? 1 : 0),
  };
}

/** The day counter of one running instance: reads the day's file, keeps its own questions in flight, writes when done. */
export class Caps {
  private readonly store: Store;
  private readonly flying = new Map<string, Ticket>();
  private readonly before = new Map<string, number>(); // the month's öre before a day, once read
  constructor(store: Store) { this.store = store; }

  /** Öre spent in the month before this day: the month's earlier day files, read once per day and instance. */
  private async monthBefore(datum: string): Promise<number> {
    const known = this.before.get(datum);
    if (known !== undefined) return known;
    let sum = 0;
    for (const key of await this.store.list(`bot/dag/${datum.slice(0, 7)}-`)) {
      const day = /^bot\/dag\/(\d{4}-\d{2}-\d{2})\.json$/.exec(key)?.[1];
      if (!day || day >= datum) continue;
      const file = await readJson<Day>(this.store, key);
      if (file?.value && Number.isFinite(file.value.ore)) sum += file.value.ore;
    }
    this.before.set(datum, sum);
    return sum;
  }

  async today(now: number): Promise<Day> {
    const datum = swedishDay(now), file = await readJson<Day>(this.store, dayKey(datum));
    return file?.value ?? freshDay(datum, await this.monthBefore(datum));
  }

  async admit(level: Level, visitor: string, worst: number, now: number): Promise<{ok: true; ticket: Ticket} | Refusal> {
    const day = await this.today(now);
    const verdict = admit(day, [...this.flying.values()], {level, visitor, worst, now});
    if (!verdict.ok) return verdict;
    const ticket: Ticket = {id: crypto.randomUUID(), level, visitor, worst, datum: day.datum, at: now};
    this.flying.set(ticket.id, ticket);
    return {ok: true, ticket};
  }

  /** Writes the finished call into its day's file. question false: a draft of a request, which costs but is no question. */
  async settle(ticket: Ticket, ore: number, now: number, question = true): Promise<void> {
    try {
      const manadFore = await this.monthBefore(ticket.datum);
      await updateJson<Day>(this.store, dayKey(ticket.datum), current => settle(current ?? freshDay(ticket.datum, manadFore), {level: ticket.level, visitor: ticket.visitor, ore, now, question}));
    } finally {
      this.flying.delete(ticket.id);
    }
  }

  get inFlight(): number { return this.flying.size; }
}
