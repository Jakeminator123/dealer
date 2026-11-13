// Which spoken film a dealer has for what she is to say. No file and no page in here: the game and the chat hand in the takes
// of the step IDLE>IDLE as the clip bank has them (src/clip-graph.ts, graph.edge['IDLE>IDLE'].takes) and get back the film to play.
//
// A spoken film is a rest take with a sound track, made by tools/speech.ts. Its record (motions/<id>.json) says so in `speech`:
// the line's key, the text as the voice reads it, the voice, and where the sound lies in the film. The keys are the ten lines a
// table needs (the SpeakLine ids of game/presentation.ts) and the chat's fixed replies (data/speech.json, `lines` and `chat`).
//
//   spokenFilm(takes, 'paow', 'goodluck')          the film for a line, by its key …
//   spokenFilm(takes, 'paow', 'BETTING')           … or for a phase of the round as the chat names it (PHASE_LINE)
//   chatReply(takes, 'paow', 'hej, vad heter du?', n)   the fixed reply that answers what the player wrote, as a film
//
// Each gives {key, clip, video, text, soundStart, soundEnd, …} or null when she has no film for it; the caller then shows the
// text it would have shown anyway. The film is played whole, from its first frame to its last, with its sound (a part with
// sound: true in src/scene3d-film.ts): it begins and ends on the rest film's first played frame, mouth closed.

/** The ten lines of a round, in the order they come. */
export const SPOKEN_LINES = ['placebets', 'goodluck', 'insurance', 'double', 'blackjack', 'dealerblackjack', 'dealerbust', 'win', 'push', 'lose'] as const;
/** The chat's phases (DEALER_LINES in src/game-chat.ts) and the line she says there. */
export const PHASE_LINE: Record<string, string> = {BETTING: 'placebets', DEALING: 'goodluck', INSURANCE: 'insurance', DEALER: 'dealerplays'};
/** The chat dummy's own four answers (REPLIES in src/game-chat.ts), in its order: what she says when nothing else fits. */
export const CHAT_FALLBACK = ['chat1', 'chat2', 'chat3', 'chat4'] as const;
// What the player wrote, read by its words: the first rule that fits names the reply. Goodbye stands before hello ("hej då").
// A word ends where no letter or digit follows, å, ä and ö included (JavaScript's \b counts them as no letters).
const rule = (words: string, key: string): [RegExp, string] => [new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'u'), key];
const CHAT_RULES: [RegExp, string][] = [
  rule('hej ?d[åa]|god ?natt|vi ses|adj[öo]|bye|good ?night|see you', 'hejda'),
  rule('vad heter du|ditt namn|vem [äa]r du|heter du|who are you|your name', 'namn'),
  rule('hur m[åa]r du|hur [äa]r l[äa]get|l[äa]get|allt bra|how are you', 'hurmardu'),
  rule('regler\\p{L}*|hur spelar|hur g[öo]r man|hur funkar|how (?:do|to)(?: i| you)? play|rules?', 'regler'),
  rule('lycka till|good luck', 'detsamma'),
  rule('tack|tackar|thanks|thank you', 'varsagod'),
  rule('otur|f[öo]rlora\\p{L}*|f[öo]rlust|[åa]h nej|fan|j[äa]klar?|skit|attans|unlucky|lost', 'otur'),
  rule('vann|vinner|vinst|yes+|jaa+|woho+|snyggt|nice|blackjack', 'grattis'),
  rule('hej|hejsan|hall[åa]|tjena|tja|god ?(?:kv[äa]ll|dag|morgon)|hello|hi', 'hej'),
];
/** Every key chatKey can answer with; each has a text in data/speech.json (the test holds the two together). */
export const CHAT_KEYS: string[] = [...new Set([...CHAT_RULES.map(rule => rule[1]), 'vetej', ...CHAT_FALLBACK])];

/**
 * The fixed reply that answers what the player wrote. A greeting, her name, how she is, the rules, thanks, luck, a loss, a win
 * and a goodbye have a reply of their own; another question gets "that I cannot answer"; anything else gets the dummy's own
 * four answers in turn (count is how many times she has answered so, as replyTo in src/game-chat.ts counts).
 */
export function chatKey(written: string, count = 0): string {
  const text = written.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  for (const [pattern, key] of CHAT_RULES) if (pattern.test(text)) return key;
  if (text.endsWith('?')) return 'vetej';
  return CHAT_FALLBACK[((count % CHAT_FALLBACK.length) + CHAT_FALLBACK.length) % CHAT_FALLBACK.length];
}

/** A take as the clip bank has it; only what is read here. motion is its record (motions/<id>.json), with `speech` if it is spoken. */
export type SpeechTake = {id: string; dealer?: string; decision?: string; stage?: string; inbox?: boolean; fps?: number | null; frames?: number | null; media?: {video?: string | null} | null; motion?: unknown};
/** A film to play: the clip's id and file, the text as the voice reads it, and where the sound lies in the film, in seconds. */
export type Spoken = {key: string; clip: string; video: string | null; text: string; language: string; voice: string | null; fps: number; frames: number | null; seconds: number | null; soundStart: number; soundEnd: number | null; judged: boolean};
export type SpokenOptions = {language?: string; voice?: string};
type Said = {line?: unknown; language?: unknown; text?: unknown; voice?: unknown; soundStartsAtSeconds?: unknown; soundEndsAtSeconds?: unknown};
type Record_ = {dealer?: unknown; source?: {path?: unknown; fps?: unknown; frames?: unknown}; speech?: Said};
// The renderer puts 0,22 s before the sound (src/speech-plan.ts, RENDER.leadSamples); a record that does not say has that.
const LEAD = 0.22;
const numberOf = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const takeNumber = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);
// A take's place among the takes of one line: one that is accepted (Jakob's own verdict or a provisional one), then one nobody has
// judged, then one set aside for a newer, and last one that waits in the inbox. So what he has approved is played until he has
// judged a newer take, whatever their numbers.
const place = (take: SpeechTake) => take.inbox === true ? 0 : take.decision === 'ACCEPTED' ? 3 : take.decision === 'SECONDARY' ? 1 : 2;

function read(take: SpeechTake): (Spoken & {dealer: string; place: number}) | null {
  const record = (take.motion ?? null) as Record_ | null, said = record?.speech;
  if (!said || typeof said.line !== 'string' || typeof said.text !== 'string' || !said.text.trim()) return null;
  if (take.decision === 'REJECTED' || take.stage === 'FAILED') return null;
  const fps = numberOf(take.fps) ?? numberOf(record?.source?.fps) ?? 24, frames = numberOf(take.frames) ?? numberOf(record?.source?.frames);
  return {key: said.line, clip: take.id, video: take.media?.video ?? (typeof record?.source?.path === 'string' ? record.source.path : null), text: said.text,
    language: typeof said.language === 'string' ? said.language : '', voice: typeof said.voice === 'string' ? said.voice : null, fps, frames, seconds: frames === null ? null : frames / fps,
    soundStart: numberOf(said.soundStartsAtSeconds) ?? LEAD, soundEnd: numberOf(said.soundEndsAtSeconds), judged: take.inbox !== true,
    dealer: typeof take.dealer === 'string' ? take.dealer : typeof record?.dealer === 'string' ? record.dealer : '', place: place(take)};
}
/** Every spoken film a dealer has, the one to play per key: an accepted take before one nobody has judged, that before one set
 * aside, that before one still in the inbox; among equals the newest. */
export function spokenFilms(takes: readonly SpeechTake[], dealer: string, options: SpokenOptions = {}): Record<string, Spoken> {
  const out: Record<string, Spoken> = {};
  const mine = takes.map(read).filter((s): s is Spoken & {dealer: string; place: number} => !!s && s.dealer === dealer && (!options.language || s.language === options.language) && (!options.voice || s.voice === options.voice));
  mine.sort((a, b) => b.place - a.place || takeNumber(b.clip) - takeNumber(a.clip) || b.clip.localeCompare(a.clip));
  for (const {dealer: _, place: __, ...spoken} of mine) out[spoken.key] ??= spoken;
  return out;
}
/** The film for a line's key or for a phase of the round; null when the dealer has none. */
export function spokenFilm(takes: readonly SpeechTake[], dealer: string, keyOrPhase: string, options: SpokenOptions = {}): Spoken | null {
  const key = Object.hasOwn(PHASE_LINE, keyOrPhase) ? PHASE_LINE[keyOrPhase] : keyOrPhase.toLowerCase();
  return spokenFilms(takes, dealer, options)[key] ?? null;
}
/** The film that answers what the player wrote in the chat; null when the dealer has no film for that reply. */
export const chatReply = (takes: readonly SpeechTake[], dealer: string, written: string, count = 0, options: SpokenOptions = {}): Spoken | null => spokenFilm(takes, dealer, chatKey(written, count), options);
