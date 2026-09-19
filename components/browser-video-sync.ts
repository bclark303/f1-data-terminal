"use client";
import { useEffect } from "react";
import {
  isNewerState,
  isTerminalUrl,
  parseVideoState,
  STALE_MS,
} from "@/shared/video-protocol.js";
import type { VideoState } from "@/shared/video-protocol";
export function useBrowserVideoSync(
  onState: (state: VideoState | null) => void,
) {
  useEffect(() => {
    if (!isTerminalUrl(location.href)) return;
    let current: VideoState | null = null;
    let timer = 0;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.source !== "F1_DATA_TERMINAL_EXTENSION"
      )
        return;
      if (event.data.state === null) {
        current = null;
        clearTimeout(timer);
        onState(null);
        return;
      }
      const next = parseVideoState(event.data.state);
      if (!next || !isNewerState(current, next)) return;
      current = next;
      onState(next);
      clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          current = null;
          onState(null);
        },
        Math.max(0, STALE_MS - (Date.now() - next.capturedAt)),
      );
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      clearTimeout(timer);
    };
  }, [onState]);
}
