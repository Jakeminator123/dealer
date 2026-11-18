"use client";

// The inbox is read with full studio access when the copy opens, each visible minute and after a request is sent.
// The rail counts answers this browser has yet to show.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BotError, readRequestsSession, type Post, type StudioAccess } from "../../lib/bot-client.ts";
import { KEYS, readJsonValue, writeJsonValue } from "../bot/storage";
import { countUnseen, markSeen, type Seen } from "./status";

export type RequestsState = {
  enabled: boolean;
  access: StudioAccess | null;
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
const OFF: RequestsState = { enabled: false, access: null, posts: null, error: null, reload: async () => {}, unseen: 0, seen: {}, markAllSeen: () => {} };

export function useRequests(): RequestsState {
  return useContext(Context) ?? OFF;
}

export function RequestsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [access, setAccess] = useState<StudioAccess | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Seen>({});
  const busy = useRef(false);

  useEffect(() => setSeen(readJsonValue<Seen>(KEYS.seen, {})), []);

  const reload = useCallback(async () => {
    if (!enabled || busy.current) return;
    busy.current = true;
    try {
      const { posts } = await readRequestsSession(setAccess);
      setPosts(posts);
      setError(null);
    } catch (e) {
      const fel = e instanceof BotError ? e.fel : null;
      if (fel?.kod === "utloggad" || fel?.kod === "spelbehorighet") {
        // The session may have ended between the status check and the inbox request.
        setAccess(fel.kod === "spelbehorighet" ? "game" : "none");
        setPosts(null);
        setError(null);
      } else {
        setError(fel?.text ?? "Önskemålen kunde inte läsas.");
      }
    } finally {
      busy.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const back = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || access !== "all") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, access, reload]);

  const markAllSeen = useCallback(() => {
    if (!posts) return;
    const before = readJsonValue<Seen>(KEYS.seen, {});
    const next = markSeen(posts, before);
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    writeJsonValue(KEYS.seen, next);
    setSeen(next);
  }, [posts]);

  const value = useMemo<RequestsState>(
    () => ({ enabled, access, posts, error, reload, unseen: posts ? countUnseen(posts, seen) : 0, seen, markAllSeen }),
    [enabled, access, posts, error, reload, seen, markAllSeen],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
