// Docka (/docka/): the doll lab inside the studio's shell, so that it is a page of the studio and not a loose one (Jakob
// 2026-11-23). The lab itself is dealer3d/page/docka.html, which the lab server serves at /dealer3d/docka
// (dealer3d/page/server.ts); here it fills the view in a frame. Only in the local lab: the online copy has no doll lab,
// shows a word instead, and its rail leaves the view out.
import { Page } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { isSnapshot } from "@/lib/mode";

export default function DollLab() {
  if (isSnapshot)
    return (
      <Page title="Docka">
        <EmptyState title="Docklabbet finns bara i labbet">Dockan ställs och spelas i Jakobs lokala labb.</EmptyState>
      </Page>
    );
  return (
    <Page title="Docka" full>
      <iframe src="/dealer3d/docka" title="Docklabbet" className="absolute inset-0 size-full border-0" />
    </Page>
  );
}
