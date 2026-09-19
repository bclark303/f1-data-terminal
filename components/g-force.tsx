"use client";

import { useMemo } from "react";
import type { CarDataPoint, LocationPoint } from "@/lib/types";

import { estimate, type GSample } from "@/lib/g-force";
const MAX_DISPLAY_G = 6;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function formatG(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function GForceDisplay({
  telemetry,
  locations,
  raceTime,
  telemetryLoading,
  locationLoading,
  telemetryError,
  locationError,
  teamColour,
}: {
  telemetry: CarDataPoint[];
  locations: LocationPoint[];
  raceTime: number;
  telemetryLoading: boolean;
  locationLoading: boolean;
  telemetryError: string | null;
  locationError: string | null;
  teamColour: string;
}) {
  const timedTelemetry = useMemo(
    () =>
      telemetry
        .map((point) => ({ t: Date.parse(point.date), point }))
        .filter((row) => Number.isFinite(row.t))
        .sort((a, b) => a.t - b.t),
    [telemetry],
  );
  const timedLocations = useMemo(
    () =>
      locations
        .map((point) => ({ t: Date.parse(point.date), point }))
        .filter((row) => Number.isFinite(row.t))
        .sort((a, b) => a.t - b.t),
    [locations],
  );

  const current = useMemo(
    () => estimate(timedTelemetry, timedLocations, raceTime),
    [timedTelemetry, timedLocations, raceTime],
  );

  const trail = useMemo(() => {
    const points: Array<{ time: number; sample: GSample }> = [];
    for (let delta = 3000; delta >= 0; delta -= 250) {
      const time = raceTime - delta;
      points.push({
        time,
        sample: estimate(timedTelemetry, timedLocations, time),
      });
    }
    return points;
  }, [timedTelemetry, timedLocations, raceTime]);

  const total =
    current.longitudinal !== null && current.lateral !== null
      ? Math.hypot(current.longitudinal, current.lateral)
      : current.longitudinal !== null
        ? Math.abs(current.longitudinal)
        : null;

  const width = 210;
  const height = 210;
  const center = 105;
  const radius = 82;
  const project = (lateral: number, longitudinal: number) => ({
    x: center + clamp(lateral / MAX_DISPLAY_G, -1, 1) * radius,
    // Positive longitudinal acceleration is drawn downward; braking is upward.
    y: center + clamp(longitudinal / MAX_DISPLAY_G, -1, 1) * radius,
  });
  const currentPoint =
    current.longitudinal !== null && current.lateral !== null
      ? project(current.lateral, current.longitudinal)
      : null;

  const status = telemetryError
    ? "TELEMETRY ERROR"
    : telemetryLoading
      ? "LOADING TELEMETRY"
      : locationError
        ? "LONGITUDINAL ONLY"
        : locationLoading
          ? "LOADING XY"
          : current.lateral === null
            ? current.longitudinal === null
              ? "NO FRESH SAMPLE"
              : "LONGITUDINAL ONLY"
            : "2D ESTIMATE";

  return (
    <div className="gForceBlock">
      <div className="gForceHeading">
        <div>
          <span>EST. G LOAD</span>
          <small>derived from speed + XY heading</small>
        </div>
        <span className="gForceStatus">{status}</span>
      </div>
      <div className="gForceLayout">
        <div className="gForceReadouts">
          <div>
            <span>LONG</span>
            <strong>{formatG(current.longitudinal)}</strong>
            <small>g</small>
          </div>
          <div>
            <span>LAT</span>
            <strong>{formatG(current.lateral)}</strong>
            <small>g</small>
          </div>
          <div>
            <span>TOTAL</span>
            <strong>{total === null ? "—" : total.toFixed(2)}</strong>
            <small>g</small>
          </div>
        </div>
        <svg
          className="gCircle"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Estimated lateral and longitudinal G force circle"
        >
          {[2, 4, 6].map((g) => (
            <circle
              key={g}
              cx={center}
              cy={center}
              r={(g / MAX_DISPLAY_G) * radius}
              className="gRing"
            />
          ))}
          <line
            x1={center - radius}
            y1={center}
            x2={center + radius}
            y2={center}
            className="gAxis"
          />
          <line
            x1={center}
            y1={center - radius}
            x2={center}
            y2={center + radius}
            className="gAxis"
          />
          <text x={center} y={13} textAnchor="middle" className="gLabel">
            BRAKE
          </text>
          <text x={center} y={204} textAnchor="middle" className="gLabel">
            ACCEL
          </text>
          <text x={10} y={center + 3} textAnchor="start" className="gLabel">
            LAT −
          </text>
          <text x={200} y={center + 3} textAnchor="end" className="gLabel">
            LAT +
          </text>
          {trail.map(({ time, sample }, index) => {
            if (sample.longitudinal === null || sample.lateral === null)
              return null;
            const point = project(sample.lateral, sample.longitudinal);
            return (
              <circle
                key={time}
                cx={point.x}
                cy={point.y}
                r={2.2}
                className="gTrail"
                style={{
                  opacity:
                    0.12 + (index / Math.max(1, trail.length - 1)) * 0.48,
                }}
              />
            );
          })}
          {currentPoint && (
            <>
              <circle
                cx={currentPoint.x}
                cy={currentPoint.y}
                r={8}
                className="gCurrentHalo"
                style={{ stroke: `#${teamColour}` }}
              />
              <circle
                cx={currentPoint.x}
                cy={currentPoint.y}
                r={4}
                className="gCurrent"
                style={{ fill: `#${teamColour}` }}
              />
            </>
          )}
        </svg>
      </div>
      <div className="gForceNote">
        Estimated horizontal load, not an onboard accelerometer measurement. ±
        lateral sign follows the OpenF1 XY coordinate frame.
      </div>
    </div>
  );
}
