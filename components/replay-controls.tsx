"use client";

import { useMemo, useState } from "react";
import { formatClock } from "@/lib/time";
import { projectVideo } from "@/lib/replay-state";
import { useReplayClock } from "./replay-clock";
import { useReplaySync } from "./replay-sync-context";

const rates = [0.25, 0.5, 1, 2, 4];

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

  const clearVideoAnchor = clock.clearVideo;

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
          SYNC
        </button>

        {syncOpen && (
          <div className="syncPopover">
            <div className="syncPopoverHeader">
              <div>
                <span>VIDEO SYNC</span>
                <strong>
                  {autoActive
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
                  </small>
                </>
              ) : (
                <>
                  <strong>Not connected</strong>
                  <small>Manual lap matching is still available.</small>
                </>
              )}
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
              When the broadcast lap counter changes to the selected lap, press
              MATCH NOW. With the browser companion connected, this also anchors
              the video clock and follows future pause, seek and rate changes
              automatically. Replay controls disengage auto follow. A different
              video requires a new match.
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
