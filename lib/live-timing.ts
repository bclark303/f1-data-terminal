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
  countryCode: string;
  headshotUrl: string;
  position: string;
  line: number;
  gap: string;
  interval: string;
  catching: boolean;
  lastLap: string;
  bestLap: string;
  bestLapLap: number | null;
  lastLapPersonalFastest: boolean;
  lastLapOverallFastest: boolean;
  sectors: [LiveSector, LiveSector, LiveSector];
  speeds: LiveSpeedTraps;
  tyre: string;
  tyreNew: boolean | null;
  stintLaps: number | null;
  stintNumber: number | null;
  currentLap: number | null;
  pitStops: number | null;
  inPit: boolean;
  pitOut: boolean;
  stopped: boolean;
  retired: boolean;
  knockedOut: boolean;
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

export type LivePitStop = {
  number: string;
  lap: number | null;
  duration: string;
  pitLaneTime: string;
  utc: string;
};

export type LiveOvertake = {
  lap: number | null;
  utc: string;
  overtakingNumber: string;
  overtakenNumber: string;
};

export type LiveChampionshipRow = {
  number: string;
  position: number | null;
  points: number | null;
  projectedPosition: number | null;
  projectedPoints: number | null;
};

export type LiveInsightTone = "purple" | "green" | "yellow" | "blue" | "neutral";

export type LiveInsight = {
  title: string;
  value: string;
  detail: string;
  tone: LiveInsightTone;
};

export type LiveSessionStat = {
  label: string;
  value: string;
  detail: string;
  number?: string;
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

// Superset of live/static topics observed by FastF1 and current community clients.
// Formula 1 decides which feeds are actually emitted for each session; absent feeds
// are intentionally tolerated and shown as unavailable by the UI.
export const LIVE_TOPICS = [
  "ArchiveStatus",
  "AudioStreams",
  "CarData.z",
  "ChampionshipPrediction",
  "ContentStreams",
  "CurrentTyres",
  "DriverList",
  "DriverRaceInfo",
  "DriverScore",
  "DriverTracker",
  "ExtrapolatedClock",
  "Heartbeat",
  "LapCount",
  "LapSeries",
  "OvertakeSeries",
  "PitLaneTimeCollection",
  "PitStop",
  "PitStopSeries",
  "Position.z",
  "RaceControlMessages",
  "RcmSeries",
  "SessionData",
  "SessionInfo",
  "SessionStatus",
  "SPFeed",
  "TeamRadio",
  "TimingAppData",
  "TimingData",
  "TimingDataF1",
  "TimingStats",
  "TlaRcm",
  "TopThree",
  "TrackStatus",
  "TyreStintSeries",
  "WeatherData",
  "WeatherDataSeries",
] as const;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
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
      if (value !== undefined) base[index] = mergeLiveDelta(base[index], value);
    });
    return base;
  }

  const sourceObject = object(source);
  if (sourceObject) {
    const targetObject = object(target);
    const base: Record<string, unknown> = targetObject ? { ...targetObject } : {};
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
    [key]: REPLACE_FEEDS.has(key) ? data : mergeLiveDelta(store[key], data),
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
      records.push({ feed: String(args[0]), data: args[1] });
      continue;
    }
    const result = object(frame.result);
    if (frame.type === 3 && result) {
      for (const [feed, data] of Object.entries(result)) records.push({ feed, data });
    }
  }
  return records;
}

function values(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
  const row = object(value);
  return row ? Object.values(row).filter((item) => item !== undefined && item !== null) : [];
}

function numericValues(value: unknown): unknown[] {
  const row = object(value);
  if (!row) return Array.isArray(value) ? value.filter(Boolean) : [];
  return Object.entries(row)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, item]) => item)
    .filter((item) => item !== undefined && item !== null);
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true" || value === "1") return true;
    if (value.toLowerCase() === "false" || value === "0") return false;
  }
  return null;
}

function stringValue(...valuesToTry: unknown[]) {
  for (const value of valuesToTry) {
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function parseTimeSeconds(value: string) {
  if (!value) return null;
  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.some((item) => !Number.isFinite(item))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function formatDelta(seconds: number) {
  const abs = Math.abs(seconds);
  if (abs < 10) return abs.toFixed(3) + "s";
  return abs.toFixed(1) + "s";
}

function timingValue(value: unknown) {
  const row = object(value);
  return String(row?.Value ?? value ?? "");
}

function mergedTimingLines(store: LiveTimingStore) {
  const base = object(object(store.TimingData)?.Lines) ?? {};
  const extended = object(object(store.TimingDataF1)?.Lines) ?? {};
  return mergeLiveDelta(base, extended) as Record<string, unknown>;
}

function sectorFromTiming(timing: Record<string, unknown>, index: number): LiveSector {
  const sectors = object(timing.Sectors);
  const rawSector = sectors?.[String(index)] ?? (Array.isArray(timing.Sectors) ? timing.Sectors[index] : null);
  const sector = object(rawSector) ?? {};
  const segments = numericValues(sector.Segments)
    .map((raw) => numberOrNull(object(raw)?.Status ?? raw))
    .filter((status): status is number => status !== null);
  return {
    value: String(sector.Value ?? ""),
    overallFastest: Boolean(sector.OverallFastest),
    personalFastest: Boolean(sector.PersonalFastest),
    segments,
  };
}

function speedTrapFromTiming(timing: Record<string, unknown>, key: string) {
  return timingValue(object(timing.Speeds)?.[key]);
}

function latestChannels(store: LiveTimingStore, number: string) {
  const carData = object(store.CarData);
  const entries = carData && Array.isArray(carData.Entries) ? carData.Entries : [];
  const latest = entries.at(-1);
  const cars = object(object(latest)?.Cars);
  return object(object(cars?.[number])?.Channels);
}

function latestStintFromApp(store: LiveTimingStore, number: string) {
  const appLines = object(object(store.TimingAppData)?.Lines) ?? {};
  const stints = numericValues(object(appLines[number])?.Stints);
  const latest = object(stints.at(-1));
  return latest ? { row: latest, index: stints.length } : null;
}

function tyreSeriesForDriver(store: LiveTimingStore, number: string) {
  const feed = object(store.TyreStintSeries);
  const stintsRoot = object(feed?.Stints) ?? object(feed?.Lines) ?? feed ?? {};
  const stints = numericValues(stintsRoot[number]);
  const latest = object(stints.at(-1));
  return latest ? { row: latest, index: stints.length } : null;
}

function currentTyreForDriver(store: LiveTimingStore, number: string) {
  const root = object(store.CurrentTyres);
  if (!root) return null;
  const candidates = [
    object(root.Tyres)?.[number],
    object(root.Lines)?.[number],
    root[number],
  ];
  for (const candidate of candidates) {
    const row = object(candidate);
    if (row) return row;
  }
  return null;
}

export function selectLiveDrivers(store: LiveTimingStore): LiveDriverRow[] {
  const driverList = object(store.DriverList);
  if (!driverList) return [];
  const timingLines = mergedTimingLines(store);
  const rows: LiveDriverRow[] = [];

  for (const [number, rawDriver] of Object.entries(driverList)) {
    if (!/^\d+$/.test(number)) continue;
    const driver = object(rawDriver) ?? {};
    const timing = object(timingLines[number]) ?? {};
    const appStint = latestStintFromApp(store, number);
    const seriesStint = tyreSeriesForDriver(store, number);
    const currentTyre = currentTyreForDriver(store, number);
    const stint = appStint?.row ?? seriesStint?.row ?? currentTyre ?? {};
    const stintNumber = appStint?.index ?? seriesStint?.index ?? null;
    const channels = latestChannels(store, number);
    const brake = channels ? numberOrNull(channels[CAR_CHANNELS.brake]) : null;
    const intervalRow = object(timing.IntervalToPositionAhead);
    const lastLapRow = object(timing.LastLapTime);
    const bestLapRow = object(timing.BestLapTime);

    rows.push({
      number,
      tla: String(driver.Tla ?? ""),
      name: String(driver.BroadcastName ?? driver.FullName ?? ""),
      team: String(driver.TeamName ?? ""),
      teamColour: String(driver.TeamColour ?? "666666").replace(/^#/, ""),
      countryCode: String(driver.CountryCode ?? ""),
      headshotUrl: String(driver.HeadshotUrl ?? ""),
      position: String(timing.Position ?? driver.Line ?? "—"),
      line: Number(timing.Line ?? driver.Line ?? 999),
      gap: timingValue(timing.GapToLeader),
      interval: timingValue(timing.IntervalToPositionAhead),
      catching: Boolean(intervalRow?.Catching),
      lastLap: String(lastLapRow?.Value ?? ""),
      bestLap: String(bestLapRow?.Value ?? ""),
      bestLapLap: numberOrNull(bestLapRow?.Lap),
      lastLapPersonalFastest: Boolean(lastLapRow?.PersonalFastest),
      lastLapOverallFastest: Boolean(lastLapRow?.OverallFastest),
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
      tyre: stringValue(stint.Compound, currentTyre?.Compound).toUpperCase(),
      tyreNew: boolOrNull(stint.New ?? currentTyre?.New),
      stintLaps: numberOrNull(stint.TotalLaps ?? stint.Laps ?? stint.StartLaps),
      stintNumber,
      currentLap: numberOrNull(timing.NumberOfLaps),
      pitStops: numberOrNull(timing.NumberOfPitStops),
      inPit: Boolean(timing.InPit),
      pitOut: Boolean(timing.PitOut),
      stopped: Boolean(timing.Stopped),
      retired: Boolean(timing.Retired),
      knockedOut: Boolean(timing.KnockedOut ?? timing.Cutoff),
      speed: channels ? numberOrNull(channels[CAR_CHANNELS.speed]) : null,
      rpm: channels ? numberOrNull(channels[CAR_CHANNELS.rpm]) : null,
      gear: channels ? numberOrNull(channels[CAR_CHANNELS.gear]) : null,
      throttle: channels ? numberOrNull(channels[CAR_CHANNELS.throttle]) : null,
      brake: brake === null ? null : brake > 0,
      aero: channels ? numberOrNull(channels[CAR_CHANNELS.aero]) : null,
    });
  }

  return rows.sort((a, b) => a.line - b.line);
}

export function selectLivePositions(store: LiveTimingStore): LivePosition[] {
  const position = object(store.Position);
  const samples = position && Array.isArray(position.Position) ? position.Position : [];
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

export function selectLiveWeather(store: LiveTimingStore): LiveWeather | null {
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
  return { status, label: labels[status] ?? String(track.Message ?? "UNKNOWN") };
}

export function selectLiveRaceControl(store: LiveTimingStore): LiveRaceControl[] {
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

export function selectLiveTeamRadio(store: LiveTimingStore): LiveTeamRadio[] {
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

export function teamRadioUrl(session: LiveSessionInfo | null, clip: LiveTeamRadio) {
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

function collectRecords(value: unknown, maxRecords = 1000) {
  const rows: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<object>();
  while (queue.length && rows.length < maxRecords) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current as object)) continue;
    seen.add(current as object);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const row = current as Record<string, unknown>;
    rows.push(row);
    queue.push(...Object.values(row));
  }
  return rows;
}

function racingNumber(row: Record<string, unknown>) {
  return stringValue(
    row.RacingNumber,
    row.DriverNumber,
    row.CarNumber,
    row.Number,
    row.Driver,
  );
}

export function selectLivePitStops(store: LiveTimingStore): LivePitStop[] {
  const records = [store.PitStopSeries, store.PitStop, store.PitLaneTimeCollection]
    .flatMap((feed) => collectRecords(feed, 700));
  const unique = new Map<string, LivePitStop>();
  for (const row of records) {
    const number = racingNumber(row);
    if (!/^\d+$/.test(number)) continue;
    const lap = numberOrNull(row.Lap ?? row.LapNumber);
    const duration = stringValue(row.Duration, row.PitStopTime, row.StopTime, row.Time);
    const pitLaneTime = stringValue(row.PitLaneTime, row.TransitTime, row.LaneTime);
    const utc = stringValue(row.Utc, row.Timestamp, row.Date);
    if (!duration && !pitLaneTime && lap === null) continue;
    const key = [number, lap ?? "", duration, pitLaneTime, utc].join("|");
    unique.set(key, { number, lap, duration, pitLaneTime, utc });
  }
  return [...unique.values()].slice(-80).reverse();
}

export function selectLiveOvertakes(store: LiveTimingStore): LiveOvertake[] {
  const records = collectRecords(store.OvertakeSeries, 700);
  const result: LiveOvertake[] = [];
  const seen = new Set<string>();
  for (const row of records) {
    const overtakingNumber = stringValue(
      row.OvertakingRacingNumber,
      row.OvertakingDriverNumber,
      row.OvertakingDriver,
      row.Attacker,
    );
    const overtakenNumber = stringValue(
      row.OvertakenRacingNumber,
      row.OvertakenDriverNumber,
      row.OvertakenDriver,
      row.Defender,
    );
    if (!/^\d+$/.test(overtakingNumber) || !/^\d+$/.test(overtakenNumber)) continue;
    const lap = numberOrNull(row.Lap ?? row.LapNumber);
    const utc = stringValue(row.Utc, row.Timestamp, row.Date);
    const key = [overtakingNumber, overtakenNumber, lap ?? "", utc].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ lap, utc, overtakingNumber, overtakenNumber });
  }
  return result.reverse();
}

export function selectLiveChampionship(store: LiveTimingStore): LiveChampionshipRow[] {
  const records = collectRecords(store.ChampionshipPrediction, 800);
  const rows = new Map<string, LiveChampionshipRow>();
  for (const row of records) {
    const number = racingNumber(row);
    if (!/^\d+$/.test(number)) continue;
    const position = numberOrNull(row.Position ?? row.CurrentPosition);
    const points = numberOrNull(row.Points ?? row.CurrentPoints);
    const projectedPosition = numberOrNull(
      row.PredictedPosition ?? row.ProjectedPosition ?? row.PredictionPosition,
    );
    const projectedPoints = numberOrNull(
      row.PredictedPoints ?? row.ProjectedPoints ?? row.PredictionPoints,
    );
    if (position === null && points === null && projectedPosition === null && projectedPoints === null)
      continue;
    rows.set(number, { number, position, points, projectedPosition, projectedPoints });
  }
  return [...rows.values()].sort(
    (a, b) => (a.projectedPosition ?? a.position ?? 999) - (b.projectedPosition ?? b.position ?? 999),
  );
}

export function selectLiveLapPositions(store: LiveTimingStore, number: string): number[] {
  const root = object(store.LapSeries);
  if (!root) return [];
  const candidates = [
    object(root.LapPosition)?.[number],
    object(root.Lines)?.[number],
    root[number],
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(numberOrNull).filter((value): value is number => value !== null);
    }
    const row = object(candidate);
    if (!row) continue;
    const valuesCandidate = row.LapPosition ?? row.Positions ?? row.Position;
    if (Array.isArray(valuesCandidate)) {
      return valuesCandidate.map(numberOrNull).filter((value): value is number => value !== null);
    }
  }
  return [];
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

export function selectLiveSessionInfo(store: LiveTimingStore): LiveSessionInfo | null {
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

export function selectLiveFeedCoverage(store: LiveTimingStore) {
  const active = new Set(selectLiveFeedNames(store));
  return LIVE_TOPICS.map((feed) => ({
    feed,
    key: liveFeedKey(feed),
    active: active.has(liveFeedKey(feed)),
  }));
}

export function selectLiveSessionStats(
  drivers: LiveDriverRow[],
): LiveSessionStat[] {
  if (!drivers.length) return [];

  const bestLap = drivers
    .map((driver) => ({ driver, seconds: parseTimeSeconds(driver.bestLap) }))
    .filter((row): row is { driver: LiveDriverRow; seconds: number } => row.seconds !== null)
    .sort((a, b) => a.seconds - b.seconds)[0];

  const fastestTrap = drivers
    .map((driver) => ({ driver, speed: numberOrNull(driver.speeds.straight) }))
    .filter((row): row is { driver: LiveDriverRow; speed: number } => row.speed !== null)
    .sort((a, b) => b.speed - a.speed)[0];

  const closestBattle = drivers
    .filter((driver) => driver.position !== "1" && !driver.inPit && !driver.retired)
    .map((driver) => ({ driver, gap: numberOrNull(String(driver.interval).replace(/^\+/, "")) }))
    .filter((row): row is { driver: LiveDriverRow; gap: number } => row.gap !== null)
    .sort((a, b) => a.gap - b.gap)[0];

  const oldestTyre = drivers
    .filter((driver) => driver.stintLaps !== null)
    .sort((a, b) => (b.stintLaps ?? -1) - (a.stintLaps ?? -1))[0];

  const stats: LiveSessionStat[] = [];
  if (bestLap)
    stats.push({
      label: "Fastest lap",
      value: bestLap.driver.bestLap,
      detail: bestLap.driver.tla || bestLap.driver.number,
      number: bestLap.driver.number,
    });
  if (fastestTrap)
    stats.push({
      label: "Top speed",
      value: fastestTrap.speed + " km/h",
      detail: fastestTrap.driver.tla || fastestTrap.driver.number,
      number: fastestTrap.driver.number,
    });
  if (closestBattle)
    stats.push({
      label: "Closest interval",
      value: closestBattle.driver.interval,
      detail: "to " + (closestBattle.driver.tla || closestBattle.driver.number),
      number: closestBattle.driver.number,
    });
  if (oldestTyre)
    stats.push({
      label: "Oldest current stint",
      value: oldestTyre.stintLaps + " laps",
      detail: (oldestTyre.tla || oldestTyre.number) + (oldestTyre.tyre ? " · " + oldestTyre.tyre : ""),
      number: oldestTyre.number,
    });
  return stats;
}

export function selectLiveDriverInsights(
  store: LiveTimingStore,
  drivers: LiveDriverRow[],
  selected: LiveDriverRow | null,
): LiveInsight[] {
  if (!selected) return [];
  const insights: LiveInsight[] = [];
  const last = parseTimeSeconds(selected.lastLap);
  const best = parseTimeSeconds(selected.bestLap);
  if (last !== null && best !== null) {
    const delta = last - best;
    insights.push({
      title: "Pace",
      value: delta <= 0.001 ? "Personal best" : "+" + formatDelta(delta),
      detail:
        delta <= 0.001
          ? "Latest lap matched the driver's best pace."
          : delta < 0.35
            ? "Latest lap is very close to personal-best pace."
            : "Latest lap compared with the driver's session best.",
      tone: delta <= 0.001 ? "purple" : delta < 0.35 ? "green" : "neutral",
    });
  }

  if (selected.position !== "1" && selected.interval) {
    insights.push({
      title: "Battle ahead",
      value: selected.interval,
      detail: selected.catching
        ? "Timing feed marks the car as catching the driver ahead."
        : "Current interval to the next position.",
      tone: selected.catching ? "green" : "blue",
    });
  } else if (selected.position === "1") {
    insights.push({
      title: "Race position",
      value: "LEADER",
      detail: selected.gap ? "Leader gap: " + selected.gap : "Currently first in the timing order.",
      tone: "purple",
    });
  }

  if (selected.tyre) {
    const laps = selected.stintLaps;
    insights.push({
      title: "Tyre stint",
      value: selected.tyre + (laps === null ? "" : " · " + laps + "L"),
      detail:
        laps === null
          ? "Current compound reported by F1 timing."
          : laps <= 5
            ? "Relatively fresh current set."
            : laps >= 20
              ? "Long-running current stint; strategy window may be relevant."
              : "Current stint age from live timing.",
      tone: laps !== null && laps <= 5 ? "green" : laps !== null && laps >= 20 ? "yellow" : "neutral",
    });
  }

  const speedRank = drivers
    .filter((driver) => numberOrNull(driver.speeds.straight) !== null)
    .sort((a, b) => Number(b.speeds.straight) - Number(a.speeds.straight))
    .findIndex((driver) => driver.number === selected.number);
  if (speedRank >= 0 && selected.speeds.straight) {
    insights.push({
      title: "Speed trap",
      value: selected.speeds.straight + " km/h",
      detail: "Rank " + (speedRank + 1) + " of " + drivers.filter((driver) => driver.speeds.straight).length + " cars with a current ST value.",
      tone: speedRank < 3 ? "green" : "neutral",
    });
  }

  const positions = selectLiveLapPositions(store, selected.number);
  if (positions.length >= 2) {
    const start = positions[0];
    const current = positions.at(-1) ?? start;
    const places = start - current;
    insights.push({
      title: "Position trend",
      value: places === 0 ? "UNCHANGED" : places > 0 ? "+" + places + " places" : String(places) + " places",
      detail: "From P" + start + " in LapSeries to P" + current + " now.",
      tone: places > 0 ? "green" : places < 0 ? "yellow" : "neutral",
    });
  }

  const championship = selectLiveChampionship(store).find((row) => row.number === selected.number);
  if (championship && (championship.projectedPosition !== null || championship.projectedPoints !== null)) {
    insights.push({
      title: "Championship projection",
      value:
        (championship.projectedPosition !== null ? "P" + championship.projectedPosition : "") +
        (championship.projectedPoints !== null ? " · " + championship.projectedPoints + " pts" : ""),
      detail: "Projection supplied by the live ChampionshipPrediction feed.",
      tone: "blue",
    });
  }

  return insights.slice(0, 6);
}

export function selectLiveDriverEventCounts(store: LiveTimingStore, number: string) {
  const overtakes = selectLiveOvertakes(store);
  return {
    pitStops: selectLivePitStops(store).filter((stop) => stop.number === number),
    overtakesMade: overtakes.filter((item) => item.overtakingNumber === number).length,
    overtakenBy: overtakes.filter((item) => item.overtakenNumber === number).length,
    radio: selectLiveTeamRadio(store).filter((clip) => clip.number === number),
  };
}

export type LiveCommentaryItem = {
  kicker: string;
  headline: string;
  detail: string;
  tone: LiveInsightTone;
  number?: string;
};

export type LiveDriverFeedFact = {
  feed: string;
  label: string;
  value: string;
};

function driverName(drivers: LiveDriverRow[], number: string) {
  const driver = drivers.find((item) => item.number === number);
  return driver?.tla || driver?.name || ("CAR " + number);
}

function intervalSeconds(value: string) {
  const normalized = value.trim().replace(/^\+/, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function selectLiveCommentary(
  store: LiveTimingStore,
  drivers: LiveDriverRow[],
): LiveCommentaryItem[] {
  const items: LiveCommentaryItem[] = [];
  if (!drivers.length) return items;

  const overtakes = selectLiveOvertakes(store);
  const latestOvertake = overtakes[0];
  if (latestOvertake) {
    items.push({
      kicker: latestOvertake.lap == null ? "OVERTAKE" : "LAP " + latestOvertake.lap,
      headline:
        driverName(drivers, latestOvertake.overtakingNumber) +
        " passed " +
        driverName(drivers, latestOvertake.overtakenNumber),
      detail: "Reported by Formula 1's OvertakeSeries feed.",
      tone: "blue",
      number: latestOvertake.overtakingNumber,
    });
  }

  const closeBattle = drivers
    .filter((driver) => driver.position !== "1" && !driver.inPit && !driver.retired && !driver.stopped)
    .map((driver) => ({ driver, seconds: intervalSeconds(driver.interval) }))
    .filter(
      (row): row is { driver: LiveDriverRow; seconds: number } =>
        row.seconds !== null && row.seconds >= 0,
    )
    .sort((a, b) => a.seconds - b.seconds)[0];
  if (closeBattle && closeBattle.seconds <= 1.5) {
    items.push({
      kicker: closeBattle.seconds < 1 ? "SUB-SECOND BATTLE" : "CLOSE BATTLE",
      headline:
        (closeBattle.driver.tla || closeBattle.driver.number) +
        " is " +
        closeBattle.driver.interval +
        " from the car ahead",
      detail: closeBattle.driver.catching
        ? "The timing feed currently marks this car as catching."
        : "Current IntervalToPositionAhead from the timing feed.",
      tone: closeBattle.driver.catching ? "green" : "yellow",
      number: closeBattle.driver.number,
    });
  }

  const fastest = drivers
    .map((driver) => ({ driver, seconds: parseTimeSeconds(driver.bestLap) }))
    .filter(
      (row): row is { driver: LiveDriverRow; seconds: number } =>
        row.seconds !== null,
    )
    .sort((a, b) => a.seconds - b.seconds)[0];
  if (fastest) {
    items.push({
      kicker: "PACE",
      headline:
        (fastest.driver.tla || fastest.driver.number) +
        " owns the quickest recorded best lap",
      detail: fastest.driver.bestLap,
      tone: "purple",
      number: fastest.driver.number,
    });
  }

  const movers = drivers
    .map((driver) => {
      const positions = selectLiveLapPositions(store, driver.number);
      if (positions.length < 2) return null;
      const start = positions[0];
      const current = positions.at(-1) ?? start;
      return { driver, start, current, places: start - current };
    })
    .filter(
      (
        row,
      ): row is {
        driver: LiveDriverRow;
        start: number;
        current: number;
        places: number;
      } => row !== null,
    )
    .sort((a, b) => Math.abs(b.places) - Math.abs(a.places));
  const mover = movers[0];
  if (mover && mover.places !== 0) {
    items.push({
      kicker: mover.places > 0 ? "BIGGEST GAIN" : "BIGGEST DROP",
      headline:
        (mover.driver.tla || mover.driver.number) +
        (mover.places > 0
          ? " has gained " + mover.places + " places"
          : " has lost " + Math.abs(mover.places) + " places"),
      detail: "LapSeries: P" + mover.start + " → P" + mover.current + ".",
      tone: mover.places > 0 ? "green" : "yellow",
      number: mover.driver.number,
    });
  }

  const latestStop = selectLivePitStops(store)[0];
  if (latestStop) {
    items.push({
      kicker: "PIT ACTIVITY",
      headline:
        driverName(drivers, latestStop.number) +
        (latestStop.lap == null ? " recorded a pit event" : " stopped on lap " + latestStop.lap),
      detail:
        latestStop.duration || latestStop.pitLaneTime
          ? "Reported time: " + (latestStop.duration || latestStop.pitLaneTime)
          : "Pit event reported by the live timing feed.",
      tone: "blue",
      number: latestStop.number,
    });
  }

  const weather = selectLiveWeather(store);
  if (weather?.rainfall) {
    items.push({
      kicker: "WEATHER",
      headline: "Rainfall is being reported at the circuit",
      detail:
        "Track " +
        (weather.trackTemp || "—") +
        "°C · air " +
        (weather.airTemp || "—") +
        "°C.",
      tone: "yellow",
    });
  }

  const track = selectLiveTrackStatus(store);
  if (track && track.status !== "1") {
    items.push({
      kicker: "RACE CONTROL",
      headline: track.label,
      detail: "Current TrackStatus feed state.",
      tone:
        track.status === "5"
          ? "yellow"
          : track.status === "2" || track.status === "4" || track.status === "6"
            ? "yellow"
            : "neutral",
    });
  }

  const pitCars = drivers.filter((driver) => driver.inPit || driver.pitOut);
  if (pitCars.length >= 2) {
    items.push({
      kicker: "PIT LANE",
      headline: pitCars.length + " cars are currently in pit activity",
      detail: pitCars
        .slice(0, 6)
        .map((driver) => driver.tla || driver.number)
        .join(" · "),
      tone: "neutral",
      number: pitCars[0]?.number,
    });
  }

  return items.slice(0, 8);
}

const DRIVER_DETAIL_FEEDS = [
  "TimingStats",
  "DriverRaceInfo",
  "DriverScore",
  "DriverTracker",
  "SPFeed",
  "TlaRcm",
  "TopThree",
  "CurrentTyres",
  "TyreStintSeries",
  "ChampionshipPrediction",
] as const;

const FACT_SKIP_KEYS = new Set([
  "RacingNumber",
  "DriverNumber",
  "CarNumber",
  "Number",
  "BroadcastName",
  "FullName",
  "TeamName",
  "TeamColour",
  "HeadshotUrl",
  "Path",
  "Url",
]);

function scalarFacts(
  value: unknown,
  prefix = "",
  depth = 0,
): Array<{ label: string; value: string }> {
  if (depth > 2) return [];
  const row = object(value);
  if (!row) return [];
  const result: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(row)) {
    if (FACT_SKIP_KEYS.has(key) || raw === null || raw === undefined) continue;
    const label = prefix ? prefix + " · " + key : key;
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      const text = String(raw);
      if (!text || text.length > 120) continue;
      result.push({ label, value: text });
      continue;
    }
    if (depth < 2 && !Array.isArray(raw)) {
      result.push(...scalarFacts(raw, label, depth + 1));
    }
  }
  return result;
}

function driverFeedRecords(feed: unknown, number: string) {
  const root = object(feed);
  if (!root) return [];
  const candidates: unknown[] = [
    object(root.Lines)?.[number],
    object(root.Drivers)?.[number],
    object(root.Entries)?.[number],
    root[number],
  ];
  for (const row of collectRecords(feed, 500)) {
    if (racingNumber(row) === number) candidates.push(row);
  }
  const seen = new Set<object>();
  return candidates.flatMap((candidate) => {
    const row = object(candidate);
    if (!row || seen.has(row)) return [];
    seen.add(row);
    return [row];
  });
}

export function selectLiveDriverFeedFacts(
  store: LiveTimingStore,
  number: string,
): LiveDriverFeedFact[] {
  const facts: LiveDriverFeedFact[] = [];
  const seen = new Set<string>();
  for (const feed of DRIVER_DETAIL_FEEDS) {
    for (const row of driverFeedRecords(store[feed], number)) {
      for (const fact of scalarFacts(row).slice(0, 12)) {
        const key = feed + "|" + fact.label + "|" + fact.value;
        if (seen.has(key)) continue;
        seen.add(key);
        facts.push({ feed, ...fact });
        if (facts.length >= 36) return facts;
      }
    }
  }
  return facts;
}
