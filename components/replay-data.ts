"use client";

import { useEffect, useMemo, useState } from "react";
import type { CarDataPoint, LocationPoint } from "@/lib/types";

const CHUNK_MS = 60_000;
const TELEMETRY_LEAD_IN_MS = 20_000;
const LOCATION_LEAD_IN_MS = 5_000;
const TRACK_SAMPLE_MS = 150_000;

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildUrl(mode: string, sessionKey: number, from: number, to: number, driver?: number) {
  const params = new URLSearchParams({
    mode,
    sessionKey: String(sessionKey),
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
  });
  if (driver) params.set("driver", String(driver));
  return `/api/replay-data?${params.toString()}`;
}

function useRemoteWindow<T>(url: string | null) {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error: string | null }>({
    data: [],
    loading: Boolean(url),
    error: null,
  });

  useEffect(() => {
    let active = true;
    if (!url) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    fetchCached<T[]>(url).then(
      (data) => {
        if (active) setState({ data, loading: false, error: null });
      },
      (error: unknown) => {
        if (active) {
          setState({
            data: [],
            loading: false,
            error: error instanceof Error ? error.message : "Replay data request failed",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [url]);

  return state;
}

export function useTelemetryWindow({
  sessionKey,
  raceTime,
  sessionStart,
  sessionEnd,
}: {
  sessionKey: number;
  raceTime: number;
  sessionStart: number;
  sessionEnd: number;
}) {
  const url = useMemo(() => {
    const chunkStart = sessionStart + Math.floor(Math.max(0, raceTime - sessionStart) / CHUNK_MS) * CHUNK_MS;
    const from = clamp(chunkStart - TELEMETRY_LEAD_IN_MS, sessionStart, sessionEnd);
    const to = clamp(chunkStart + CHUNK_MS, sessionStart, sessionEnd);
    return buildUrl("telemetry", sessionKey, from, to);
  }, [sessionKey, raceTime, sessionStart, sessionEnd]);

  return useRemoteWindow<CarDataPoint>(url);
}

export function useLocationWindow({
  sessionKey,
  raceTime,
  sessionStart,
  sessionEnd,
}: {
  sessionKey: number;
  raceTime: number;
  sessionStart: number;
  sessionEnd: number;
}) {
  const url = useMemo(() => {
    const chunkStart = sessionStart + Math.floor(Math.max(0, raceTime - sessionStart) / CHUNK_MS) * CHUNK_MS;
    const from = clamp(chunkStart - LOCATION_LEAD_IN_MS, sessionStart, sessionEnd);
    const to = clamp(chunkStart + CHUNK_MS, sessionStart, sessionEnd);
    return buildUrl("locations", sessionKey, from, to);
  }, [sessionKey, raceTime, sessionStart, sessionEnd]);

  return useRemoteWindow<LocationPoint>(url);
}

export function useTrackGeometry({
  sessionKey,
  driverNumber,
  sessionStart,
  sessionEnd,
}: {
  sessionKey: number;
  driverNumber: number;
  sessionStart: number;
  sessionEnd: number;
}) {
  const url = useMemo(() => {
    if (!driverNumber) return null;
    const from = sessionStart;
    const to = Math.min(sessionEnd, sessionStart + TRACK_SAMPLE_MS);
    return buildUrl("track", sessionKey, from, to, driverNumber);
  }, [sessionKey, driverNumber, sessionStart, sessionEnd]);

  return useRemoteWindow<LocationPoint>(url);
}
