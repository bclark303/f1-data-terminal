"use client";

import { useMemo, useState } from "react";
import type {
  Driver,
  IntervalPoint,
  Lap,
  PositionPoint,
  RaceControlMessage,
  Session,
  Stint,
  Weather,
} from "@/lib/types";
import { useRouter } from "next/navigation";
import {
  indexRows,
  makeLapIndex,
  lapsAt,
  upperBound,
} from "@/lib/replay-index";
import { TelemetryPanel } from "./telemetry-panel";
import { VirtualTrack } from "./virtual-track";
import { formatLap, latestAt } from "@/lib/time";
import { GForceDisplay } from "./g-force";
import { Panel } from "./panel";
import { ReplayControls } from "./replay-controls";
import { ReplayClockProvider, useReplayClock } from "./replay-clock";
import {
  useDriverLocation,
  useDriverTelemetry,
  useTrackGeometry,
} from "./replay-data";

type TerminalProps = {
  warnings?: string[];
  session: Session;
  drivers: Driver[];
  weather: Weather[];
  raceControl: RaceControlMessage[];
  positions: PositionPoint[];
  intervals: IntervalPoint[];
  laps: Lap[];
  stints: Stint[];
};

function TerminalContent({
  warnings = [],
  session,
  drivers,
  weather,
  raceControl,
  positions,
  intervals,
  laps,
  stints,
}: TerminalProps) {
  const clock = useReplayClock();
  const router = useRouter();
  const [selectedDriver, setSelectedDriver] = useState(
    drivers[0]?.driver_number ?? 0,
  );
  const geometryDriver = drivers[0]?.driver_number ?? 0;

  const telemetry = useDriverTelemetry(session.session_key, selectedDriver);
  const selectedLocation = useDriverLocation(
    session.session_key,
    selectedDriver,
  );
  const trackGeometry = useTrackGeometry(session.session_key, geometryDriver);

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

    const groupedLaps = group(laps);
    return {
      lapIndexes: new Map(
        [...groupedLaps].map(([driver, rows]) => [driver, makeLapIndex(rows)]),
      ),
      positions: group(positions),
      intervals: group(intervals),
      laps: groupedLaps,
      stints: new Map(
        [...group(stints)].map(([driver, rows]) => [
          driver,
          rows.sort((a, b) => b.stint_number - a.stint_number),
        ]),
      ),
    };
  }, [positions, intervals, laps, stints]);

  const geometryLap = useMemo(() => {
    return (
      (byDriver.laps.get(geometryDriver) ?? [])
        .filter(
          (lap) => lap.date_start && lap.lap_duration && !lap.is_pit_out_lap,
        )
        .sort(
          (a, b) => (a.lap_duration ?? Infinity) - (b.lap_duration ?? Infinity),
        )[0] ?? null
    );
  }, [byDriver, geometryDriver]);

  const eventIndex = useMemo(
    () => indexRows(raceControl, (row) => row.date),
    [raceControl],
  );
  const state = useMemo(() => {
    const currentWeather = latestAt(weather, (row) => row.date, clock.raceTime);
    const eventEnd = upperBound(eventIndex.times, clock.raceTime);
    const visibleRaceControl = eventIndex.rows
      .slice(Math.max(0, eventEnd - 20), eventEnd)
      .reverse();
    const rows = drivers
      .map((driver) => {
        const driverPositions =
          byDriver.positions.get(driver.driver_number) ?? [];
        const driverIntervals =
          byDriver.intervals.get(driver.driver_number) ?? [];
        const lapIndex = byDriver.lapIndexes.get(driver.driver_number);
        const { currentLap, lastLap, bestLap } = lapIndex
          ? lapsAt(lapIndex, clock.raceTime)
          : { currentLap: undefined, lastLap: undefined, bestLap: undefined };
        const currentPosition = latestAt(
          driverPositions,
          (row) => row.date,
          clock.raceTime,
        );
        const currentInterval = latestAt(
          driverIntervals,
          (row) => row.date,
          clock.raceTime,
          15000,
        );
        const currentStint = (
          byDriver.stints.get(driver.driver_number) ?? []
        ).find((row) => row.lap_start <= (currentLap?.lap_number ?? 1));
        return {
          driver,
          currentPosition,
          currentInterval,
          currentLap,
          lastLap,
          bestLap,
          currentStint,
        };
      })
      .sort(
        (a, b) =>
          (a.currentPosition?.position ?? 99) -
          (b.currentPosition?.position ?? 99),
      );

    return { currentWeather, visibleRaceControl, rows };
  }, [weather, eventIndex, drivers, byDriver, clock.raceTime]);

  const selected =
    state.rows.find((row) => row.driver.driver_number === selectedDriver) ??
    state.rows[0];
  const currentLap = Math.max(
    1,
    ...state.rows.map((row) => row.currentLap?.lap_number ?? 1),
  );

  return (
    <main className="terminalShell">
      <header className="topBar">
        <div>
          <div className="brand">
            F1 DATA TERMINAL <span>REPLAY</span>
          </div>
          <div className="eventName">
            {session.year} {session.country_name.toUpperCase()} GRAND PRIX
          </div>
        </div>
        <button
          className="layoutResetButton"
          onClick={() =>
            window.dispatchEvent(new Event("f1-terminal-reset-layout"))
          }
        >
          RESET LAYOUT
        </button>
        <div className="sessionStats">
          <span>{session.circuit_short_name}</span>
          <strong>LAP {currentLap}</strong>
          <span>
            {new Date(clock.raceTime).toISOString().slice(11, 19)} UTC
          </span>
        </div>
      </header>

      {warnings.length > 0 && (
        <div className="dataError" role="alert">
          Unavailable: {warnings.join(", ")}. Other panels remain usable.{" "}
          <button onClick={() => router.refresh()}>Retry missing data</button>
        </div>
      )}
      <div className="terminalGrid">
        <Panel
          title="Timing / Classification"
          kicker="FIELD"
          id="timingPanel"
          className="timingPanel"
        >
          <div className="timingTable">
            <div className="timingHeader timingRow">
              <span>P</span>
              <span>DRIVER</span>
              <span>GAP</span>
              <span>INT</span>
              <span>LAST</span>
              <span>BEST</span>
              <span>TYRE</span>
              <span>AGE</span>
            </div>
            {state.rows.map((row) => {
              const active = row.driver.driver_number === selectedDriver;
              const lapAge =
                row.currentStint && row.currentLap
                  ? row.currentLap.lap_number -
                    row.currentStint.lap_start +
                    1 +
                    row.currentStint.tyre_age_at_start
                  : null;
              return (
                <button
                  key={row.driver.driver_number}
                  className={`timingRow driverRow ${active ? "selected" : ""}`}
                  onClick={() => setSelectedDriver(row.driver.driver_number)}
                >
                  <span className="position">
                    {row.currentPosition?.position ?? "—"}
                  </span>
                  <span className="driverCell">
                    <i style={{ background: `#${row.driver.team_colour}` }} />
                    {row.driver.name_acronym}
                  </span>
                  <span>
                    {row.currentInterval?.gap_to_leader ??
                      (row.currentPosition?.position === 1 ? "LEADER" : "—")}
                  </span>
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

        <Panel
          title="Driver / Car"
          kicker="FOCUS + TELEMETRY"
          id="driverPanel"
          className="driverPanel"
          actions={
            <select
              aria-label="Selected driver"
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(Number(e.target.value))}
            >
              {drivers.map((driver) => (
                <option key={driver.driver_number} value={driver.driver_number}>
                  {driver.driver_number} {driver.name_acronym}
                </option>
              ))}
            </select>
          }
        >
          {selected && (
            <>
              <div className="driverHero">
                <div
                  className="driverNumber"
                  style={{ borderColor: `#${selected.driver.team_colour}` }}
                >
                  {selected.driver.driver_number}
                </div>
                <div>
                  <h3>{selected.driver.full_name}</h3>
                  <p>{selected.driver.team_name}</p>
                </div>
                <div className="driverPosition">
                  P{selected.currentPosition?.position ?? "—"}
                </div>
              </div>
              <div className="metricGrid">
                <Metric
                  label="Gap"
                  value={String(
                    selected.currentInterval?.gap_to_leader ??
                      (selected.currentPosition?.position === 1
                        ? "LEADER"
                        : "—"),
                  )}
                />
                <Metric
                  label="Interval"
                  value={String(selected.currentInterval?.interval ?? "—")}
                />
                <Metric
                  label="Last Lap"
                  value={formatLap(selected.lastLap?.lap_duration)}
                />
                <Metric
                  label="Best Lap"
                  value={formatLap(selected.bestLap?.lap_duration)}
                />
                <Metric
                  label="Tyre"
                  value={selected.currentStint?.compound ?? "—"}
                />
                <Metric
                  label="Stint"
                  value={
                    selected.currentStint
                      ? `#${selected.currentStint.stint_number}`
                      : "—"
                  }
                />
              </div>
              {(telemetry.error || selectedLocation.error) && (
                <button
                  onClick={() => {
                    telemetry.retry();
                    selectedLocation.retry();
                  }}
                >
                  Retry driver data
                </button>
              )}
              <TelemetryPanel
                data={telemetry.data}
                raceTime={clock.raceTime}
                loading={telemetry.loading}
                error={telemetry.error}
                teamColour={selected.driver.team_colour}
              />
              <GForceDisplay
                telemetry={telemetry.data}
                locations={selectedLocation.data}
                raceTime={clock.raceTime}
                telemetryLoading={telemetry.loading}
                locationLoading={selectedLocation.loading}
                telemetryError={telemetry.error}
                locationError={selectedLocation.error}
                teamColour={selected.driver.team_colour}
              />
            </>
          )}
        </Panel>

        <Panel
          title="Virtual Track"
          kicker="VIRTUAL RACE POSITION"
          id="trackPanel"
          className="trackPanel"
        >
          <VirtualTrack
            selectedLocations={selectedLocation.data}
            drivers={drivers}
            lapsByDriver={byDriver.laps}
            geometry={trackGeometry.data}
            geometryLap={geometryLap}
            raceTime={clock.raceTime}
            selectedDriver={selectedDriver}
            onSelect={setSelectedDriver}
            loading={trackGeometry.loading}
            error={trackGeometry.error}
          />
          {trackGeometry.error && (
            <button onClick={trackGeometry.retry}>Retry geometry</button>
          )}
        </Panel>

        <Panel
          title="Race Control"
          kicker="EVENT FEED"
          id="controlPanel"
          className="controlPanel"
        >
          <div className="eventFeed">
            {state.visibleRaceControl.map((event, index) => (
              <button
                key={`${event.date}-${index}`}
                className="eventItem"
                onClick={() =>
                  clock.seek(
                    Date.parse(event.date) -
                      clock.sessionStart -
                      clock.syncOffsetMs -
                      5000,
                  )
                }
              >
                <span
                  className={`flag flag-${(event.flag ?? event.category).toLowerCase().replaceAll(" ", "-")}`}
                >
                  {event.flag ?? event.category}
                </span>
                <span className="eventTime">
                  {new Date(event.date).toISOString().slice(11, 19)}
                </span>
                <span className="eventMessage">{event.message}</span>
              </button>
            ))}
            {!state.visibleRaceControl.length && (
              <div className="emptyState">No race control messages yet.</div>
            )}
          </div>
        </Panel>

        <Panel
          title="Track / Venue"
          kicker="CONDITIONS"
          id="weatherPanel"
          className="weatherPanel"
        >
          <div className="venueTitle">
            <strong>{session.circuit_short_name}</strong>
            <span>
              {session.location}, {session.country_name}
            </span>
          </div>
          <div className="weatherGrid">
            <Metric
              label="Air"
              value={
                state.currentWeather?.air_temperature != null
                  ? `${state.currentWeather.air_temperature.toFixed(1)}°C`
                  : "—"
              }
            />
            <Metric
              label="Track"
              value={
                state.currentWeather?.track_temperature != null
                  ? `${state.currentWeather.track_temperature.toFixed(1)}°C`
                  : "—"
              }
            />
            <Metric
              label="Humidity"
              value={
                state.currentWeather?.humidity != null
                  ? `${state.currentWeather.humidity}%`
                  : "—"
              }
            />
            <Metric
              label="Pressure"
              value={
                state.currentWeather?.pressure != null
                  ? `${state.currentWeather.pressure.toFixed(0)} mb`
                  : "—"
              }
            />
            <Metric
              label="Wind"
              value={
                state.currentWeather?.wind_speed != null
                  ? `${state.currentWeather.wind_speed.toFixed(1)} m/s`
                  : "—"
              }
            />
            <Metric
              label="Rain"
              value={
                state.currentWeather?.rainfall != null
                  ? state.currentWeather.rainfall
                    ? "YES"
                    : "NO"
                  : "—"
              }
            />
          </div>
        </Panel>
      </div>

      <ReplayControls />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Terminal(props: TerminalProps) {
  return (
    <ReplayClockProvider
      key={props.session.session_key}
      sessionKey={props.session.session_key}
      sessionStart={props.session.date_start}
      sessionEnd={props.session.date_end}
    >
      <TerminalContent {...props} />
    </ReplayClockProvider>
  );
}
