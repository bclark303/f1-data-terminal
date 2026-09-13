import type {
  Driver,
  IntervalPoint,
  Lap,
  LocationPoint,
  PositionPoint,
  RaceControlMessage,
  Session,
  Stint,
  Weather,
} from "./types";

const OPENF1_BASE = "https://api.openf1.org/v1";

async function query<T>(endpoint: string, params: Record<string, string | number>): Promise<T[]> {
  const url = new URL(`${OPENF1_BASE}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`OpenF1 ${endpoint} request failed: ${response.status}`);
  return response.json() as Promise<T[]>;
}

export const openF1 = {
  sessions: (year: number, countryName?: string) =>
    query<Session>("sessions", {
      year,
      ...(countryName ? { country_name: countryName } : {}),
    }),
  drivers: (sessionKey: number) => query<Driver>("drivers", { session_key: sessionKey }),
  weather: (sessionKey: number) => query<Weather>("weather", { session_key: sessionKey }),
  raceControl: (sessionKey: number) =>
    query<RaceControlMessage>("race_control", { session_key: sessionKey }),
  positions: (sessionKey: number) => query<PositionPoint>("position", { session_key: sessionKey }),
  intervals: (sessionKey: number) => query<IntervalPoint>("intervals", { session_key: sessionKey }),
  laps: (sessionKey: number) => query<Lap>("laps", { session_key: sessionKey }),
  stints: (sessionKey: number) => query<Stint>("stints", { session_key: sessionKey }),
  locations: (sessionKey: number) => query<LocationPoint>("location", { session_key: sessionKey }),
};
