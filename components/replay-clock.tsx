"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ReplayClockValue = {
  sessionStart: number;
  sessionEnd: number;
  raceTime: number;
  elapsed: number;
  duration: number;
  playing: boolean;
  rate: number;
  syncOffsetMs: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (elapsedMs: number) => void;
  nudge: (deltaMs: number) => void;
  setRate: (rate: number) => void;
  setSyncOffsetMs: (offset: number) => void;
};

const ReplayClockContext = createContext<ReplayClockValue | null>(null);

export function ReplayClockProvider({
  sessionStart,
  sessionEnd,
  children,
}: {
  sessionStart: string;
  sessionEnd: string;
  children: React.ReactNode;
}) {
  const start = Date.parse(sessionStart);
  const end = Date.parse(sessionEnd);
  const duration = Math.max(0, end - start);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [syncOffsetMs, setSyncOffsetMs] = useState(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      lastRef.current = null;
      return;
    }

    lastRef.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const previous = lastRef.current ?? now;
      const delta = (now - previous) * rate;
      lastRef.current = now;
      setElapsed((current) => {
        const next = Math.min(duration, current + delta);
        if (next >= duration) setPlaying(false);
        return next;
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [playing, rate, duration]);

  const seek = useCallback((next: number) => setElapsed(Math.max(0, Math.min(duration, next))), [duration]);
  const nudge = useCallback((delta: number) => setElapsed((current) => Math.max(0, Math.min(duration, current + delta))), [duration]);
  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((v) => !v), []);
  const setRate = useCallback((nextRate: number) => setRateState(nextRate), []);

  const value = useMemo<ReplayClockValue>(
    () => ({
      sessionStart: start,
      sessionEnd: end,
      raceTime: start + elapsed + syncOffsetMs,
      elapsed,
      duration,
      playing,
      rate,
      syncOffsetMs,
      play,
      pause,
      toggle,
      seek,
      nudge,
      setRate,
      setSyncOffsetMs,
    }),
    [start, end, elapsed, syncOffsetMs, duration, playing, rate, play, pause, toggle, seek, nudge, setRate],
  );

  return <ReplayClockContext.Provider value={value}>{children}</ReplayClockContext.Provider>;
}

export function useReplayClock() {
  const value = useContext(ReplayClockContext);
  if (!value) throw new Error("useReplayClock must be used inside ReplayClockProvider");
  return value;
}
