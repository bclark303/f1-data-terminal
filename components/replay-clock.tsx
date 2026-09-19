"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import {
  initialReplay,
  replayReducer,
  type VideoAnchor,
} from "@/lib/replay-state";
import type { VideoState } from "@/shared/video-protocol";
import { useBrowserVideoSync } from "./browser-video-sync";
function useClock(
  sessionStart: string,
  sessionEnd: string,
  sessionKey: number,
) {
  const [state, dispatch] = useReducer(replayReducer, null, () =>
    initialReplay(Date.parse(sessionStart), Date.parse(sessionEnd), sessionKey),
  );
  const receive = useCallback(
    (video: VideoState | null) =>
      dispatch({ type: "video", video, now: Date.now() }),
    [],
  );
  useBrowserVideoSync(receive);
  useEffect(() => {
    if (!state.playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      dispatch({ type: "tick", delta: now - last, now: Date.now() });
      last = now;
    }, 100);
    return () => clearInterval(timer);
  }, [state.playing, state.following]);
  const actions = useMemo(
    () => ({
      play: () => dispatch({ type: "play" }),
      pause: () => dispatch({ type: "pause" }),
      toggle: () => dispatch({ type: "toggle" }),
      seek: (value: number) => dispatch({ type: "seek", value }),
      nudge: (value: number) => dispatch({ type: "nudge", value }),
      setRate: (value: number) => dispatch({ type: "rate", value }),
      setSyncOffsetMs: (value: number) => dispatch({ type: "offset", value }),
      matchVideo: (anchor: VideoAnchor) => dispatch({ type: "anchor", anchor }),
      setFollowing: (enabled: boolean) => dispatch({ type: "follow", enabled }),
      clearVideo: () => dispatch({ type: "clear" }),
    }),
    [],
  );
  return {
    ...actions,
    sessionStart: state.start,
    sessionEnd: state.start + state.duration,
    raceTime:
      state.start +
      Math.max(0, Math.min(state.duration, state.elapsed + state.offset)),
    elapsed: state.elapsed,
    duration: state.duration,
    playing: state.playing,
    rate: state.rate,
    syncOffsetMs: state.offset,
    video: state.video,
    videoAnchor: state.anchor,
    following: state.following,
    status: state.status,
  };
}
const ReplayClockContext = createContext<ReturnType<typeof useClock> | null>(
  null,
);
export function ReplayClockProvider({
  sessionStart,
  sessionEnd,
  sessionKey,
  children,
}: {
  sessionStart: string;
  sessionEnd: string;
  sessionKey: number;
  children: React.ReactNode;
}) {
  const value = useClock(sessionStart, sessionEnd, sessionKey);
  return (
    <ReplayClockContext.Provider value={value}>
      {children}
    </ReplayClockContext.Provider>
  );
}
export function useReplayClock() {
  const value = useContext(ReplayClockContext);
  if (!value) throw new Error("Replay clock missing");
  return value;
}
