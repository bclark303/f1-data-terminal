// Shared by the app and extension (copied into the unpacked extension at build time).
export const PROTOCOL_VERSION = 1;
export const STALE_MS = 2000;
export const TERMINAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
export function isTerminalUrl(value) {
  try {
    return TERMINAL_ORIGINS.includes(new URL(value).origin);
  } catch {
    return false;
  }
}
export function parseVideoState(value, now = Date.now()) {
  if (!value || typeof value !== "object" || value.version !== PROTOCOL_VERSION)
    return null;
  const {
    currentTime,
    duration,
    playbackRate,
    capturedAt,
    sequence,
    sourceId,
    title,
    paused,
    buffering,
    ended,
    wallClockMs,
    contentId,
    rawCurrentTime,
    clockSource,
  } = value;
  if (
    ![currentTime, playbackRate, capturedAt, sequence].every(Number.isFinite) ||
    currentTime < 0 ||
    currentTime > 86400 ||
    playbackRate < 0.05 ||
    playbackRate > 16 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 0
  )
    return null;
  if (capturedAt > now + 1000 || now - capturedAt > STALE_MS) return null;
  if (
    duration !== null &&
    (!Number.isFinite(duration) || duration < 0 || duration > 86400)
  )
    return null;
  if (
    typeof sourceId !== "string" ||
    !sourceId ||
    sourceId.length > 240 ||
    typeof title !== "string"
  )
    return null;
  if ([paused, buffering, ended].some((v) => typeof v !== "boolean"))
    return null;
  const normalizedWallClock =
    wallClockMs === null || wallClockMs === undefined
      ? null
      : Number.isFinite(wallClockMs) &&
          wallClockMs >= 946684800000 &&
          wallClockMs <= 4102444800000
        ? wallClockMs
        : null;
  const normalizedContentId =
    contentId === null || contentId === undefined
      ? null
      : typeof contentId === "string" && /^\d{6,20}$/.test(contentId)
        ? contentId
        : null;
  const normalizedRawCurrentTime =
    rawCurrentTime === null || rawCurrentTime === undefined
      ? null
      : Number.isFinite(rawCurrentTime) &&
          rawCurrentTime >= 0 &&
          rawCurrentTime <= 86400
        ? rawCurrentTime
        : null;
  const normalizedClockSource =
    clockSource === "bitmovin-ui" || clockSource === "html5"
      ? clockSource
      : "html5";
  return {
    version: PROTOCOL_VERSION,
    currentTime,
    duration,
    playbackRate,
    capturedAt,
    sequence,
    sourceId,
    title: title.slice(0, 240),
    paused,
    buffering,
    ended,
    wallClockMs: normalizedWallClock,
    contentId: normalizedContentId,
    rawCurrentTime: normalizedRawCurrentTime,
    clockSource: normalizedClockSource,
  };
}
export function isNewerState(previous, next) {
  return (
    !previous ||
    previous.sourceId !== next.sourceId ||
    (next.sequence > previous.sequence &&
      next.capturedAt >= previous.capturedAt)
  );
}
