import type {
  CarDataPoint,
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
import { BoundedCache } from "./cache";
import { normalizeData, type Endpoint } from "./data-schema";
import { readDisk, writeDisk } from "./disk-cache";
import { RequestScheduler, UpstreamError } from "./request-scheduler";
const memory = new BoundedCache<unknown[]>();
const pending = new Map<string, Promise<unknown[]>>();
const scheduler = new RequestScheduler();
export async function readJsonBounded(
  response: Response,
  limit = 20 * 1024 * 1024,
) {
  if (!response.body) throw new UpstreamError("Empty upstream body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit)
        throw new UpstreamError("Dataset exceeds download limit");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
async function query<T>(
  endpoint: Endpoint,
  params: Record<string, string | number>,
): Promise<T[]> {
  const url = new URL(`https://api.openf1.org/v1/${endpoint}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value));
  const key = url.toString(),
    cached = memory.get(key);
  if (cached) return cached as T[];
  const shared = pending.get(key);
  if (shared) return shared as Promise<T[]>;
  if (pending.size >= 32)
    throw new UpstreamError("Too many pending datasets", 503);
  const request = (async () => {
    const disk = await readDisk(key);
    if (disk !== undefined) {
      try {
        const data = normalizeData<T>(endpoint, disk);
        memory.set(key, data, JSON.stringify(data).length * 2);
        return data;
      } catch {
        /* Refetch incompatible cache. */
      }
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await scheduler.run(
        async () => {
          try {
            const response = await fetch(url, {
              cache: "no-store",
              signal: AbortSignal.timeout(15000),
            });
            if (response.status === 429 || response.status >= 500) {
              const header = response.headers.get("retry-after");
              const delay =
                header && Number.isFinite(Number(header))
                  ? Number(header) * 1000
                  : header && Number.isFinite(Date.parse(header))
                    ? Date.parse(header) - Date.now()
                    : 1000 * 2 ** attempt;
              scheduler.defer(Math.max(1000, delay));
              await response.body?.cancel();
              return null;
            }
            if (!response.ok) {
              await response.body?.cancel();
              throw new UpstreamError(
                `OpenF1 ${endpoint} unavailable (${response.status})`,
              );
            }
            return normalizeData<T>(endpoint, await readJsonBounded(response));
          } catch (error) {
            if (error instanceof UpstreamError) throw error;
            throw new UpstreamError(
              error instanceof Error &&
                ["TimeoutError", "AbortError"].includes(error.name)
                ? "OpenF1 request timed out"
                : `OpenF1 ${endpoint} returned unavailable or invalid data`,
              502,
            );
          }
        },
        endpoint === "car_data" || endpoint === "location" ? 1 : 0,
      );
      if (result !== null) {
        memory.set(key, result, JSON.stringify(result).length * 2);
        await writeDisk(key, result);
        return result;
      }
    }
    throw new UpstreamError("OpenF1 busy; retry shortly", 503);
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}
export const openF1 = {
  sessions: (year: number, countryName?: string) =>
    query<Session>("sessions", {
      year,
      ...(countryName ? { country_name: countryName } : {}),
    }),
  raceSessions: () =>
    query<Session>("sessions", {
      session_name: "Race",
      "date_start>=": "2023-01-01",
    }),
  drivers: (key: number) => query<Driver>("drivers", { session_key: key }),
  weather: (key: number) => query<Weather>("weather", { session_key: key }),
  raceControl: (key: number) =>
    query<RaceControlMessage>("race_control", { session_key: key }),
  positions: (key: number) =>
    query<PositionPoint>("position", { session_key: key }),
  intervals: (key: number) =>
    query<IntervalPoint>("intervals", { session_key: key }),
  laps: (key: number) => query<Lap>("laps", { session_key: key }),
  stints: (key: number) => query<Stint>("stints", { session_key: key }),
  carDataDriver: (key: number, driver: number) =>
    query<CarDataPoint>("car_data", {
      session_key: key,
      driver_number: driver,
    }),
  locationDriver: (key: number, driver: number) =>
    query<LocationPoint>("location", {
      session_key: key,
      driver_number: driver,
    }),
};
