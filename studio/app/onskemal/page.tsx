// Önskemål (/onskemal/): the requests to Jakob and his answers (components/requests). Only in the online copy; the lab
// shows a word on where they are.
import { RequestsView } from "@/components/requests/RequestsView";
import { ViewContext } from "@/lib/context";

export default function Onskemal() {
  return (
    <>
      <ViewContext vy="onskemal" />
      <RequestsView />
    </>
  );
}
