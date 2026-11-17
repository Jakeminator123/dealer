// The marks of a take on Karta: each of its pictures whose place another picture holds now (studio/lib/lineage.ts olderOf),
// with the address that opens the picture it was built on in Material. Pure; tests in studio/tests/choice.test.ts.
import { DEALER_PARAM } from "../../lib/dealer.ts";
import { olderOf, type Older } from "../../lib/lineage.ts";
import type { Entry, MediaAnswer } from "../../lib/media.ts";

export type Mark = Older & { href: string; title: string };
type AnswerLike = { dealers: readonly { id: string; entries: readonly Pick<Entry, "id" | "role" | "node" | "card" | "state" | "name">[] }[]; lineage?: MediaAnswer["lineage"] };

export function marksFrom(answer: AnswerLike | null, takeId: string): Mark[] {
  if (!answer?.lineage) return [];
  const entries = answer.dealers.flatMap((d) => d.entries.map((e) => ({ ...e, dealer: d.id })));
  const byId = new Map(entries.map((e) => [e.id, e]));
  return olderOf(answer.lineage[takeId], entries).map((o) => {
    const built = byId.get(o.built), holds = byId.get(o.holds);
    const query = new URLSearchParams({ bild: o.built, ...(built ? { [DEALER_PARAM]: built.dealer } : {}) });
    return { ...o, href: `/material/?${query.toString()}`, title: `Byggd på ${built?.name ?? o.built}; ${holds?.name ?? o.holds} gäller nu. Spelas som förut tills du väljer annat.` };
  });
}
