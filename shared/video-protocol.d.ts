export type VideoState = {
  version: number;
  currentTime: number;
  duration: number | null;
  playbackRate: number;
  capturedAt: number;
  sequence: number;
  sourceId: string;
  title: string;
  paused: boolean;
  buffering: boolean;
  ended: boolean;
  wallClockMs: number | null;
  contentId: string | null;
  rawCurrentTime: number | null;
  clockSource: "bitmovin-ui" | "f1tv-ui" | "html5";
  uiClockText: string | null;
  uiDuration: number | null;
};
export const PROTOCOL_VERSION: number;
export const STALE_MS: number;
export const TERMINAL_ORIGINS: string[];
export function isTerminalUrl(value: unknown): boolean;
export function parseVideoState(
  value: unknown,
  now?: number,
): VideoState | null;
export function isNewerState(
  previous: VideoState | null,
  next: VideoState,
): boolean;
