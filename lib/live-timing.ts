export type JsonValue = unknown;
export type LiveTimingStore = Record<string, unknown>;

export type LiveSector = {
  value: string;
  overallFastest: boolean;
  personalFastest: boolean;
  segments: number[];
};

export type LiveSpeedTraps = {
  i1: string;
  i2: string;
  finish: string;
  straight: string;
};

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
  sectors: [LiveSector, LiveSector, LiveSector];
  speeds: LiveSpeedTraps;
  tyre: string;
  tyreNew: boolean | null;
  stintLaps: number | null;
  currentLap: number | null;
  pitStops: number | null;
  inPit: boolean;
  stopped: boolean;
  retired: boolean;
  speed: number | null;
  rpm: number | null;
  gear: number | null;
  throttle: number | null;
  brake: boolean | null;
  aero: number | null;
};

export type LivePosition = {
  number: string;
  timestamp: string;
  x: number;
  y: number;
  z: number;
  status: string;
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

export type LiveTeamRadio = {
  utc: string;
  number: string;
  path: string;
  text: string;
};

export type LiveSessionInfo = {
  meeting: string;
  session: string;
  type: string;
  location: string;
  country: string;
  path: string;
};

export type LiveClock = {
  remaining: string;
  extrapolating: boolean;
  utc: string;
};

const REPLACE_FEEDS = new Set(["CarData", "Position"]);
const CAR_CHANNELS = {
  rpm: 0,
  speed: 2,
  gear: 3,
  throttle: 4,
  brake: 5,
  aero: 45,
} as const;

export const LIVE_TOPICS = [
  "Heartbeat",
  "AudioStreams",
  "DriverList",
  "ExtrapolatedClock",
  "RaceControlMessages",
  "SessionInfo",
  "SessionStatus",
  "TeamRadio",
  "TimingAppData",
  "TimingStats",
  "TrackStatus",
  "WeatherData",
  "Position.z",
  "CarData.z",
  "ContentStreams",
  "SessionData",
  "TimingData",
  "TopThree",
  "RcmSeries",
  "LapCount",
] as const;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
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
  frames: Array<Record<string, unknown>>,
): Array<{ feed: string; data: unknown }> {
  const records: Array<{ feed: string; data: unknown }> = [];
  for (const frame of frames) {
    const args = frame.arguments;
    if (
      frame.type === 1 &&
      frame.target === "feed" &&
      Array.isArray(args) &&
      args.length >= 2
    ) {
      records.push({
        feed: String(args[0]),
        data: args[1],
      });
      continue;
    }
    const result = object(frame.result);
    if (frame.type === 3 && result) {
      for (const [feed, data] of Object.entries(result))
        records.push({ feed, data });
    }
  }
  return records;
}

function values(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  const row = object(value);
  return row ? Object.values(row).filter(Boolean) : [];
}

function numericValues(value: unknown): unknown[] {
  const row = object(value);
  if (!row) return Array.isArray(value) ? value.filter(Boolean) : [];
  return Object.entries(row)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, item]) => item)
    .filter(Boolean);
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
  const stints = numericValues(object(line)?.Stints);
  return stints.at(-1) ?? null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function timingValue(value: unknown) {
  const row = object(value);
  return String(row?.Value ?? "");
}

function sectorFromTiming(timing: Record<string, unknown>, index: number): LiveSector {
  const sectors = object(timing.Sectors);
  const sector = object(sectors?.[String(index)]) ?? {};
  const segments = numericValues(sector.Segments)
    .map((raw) => numberOrNull(object(raw)?.Status))
    .filter((status): status is number => status !== null);
  return {
    value: String(sector.Value ?? ""),
    overallFastest: Boolean(sector.OverallFastest),
    personalFastest: Boolean(sector.PersonalFastest),
    segments,
  };
}

function speedTrapFromTiming(
  timing: Record<string, unknown>,
  key: string,
) {
  return timingValue(object(timing.Speeds)?.[key]);
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
      sectors: [
        sectorFromTiming(timing, 0),
        sectorFromTiming(timing, 1),
        sectorFromTiming(timing, 2),
      ],
      speeds: {
        i1: speedTrapFromTiming(timing, "I1"),
        i2: speedTrapFromTiming(timing, "I2"),
        finish: speedTrapFromTiming(timing, "FL"),
        straight: speedTrapFromTiming(timing, "ST"),
      },
      tyre: String(stint.Compound ?? "").toUpperCase(),
      tyreNew: boolOrNull(stint.New),
      stintLaps: numberOrNull(stint.TotalLaps ?? stint.StartLaps),
      currentLap: numberOrNull(timing.NumberOfLaps),
      pitStops: numberOrNull(timing.NumberOfPitStops),
      inPit: Boolean(timing.InPit),
      stopped: Boolean(timing.Stopped),
      retired: Boolean(timing.Retired),
      speed: channels ? numberOrNull(channels[CAR_CHANNELS.speed]) : null,
      rpm: channels ? numberOrNull(channels[CAR_CHANNELS.rpm]) : null,
      gear: channels ? numberOrNull(channels[CAR_CHANNELS.gear]) : null,
      throttle: channels
        ? numberOrNull(channels[CAR_CHANNELS.throttle])
        : null,
      brake: brake === null ? null : brake > 0,
      aero: channels ? numberOrNull(channels[CAR_CHANNELS.aero]) : null,
    });
  }

  return rows.sort((a, b) => a.line - b.line);
}

export function selectLivePositions(
  store: LiveTimingStore,
): LivePosition[] {
  const position = object(store.Position);
  const samples = position && Array.isArray(position.Position)
    ? position.Position
    : [];
  const latest = object(samples.at(-1));
  const entries = object(latest?.Entries);
  if (!entries) return [];
  const timestamp = String(latest?.Timestamp ?? "");

  return Object.entries(entries).flatMap(([number, raw]) => {
    const row = object(raw);
    if (!row) return [];
    const x = numberOrNull(row.X);
    const y = numberOrNull(row.Y);
    const z = numberOrNull(row.Z);
    if (x === null || y === null || z === null) return [];
    const rawStatus = row.Status;
    const status =
      typeof rawStatus === "string" && !/^\d+$/.test(rawStatus)
        ? rawStatus
        : Number(rawStatus) === 1
          ? "OffTrack"
          : "OnTrack";
    return [{ number, timestamp, x, y, z, status }];
  });
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

export function selectLiveTeamRadio(
  store: LiveTimingStore,
): LiveTeamRadio[] {
  const captures = object(store.TeamRadio)?.Captures;
  return values(captures)
    .map((raw) => {
      const capture = object(raw) ?? {};
      return {
        utc: String(capture.Utc ?? ""),
        number: String(capture.RacingNumber ?? ""),
        path: String(capture.Path ?? ""),
        text: String(capture.Transcript ?? capture.Text ?? ""),
      };
    })
    .filter((clip) => clip.number || clip.path)
    .reverse();
}

export function teamRadioUrl(
  session: LiveSessionInfo | null,
  clip: LiveTeamRadio,
) {
  if (!session?.path || !clip.path) return null;
  if (
    session.path.includes("..") ||
    clip.path.includes("..") ||
    /:/.test(session.path) ||
    /:/.test(clip.path)
  )
    return null;
  const base = session.path.endsWith("/") ? session.path : session.path + "/";
  const relative = clip.path.replace(/^\/+/, "");
  return `https://livetiming.formula1.com/static/${base}${relative}`;
}

export function selectLiveLapCount(store: LiveTimingStore) {
  const count = object(store.LapCount);
  if (!count) return null;
  const current = numberOrNull(count.CurrentLap);
  const total = numberOrNull(count.TotalLaps);
  return current !== null && total !== null ? { current, total } : null;
}

export function selectLiveClock(store: LiveTimingStore): LiveClock | null {
  const clock = object(store.ExtrapolatedClock);
  if (!clock) return null;
  return {
    remaining: String(clock.Remaining ?? ""),
    extrapolating: Boolean(clock.Extrapolating),
    utc: String(clock.Utc ?? ""),
  };
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
    path: String(info.Path ?? ""),
  };
}

export function selectLiveSessionStatus(store: LiveTimingStore) {
  const status = object(store.SessionStatus);
  return status ? String(status.Status ?? "") : "";
}

export function selectLiveFeedNames(store: LiveTimingStore) {
  return Object.keys(store).sort();
}
