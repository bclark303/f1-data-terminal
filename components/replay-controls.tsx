"use client";

import { useEffect, useMemo, useState } from "react";
import { formatClock } from "@/lib/time";
import { useBrowserVideoSync, type BrowserVideoState } from "./browser-video-sync";
import { useReplayClock } from "./replay-clock";
import { useReplaySync } from "./replay-sync-context";

const rates = [0.25, 0.5, 1, 2, 4];

type VideoAnchor = {
  lap: number;
  raceTimeMs: number;
  videoTime: number;
};

function projectedVideoTime(video: BrowserVideoState) {
  if (!video.connected || video.paused) return video.currentTime;
  const ageSeconds = Math.max(0, Date.now() - video.capturedAt) / 1000;
  return video.currentTime + ageSeconds * video.playbackRate;
}

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
  const video = useBrowserVideoSync();
  const [syncOpen, setSyncOpen] = useState(false);
  const [selectedLap, setSelectedLap] = useState(sync.lapAnchors[0]?.lap ?? 1);
  const [videoAnchor, setVideoAnchor] = useState<VideoAnchor | null>(null);
  const [autoVideo, setAutoVideo] = useState(false);
  const autoActive = autoVideo && video.connected && Boolean(videoAnchor);

  const selectedAnchor = useMemo(
    () => sync.lapAnchors.find((anchor) => anchor.lap === selectedLap) ?? null,
    [sync.lapAnchors, selectedLap],
  );

  useEffect(() => {
    if (!autoActive || !videoAnchor) return;

    const videoTime = projectedVideoTime(video);
    const targetRaceTime = videoAnchor.raceTimeMs + (videoTime - videoAnchor.videoTime) * 1000;
    clock.seek(targetRaceTime - clock.sessionStart);

    if (Math.abs(clock.rate - video.playbackRate) > 0.001) clock.setRate(video.playbackRate);
    if (video.paused && clock.playing) clock.pause();
    if (!video.paused && !clock.playing) clock.play();
  }, [
    autoActive,
    video.currentTime,
    video.capturedAt,
    video.paused,
    video.playbackRate,
    videoAnchor,
    clock.sessionStart,
    clock.seek,
    clock.setRate,
    clock.pause,
    clock.play,
    clock.playing,
    clock.rate,
  ]);

  const toggleSyncPopover = () => {
    if (syncOpen) {
      setSyncOpen(false);
      return;
    }

    if (sync.lapAnchors.length) {
      const next = sync.lapAnchors.find((anchor) => Date.parse(anchor.raceTime) > clock.raceTime + 500);
      const current = [...sync.lapAnchors].reverse().find((anchor) => Date.parse(anchor.raceTime) <= clock.raceTime + 500);
      setSelectedLap((next ?? current ?? sync.lapAnchors[0]).lap);
    }
    setSyncOpen(true);
  };

  const matchNow = () => {
    if (!selectedAnchor) return;
    const raceTimeMs = Date.parse(selectedAnchor.raceTime);
    clock.setSyncOffsetMs(0);
    clock.seek(raceTimeMs - clock.sessionStart);

    if (video.connected) {
      const anchor: VideoAnchor = {
        lap: selectedAnchor.lap,
        raceTimeMs,
        videoTime: projectedVideoTime(video),
      };
      setVideoAnchor(anchor);
      setAutoVideo(true);
      clock.setRate(video.playbackRate);
      if (video.paused) clock.pause(); else clock.play();
    }
  };

  const clearVideoAnchor = () => {
    setAutoVideo(false);
    setVideoAnchor(null);
  };

  return (
    <div className="replayBar">
      <div className="replayButtons">
        <button onClick={() => clock.nudge(-30000)}>−30</button>
        <button onClick={() => clock.nudge(-5000)}>−5</button>
        <button className="playButton" onClick={clock.toggle}>{clock.playing ? "Ⅱ" : "▶"}</button>
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
          <button key={rate} className={clock.rate === rate ? "active" : ""} onClick={() => clock.setRate(rate)}>
            {rate}×
          </button>
        ))}
      </div>

      <div className="syncReadout">
        <span className={`videoBridgeState ${video.connected ? "connected" : ""}`} title={video.connected ? video.title : "Browser companion not connected"}>
          {video.connected ? "VIDEO ●" : "VIDEO ○"}
        </span>
        <strong>{clock.syncOffsetMs >= 0 ? "+" : ""}{(clock.syncOffsetMs / 1000).toFixed(1)}s</strong>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs - 1000)}>−1</button>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs - 100)}>−.1</button>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs + 100)}>+.1</button>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs + 1000)}>+1</button>
        <button className={autoActive ? "active" : ""} onClick={toggleSyncPopover}>SYNC</button>

        {syncOpen && <div className="syncPopover">
          <div className="syncPopoverHeader">
            <div><span>VIDEO SYNC</span><strong>{autoActive ? "AUTO LOCKED" : video.connected ? "COMPANION READY" : "MANUAL"}</strong></div>
            <button onClick={() => setSyncOpen(false)}>×</button>
          </div>

          <div className="syncSource">
            <span>BROWSER SOURCE</span>
            {video.connected ? <>
              <strong>{video.title || "HTML5 video"}</strong>
              <small>{formatVideoTime(projectedVideoTime(video))} · {video.paused ? "PAUSED" : `${video.playbackRate.toFixed(2)}× PLAYING`}</small>
            </> : <>
              <strong>Not connected</strong>
              <small>Manual lap matching is still available.</small>
            </>}
          </div>

          <div className="syncMatchRow">
            <label>
              <span>BROADCAST CHANGES TO</span>
              <select value={selectedLap} onChange={(event) => setSelectedLap(Number(event.target.value))}>
                {sync.lapAnchors.map((anchor) => <option key={anchor.lap} value={anchor.lap}>LAP {anchor.lap}</option>)}
              </select>
            </label>
            <button className="matchVideoButton" onClick={matchNow} disabled={!selectedAnchor}>
              MATCH NOW
            </button>
          </div>

          <p className="syncHelp">
            When the broadcast lap counter changes to the selected lap, press MATCH NOW. With the browser companion connected, this also anchors the video clock and follows future pause, seek and rate changes automatically.
          </p>

          <div className="syncStatusRow">
            <span>ANCHOR</span>
            <strong>{videoAnchor ? `LAP ${videoAnchor.lap} @ ${formatVideoTime(videoAnchor.videoTime)}` : "NONE"}</strong>
          </div>
          <div className="syncStatusRow">
            <span>AUTO FOLLOW</span>
            <button
              className={autoActive ? "active" : ""}
              disabled={!video.connected || !videoAnchor}
              onClick={() => setAutoVideo((value) => !value)}
            >{autoActive ? "ON" : "OFF"}</button>
          </div>

          {videoAnchor && <button className="clearSyncButton" onClick={clearVideoAnchor}>CLEAR VIDEO ANCHOR</button>}
        </div>}
      </div>
    </div>
  );
}
