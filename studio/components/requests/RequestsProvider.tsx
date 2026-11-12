"use client";

// The requests to Jakob for the whole copy: read when the copy opens, every minute while the tab is in view, and after a
// request is sent. The rail's count is the answers from Jakob this browser has not shown yet (components/requests/status).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BotError, listRequests, type Post } from "../../lib/bot-client.ts";
import { KEYS, readJsonValue, writeJsonValue } from "../bot/storage";
import { countUnseen, markSeen, type Seen } from "./status";

export type RequestsState = {
  enabled: boolean;
  posts: Post[] | null;
  error: string | null;
  reload: () => Promise<void>;
  /** Answers not yet shown in this browser. */
  unseen: number;
  /** What was seen when the list was opened (to mark new answers there). */
  seen: Seen;
  markAllSeen: () => void;
};

const Context = createContext<RequestsState | null>(null);
const OFF: RequestsState = { enabled: false, posts: null, error: null, reload: async () => {}, unseen: 0, seen: {}, markAllSeen: () => {} };

export function useRequests(): RequestsState {
  return useContext(Context) ?? OFF;
}

export function RequestsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Seen>({});
  const busy = useRef(false);

  useEffect(() => setSeen(readJsonValue<Seen>(KEYS.seen, {})), []);

  const reload = useCallback(async () => {
    if (!enabled || busy.current) return;
    busy.current = true;
    try {
      setPosts(await listRequests());
      setError(null);
    } catch (e) {
      setError(e instanceof BotError ? e.fel.text : "Önskemålen kunde inte läsas.");
    } finally {
      busy.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60_000);
    const back = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [enabled, reload]);

  const markAllSeen = useCallback(() => {
    if (!posts) return;
    const before = readJsonValue<Seen>(KEYS.seen, {});
    const next = markSeen(posts, before);
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    writeJsonValue(KEYS.seen, next);
    setSeen(next);
  }, [posts]);

  const value = useMemo<RequestsState>(
    () => ({ enabled, posts, error, reload, unseen: posts ? countUnseen(posts, seen) : 0, seen, markAllSeen }),
    [enabled, posts, error, reload, seen, markAllSeen],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
