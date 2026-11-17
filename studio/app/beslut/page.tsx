// Beslut (/beslut/): what waits for Jakob's answer, one card per thing, the most urgent first (components/decisions). Only
// in the local lab: the online copy shows a word instead, and its rail and start page leave the view out.
import { DecisionsView } from "@/components/decisions";
import { Page } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";

export default function Beslut() {
  if (isSnapshot)
    return (
      <Page title="Beslut">
        <EmptyState title="Beslut finns bara i labbet">Jakob svarar i sitt eget labb.</EmptyState>
      </Page>
    );
  return <DecisionsView />;
}
