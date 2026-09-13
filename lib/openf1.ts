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

const OPENF1_BASE = "https://api.openf1.org/v1";

// OpenF1's free historical tier is limited to 3 requests/second and
// 30 requests/minute. Keep requests slightly below the short-term limit and
// serialize them so a page render cannot create a burst of parallel calls.
const MIN_REQUEST_INTERVAL_MS = 400;
const MAX_429_RETRIES = 4;

let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

// Next.js also caches fetches, but this prevents repeated requests during a
// single dev-server process (including React/Next development re-renders).
const memoryCache = new Map<string, Promise<unknown[]>>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, attempt: number) {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);

    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(1000, date - Date.now());
  }

  return Math.min(8000, 1000 * 2 ** attempt);
}

async function scheduledFetch(url: URL): Promise<Response> {
  let response!: Response;
  let terminalError: unknown;

  const task = requestQueue.then(async () => {
    for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
      const waitMs = Math.max(0, nextRequestAt - Date.now());
      if (waitMs > 0) await sleep(waitMs);

      nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;

      try {
        response = await fetch(url, { next: { revalidate: 3600 } });
      } catch (error) {
        terminalError = error;
        break;
      }

      if (response.status !== 429) return;
      if (attempt === MAX_429_RETRIES) return;

      await sleep(retryAfterMs(response, attempt));
    }
  });

  // A failed request must not poison the queue for later requests.
  requestQueue = task.then(
    () => undefined,
    () => undefined,
  );

  await task;

  if (terminalError) throw terminalError;
  return response;
}

async function responseDetail(response: Response) {
  try {
    const text = await response.text();
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
  } catch {
    return "";
  }
}

async function query<T>(endpoint: string, params: Record<string, string | number>): Promise<T[]> {
  const url = new URL(`${OPENF1_BASE}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const cacheKey = url.toString();
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached as Promise<T[]>;

  const pending = (async () => {
    const response = await scheduledFetch(url);
    if (!response.ok) {
      const detail = await responseDetail(response);
      const liveHint = [401, 403, 404].includes(response.status)
        ? " OpenF1 may be inside its live-session access window; unauthenticated historical requests can be temporarily restricted."
        : "";
      throw new Error(
        `OpenF1 ${endpoint} request failed: ${response.status}.${liveHint}${detail ? ` ${detail}` : ""}`,
      );
    }
    return response.json() as Promise<T[]>;
  })();

  memoryCache.set(cacheKey, pending as Promise<unknown[]>);

  try {
    return await pending;
  } catch (error) {
    // Failed responses should be retryable on the next render/refresh.
    memoryCache.delete(cacheKey);
    throw error;
  }
}

function timeWindow(from: string, to: string) {
  return { "date>=": from, "date<=": to };
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
  carDataWindow: (sessionKey: number, from: string, to: string) =>
    query<CarDataPoint>("car_data", {
      session_key: sessionKey,
      ...timeWindow(from, to),
    }),
  locationWindow: (sessionKey: number, from: string, to: string, driverNumber?: number) =>
    query<LocationPoint>("location", {
      session_key: sessionKey,
      ...(driverNumber ? { driver_number: driverNumber } : {}),
      ...timeWindow(from, to),
    }),
};
