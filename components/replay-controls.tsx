"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "@/lib/time";
import { projectVideo } from "@/lib/replay-state";
import { useReplayClock } from "./replay-clock";
import { useReplaySync } from "./replay-sync-context";

const rates = [0.25, 0.5, 1, 2, 4];

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
      (videoAnchor.kind === "wall-clock" || videoAnchor.kind === "manual")
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
  ]);

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

  useEffect(() => {
    if (
      !videoSourceId ||
      !lapOneAnchor ||
      !currentAutoSync.metadata ||
      currentAutoSync.status !== "ready" ||
      wallClockInSessionWindow ||
      videoAnchor
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
      kind: "offset",
    });
  }, [
    autoKey,
    clock,
    currentAutoSync.metadata,
    currentAutoSync.status,
    lapOneAnchor,
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
      videoAnchor.kind !== "manual" &&
      videoAnchor.kind !== "wall-clock" &&
      videoAnchor.sessionKey === sync.sessionKey &&
      videoAnchor.sourceId === videoSourceId &&
      videoAnchor.lap === lapOneAnchor.lap &&
      Math.abs(
        videoAnchor.videoTime - currentAutoSync.metadata.sessionStartSec,
      ) < 0.001,
  );
  const autoMatched = wallClockMatched || offsetMatched;
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
          className={autoActive ? "active" : ""}
          onClick={toggleSyncPopover}
        >
          {autoMatched ? "AUTO" : "SYNC"}
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
                      ? `AUTO · ${clock.status.toUpperCase()}`
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
                    {formatVideoTime(projectVideo(video))} ·{" "}
                    {video.buffering
                      ? "BUFFERING"
                      : video.paused
                        ? "PAUSED"
                        : `${video.playbackRate.toFixed(2)}× PLAYING`}
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

            <div className="syncStatusRow">
              <span>AUTO SYNC</span>
              <strong>
                {!video
                  ? "WAITING FOR VIDEO"
                  : video.wallClockMs != null && !wallClockInSessionWindow
                    ? "VIDEO UTC DOES NOT MATCH SELECTED RACE"
                    : autoMatched && clock.status === "stalled"
                      ? "VIDEO CLOCK STALLED"
                      : waitingForRaceStart && wallClockMatched && projectedWallClockMs != null
                        ? `WAITING FOR RACE START · ${formatUtc(projectedWallClockMs)}`
                        : waitingForRaceStart && currentAutoSync.metadata
                          ? `WAITING FOR RACE START · ${formatVideoTime(projectedVideoTime ?? 0)} / ${formatVideoTime(currentAutoSync.metadata.sessionStartSec)}`
                          : wallClockMatched
                            ? "MATCHED · DASH UTC"
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
              The terminal first tries the F1 TV media's absolute UTC clock,
              which maps the frame on screen directly onto OpenF1 timestamps.
              If the player does not expose a usable UTC clock, it falls back to
              the curated race-start offset. While VIDEO LOCK is on, scrub and
              control playback in F1 TV; the data follows automatically. Use
              MATCH NOW only as a fallback.
            </p>

            <div className="syncStatusRow">
              <span>ANCHOR</span>
              <strong>
                {videoAnchor
                  ? videoAnchor.kind === "wall-clock"
                    ? `UTC FRAME @ ${formatVideoTime(videoAnchor.videoTime)}`
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
