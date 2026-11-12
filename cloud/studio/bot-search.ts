// The bot's knowledge as it ships with the function, and the search that picks the sections a question gets. The knowledge is
// built with the snapshot (tools/build-knowledge.ts): a core that goes with every question, and the rest split at headings
// into sections that are searched with BM25, here in the package, no service. Pure: no network, no files.

export type Section = {id: string; titel: string; text: string};
export type Knowledge = {
  schemaVersion: 1;
  byggd: string;
  /** The sources it was made from, by name ("HANDOFF", "Scoutgaming › Ordlista"), for the rules. */
  kallor: string[];
  /** Goes with every question, in this order, so the provider can cache it. */
  karna: Section[];
  /** Searched per question. */
  avsnitt: Section[];
};

// Words too common to tell sections apart, Swedish and English, folded as the tokens are.
const STOP = new Set(('och att det som en på är av för med till den har de inte om ett kan men var vi så han hon sig ska vad '
  + 'från eller när där här nu också bara efter under vid alla allt andra mot ut upp in över utan går finns får blir hur '
  + 'vilken vilka vilket varför dag dess deras denna detta dessa man mer mest många inga ingen inget sin sina sitt the and of '
  + 'to in is for on with as by at be it this that are or from an not was').split(' ').map(w => fold(w)));

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// A light Swedish stemmer: the commonest endings off, never below four letters. Enough for "godkända"/"godkänd",
// "tagningarna"/"tagning", "returerna"/"retur".
const ENDINGS = ['heterna', 'hetens', 'arnas', 'ernas', 'ornas', 'arna', 'erna', 'orna', 'ande', 'ende', 'heten', 'het', 'aste', 'ast', 'ens', 'ets', 'are', 'ade', 'an', 'en', 'et', 'ar', 'er', 'or', 'na', 'a', 'e', 's'];
export function stem(word: string): string {
  for (const end of ENDINGS) if (word.length - end.length >= 4 && word.endsWith(end)) return word.slice(0, -end.length);
  return word;
}

/** The searchable words of a text: folded, split at anything but letters and digits, stopwords out, stemmed. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of fold(text).split(/[^\p{L}\p{N}]+/u)) {
    if (!raw || raw.length > 40 || STOP.has(raw)) continue;
    if (raw.length === 1 && !/\d/.test(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

/**
 * A question with the bank's own short names added for the words people use: "plats 6" also asks for P6, P6C1 and P6C2,
 * "dealerns kort" for DC1 and DC2, "hålkortet" for DC2 and its turn, "vila" for A1 and IDLE, "nyp" for A2.1 and READY.
 */
export function expandQuery(query: string): string {
  const more: string[] = [];
  for (const m of query.matchAll(/\b(?:plats|spelare|box|p)\s*([1-7])\b/gi)) more.push(`P${m[1]} P${m[1]}C1 P${m[1]}C2`);
  if (/dealer(?:n|ns)?\b[^.?!]*\bkort|dealerns/i.test(query)) more.push('DC1 DC2');
  if (/hålkort/i.test(query)) more.push('DC2 REVEAL');
  if (/\bvila\b|\bviloläge/i.test(query)) more.push('A1 IDLE');
  if (/\bnyp/i.test(query)) more.push('READY');
  if (/hand över|släp/i.test(query)) more.push('READY-B');
  return more.length ? `${query} ${more.join(' ')}` : query;
}

export type Hit = {section: Section; score: number};

/** BM25 over the sections (k1 1.2, b 0.75); a section's title counts twice. */
export class Index {
  private readonly docs: {section: Section; tf: Map<string, number>; length: number}[];
  private readonly df = new Map<string, number>();
  private readonly average: number;
  constructor(sections: readonly Section[]) {
    this.docs = sections.map(section => {
      const words = [...tokenize(section.titel), ...tokenize(section.titel), ...tokenize(section.text)];
      const tf = new Map<string, number>();
      for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
      for (const w of tf.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1);
      return {section, tf, length: words.length};
    });
    this.average = this.docs.reduce((s, d) => s + d.length, 0) / Math.max(1, this.docs.length);
  }
  search(query: string, k = 6): Hit[] {
    const terms = [...new Set(tokenize(expandQuery(query)))], n = this.docs.length;
    if (!terms.length || !n) return [];
    const hits: Hit[] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t)!, idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.length / this.average));
      }
      if (score > 0) hits.push({section: d.section, score});
    }
    return hits.sort((a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id)).slice(0, k);
  }
}

/** The core as one text, the same bytes for every question (the provider caches a prefix only if it is identical). */
export const coreText = (knowledge: Knowledge): string => knowledge.karna.map(s => `### [${s.titel}]\n${s.text.trim()}`).join('\n\n');
