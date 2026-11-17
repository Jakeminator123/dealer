"use client";

// Which takes on Karta were built on a picture that no longer holds (marks.ts over the lab's media answer, GET /api/media).
// Read once per page and shared; on the online copy (no /api/media) it gives nothing and says nothing. Information, not a
// verdict: nothing here touches the bank, and a marked take keeps playing. The pictures are chosen in Material only.
import { useEffect, useState } from "react";
import type { MediaAnswer } from "@/lib/media";
import { isSnapshot } from "@/lib/mode";
import { getMedia } from "../material/client";
import { marksFrom, type Mark } from "./marks";

export type { Mark } from "./marks";

let shared: Promise<MediaAnswer | null> | null = null;
const readOnce = () => (shared ??= getMedia().catch(() => null));

export function useOlder(): (takeId: string) => Mark[] {
  const [answer, setAnswer] = useState<MediaAnswer | null>(null);
  useEffect(() => {
    if (isSnapshot) return;
    let live = true;
    void readOnce().then((a) => live && setAnswer(a));
    return () => {
      live = false;
    };
  }, []);
  return (takeId: string) => marksFrom(answer, takeId);
}
