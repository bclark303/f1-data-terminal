import type { Lap, LocationPoint } from "./types";
export type TimeIndex<T> = { rows: T[]; times: number[] };
export function indexRows<T>(
  rows: T[],
  timestamp: (row: T) => string | null,
): TimeIndex<T> {
  const timed = rows
    .map((row) => ({ row, time: Date.parse(timestamp(row) ?? "") }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  return {
    rows: timed.map((item) => item.row),
    times: timed.map((item) => item.time),
  };
}
export function upperBound(times: number[], time: number) {
  let low = 0,
    high = times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (times[mid] <= time) low = mid + 1;
    else high = mid;
  }
  return low;
}
export function sampleAt<T>(
  index: TimeIndex<T>,
  time: number,
  maxAge = Infinity,
) {
  const position = upperBound(index.times, time) - 1;
  return position < 0 || time - index.times[position] > maxAge
    ? undefined
    : index.rows[position];
}
export function windowAt<T>(index: TimeIndex<T>, start: number, end: number) {
  return index.rows.slice(
    upperBound(index.times, start - 0.001),
    upperBound(index.times, end),
  );
}
export function makeLapIndex(laps: Lap[]) {
  const current = indexRows(laps, (row) => row.date_start);
  const completedRows = current.rows
    .filter((row) => row.lap_duration !== null)
    .map((row) => ({
      ...row,
      completedAt: Date.parse(row.date_start!) + row.lap_duration! * 1000,
    }))
    .sort((a, b) => a.completedAt - b.completedAt);
  const completed = {
    rows: completedRows,
    times: completedRows.map((row) => row.completedAt),
  };
  let best: Lap | undefined;
  const bests = completedRows.map((row) => {
    if (!best || row.lap_duration! < best.lap_duration!) best = row;
    return best;
  });
  return { current, completed, bests };
}
export function lapsAt(index: ReturnType<typeof makeLapIndex>, time: number) {
  const count = upperBound(index.completed.times, time);
  return {
    currentLap: sampleAt(index.current, time),
    lastLap: index.completed.rows[count - 1],
    bestLap: index.bests[count - 1],
  };
}
// Fallback uses only the previous completed lap; it never looks ahead to this lap's final result.
export function estimatedProgress(
  index: ReturnType<typeof makeLapIndex>,
  time: number,
) {
  const { currentLap, lastLap } = lapsAt(index, time);
  if (
    !currentLap?.date_start ||
    !lastLap?.lap_duration ||
    currentLap === lastLap
  )
    return null;
  const elapsed = time - Date.parse(currentLap.date_start);
  const duration = lastLap.lap_duration * 1000;
  if (elapsed < 0 || elapsed >= duration) return null;
  return elapsed / duration;
}
export function measuredPosition(
  index: TimeIndex<LocationPoint>,
  time: number,
) {
  // Hold the most recent real sample for <= 1.5s; do not interpolate over outages.
  return sampleAt(index, time, 1500) ?? null;
}
