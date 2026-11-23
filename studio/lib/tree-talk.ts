// A tree's talk (Jakob 2026-11-23: "de där talfilmerna, vart syns dem? De ska väl rimligen in i nodträdet också"): the
// dealer's fixed lines (data/speech.json, `lines` and `chat`) and, per line, the talk film the game plays in the tree, or
// none. A talk film is a rest take with sound laid on a rest film (src/speech-lines.ts; its record's speech.restFilm), and
// tools/dealer-tree.ts places it in the tree that rest film stands in. In a tree the game keeps the tree's own takes and
// those of no tree (src/dealer-trees.ts cutBank); among them spokenFilms picks one film per line in the game's voice. The
// count is its own ("Tal 25/25"), beside the tree's 36 steps and never in them. Pure: the lab server computes it for
// GET /api/trees (tools/dealer-tree.ts viewsOf) and Karta draws it (TreeCanvas, TalkSheet, TreeRow).
// Tests: studio/tests/tree-talk.test.ts.
import type { TreeView } from "../../src/dealer-trees.ts";
import { GAME_VOICE, PHASE_LINE, spokenFilms, spokenLine, type SpeechTake } from "../../src/speech-lines.ts";

/** What is read of data/speech.json. */
export type TalkRegister = {
  dealers?: Record<string, { language?: string }>;
  names?: Record<string, string>;
  lines?: Record<string, Record<string, string>>;
  chat?: Record<string, Record<string, string>>;
};
/** runda: a line the round says (the table's lines and the phases' lines); chatt: a reply in the chat. */
export type TalkKind = "runda" | "chatt";
/**
 * One line: its key, its short name ("Insatser", "Hälsning"), its text, and the film the game plays for it in the tree
 * (clip null: none, the game shows the text); takes: the line's talk films in the tree, of any verdict.
 */
export type TalkLine = { key: string; name: string; kind: TalkKind; text: string; clip: string | null; video: string | null; fps: number; frames: number | null; takes: number };
/** have: lines the game has a film for in the tree, of total; takes: the tree's talk films (archived left out). */
export type TreeTalk = { have: number; total: number; takes: number; lines: TalkLine[] };
/** A tree as the lab answers it, with its talk (an older lab server gives none). */
export type TalkView = TreeView & { talk?: TreeTalk };

/** The tree's talk where the lab gave it, else null. */
export const talkOf = (view: TreeView): TreeTalk | null => (view as TalkView).talk ?? null;
/** "25/25". */
export const talkWord = (t: Pick<TreeTalk, "have" | "total">): string => `${t.have}/${t.total}`;

/** The line's short name: data/speech.json's name without "Chatt, ", with a capital first. */
const shortName = (key: string, names: TalkRegister["names"]): string => {
  const name = (names?.[key] ?? key).replace(/^Chatt,\s*/i, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/**
 * The tree's talk. rests: the dealer's rest takes (IDLE>IDLE) as the game's bank holds them (judgedBank), each with its
 * record in `motion`; all: every rest take of the bank, judged or not (the count); treeOf: the tree a take is placed in
 * (null: none); home: the tree whose films the tree plays (itself, or the one it shares).
 */
export function treeTalk(
  register: TalkRegister | null,
  dealer: string,
  home: string,
  rests: readonly (SpeechTake & { archived?: boolean })[],
  all: readonly (SpeechTake & { archived?: boolean })[],
  treeOf: (id: string) => string | null,
): TreeTalk {
  const kept = (id: string) => {
    const tree = treeOf(id);
    return tree === null || tree === home;
  };
  // An archived take never plays (judgedBank leaves it out already; said again here).
  const played = spokenFilms(rests.filter((t) => !t.archived && kept(t.id)), dealer, { voice: GAME_VOICE });
  const mine = all.filter((t) => !t.archived && kept(t.id) && spokenLine(t) !== null);
  const language = register?.dealers?.[dealer]?.language ?? "sv";
  const round = register?.lines?.[language] ?? {}, chat = register?.chat?.[language] ?? {};
  const phases = new Set(Object.values(PHASE_LINE));
  // The round's lines first (the table's, then a phase's line kept among the chat's), then the chat's; a line that has a film
  // but no row in the register comes last, with the film's own text.
  const keys = [...Object.keys(round), ...Object.keys(chat).filter((k) => phases.has(k)), ...Object.keys(chat).filter((k) => !phases.has(k))];
  for (const k of [...Object.keys(played), ...mine.map((t) => spokenLine(t)!)]) if (!keys.includes(k)) keys.push(k);
  const lines = [...new Set(keys)].map((key): TalkLine => {
    const film = played[key] ?? null;
    return {
      key,
      name: shortName(key, register?.names),
      kind: Object.hasOwn(round, key) || phases.has(key) ? "runda" : "chatt",
      text: film?.text ?? round[key] ?? chat[key] ?? "",
      clip: film?.clip ?? null,
      video: film?.video ?? null,
      fps: film?.fps ?? 24,
      frames: film?.frames ?? null,
      takes: mine.filter((t) => spokenLine(t) === key).length,
    };
  });
  return { have: lines.filter((l) => l.clip).length, total: lines.length, takes: mine.length, lines };
}
