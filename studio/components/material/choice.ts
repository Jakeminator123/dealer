// What a choice of a picture by hand leads to, in the words the confirm dialog says (StateDecision): the pictures set aside,
// how many clips are built on what holds now and become marked as older, and that Arkivera never deletes. Pure.
import { consequenceOfHolding, type Lineage } from "../../lib/lineage.ts";
import type { Entry, State } from "../../lib/media.ts";
import { replacedBy } from "./state.ts";

type Picture = Pick<Entry, "id" | "role" | "node" | "card" | "state" | "name">;

export function changeLines<T extends Picture>(entry: T, to: State, dealerEntries: readonly T[], lineage: Lineage): { lines: string[]; aside: string[] } {
  if (to === "gäller") {
    const aside = replacedBy(dealerEntries, entry).map((e) => e.name);
    return { lines: ["Bilden gäller från nu. Filmer och bilder beställs från den.", consequenceOfHolding(dealerEntries, entry, lineage).line], aside };
  }
  if (to === "ersatt") return { lines: ["Bilden läggs åt sidan och beställs inte från. Du kan göra den till den som gäller igen när du vill."], aside: [] };
  if (to === "arkiverad") return { lines: ["Den tas ur listorna men raderas inte. Ta tillbaka gör den till kandidat igen.", ...(entry.state === "gäller" ? ["Rollen har sedan ingen bild som gäller."] : [])], aside: [] };
  return { lines: ["Den kommer tillbaka som kandidat."], aside: [] };
}
