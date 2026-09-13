"use client";

import { useMemo } from "react";
import type { CarDataPoint, LocationPoint } from "@/lib/types";

const STANDARD_GRAVITY = 9.80665;
const MAX_DISPLAY_G = 6;

type Timed<T> = { t: number; point: T };
type GSample = { longitudinal: number | null; lateral: number | null };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function indexAt<T>(rows: Timed<T>[], time: number) {
  let low = 0;
  let high = rows.length - 1;
  let match = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (rows[mid].t <= time) {
      match = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return match;
}

function longitudinalAt(telemetry: Timed<CarDataPoint>[], time: number) {
  const end = indexAt(telemetry, time);
  if (end < 1) return null;
  const startTime = time - 1000;
  const samples: Timed<CarDataPoint>[] = [];
  for (let index = end; index >= 0 && telemetry[index].t >= startTime; index -= 1) {
    samples.push(telemetry[index]);
    if (samples.length >= 6) break;
  }
  if (samples.length < 3) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const sample of samples) {
    const x = (sample.t - time) / 1000;
    const y = sample.point.speed / 3.6;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const n = samples.length;
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-6) return null;
  const acceleration = (n * sumXY - sumX * sumY) / denominator;
  return clamp(acceleration / STANDARD_GRAVITY, -MAX_DISPLAY_G, MAX_DISPLAY_G);
}

function lateralAt(
  telemetry: Timed<CarDataPoint>[],
  locations: Timed<LocationPoint>[],
  time: number,
) {
  const telemetryIndex = indexAt(telemetry, time);
  const locationIndex = indexAt(locations, time);
  if (telemetryIndex < 0 || locationIndex < 2) return null;

  const p2 = locations[locationIndex];
  const middleIndex = indexAt(locations, p2.t - 420);
  const firstIndex = indexAt(locations, p2.t - 840);
  if (firstIndex < 0 || middleIndex <= firstIndex || locationIndex <= middleIndex) return null;

  const p0 = locations[firstIndex];
  const p1 = locations[middleIndex];
  const v1x = p1.point.x - p0.point.x;
  const v1y = p1.point.y - p0.point.y;
  const v2x = p2.point.x - p1.point.x;
  const v2y = p2.point.y - p1.point.y;
  if (Math.hypot(v1x, v1y) < 0.01 || Math.hypot(v2x, v2y) < 0.01) return null;

  const heading1 = Math.atan2(v1y, v1x);
  const heading2 = Math.atan2(v2y, v2x);
  const headingChange = wrapAngle(heading2 - heading1);
  const headingDt = ((p2.t - p0.t) / 2) / 1000;
  if (headingDt <= 0) return null;

  const yawRate = headingChange / headingDt;
  const speed = telemetry[telemetryIndex].point.speed / 3.6;
  return clamp((speed * yawRate) / STANDARD_GRAVITY, -MAX_DISPLAY_G, MAX_DISPLAY_G);
}

function rawEstimate(
  telemetry: Timed<CarDataPoint>[],
  locations: Timed<LocationPoint>[],
  time: number,
): GSample {
  return {
    longitudinal: longitudinalAt(telemetry, time),
    lateral: lateralAt(telemetry, locations, time),
  };
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function estimate(
  telemetry: Timed<CarDataPoint>[],
  locations: Timed<LocationPoint>[],
  time: number,
): GSample {
  // A short trailing average removes most of the differentiation noise while
  // keeping the display responsive enough to track braking and corner entry.
  const samples = [time, time - 250, time - 500].map((sampleTime) => rawEstimate(telemetry, locations, sampleTime));
  return {
    longitudinal: average(samples.map((sample) => sample.longitudinal)),
    lateral: average(samples.map((sample) => sample.lateral)),
  };
}

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
    () => telemetry.map((point) => ({ t: Date.parse(point.date), point })).filter((row) => Number.isFinite(row.t)),
    [telemetry],
  );
  const timedLocations = useMemo(
    () => locations.map((point) => ({ t: Date.parse(point.date), point })).filter((row) => Number.isFinite(row.t)),
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
      points.push({ time, sample: estimate(timedTelemetry, timedLocations, time) });
    }
    return points;
  }, [timedTelemetry, timedLocations, raceTime]);

  const total = current.longitudinal !== null && current.lateral !== null
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
  const currentPoint = current.longitudinal !== null && current.lateral !== null
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
            ? "LONGITUDINAL ONLY"
            : "2D ESTIMATE";

  return <div className="gForceBlock">
    <div className="gForceHeading">
      <div><span>EST. G LOAD</span><small>derived from speed + XY heading</small></div>
      <span className="gForceStatus">{status}</span>
    </div>
    <div className="gForceLayout">
      <div className="gForceReadouts">
        <div><span>LONG</span><strong>{formatG(current.longitudinal)}</strong><small>g</small></div>
        <div><span>LAT</span><strong>{formatG(current.lateral)}</strong><small>g</small></div>
        <div><span>TOTAL</span><strong>{total === null ? "—" : total.toFixed(2)}</strong><small>g</small></div>
      </div>
      <svg className="gCircle" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Estimated lateral and longitudinal G force circle">
        {[2, 4, 6].map((g) => <circle key={g} cx={center} cy={center} r={(g / MAX_DISPLAY_G) * radius} className="gRing" />)}
        <line x1={center - radius} y1={center} x2={center + radius} y2={center} className="gAxis" />
        <line x1={center} y1={center - radius} x2={center} y2={center + radius} className="gAxis" />
        <text x={center} y={13} textAnchor="middle" className="gLabel">BRAKE</text>
        <text x={center} y={204} textAnchor="middle" className="gLabel">ACCEL</text>
        <text x={10} y={center + 3} textAnchor="start" className="gLabel">LAT −</text>
        <text x={200} y={center + 3} textAnchor="end" className="gLabel">LAT +</text>
        {trail.map(({ time, sample }, index) => {
          if (sample.longitudinal === null || sample.lateral === null) return null;
          const point = project(sample.lateral, sample.longitudinal);
          return <circle
            key={time}
            cx={point.x}
            cy={point.y}
            r={2.2}
            className="gTrail"
            style={{ opacity: 0.12 + (index / Math.max(1, trail.length - 1)) * 0.48 }}
          />;
        })}
        {currentPoint && <>
          <circle cx={currentPoint.x} cy={currentPoint.y} r={8} className="gCurrentHalo" style={{ stroke: `#${teamColour}` }} />
          <circle cx={currentPoint.x} cy={currentPoint.y} r={4} className="gCurrent" style={{ fill: `#${teamColour}` }} />
        </>}
      </svg>
    </div>
    <div className="gForceNote">Estimated horizontal load, not an onboard accelerometer measurement. ± lateral sign follows the OpenF1 XY coordinate frame.</div>
  </div>;
}
