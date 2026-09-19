"use client";

import { createContext, useContext, useMemo } from "react";

export type LapSyncAnchor = {
  lap: number;
  raceTime: string;
};

type ReplaySyncContextValue = {
  sessionKey: number;
  lapAnchors: LapSyncAnchor[];
};

const ReplaySyncContext = createContext<ReplaySyncContextValue | null>(null);

export function ReplaySyncProvider({
  sessionKey,
  lapAnchors,
  children,
}: {
  sessionKey: number;
  lapAnchors: LapSyncAnchor[];
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ sessionKey, lapAnchors }),
    [sessionKey, lapAnchors],
  );
  return (
    <ReplaySyncContext.Provider value={value}>
      {children}
    </ReplaySyncContext.Provider>
  );
}

export function useReplaySync() {
  const value = useContext(ReplaySyncContext);
  if (!value)
    throw new Error("useReplaySync must be used inside ReplaySyncProvider");
  return value;
}
