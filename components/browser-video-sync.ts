"use client";

import { useEffect, useState } from "react";

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

export function useBrowserVideoSync() {
  const [state, setState] = useState<BrowserVideoState>(EMPTY);

  useEffect(() => {
    let active = true;
    let timer = 0;

    const poll = async () => {
      try {
        const response = await fetch("/api/video-sync", { cache: "no-store" });
        if (!response.ok) throw new Error(`Video sync bridge returned ${response.status}`);
        const next = await response.json() as BrowserVideoState;
        if (active) setState(next);
      } catch {
        if (active) setState(EMPTY);
      } finally {
        if (active) timer = window.setTimeout(poll, 250);
      }
    };

    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return state;
}
