"use client";

import { useMemo, useState } from "react";
import type { Driver, IntervalPoint, Lap, LocationPoint, PositionPoint, RaceControlMessage, Session, Stint, Weather } from "@/lib/types";
import { formatLap, latestAt } from "@/lib/time";
import { Panel } from "./panel";
import { ReplayControls } from "./replay-controls";
import { ReplayClockProvider, useReplayClock } from "./replay-clock";

type TerminalProps = {
  session: Session;
  drivers: Driver[];
  weather: Weather[];
  raceControl: RaceControlMessage[];
  positions: PositionPoint[];
  intervals: IntervalPoint[];
  laps: Lap[];
  stints: Stint[];
  locations: LocationPoint[];
};

function TerminalContent({ session, drivers, weather, raceControl, positions, intervals, laps, stints, locations }: TerminalProps) {
  const clock = useReplayClock();
  const [selectedDriver, setSelectedDriver] = useState(drivers[0]?.driver_number ?? 0);

  const byDriver = useMemo(() => {
    const group = <T extends { driver_number: number }>(items: T[]) => {
      const map = new Map<number, T[]>();
      for (const item of items) {
        const bucket = map.get(item.driver_number);
        if (bucket) bucket.push(item);
        else map.set(item.driver_number, [item]);
      }
      return map;
    };

    return {
      positions: group(positions),
      intervals: group(intervals),
      laps: group(laps),
      stints: group(stints),
    };
  }, [positions, intervals, laps, stints]);

  const state = useMemo(() => {
    const currentWeather = latestAt(weather, (row) => row.date, clock.raceTime);
    const visibleRaceControl = raceControl.filter((row) => Date.parse(row.date) <= clock.raceTime).slice(-20).reverse();
    const rows = drivers.map((driver) => {
      const driverPositions = byDriver.positions.get(driver.driver_number) ?? [];
      const driverIntervals = byDriver.intervals.get(driver.driver_number) ?? [];
      const allDriverLaps = byDriver.laps.get(driver.driver_number) ?? [];
      const driverLaps = allDriverLaps.filter((row) => row.date_start && Date.parse(row.date_start) <= clock.raceTime);
      const currentPosition = latestAt(driverPositions, (row) => row.date, clock.raceTime);
      const currentInterval = latestAt(driverIntervals, (row) => row.date, clock.raceTime);
      const lastLap = driverLaps.at(-1);
      const bestLap = driverLaps.filter((lap) => lap.lap_duration).sort((a, b) => (a.lap_duration ?? Infinity) - (b.lap_duration ?? Infinity))[0];
      const currentStint = (byDriver.stints.get(driver.driver_number) ?? [])
        .filter((row) => row.lap_start <= (lastLap?.lap_number ?? 1))
        .sort((a, b) => b.stint_number - a.stint_number)[0];
      return { driver, currentPosition, currentInterval, lastLap, bestLap, currentStint };
    }).sort((a, b) => (a.currentPosition?.position ?? 99) - (b.currentPosition?.position ?? 99));

    return { currentWeather, visibleRaceControl, rows };
  }, [weather, raceControl, drivers, byDriver, clock.raceTime]);

  const selected = state.rows.find((row) => row.driver.driver_number === selectedDriver) ?? state.rows[0];
  const currentLap = Math.max(1, ...state.rows.map((row) => row.lastLap?.lap_number ?? 1));

  return (
    <main className="terminalShell">
      <header className="topBar">
        <div>
          <div className="brand">F1 DATA TERMINAL <span>REPLAY</span></div>
          <div className="eventName">{session.year} {session.country_name.toUpperCase()} GRAND PRIX</div>
        </div>
        <div className="sessionStats">
          <span>{session.circuit_short_name}</span>
          <strong>LAP {currentLap}</strong>
          <span>{new Date(clock.raceTime).toISOString().slice(11, 19)} UTC</span>
        </div>
      </header>

      <div className="terminalGrid">
        <Panel title="Timing / Classification" kicker="FIELD" className="timingPanel">
          <div className="timingTable">
            <div className="timingHeader timingRow">
              <span>P</span><span>DRIVER</span><span>GAP</span><span>INT</span><span>LAST</span><span>BEST</span><span>TYRE</span><span>AGE</span>
            </div>
            {state.rows.map((row) => {
              const active = row.driver.driver_number === selectedDriver;
              const lapAge = row.currentStint && row.lastLap ? row.lastLap.lap_number - row.currentStint.lap_start + 1 + row.currentStint.tyre_age_at_start : null;
              return (
                <button key={row.driver.driver_number} className={`timingRow driverRow ${active ? "selected" : ""}`} onClick={() => setSelectedDriver(row.driver.driver_number)}>
                  <span className="position">{row.currentPosition?.position ?? "—"}</span>
                  <span className="driverCell"><i style={{ background: `#${row.driver.team_colour}` }} />{row.driver.name_acronym}</span>
                  <span>{row.currentInterval?.gap_to_leader ?? (row.currentPosition?.position === 1 ? "LEADER" : "—")}</span>
                  <span>{row.currentInterval?.interval ?? "—"}</span>
                  <span>{formatLap(row.lastLap?.lap_duration)}</span>
                  <span>{formatLap(row.bestLap?.lap_duration)}</span>
                  <span>{row.currentStint?.compound?.slice(0, 1) ?? "—"}</span>
                  <span>{lapAge ?? "—"}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Driver / Car" kicker="FOCUS" className="driverPanel" actions={
          <select value={selectedDriver} onChange={(e) => setSelectedDriver(Number(e.target.value))}>
            {drivers.map((driver) => <option key={driver.driver_number} value={driver.driver_number}>{driver.driver_number} {driver.name_acronym}</option>)}
          </select>
        }>
          {selected && <>
            <div className="driverHero">
              <div className="driverNumber" style={{ borderColor: `#${selected.driver.team_colour}` }}>{selected.driver.driver_number}</div>
              <div><h3>{selected.driver.full_name}</h3><p>{selected.driver.team_name}</p></div>
              <div className="driverPosition">P{selected.currentPosition?.position ?? "—"}</div>
            </div>
            <div className="metricGrid">
              <Metric label="Gap" value={String(selected.currentInterval?.gap_to_leader ?? (selected.currentPosition?.position === 1 ? "LEADER" : "—"))} />
              <Metric label="Interval" value={String(selected.currentInterval?.interval ?? "—")} />
              <Metric label="Last Lap" value={formatLap(selected.lastLap?.lap_duration)} />
              <Metric label="Best Lap" value={formatLap(selected.bestLap?.lap_duration)} />
              <Metric label="Tyre" value={selected.currentStint?.compound ?? "—"} />
              <Metric label="Stint" value={selected.currentStint ? `#${selected.currentStint.stint_number}` : "—"} />
            </div>
            <div className="telemetryPlaceholder">
              <span>TELEMETRY</span>
              <p>Speed / throttle / brake / gear traces are the next data layer.</p>
            </div>
          </>}
        </Panel>

        <Panel title="Virtual Track" kicker="POSITION" className="trackPanel">
          <VirtualTrack drivers={drivers} locations={locations} raceTime={clock.raceTime} selectedDriver={selectedDriver} onSelect={setSelectedDriver} />
        </Panel>

        <Panel title="Race Control" kicker="EVENT FEED" className="controlPanel">
          <div className="eventFeed">
            {state.visibleRaceControl.map((event, index) => (
              <button key={`${event.date}-${index}`} className="eventItem" onClick={() => clock.seek(Date.parse(event.date) - clock.sessionStart - clock.syncOffsetMs - 5000)}>
                <span className={`flag flag-${(event.flag ?? event.category).toLowerCase().replaceAll(" ", "-")}`}>{event.flag ?? event.category}</span>
                <span className="eventTime">{new Date(event.date).toISOString().slice(11, 19)}</span>
                <span className="eventMessage">{event.message}</span>
              </button>
            ))}
            {!state.visibleRaceControl.length && <div className="emptyState">No race control messages yet.</div>}
          </div>
        </Panel>

        <Panel title="Track / Venue" kicker="CONDITIONS" className="weatherPanel">
          <div className="venueTitle"><strong>{session.circuit_short_name}</strong><span>{session.location}, {session.country_name}</span></div>
          <div className="weatherGrid">
            <Metric label="Air" value={state.currentWeather ? `${state.currentWeather.air_temperature.toFixed(1)}°C` : "—"} />
            <Metric label="Track" value={state.currentWeather ? `${state.currentWeather.track_temperature.toFixed(1)}°C` : "—"} />
            <Metric label="Humidity" value={state.currentWeather ? `${state.currentWeather.humidity}%` : "—"} />
            <Metric label="Pressure" value={state.currentWeather ? `${state.currentWeather.pressure.toFixed(0)} mb` : "—"} />
            <Metric label="Wind" value={state.currentWeather ? `${state.currentWeather.wind_speed.toFixed(1)} m/s` : "—"} />
            <Metric label="Rain" value={state.currentWeather ? (state.currentWeather.rainfall ? "YES" : "NO") : "—"} />
          </div>
        </Panel>
      </div>

      <ReplayControls />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function VirtualTrack({ drivers, locations, raceTime, selectedDriver, onSelect }: { drivers: Driver[]; locations: LocationPoint[]; raceTime: number; selectedDriver: number; onSelect: (driver: number) => void }) {
  const points = useMemo(() => {
    return drivers.map((driver) => {
      const samples = locations.filter((row) => row.driver_number === driver.driver_number);
      const current = latestAt(samples, (row) => row.date, raceTime);
      return current ? { driver, current } : null;
    }).filter(Boolean) as { driver: Driver; current: LocationPoint }[];
  }, [drivers, locations, raceTime]);

  if (!points.length) return <div className="trackCanvas emptyTrack">Position data appears as replay advances.</div>;
  const xs = points.map((p) => p.current.x); const ys = points.map((p) => p.current.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);

  return <div className="trackCanvas">
    {points.map(({ driver, current }) => {
      const left = 8 + ((current.x - minX) / spanX) * 84;
      const top = 8 + ((current.y - minY) / spanY) * 84;
      return <button key={driver.driver_number} className={`carDot ${selectedDriver === driver.driver_number ? "selected" : ""}`} style={{ left: `${left}%`, top: `${top}%`, borderColor: `#${driver.team_colour}` }} onClick={() => onSelect(driver.driver_number)} title={driver.full_name}>{driver.driver_number}</button>;
    })}
  </div>;
}

export function Terminal(props: TerminalProps) {
  return <ReplayClockProvider sessionStart={props.session.date_start} sessionEnd={props.session.date_end}><TerminalContent {...props} /></ReplayClockProvider>;
}
