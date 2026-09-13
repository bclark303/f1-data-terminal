import { ReplaySyncProvider, type LapSyncAnchor } from "@/components/replay-sync-context";
import { Terminal } from "@/components/terminal";
import { openF1 } from "@/lib/openf1";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sessions = await openF1.sessions(2025, "Canada");
  const session = sessions.find((item) => item.session_name === "Race");
  if (!session) throw new Error("2025 Canadian Grand Prix race session was not found in OpenF1.");

  const [drivers, weather, raceControl, positions, intervals, laps, stints] = await Promise.all([
    openF1.drivers(session.session_key),
    openF1.weather(session.session_key),
    openF1.raceControl(session.session_key),
    openF1.positions(session.session_key),
    openF1.intervals(session.session_key),
    openF1.laps(session.session_key),
    openF1.stints(session.session_key),
  ]);

  const firstLapStart = laps
    .filter((lap) => lap.lap_number === 1 && lap.date_start)
    .map((lap) => lap.date_start as string)
    .sort()[0];

  // OpenF1's scheduled session start can precede the first actual high-rate
  // telemetry/location samples by a few minutes. For replay purposes, anchor
  // the clock to the first recorded Lap 1 start so telemetry is available at t=0.
  const replaySession = firstLapStart ? { ...session, date_start: firstLapStart } : session;

  // The earliest recorded start of each lap corresponds to the leader starting
  // that lap. These timestamps make clean broadcast sync anchors.
  const anchorMap = new Map<number, string>();
  for (const lap of laps) {
    if (!lap.date_start) continue;
    const previous = anchorMap.get(lap.lap_number);
    if (!previous || lap.date_start < previous) anchorMap.set(lap.lap_number, lap.date_start);
  }
  const lapAnchors: LapSyncAnchor[] = [...anchorMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lap, raceTime]) => ({ lap, raceTime }));

  return (
    <ReplaySyncProvider sessionKey={replaySession.session_key} lapAnchors={lapAnchors}>
      <Terminal session={replaySession} drivers={drivers} weather={weather} raceControl={raceControl} positions={positions} intervals={intervals} laps={laps} stints={stints} />
    </ReplaySyncProvider>
  );
}
