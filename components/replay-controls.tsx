"use client";

import { formatClock } from "@/lib/time";
import { useReplayClock } from "./replay-clock";

const rates = [0.25, 0.5, 1, 2, 4];

export function ReplayControls() {
  const clock = useReplayClock();

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
        <span>SYNC</span>
        <strong>{clock.syncOffsetMs >= 0 ? "+" : ""}{(clock.syncOffsetMs / 1000).toFixed(1)}s</strong>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs - 100)}>−.1</button>
        <button onClick={() => clock.setSyncOffsetMs(clock.syncOffsetMs + 100)}>+.1</button>
      </div>
    </div>
  );
}
