// Lipsync (/lipsync/): what the lip-sync model actually uses, at which scales, with which settings, where it runs, the
// proofs and what is open (components/lipsync), read-only. Only in the local lab: the online copy shows a word instead, and
// its rail leaves the view out.
import { LipsyncView } from "@/components/lipsync";
import { Page } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";

export default function Lipsync() {
  if (isSnapshot)
    return (
      <Page title="Lipsync">
        <EmptyState title="Lipsync finns bara i labbet">Fakta om läppsynken läses i Jakobs lokala labb.</EmptyState>
      </Page>
    );
  return <LipsyncView />;
}
