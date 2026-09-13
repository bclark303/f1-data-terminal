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

  return <Terminal session={session} drivers={drivers} weather={weather} raceControl={raceControl} positions={positions} intervals={intervals} laps={laps} stints={stints} locations={[]} />;
}
