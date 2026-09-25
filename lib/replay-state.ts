import type { VideoState } from "../shared/video-protocol";
import { STALE_MS } from "../shared/video-protocol.js";
export type VideoAnchor = {
  lap: number;
  raceTimeMs: number;
  videoTime: number;
  sourceId: string;
  sessionKey: number;
  kind?: "wall-clock" | "offset" | "manual";
};
export type ReplayState = {
  start: number;
  duration: number;
  elapsed: number;
  rate: number;
  playing: boolean;
  offset: number;
  following: boolean;
  status:
    "manual" | "following" | "paused" | "stalled" | "disconnected" | "ended";
  anchor: VideoAnchor | null;
  video: VideoState | null;
  sessionKey: number;
};
export type ReplayAction =
  | { type: "tick"; delta: number; now: number }
  | { type: "video"; video: VideoState | null; now: number }
  | { type: "seek" | "nudge" | "rate" | "offset"; value: number }
  | { type: "play" | "pause" | "toggle" | "clear" }
  | { type: "anchor"; anchor: VideoAnchor }
  | { type: "follow"; enabled: boolean };
export function projectVideo(video: VideoState, now = Date.now()) {
  const advancing = !video.paused && !video.buffering && !video.ended;
  return Math.min(
    video.duration ?? Infinity,
    video.currentTime +
      (advancing
        ? (Math.max(0, Math.min(500, now - video.capturedAt)) / 1000) *
          video.playbackRate
        : 0),
  );
}
export function initialReplay(
  start: number,
  end: number,
  sessionKey: number,
): ReplayState {
  if (![start, end].every(Number.isFinite) || end <= start)
    throw new Error("Invalid replay bounds");
  return {
    start,
    duration: end - start,
    sessionKey,
    elapsed: 0,
    rate: 1,
    playing: false,
    offset: 0,
    following: false,
    status: "manual",
    anchor: null,
    video: null,
  };
}
function applyVideo(state: ReplayState, now: number): ReplayState {
  if (!state.following || !state.anchor) return state;
  const video = state.video;
  if (!video || now - video.capturedAt > STALE_MS)
    return { ...state, playing: false, status: "disconnected" };
  if (
    video.sourceId !== state.anchor.sourceId ||
    state.sessionKey !== state.anchor.sessionKey
  )
    return {
      ...state,
      anchor: null,
      following: false,
      playing: false,
      status: "manual",
    };
  const target =
    state.anchor.raceTimeMs +
    (projectVideo(video, now) - state.anchor.videoTime) * 1000 -
    state.start;
  const elapsed = Math.max(0, Math.min(state.duration, target));
  const ended = target >= state.duration || video.ended;
  return {
    ...state,
    elapsed,
    rate: video.playbackRate,
    playing: !ended && !video.paused && !video.buffering,
    status: ended
      ? "ended"
      : video.buffering
        ? "stalled"
        : video.paused
          ? "paused"
          : "following",
  };
}
export function replayReducer(
  state: ReplayState,
  action: ReplayAction,
): ReplayState {
  if ("value" in action && !Number.isFinite(action.value)) return state;
  const manual = { ...state, following: false, status: "manual" as const };
  switch (action.type) {
    case "video":
      return applyVideo({ ...state, video: action.video }, action.now);
    case "tick": {
      if (state.following) return applyVideo(state, action.now);
      if (!state.playing || !Number.isFinite(action.delta) || action.delta < 0)
        return state;
      const elapsed = Math.min(
        state.duration,
        state.elapsed + action.delta * state.rate,
      );
      return {
        ...state,
        elapsed,
        playing: elapsed < state.duration,
        status: elapsed >= state.duration ? "ended" : "manual",
      };
    }
    case "seek":
      return {
        ...manual,
        elapsed: Math.max(0, Math.min(state.duration, action.value)),
      };
    case "nudge":
      return {
        ...manual,
        elapsed: Math.max(
          0,
          Math.min(state.duration, state.elapsed + action.value),
        ),
      };
    case "rate":
      return { ...manual, rate: Math.max(0.05, Math.min(16, action.value)) };
    case "offset":
      return {
        ...state,
        offset: Math.max(-60000, Math.min(60000, action.value)),
      };
    case "play":
      return { ...manual, playing: state.elapsed < state.duration };
    case "pause":
      return { ...manual, playing: false };
    case "toggle":
      return {
        ...manual,
        playing: !state.playing && state.elapsed < state.duration,
      };
    case "clear":
      return { ...manual, anchor: null, playing: false };
    case "anchor":
      return applyVideo(
        { ...state, anchor: action.anchor, following: true, offset: 0 },
        Date.now(),
      );
    case "follow":
      return action.enabled
        ? applyVideo({ ...state, following: Boolean(state.anchor) }, Date.now())
        : { ...manual, playing: false };
  }
}
