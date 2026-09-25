"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "@/lib/time";
import { projectVideo } from "@/lib/replay-state";
import { useReplayClock } from "./replay-clock";
import { useReplaySync } from "./replay-sync-context";

const rates = [0.25, 0.5, 1, 2, 4];
const START_SYNC_WINDOW_SECONDS = 8;

type AutoSyncMetadata = {
  sessionStartSec: number;
  contentId: string | null;
};

type AutoSyncLookup = {
  key: string;
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  metadata: AutoSyncMetadata | null;
};

function formatVideoTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatUtc(ms: number) {
  return new Date(ms).toISOString().slice(11, 19) + " UTC";
}

function parseVideoClockLabel(value: string | null | undefined) {
  const text = value?.split("/")[0]?.trim();
  if (!text) return null;
  const parts = text.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}


export function ReplayControls() {
  const clock = useReplayClock();
  const sync = useReplaySync();
  const video = clock.video;
  const [syncOpen, setSyncOpen] = useState(false);
  const [selectedLap, setSelectedLap] = useState(sync.lapAnchors[0]?.lap ?? 1);
  const videoAnchor = clock.videoAnchor;
  const autoActive = clock.following;
  const attemptedAutoSources = useRef(new Set<string>());
  const [autoSync, setAutoSync] = useState<AutoSyncLookup>({
    key: "",
    status: "idle",
    metadata: null,
  });

  const lapOneAnchor = useMemo(
    () =>
      sync.lapAnchors.find((anchor) => anchor.lap === 1) ??
      sync.lapAnchors[0] ??
      null,
    [sync.lapAnchors],
  );

  const videoSourceId = video?.sourceId ?? null;
  const autoKey = videoSourceId
    ? `${sync.sessionKey}:${videoSourceId}`
    : "";
  const currentAutoSync: AutoSyncLookup = !videoSourceId
    ? { key: "", status: "idle", metadata: null }
    : autoSync.key === autoKey
      ? autoSync
      : { key: autoKey, status: "loading", metadata: null };

  const projectedVideoTime = video ? projectVideo(video) : null;
  const projectedWallClockMs =
    video?.wallClockMs != null && projectedVideoTime != null
      ? video.wallClockMs + (projectedVideoTime - video.currentTime) * 1000
      : null;
  const wallClockInSessionWindow =
    projectedWallClockMs != null &&
    projectedWallClockMs >= clock.sessionStart - 6 * 60 * 60 * 1000 &&
    projectedWallClockMs <= clock.sessionEnd + 6 * 60 * 60 * 1000;

  const contentMismatch = Boolean(
    video?.contentId &&
      currentAutoSync.metadata?.contentId &&
      video.contentId !== currentAutoSync.metadata.contentId,
  );
  const likelyEditedOrWrongTimeline = Boolean(
    video?.duration != null &&
      video.duration > 0 &&
      video.duration * 1000 < clock.duration * 0.6,
  );
  const offsetUnsafe =
    !wallClockInSessionWindow &&
    (contentMismatch || likelyEditedOrWrongTimeline);

  useEffect(() => {
    if (
      !video ||
      !videoSourceId ||
      video.wallClockMs == null ||
      !wallClockInSessionWindow
    )
      return;

    if (
      videoAnchor?.sourceId === videoSourceId &&
      (videoAnchor.kind === "wall-clock" ||
        videoAnchor.kind === "manual" ||
        videoAnchor.kind === "manual-start")
    )
      return;

    clock.setSyncOffsetMs(0);
    clock.matchVideo({
      lap: lapOneAnchor?.lap ?? 1,
      raceTimeMs: video.wallClockMs,
      videoTime: video.currentTime,
      sourceId: videoSourceId,
      sessionKey: sync.sessionKey,
      kind: "wall-clock",
    });
  }, [
    clock,
    lapOneAnchor?.lap,
    sync.sessionKey,
    video,
    videoAnchor,
    videoSourceId,
    wallClockInSessionWindow,
    offsetUnsafe,
  ]);

  useEffect(() => {
    if (
      !offsetUnsafe ||
      videoAnchor?.kind !== "offset" ||
      videoAnchor.sourceId !== videoSourceId
    )
      return;
    clock.clearVideo();
  }, [clock, offsetUnsafe, videoAnchor, videoSourceId]);

  useEffect(() => {
    if (!videoSourceId) return;

    const key = `${sync.sessionKey}:${videoSourceId}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);

    void fetch(
      `/api/auto-sync?sessionKey=${encodeURIComponent(String(sync.sessionKey))}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (response.status === 404)
          return { status: "unavailable" as const, metadata: null };
        if (!response.ok)
          return { status: "error" as const, metadata: null };
        const payload = (await response.json()) as Partial<AutoSyncMetadata>;
        if (
          !Number.isFinite(payload.sessionStartSec) ||
          Number(payload.sessionStartSec) < 0
        )
          return { status: "error" as const, metadata: null };
        return {
          status: "ready" as const,
          metadata: {
            sessionStartSec: Number(payload.sessionStartSec),
            contentId:
              typeof payload.contentId === "string" ? payload.contentId : null,
          },
        };
      })
      .then((result) => {
        if (!controller.signal.aborted) setAutoSync({ key, ...result });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setAutoSync({ key, status: "error", metadata: null });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [sync.sessionKey, videoSourceId]);

  const startSyncDeltaSec =
    projectedVideoTime != null && currentAutoSync.metadata
      ? projectedVideoTime - currentAutoSync.metadata.sessionStartSec
      : null;
  const startSyncInWindow =
    startSyncDeltaSec != null &&
    Math.abs(startSyncDeltaSec) <= START_SYNC_WINDOW_SECONDS;

  useEffect(() => {
    if (
      !videoSourceId ||
      !lapOneAnchor ||
      !currentAutoSync.metadata ||
      currentAutoSync.status !== "ready" ||
      wallClockInSessionWindow ||
      offsetUnsafe ||
      videoAnchor ||
      !startSyncInWindow
    )
      return;

    if (attemptedAutoSources.current.has(autoKey)) return;
    attemptedAutoSources.current.add(autoKey);

    const raceTimeMs = Date.parse(lapOneAnchor.raceTime);
    if (!Number.isFinite(raceTimeMs)) return;
    clock.setSyncOffsetMs(0);
    clock.matchVideo({
      lap: lapOneAnchor.lap,
      raceTimeMs,
      videoTime: currentAutoSync.metadata.sessionStartSec,
      sourceId: videoSourceId,
      sessionKey: sync.sessionKey,
      kind: "start",
    });
  }, [
    autoKey,
    clock,
    currentAutoSync.metadata,
    currentAutoSync.status,
    lapOneAnchor,
    offsetUnsafe,
    startSyncInWindow,
    sync.sessionKey,
    videoAnchor,
    videoSourceId,
    wallClockInSessionWindow,
  ]);

  const wallClockMatched = Boolean(
    videoAnchor &&
      videoSourceId &&
      videoAnchor.kind === "wall-clock" &&
      videoAnchor.sessionKey === sync.sessionKey &&
      videoAnchor.sourceId === videoSourceId,
  );
  const offsetMatched = Boolean(
    videoAnchor &&
      videoSourceId &&
      lapOneAnchor &&
      currentAutoSync.metadata &&
      !offsetUnsafe &&
      (videoAnchor.kind === "start" || videoAnchor.kind === "offset") &&
      videoAnchor.sessionKey === sync.sessionKey &&
      videoAnchor.sourceId === videoSourceId &&
      videoAnchor.lap === lapOneAnchor.lap &&
      Math.abs(
        videoAnchor.videoTime - currentAutoSync.metadata.sessionStartSec,
      ) < 0.001,
  );
  const manualStartMatched = Boolean(
    videoAnchor &&
      videoSourceId &&
      videoAnchor.kind === "manual-start" &&
      videoAnchor.sessionKey === sync.sessionKey &&
      videoAnchor.sourceId === videoSourceId,
  );
  const currentTimeMatched = Boolean(
    videoAnchor &&
      videoSourceId &&
      videoAnchor.kind === "current-time" &&
      videoAnchor.sessionKey === sync.sessionKey &&
      videoAnchor.sourceId === videoSourceId,
  );
  const autoMatched =
    wallClockMatched || offsetMatched || manualStartMatched || currentTimeMatched;
  const videoLocked = Boolean(video && videoAnchor && clock.following);
  const waitingForRaceStart = wallClockMatched
    ? Boolean(
        projectedWallClockMs != null &&
          projectedWallClockMs + 1000 < clock.sessionStart,
      )
    : Boolean(
        offsetMatched &&
          currentAutoSync.metadata &&
          projectedVideoTime !== null &&
          projectedVideoTime + 1 < currentAutoSync.metadata.sessionStartSec,
      );

  const selectedAnchor = useMemo(
    () => sync.lapAnchors.find((anchor) => anchor.lap === selectedLap) ?? null,
    [sync.lapAnchors, selectedLap],
  );

  const toggleSyncPopover = () => {
    if (syncOpen) {
      setSyncOpen(false);
      return;
    }

    if (sync.lapAnchors.length) {
      const next = sync.lapAnchors.find(
        (anchor) => Date.parse(anchor.raceTime) > clock.raceTime + 500,
      );
      const current = [...sync.lapAnchors]
        .reverse()
        .find((anchor) => Date.parse(anchor.raceTime) <= clock.raceTime + 500);
      setSelectedLap((next ?? current ?? sync.lapAnchors[0]).lap);
    }
    setSyncOpen(true);
  };

  const syncToCurrentVideoTime = () => {
    if (
      !video ||
      !lapOneAnchor ||
      !currentAutoSync.metadata ||
      currentAutoSync.status !== "ready" ||
      offsetUnsafe
    )
      return;

    attemptedAutoSources.current.add(
      `${sync.sessionKey}:${video.sourceId}`,
    );

    const raceStartMs = Date.parse(lapOneAnchor.raceTime);
    if (!Number.isFinite(raceStartMs)) return;

    const displayedVideoTime =
      parseVideoClockLabel(video.uiClockText) ??
      projectedVideoTime ??
      video.currentTime;
    const raceElapsedSec =
      displayedVideoTime - currentAutoSync.metadata.sessionStartSec;
    const clampedRaceElapsedMs = Math.max(
      0,
      Math.min(clock.duration, raceElapsedSec * 1000),
    );

    const basis = video.rawCurrentTime != null ? "raw" : "player";
    const anchorVideoTime = projectVideo(video, Date.now(), basis);

    clock.setSyncOffsetMs(0);
    clock.matchVideo({
      lap: lapOneAnchor.lap,
      raceTimeMs: raceStartMs + clampedRaceElapsedMs,
      videoTime: anchorVideoTime,
      sourceId: video.sourceId,
      sessionKey: sync.sessionKey,
      kind: "current-time",
      clock: basis,
    });
  };

  const matchNow = () => {
    if (!selectedAnchor) return;
    if (video)
      attemptedAutoSources.current.add(
        `${sync.sessionKey}:${video.sourceId}`,
      );
    const raceTimeMs = Date.parse(selectedAnchor.raceTime);
    clock.setSyncOffsetMs(0);
    clock.seek(raceTimeMs - clock.sessionStart);

    if (video) {
      clock.matchVideo({
        lap: selectedAnchor.lap,
        raceTimeMs,
        videoTime: projectVideo(video),
        sourceId: video.sourceId,
        sessionKey: sync.sessionKey,
        kind: "manual",
      });
    } else {
      clock.clearVideo();
      clock.play();
    }
  };

  const clearVideoAnchor = () => {
    if (video)
      attemptedAutoSources.current.add(
        `${sync.sessionKey}:${video.sourceId}`,
      );
    clock.clearVideo();
  };

  return (
    <div className="replayBar">
      <div className="replayButtons">
        <button disabled={videoLocked} onClick={() => clock.nudge(-30000)}>
          −30
        </button>
        <button disabled={videoLocked} onClick={() => clock.nudge(-5000)}>
          −5
        </button>
        <button
          aria-label={clock.playing ? "Pause replay" : "Play replay"}
          className="playButton"
          disabled={videoLocked}
          onClick={clock.toggle}
        >
          {clock.playing ? "Ⅱ" : "▶"}
        </button>
        <button disabled={videoLocked} onClick={() => clock.nudge(5000)}>
          +5
        </button>
        <button disabled={videoLocked} onClick={() => clock.nudge(30000)}>
          +30
        </button>
      </div>

      <div className="timelineBlock">
        <div className="timelineMeta">
          <span>
            {formatClock(clock.elapsed)}
            {videoLocked ? " · VIDEO LOCK" : ""}
          </span>
          <span>{formatClock(clock.duration)}</span>
        </div>
        <input
          aria-label="Replay position"
          type="range"
          min={0}
          max={clock.duration}
          step={100}
          value={clock.elapsed}
          disabled={videoLocked}
          title={
            videoLocked
              ? "Scrub in F1 TV; the terminal follows automatically."
              : "Replay position"
          }
          onChange={(event) => clock.seek(Number(event.target.value))}
        />
      </div>

      <div className="rateButtons" aria-label="Playback speed">
        {rates.map((rate) => (
          <button
            key={rate}
            className={clock.rate === rate ? "active" : ""}
            disabled={videoLocked}
            onClick={() => clock.setRate(rate)}
          >
            {rate}×
          </button>
        ))}
      </div>

      <div className="syncReadout">
        <span
          className={`videoBridgeState ${video ? "connected" : ""}`}
          title={video ? video.title : "Browser companion not connected"}
        >
          {video
            ? `VIDEO ● · ${formatVideoTime(projectedVideoTime ?? video.currentTime)}`
            : "VIDEO ○"}
        </span>
        <strong>
          {clock.syncOffsetMs >= 0 ? "+" : ""}
          {(clock.syncOffsetMs / 1000).toFixed(1)}s
        </strong>
        <button
          onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs - 1000)}
        >
          −1
        </button>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs - 100)}>
          −.1
        </button>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs + 100)}>
          +.1
        </button>
        <button
          onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs + 1000)}
        >
          +1
        </button>
        <button
          className={currentTimeMatched && autoActive ? "active syncNowButton" : "syncNowButton"}
          disabled={
            !video ||
            !lapOneAnchor ||
            currentAutoSync.status !== "ready" ||
            !currentAutoSync.metadata ||
            offsetUnsafe
          }
          title="Read the current F1 TV time, translate it to race elapsed time, and lock the data terminal to the video."
          onClick={syncToCurrentVideoTime}
        >
          {autoMatched && autoActive ? "SYNCED" : "SYNC"}
        </button>
        <button className="syncDetailsButton" onClick={toggleSyncPopover}>
          DETAILS
        </button>

        {syncOpen && (
          <div className="syncPopover">
            <div className="syncPopoverHeader">
              <div>
                <span>VIDEO SYNC</span>
                <strong>
                  {wallClockMatched
                    ? `UTC FRAME · ${clock.status.toUpperCase()}`
                    : autoMatched
                      ? `SYNCED · ${clock.status.toUpperCase()}`
                    : autoActive
                      ? clock.status.toUpperCase()
                      : video
                        ? "COMPANION READY"
                        : "MANUAL"}
                </strong>
              </div>
              <button
                aria-label="Close synchronization"
                onClick={() => setSyncOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="syncSource">
              <span>BROWSER SOURCE</span>
              {video ? (
                <>
                  <strong>{video.title || "HTML5 video"}</strong>
                  <small>
                    {formatVideoTime(projectVideo(video))}
                    {video.duration != null
                      ? ` / ${formatVideoTime(video.duration)}`
                      : ""}{" "}
                    ·{" "}
                    {video.clockSource === "f1tv-ui"
                      ? "F1 TV UI"
                      : video.clockSource === "bitmovin-ui"
                        ? "BITMOVIN PLAYER"
                        : "HTML5 MEDIA"}
                    {video.uiClockText ? ` · UI ${video.uiClockText}` : ""}
                    {video.rawCurrentTime != null &&
                    Math.abs(video.rawCurrentTime - video.currentTime) > 1
                      ? ` · MEDIA ${formatVideoTime(video.rawCurrentTime)}`
                      : ""}
                    {" · "}
                    {video.buffering
                      ? "BUFFERING"
                      : video.paused
                        ? "PAUSED"
                        : `${video.playbackRate.toFixed(2)}× PLAYING`}
                    {video.contentId ? ` · CONTENT ${video.contentId}` : ""}
                    {projectedWallClockMs != null
                      ? ` · FRAME ${formatUtc(projectedWallClockMs)}`
                      : currentAutoSync.metadata
                        ? ` · AUTO START ${formatVideoTime(currentAutoSync.metadata.sessionStartSec)}`
                        : ""}
                  </small>
                </>
              ) : (
                <>
                  <strong>Not connected</strong>
                  <small>Manual lap matching is still available.</small>
                </>
              )}
            </div>

            <div className="manualStartSync">
              <button
                className="syncStartNowButton"
                disabled={
                  !video ||
                  !lapOneAnchor ||
                  currentAutoSync.status !== "ready" ||
                  !currentAutoSync.metadata
                }
                onClick={syncToCurrentVideoTime}
              >
                SYNC DATA TO CURRENT VIDEO TIME
              </button>
              <small>
                Reads the current F1 TV playback time and subtracts the known
                race-start offset. Example: video 10:16 minus race start 9:11.3
                means the data jumps to about 1:04.7 into the race, then follows
                later F1 TV seeks.
              </small>
            </div>

            <div className="syncStatusRow">
              <span>AUTO SYNC</span>
              <strong>
                {!video
                  ? "WAITING FOR VIDEO"
                  : contentMismatch && !wallClockInSessionWindow
                    ? "F1 TV CONTENT DOES NOT MATCH FULL RACE REPLAY"
                    : likelyEditedOrWrongTimeline && !wallClockInSessionWindow
                      ? "VIDEO TIMELINE TOO SHORT · WRONG/EDITED PLAYER"
                      : video.wallClockMs != null && !wallClockInSessionWindow
                        ? "VIDEO UTC DOES NOT MATCH SELECTED RACE"
                      : !videoAnchor &&
                          currentAutoSync.status === "ready" &&
                          currentAutoSync.metadata &&
                          startSyncDeltaSec != null
                        ? `SCRUB F1 TV TO RACE START · TARGET ${formatVideoTime(currentAutoSync.metadata.sessionStartSec)} · ${startSyncDeltaSec >= 0 ? "+" : "−"}${formatVideoTime(Math.abs(startSyncDeltaSec))}`
                    : autoMatched && clock.status === "stalled"
                      ? "VIDEO CLOCK STALLED"
                      : waitingForRaceStart && wallClockMatched && projectedWallClockMs != null
                        ? `WAITING FOR RACE START · ${formatUtc(projectedWallClockMs)}`
                        : waitingForRaceStart && currentAutoSync.metadata
                          ? `WAITING FOR RACE START · ${formatVideoTime(projectedVideoTime ?? 0)} / ${formatVideoTime(currentAutoSync.metadata.sessionStartSec)}`
                          : wallClockMatched
                            ? "MATCHED · DASH UTC"
                            : videoAnchor?.kind === "current-time"
                              ? `SYNCED · CURRENT VIDEO TIME · ${videoAnchor.clock === "raw" ? "RAW FOLLOW" : "PLAYER FOLLOW"}`
                              : videoAnchor?.kind === "manual-start"
                                ? `SYNCED · MANUAL RACE START · ${videoAnchor.clock === "raw" ? "RAW MEDIA" : "PLAYER"}`
                                : videoAnchor?.kind === "start"
                                ? "SYNCED · RACE START"
                                : autoMatched
                                ? "MATCHED · OFFSET"
                              : currentAutoSync.status === "loading"
                      ? "LOOKING UP…"
                      : currentAutoSync.status === "ready" && currentAutoSync.metadata
                        ? `READY · START ${formatVideoTime(currentAutoSync.metadata.sessionStartSec)}`
                        : currentAutoSync.status === "unavailable"
                          ? "UNAVAILABLE · USE MANUAL"
                          : currentAutoSync.status === "error"
                            ? "LOOKUP FAILED · USE MANUAL"
                            : "WAITING"}
              </strong>
            </div>

            {currentAutoSync.metadata?.contentId && (
              <div className="syncStatusRow">
                <span>EXPECTED F1 TV CONTENT</span>
                <strong>
                  {currentAutoSync.metadata.contentId}
                  {video?.contentId
                    ? video.contentId === currentAutoSync.metadata.contentId
                      ? " · MATCH"
                      : ` · BROWSER HAS ${video.contentId}`
                    : ""}
                </strong>
              </div>
            )}

            <div className="syncMatchRow">
              <label>
                <span>BROADCAST CHANGES TO</span>
                <select
                  value={selectedLap}
                  onChange={(event) =>
                    setSelectedLap(Number(event.target.value))
                  }
                >
                  {sync.lapAnchors.map((anchor) => (
                    <option key={anchor.lap} value={anchor.lap}>
                      LAP {anchor.lap}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="matchVideoButton"
                onClick={matchNow}
                disabled={!selectedAnchor}
              >
                MATCH NOW
              </button>
            </div>

            <p className="syncHelp">
              Press SYNC NOW at any point in the race. The terminal reads the
              current F1 TV time, subtracts the known pre-race offset, jumps the
              data to the corresponding race time, and then follows subsequent
              video seeks. MATCH NOW remains available for lap-based fallback.
            </p>

            <div className="syncStatusRow">
              <span>ANCHOR</span>
              <strong>
                {videoAnchor
                  ? videoAnchor.kind === "wall-clock"
                    ? `UTC FRAME @ ${formatVideoTime(videoAnchor.videoTime)}`
                    : videoAnchor.kind === "current-time"
                      ? `CURRENT VIDEO → ${formatUtc(videoAnchor.raceTimeMs)} · ${videoAnchor.clock === "raw" ? "RAW FOLLOW" : "PLAYER FOLLOW"}`
                      : videoAnchor.kind === "manual-start"
                        ? `RACE START HERE @ ${formatVideoTime(videoAnchor.videoTime)} · ${videoAnchor.clock === "raw" ? "RAW" : "PLAYER"}`
                        : videoAnchor.kind === "start"
                        ? `RACE START @ ${formatVideoTime(videoAnchor.videoTime)}`
                        : `LAP ${videoAnchor.lap} @ ${formatVideoTime(videoAnchor.videoTime)}`
                  : "NONE"}
              </strong>
            </div>
            <div className="syncStatusRow">
              <span>VIDEO LOCK</span>
              <button
                className={autoActive ? "active" : ""}
                disabled={!video || !videoAnchor}
                onClick={() => clock.setFollowing(!clock.following)}
              >
                {autoActive ? "ON" : "OFF"}
              </button>
            </div>

            {videoAnchor && (
              <button className="clearSyncButton" onClick={clearVideoAnchor}>
                CLEAR VIDEO ANCHOR
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
