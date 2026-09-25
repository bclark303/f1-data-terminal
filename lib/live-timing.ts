export type JsonValue = unknown;
export type LiveTimingStore = Record<string, unknown>;

export type LiveDriverRow = {
  number: string;
  tla: string;
  name: string;
  team: string;
  teamColour: string;
  position: string;
  line: number;
  gap: string;
  interval: string;
  lastLap: string;
  bestLap: string;
  tyre: string;
  stintLaps: number | null;
  inPit: boolean;
  retired: boolean;
  speed: number | null;
  rpm: number | null;
  gear: number | null;
  throttle: number | null;
  brake: boolean | null;
  drs: number | null;
};

export type LiveWeather = {
  airTemp: string;
  trackTemp: string;
  humidity: string;
  pressure: string;
  windSpeed: string;
  windDirection: string;
  rainfall: boolean;
};

export type LiveRaceControl = {
  utc: string;
  lap: number | null;
  category: string;
  flag: string;
  message: string;
};

export type LiveSessionInfo = {
  meeting: string;
  session: string;
  type: string;
  location: string;
  country: string;
};

const REPLACE_FEEDS = new Set(["CarData", "Position"]);
const CAR_CHANNELS = {
  rpm: 0,
  speed: 2,
  gear: 3,
  throttle: 4,
  brake: 5,
  drs: 45,
} as const;

export const LIVE_TOPICS = [
  "Heartbeat",
  "DriverList",
  "ExtrapolatedClock",
  "RaceControlMessages",
  "SessionInfo",
  "SessionStatus",
  "TimingAppData",
  "TimingStats",
  "TrackStatus",
  "WeatherData",
  "SessionData",
  "TimingData",
  "TopThree",
  "LapCount",
  "CarData.z",
] as const;

function object(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, any>)
    : null;
}

export function liveFeedKey(feed: string) {
  return feed.endsWith(".z") ? feed.slice(0, -2) : feed;
}

export function mergeLiveDelta(target: unknown, source: unknown): unknown {
  if (Array.isArray(source)) {
    const base = Array.isArray(target) ? [...target] : [];
    source.forEach((value, index) => {
      if (value !== undefined)
        base[index] = mergeLiveDelta(base[index], value);
    });
    return base;
  }

  const sourceObject = object(source);
  if (sourceObject) {
    const targetObject = object(target);
    const base: Record<string, unknown> = targetObject
      ? { ...targetObject }
      : {};
    for (const [key, value] of Object.entries(sourceObject)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) continue;
      base[key] = mergeLiveDelta(base[key], value);
    }
    return base;
  }

  return source;
}

export function applyLiveRecord(
  store: LiveTimingStore,
  feed: string,
  data: unknown,
): LiveTimingStore {
  const key = liveFeedKey(feed);
  return {
    ...store,
    [key]: REPLACE_FEEDS.has(key)
      ? data
      : mergeLiveDelta(store[key], data),
  };
}

export function splitSignalRFrames(raw: string) {
  return raw
    .split("\x1e")
    .filter(Boolean)
    .flatMap((part) => {
      try {
        return [JSON.parse(part) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

export function recordsFromSignalRFrames(
  frames: Array<Record<string, any>>,
): Array<{ feed: string; data: unknown }> {
  const records: Array<{ feed: string; data: unknown }> = [];
  for (const frame of frames) {
    if (
      frame.type === 1 &&
      frame.target === "feed" &&
      Array.isArray(frame.arguments) &&
      frame.arguments.length >= 2
    ) {
      records.push({
        feed: String(frame.arguments[0]),
        data: frame.arguments[1],
      });
      continue;
    }
    if (frame.type === 3 && object(frame.result)) {
      for (const [feed, data] of Object.entries(
        frame.result as Record<string, unknown>,
      ))
        records.push({ feed, data });
    }
  }
  return records;
}

function values(value: unknown): any[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  const row = object(value);
  return row ? Object.values(row).filter(Boolean) : [];
}

function latestChannels(store: LiveTimingStore, number: string) {
  const carData = object(store.CarData);
  const entries = carData && Array.isArray(carData.Entries)
    ? carData.Entries
    : [];
  const latest = entries.at(-1);
  const cars = object(object(latest)?.Cars);
  return object(object(cars?.[number])?.Channels);
}

function latestStint(line: unknown) {
  const stints = values(object(line)?.Stints);
  return stints.at(-1) ?? null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function selectLiveDrivers(store: LiveTimingStore): LiveDriverRow[] {
  const driverList = object(store.DriverList);
  if (!driverList) return [];
  const timingLines = object(object(store.TimingData)?.Lines) ?? {};
  const appLines = object(object(store.TimingAppData)?.Lines) ?? {};
  const rows: LiveDriverRow[] = [];

  for (const [number, rawDriver] of Object.entries(driverList)) {
    if (!/^\d+$/.test(number)) continue;
    const driver = object(rawDriver) ?? {};
    const timing = object(timingLines[number]) ?? {};
    const stint = object(latestStint(appLines[number])) ?? {};
    const channels = latestChannels(store, number);
    const brake = channels ? numberOrNull(channels[CAR_CHANNELS.brake]) : null;
    rows.push({
      number,
      tla: String(driver.Tla ?? ""),
      name: String(driver.BroadcastName ?? driver.FullName ?? ""),
      team: String(driver.TeamName ?? ""),
      teamColour: String(driver.TeamColour ?? "666666").replace(/^#/, ""),
      position: String(timing.Position ?? driver.Line ?? "—"),
      line: Number(timing.Line ?? driver.Line ?? 999),
      gap: String(timing.GapToLeader ?? ""),
      interval: String(object(timing.IntervalToPositionAhead)?.Value ?? ""),
      lastLap: String(object(timing.LastLapTime)?.Value ?? ""),
      bestLap: String(object(timing.BestLapTime)?.Value ?? ""),
      tyre: String(stint.Compound ?? "").toUpperCase(),
      stintLaps: numberOrNull(stint.TotalLaps ?? stint.StartLaps),
      inPit: Boolean(timing.InPit),
      retired: Boolean(timing.Retired),
      speed: channels ? numberOrNull(channels[CAR_CHANNELS.speed]) : null,
      rpm: channels ? numberOrNull(channels[CAR_CHANNELS.rpm]) : null,
      gear: channels ? numberOrNull(channels[CAR_CHANNELS.gear]) : null,
      throttle: channels
        ? numberOrNull(channels[CAR_CHANNELS.throttle])
        : null,
      brake: brake === null ? null : brake > 0,
      drs: channels ? numberOrNull(channels[CAR_CHANNELS.drs]) : null,
    });
  }

  return rows.sort((a, b) => a.line - b.line);
}

export function selectLiveWeather(
  store: LiveTimingStore,
): LiveWeather | null {
  const weather = object(store.WeatherData);
  if (!weather) return null;
  return {
    airTemp: String(weather.AirTemp ?? ""),
    trackTemp: String(weather.TrackTemp ?? ""),
    humidity: String(weather.Humidity ?? ""),
    pressure: String(weather.Pressure ?? ""),
    windSpeed: String(weather.WindSpeed ?? ""),
    windDirection: String(weather.WindDirection ?? ""),
    rainfall: String(weather.Rainfall ?? "0") !== "0",
  };
}

export function selectLiveTrackStatus(store: LiveTimingStore) {
  const track = object(store.TrackStatus);
  if (!track) return null;
  const status = String(track.Status ?? "");
  const labels: Record<string, string> = {
    "1": "TRACK CLEAR",
    "2": "YELLOW",
    "4": "SAFETY CAR",
    "5": "RED FLAG",
    "6": "VIRTUAL SAFETY CAR",
    "7": "VSC ENDING",
  };
  return {
    status,
    label: labels[status] ?? String(track.Message ?? "UNKNOWN"),
  };
}

export function selectLiveRaceControl(
  store: LiveTimingStore,
): LiveRaceControl[] {
  const messages = object(store.RaceControlMessages)?.Messages;
  return values(messages)
    .map((raw) => {
      const message = object(raw) ?? {};
      return {
        utc: String(message.Utc ?? ""),
        lap: numberOrNull(message.Lap),
        category: String(message.Category ?? ""),
        flag: String(message.Flag ?? ""),
        message: String(message.Message ?? ""),
      };
    })
    .reverse();
}

export function selectLiveLapCount(store: LiveTimingStore) {
  const count = object(store.LapCount);
  if (!count) return null;
  const current = numberOrNull(count.CurrentLap);
  const total = numberOrNull(count.TotalLaps);
  return current !== null && total !== null ? { current, total } : null;
}

export function selectLiveSessionInfo(
  store: LiveTimingStore,
): LiveSessionInfo | null {
  const info = object(store.SessionInfo);
  if (!info) return null;
  const meeting = object(info.Meeting) ?? {};
  const country = object(meeting.Country) ?? {};
  return {
    meeting: String(meeting.Name ?? meeting.OfficialName ?? ""),
    session: String(info.Name ?? ""),
    type: String(info.Type ?? ""),
    location: String(meeting.Location ?? ""),
    country: String(country.Name ?? ""),
  };
}

export function selectLiveSessionStatus(store: LiveTimingStore) {
  const status = object(store.SessionStatus);
  return status ? String(status.Status ?? "") : "";
}
