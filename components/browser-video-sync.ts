"use client";

import { useEffect, useRef, useState } from "react";

export type BrowserVideoState = {
  connected: boolean;
  currentTime: number;
  duration: number | null;
  paused: boolean;
  playbackRate: number;
  title: string;
  url: string;
  capturedAt: number;
  receivedAt: number;
};

const EMPTY: BrowserVideoState = {
  connected: false,
  currentTime: 0,
  duration: null,
  paused: true,
  playbackRate: 1,
  title: "",
  url: "",
  capturedAt: 0,
  receivedAt: 0,
};

const DIRECT_SOURCE = "F1_DATA_TERMINAL_EXTENSION";
const STALE_MS = 1800;

export function useBrowserVideoSync() {
  const [state, setState] = useState<BrowserVideoState>(EMPTY);
  const lastDirectRef = useRef(0);

  useEffect(() => {
    let active = true;
    let pollTimer = 0;
    let staleTimer = 0;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== DIRECT_SOURCE || !event.data.state) return;
      const next = event.data.state as BrowserVideoState;
      lastDirectRef.current = Date.now();
      setState({ ...next, connected: true, receivedAt: next.receivedAt || Date.now() });
    };

    window.addEventListener("message", onMessage);

    const pollFallback = async () => {
      try {
        // Direct extension-to-page messaging is preferred. Poll the legacy
        // localhost bridge only when no direct message has arrived recently.
        if (Date.now() - lastDirectRef.current > STALE_MS) {
          const response = await fetch("/api/video-sync", { cache: "no-store" });
          if (!response.ok) throw new Error(`Video sync bridge returned ${response.status}`);
          const next = await response.json() as BrowserVideoState;
          if (active && Date.now() - lastDirectRef.current > STALE_MS) setState(next);
        }
      } catch {
        if (active && Date.now() - lastDirectRef.current > STALE_MS) setState(EMPTY);
      } finally {
        if (active) pollTimer = window.setTimeout(pollFallback, 500);
      }
    };

    staleTimer = window.setInterval(() => {
      if (lastDirectRef.current && Date.now() - lastDirectRef.current > STALE_MS) {
        setState((current) => current.connected ? { ...current, connected: false } : current);
      }
    }, 500);

    void pollFallback();
    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(pollTimer);
      window.clearInterval(staleTimer);
    };
  }, []);

  return state;
}
