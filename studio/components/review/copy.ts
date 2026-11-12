// Granska in the online copy (lib/mode.ts isSnapshot): the copy carries no films of the takes that wait for Jakob, so it
// opens on "Alla" and its "Kö" says what waits instead of opening a player without a film. Pure, for the tests
// (studio/tests/review-copy.test.ts).
import type { QueueItem } from "../../lib/review.ts";

export type ReviewTab = "ko" | "alla";

/** The tab the address asks for (?vy=ko, ?vy=alla); without one the lab opens on the queue and the copy on "Alla". */
export function tabOf(vy: string | null, snapshot: boolean): ReviewTab {
  if (vy === "alla" || vy === "ko") return vy;
  return snapshot ? "alla" : "ko";
}

/** The ?vy= value that gives a tab: none for the default tab, so a plain address stays plain. */
export function vyFor(tab: ReviewTab, snapshot: boolean): string | null {
  return tab === tabOf(null, snapshot) ? null : tab;
}

/** What waits, as the copy's queue shows it: in queue order, with how many of them have a still or a film there. */
export function waitingInCopy(items: readonly QueueItem[]): { items: QueueItem[]; withPicture: number; withFilm: number } {
  const waiting = items.filter((i) => !i.decided);
  return {
    items: waiting,
    withPicture: waiting.filter((i) => !!(i.take.media.first || i.take.media.video)).length,
    withFilm: waiting.filter((i) => !!i.take.media.video).length,
  };
}
