export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function formatLap(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

const indexes = new WeakMap<object, { times: number[]; rows: unknown[] }>();
export function latestAt<T>(
  rows: T[],
  getDate: (row: T) => string,
  raceTime: number,
  maxAge = Infinity,
): T | undefined {
  let index = indexes.get(rows);
  if (!index) {
    const timed = rows
      .map((row) => ({ row, time: Date.parse(getDate(row)) }))
      .filter((item) => Number.isFinite(item.time))
      .sort((a, b) => a.time - b.time);
    index = {
      times: timed.map((item) => item.time),
      rows: timed.map((item) => item.row),
    };
    indexes.set(rows, index);
  }
  let low = 0,
    high = index.times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (index.times[mid] <= raceTime) low = mid + 1;
    else high = mid;
  }
  return low === 0 || raceTime - index.times[low - 1] > maxAge
    ? undefined
    : (index.rows[low - 1] as T);
}
