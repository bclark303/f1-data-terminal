export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatLap(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

export function latestAt<T>(rows: T[], getDate: (row: T) => string, raceTime: number) {
  let low = 0;
  let high = rows.length - 1;
  let match: T | undefined;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const row = rows[mid];
    if (Date.parse(getDate(row)) <= raceTime) {
      match = row;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return match;
}
