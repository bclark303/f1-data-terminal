"use client";

import { useMemo, useState } from "react";
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
} from "@/lib/types";
import { formatLap, latestAt } from "@/lib/time";
import { Panel } from "./panel";
import { ReplayControls } from "./replay-controls";
import { ReplayClockProvider, useReplayClock } from "./replay-clock";
import { useLocationWindow, useTelemetryWindow, useTrackGeometry } from "./replay-data";

type TerminalProps = {
  session: Session;
  drivers: Driver[];
  weather: Weather[];
  raceControl: RaceControlMessage[];
  positions: PositionPoint[];
  intervals: IntervalPoint[];
  laps: Lap[];
  stints: Stint[];
};

function TerminalContent({ session, drivers, weather, raceControl, positions, intervals, laps, stints }: TerminalProps) {
  const clock = useReplayClock();
  const [selectedDriver, setSelectedDriver] = useState(drivers[0]?.driver_number ?? 0);
  const geometryDriver = drivers[0]?.driver_number ?? 0;

  const telemetry = useTelemetryWindow({
    sessionKey: session.session_key,
    raceTime: clock.raceTime,
    sessionStart: clock.sessionStart,
    sessionEnd: clock.sessionEnd,
  });
  const locationWindow = useLocationWindow({
    sessionKey: session.session_key,
    raceTime: clock.raceTime,
    sessionStart: clock.sessionStart,
    sessionEnd: clock.sessionEnd,
  });
  const trackGeometry = useTrackGeometry({
    sessionKey: session.session_key,
    driverNumber: geometryDriver,
    sessionStart: clock.sessionStart,
    sessionEnd: clock.sessionEnd,
  });

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

        <Panel title="Driver / Car" kicker="FOCUS + TELEMETRY" className="driverPanel" actions={
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
            <TelemetryPanel data={telemetry.data.filter((point) => point.driver_number === selected.driver.driver_number)} raceTime={clock.raceTime} loading={telemetry.loading} error={telemetry.error} teamColour={selected.driver.team_colour} />
          </>}
        </Panel>

        <Panel title="Virtual Track" kicker="LIVE XY POSITION" className="trackPanel">
          <VirtualTrack
            drivers={drivers}
            locations={locationWindow.data}
            geometry={trackGeometry.data}
            raceTime={clock.raceTime}
            selectedDriver={selectedDriver}
            onSelect={setSelectedDriver}
            loading={locationWindow.loading || trackGeometry.loading}
            error={locationWindow.error ?? trackGeometry.error}
          />
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

function TelemetryPanel({
  data,
  raceTime,
  loading,
  error,
  teamColour,
}: {
  data: CarDataPoint[];
  raceTime: number;
  loading: boolean;
  error: string | null;
  teamColour: string;
}) {
  const current = latestAt(data, (row) => row.date, raceTime);
  const traceStart = raceTime - 15_000;
  const trace = useMemo(
    () => data.filter((point) => {
      const timestamp = Date.parse(point.date);
      return timestamp >= traceStart && timestamp <= raceTime;
    }),
    [data, traceStart, raceTime],
  );

  const drs = !current ? "—" : current.drs >= 10 ? "OPEN" : current.drs === 8 ? "ARMED" : "CLOSED";

  return <div className="telemetryBlock">
    <div className="telemetryHeading">
      <span>CAR TELEMETRY</span>
      <span className={error ? "dataState error" : loading ? "dataState loading" : "dataState live"}>
        {error ? "ERROR" : loading ? "LOADING" : current ? "REPLAY DATA" : "NO SAMPLE"}
      </span>
    </div>
    {error && <div className="dataError">{error}</div>}
    <div className="telemetryLiveGrid">
      <TelemetryMetric label="Speed" value={current ? `${current.speed}` : "—"} unit="km/h" />
      <TelemetryMetric label="Gear" value={current ? `${current.n_gear}` : "—"} />
      <TelemetryMetric label="RPM" value={current ? current.rpm.toLocaleString() : "—"} />
      <TelemetryMetric label="DRS" value={drs} active={drs === "OPEN"} />
    </div>
    <div className="pedalGrid">
      <PedalBar label="Throttle" value={current?.throttle ?? 0} />
      <PedalBar label="Brake" value={current?.brake ?? 0} />
    </div>
    <div className="traceStack">
      <TelemetryTrace label="SPEED" data={trace} raceTime={raceTime} value={(point) => point.speed} min={0} max={350} teamColour={teamColour} />
      <TelemetryTrace label="THROTTLE" data={trace} raceTime={raceTime} value={(point) => point.throttle} min={0} max={100} />
      <TelemetryTrace label="BRAKE" data={trace} raceTime={raceTime} value={(point) => point.brake} min={0} max={100} />
    </div>
  </div>;
}

function TelemetryMetric({ label, value, unit, active = false }: { label: string; value: string; unit?: string; active?: boolean }) {
  return <div className={`telemetryMetric ${active ? "active" : ""}`}>
    <span>{label}</span><strong>{value}</strong>{unit && <small>{unit}</small>}
  </div>;
}

function PedalBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return <div className="pedal">
    <div><span>{label}</span><strong>{Math.round(clamped)}%</strong></div>
    <div className="pedalTrack"><i style={{ width: `${clamped}%` }} /></div>
  </div>;
}

function TelemetryTrace({
  label,
  data,
  raceTime,
  value,
  min,
  max,
  teamColour,
}: {
  label: string;
  data: CarDataPoint[];
  raceTime: number;
  value: (point: CarDataPoint) => number;
  min: number;
  max: number;
  teamColour?: string;
}) {
  const width = 320;
  const height = 38;
  const start = raceTime - 15_000;
  const range = Math.max(1, max - min);
  const path = data.map((point, index) => {
    const timestamp = Date.parse(point.date);
    const x = ((timestamp - start) / 15_000) * width;
    const y = height - ((Math.max(min, Math.min(max, value(point))) - min) / range) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return <div className="traceRow">
    <span>{label}</span>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={`${label} telemetry trace`}>
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} className="traceBaseline" />
      {path && <path d={path} className="traceLine" style={teamColour ? { stroke: `#${teamColour}` } : undefined} />}
    </svg>
  </div>;
}

type Projection = {
  x: (value: number) => number;
  y: (value: number) => number;
};

function makeProjection(points: LocationPoint[]): Projection | null {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const canvasWidth = 1000;
  const canvasHeight = 600;
  const padding = 48;
  const scale = Math.min((canvasWidth - padding * 2) / spanX, (canvasHeight - padding * 2) / spanY);
  const offsetX = (canvasWidth - spanX * scale) / 2;
  const offsetY = (canvasHeight - spanY * scale) / 2;

  return {
    x: (value) => offsetX + (value - minX) * scale,
    y: (value) => offsetY + (value - minY) * scale,
  };
}

function VirtualTrack({
  drivers,
  locations,
  geometry,
  raceTime,
  selectedDriver,
  onSelect,
  loading,
  error,
}: {
  drivers: Driver[];
  locations: LocationPoint[];
  geometry: LocationPoint[];
  raceTime: number;
  selectedDriver: number;
  onSelect: (driver: number) => void;
  loading: boolean;
  error: string | null;
}) {
  const byDriver = useMemo(() => {
    const grouped = new Map<number, LocationPoint[]>();
    for (const point of locations) {
      const bucket = grouped.get(point.driver_number);
      if (bucket) bucket.push(point);
      else grouped.set(point.driver_number, [point]);
    }
    return grouped;
  }, [locations]);

  const projectionSource = geometry.length >= 10 ? geometry : locations;
  const projection = useMemo(() => makeProjection(projectionSource), [projectionSource]);
  const currentPoints = useMemo(() => drivers.map((driver) => {
    const samples = byDriver.get(driver.driver_number) ?? [];
    const current = latestAt(samples, (row) => row.date, raceTime);
    return current ? { driver, current } : null;
  }).filter(Boolean) as { driver: Driver; current: LocationPoint }[], [drivers, byDriver, raceTime]);

  const selectedTrail = useMemo(() => (byDriver.get(selectedDriver) ?? []).filter((point) => {
    const timestamp = Date.parse(point.date);
    return timestamp <= raceTime && timestamp >= raceTime - 6000;
  }), [byDriver, selectedDriver, raceTime]);

  const trackPath = useMemo(() => {
    if (!projection || geometry.length < 2) return "";
    return geometry.filter((_, index) => index % 2 === 0).map((point, index) =>
      `${index === 0 ? "M" : "L"}${projection.x(point.x).toFixed(1)},${projection.y(point.y).toFixed(1)}`,
    ).join(" ");
  }, [geometry, projection]);

  const trailPath = useMemo(() => {
    if (!projection || selectedTrail.length < 2) return "";
    return selectedTrail.map((point, index) =>
      `${index === 0 ? "M" : "L"}${projection.x(point.x).toFixed(1)},${projection.y(point.y).toFixed(1)}`,
    ).join(" ");
  }, [projection, selectedTrail]);

  if (!projection) {
    return <div className="trackCanvas emptyTrack">{error ? error : loading ? "Loading circuit position data…" : "No position data at this replay time."}</div>;
  }

  return <div className="trackCanvas">
    <svg className="trackSvg" viewBox="0 0 1000 600" role="img" aria-label="Virtual circuit map with driver positions">
      {trackPath && <>
        <path d={trackPath} className="circuitGlow" />
        <path d={trackPath} className="circuitLine" />
      </>}
      {trailPath && <path d={trailPath} className="selectedTrail" />}
      {currentPoints.map(({ driver, current }) => {
        const x = projection.x(current.x);
        const y = projection.y(current.y);
        const active = selectedDriver === driver.driver_number;
        return <g
          key={driver.driver_number}
          className={`trackCar ${active ? "selected" : ""}`}
          transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
          onClick={() => onSelect(driver.driver_number)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelect(driver.driver_number);
          }}
          aria-label={`Select ${driver.full_name}`}
        >
          <circle r={active ? 18 : 13} className="carHalo" style={{ stroke: `#${driver.team_colour}` }} />
          <circle r={active ? 13 : 10} className="carCore" />
          <text y="3.5" textAnchor="middle">{driver.driver_number}</text>
        </g>;
      })}
    </svg>
    <div className="trackLegend">
      <span>{currentPoints.length}/{drivers.length} cars plotted</span>
      <span>{loading ? "BUFFERING POSITION WINDOW" : "3.7 Hz POSITION DATA"}</span>
    </div>
    {error && <div className="trackError">{error}</div>}
  </div>;
}

export function Terminal(props: TerminalProps) {
  return <ReplayClockProvider sessionStart={props.session.date_start} sessionEnd={props.session.date_end}><TerminalContent {...props} /></ReplayClockProvider>;
}
