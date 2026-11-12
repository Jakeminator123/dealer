// Karta: the node map (components/map). The view reads the address (?kant=…&tagning=…), so it sits inside Suspense: in a
// static export the page is built without a query and the view is drawn in the browser.
import { Suspense } from "react";
import { KartaView } from "@/components/map/KartaView";
import { Page } from "@/components/shell";
import { Skeleton } from "@/components/ui";

export default function Karta() {
  return (
    <Suspense
      fallback={
        <Page title="Karta" full>
          <div className="grid h-full place-items-center p-10">
            <Skeleton className="h-[60%] w-[80%]" />
          </div>
        </Page>
      }
    >
      <KartaView />
    </Suspense>
  );
}
