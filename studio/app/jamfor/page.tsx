// Jämför (/jamfor/?kant=<edge>&a=<take>&b=<take>): a take beside the primary. Opened from a take, not from the menu.
import { Suspense } from "react";
import { CompareView } from "@/components/compare";
import { Page } from "@/components/shell";
import { ViewContext } from "@/lib/context";

export default function Jamfor() {
  return (
    <Suspense fallback={<Page title="Jämför" />}>
      <ViewContext vy="jamfor" />
      <CompareView />
    </Suspense>
  );
}
