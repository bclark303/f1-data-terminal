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
  ]);

  const autoMatched = Boolean(
    videoAnchor &&
      videoSourceId &&
      lapOneAnchor &&
      currentAutoSync.metadata &&
      videoAnchor.sessionKey === sync.sessionKey &&
      videoAnchor.sourceId === videoSourceId &&
      videoAnchor.lap === lapOneAnchor.lap &&
      Math.abs(
        videoAnchor.videoTime - currentAutoSync.metadata.sessionStartSec,
      ) < 0.001,
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
        <button onClick={() => clock.nudge(-30000)}>−30</button>
        <button onClick={() => clock.nudge(-5000)}>−5</button>
        <button
          aria-label={clock.playing ? "Pause replay" : "Play replay"}
          className="playButton"
          onClick={clock.toggle}
        >
          {clock.playing ? "Ⅱ" : "▶"}
        </button>
        <button onClick={() => clock.nudge(5000)}>+5</button>
        <button onClick={() => clock.nudge(30000)}>+30</button>
      </div>

      <div className="timelineBlock">
        <div className="timelineMeta">
          <span>{formatClock(clock.elapsed)}</span>
          <span>{formatClock(clock.duration)}</span>
        </div>
        <input
          aria-label="Replay position"
          type="range"
          min={0}
          max={clock.duration}
          step={100}
          value={clock.elapsed}
          onChange={(event) => clock.seek(Number(event.target.value))}
        />
      </div>

      <div className="rateButtons" aria-label="Playback speed">
        {rates.map((rate) => (
          <button
            key={rate}
            className={clock.rate === rate ? "active" : ""}
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
          {video ? "VIDEO ●" : "VIDEO ○"}
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
                  {autoMatched
                    ? "AUTO SYNC"
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
                    {currentAutoSync.metadata
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
                  : autoMatched
                    ? "MATCHED"
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
              When automatic metadata is available, selecting the F1 TV video
              is enough: the terminal anchors itself to the published race-start
              offset and follows pause, seek and playback-rate changes. If AUTO
              SYNC is unavailable or incorrect for a particular replay, use the
              lap selector and MATCH NOW as the fallback. Replay controls
              disengage follow without destroying the existing anchor.
            </p>

            <div className="syncStatusRow">
              <span>ANCHOR</span>
              <strong>
                {videoAnchor
                  ? `LAP ${videoAnchor.lap} @ ${formatVideoTime(videoAnchor.videoTime)}`
                  : "NONE"}
              </strong>
            </div>
            <div className="syncStatusRow">
              <span>AUTO FOLLOW</span>
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
