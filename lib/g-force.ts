import type { CarDataPoint, LocationPoint } from "./types";
const STANDARD_GRAVITY = 9.80665;
const MAX_DISPLAY_G = 6;

export type Timed<T> = { t: number; point: T };
export type GSample = { longitudinal: number | null; lateral: number | null };

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
  for (
    let index = end;
    index >= 0 && telemetry[index].t >= startTime;
    index -= 1
  ) {
    if (telemetry[index].point.speed !== null) samples.push(telemetry[index]);
    if (samples.length >= 6) break;
  }
  if (samples.length < 3) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const sample of samples) {
    const x = (sample.t - time) / 1000;
    const y = sample.point.speed! / 3.6;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const n = samples.length;
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-6) return null;
  const acceleration = (n * sumXY - sumX * sumY) / denominator;
  const g = acceleration / STANDARD_GRAVITY;
  return Math.abs(g) <= MAX_DISPLAY_G ? g : null;
}

function lateralAt(
  telemetry: Timed<CarDataPoint>[],
  locations: Timed<LocationPoint>[],
  time: number,
) {
  let telemetryIndex = indexAt(telemetry, time);
  const locationIndex = indexAt(locations, time);
  while (
    telemetryIndex >= 0 &&
    telemetry[telemetryIndex].point.speed === null
  )
    telemetryIndex -= 1;
  if (telemetryIndex < 0 || locationIndex < 2) return null;

  const p2 = locations[locationIndex];
  if (
    time - p2.t > 1500 ||
    time - telemetry[telemetryIndex].t > 1500 ||
    Math.abs(p2.t - telemetry[telemetryIndex].t) > 750
  )
    return null;
  const middleIndex = indexAt(locations, p2.t - 420);
  const firstIndex = indexAt(locations, p2.t - 840);
  if (
    firstIndex < 0 ||
    middleIndex <= firstIndex ||
    locationIndex <= middleIndex
  )
    return null;

  const p0 = locations[firstIndex];
  const p1 = locations[middleIndex];
  if (p2.t - p1.t > 1000 || p1.t - p0.t > 1000) return null;
  const v1x = p1.point.x - p0.point.x;
  const v1y = p1.point.y - p0.point.y;
  const v2x = p2.point.x - p1.point.x;
  const v2y = p2.point.y - p1.point.y;
  if (Math.hypot(v1x, v1y) < 0.01 || Math.hypot(v2x, v2y) < 0.01) return null;

  const heading1 = Math.atan2(v1y, v1x);
  const heading2 = Math.atan2(v2y, v2x);
  const headingChange = wrapAngle(heading2 - heading1);
  const headingDt = (p2.t - p0.t) / 2 / 1000;
  if (headingDt <= 0) return null;

  const yawRate = headingChange / headingDt;
  const speed = telemetry[telemetryIndex].point.speed! / 3.6;
  const g = (speed * yawRate) / STANDARD_GRAVITY;
  return Math.abs(g) <= MAX_DISPLAY_G ? g : null;
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
  const valid = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

export function estimate(
  telemetry: Timed<CarDataPoint>[],
  locations: Timed<LocationPoint>[],
  time: number,
): GSample {
  // A short trailing average removes most of the differentiation noise while
  // keeping the display responsive enough to track braking and corner entry.
  const samples = [time, time - 250, time - 500].map((sampleTime) =>
    rawEstimate(telemetry, locations, sampleTime),
  );
  return {
    longitudinal: average(samples.map((sample) => sample.longitudinal)),
    lateral: average(samples.map((sample) => sample.lateral)),
  };
}
