"use client";
import { useEffect, useState } from "react";
import type { CarDataPoint, LocationPoint } from "@/lib/types";
import { BoundedCache } from "@/lib/cache";
import { normalizeData, type Endpoint } from "@/lib/data-schema";
const cache = new BoundedCache<unknown[]>(12, 48 * 1024 * 1024, 3600000);
const pending = new Map<
  string,
  {
    promise: Promise<unknown[]>;
    controller: AbortController;
    consumers: number;
  }
>();
function acquire(url: string, endpoint: Endpoint) {
  const cached = cache.get(url);
  if (cached) return { promise: Promise.resolve(cached), release: () => {} };
  let entry = pending.get(url);
  if (!entry) {
    const controller = new AbortController();
    const promise = fetch(url, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
    }).then(async (response) => {
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error ??
            "Data request failed",
        );
      const rows = normalizeData<unknown>(endpoint, await response.json());
      cache.set(url, rows, JSON.stringify(rows).length * 2);
      return rows;
    });
    entry = { promise, controller, consumers: 0 };
    pending.set(url, entry);
    const current = entry;
    void promise
      .finally(() => {
        if (pending.get(url) === current) pending.delete(url);
      })
      .catch(() => {});
  }
  entry.consumers++;
  const current = entry;
  return {
    promise: current.promise,
    release: () => {
      current.consumers--;
      // Allow same-turn Strict Mode re-subscription and sharing between geometry and driver views.
      queueMicrotask(() => {
        if (!current.consumers && pending.get(url) === current) {
          pending.delete(url);
          current.controller.abort();
        }
      });
    },
  };
}
function useRemoteData<T>(url: string | null, endpoint: Endpoint) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    key: string;
    data: T[];
    error: string | null;
  } | null>(null);
  const key = `${url}:${attempt}`;
  useEffect(() => {
    if (!url) return;
    let active = true;
    const request = acquire(url, endpoint);
    request.promise.then(
      (data) => {
        if (active) setSettled({ key, data: data as T[], error: null });
      },
      (error) => {
        if (active)
          setSettled({
            key,
            data: [],
            error: error.message ?? "Data unavailable",
          });
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [url, endpoint, key]);
  return {
    data: settled?.key === key ? settled.data : ([] as T[]),
    loading: Boolean(url && settled?.key !== key),
    error: settled?.key === key ? settled.error : null,
    retry: () => {
      if (url) cache.delete(url);
      setAttempt((value) => value + 1);
    },
  };
}
function buildUrl(mode: string, session: number, driver: number) {
  return driver
    ? `/api/replay-data?${new URLSearchParams({ mode, sessionKey: String(session), driver: String(driver) })}`
    : null;
}
export function useDriverTelemetry(session: number, driver: number) {
  return useRemoteData<CarDataPoint>(
    buildUrl("telemetry", session, driver),
    "car_data",
  );
}
export function useDriverLocation(session: number, driver: number) {
  return useRemoteData<LocationPoint>(
    buildUrl("track", session, driver),
    "location",
  );
}
export const useTrackGeometry = useDriverLocation;
