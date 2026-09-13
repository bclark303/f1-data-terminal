"use client";

import { useEffect, useMemo, useState } from "react";
import type { CarDataPoint, LocationPoint } from "@/lib/types";

const clientCache = new Map<string, Promise<unknown>>();

async function fetchCached<T>(url: string): Promise<T> {
  let pending = clientCache.get(url) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(url).then(async (response) => {
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Replay data request failed: ${response.status}`);
      }
      return response.json() as Promise<T>;
    });
    clientCache.set(url, pending);
    pending.catch(() => clientCache.delete(url));
  }
  return pending;
}

function buildUrl(mode: "telemetry" | "track", sessionKey: number, driverNumber: number) {
  const params = new URLSearchParams({
    mode,
    sessionKey: String(sessionKey),
    driver: String(driverNumber),
  });
  return `/api/replay-data?${params.toString()}`;
}

function useRemoteData<T>(url: string | null) {
  const [settled, setSettled] = useState<{ url: string | null; data: T[]; error: string | null }>({
    url: null,
    data: [],
    error: null,
  });

  useEffect(() => {
    let active = true;
    if (!url) return;

    fetchCached<T[]>(url).then(
      (data) => {
        if (active) setSettled({ url, data, error: null });
      },
      (error: unknown) => {
        if (active) {
          setSettled({
            url,
            data: [],
            error: error instanceof Error ? error.message : "Replay data request failed",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [url]);

  if (!url) return { data: [] as T[], loading: false, error: null as string | null };
  const current = settled.url === url;
  return {
    data: current ? settled.data : [],
    loading: !current,
    error: current ? settled.error : null,
  };
}

/**
 * OpenF1's historical high-rate endpoints are most reliable when queried by
 * session + driver. Fetch the selected driver's complete telemetry once and
 * seek through it locally; switching back to that driver is then instant.
 */
export function useDriverTelemetry(sessionKey: number, driverNumber: number) {
  const url = useMemo(
    () => driverNumber ? buildUrl("telemetry", sessionKey, driverNumber) : null,
    [sessionKey, driverNumber],
  );
  return useRemoteData<CarDataPoint>(url);
}

/**
 * Fetch a driver's complete location stream. The same client cache is shared
 * with circuit-geometry requests, so when the selected driver is also the
 * geometry driver this does not generate a second download.
 */
export function useDriverLocation(sessionKey: number, driverNumber: number) {
  const url = useMemo(
    () => driverNumber ? buildUrl("track", sessionKey, driverNumber) : null,
    [sessionKey, driverNumber],
  );
  return useRemoteData<LocationPoint>(url);
}

/**
 * One driver's full-session location stream is enough to recover a clean lap
 * and construct the circuit geometry. Field positions are derived from lap
 * progress so we do not need twenty simultaneous 3.7 Hz location streams.
 */
export function useTrackGeometry(sessionKey: number, driverNumber: number) {
  return useDriverLocation(sessionKey, driverNumber);
}
