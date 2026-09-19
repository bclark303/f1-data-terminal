"use client";
import { memo, useMemo } from "react";
import type { CarDataPoint } from "@/lib/types";
import { indexRows, sampleAt, windowAt } from "@/lib/replay-index";
export const TelemetryPanel = memo(function TelemetryPanel({
  data,
  raceTime,
  loading,
  error,
  teamColour,
}: {
  data: CarDataPoint[];
  raceTime: number;
  loading: boolean;
  error: string | null;
  teamColour: string;
}) {
  const index = useMemo(() => indexRows(data, (row) => row.date), [data]);
  const current = sampleAt(index, raceTime, 1500);
  const trace = useMemo(
    () => windowAt(index, raceTime - 15_000, raceTime),
    [index, raceTime],
  );

  const drs =
    !current || current.drs === null
      ? "—"
      : [10, 12, 14].includes(current.drs)
        ? "OPEN"
        : current.drs === 8
          ? "ARMED"
          : "CLOSED";

  return (
    <div className="telemetryBlock">
      <div className="telemetryHeading">
        <span>CAR TELEMETRY</span>
        <span
          className={
            error
              ? "dataState error"
              : loading
                ? "dataState loading"
                : "dataState live"
          }
        >
          {error
            ? "ERROR"
            : loading
              ? "LOADING DRIVER DATA"
              : current
                ? "REPLAY DATA"
                : "NO SAMPLE"}
        </span>
      </div>
      {error && <div className="dataError">{error}</div>}
      <div className="telemetryLiveGrid">
        <TelemetryMetric
          label="Speed"
          value={current?.speed != null ? `${current.speed}` : "—"}
          unit="km/h"
        />
        <TelemetryMetric
          label="Gear"
          value={current?.n_gear != null ? `${current.n_gear}` : "—"}
        />
        <TelemetryMetric
          label="RPM"
          value={current?.rpm != null ? current.rpm.toLocaleString() : "—"}
        />
        <TelemetryMetric label="DRS" value={drs} active={drs === "OPEN"} />
      </div>
      <div className="pedalGrid">
        <PedalBar label="Throttle" value={current?.throttle ?? null} />
        <TelemetryMetric
          label="Brake"
          value={
            current
              ? current.brake === null
                ? "—"
                : current.brake > 0
                  ? "ON"
                  : "OFF"
              : "—"
          }
        />
      </div>
      <div className="traceStack">
        <TelemetryTrace
          label="SPEED"
          data={trace}
          raceTime={raceTime}
          value={(point) => point.speed}
          min={0}
          max={350}
          teamColour={teamColour}
        />
        <TelemetryTrace
          label="THROTTLE"
          data={trace}
          raceTime={raceTime}
          value={(point) => point.throttle}
          min={0}
          max={100}
        />
        <TelemetryTrace
          label="BRAKE"
          data={trace}
          raceTime={raceTime}
          value={(point) => point.brake}
          min={0}
          max={100}
        />
      </div>
    </div>
  );
});

function TelemetryMetric({
  label,
  value,
  unit,
  active = false,
}: {
  label: string;
  value: string;
  unit?: string;
  active?: boolean;
}) {
  return (
    <div className={`telemetryMetric ${active ? "active" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {unit && <small>{unit}</small>}
    </div>
  );
}

function PedalBar({ label, value }: { label: string; value: number | null }) {
  const clamped = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="pedal">
      <div>
        <span>{label}</span>
        <strong>{value === null ? "—" : `${Math.round(clamped)}%`}</strong>
      </div>
      <div className="pedalTrack">
        <i style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function TelemetryTrace({
  label,
  data,
  raceTime,
  value,
  min,
  max,
  teamColour,
}: {
  label: string;
  data: CarDataPoint[];
  raceTime: number;
  value: (point: CarDataPoint) => number | null;
  min: number;
  max: number;
  teamColour?: string;
}) {
  const width = 320;
  const height = 38;
  const start = raceTime - 15_000;
  const range = Math.max(1, max - min);
  const path = data
    .map((point, index) => {
      const timestamp = Date.parse(point.date);
      const x = ((timestamp - start) / 15_000) * width;
      const channel = value(point);
      if (channel === null) return "";
      const y =
        height -
        ((Math.max(min, Math.min(max, channel)) - min) / range) * height;
      return `${index === 0 || value(data[index - 1]) === null || timestamp - Date.parse(data[index - 1].date) > 1500 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="traceRow">
      <span>{label}</span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-label={`${label} telemetry trace`}
      >
        <line
          x1="0"
          y1={height - 1}
          x2={width}
          y2={height - 1}
          className="traceBaseline"
        />
        {path && (
          <path
            d={path}
            className="traceLine"
            style={teamColour ? { stroke: `#${teamColour}` } : undefined}
          />
        )}
      </svg>
    </div>
  );
}
